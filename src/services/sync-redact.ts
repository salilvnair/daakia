/**
 * What history loses on its way into the sync repo.
 *
 * ── Why history needs this at all ──
 *
 * A history row is the request exactly as it was sent: the Authorization
 * header, the cookie, the `?api_key=` in the URL, the password in the auth
 * tab. Git Sync writes your history into *your* folder and Daakia never
 * imports another person's — but the repository is shared, and anyone who can
 * clone it can read every file in it. "Private" in the sync repo means private
 * from the app, not from `git clone`, so a credential must not be in the file
 * in the first place.
 *
 * The rule is the one environments already follow: the key survives, the value
 * becomes `REDACTED`. You can still see that a request carried an
 * Authorization header; you cannot see what it was.
 */

export const REDACTED = 'REDACTED';

/**
 * Names that carry a credential, as a header, a query parameter, or a field of
 * the auth tab. Deliberately broad: redacting a harmless `x-session-region`
 * costs nothing, and leaking `x-session-token` costs a rotation.
 */
const SENSITIVE_NAME = /authorization|cookie|token|secret|passw(or)?d|api[-_]?key|apikey|credential|signature|session|bearer|private[-_]?key|client[-_]?secret|x-amz-security/i;

export function isSensitiveName(name: unknown): boolean {
  return typeof name === 'string' && SENSITIVE_NAME.test(name);
}

type Json = unknown;

/** `[{ key, value }]` or `{ name: value }` — the two shapes headers and params come in. */
function redactPairs(list: Json): Json {
  if (Array.isArray(list)) {
    return list.map(item => {
      if (!item || typeof item !== 'object') return item;
      const row = item as Record<string, unknown>;
      const name = row.key ?? row.name;
      return isSensitiveName(name) && 'value' in row ? { ...row, value: REDACTED } : row;
    });
  }
  if (list && typeof list === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(list as Record<string, unknown>)) {
      out[k] = isSensitiveName(k) ? REDACTED : v;
    }
    return out;
  }
  return list;
}

/**
 * Every string in the auth tab except the ones that say *which kind* of auth.
 *
 * The auth tab is nothing but credentials, in a shape that differs per scheme
 * (bearer, basic, OAuth, AWS, digest…), so an allow-list of the few harmless
 * fields is safer than a deny-list that has to know every scheme.
 */
const AUTH_HARMLESS = /^(type|authType|grantType|grant_type|addTo|in|location|algorithm|scope|scopes|headerPrefix|prefix|region|service|tokenType|clientAuthentication|method|mode)$/i;

function redactAuth(value: Json, key = ''): Json {
  if (typeof value === 'string') return value === '' || AUTH_HARMLESS.test(key) ? value : REDACTED;
  if (Array.isArray(value)) return value.map(v => redactAuth(v, key));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactAuth(v, k);
    return out;
  }
  return value;
}

/** `?api_key=…&page=2` keeps `page`. A URL that will not parse is returned untouched. */
export function redactUrl(url: string): string {
  const q = url.indexOf('?');
  if (q < 0) return url;
  const [base, rest] = [url.slice(0, q), url.slice(q + 1)];
  const hash = rest.indexOf('#');
  const query = hash < 0 ? rest : rest.slice(0, hash);
  const tail = hash < 0 ? '' : rest.slice(hash);
  const parts = query.split('&').map(part => {
    const eq = part.indexOf('=');
    if (eq < 0) return part;
    let name = part.slice(0, eq);
    try { name = decodeURIComponent(name); } catch { /* keep it raw */ }
    return isSensitiveName(name) ? `${part.slice(0, eq)}=${REDACTED}` : part;
  });
  return `${base}?${parts.join('&')}${tail}`;
}

function redactRequestData(raw: string): string {
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return raw;
  }
  if (!doc || typeof doc !== 'object') return raw;

  const out: Record<string, unknown> = { ...doc };
  if ('headers' in out) out.headers = redactPairs(out.headers);
  if ('params' in out) out.params = redactPairs(out.params);
  if ('metadata' in out) out.metadata = redactPairs(out.metadata);
  if ('bodyUrlEncoded' in out) out.bodyUrlEncoded = redactPairs(out.bodyUrlEncoded);
  if ('bodyFormData' in out) out.bodyFormData = redactPairs(out.bodyFormData);
  if ('authData' in out) out.authData = redactAuth(out.authData);
  if ('auth' in out) out.auth = redactAuth(out.auth);
  /* The resolved variables a request ran with. Only the secret ones go: the
     rest are what makes a history row worth reading. */
  if (Array.isArray(out.variables)) {
    out.variables = (out.variables as Record<string, unknown>[]).map(v =>
      v && typeof v === 'object' && (v.isSecret || isSensitiveName(v.key))
        ? { ...v, value: REDACTED, initialValue: REDACTED, currentValue: REDACTED }
        : v);
  }
  return JSON.stringify(out);
}

function redactResponseData(raw: string): string {
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return raw;
  }
  if (!doc || typeof doc !== 'object' || !('headers' in doc)) return raw;
  /* Set-Cookie is the one response header that is routinely a credential. */
  return JSON.stringify({ ...doc, headers: redactPairs(doc.headers) });
}

export interface RedactableHistoryRow {
  url: string;
  request_data?: string | null;
  response_data?: string | null;
}

/** A copy of the row that is safe to put in a shared repository. */
export function redactHistoryRow<T extends RedactableHistoryRow>(row: T): T {
  return {
    ...row,
    url: typeof row.url === 'string' ? redactUrl(row.url) : row.url,
    request_data: row.request_data ? redactRequestData(row.request_data) : row.request_data,
    response_data: row.response_data ? redactResponseData(row.response_data) : row.response_data,
  };
}
