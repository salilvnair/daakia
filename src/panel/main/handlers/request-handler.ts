/**
 * Request execution handler — pre/post scripts, OAuth2, cookies, history saving.
 */
import * as vscode from 'vscode';
import { executeRequest } from '../../../http/request-executor';
import { runScript, type ScriptContext } from '../../../services/script-runtime';
import { DebugSession } from '../../../services/debugger';
import { getOAuth2Token, type OAuth2Config } from '../../../services/oauth2';
import {
  insertHistory, trimHistory,
  getAllEnvironments, upsertEnvironment,
  getCollectionData, updateCollectionData,
  getSetting, setSetting, getCookies, upsertCookie,
} from '../../../storage/db';

type PostMessage = (msg: unknown) => void;
type RefreshFn = () => void;

export async function handleExecuteRequest(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
  refreshEnvironments: RefreshFn,
  refreshHistory: RefreshFn,
) {
  try {
    // Inject execution settings — prefer app_settings DB, fallback to VS Code workspace config
    const settings = getSetting<Record<string, unknown>>('general') ?? {};
    const vsConfig = vscode.workspace.getConfiguration('daakia');

    msg.timeout = settings.timeout ?? vsConfig.get<number>('requestTimeout', 30000);
    msg.followRedirects = settings.followRedirects ?? vsConfig.get<boolean>('followRedirects', true);
    msg.sslVerification = settings.sslVerification ?? vsConfig.get<boolean>('sslVerification', true);

    // Inject trusted SSL hosts
    const trustedHosts = getSetting<string[]>('trustedHosts') ?? [];
    msg.trustedHosts = trustedHosts;

    // Inject proxy settings
    const proxySettings = (settings as any).proxy as { mode: string; host?: string; port?: number; username?: string; password?: string; bypass?: string[] } | undefined;
    if (proxySettings) {
      msg.proxy = proxySettings;
    }

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

    // Debug breakpoints from webview
    const debugBreakpoints = msg.debugBreakpoints as { preRequest?: number[]; postResponse?: number[]; preRequestConditions?: Record<number, string>; postResponseConditions?: Record<number, string> } | undefined;
    const hasPreBps = debugBreakpoints?.preRequest && debugBreakpoints.preRequest.length > 0;

    // Load environment variables for script context
    const envVarsForScript = loadEnvironmentVarsForScript(msg.envId as string | undefined);
    const colVarsForScript = loadCollectionVarsForScript(msg.collectionId as string | undefined);
    const globalVarsForScript = loadGlobalVarsForScript();

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
        globalVariables: { ...globalVarsForScript },
      };

      for (let i = 0; i < preScripts.length; i++) {
        const script = preScripts[i];
        const isLastScript = i === preScripts.length - 1;
        const useDebugger = isLastScript && hasPreBps;

        if (useDebugger) {
          // Run through DebugSession (async, pauses at breakpoints)
          postMessage({ type: 'scriptDebug:started', tabId: msg.tabId, phase: 'pre-request' });

          const result = await new Promise<import('../../../services/script-runtime').ScriptResult>((resolve) => {
            const session = new DebugSession({
              onPaused: (state) => { postMessage({ type: 'scriptDebug:paused', tabId: msg.tabId, ...state }); },
              onResumed: () => { postMessage({ type: 'scriptDebug:resumed', tabId: msg.tabId }); },
              onCompleted: (r) => { resolve(r); },
              onError: (message) => {
                postMessage({ type: 'scriptDebug:error', tabId: msg.tabId, message });
                resolve({ success: false, logs: [], errors: [message], structuredLogs: [], updatedEnvironmentVars: scriptCtx.environmentVariables, updatedCollectionVars: scriptCtx.collectionVariables, updatedGlobalVars: scriptCtx.globalVariables, updatedSecretVars: scriptCtx.secretVariables || {}, testResults: [], subRequests: [], duration: 0 });
              },
              onLog: (entry) => { postMessage({ type: 'scriptDebug:log', tabId: msg.tabId, entry }); },
              onSubRequest: (entry) => { postMessage({ type: 'scriptDebug:subRequest', tabId: msg.tabId, entry, phase: 'pre-request' }); },
            }, 'pre-request');
            session.setBreakpoints(debugBreakpoints!.preRequest!);
            if (debugBreakpoints!.preRequestConditions) session.setConditions(debugBreakpoints!.preRequestConditions);

            // Store session for control messages
            (globalThis as any).__daakiaDebugSession = session;
            session.run(script, scriptCtx).then(resolve);
          });

          (globalThis as any).__daakiaDebugSession = null;
          postMessage({ type: 'scriptDebug:completed', tabId: msg.tabId });

          scriptLogs.push(...result.logs);
          scriptErrors.push(...result.errors);
          consoleLogs.push(...result.structuredLogs.map(l => ({ ...l, scriptPhase: 'pre-request' })));
          scriptSubRequests.push(...result.subRequests.map(r => ({ ...r, phase: 'pre-request' })));
          if (!result.success) {
            // Debug stopped by user — abort gracefully without error
            if (result.errors.includes('__DEBUG_STOPPED__')) {
              postMessage({ type: 'requestAborted', tabId: msg.tabId });
              return;
            }
            postMessage({ type: 'requestError', tabId: msg.tabId, error: `Pre-request script failed: ${result.errors.join('; ')}`, scriptLogs, scriptErrors, consoleLogs });
            return;
          }
          scriptCtx.environmentVariables = result.updatedEnvironmentVars;
          scriptCtx.collectionVariables = result.updatedCollectionVars;
          scriptCtx.globalVariables = result.updatedGlobalVars;
          scriptCtx.secretVariables = result.updatedSecretVars;
        } else {
          // Normal async execution
          const result = await runScript(script, scriptCtx);
          scriptLogs.push(...result.logs);
          scriptErrors.push(...result.errors);
          consoleLogs.push(...result.structuredLogs.map(l => ({ ...l, scriptPhase: 'pre-request' })));
          scriptSubRequests.push(...result.subRequests.map(r => ({ ...r, phase: 'pre-request' })));
          if (!result.success) {
            postMessage({ type: 'requestError', tabId: msg.tabId, error: `Pre-request script failed: ${result.errors.join('; ')}`, scriptLogs, scriptErrors, consoleLogs });
            return;
          }
          scriptCtx.environmentVariables = result.updatedEnvironmentVars;
          scriptCtx.collectionVariables = result.updatedCollectionVars;
          scriptCtx.globalVariables = result.updatedGlobalVars;
          scriptCtx.secretVariables = result.updatedSecretVars;
        }
      }

      // Persist variable changes from pre-request scripts
      persistScriptVarUpdates(
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
    const hasPostBps = debugBreakpoints?.postResponse && debugBreakpoints.postResponse.length > 0;

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
        globalVariables: { ...globalVarsForScript },
      };

      for (let i = 0; i < postResponseScripts.length; i++) {
        const script = postResponseScripts[i];
        const isLastScript = i === postResponseScripts.length - 1;
        const useDebugger = isLastScript && hasPostBps;

        if (useDebugger) {
          postMessage({ type: 'scriptDebug:started', tabId: msg.tabId, phase: 'post-response' });

          const debugResult = await new Promise<import('../../../services/script-runtime').ScriptResult>((resolve) => {
            const session = new DebugSession({
              onPaused: (state) => { postMessage({ type: 'scriptDebug:paused', tabId: msg.tabId, ...state }); },
              onResumed: () => { postMessage({ type: 'scriptDebug:resumed', tabId: msg.tabId }); },
              onCompleted: (r) => { resolve(r); },
              onError: (message) => {
                postMessage({ type: 'scriptDebug:error', tabId: msg.tabId, message });
                resolve({ success: false, logs: [], errors: [message], structuredLogs: [], updatedEnvironmentVars: scriptCtx.environmentVariables, updatedCollectionVars: scriptCtx.collectionVariables, updatedGlobalVars: scriptCtx.globalVariables, updatedSecretVars: scriptCtx.secretVariables || {}, testResults: [], subRequests: [], duration: 0 });
              },
              onLog: (entry) => { postMessage({ type: 'scriptDebug:log', tabId: msg.tabId, entry }); },
              onSubRequest: (entry) => { postMessage({ type: 'scriptDebug:subRequest', tabId: msg.tabId, entry, phase: 'post-response' }); },
            }, 'post-response');
            session.setBreakpoints(debugBreakpoints!.postResponse!);
            if (debugBreakpoints!.postResponseConditions) session.setConditions(debugBreakpoints!.postResponseConditions);
            (globalThis as any).__daakiaDebugSession = session;
            session.run(script, scriptCtx).then(resolve);
          });

          (globalThis as any).__daakiaDebugSession = null;
          postMessage({ type: 'scriptDebug:completed', tabId: msg.tabId });

          // Debug stopped by user — abort post-response gracefully
          if (!debugResult.success && debugResult.errors.includes('__DEBUG_STOPPED__')) {
            break; // Exit post-response script loop, continue to send whatever response we have
          }

          scriptLogs.push(...debugResult.logs);
          scriptErrors.push(...debugResult.errors);
          consoleLogs.push(...debugResult.structuredLogs.map(l => ({ ...l, scriptPhase: 'post-response' })));
          scriptSubRequests.push(...debugResult.subRequests.map(r => ({ ...r, phase: 'post-response' })));
          allTestResults.push(...debugResult.testResults);
          scriptCtx.environmentVariables = debugResult.updatedEnvironmentVars;
          scriptCtx.collectionVariables = debugResult.updatedCollectionVars;
          scriptCtx.globalVariables = debugResult.updatedGlobalVars;
          scriptCtx.secretVariables = debugResult.updatedSecretVars;
        } else {
          const testResult = await runScript(script, scriptCtx);
          scriptLogs.push(...testResult.logs);
          scriptErrors.push(...testResult.errors);
          consoleLogs.push(...testResult.structuredLogs.map(l => ({ ...l, scriptPhase: 'post-response' })));
          scriptSubRequests.push(...testResult.subRequests.map(r => ({ ...r, phase: 'post-response' })));
          allTestResults.push(...testResult.testResults);
          scriptCtx.environmentVariables = testResult.updatedEnvironmentVars;
          scriptCtx.collectionVariables = testResult.updatedCollectionVars;
          scriptCtx.globalVariables = testResult.updatedGlobalVars;
          scriptCtx.secretVariables = testResult.updatedSecretVars;
        }
      }

      // Persist variable changes from post-response scripts
      persistScriptVarUpdates(
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

    // Build request metadata for DevTools Network tab
    const sentHeaders: Record<string, string> = {};
    for (const h of (msg.headers as { key: string; value: string }[] || [])) {
      if (h.key) sentHeaders[h.key] = h.value;
    }

    postMessage({
      type: 'responseData',
      ...result,
      requestMethod: msg.method,
      requestUrl: msg.url,
      requestHeaders: sentHeaders,
      requestBody: (msg.bodyRaw as string) || undefined,
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
      const saveUri = await vscode.window.showSaveDialog({
        saveLabel: 'Save response',
        defaultUri: vscode.Uri.file(`response.${guessResponseExtension(result.response.contentType)}`),
        filters: buildResponseFilters(result.response.contentType),
      });
      if (saveUri) {
        fs.writeFileSync(saveUri.fsPath, result.response.body, 'utf8');
        postMessage({ type: 'toast', toastType: 'success', message: `Response saved to ${path.basename(saveUri.fsPath)}` });
      }
    }

    // Save to history
    const saveResponse = settings.saveResponseInHistory ?? true;
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
        params: msg.params,
        authType: msg.authType,
        authData: msg.authData,
        bodyFormData: msg.bodyFormData,
        bodyUrlEncoded: msg.bodyUrlEncoded,
        preRequestScript: msg.preRequestScript,
        postResponseScript: msg.postResponseScript,
      }),
      response_data: saveResponse
        ? JSON.stringify({ headers: result.response.headers, body: result.response.body.slice(0, 50000), contentType: result.response.contentType })
        : undefined,
    });

    // Trim history to configured max entries
    const maxEntries = (settings.maxHistoryEntries as number) || vsConfig.get<number>('maxHistoryEntries', 500) || 500;
    trimHistory(maxEntries);

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
          params: msg.params,
          authType: msg.authType,
          authData: msg.authData,
          bodyFormData: msg.bodyFormData,
          bodyUrlEncoded: msg.bodyUrlEncoded,
          preRequestScript: msg.preRequestScript,
          postResponseScript: msg.postResponseScript,
        }),
      });
      trimHistory(500);
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

