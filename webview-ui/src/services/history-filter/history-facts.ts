/**
 * What one history row actually contains, read on demand.
 *
 * ── Why this is lazy ──
 *
 * The cap is two thousand rows and a stored response body may be 50 KB, so the
 * whole table is on the order of a hundred megabytes of JSON. Parsing all of it
 * on every keystroke would be a filter you can watch type.
 *
 * So nothing is parsed until something asks. `method`, `url`, `status` and the
 * timestamp are columns and cost nothing; headers, bodies, auth and scripts are
 * getters that parse once and keep the answer. The matcher runs the cheap
 * conditions first, which means a row that already failed `method:POST` never
 * has its response body opened at all — and a filter that only mentions method
 * never parses anything.
 *
 * ── Why the shapes are defensive ──
 *
 * `request_data` is written by whichever protocol handler ran, and they do not
 * all agree: headers are a `{key, value, enabled}[]` from REST, a plain record
 * from some of the realtime ones, and absent from others. A filter is the wrong
 * place to discover that. Everything is normalised to pairs here, and anything
 * unreadable becomes empty rather than throwing — one malformed row should cost
 * you that row, not the filter.
 */

/** The row as the sidebar already holds it. */
export interface HistoryRowLike {
  id: number;
  request_id?: string;
  method: string;
  url: string;
  status?: number;
  status_text?: string;
  response_time?: number;
  response_size?: number;
  request_data?: string;
  response_data?: string;
  protocol?: string;
  created_at?: string;
}

export interface HeaderPair { key: string; value: string }

/**
 * Auth material found on a row.
 *
 * `values` holds what was actually filled in, never displayed anywhere — it
 * exists so `auth:*:contains:xyz` and the secret sweep can look, and so
 * "carried a secret" can tell a configured Bearer from an empty one.
 */
export interface AuthFacts {
  type: string;
  fields: HeaderPair[];
  hasValue: boolean;
}

const EMPTY_PAIRS: HeaderPair[] = [];

/** Normalise the several shapes a header collection arrives in. */
export function toPairs(input: unknown): HeaderPair[] {
  if (Array.isArray(input)) {
    const out: HeaderPair[] = [];
    for (const row of input) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      /* `enabled: false` is a row somebody unticked — it was not sent, so it is
         not a header this request had. A filter that matched it would report a
         request that never carried the thing it says it carried. */
      if (r.enabled === false) continue;
      const key = typeof r.key === 'string' ? r.key : typeof r.name === 'string' ? r.name : '';
      if (!key.trim()) continue;
      out.push({ key: key.trim().toLowerCase(), value: String(r.value ?? '') });
    }
    return out;
  }
  if (input && typeof input === 'object') {
    return Object.entries(input as Record<string, unknown>)
      .filter(([k]) => k.trim())
      .map(([k, v]) => ({ key: k.trim().toLowerCase(), value: String(v ?? '') }));
  }
  return EMPTY_PAIRS;
}

