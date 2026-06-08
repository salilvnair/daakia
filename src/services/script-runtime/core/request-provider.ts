/**
 * Core Provider: HTTP Request & Response
 *
 * Contributes: dk.request, dk.response, dk.sendRequest()
 *
 * - dk.request: Frozen object with the current request's method, url, headers, body
 * - dk.response: Frozen object with status, headers, body, json() (post-response only)
 * - dk.sendRequest(): Async HTTP client for making sub-requests from scripts
 */
import * as http from 'http';
import * as https from 'https';
import type { ScriptProvider, SubRequestEntry } from '../types';

export const requestProvider: ScriptProvider = {
  id: 'core:request',
  name: 'HTTP Request/Response',
  description: 'dk.request, dk.response, dk.sendRequest() — access HTTP data and make sub-requests',
  priority: 100,

  activate(ctx) {
    const { scriptContext, addSubRequest } = ctx;

    // Build frozen response object with json() helper
    const responseObj = scriptContext.response
      ? Object.freeze({
          ...scriptContext.response,
          json: () => {
            try { return JSON.parse(scriptContext.response!.body); }
            catch { return null; }
          },
        })
      : undefined;

    // dk.sendRequest — async HTTP from scripts (runs in-process, no child process needed)
    const sendRequest = async (opts: { method?: string; url: string; headers?: Record<string, string>; body?: string }) => {
      const method = (opts.method || 'GET').toUpperCase();
      const url = opts.url.match(/^https?:\/\//) ? opts.url : 'http://' + opts.url;
      const headers = opts.headers || {};
      const body = opts.body || '';
      const reqStartTime = Date.now();

      try {
        const parsed = await new Promise<{ status: number; statusText: string; headers: Record<string, string>; body: string }>((resolve, reject) => {
          const urlObj = new URL(url);
          const isHttps = urlObj.protocol === 'https:';
          const transport = isHttps ? https : http;

          const reqOpts: http.RequestOptions = {
            hostname: urlObj.hostname === 'localhost' ? '127.0.0.1' : urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method,
            headers,
            timeout: 10000,
          };

          const req = transport.request(reqOpts, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              const hdrs: Record<string, string> = {};
              for (const [k, v] of Object.entries(res.headers)) {
                if (v) hdrs[k] = Array.isArray(v) ? v.join(', ') : v;
              }
              resolve({ status: res.statusCode || 0, statusText: res.statusMessage || '', headers: hdrs, body: data });
            });
          });

          req.on('error', (e) => {
            reject(e);
          });

          req.on('timeout', () => {
            req.destroy(new Error('Request timed out after 10000ms'));
          });

          if (body) req.write(body);
          req.end();
        });

        const duration = Date.now() - reqStartTime;
        const respBody = (parsed.body || '').slice(0, 50000);

        const entry: SubRequestEntry = {
          method, url, status: parsed.status || 0, statusText: parsed.statusText || '',
          duration, timestamp: reqStartTime,
          requestHeaders: headers, requestBody: body || undefined,
          responseHeaders: parsed.headers || {}, responseBody: respBody || undefined,
        };
        addSubRequest(entry);

        return {
          status: parsed.status || 0,
          statusText: parsed.statusText || '',
          headers: parsed.headers || {},
          body: parsed.body || '',
          json: () => { try { return JSON.parse(parsed.body); } catch { return null; } },
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const duration = Date.now() - reqStartTime;
        const entry: SubRequestEntry = {
          method, url, status: 0, statusText: msg, duration, timestamp: reqStartTime,
          requestHeaders: headers, requestBody: body || undefined,
          responseHeaders: {}, responseBody: undefined,
        };
        addSubRequest(entry);
        return { status: 0, statusText: msg, headers: {}, body: '', json: () => null };
      }
    };

    // Build a Headers-like Proxy so scripts can use both indexing AND methods:
    //   dk.request.headers["Authorization"]       — direct key access
    //   dk.request.headers.set("Authorization", …) — Headers API style
    //   dk.request.headers.get("Authorization")
    //   dk.request.headers.has("Authorization")
    //   dk.request.headers.delete("Authorization")
    //   dk.request.headers.add({ key: "…", value: "…" }) — Postman-compat
    //   dk.request.headers.upsert({ key: "…", value: "…" })
    //   dk.request.headers.remove("…")
    //   dk.request.headers.each((k, v) => { … })
    //
    // All mutations write through to scriptContext.request.headers so the
    // request-handler can read them back after script execution.
    const rawHeaders = scriptContext.request.headers;
    const headersProxy = new Proxy(rawHeaders, {
      get(target, prop, receiver) {
        if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
        switch (prop) {
          case 'set':    return (k: string, v: string)                      => { target[k] = v; };
          case 'get':    return (k: string)                                  => target[k];
          case 'has':    return (k: string)                                  => k in target;
          case 'delete':
          case 'remove': return (k: string)                                  => { delete target[k]; return true; };
          case 'add':
          case 'upsert': return (entry: { key: string; value: string } | string, val?: string) => {
            if (typeof entry === 'string') { target[entry] = val ?? ''; }
            else { target[entry.key] = entry.value; }
          };
          case 'each': return (fn: (k: string, v: string) => void) => {
            for (const [k, v] of Object.entries(target)) fn(k, v);
          };
          case 'toObject': return () => ({ ...target });
          default: return Reflect.get(target, prop, receiver);
        }
      },
    });

    // dk.request — mutable (not frozen) so scripts can modify url/method/body too.
    // The underlying scriptContext.request fields are live references; mutations are
    // visible to the handler after runScript() returns.
    const requestProxy = {
      get method() { return scriptContext.request.method; },
      set method(v: string) { scriptContext.request.method = v; },
      get url() { return scriptContext.request.url; },
      set url(v: string) { scriptContext.request.url = v; },
      get body() { return scriptContext.request.body; },
      set body(v: string) { scriptContext.request.body = v; },
      headers: headersProxy,
    };

    return {
      dk: {
        request: requestProxy,
        response: responseObj,
        sendRequest,
      },
    };
  },
};
