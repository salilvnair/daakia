/**
 * HTTP request executor — runs in extension host (no CORS).
 * Uses axios for HTTP requests with socket-level timing instrumentation.
 */
import axios, { AxiosRequestConfig, AxiosError } from 'axios';
import { resolveProxy, type ProxyConfig, type ResolvedProxy } from '../services/proxy-config';
import { applyQueryEncoding, type QueryEncoding } from '../services/execution-settings';
import * as fs from 'fs';
import {
  createTimedHttpAgent, createTimedHttpsAgent,
  markTtfb, markDownloadEnd,
  timingsToPhases, type TimingPhase, type RequestTimings,
} from './timing-agent';

export interface ExecuteRequestParams {
  tabId: string;
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  params: { key: string; value: string }[];
  bodyMode: string;
  bodyRaw: string;
  bodyContentType?: string;
  bodyFormData: { key: string; value: string; type?: 'text' | 'file'; files?: string[]; filePaths?: string[]; fileData?: string[]; fileMimeTypes?: string[] }[];
  bodyUrlEncoded: { key: string; value: string }[];
  authType: string;
  authData: Record<string, string>;
  // Settings (injected by MainPanel from app_settings)
  timeout?: number;
  followRedirects?: boolean;
  sslVerification?: boolean;
  /** How query parameters are encoded. See services/execution-settings.ts. */
  encoding?: QueryEncoding;
  /** Trusted SSL hostnames — skip verification for these even when sslVerification is true */
  trustedHosts?: string[];
  /** Proxy configuration */
  proxy?: {
    mode: 'none' | 'system' | 'manual';
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    bypass?: string[];
  };
}

export interface ResponseCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

/** Trim the resolver's result down to what a log entry needs. */
function proxyInfo(r: ResolvedProxy): { used: boolean; description: string; warning?: string } {
  return { used: r.used, description: r.description, warning: r.warning };
}

export interface ExecuteResult {
  tabId: string;
  /**
   * How this request was routed. Reported on every result so the DevTools
   * network log and the audit trail can show it — a proxy that is configured
   * but not applied is invisible otherwise, which is exactly how the bug this
   * fixes went unnoticed.
   */
  proxy?: { used: boolean; description: string; warning?: string };
  /** The actual headers sent in the request (including auto-added Content-Type, Authorization, etc.) */
  requestHeaders?: Record<string, string>;
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    /** 'base64' when body is a binary response encoded as base64; 'utf8' for text responses */
    bodyEncoding?: 'utf8' | 'base64';
    size: number;
    time: number;
    contentType: string;
    cookies: ResponseCookie[];
    /** Request timing phases for DevTools Timeline */
    timing?: TimingPhase[];
    /** Raw error details for DevTools — code, message, cause chain */
    errorDetail?: { code: string; message: string; cause?: string };
  };
}

// Track active requests for cancellation
const activeControllers = new Map<string, AbortController>();

/** Cancel an in-flight REST request by tabId */
export function cancelRestRequest(tabId: string): boolean {
  const controller = activeControllers.get(tabId);
  if (controller) {
    controller.abort();
    activeControllers.delete(tabId);
    return true;
  }
  return false;
}

