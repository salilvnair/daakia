/**
 * SOAP executor — sends SOAP XML envelopes via HTTP POST.
 * Supports SOAP 1.1 (text/xml + SOAPAction header) and SOAP 1.2 (application/soap+xml).
 */
import http from 'http';
import https from 'https';
import net from 'net';
import tls from 'tls';
import { URL } from 'url';
import crypto from 'crypto';
import type { ResolvedProxy } from '../services/proxy-config';
import { sniFor } from '../services/tls-policy';

export interface SoapInvokeParams {
  tabId: string;
  endpoint: string;
  soapVersion: '1.1' | '1.2';
  soapAction: string;
  envelope: string; // raw SOAP XML
  headers: { key: string; value: string }[];
  attachments?: SoapAttachmentParam[]; // MTOM file attachments
  timeout?: number; // request timeout in ms (default 300000)
  /**
   * Routing decision from the shared proxy resolver.
   *
   * SOAP posts through the raw http/https modules rather than axios, so the
   * proxy has to be applied here by hand. It was not, which meant a configured
   * proxy silently did nothing for SOAP while it worked for REST.
   */
  proxy?: ResolvedProxy;
  /**
   * Certificate verification, resolved by the caller from settings.
   * SOAP used to verify unconditionally, so turning verification off in
   * settings worked for REST and quietly did nothing here.
   */
  rejectUnauthorized?: boolean;
}

export interface SoapAttachmentParam {
  contentId: string;
  contentType: string;
  filename: string;
  base64Data: string;
}

export interface SoapResponse {
  tabId: string;
  status: number;
  statusText: string;
  body: string;
  headers: { key: string; value: string }[];
  time: number;
  size: number;
  hasFault: boolean;
  /** The headers actually put on the wire, including the ones built here. */
  requestHeaders?: Record<string, string>;
}

// Track active requests for cancellation
const activeRequests = new Map<string, http.ClientRequest>();

/**
 * Execute a SOAP request via HTTP POST.
 */
export function executeSoapRequest(params: SoapInvokeParams): Promise<SoapResponse> {
  const startTime = Date.now();
  const { tabId, endpoint, soapVersion, soapAction, envelope, headers, attachments } = params;

  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      reject(new Error(`Invalid endpoint URL: ${endpoint}`));
      return;
    }

    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    // Build request headers
    const reqHeaders: Record<string, string> = {};

    const hasAttachments = attachments && attachments.length > 0;
    const boundary = hasAttachments ? `----=_Part_${crypto.randomUUID().replace(/-/g, '')}` : '';

    // Set content type based on SOAP version and attachments
    if (hasAttachments) {
      // MTOM multipart/related
      const startCid = '<soap-envelope@daakia>';
      const xmlMediaType = soapVersion === '1.2' ? 'application/soap+xml' : 'text/xml';
      reqHeaders['Content-Type'] = `multipart/related; boundary="${boundary}"; type="application/xop+xml"; start="${startCid}"; start-info="${xmlMediaType}"`;
      if (soapVersion === '1.1' && soapAction) {
        reqHeaders['SOAPAction'] = `"${soapAction}"`;
      }
    } else if (soapVersion === '1.2') {
      reqHeaders['Content-Type'] = soapAction
        ? `application/soap+xml;charset=UTF-8;action="${soapAction}"`
        : 'application/soap+xml;charset=UTF-8';
    } else {
      reqHeaders['Content-Type'] = 'text/xml;charset=UTF-8';
      if (soapAction) {
        reqHeaders['SOAPAction'] = `"${soapAction}"`;
      }
    }

    // Apply custom headers (user can override)
    for (const h of headers) {
      if (h.key) reqHeaders[h.key] = h.value;
    }

    // Build request body
    let body: Buffer;
    if (hasAttachments) {
      body = buildMtomBody(envelope, attachments, boundary, soapVersion);
    } else {
      body = Buffer.from(envelope, 'utf-8');
    }

    reqHeaders['Content-Length'] = String(body.length);

    const timeout = params.timeout ?? 300000;
    const targetPort = Number(url.port || (isHttps ? 443 : 80));
    const viaProxy = params.proxy?.used ? params.proxy.axiosProxy : undefined;

    // Verify unless the caller resolved the settings and said otherwise.
    const verifyCert = params.rejectUnauthorized ?? true;

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: targetPort,
      path: url.pathname + url.search,
      method: 'POST',
      headers: reqHeaders,
      timeout,
      ...(isHttps ? { rejectUnauthorized: verifyCert, servername: sniFor(url.hostname) } : {}),
    };

    if (viaProxy && typeof viaProxy === 'object') {
      if (isHttps) {
        // An HTTPS target cannot be given to the proxy in the clear: the proxy
        // opens a raw tunnel with CONNECT and TLS is negotiated end-to-end
        // through it, so the proxy never sees the request.
        options.createConnection = ((_opts: unknown, cb: (err: Error | null, sock?: net.Socket) => void) => {
          const connect = http.request({
            host: viaProxy.host,
            port: viaProxy.port,
            method: 'CONNECT',
            path: `${url.hostname}:${targetPort}`,
            headers: {
              host: `${url.hostname}:${targetPort}`,
              ...(viaProxy.auth
                ? { 'proxy-authorization': `Basic ${Buffer.from(`${viaProxy.auth.username}:${viaProxy.auth.password}`).toString('base64')}` }
                : {}),
            },
            timeout,
          });
          connect.on('connect', (res, socket) => {
            if (res.statusCode !== 200) {
              socket.destroy();
              cb(new Error(`Proxy refused the CONNECT tunnel: ${res.statusCode} ${res.statusMessage ?? ''}`.trim()));
              return;
            }
            cb(null, tls.connect({ socket, servername: sniFor(url.hostname), rejectUnauthorized: verifyCert }));
          });
          connect.on('error', (err) => cb(err));
          connect.on('timeout', () => { connect.destroy(); cb(new Error(`Proxy did not answer CONNECT within ${Math.round(timeout / 1000)}s`)); });
          connect.end();
          return undefined as unknown as net.Socket;   // the socket arrives via cb
        }) as unknown as http.RequestOptions['createConnection'];
      } else {
        // Plain HTTP through a proxy is an ordinary request to the proxy with
        // the absolute URL as the request target.
        options.hostname = viaProxy.host;
        options.port = viaProxy.port;
        options.path = url.toString();
        (options.headers as Record<string, string>).Host = url.host;
        if (viaProxy.auth) {
          (options.headers as Record<string, string>)['Proxy-Authorization'] =
            `Basic ${Buffer.from(`${viaProxy.auth.username}:${viaProxy.auth.password}`).toString('base64')}`;
        }
      }
    }

    const req = transport.request(options, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => chunks.push(chunk));

      res.on('end', () => {
        activeRequests.delete(tabId);
        const responseBody = Buffer.concat(chunks).toString('utf-8');
        const elapsed = Date.now() - startTime;
        const size = Buffer.byteLength(responseBody, 'utf-8');

        // Detect SOAP fault
        const hasFault = /<(soap:|SOAP-ENV:|s:|)Fault[> ]/i.test(responseBody);

        // Collect response headers
        const respHeaders: { key: string; value: string }[] = [];
        if (res.headers) {
          for (const [key, val] of Object.entries(res.headers)) {
            if (val) {
              const value = Array.isArray(val) ? val.join(', ') : val;
              respHeaders.push({ key, value });
            }
          }
        }

        resolve({
          tabId,
          status: res.statusCode || 0,
          statusText: res.statusMessage || '',
          body: responseBody,
          headers: respHeaders,
          time: elapsed,
          size,
          hasFault,
          requestHeaders: reqHeaders,
        });
      });
    });

    req.on('error', (err) => {
      activeRequests.delete(tabId);
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      activeRequests.delete(tabId);
      const timeoutMs = timeout;
      const timeoutSec = Math.round(timeoutMs / 1000);
      reject(new Error(`Request timed out after ${timeoutSec}s`));
    });

    activeRequests.set(tabId, req);
    req.write(body);
    req.end();
  });
}

