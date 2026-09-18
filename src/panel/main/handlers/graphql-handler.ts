/**
 * GraphQL execution + introspection + subscription handler.
 */
import axios from 'axios';
import https from 'https';
import { type ProxyConfig } from '../../../services/proxy-config';
import { resolveProxyFor } from '../../../services/proxy-resolve';
import { settingsForRequest } from '../../../services/resolve-request-settings';
import type { ResolvedSettings } from '../../../services/execution-settings';
import { resolveTlsPolicy } from '../../../services/tls-policy';

/**
 * GraphQL posts through axios directly rather than through the REST executor,
 * so it needs the same proxy decision applied explicitly. Before this it
 * ignored the proxy setting entirely while REST honoured it — the same request
 * to the same host would take two different routes depending on which tab it
 * was sent from.
 */
function graphqlProxy(url: string, resolved?: ResolvedSettings) {
  const stored = (resolved ?? { proxy: undefined }).proxy
    ?? (getSetting<Record<string, unknown>>('general') ?? {}).proxy as ProxyConfig | undefined;
  return resolveProxyFor(stored, url);
}

/**
 * Same story for certificate verification: GraphQL verified unconditionally,
 * so `sslVerification: false` and the trusted-host list applied to REST and
 * were ignored here.
 */
function graphqlAgent(url: string, resolved?: ResolvedSettings): https.Agent | undefined {
  let hostname: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return undefined;
    hostname = parsed.hostname;
  } catch {
    return undefined;
  }
  // The resolved value when the caller has one, so a request or collection
  // that relaxes verification is honoured here too and not only in REST.
  const general = getSetting<Record<string, unknown>>('general') ?? {};
  const merged = resolved
    ? { ...general, sslVerification: resolved.sslVerification }
    : general;
  const policy = resolveTlsPolicy(hostname, merged);
  return policy.rejectUnauthorized ? undefined : new https.Agent({ rejectUnauthorized: false });
}
import WebSocket from 'ws';
import { loadEnvVars, resolveEnvString } from './env-resolver';
import { insertHistory, trimHistory, getSetting, getAllEnvironments, upsertEnvironment, getCollectionData, updateCollectionData, setSetting } from '../../../storage/db';
import { type ScriptContext } from '../../../services/script-runtime';
import { runPhase, debugFor } from './script-phase';
import { afterScript } from '../../../services/template/after-script';
import { decryptIfNeeded, decryptEnvVariables, encryptEnvVariables } from '../../../services/vault';
import {
  loadScriptEnvVars, loadCollectionVars, loadGlobalVars, persistScriptVars,
} from './script-vars';

type PostMessage = (msg: unknown) => void;

// Track active GraphQL HTTP requests for cancellation
const activeGqlControllers = new Map<string, AbortController>();

/** Cancel an in-flight GraphQL HTTP request */
export function cancelGraphQLRequest(tabId: string): void {
  const controller = activeGqlControllers.get(tabId);
  if (controller) {
    controller.abort();
    activeGqlControllers.delete(tabId);
  }
}

const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        kind
        name
        description
        fields(includeDeprecated: true) {
          name
          description
          args {
            name
            description
            type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
            defaultValue
          }
          type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
          isDeprecated
          deprecationReason
        }
        inputFields {
          name
          description
          type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
          defaultValue
        }
        interfaces { kind name ofType { kind name } }
        enumValues(includeDeprecated: true) {
          name
          description
          isDeprecated
          deprecationReason
        }
        possibleTypes { kind name }
      }
    }
  }