export async function executeRequest(params: ExecuteRequestParams): Promise<ExecuteResult> {
  const startTime = Date.now();
  const controller = new AbortController();
  activeControllers.set(params.tabId, controller);

  // Declared out here so the catch block can report how the request was routed.
  // A connection failure is exactly when someone needs to know whether it went
  // through a proxy.
  let resolvedProxy: ResolvedProxy = { axiosProxy: false, used: false, description: 'direct (not yet resolved)' };

  try {
  // Build headers
  const headers: Record<string, string> = {};
  for (const h of params.headers) {
    if (h.key) headers[h.key] = h.value;
  }

  // Apply auth
  if (params.authType === 'bearer' && params.authData.token) {
    headers['Authorization'] = `Bearer ${params.authData.token}`;
  } else if (params.authType === 'basic' && params.authData.username) {
    const encoded = Buffer.from(`${params.authData.username}:${params.authData.password || ''}`).toString('base64');
    headers['Authorization'] = `Basic ${encoded}`;
  } else if (params.authType === 'api-key' && params.authData.apiKeyName) {
    headers[params.authData.apiKeyName] = params.authData.apiKeyValue || '';
  } else if (params.authType === 'oauth2' && params.authData.accessToken) {
    headers['Authorization'] = `Bearer ${params.authData.accessToken}`;
  }

  // Build URL with query params — trim and strip invisible chars (common in copy-paste)
  let url = (params.url || '').trim().replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');
  if (!url.match(/^https?:\/\//)) {
    url = 'http://' + url;
  }
  const urlObj = new URL(url);

  /**
   * The URL that actually goes on the wire.
   *
   * `enable` keeps the original URLSearchParams path exactly as it was. It is
   * the default, so taking the new path here would quietly change the encoding
   * of every request in the app for a feature nobody opted into — `+` for a
   * space becoming `%20`, and so on.
   *
   * `disable` and `auto` assemble the query from the raw text instead, because
   * URLSearchParams cannot express "leave this alone": it re-encodes on the way
   * out, which is the thing those two modes exist to avoid.
   */
  const encoding = params.encoding ?? 'enable';
  let requestUrl: string;
  if (encoding === 'enable') {
    for (const p of params.params) {
      if (p.key) urlObj.searchParams.append(p.key, p.value);
    }
    requestUrl = urlObj.toString();
  } else {
    // Split the raw string rather than reading it back off `urlObj`, whose
    // getters have already normalised the query.
    const hashAt = url.indexOf('#');
    const hash = hashAt === -1 ? '' : url.slice(hashAt);
    const head = hashAt === -1 ? url : url.slice(0, hashAt);
    const qAt = head.indexOf('?');
    const base = qAt === -1 ? head : head.slice(0, qAt);
    const typed = qAt === -1 ? '' : head.slice(qAt + 1);
    const rows = params.params.filter(p => p.key).map(p => `${p.key}=${p.value}`).join('&');
    const query = [typed, rows].filter(Boolean).join('&');
    requestUrl = applyQueryEncoding(query ? `${base}?${query}${hash}` : `${base}${hash}`, encoding);
  }

  // Build body
  let data: unknown = undefined;
  if (params.bodyMode === 'json' && params.bodyRaw) {
    try {
      data = JSON.parse(params.bodyRaw);
    } catch {
      data = params.bodyRaw;
    }
    if (!headers['Content-Type']) headers['Content-Type'] = params.bodyContentType || 'application/json';
  } else if (params.bodyMode === 'raw' && params.bodyRaw) {
    data = params.bodyRaw;
    if (!headers['Content-Type']) headers['Content-Type'] = params.bodyContentType || 'text/plain';
  } else if (params.bodyMode === 'binary' && params.bodyRaw) {
    data = Buffer.from(params.bodyRaw, 'base64');
    if (!headers['Content-Type']) headers['Content-Type'] = params.bodyContentType || 'application/octet-stream';
  } else if (params.bodyMode === 'x-www-form-urlencoded') {
    const formData = new URLSearchParams();
    for (const f of params.bodyUrlEncoded) {
      if (f.key) formData.append(f.key, f.value);
    }
    data = formData.toString();
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (params.bodyMode === 'form-data') {
    // Build multipart form-data with proper file handling
    const boundary = '----DaakiaBoundary' + Date.now().toString(36);
    const parts: Buffer[] = [];
    for (const f of params.bodyFormData) {
      if (!f.key) continue;
      if (f.type === 'file') {
        // Determine file source: fileData (base64 from fresh webview pick) or filePaths (disk read for history/collection)
        const hasData = f.fileData && f.fileData.length > 0;
        const hasPaths = f.filePaths && f.filePaths.length > 0;
        const count = hasData ? f.fileData!.length : (hasPaths ? f.filePaths!.length : 0);

        for (let i = 0; i < count; i++) {
          const filename = f.files?.[i] || `file${i}`;
          const mimeType = f.fileMimeTypes?.[i] || 'application/octet-stream';
          let fileBuffer: Buffer;

          if (hasData && f.fileData![i]) {
            // Fresh upload: base64 data from webview FileReader
            fileBuffer = Buffer.from(f.fileData![i], 'base64');
          } else if (hasPaths && f.filePaths![i]) {
            // History/collection restore: read file from disk
            const filePath = f.filePaths![i];
            if (!fs.existsSync(filePath)) {
              throw new Error(`File not found: ${filePath} (for field "${f.key}")`);
            }
            fileBuffer = fs.readFileSync(filePath);
          } else {
            continue; // skip if no source
          }

          parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.key}"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`));
          parts.push(fileBuffer);
          parts.push(Buffer.from('\r\n'));
        }
      } else {
        // Text field
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.key}"\r\n\r\n${f.value}\r\n`));
      }
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    data = Buffer.concat(parts);
    headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
  }

  // Create timed agents for socket-level timing instrumentation
  const isHttps = urlObj.protocol === 'https:';
  // Determine SSL: skip verification if sslVerification=false OR host is in trustedHosts
  const hostname = urlObj.hostname;
  const hostTrusted = params.trustedHosts?.includes(hostname) ?? false;
  const rejectUnauthorized = params.sslVerification !== false && !hostTrusted;
  const timedAgent = isHttps
    ? createTimedHttpsAgent(rejectUnauthorized)
    : createTimedHttpAgent();

  // One resolver for every protocol — see src/services/proxy-config.ts for why
  // this is not inlined here any more.
  resolvedProxy = resolveProxy(params.proxy as ProxyConfig | undefined, requestUrl);

  const config: AxiosRequestConfig = {
    method: params.method.toLowerCase() as AxiosRequestConfig['method'],
    url: requestUrl,
    headers,
    data,
    validateStatus: () => true, // Don't throw on non-2xx
    timeout: params.timeout || 0,
    maxRedirects: params.followRedirects === false ? 0 : 10,
    responseType: 'arraybuffer',
    proxy: resolvedProxy.axiosProxy as AxiosRequestConfig['proxy'],
    signal: controller.signal,
    ...(isHttps
      ? { httpsAgent: timedAgent.agent }
      : { httpAgent: timedAgent.agent }),
  };

    const res = await axios(config);
    // Mark TTFB + download end for timing
    markTtfb(timedAgent);
    markDownloadEnd(timedAgent);
    const elapsed = Date.now() - startTime;
    // res.data is always a Buffer (arraybuffer responseType)
    const rawBuffer: Buffer = Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data as ArrayBuffer);
    const responseHeaders: Record<string, string> = {};
    const rawSetCookies: string[] = [];
    for (const [k, v] of Object.entries(res.headers)) {
      if (k.toLowerCase() === 'set-cookie') {
        if (Array.isArray(v)) rawSetCookies.push(...v);
        else if (typeof v === 'string') rawSetCookies.push(v);
      }
      if (typeof v === 'string') responseHeaders[k] = v;
      else if (Array.isArray(v)) responseHeaders[k] = v.join(', ');
    }
    const contentType = responseHeaders['content-type'] || 'text/plain';

    // Determine if response is binary — base64 encode to preserve bytes; text stays UTF-8
    const bodyEncoding = isBinaryContentType(contentType) ? 'base64' : 'utf8';
    const body = bodyEncoding === 'base64'
      ? rawBuffer.toString('base64')
      : rawBuffer.toString('utf8');

    // Parse cookies from Set-Cookie headers
    const cookies: ResponseCookie[] = rawSetCookies.map(raw => {
      const parts = raw.split(';').map(p => p.trim());
      const [nameVal, ...attrs] = parts;
      const eqIdx = nameVal.indexOf('=');
      const name = eqIdx > -1 ? nameVal.slice(0, eqIdx) : nameVal;
      const value = eqIdx > -1 ? nameVal.slice(eqIdx + 1) : '';
      const cookie: ResponseCookie = { name, value };
      for (const attr of attrs) {
        const [aKey, ...aVals] = attr.split('=');
        const aName = aKey.trim().toLowerCase();
        const aVal = aVals.join('=').trim();
        if (aName === 'domain') cookie.domain = aVal;
        else if (aName === 'path') cookie.path = aVal;
        else if (aName === 'expires') cookie.expires = aVal;
        else if (aName === 'httponly') cookie.httpOnly = true;
        else if (aName === 'secure') cookie.secure = true;
        else if (aName === 'samesite') cookie.sameSite = aVal;
      }
      return cookie;
    });

    // Compute timing phases
    const timings = timedAgent.getTimings();
    const timing = timingsToPhases(timings);

    return {
      tabId: params.tabId,
      proxy: proxyInfo(resolvedProxy),
      requestHeaders: headers,
      response: {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        body,
        bodyEncoding,
        size: rawBuffer.length,
        time: elapsed,
        contentType,
        cookies,
        timing: timing.length > 0 ? timing : undefined,
      },
    };
  } catch (err: unknown) {
    const elapsed = Date.now() - startTime;
    const axErr = err as AxiosError;

    // If aborted by user, return a clean cancelled response
    if (controller.signal.aborted) {
      activeControllers.delete(params.tabId);
      return {
        tabId: params.tabId,
        proxy: proxyInfo(resolvedProxy),
        response: {
          status: 0,
          statusText: 'Request cancelled',
          headers: {},
          body: 'Request was cancelled by the user.',
          size: 0,
          time: elapsed,
          contentType: 'text/plain',
          cookies: [],
        },
      };
    }

    const { errorCode, friendlyMessage } = classifyNetworkError(axErr, params.url);

    // Build raw error detail for DevTools — always preserve the actual error
    const rawCode = (err as any).code || (err as any).cause?.code || '';
    const rawMessage = err instanceof Error ? err.message : String(err);
    const rawCause = (err as any).cause
      ? ((err as any).cause.message || String((err as any).cause))
      : ((err as any).errors ? (err as any).errors.map((e: any) => e.message || e.code).join('; ') : undefined);

    return {
      tabId: params.tabId,
      proxy: proxyInfo(resolvedProxy),
      response: {
        status: 0,
        statusText: errorCode,
        headers: {},
        body: friendlyMessage,
        size: 0,
        time: elapsed,
        contentType: 'text/plain',
        cookies: [],
        errorDetail: { code: rawCode || errorCode, message: rawMessage, cause: rawCause },
      },
    };
  } finally {
    activeControllers.delete(params.tabId);
  }
}

