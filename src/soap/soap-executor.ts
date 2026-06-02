/**
 * SOAP executor — sends SOAP XML envelopes via HTTP POST.
 * Supports SOAP 1.1 (text/xml + SOAPAction header) and SOAP 1.2 (application/soap+xml).
 */
import http from 'http';
import https from 'https';
import { URL } from 'url';
import crypto from 'crypto';

export interface SoapInvokeParams {
  tabId: string;
  endpoint: string;
  soapVersion: '1.1' | '1.2';
  soapAction: string;
  envelope: string; // raw SOAP XML
  headers: { key: string; value: string }[];
  attachments?: SoapAttachmentParam[]; // MTOM file attachments
  timeout?: number; // request timeout in ms (default 300000)
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

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: reqHeaders,
      timeout: params.timeout ?? 300000,
    };

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
      const timeoutMs = params.timeout ?? 300000;
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
