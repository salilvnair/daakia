/**
 * Request execution handler — pre/post scripts, OAuth2, cookies, history saving.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { executeRequest } from '../../../http/request-executor';
import { type ScriptContext } from '../../../services/script-runtime';
import { getOAuth2Token, type OAuth2Config } from '../../../services/oauth2';
import {
  insertHistory, trimHistory,
  getAllEnvironments, upsertEnvironment,
  getCollectionData, updateCollectionData,
  getSetting, setSetting, getCookies, upsertCookie,
  insertUiAudit,
} from '../../../storage/db';
import { decryptIfNeeded, encryptEnvVariables } from '../../../services/vault';
import { resolveExecutionSettings, type ExecutionSettings } from '../../../services/execution-settings';
import { collectionSettings } from '../../../services/collection-settings';
import { globalSettings, settingsForRequest } from '../../../services/resolve-request-settings';
import {
  loadScriptEnvVars, loadCollectionVars, loadGlobalVars, persistScriptVars,
} from './script-vars';
import { runPhase, debugFor } from './script-phase';
import { afterScript } from '../../../services/template/after-script';
import { historyCap } from '../../../services/history-cap';

type PostMessage = (msg: unknown) => void;
type RefreshFn = () => void;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

export async function handleExecuteRequest(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
  refreshEnvironments: RefreshFn,
  refreshHistory: RefreshFn,
) {
  try {
    // Resolve execution settings across the three levels — see
    // services/execution-settings.ts for why they inherit per field.
    const resolved = settingsForRequest(msg);

    msg.timeout = resolved.timeout;
    msg.followRedirects = resolved.followRedirects;
    msg.sslVerification = resolved.sslVerification;
    msg.encoding = resolved.encoding;
    if (resolved.proxy) msg.proxy = resolved.proxy;
    // Carried so the response can say which level each value came from,
    // rather than leaving you to guess why one request timed out at 5s.
    msg.settingsFrom = resolved.from;

    // Inject trusted SSL hosts
    const trustedHosts = getSetting<string[]>('trustedHosts') ?? [];
    msg.trustedHosts = trustedHosts;

    // Cookie jar: inject stored cookies for the request domain
    try {
      const url = new URL((msg.url as string).match(/^https?:\/\//) ? msg.url as string : 'http://' + msg.url);
      const domain = url.hostname;
      const storedCookies = getCookies(domain);
      if (storedCookies.length > 0) {
        const cookieStr = storedCookies.map(c => `${c.name}=${c.value}`).join('; ');
        const headers = msg.headers as { key: string; value: string }[] ?? [];
        const existing = headers.find(h => h.key.toLowerCase() === 'cookie');
        if (existing) {
          existing.value = existing.value ? `${existing.value}; ${cookieStr}` : cookieStr;
        } else {
          headers.push({ key: 'Cookie', value: cookieStr });
        }
        msg.headers = headers;
      }
    } catch { /* ignore invalid URLs */ }

    // ── Pre-request scripts (collection-level then request-level) ──
    const preScripts = (msg.preRequestScripts as string[]) || [];
    const scriptLogs: string[] = [];
    const scriptErrors: string[] = [];
    const consoleLogs: { level: string; args: unknown[]; timestamp: number; scriptPhase?: string }[] = [];
    const scriptSubRequests: { method: string; url: string; status: number; statusText: string; duration: number; timestamp: number; phase: string }[] = [];

    // Send progress: pre-request script stage
    postMessage({ type: 'requestProgress', tabId: msg.tabId, stage: 'pre-request-script', status: preScripts.length > 0 ? 'running' : 'skipped' });


    // Load environment variables for script context
    const envVarsForScript = loadScriptEnvVars(msg.envId as string | undefined);
    const colVarsForScript = loadCollectionVars(msg.collectionId as string | undefined);
    const globalVarsForScript = loadGlobalVars();
    const schemasForScript = loadCollectionSchemas(msg.collectionId as string | undefined);

    if (preScripts.length > 0) {
      const headersObj: Record<string, string> = {};
      for (const h of (msg.headers as { key: string; value: string }[] || [])) {
        if (h.key) headersObj[h.key] = h.value;
      }

      const scriptCtx: ScriptContext = {
        request: {
          method: msg.method as string,
          url: msg.url as string,
          headers: headersObj,
          body: (msg.bodyRaw as string) || '',
        },
        environmentVariables: { ...envVarsForScript },
        collectionVariables: { ...colVarsForScript },
        schemas: schemasForScript,
        globalVariables: { ...globalVarsForScript },
      };

      for (let i = 0; i < preScripts.length; i++) {
        /*
          Only the LAST script is debuggable.

          Collection-level scripts run first and the reader's breakpoints were
          set in the request's own editor, so pausing inside a collection
          script would stop on line numbers that belong to a different file.
        */
        const isLastScript = i === preScripts.length - 1;
        const dbg = isLastScript
          ? debugFor(msg, 'pre-request', postMessage, msg.tabId as string)
          : undefined;

        const pre = await runPhase(preScripts[i], scriptCtx, 'pre-request', dbg);
        scriptLogs.push(...pre.logs);
        scriptErrors.push(...pre.errors);
        consoleLogs.push(...pre.consoleLogs);
        scriptSubRequests.push(...pre.subRequests as typeof scriptSubRequests);

        if (!pre.ok) {
          // A reader who pressed stop has not hit an error — say nothing.
          if (pre.stopped) {
            postMessage({ type: 'requestAborted', tabId: msg.tabId });
            return;
          }
          postMessage({
            type: 'requestError', tabId: msg.tabId,
            error: `Pre-request script failed: ${pre.errors.join('; ')}`,
            scriptLogs, scriptErrors, consoleLogs,
          });
          return;
        }
      }

      // Persist variable changes from pre-request scripts
      persistScriptVars(
        msg.envId as string | undefined,
        msg.collectionId as string | undefined,
        scriptCtx.environmentVariables,
        scriptCtx.collectionVariables,
        scriptCtx.globalVariables,
        envVarsForScript,
        colVarsForScript,
        globalVarsForScript,
        postMessage,
        refreshEnvironments,
      );

      // Sync header mutations from pre-request scripts back to msg.headers so
      // executeRequest() picks them up. headersObj is the same reference that
      // dk.request.headers proxy mutates, so it reflects all .set()/.delete() calls.
      msg.headers = Object.entries(headersObj).map(([key, value]) => ({ key, value }));

      /*
        ── And now resolve what the script just set ──

        The webview renders the request before it posts it, so a variable the
        script creates is created after everything that could have used it was
        already substituted. `{{bearer-token}}` in the Auth tab never worked on
        the first run and worked on the second, which is the worst shape a bug
        can have.

        An unresolved variable survives that first pass as its literal
        `{{name}}`, so it is still here to fill in. Anything the webview could
        already resolve is a value by now and cannot be touched — this only
        ever completes what was genuinely missing.

        Every place a variable is allowed: the URL, the headers, the body, the
        query, and the auth data the Auth tab builds.
      */
      const finish = afterScript({
        collection: scriptCtx.collectionVariables,
        env: scriptCtx.environmentVariables,
        secret: scriptCtx.secretVariables,
        global: scriptCtx.globalVariables,
      }, {
        method: String(msg.method ?? 'GET'),
        url: String(msg.url ?? ''),
        headers: msg.headers as { key: string; value: string }[],
        body: String(msg.bodyRaw ?? ''),
      });
      msg.url = finish.str(String(msg.url ?? ''));
      msg.headers = finish.rows(msg.headers as { key: string; value: string }[]);
      msg.params = finish.rows(msg.params as { key: string; value: string }[]);
      msg.bodyRaw = finish.str(String(msg.bodyRaw ?? ''));
      msg.bodyUrlEncoded = finish.rows(msg.bodyUrlEncoded as { key: string; value: string }[]);
      msg.bodyFormData = finish.rows(msg.bodyFormData as { key: string; value: string }[]);
      msg.authData = finish.fields(msg.authData as Record<string, unknown> | undefined);

      // Sync url/method/body mutations (scripts can reassign dk.request.url etc.)
      if (scriptCtx.request.url !== (msg.url as string)) {
        msg.url = scriptCtx.request.url;
      }
      if (scriptCtx.request.method !== (msg.method as string)) {
        msg.method = scriptCtx.request.method;
      }
    }

    // Send progress: pre-request script done, rendering request
    postMessage({ type: 'requestProgress', tabId: msg.tabId, stage: 'pre-request-script', status: 'done' });
    postMessage({ type: 'requestProgress', tabId: msg.tabId, stage: 'rendering-request', status: 'done' });
    postMessage({ type: 'requestProgress', tabId: msg.tabId, stage: 'sending-request', status: 'running' });

    let result = await executeRequest(msg as any);

    // ── SSL Trust Prompt — if request failed due to SSL, offer to trust the host ──
    if (result.response.status === 0 && result.response.errorDetail) {
      const errCode = result.response.errorDetail.code;
      const sslCodes = ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'SSL_ERROR'];
      if (sslCodes.includes(errCode)) {
        try {
          const reqUrl = new URL((msg.url as string).match(/^https?:\/\//) ? msg.url as string : 'https://' + msg.url);
          const host = reqUrl.hostname;
          const existingTrusted = getSetting<string[]>('trustedHosts') ?? [];
          if (!existingTrusted.includes(host)) {
            const choice = await vscode.window.showWarningMessage(
              `SSL certificate for "${host}" is not trusted (${errCode}). Do you want to trust this host?`,
              'Trust & Retry',
              'Cancel',
            );
            if (choice === 'Trust & Retry') {
              existingTrusted.push(host);
              setSetting('trustedHosts', existingTrusted);
              // Re-execute with host now trusted
              msg.trustedHosts = existingTrusted;
              const retryResult = await executeRequest(msg as any);
              // Replace result reference for remaining flow
              Object.assign(result, retryResult);
            }
          }
        } catch { /* ignore URL parse errors */ }
      }
    }

    // ── Post-response scripts (collection-level then request-level) ──
    const postResponseScripts = (msg.postResponseScripts as string[]) || [];
    let allTestResults: { name: string; passed: boolean; error?: string }[] = [];

    if (postResponseScripts.length > 0) {
      const headersObj: Record<string, string> = {};
      for (const h of (msg.headers as { key: string; value: string }[] || [])) {
        if (h.key) headersObj[h.key] = h.value;
      }

      const scriptCtx: ScriptContext = {
        request: {
          method: msg.method as string,
          url: msg.url as string,
          headers: headersObj,
          body: (msg.bodyRaw as string) || '',
        },
        response: {
          status: result.response.status,
          statusText: result.response.statusText,
          headers: result.response.headers,
          body: result.response.body,
          time: result.response.time,
          size: result.response.size,
        },
        environmentVariables: { ...envVarsForScript },
        collectionVariables: { ...colVarsForScript },
        schemas: schemasForScript,
        globalVariables: { ...globalVarsForScript },
      };

      for (let i = 0; i < postResponseScripts.length; i++) {
        const isLastScript = i === postResponseScripts.length - 1;
        const dbg = isLastScript
          ? debugFor(msg, 'post-response', postMessage, msg.tabId as string)
          : undefined;

        const post = await runPhase(postResponseScripts[i], scriptCtx, 'post-response', dbg);

        /*
          Stopping here keeps the response.

          Unlike the pre-request phase, the request has already been sent and
          answered by now — throwing that away because the reader stepped out
          of a test script would lose the thing they were testing.
        */
        if (post.stopped) break;

        scriptLogs.push(...post.logs);
        scriptErrors.push(...post.errors);
        consoleLogs.push(...post.consoleLogs);
        scriptSubRequests.push(...post.subRequests as typeof scriptSubRequests);
        allTestResults.push(...post.testResults);
      }

      // Persist variable changes from post-response scripts
      persistScriptVars(
        msg.envId as string | undefined,
        msg.collectionId as string | undefined,
        scriptCtx.environmentVariables,
        scriptCtx.collectionVariables,
        scriptCtx.globalVariables,
        envVarsForScript,
        colVarsForScript,
        globalVarsForScript,
        postMessage,
        refreshEnvironments,
      );
    }

    // Build request metadata for DevTools Network tab — use actual headers sent by executor
    const sentHeaders: Record<string, string> = result.requestHeaders || {};

    // Build request body summary for DevTools (file details for multipart, raw body otherwise)
    let requestBodyForDevTools: string | undefined = (msg.bodyRaw as string) || undefined;
    if (msg.bodyMode === 'form-data' && Array.isArray(msg.bodyFormData)) {
      const formSummary = (msg.bodyFormData as any[])
        .filter((f: any) => f.key)
        .map((f: any) => {
          if (f.type === 'file' && (f.filePaths?.length || f.files?.length)) {
            const fileNames = f.files || f.filePaths?.map((p: string) => p.split(/[\\/]/).pop()) || [];
            const mimeTypes = f.fileMimeTypes || [];
            return fileNames.map((name: string, i: number) => {
              const mime = mimeTypes[i] || 'application/octet-stream';
              const filePath = f.filePaths?.[i] || '';
              let size = '';
              let fileExists = false;
              try { if (filePath && fs.existsSync(filePath)) { fileExists = true; size = ` (${formatBytes(fs.statSync(filePath).size)})`; } } catch { /* ignore */ }
              return `[file] ${f.key}: ${name} [${mime}]${size}${fileExists ? ` {${filePath}}` : ''}`;
            }).join('\n');
          }
          return `${f.key}: ${f.value}`;
        }).join('\n');
      requestBodyForDevTools = formSummary;
    }

    // 7.7 — Perf: cap body sent to webview at 512 KB to keep postMessage fast
    const MAX_BODY_CHARS = 512 * 1024;
    const rawBody: string = result.response?.body ?? '';
    const bodyTruncated = rawBody.length > MAX_BODY_CHARS;
    const safeResult = bodyTruncated
      ? { ...result, response: { ...result.response, body: rawBody.slice(0, MAX_BODY_CHARS) + '\n\n[... truncated — response exceeds 512 KB display limit ...]', bodyTruncated: true, fullSize: rawBody.length } }
      : result;

    postMessage({
      type: 'responseData',
      ...safeResult,
      requestMethod: msg.method,
      requestUrl: msg.url,
      requestHeaders: sentHeaders,
      requestBody: requestBodyForDevTools,
      scriptLogs: scriptLogs.length > 0 ? scriptLogs : undefined,
      scriptErrors: scriptErrors.length > 0 ? scriptErrors : undefined,
      testResults: allTestResults.length > 0 ? allTestResults : undefined,
      consoleLogs: consoleLogs.length > 0 ? consoleLogs : undefined,
      scriptSubRequests: scriptSubRequests.length > 0 ? scriptSubRequests : undefined,
    });

    // Cookie jar: store response cookies
    if (result.response.cookies && result.response.cookies.length > 0) {
      try {
        const url = new URL((msg.url as string).match(/^https?:\/\//) ? msg.url as string : 'http://' + msg.url);
        for (const cookie of result.response.cookies) {
          upsertCookie({
            domain: cookie.domain || url.hostname,
            path: cookie.path || '/',
            name: cookie.name,
            value: cookie.value,
            expires: cookie.expires,
            http_only: cookie.httpOnly ? 1 : 0,
            secure: cookie.secure ? 1 : 0,
            same_site: cookie.sameSite,
          });
        }
      } catch { /* ignore */ }
    }

    if (msg.downloadResponse) {
      const dispositionFilename = parseContentDispositionFilename(result.response.headers['content-disposition'] || result.response.headers['Content-Disposition'] || '');
      const ext = guessResponseExtension(result.response.contentType, dispositionFilename);
      const defaultName = dispositionFilename || `response.${ext}`;
      const saveUri = await vscode.window.showSaveDialog({
        saveLabel: 'Save response',
        defaultUri: vscode.Uri.file(defaultName),
        filters: buildResponseFilters(result.response.contentType, ext),
      });
      if (saveUri) {
        const fileBuffer = result.response.bodyEncoding === 'base64'
          ? Buffer.from(result.response.body, 'base64')
          : Buffer.from(result.response.body, 'utf8');
        fs.writeFileSync(saveUri.fsPath, fileBuffer);
        postMessage({ type: 'toast', toastType: 'success', message: `Response saved to ${path.basename(saveUri.fsPath)}` });
      }
    }

    // Save to history
    const saveResponse = resolved.saveResponseInHistory;
    // Strip fileData from bodyFormData — never store binary data in DB, only file paths
    const bodyFormDataForHistory = (msg.bodyFormData as any[])?.map((f: any) => {
      const { fileData, ...rest } = f;
      return rest;
    }) || [];
    insertHistory({
      request_id: msg.tabId as string,
      method: msg.method as string,
      url: msg.url as string,
      status: result.response.status,
      status_text: result.response.statusText,
      response_time: result.response.time,
      response_size: result.response.size,
      protocol: (msg.protocol as string) || 'rest',
      request_data: JSON.stringify({
        headers: msg.headers,
        body: msg.bodyRaw,
        bodyMode: msg.bodyMode,
        bodyContentType: msg.bodyContentType,
        params: msg.params,
        authType: msg.authType,
        authData: msg.authData,
        variables: msg.variables,
        bodyFormData: bodyFormDataForHistory,
        bodyUrlEncoded: msg.bodyUrlEncoded,
        preRequestScript: msg.preRequestScript,
        postResponseScript: msg.postResponseScript,
      }),
      response_data: saveResponse
        ? JSON.stringify({ headers: result.response.headers, body: result.response.body.slice(0, 50000), contentType: result.response.contentType })
        : undefined,
    });

    /*
      Trim history to the configured cap. Global-only — history is one shared
      table, so a per-request cap on it would not mean anything.

      The number is two thousand, raised from five hundred when History became
      searchable: a cap is a trade between what the table costs and what it can
      answer, and the filter moved that line. `historyCap()` is where it lives,
      because the other eleven trim sites used to disagree with this one.
    */
    trimHistory(historyCap());

    // Push updated history to webview
    refreshHistory();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const code = (err as any).code || '';
    const cause = (err as any).cause?.message || (err as any).cause?.code || '';
    const detail = code ? `[${code}] ${message}` : message;
    const fullError = cause ? `${detail} (cause: ${cause})` : detail;

    console.error('[REST Request Error]', {
      method: msg.method,
      url: msg.url,
      error: fullError,
      stack,
      code,
      cause,
    });

    postMessage({ type: 'requestError', tabId: msg.tabId, error: fullError });

    // Save failed request to history
    try {
      const bodyFormDataForErrorHistory = (msg.bodyFormData as any[])?.map((f: any) => {
        const { fileData, ...rest } = f;
        return rest;
      }) || [];
      insertHistory({
        request_id: msg.tabId as string,
        method: msg.method as string,
        url: msg.url as string,
        status: 0,
        status_text: fullError,
        response_time: 0,
        response_size: 0,
        protocol: (msg.protocol as string) || 'rest',
        request_data: JSON.stringify({
          headers: msg.headers,
          body: msg.bodyRaw,
          bodyMode: msg.bodyMode,
          bodyContentType: msg.bodyContentType,
          params: msg.params,
          authType: msg.authType,
          authData: msg.authData,
          variables: msg.variables,
          bodyFormData: bodyFormDataForErrorHistory,
          bodyUrlEncoded: msg.bodyUrlEncoded,
          preRequestScript: msg.preRequestScript,
          postResponseScript: msg.postResponseScript,
        }),
      });
      trimHistory(historyCap());
      refreshHistory();
    } catch { /* ignore history errors */ }
  }
}

// ────────────────── OAuth2 ──────────────────

export async function handleGetOAuth2Token(msg: Record<string, unknown>, postMessage: PostMessage) {
  const tabId = msg.tabId as string;
  const config = msg.config as OAuth2Config;

  if (!config || !config.tokenUrl || !config.clientId) {
    postMessage({ type: 'oauth2TokenResult', tabId, success: false, error: 'Token URL and Client ID are required' });
    return;
  }

  try {
    const result = await getOAuth2Token(config);
    postMessage({ type: 'oauth2TokenResult', tabId, ...result });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    postMessage({ type: 'oauth2TokenResult', tabId, success: false, error });
  }
}

// ────────────────── Script Variable Helpers ──────────────────

function loadCollectionSchemas(collectionId: string | undefined): Record<string, unknown> | undefined {
  if (!collectionId) return undefined;
  try {
    const props = JSON.parse(getCollectionData(collectionId)) as { schemas?: Record<string, unknown> };
    return props.schemas && Object.keys(props.schemas).length > 0 ? props.schemas : undefined;
  } catch {
    return undefined;
  }
}


// ────────────────── Response Helpers ──────────────────

export function parseContentDispositionFilename(header: string): string {
  if (!header) return '';
  // filename*=UTF-8''encoded%20name.ext  (RFC 5987 extended notation)
  const extMatch = header.match(/filename\*\s*=\s*(?:[^']*'')?([^;\s]+)/i);
  if (extMatch) {
    try { return decodeURIComponent(extMatch[1]); } catch { /* fall through */ }
  }
  // filename="name.ext" or filename=name.ext
  const simpleMatch = header.match(/filename\s*=\s*"?([^";\r\n]+)"?/i);
  if (simpleMatch) return simpleMatch[1].trim();
  return '';
}

export function guessResponseExtension(contentType: string, dispositionFilename?: string): string {
  // If server gave us a filename, trust its extension
  if (dispositionFilename) {
    const dotIdx = dispositionFilename.lastIndexOf('.');
    if (dotIdx >= 0) return dispositionFilename.slice(dotIdx + 1).toLowerCase();
  }
  const ct = contentType.toLowerCase().split(';')[0].trim();
  if (ct.includes('json')) return 'json';
  if (ct.includes('html')) return 'html';
  if (ct === 'application/xml' || ct === 'text/xml' || ct.includes('soap+xml')) return 'xml';
  if (ct.includes('javascript')) return 'js';
  if (ct.includes('csv')) return 'csv';
  if (ct === 'application/pdf') return 'pdf';
  if (ct === 'application/zip' || ct === 'application/x-zip-compressed') return 'zip';
  if (ct === 'application/gzip') return 'gz';
  if (ct === 'application/x-tar') return 'tar';
  if (ct === 'application/x-7z-compressed') return '7z';
  if (ct === 'application/x-rar-compressed') return 'rar';
  if (ct === 'application/msword') return 'doc';
  if (ct === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (ct === 'application/vnd.ms-excel') return 'xls';
  if (ct === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (ct === 'application/vnd.ms-powerpoint') return 'ppt';
  if (ct === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (ct === 'image/png') return 'png';
  if (ct === 'image/jpeg' || ct === 'image/jpg') return 'jpg';
  if (ct === 'image/gif') return 'gif';
  if (ct === 'image/webp') return 'webp';
  if (ct === 'image/svg+xml') return 'svg';
  if (ct.startsWith('image/')) return 'bin';
  if (ct === 'application/octet-stream') return 'bin';
  if (ct === 'text/plain') return 'txt';
  return 'bin';
}

export function buildResponseFilters(contentType: string, ext?: string): Record<string, string[]> {
  const resolvedExt = ext ?? guessResponseExtension(contentType);
  return { 'Response Files': [resolvedExt], 'All Files': ['*'] };
}


/**
 * What a request would inherit if it overrode nothing.
 *
 * The editor needs this to label its Inherit options with the value they
 * resolve to. It is computed here rather than in the webview so there is one
 * implementation of the resolution: a second one in the UI could disagree with
 * the real one, and a settings screen that misreports the effective value is
 * worse than a screen that reports nothing.
 */
export function handleGetEffectiveSettings(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  // A request's Settings tab inherits global + its collection; a collection's
  // own tab inherits global only, so it is not shown its own values as though
  // they came from somewhere else.
  const scope = msg.scope as 'request' | 'collection' | undefined;
  const collection = scope === 'collection'
    ? undefined
    : collectionSettings(msg.collectionId as string | undefined);

  const { from, ...values } = resolveExecutionSettings(globalSettings(), collection);
  postMessage({
    type: 'settings:effective',
    scope,
    tabId: msg.tabId,
    collectionId: msg.collectionId,
    values,
    from,
  });
}