/** Classify network/connection errors into user-friendly messages */
function classifyNetworkError(err: AxiosError, url: string): { errorCode: string; friendlyMessage: string } {
  const code = (err as any).code || '';
  const cause = (err as any).cause;
  // Dig into AggregateError or nested causes for the real error code
  const nestedCode = cause?.code || (cause?.errors?.[0]?.code) || '';
  const effectiveCode = code || nestedCode;

  switch (effectiveCode) {
    case 'ECONNREFUSED':
      return {
        errorCode: 'ECONNREFUSED',
        friendlyMessage: `Connection refused\n\nThe server at ${url} is not accepting connections.\nMake sure the server is running and the port is correct.`,
      };
    case 'ENOTFOUND':
      return {
        errorCode: 'ENOTFOUND',
        friendlyMessage: `DNS lookup failed\n\nCould not resolve hostname for ${url}.\nCheck that the URL is correct and your network is connected.`,
      };
    case 'ETIMEDOUT':
    case 'ECONNABORTED':
    case 'TIMEOUT':
      return {
        errorCode: 'ETIMEDOUT',
        friendlyMessage: `Request timed out\n\nThe server at ${url} did not respond within the timeout period.\nThe server might be overloaded or unreachable.`,
      };
    case 'ECONNRESET':
      return {
        errorCode: 'ECONNRESET',
        friendlyMessage: `Connection reset\n\nThe server at ${url} abruptly closed the connection.\nThis could indicate a server crash or firewall intervention.`,
      };
    case 'ERR_NETWORK':
      return {
        errorCode: 'ERR_NETWORK',
        friendlyMessage: `Network error\n\nUnable to reach ${url}.\nCheck your network connection and try again.`,
      };
    case 'CERT_HAS_EXPIRED':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return {
        errorCode: effectiveCode,
        friendlyMessage: `SSL/TLS certificate error (${effectiveCode})\n\nThe server's certificate is not trusted.\nYou can disable SSL verification in Settings if this is a development server.`,
      };
    case 'EHOSTUNREACH':
      return {
        errorCode: 'EHOSTUNREACH',
        friendlyMessage: `Host unreachable\n\nThe host at ${url} cannot be reached.\nCheck your network configuration and firewall settings.`,
      };
    case 'EPIPE':
      return {
        errorCode: 'EPIPE',
        friendlyMessage: `Broken pipe\n\nThe connection to ${url} was broken unexpectedly.\nThe server may have closed the connection before the request was complete.`,
      };
    default: {
      // Handle AggregateError specifically
      const msg = err.message || String(err);
      if (msg.includes('AggregateError') || (cause && cause.constructor?.name === 'AggregateError')) {
        // AggregateError usually wraps ECONNREFUSED for IPv4+IPv6
        const innerErrors = cause?.errors || [];
        const innerCode = innerErrors[0]?.code || 'ECONNREFUSED';
        const innerMsg = innerErrors[0]?.message || `Connection refused at ${url}`;
        return {
          errorCode: innerCode,
          friendlyMessage: `Connection refused\n\nThe server at ${url} is not accepting connections.\n${innerMsg}\n\nMake sure the server is running and the port is correct.`,
        };
      }
      // Detect SSL/TLS errors from message text (VS Code proxy agent may mask error codes)
      const lowerMsg = msg.toLowerCase();
      if (lowerMsg.includes('certificate') || lowerMsg.includes('ssl') || lowerMsg.includes('tls')
        || lowerMsg.includes('unable to verify') || lowerMsg.includes('self signed')
        || effectiveCode === 'ERR_INVALID_URL' || msg === 'Invalid URL') {
        return {
          errorCode: 'SSL_ERROR',
          friendlyMessage: `SSL/TLS certificate error\n\nThe server's certificate at ${url} is not trusted.\nThis is common for internal/corporate servers.\n\nFix: Go to Settings (gear icon) → disable "SSL Certificate Verification"`,
        };
      }
      return {
        errorCode: code || 'ERROR',
        friendlyMessage: `Request failed: ${msg}\n\nURL: ${url}`,
      };
    }
  }
}

