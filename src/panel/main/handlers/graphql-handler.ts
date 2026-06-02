/**
 * GraphQL execution + introspection + subscription handler.
 */
import axios from 'axios';
import WebSocket from 'ws';
import { loadEnvVars, resolveEnvString } from './env-resolver';
import { insertHistory, trimHistory, getSetting } from '../../../storage/db';

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

  try {
    const res = await axios.post(
      endpoint,
      { query: INTROSPECTION_QUERY },
      { headers: reqHeaders, timeout: ((getSetting<Record<string, unknown>>('general') ?? {}).timeout as number | undefined) ?? 30000, validateStatus: () => true },
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
) {
  const tabId = msg.tabId as string;
  const envId = msg.envId as string | undefined;
  const query = msg.query as string;
  const headers = msg.headers as { key: string; value: string }[] | undefined;
  const variablesRaw = msg.variables as string | undefined;

  // Resolve environment variables
  const vars = loadEnvVars(envId);
  const endpoint = resolveEnvString(msg.endpoint as string, vars);

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

  // Build request headers
  const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (headers) {
    for (const h of headers) {
      if (h.key) reqHeaders[resolveEnvString(h.key, vars)] = resolveEnvString(h.value, vars);
    }
  }

  const startTime = Date.now();
  const controller = new AbortController();
  activeGqlControllers.set(tabId, controller);
  try {
    const res = await axios.post(
      endpoint,
      { query, variables },
      {
        headers: reqHeaders,
        timeout: ((getSetting<Record<string, unknown>>('general') ?? {}).timeout as number | undefined) ?? 30000,
        validateStatus: () => true,
        transformResponse: [(data) => data], // Keep raw string
        signal: controller.signal,
      },
    );

    const elapsed = Date.now() - startTime;
    const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

    postMessage({
      type: 'responseData',
      tabId,
      requestMethod: 'POST',
      requestUrl: endpoint,
      requestHeaders: reqHeaders,
      requestBody: JSON.stringify({ query, variables }, null, 2),
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
    const saveResponse = getSetting('saveResponseInHistory') !== 'false';
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
        authData: variablesRaw ? { gql_variables: variablesRaw } : {},
      }),
      response_data: saveResponse
        ? JSON.stringify({ headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, String(v)])), body: body.slice(0, 50000), contentType: res.headers['content-type'] || 'application/json' })
        : undefined,
    });
    trimHistory(500);
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
      requestHeaders: reqHeaders,
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
          authData: variablesRaw ? { gql_variables: variablesRaw } : {},
        }),
      });
      trimHistory(500);
    } catch { /* ignore history errors */ }
  } finally {
    activeGqlControllers.delete(tabId);
  }
}

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
