/**
 * HTTP request executor — runs in extension host (no CORS).
 * Uses axios for HTTP requests with socket-level timing instrumentation.
 */
import axios, { AxiosRequestConfig, AxiosError } from 'axios';
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
  bodyFormData: { key: string; value: string }[];
  bodyUrlEncoded: { key: string; value: string }[];
  authType: string;
  authData: Record<string, string>;
  // Settings (injected by MainPanel from app_settings)
  timeout?: number;
  followRedirects?: boolean;
  sslVerification?: boolean;
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

export interface ExecuteResult {
  tabId: string;
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
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
  for (const p of params.params) {
    if (p.key) urlObj.searchParams.append(p.key, p.value);
  }

  // Build body
  let data: unknown = undefined;
  if (params.bodyMode === 'json' && params.bodyRaw) {
    try {
      data = JSON.parse(params.bodyRaw);
      if (!headers['Content-Type']) headers['Content-Type'] = params.bodyContentType || 'application/json';
    } catch {
      data = params.bodyRaw;
    }
  } else if (params.bodyMode === 'raw' && params.bodyRaw) {
    data = params.bodyRaw;
    if (!headers['Content-Type'] && params.bodyContentType) headers['Content-Type'] = params.bodyContentType;
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
    // Build multipart boundary manually or use FormData
    const boundary = '----DaakiaBoundary' + Date.now().toString(36);
    let body = '';
    for (const f of params.bodyFormData) {
      if (f.key) {
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="${f.key}"\r\n\r\n`;
        body += `${f.value}\r\n`;
      }
    }
    body += `--${boundary}--\r\n`;
    data = body;
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

  // Build proxy config
  let proxyConfig: AxiosRequestConfig['proxy'] = false; // Default: bypass VS Code proxy agent
  if (params.proxy && params.proxy.mode === 'manual' && params.proxy.host) {
    // Check if this host is in the bypass list
    const bypassList = params.proxy.bypass || [];
    const shouldBypass = bypassList.some(b => {
      const pattern = b.trim().toLowerCase();
      if (!pattern) return false;
      if (pattern.startsWith('*')) return hostname.endsWith(pattern.slice(1));
      return hostname === pattern || hostname.endsWith('.' + pattern);
    });
    if (!shouldBypass) {
      proxyConfig = {
        host: params.proxy.host,
        port: params.proxy.port || 8080,
        ...(params.proxy.username ? { auth: { username: params.proxy.username, password: params.proxy.password || '' } } : {}),
        protocol: isHttps ? 'https' : 'http',
      };
    }
  } else if (params.proxy && params.proxy.mode === 'system') {
    proxyConfig = undefined; // Let axios use system proxy (env vars HTTP_PROXY, HTTPS_PROXY)
  }

  const config: AxiosRequestConfig = {
    method: params.method.toLowerCase() as AxiosRequestConfig['method'],
    url: urlObj.toString(),
    headers,
    data,
    validateStatus: () => true, // Don't throw on non-2xx
    timeout: params.timeout ?? 30000,
    maxRedirects: params.followRedirects === false ? 0 : 10,
    responseType: 'text',
    transformResponse: [(data) => data], // Keep raw
    proxy: proxyConfig as any,
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
    const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
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
      response: {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        body,
        size: Buffer.byteLength(body, 'utf-8'),
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