/** Returns true for content types whose body should be base64-encoded (not decoded to UTF-8 string) */
export function isBinaryContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase().split(';')[0].trim();
  // Explicit text types — always UTF-8 string
  if (
    ct.startsWith('text/') ||
    ct === 'application/json' ||
    ct === 'application/xml' ||
    ct === 'application/xhtml+xml' ||
    ct === 'application/javascript' ||
    ct === 'application/x-javascript' ||
    ct === 'application/ld+json' ||
    ct === 'application/atom+xml' ||
    ct === 'application/rss+xml' ||
    ct === 'application/soap+xml' ||
    ct === 'application/x-www-form-urlencoded'
  ) {
    return false;
  }
  // Binary types
  if (
    ct.startsWith('image/') ||
    ct.startsWith('audio/') ||
    ct.startsWith('video/') ||
    ct === 'application/octet-stream' ||
    ct === 'application/pdf' ||
    ct === 'application/zip' ||
    ct === 'application/x-zip-compressed' ||
    ct === 'application/gzip' ||
    ct === 'application/x-tar' ||
    ct === 'application/x-rar-compressed' ||
    ct === 'application/x-7z-compressed' ||
    ct === 'application/vnd.ms-excel' ||
    ct === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    ct === 'application/vnd.ms-powerpoint' ||
    ct === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    ct === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ct === 'application/msword' ||
    ct === 'application/x-protobuf' ||
    ct === 'application/protobuf' ||
    ct === 'font/woff' ||
    ct === 'font/woff2' ||
    ct === 'application/x-font-woff'
  ) {
    return true;
  }
  // Unknown types with no text subtype — treat as binary to be safe
  return ct.startsWith('application/') && !ct.includes('json') && !ct.includes('xml') && !ct.includes('text');
}

