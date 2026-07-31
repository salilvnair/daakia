/**
 * secret-store — wraps VS Code SecretStorage for API key persistence.
 *
 * VS Code SecretStorage uses the OS keychain on every platform:
 *   macOS  → Keychain Access
 *   Windows → Windows Credential Manager
 *   Linux   → libsecret / GNOME Keyring / KWallet
 *
 * Keys are namespaced as "daakia.llm.<providerId>.<uuid>" so multiple installs
 * of Daakia never collide with each other or with other extensions.
 */
import * as vscode from 'vscode';

const KEY_PREFIX = 'daakia.llm';
const VAULT_KEY = 'daakia.vault.passphrase';

let _secrets: vscode.SecretStorage | undefined;

export function initSecretStore(secrets: vscode.SecretStorage): void {
  _secrets = secrets;
}

function keyFor(providerId: string): string {
  return `${KEY_PREFIX}.${providerId}`;
}

export async function storeApiKey(providerId: string, token: string): Promise<void> {
  if (!_secrets) throw new Error('SecretStore not initialized — call initSecretStore first');
  await _secrets.store(keyFor(providerId), token);
}

export async function retrieveApiKey(providerId: string): Promise<string | undefined> {
  if (!_secrets) return undefined;
  return _secrets.get(keyFor(providerId));
}

export async function deleteApiKey(providerId: string): Promise<void> {
  if (!_secrets) return;
  await _secrets.delete(keyFor(providerId));
}

/** Returns a map of providerId → hasKey (never exposes actual tokens to callers). */
export async function getAllKeyStatus(providerIds: string[]): Promise<Record<string, boolean>> {
  if (!_secrets) return {};
  const results: Record<string, boolean> = {};
  await Promise.all(
    providerIds.map(async (id) => {
      const val = await _secrets!.get(keyFor(id));
      results[id] = !!val && val.length > 0;
    }),
  );
  return results;
}

// ─── Vault passphrase (Environments secret encryption) ─────────────────────────
//
// The passphrase itself — never the derived encryption key — lives in the OS
// keychain so the vault auto-unlocks on extension activation without asking
// the user every session, same UX as any OS-integrated password manager.

export async function storeVaultPassphrase(passphrase: string): Promise<void> {
  if (!_secrets) throw new Error('SecretStore not initialized — call initSecretStore first');
  await _secrets.store(VAULT_KEY, passphrase);
}

export async function retrieveVaultPassphrase(): Promise<string | undefined> {
  if (!_secrets) return undefined;
  return _secrets.get(VAULT_KEY);
}

export async function deleteVaultPassphrase(): Promise<void> {
  if (!_secrets) return;
  await _secrets.delete(VAULT_KEY);
}
