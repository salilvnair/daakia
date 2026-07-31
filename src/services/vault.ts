/**
 * Vault — passphrase-based encryption for Environment secret values.
 *
 * Only variables flagged `isSecret: true` are ever encrypted; everything else in
 * the DB stays exactly as it is today. Design:
 *
 *   passphrase (user-remembered) ──scrypt+salt──> derived AES-256 key (in-memory only)
 *   passphrase ──stored in OS keychain (SecretStorage)── auto-unlocks on next launch
 *   verifier = HMAC(derived key, constant) ──stored in app_settings── lets us check
 *     "is this the right passphrase" without ever storing the passphrase (or the
 *     derived key) in the SQLite DB itself.
 *
 * The derived key never touches disk — it lives only in a module-level variable
 * for the lifetime of the extension host process. Losing the passphrase (and the
 * OS-keychain copy) means encrypted values are permanently unrecoverable — same
 * tradeoff every password-manager-style vault makes.
 */
import * as crypto from 'crypto';
import { getSetting, setSetting, deleteSetting, getAllEnvironments, upsertEnvironment } from '../storage/db';
import { storeVaultPassphrase, retrieveVaultPassphrase, deleteVaultPassphrase } from './secret-store';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 } as const;
const ENC_PREFIX = 'enc:v1:';
const CHECK_STRING = 'daakia-vault-check';

const SETTING_SALT = 'vaultSalt';
const SETTING_VERIFIER = 'vaultVerifier';

let _cachedKey: Buffer | null = null;

// ─── Key derivation ─────────────────────────────────────────────────────────

function getOrCreateSalt(): string {
  let salt = getSetting<string>(SETTING_SALT);
  if (!salt) {
    salt = crypto.randomBytes(16).toString('base64');
    setSetting(SETTING_SALT, salt);
  }
  return salt;
}

function deriveKey(passphrase: string, saltB64: string): Buffer {
  return crypto.scryptSync(passphrase, Buffer.from(saltB64, 'base64'), KEY_LEN, SCRYPT_OPTS);
}

function verifierFor(key: Buffer): string {
  return crypto.createHmac('sha256', key).update(CHECK_STRING).digest('base64');
}

// ─── Value encryption ───────────────────────────────────────────────────────

