/**
 * A finding, as a daakia request.
 *
 * Kept apart from the detectors so that adding a framework never touches the
 * shape of what gets written, and apart from the writer so it can be tested
 * without a webview. Pure: the webview reads it through an alias rather than
 * keeping a second copy of these rules.
 *
 * ── What `scan` is doing in the request ──
 *
 * It is what makes a second scan able to update rather than duplicate.
 * `identity` is method plus path, so renaming a request does not orphan it;
 * `written` is a hash of the fields this scan filled in, so a later scan can
 * tell "the code changed" from "you changed it". Without it the only safe
 * re-scan is a new collection every time.
 */

import type { BaseUrl, Finding, Provenance } from './api-detector';

export interface ScanStamp {
  detector: string;
  source: string;
  identity: string;
  written: string;
  at: string;
  /** How each field came to be known — shown in the review and kept afterwards. */
  provenance: Record<string, Provenance>;
}

export interface GeneratedRequest {
  name: string;
  method: string;
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  params: { key: string; value: string; enabled: boolean }[];
  bodyMode: 'raw' | 'none';
  bodyRaw: string;
  authType: string;
  /** The folder it belongs in — the source file it came from. */
  folder: string;
  /** Written into the request's `data`, and read by the next scan. */
  scan: ScanStamp;
}

/** The collection variable every generated URL is written against. */
export const BASE_URL_VAR = 'baseUrl';

/**
 * A short, stable hash.
 *
 * FNV-1a: not a security function and not pretending to be one. It has to be
 * stable across runs and cheap for a few hundred requests, and it is.
 */
export function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Identity is method and path — not the name, which you are expected to change. */
export function identityOf(f: Pick<Finding, 'method' | 'path' | 'discriminator'>): string {
  return `${f.method} ${f.path}${f.discriminator ? ` [${f.discriminator}]` : ''}`;
}

/** The folder a finding goes in: the file it came from, without its extension. */
export function folderOf(f: Finding): string {
  const base = f.source.file.split('/').pop() ?? f.source.file;
  return base.replace(/\.(java|kt|kts|ts|tsx|js|jsx|mjs|cjs|py)$/, '');
}

/**
 * Keys whose value must never be copied out of a repository.
 *
 * A fixture full of real-looking credentials is normal in a test suite, and a
 * scan that lifts one into a collection has taken a secret out of a file
 * somebody was careful about and put it somewhere they were not expecting.
 */
const SECRET_KEY = /(pass(word|wd)?|secret|token|apikey|api[-_]?key|authorization|credential|private[-_]?key)/i;

export function maskSecrets(key: string, value: string): string {
  return SECRET_KEY.test(key) ? `{{${camel(key)}}}` : value;
}

function camel(s: string): string {
  const parts = s.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return parts.map((p, i) => i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
}

/** The auth type daakia stores, from what the source said the endpoint wants. */
export function authTypeOf(f: Finding): string {
  switch (f.auth?.scheme) {
    case 'bearer': return 'bearer';
    case 'basic': return 'basic';
    case 'apiKey': return 'apikey';
    case 'oauth2': return 'oauth2';
    /* Inherit, not none: the collection carries the scheme when it is uniform,
       and a request that says "none" would opt out of it. */
    default: return 'inherit';
  }
}

/**
 * The request name.
 *
 * The discriminator is only ever set on findings that actually share a path, so
 * a suffix here means there is something to tell apart.
 */
export function nameOf(f: Finding): string {
  return f.discriminator ? `${f.name} — ${f.discriminator}` : f.name;
}

export function toRequest(f: Finding, now = new Date()): GeneratedRequest {
  /*
    Path parameters stay as `{name}` in the URL and appear as variables.

    Substituting a value would produce a URL that looks ready and is not — and
    the one thing somebody always edits is the id they are testing with.
  */
  const url = `{{${BASE_URL_VAR}}}${f.path}`;

  const headers = f.headers.map(h => ({
    key: h.name,
    value: maskSecrets(h.name, h.value),
    enabled: true,
  }));

  const params = f.queryParams.map(p => ({
    key: p.name,
    value: maskSecrets(p.name, p.value),
    /* An optional parameter is listed but unticked: it documents the endpoint
       without sending an empty value that changes what the endpoint does. */
    enabled: p.required,
  }));

  const bodyRaw = f.body?.raw ?? '';
  const written = fingerprint([
    f.method, f.path, bodyRaw,
    headers.map(h => `${h.key}=${h.value}`).join('&'),
    params.map(p => `${p.key}=${p.value}`).join('&'),
  ].join('|'));

  return {
    name: nameOf(f),
    method: f.method,
    url,
    headers,
    params,
    bodyMode: bodyRaw ? 'raw' : 'none',
    bodyRaw,
    authType: authTypeOf(f),
    folder: folderOf(f),
    scan: {
      detector: f.detector,
      source: `${f.source.file}:${f.source.line}`,
      identity: identityOf(f),
      written,
      at: now.toISOString(),
      provenance: f.provenance,
    },
  };
}

/** The variables a generated collection needs to be runnable. */
export function collectionVariables(baseUrl?: BaseUrl): { key: string; value: string }[] {
  return [{ key: BASE_URL_VAR, value: baseUrl?.url ?? 'http://localhost:8080' }];
}