function loadEnvironmentVarsForScript(envId: string | undefined): Record<string, string> {
  const rows = getAllEnvironments();
  const vars: Record<string, string> = {};

  // Global environment first (lowest priority)
  const globalRow = rows.find(r => r.name === 'Global' || r.id === 'global');
  if (globalRow) {
    const globalVars = JSON.parse(globalRow.variables || '[]') as { key: string; currentValue?: string; initialValue?: string; isSecret?: boolean }[];
    for (const v of globalVars) {
      if (v.key) vars[v.key] = v.currentValue ?? v.initialValue ?? '';
    }
  }

  // Active environment (overrides global)
  const activeRow = envId
    ? rows.find(r => r.id === envId)
    : rows.find(r => r.is_active === 1);

  if (activeRow && activeRow !== globalRow) {
    const activeVars = JSON.parse(activeRow.variables || '[]') as { key: string; currentValue?: string; initialValue?: string; isSecret?: boolean }[];
    for (const v of activeVars) {
      if (v.key) vars[v.key] = v.currentValue ?? v.initialValue ?? '';
    }
  }

  return vars;
}

function loadCollectionVarsForScript(collectionId: string | undefined): Record<string, string> {
  if (!collectionId) return {};
  const data = getCollectionData(collectionId);
  const props = JSON.parse(data) as { variables?: { key: string; value: string; enabled: boolean }[] };
  const vars: Record<string, string> = {};
  if (props.variables) {
    for (const v of props.variables) {
      if (v.enabled && v.key) vars[v.key] = v.value;
    }
  }
  return vars;
}

