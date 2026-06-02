/**
 * WS-Security — generates Username Token, Timestamp, and Nonce elements
 * for injection into SOAP Header blocks.
 *
 * Supports:
 * - UsernameToken with PasswordText or PasswordDigest
 * - Nonce (Base64 random)
 * - Created timestamp
 * - Timestamp element (Created + Expires with configurable TTL)
 */
import * as crypto from 'crypto';

// ────────── Types ──────────

export interface WsSecurityOptions {
  enabled: boolean;
  username?: string;
  password?: string;
  passwordType: 'PasswordText' | 'PasswordDigest';
  addNonce: boolean;
  addCreated: boolean;
  addTimestamp: boolean;
  timestampTtl: number; // seconds (default 300)
}

// ────────── Constants ──────────

const WSSE_NS = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const WSU_NS = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
const PASSWORD_TEXT_TYPE = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText';
const PASSWORD_DIGEST_TYPE = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest';
const NONCE_ENCODING_TYPE = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary';

// ────────── Public API ──────────

/**
 * Generate the full WS-Security <wsse:Security> XML header block.
 * Returns empty string if not enabled.
 */
export function generateWsSecurityHeader(options: WsSecurityOptions): string {
  if (!options.enabled) return '';

  const parts: string[] = [];

  // Username Token
  if (options.username) {
    parts.push(generateUsernameToken(options));
  }

  // Timestamp
  if (options.addTimestamp) {
    parts.push(generateTimestamp(options.timestampTtl || 300));
  }

  if (parts.length === 0) return '';

  return `<wsse:Security xmlns:wsse="${WSSE_NS}" xmlns:wsu="${WSU_NS}">
      ${parts.join('\n      ')}
    </wsse:Security>`;
}

// ────────── Username Token ──────────

function generateUsernameToken(options: WsSecurityOptions): string {
  const { username, password, passwordType, addNonce, addCreated } = options;

  const now = new Date();
  const created = now.toISOString();
  const nonce = crypto.randomBytes(16);
  const nonceBase64 = nonce.toString('base64');

  let passwordValue: string;
  let passwordTypeUri: string;

  if (passwordType === 'PasswordDigest') {
    // PasswordDigest = Base64(SHA-1(Nonce + Created + Password))
    passwordValue = computePasswordDigest(nonce, created, password || '');
    passwordTypeUri = PASSWORD_DIGEST_TYPE;
  } else {
    passwordValue = password || '';
    passwordTypeUri = PASSWORD_TEXT_TYPE;
  }

  const lines: string[] = [];
  lines.push('<wsse:UsernameToken>');
  lines.push(`        <wsse:Username>${escapeXml(username || '')}</wsse:Username>`);
  lines.push(`        <wsse:Password Type="${passwordTypeUri}">${escapeXml(passwordValue)}</wsse:Password>`);

  if (addNonce) {
    lines.push(`        <wsse:Nonce EncodingType="${NONCE_ENCODING_TYPE}">${nonceBase64}</wsse:Nonce>`);
  }

  if (addCreated) {
    lines.push(`        <wsu:Created>${created}</wsu:Created>`);
  }

  lines.push('      </wsse:UsernameToken>');
  return lines.join('\n');
}

// ────────── Timestamp ──────────

/**
 * Generate a WS-Security Timestamp element.
 */
export function generateTimestamp(ttlSeconds: number): string {
  const now = new Date();
  const expires = new Date(now.getTime() + ttlSeconds * 1000);

  return `<wsu:Timestamp>
        <wsu:Created>${now.toISOString()}</wsu:Created>
        <wsu:Expires>${expires.toISOString()}</wsu:Expires>
      </wsu:Timestamp>`;
}

// ────────── Helpers ──────────

/**
 * Compute PasswordDigest = Base64(SHA-1(Nonce + Created + Password))
 */
function computePasswordDigest(nonce: Buffer, created: string, password: string): string {
  const hash = crypto.createHash('sha1');
  hash.update(nonce);
  hash.update(created);
  hash.update(password);
  return hash.digest('base64');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
