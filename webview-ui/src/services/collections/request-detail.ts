/**
 * Full-fidelity text serialization of a collection subtree for AI features that have to
 * describe the requests themselves (Documentation Generator).
 *
 * The doc generator used to send nothing but the collection *name*, so the model invented
 * endpoints, headers and payloads out of thin air. Headers, query params, body and auth
 * scheme all have to travel with the prompt for the generated docs to match reality.
 *
 * Literal credential values are replaced with `<redacted>` before leaving the extension —
 * `{{variable}}` references pass through untouched, since those carry no secret and are
 * exactly what the docs should show.
 */
import type { CollectionTreeNode, CollectionRequest } from './tree-helpers';

interface KeyValue { key?: string; value?: string; enabled?: boolean }

/** Header names whose value is a credential rather than something to document verbatim. */
const SECRET_HEADERS = new Set([
  'authorization', 'proxy-authorization', 'cookie', 'set-cookie',
  'x-api-key', 'api-key', 'apikey', 'x-auth-token', 'x-access-token', 'x-csrf-token',
]);

/** Auth fields that hold the actual secret (as opposed to a username or a header name). */
const SECRET_AUTH_FIELDS = new Set(['token', 'password', 'apikeyvalue', 'clientsecret', 'secret', 'privatekey', 'passphrase']);

/** Keep `{{env_var}}` placeholders — they're the documentation — and mask literal secrets. */
function maskSecret(value: string): string {
  return value.includes('{{') ? value : '<redacted>';
}

function safeHeaderValue(key: string, value: string): string {
  return SECRET_HEADERS.has(key.trim().toLowerCase()) ? maskSecret(value) : value;
}

function enabledPairs(raw: unknown): KeyValue[] {
  return Array.isArray(raw) ? (raw as KeyValue[]).filter(kv => kv?.enabled !== false && kv?.key) : [];
}

/** Bodies can be long; docs only need the shape, so a generous prefix is enough. */
const MAX_BODY_CHARS = 1500;
/** Bound the prompt for very large collections. */
const MAX_REQUESTS = 60;

function describeRequest(req: CollectionRequest, indent: string, lines: string[]) {
  let d: Record<string, unknown> = {};
  try { d = JSON.parse(req.data || '{}') as Record<string, unknown>; } catch { /* no saved detail */ }

  lines.push(`${indent}- [${req.method || 'GET'}] ${req.name || '(unnamed)'} — ${req.url || ''}`);

  const headers = enabledPairs(d.headers);
  if (headers.length) {
    lines.push(`${indent}  Headers:`);
    for (const h of headers) lines.push(`${indent}    ${h.key}: ${safeHeaderValue(h.key || '', h.value || '')}`);
  }

  const params = enabledPairs(d.params);
  if (params.length) {
    lines.push(`${indent}  Query params:`);
    for (const p of params) lines.push(`${indent}    ${p.key}=${p.value || ''}`);
  }

  const authType = (d.authType as string) || 'none';
  if (authType && authType !== 'none') {
    const authData = (d.authData as Record<string, string>) || {};
    const fields = Object.entries(authData)
      .filter(([, v]) => typeof v === 'string' && v !== '')
      .map(([k, v]) => `${k}=${SECRET_AUTH_FIELDS.has(k.toLowerCase()) ? maskSecret(v) : v}`);
    lines.push(`${indent}  Auth: ${authType}${fields.length ? ` (${fields.join(', ')})` : ''}`);
  }

  // History rows store the raw body under `body`; collection requests use `bodyRaw`.
  const bodyRaw = (d.bodyRaw as string) || (d.body as string) || '';
  const bodyMode = (d.bodyMode as string) || 'none';
  if (bodyRaw.trim() && bodyMode !== 'none') {
    const truncated = bodyRaw.length > MAX_BODY_CHARS;
    lines.push(`${indent}  Body (${bodyMode}):`);
    lines.push(`${indent}    ${bodyRaw.slice(0, MAX_BODY_CHARS).replace(/\n/g, `\n${indent}    `)}${truncated ? ' …(truncated)' : ''}`);
  }

  const form = enabledPairs(d.bodyFormData).concat(enabledPairs(d.bodyUrlEncoded));
  if (form.length) {
    lines.push(`${indent}  Body fields (${bodyMode}):`);
    for (const f of form) lines.push(`${indent}    ${f.key}=${f.value || ''}`);
  }
}

/**
 * Serialize a collection (or a single-request wrapper node) into the request-level detail an
 * AI needs to write accurate documentation: method, URL, headers, query params, auth scheme
 * and request body, folder structure preserved.
 */
export function describeCollectionRequests(node: CollectionTreeNode): string {
  const lines: string[] = [];
  let remaining = MAX_REQUESTS;
  let skipped = 0;

  const walk = (n: CollectionTreeNode, depth: number) => {
    const indent = '  '.repeat(depth);
    for (const req of n.requests) {
      if (remaining <= 0) { skipped++; continue; }
      remaining--;
      describeRequest(req, indent, lines);
    }
    for (const child of n.children) {
      lines.push(`${indent}Folder: ${child.name}`);
      walk(child, depth + 1);
    }
  };
  walk(node, 0);

  if (!lines.length) return '(this collection has no saved requests)';
  if (skipped) lines.push(`… and ${skipped} more request${skipped > 1 ? 's' : ''} omitted to keep the prompt bounded.`);
  return lines.join('\n');
}