function loadGlobalVarsForScript(): Record<string, string> {
  return getSetting<Record<string, string>>('dk_globals') ?? {};
}

function persistScriptVarUpdates(
  envId: string | undefined,
  collectionId: string | undefined,
  updatedEnvVars: Record<string, string>,
  updatedColVars: Record<string, string>,
  updatedGlobalVars: Record<string, string>,
  originalEnvVars: Record<string, string>,
  originalColVars: Record<string, string>,
  originalGlobalVars: Record<string, string>,
  postMessage: PostMessage,
  refreshEnvironments: RefreshFn,
) {
  const envChanged = JSON.stringify(updatedEnvVars) !== JSON.stringify(originalEnvVars);
  if (envChanged) {
    const rows = getAllEnvironments();
    const activeRow = envId
      ? rows.find(r => r.id === envId)
      : rows.find(r => r.is_active === 1);

    if (activeRow) {
      const existingVars = JSON.parse(activeRow.variables || '[]') as { id: string; key: string; initialValue: string; currentValue: string; isSecret: boolean }[];
      for (const [key, value] of Object.entries(updatedEnvVars)) {
        const existing = existingVars.find(v => v.key === key);
        if (existing) {
          existing.currentValue = value;
        } else {
          existingVars.push({ id: crypto.randomUUID(), key, initialValue: '', currentValue: value, isSecret: false });
        }
      }
      upsertEnvironment({ id: activeRow.id, name: activeRow.name, variables: JSON.stringify(existingVars), is_active: activeRow.is_active });
      refreshEnvironments();
    }
  }

  const colChanged = JSON.stringify(updatedColVars) !== JSON.stringify(originalColVars);
  if (colChanged && collectionId) {
    const data = getCollectionData(collectionId);
    const props = JSON.parse(data) as { variables?: { key: string; value: string; enabled: boolean }[]; [k: string]: unknown };
    const existingVars = props.variables || [];

    for (const [key, value] of Object.entries(updatedColVars)) {
      const existing = existingVars.find(v => v.key === key);
      if (existing) {
        existing.value = value;
      } else {
        existingVars.push({ key, value, enabled: true });
      }
    }
    props.variables = existingVars;
    updateCollectionData(collectionId, JSON.stringify(props));
    postMessage({ type: 'collectionPropertiesData', id: collectionId, properties: props });
  }

  // Persist global variables & sync to Global environment so webview resolvers pick them up
  const globalsChanged = JSON.stringify(updatedGlobalVars) !== JSON.stringify(originalGlobalVars);
  if (globalsChanged) {
    setSetting('dk_globals', updatedGlobalVars);

    // Merge into Global environment row so {{var}} resolves in webview
    const rows = getAllEnvironments();
    const globalRow = rows.find(r => r.name === 'Global' || r.id === 'global');
    if (globalRow) {
      const existingVars = JSON.parse(globalRow.variables || '[]') as { id: string; key: string; initialValue: string; currentValue: string; isSecret: boolean }[];
      for (const [key, value] of Object.entries(updatedGlobalVars)) {
        const existing = existingVars.find(v => v.key === key);
        if (existing) {
          existing.currentValue = value;
        } else {
          existingVars.push({ id: crypto.randomUUID(), key, initialValue: '', currentValue: value, isSecret: false });
        }
      }
      upsertEnvironment({ id: globalRow.id, name: globalRow.name, variables: JSON.stringify(existingVars), is_active: globalRow.is_active });
      refreshEnvironments();
    }
  }
}

// ────────────────── Response Helpers ──────────────────

export function guessResponseExtension(contentType: string): string {
  if (contentType.includes('json')) { return 'json'; }
  if (contentType.includes('html')) { return 'html'; }
  if (contentType.includes('xml')) { return 'xml'; }
  if (contentType.includes('javascript')) { return 'js'; }
  if (contentType.includes('csv')) { return 'csv'; }
  if (contentType.includes('plain')) { return 'txt'; }
  return 'txt';
}

export function buildResponseFilters(contentType: string): Record<string, string[]> {
  const ext = guessResponseExtension(contentType);
  return { 'Response Files': [ext], 'All Files': ['*'] };
}

// Need fs/path for download
import * as path from 'path';
import * as fs from 'fs';