`;

/**
 * Connect to a GraphQL endpoint — runs introspection query and returns schema data.
 */
export async function handleGraphQLConnect(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const envId = msg.envId as string | undefined;
  const headers = msg.headers as { key: string; value: string }[] | undefined;

  // Resolve environment variables
  const vars = loadEnvVars(envId);
  const endpoint = resolveEnvString(msg.endpoint as string, vars);

  const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (headers) {
    for (const h of headers) {
      if (h.key) reqHeaders[resolveEnvString(h.key, vars)] = resolveEnvString(h.value, vars);
    }
  }

  // Introspection is a request like any other and goes the same route. It
  // used to resolve its proxy separately, which is how a schema could load
  // while the queries against it could not.
  const introspectionProxy = await graphqlProxy(endpoint);
  try {
    const res = await axios.post(
      endpoint,
      { query: INTROSPECTION_QUERY },
      { headers: reqHeaders, timeout: ((getSetting<Record<string, unknown>>('general') ?? {}).timeout as number | undefined) ?? 0, validateStatus: () => true, proxy: introspectionProxy.axiosProxy, httpsAgent: graphqlAgent(endpoint) },
    );

    if (res.status >= 400) {
      postMessage({ type: 'graphql:connectError', tabId, error: `HTTP ${res.status}: ${res.statusText}` });
      return;
    }

    const data = res.data?.data?.__schema;
    if (!data) {
      postMessage({ type: 'graphql:connectError', tabId, error: 'Invalid introspection response' });
      return;
    }

    // Build SDL from schema types
    const sdl = buildSDL(data);

    postMessage({
      type: 'graphql:connected',
      tabId,
      schema: JSON.stringify(data),
      sdl,
    });
  } catch (err: any) {
    console.error('[GraphQL Introspection Error]', { endpoint, error: err.message, code: err.code, stack: err.stack });
    const errorMsg = err.code === 'ECONNREFUSED'
      ? `Connection refused: ${endpoint}`
      : err.code === 'ENOTFOUND'
        ? `Host not found: ${endpoint}`
        : err.message || 'Connection failed';
    postMessage({ type: 'graphql:connectError', tabId, error: errorMsg });
  }
}

/** Build a simple SDL string from introspection schema */
function buildSDL(schema: any): string {
  const lines: string[] = [];
  const types = schema.types || [];

  for (const type of types) {
    if (type.name.startsWith('__')) continue;

    if (type.kind === 'OBJECT' && type.fields) {
      lines.push(`type ${type.name} {`);
      for (const field of type.fields) {
        const args = field.args?.length
          ? `(${field.args.map((a: any) => `${a.name}: ${formatType(a.type)}`).join(', ')})`
          : '';
        lines.push(`    ${field.name}${args}: ${formatType(field.type)}`);
      }
      lines.push(`}`);
      lines.push('');
    } else if (type.kind === 'INPUT_OBJECT' && type.inputFields) {
      lines.push(`input ${type.name} {`);
      for (const field of type.inputFields) {
        lines.push(`    ${field.name}: ${formatType(field.type)}`);
      }
      lines.push(`}`);
      lines.push('');
    } else if (type.kind === 'ENUM' && type.enumValues) {
      lines.push(`enum ${type.name} {`);
      for (const val of type.enumValues) {
        lines.push(`    ${val.name}`);
      }
      lines.push(`}`);
      lines.push('');
    } else if (type.kind === 'SCALAR') {
      // Skip built-in scalars
      if (!['String', 'Int', 'Float', 'Boolean', 'ID'].includes(type.name)) {
        lines.push(`scalar ${type.name}`);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function formatType(type: any): string {
  if (!type) return 'Unknown';
  if (type.kind === 'NON_NULL') return `${formatType(type.ofType)}!`;
  if (type.kind === 'LIST') return `[${formatType(type.ofType)}]`;
  return type.name || 'Unknown';
}

export async function handleExecuteGraphQL(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
  refreshHistory?: () => void,
) {
  const tabId = msg.tabId as string;
  const envId = msg.envId as string | undefined;
  const collectionId = msg.collectionId as string | undefined;
  const query = msg.query as string;
  let headers = (msg.headers as { key: string; value: string }[] | undefined) || [];
  let variablesRaw = msg.variables as string | undefined;
  const preRequestScript = (msg.preRequestScript as string) || '';
  const postResponseScript = (msg.postResponseScript as string) || '';

  // Resolve environment variables
  const vars = loadEnvVars(envId);
  /* Reassigned after the pre-request script — see the note there. */
  let endpoint = resolveEnvString(msg.endpoint as string, vars);

  // ── Pre-request script ──
  const scriptLogs: string[] = [];
  const scriptErrors: string[] = [];
  const consoleLogs: { level: string; args: unknown[]; timestamp: number; scriptPhase?: string }[] = [];

  const envVarsForScript = loadScriptEnvVars(envId);
  const colVarsForScript = loadCollectionVars(collectionId);
  const globalVarsForScript = loadGlobalVars();

  // Build mutable header map for script to modify
  const mutableHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  for (const h of headers) {
    if (h.key) mutableHeaders[resolveEnvString(h.key, vars)] = resolveEnvString(h.value, vars);
  }

  const scriptCtx: ScriptContext = {
    request: {
      method: 'POST',
      url: endpoint,
      headers: { ...mutableHeaders },
      body: query,
    },
    environmentVariables: { ...envVarsForScript },
    collectionVariables: { ...colVarsForScript },
    globalVariables: { ...globalVarsForScript },
  };

  if (preRequestScript.trim()) {
    postMessage({ type: 'requestProgress', tabId, stage: 'pre-request-script', status: 'running' });
    const pre = await runPhase(preRequestScript, scriptCtx, 'pre-request', debugFor(msg, 'pre-request', postMessage, tabId));
    scriptLogs.push(...pre.logs);
    scriptErrors.push(...pre.errors);
    consoleLogs.push(...pre.consoleLogs);

    if (pre.stopped) {
      // The reader pressed stop. Nothing failed, so nothing is reported.
      postMessage({ type: 'requestAborted', tabId });
      return;
    }

    if (!pre.ok) {
      postMessage({
        type: 'responseData',
        tabId,
        response: {
          status: 0,
          statusText: 'Script Error',
          headers: {},
          body: JSON.stringify({ errors: [{ message: `Pre-request script failed: ${pre.errors.join('; ')}` }] }),
          size: 0,
          time: 0,
          contentType: 'application/json',
          cookies: [],
        },
        scriptLogs,
        scriptErrors,
        consoleLogs: consoleLogs.length > 0 ? consoleLogs : undefined,
      });
      return;
    }

    // Persist env/col var changes from pre-request
    persistScriptVars(envId, collectionId, scriptCtx.environmentVariables, scriptCtx.collectionVariables, scriptCtx.globalVariables, envVarsForScript, colVarsForScript, globalVarsForScript, postMessage);

    /*
      Resolve again with what the script just set.

      The endpoint, the headers and the variables JSON were all rendered
      before this ran, so a token the script creates — `{{bearer-token}}` in a
      header — was still a template. An unresolved variable survives as its
      literal `{{name}}`, so it is here to fill in; anything already resolved
      is a value and cannot be touched. Same fix as the REST path.
    */
    const finish = afterScript(pre.layers, {
      method: 'POST', url: endpoint, headers, body: variablesRaw || query,
    });
    endpoint = finish.str(endpoint);
    headers = finish.rows(headers) ?? headers;
    if (variablesRaw) variablesRaw = finish.str(variablesRaw);

    postMessage({ type: 'requestProgress', tabId, stage: 'pre-request-script', status: 'done' });
  }

  // Parse variables JSON (resolve env vars in the raw string first)
  let variables: Record<string, unknown> | undefined;
  if (variablesRaw && variablesRaw.trim()) {
    try {
      variables = JSON.parse(resolveEnvString(variablesRaw, vars));
    } catch {
      postMessage({
        type: 'responseData',
        tabId,
        response: {
          status: 0,
          statusText: 'Error',
          headers: {},
          body: JSON.stringify({ errors: [{ message: 'Invalid variables JSON' }] }),
          size: 0,
          time: 0,
          contentType: 'application/json',
          cookies: [],
        },
      });
      return;
    }
  }

  const startTime = Date.now();
  const controller = new AbortController();
  activeGqlControllers.set(tabId, controller);
  // The same global → collection → request chain REST uses. Reading the global
  // settings straight out of the DB here is what made GraphQL and REST take
  // different routes to the same host.
  const resolved = settingsForRequest(msg);
  const gqlProxy = await graphqlProxy(endpoint, resolved);
  try {
    const res = await axios.post(
      endpoint,
      { query, variables },
      {
        headers: mutableHeaders,
        timeout: resolved.timeout,
        maxRedirects: resolved.followRedirects ? 10 : 0,
        validateStatus: () => true,
        transformResponse: [(data) => data], // Keep raw string
        signal: controller.signal,
        proxy: gqlProxy.axiosProxy,
        httpsAgent: graphqlAgent(endpoint, resolved),
      },
    );

    const elapsed = Date.now() - startTime;
    const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

    // ── Post-response script ──
    if (postResponseScript.trim()) {
      scriptCtx.response = {
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, String(v)])),
        body,
        time: elapsed,
        size: Buffer.byteLength(body, 'utf-8'),
      };

      const post = await runPhase(postResponseScript, scriptCtx, 'post-response', debugFor(msg, 'post-response', postMessage, tabId));
      scriptLogs.push(...post.logs);
      scriptErrors.push(...post.errors);
      consoleLogs.push(...post.consoleLogs);

      // Persist env/col var changes from post-response
      persistScriptVars(envId, collectionId, scriptCtx.environmentVariables, scriptCtx.collectionVariables, scriptCtx.globalVariables, envVarsForScript, colVarsForScript, globalVarsForScript, postMessage);
    }

    postMessage({
      type: 'responseData',
      tabId,
      requestMethod: 'POST',
      requestUrl: endpoint,
      requestHeaders: mutableHeaders,
      requestBody: JSON.stringify({ query, variables }, null, 2),
      scriptLogs: scriptLogs.length > 0 ? scriptLogs : undefined,
      scriptErrors: scriptErrors.length > 0 ? scriptErrors : undefined,
      consoleLogs: consoleLogs.length > 0 ? consoleLogs : undefined,
      response: {
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(
          Object.entries(res.headers).map(([k, v]) => [k, String(v)]),
        ),
        body,
        size: Buffer.byteLength(body, 'utf-8'),
        time: elapsed,
        contentType: res.headers['content-type'] || 'application/json',
        cookies: [],
      },
    });

    // Save to history
    const saveResponse = resolved.saveResponseInHistory;
    insertHistory({
      request_id: tabId,
      method: 'POST',
      url: endpoint,
      status: res.status,
      status_text: res.statusText,
      response_time: elapsed,
      response_size: Buffer.byteLength(body, 'utf-8'),
      protocol: 'graphql',
      request_data: JSON.stringify({
        headers: headers || [],
        bodyRaw: query,
        bodyMode: 'raw',
        authType: msg.authType || 'none',
        authData: msg.authData || {},
        gql_variables: variablesRaw || undefined,
        preRequestScript: preRequestScript || undefined,
        postResponseScript: postResponseScript || undefined,
      }),
      response_data: saveResponse
        ? JSON.stringify({ headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, String(v)])), body: body.slice(0, 50000), contentType: res.headers['content-type'] || 'application/json' })
        : undefined,
    });
    trimHistory(500);
    refreshHistory?.();
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    console.error('[GraphQL Query Error]', { endpoint, error: err.message, code: err.code, stack: err.stack, elapsed });
    const errorMsg = err.code === 'ECONNREFUSED'
      ? `Connection refused: ${endpoint}`
      : err.code === 'ENOTFOUND'
        ? `Host not found: ${endpoint}`
        : err.message || 'Unknown error';

    postMessage({
      type: 'responseData',
      tabId,
      requestMethod: 'POST',
      requestUrl: endpoint,
      requestHeaders: mutableHeaders,
      requestBody: JSON.stringify({ query, variables }, null, 2),
      response: {
        status: 0,
        statusText: 'Error',
        headers: {},
        body: JSON.stringify({ errors: [{ message: errorMsg }] }),
        size: 0,
        time: elapsed,
        contentType: 'application/json',
        cookies: [],
      },
    });

    // Save failed request to history
    try {
      insertHistory({
        request_id: tabId,
        method: 'POST',
        url: endpoint,
        status: 0,
        status_text: errorMsg,
        response_time: elapsed,
        response_size: 0,
        protocol: 'graphql',
        request_data: JSON.stringify({
          headers: headers || [],
          bodyRaw: query,
          bodyMode: 'raw',
          authType: msg.authType || 'none',
          authData: msg.authData || {},
          gql_variables: variablesRaw || undefined,
          preRequestScript: preRequestScript || undefined,
          postResponseScript: postResponseScript || undefined,
        }),
      });
      trimHistory(500);
      refreshHistory?.();
    } catch { /* ignore history errors */ }
  } finally {
    activeGqlControllers.delete(tabId);
  }
}

// ─── Script helpers (mirrors request-handler.ts) ──────────────────────────────


// ─── GraphQL Subscriptions (graphql-ws protocol) ───────────────────────────────

/** Active subscription connections per tabId */
const subscriptions = new Map<string, WebSocket>();

/**
 * Subscribe to a GraphQL subscription over WebSocket using the graphql-ws protocol.
 * Protocol spec: https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md
 */
export function handleGraphQLSubscribe(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const envId = msg.envId as string | undefined;
  const query = msg.query as string;
  const variablesRaw = msg.variables as string | undefined;
  const headers = msg.headers as { key: string; value: string }[] | undefined;

  // Resolve environment variables
  const vars = loadEnvVars(envId);
  const endpoint = resolveEnvString(msg.endpoint as string, vars);

  // Parse variables
  let variables: Record<string, unknown> | undefined;
  if (variablesRaw && variablesRaw.trim()) {
    try {
      variables = JSON.parse(resolveEnvString(variablesRaw, vars));
    } catch {
      postMessage({ type: 'gql:subscription:error', tabId, error: 'Invalid variables JSON' });
      return;
    }
  }

  // Close existing subscription for this tab
  cleanupSubscription(tabId);

  // Convert HTTP(S) URL to WS(S) URL
  const wsUrl = endpoint.replace(/^http/, 'ws');

  // Build WebSocket headers for auth
  const wsHeaders: Record<string, string> = {};
  if (headers) {
    for (const h of headers) {
      if (h.key) wsHeaders[resolveEnvString(h.key, vars)] = resolveEnvString(h.value, vars);
    }
  }

  try {
    const ws = new WebSocket(wsUrl, ['graphql-transport'], { headers: wsHeaders });
    subscriptions.set(tabId, ws);

    ws.on('open', () => {
      // Send ConnectionInit
      ws.send(JSON.stringify({ type: 'connection_init', payload: {} }));
    });

    ws.on('message', (raw: WebSocket.Data) => {
      const data = JSON.parse(raw.toString());

      switch (data.type) {
        case 'connection_ack':
          // Connection acknowledged, send subscribe
          ws.send(JSON.stringify({
            type: 'subscribe',
            id: '1',
            payload: { query, variables },
          }));
          postMessage({ type: 'gql:subscription:connected', tabId });
          break;

        case 'next':
          // Subscription data event
          postMessage({
            type: 'gql:subscription:data',
            tabId,
            data: JSON.stringify(data.payload),
            timestamp: Date.now(),
          });
          break;

        case 'error':
          // Subscription error
          postMessage({
            type: 'gql:subscription:error',
            tabId,
            error: Array.isArray(data.payload)
              ? data.payload.map((e: any) => e.message).join('; ')
              : 'Subscription error',
          });
          break;

        case 'complete':
          // Server completed the subscription
          postMessage({ type: 'gql:subscription:complete', tabId });
          cleanupSubscription(tabId);
          break;
      }
    });

    ws.on('close', () => {
      subscriptions.delete(tabId);
      postMessage({ type: 'gql:subscription:disconnected', tabId });
    });

    ws.on('error', (err: Error) => {
      subscriptions.delete(tabId);
      postMessage({ type: 'gql:subscription:error', tabId, error: err.message });
    });
  } catch (err: any) {
    postMessage({ type: 'gql:subscription:error', tabId, error: err.message || 'Failed to connect' });
  }
}

/** Unsubscribe and close the WebSocket for a tab */
export function handleGraphQLUnsubscribe(msg: Record<string, unknown>) {
  const tabId = msg.tabId as string;
  cleanupSubscription(tabId);
}

function cleanupSubscription(tabId: string) {
  const ws = subscriptions.get(tabId);
  if (ws) {
    // Send complete message for clean shutdown
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'complete', id: '1' }));
    }
    ws.removeAllListeners();
    ws.close();
    subscriptions.delete(tabId);
  }
}

/** Cleanup all subscriptions (call on panel dispose) */
export function cleanupAllSubscriptions() {
  for (const [tabId] of subscriptions) {
    cleanupSubscription(tabId);
  }
}
