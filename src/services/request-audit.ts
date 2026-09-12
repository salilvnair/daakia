/**
 * Full request audit records.
 *
 * The audit log used to show `rest.send` with `{ method, url }` and nothing
 * else. That is because the webview logged it on *click* — at which point there
 * is no response, no sent headers, no timing and no routing decision to record.
 * Everything worth auditing about a request only exists after it finishes, in
 * the extension host.
 *
 * So the record is built here, once, after completion, and carries the whole
 * story: what was sent, what came back, how it was routed, and which settings
 * were in force. "Why did this request behave differently to the one I sent
 * yesterday" is the question an audit log exists to answer, and it cannot be
 * answered from a method and a URL.
 */

/** Bodies are truncated so the audit database cannot be filled by one response. */
const MAX_BODY_CHARS = 8_000;
const MAX_HEADERS = 80;

export interface RequestAuditInput {
  method: string;
  url: string;
  /** Headers actually sent, after auth and content-type were applied. */
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  bodyMode?: string;
  authType?: string;
  params?: { key: string; value: string; enabled?: boolean }[];
  response: {
    status: number;
    statusText: string;
    headers?: Record<string, string>;
    body?: string;
    size?: number;
    time?: number;
    contentType?: string;
    timing?: { name: string; startMs: number; durationMs: number }[];
    cookies?: unknown[];
  };
  proxy?: { used: boolean; description: string; warning?: string };
  settings?: Record<string, unknown>;
  scripts?: { preRequest: boolean; postResponse: boolean; testsPassed: number; testsFailed: number };
}

export interface RequestAuditRecord {
  request: {
    method: string;
    url: string;
    queryParams?: Record<string, string>;
    authType?: string;
    bodyMode?: string;
    headers: Record<string, string>;
    headerCount: number;
    body?: string;
    bodyBytes?: number;
    bodyTruncated?: boolean;
  };
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    headerCount: number;
    body?: string;
    bodyBytes?: number;
    bodyTruncated?: boolean;
    contentType?: string;
    sizeBytes?: number;
    durationMs?: number;
    cookieCount?: number;
    timing?: { name: string; startMs: number; durationMs: number }[];
  };
  /** How the request was routed — direct or through a proxy, and why. */
  routing: { proxied: boolean; route: string; warning?: string };
  /** The settings actually in force for this request, not the defaults. */
  settings: {
    followRedirects?: boolean;
    sslVerification?: boolean;
    timeoutMs?: number;
    saveResponseInHistory?: boolean;
    maxHistoryEntries?: number;
  };
  scripts?: { preRequest: boolean; postResponse: boolean; testsPassed: number; testsFailed: number };
}

function clip(text: string | undefined): { value?: string; bytes?: number; truncated?: boolean } {
  if (text === undefined || text === null) return {};
  const bytes = Buffer.byteLength(text, 'utf8');
  if (text.length <= MAX_BODY_CHARS) return { value: text, bytes };
  return {
    value: `${text.slice(0, MAX_BODY_CHARS)}\n\n[… truncated for the audit log — ${bytes} bytes total]`,
    bytes,
    truncated: true,
  };
}

/** Cap the header count too: a pathological response should not bloat every row. */
function limitHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  let n = 0;
  for (const [k, v] of Object.entries(headers)) {
    if (n++ >= MAX_HEADERS) { out['…'] = `${Object.keys(headers).length - MAX_HEADERS} more headers not recorded`; break; }
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

export function buildRequestAudit(input: RequestAuditInput): RequestAuditRecord {
  const reqBody = clip(input.requestBody);
  const resBody = clip(input.response.body);

  const queryParams: Record<string, string> = {};
  for (const p of input.params ?? []) {
    if (p.enabled !== false && p.key) queryParams[p.key] = p.value;
  }

  const s = input.settings ?? {};

  return {
    request: {
      method: input.method,
      url: input.url,
      queryParams: Object.keys(queryParams).length ? queryParams : undefined,
      authType: input.authType && input.authType !== 'none' ? input.authType : undefined,
      bodyMode: input.bodyMode && input.bodyMode !== 'none' ? input.bodyMode : undefined,
      headers: limitHeaders(input.requestHeaders),
      headerCount: Object.keys(input.requestHeaders ?? {}).length,
      body: reqBody.value,
      bodyBytes: reqBody.bytes,
      bodyTruncated: reqBody.truncated,
    },
    response: {
      status: input.response.status,
      statusText: input.response.statusText,
      headers: limitHeaders(input.response.headers),
      headerCount: Object.keys(input.response.headers ?? {}).length,
      body: resBody.value,
      bodyBytes: resBody.bytes,
      bodyTruncated: resBody.truncated,
      contentType: input.response.contentType,
      sizeBytes: input.response.size,
      durationMs: input.response.time,
      cookieCount: input.response.cookies?.length,
      timing: input.response.timing,
    },
    routing: {
      proxied: input.proxy?.used ?? false,
      route: input.proxy?.description ?? 'direct (not recorded)',
      warning: input.proxy?.warning,
    },
    settings: {
      followRedirects: s.followRedirects as boolean | undefined,
      sslVerification: s.sslVerification as boolean | undefined,
      timeoutMs: s.timeout as number | undefined,
      saveResponseInHistory: s.saveResponseInHistory as boolean | undefined,
      maxHistoryEntries: s.maxHistoryEntries as number | undefined,
    },
    scripts: input.scripts,
  };
}