/**
 * Cancel an active SOAP request.
 */
export function cancelSoapRequest(tabId: string): boolean {
  const req = activeRequests.get(tabId);
  if (req) {
    req.destroy();
    activeRequests.delete(tabId);
    return true;
  }
  return false;
}

/**
 * Build MTOM multipart/related body with XOP packaging.
 * The SOAP envelope is the root part, followed by binary attachment parts.
 */
function buildMtomBody(
  envelope: string,
  attachments: SoapAttachmentParam[],
  boundary: string,
  soapVersion: '1.1' | '1.2',
): Buffer {
  const CRLF = '\r\n';
  const xmlMediaType = soapVersion === '1.2' ? 'application/soap+xml' : 'text/xml';
  const parts: Buffer[] = [];

  // Root part — SOAP envelope with XOP content type
  parts.push(Buffer.from(
    `--${boundary}${CRLF}` +
    `Content-Type: application/xop+xml; charset=UTF-8; type="${xmlMediaType}"${CRLF}` +
    `Content-Transfer-Encoding: 8bit${CRLF}` +
    `Content-ID: <soap-envelope@daakia>${CRLF}` +
    `${CRLF}` +
    envelope + CRLF,
    'utf-8'
  ));

  // Attachment parts
  for (const att of attachments) {
    const header = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Type: ${att.contentType}${CRLF}` +
      `Content-Transfer-Encoding: base64${CRLF}` +
      `Content-ID: <${att.contentId}>${CRLF}` +
      `Content-Disposition: attachment; filename="${att.filename}"${CRLF}` +
      `${CRLF}`,
      'utf-8'
    );
    const data = Buffer.from(att.base64Data, 'base64');
    const base64Lines = data.toString('base64').match(/.{1,76}/g) || [];
    const base64Body = Buffer.from(base64Lines.join(CRLF) + CRLF, 'utf-8');
    parts.push(Buffer.concat([header, base64Body]));
  }

  // Closing boundary
  parts.push(Buffer.from(`--${boundary}--${CRLF}`, 'utf-8'));

  return Buffer.concat(parts);
}