function parseJson(text: string | undefined): unknown {
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Body text, whatever the protocol called it.
 *
 * A form or url-encoded body is flattened to `key=value` lines rather than left
 * out: somebody searching for `currency` means the request that sent currency,
 * and which body editor it was typed into is not something they were thinking
 * about.
 */
function bodyTextOf(data: Record<string, unknown>): string {
  const raw = data.body ?? data.bodyRaw;
  if (typeof raw === 'string' && raw.trim()) return raw;
  const parts: string[] = [];
  for (const key of ['bodyFormData', 'bodyUrlEncoded'] as const) {
    for (const pair of toPairs(data[key])) parts.push(`${pair.key}=${pair.value}`);
  }
  return parts.join('\n');
}

export class HistoryFacts {
  readonly id: number;
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly responseTime: number;
  readonly responseSize: number;
  readonly protocol: string;
  /** ms, or NaN when the row has no usable timestamp. */
  readonly at: number;

  private readonly row: HistoryRowLike;

  constructor(row: HistoryRowLike) {
    this.row = row;
    this.id = row.id;
    this.method = (row.method || '').toUpperCase();
    this.url = row.url || '';
    this.status = Number(row.status ?? 0) || 0;
    this.responseTime = Number(row.response_time ?? 0) || 0;
    this.responseSize = Number(row.response_size ?? 0) || 0;
    this.protocol = (row.protocol || 'rest').toLowerCase();
    this.at = row.created_at ? Date.parse(row.created_at) : NaN;
  }

  // ── Lazily parsed sections ────────────────────────────────────────────────

  private _request?: Record<string, unknown>;
  private get request(): Record<string, unknown> {
    return (this._request ??= asRecord(parseJson(this.row.request_data)));
  }

  private _response?: Record<string, unknown>;
  private get response(): Record<string, unknown> {
    return (this._response ??= asRecord(parseJson(this.row.response_data)));
  }

  private _headers?: HeaderPair[];
  get headers(): HeaderPair[] {
    return (this._headers ??= toPairs(this.request.headers));
  }

  private _responseHeaders?: HeaderPair[];
  get responseHeaders(): HeaderPair[] {
    return (this._responseHeaders ??= toPairs(this.response.headers));
  }

  private _body?: string;
  get body(): string {
    return (this._body ??= bodyTextOf(this.request));
  }

  private _responseBody?: string;
  get responseBody(): string {
    if (this._responseBody === undefined) {
      const b = this.response.body;
      this._responseBody = typeof b === 'string' ? b : b === undefined ? '' : JSON.stringify(b);
    }
    return this._responseBody;
  }

  /*
    `undefined` is "not JSON"; `null` is a body that really was `null`. Both are
    cached, so an unparseable 50 KB body is only ever parsed once.
  */
  private _bodyJson?: { value: unknown };
  get bodyJson(): unknown {
    return (this._bodyJson ??= { value: parseJson(this.body) }).value;
  }

  private _responseJson?: { value: unknown };
  get responseJson(): unknown {
    return (this._responseJson ??= { value: parseJson(this.responseBody) }).value;
  }

  private _auth?: AuthFacts;
  get auth(): AuthFacts {
    if (!this._auth) {
      const type = String(this.request.authType ?? 'none').toLowerCase() || 'none';
      const fields = toPairs(this.request.authData);
      this._auth = {
        type: type === '' ? 'none' : type,
        fields,
        hasValue: fields.some(f => f.value.trim() !== ''),
      };
    }
    return this._auth;
  }

  get preScript(): string {
    const s = this.request.preRequestScript;
    return typeof s === 'string' ? s : '';
  }

  get postScript(): string {
    const s = this.request.postResponseScript;
    return typeof s === 'string' ? s : '';
  }

  /** Variables carried on the request, which are the other place a secret hides. */
  private _variables?: HeaderPair[];
  get variables(): HeaderPair[] {
    return (this._variables ??= toPairs(this.request.variables));
  }

  get hasResponse(): boolean {
    return !!this.row.response_data;
  }

  /**
   * Did this request carry a secret?
   *
   * Auth with something filled in, or a header that names one. Not "authType is
   * set" — a Bearer row with an empty token is exactly the request somebody
   * opens this filter to find, and calling it a secret would hide it.
   */
  get hasSecret(): boolean {
    if (this.auth.hasValue) return true;
    return this.headers.some(h => SECRET_HEADERS.has(h.key) && h.value.trim() !== '');
  }
}

const SECRET_HEADERS = new Set([
  'authorization', 'x-api-key', 'api-key', 'x-auth-token', 'x-access-token',
  'proxy-authorization', 'cookie',
]);

/*
  One `HistoryFacts` per row object, so the parsing survives re-renders.

  Keyed on the row object rather than its id: the sidebar replaces the whole
  array when the host pushes new history, and an id-keyed cache would then hand
  back facts parsed from the previous version of that row. A WeakMap also needs
  no invalidation — when the array goes, so do the facts.
*/
const CACHE = new WeakMap<HistoryRowLike, HistoryFacts>();

export function factsOf(row: HistoryRowLike): HistoryFacts {
  let facts = CACHE.get(row);
  if (!facts) { facts = new HistoryFacts(row); CACHE.set(row, facts); }
  return facts;
}