function encryptValue(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

function decryptValue(encoded: string, key: Buffer): string {
  const [ivB64, tagB64, ctB64] = encoded.slice(ENC_PREFIX.length).split(':');
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}

export function isEncryptedValue(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/** Encrypts if the vault is unlocked; otherwise returns the value unchanged (plaintext) — the
 * caller is responsible for surfacing "vault locked" to the user via getVaultStatus(). */
export function encryptIfUnlocked(value: string): string {
  if (!value || isEncryptedValue(value)) return value;
  if (!_cachedKey) return value;
  return encryptValue(value, _cachedKey);
}

/** Decrypts an `enc:v1:...` value. Returns a masked placeholder (never throws) if the vault is
 * locked or the value can't be decrypted with the current key. */
export function decryptIfNeeded(value: string): string {
  if (!isEncryptedValue(value)) return value;
  if (!_cachedKey) return '••••••••';
  try {
    return decryptValue(value, _cachedKey);
  } catch {
    return '••••••••';
  }
}

/** Decrypts `initialValue`/`currentValue` on every variable in the array. Safe to call
 * unconditionally on ANY parsed environment-variable array (not just where `isSecret` is true) —
 * `decryptIfNeeded` is a no-op on plaintext or empty values. Use this at every point in the
 * codebase that reads raw `environments.variables` JSON, whether that's for displaying values in
 * the UI or for resolving `{{var}}` into a real outgoing request — GraphQL, gRPC, SOAP,
 * WebSocket/SSE/MQTT/Socket.IO, MCP, and AI protocol handlers all resolve variables server-side
 * (unlike REST, which resolves client-side after the webview's own state is already decrypted via
 * environment-handler.ts), so skipping this here would send the literal ciphertext string as the
 * secret value in a real request the moment a vault is configured. */
export function decryptEnvVariables<T extends { initialValue?: string; currentValue?: string }>(variables: T[]): T[] {
  return variables.map(v => ({
    ...v,
    initialValue: v.initialValue ? decryptIfNeeded(v.initialValue) : v.initialValue,
    currentValue: v.currentValue ? decryptIfNeeded(v.currentValue) : v.currentValue,
  }));
}

/** Encrypts `initialValue`/`currentValue` on every `isSecret` variable in the array — the write
 * counterpart to `decryptEnvVariables`. Call this immediately before `JSON.stringify` +
 * `upsertEnvironment` anywhere a variable's value might have just been set to plaintext (e.g. a
 * script calling `dk.environment.set(...)`). Safe on a mix of already-encrypted (untouched) and
 * newly-plaintext (just-written) values — `encryptIfUnlocked` no-ops on values already
 * `enc:v1:`-prefixed, so it never double-encrypts. */
export function encryptEnvVariables<T extends { isSecret?: boolean; initialValue?: string; currentValue?: string }>(variables: T[]): T[] {
  return variables.map(v => v.isSecret ? {
    ...v,
    initialValue: v.initialValue ? encryptIfUnlocked(v.initialValue) : v.initialValue,
    currentValue: v.currentValue ? encryptIfUnlocked(v.currentValue) : v.currentValue,
  } : v);
}

// ─── Vault lifecycle ────────────────────────────────────────────────────────

export interface VaultStatus {
  configured: boolean;
  unlocked: boolean;
}

export function getVaultStatus(): VaultStatus {
  return { configured: !!getSetting<string>(SETTING_VERIFIER), unlocked: _cachedKey !== null };
}

/** Re-encrypts every plaintext `isSecret` environment variable value with the given key. Called
 * once right after a passphrase is (re)configured, so existing secrets don't stay plaintext. */
function migrateExistingSecrets(key: Buffer): number {
  let migrated = 0;
  for (const row of getAllEnvironments()) {
    let variables: Array<Record<string, unknown>>;
    try { variables = JSON.parse(row.variables || '[]'); } catch { continue; }
    let changed = false;
    for (const v of variables) {
      if (!v.isSecret) continue;
      for (const field of ['initialValue', 'currentValue'] as const) {
        const val = v[field];
        if (typeof val === 'string' && val && !isEncryptedValue(val)) {
          v[field] = encryptValue(val, key);
          changed = true;
        }
      }
    }
    if (changed) {
      upsertEnvironment({ id: row.id, name: row.name, variables: JSON.stringify(variables), is_active: row.is_active });
      migrated++;
    }
  }
  return migrated;
}

/** First-time setup or changing the passphrase. Re-encrypts existing plaintext secrets under the
 * new key, stores a verifier (not the passphrase) in the DB, and stores the passphrase itself in
 * the OS keychain so the vault can auto-unlock on the next activation. */
export async function setVaultPassphrase(passphrase: string): Promise<{ ok: boolean; message: string; migratedCount: number }> {
  if (!passphrase || passphrase.length < 8) {
    return { ok: false, message: 'Passphrase must be at least 8 characters.', migratedCount: 0 };
  }
  const key = deriveKey(passphrase, getOrCreateSalt());
  setSetting(SETTING_VERIFIER, verifierFor(key));
  await storeVaultPassphrase(passphrase);
  _cachedKey = key;
  const migratedCount = migrateExistingSecrets(key);
  return { ok: true, message: 'Vault configured — secret environment values are now encrypted at rest.', migratedCount };
}

/** Unlocks the vault with an existing passphrase (e.g. after a fresh clone / cleared keychain). */
export async function unlockVault(passphrase: string): Promise<{ ok: boolean; message: string }> {
  const verifier = getSetting<string>(SETTING_VERIFIER);
  if (!verifier) return { ok: false, message: 'Vault has not been configured yet.' };
  const key = deriveKey(passphrase, getOrCreateSalt());
  if (verifierFor(key) !== verifier) return { ok: false, message: 'Incorrect passphrase.' };
  _cachedKey = key;
  await storeVaultPassphrase(passphrase);
  return { ok: true, message: 'Vault unlocked.' };
}

/** Called once at extension activation — silently unlocks using the OS-keychain-stored
 * passphrase, if any, so the user isn't prompted every session. */
export async function tryAutoUnlockFromKeychain(): Promise<boolean> {
  const passphrase = await retrieveVaultPassphrase();
  if (!passphrase) return false;
  const result = await unlockVault(passphrase);
  return result.ok;
}

/** Locks the vault for the rest of this session — encrypted values become unreadable
 * (`decryptIfNeeded` masks them) until unlocked again. Does not touch stored data. */
export function lockVault(): void {
  _cachedKey = null;
}

/** Permanently forgets the passphrase (DB verifier + OS keychain copy). Existing encrypted
 * values become unrecoverable — callers must confirm with the user before calling this. */
export async function clearVault(): Promise<void> {
  _cachedKey = null;
  deleteSetting(SETTING_VERIFIER);
  await deleteVaultPassphrase();
}
