/**
 * gRPC handler — bridges webview messages to grpc-executor.
 * Handles invoke (unary + streaming), cancel, and stream send/end.
 */
import {
  executeGrpcUnary,
  executeGrpcServerStream,
  executeGrpcClientStream,
  executeGrpcBidiStream,
  cancelGrpcStream,
  type GrpcInvokeParams,
  type GrpcStreamEvent,
} from '../../../grpc/grpc-executor';
import { discoverServices } from '../../../grpc/grpc-reflection';
import { loadProtoFile } from '../../../grpc/proto-loader';
import { loadEnvVars, resolveEnvString } from './env-resolver';
import { insertHistory, trimHistory } from '../../../storage/db';
import { runPhase, debugFor } from './script-phase';
import { afterScript } from '../../../services/template/after-script';
import {
  loadScriptEnvVars, loadCollectionVars, loadGlobalVars, persistScriptVars,
} from './script-vars';
import type { ScriptContext } from '../../../services/script-runtime';

type PostMessage = (msg: unknown) => void;

// Track active streaming controllers for cancel/send/end
const activeStreamControllers = new Map<string, {
  send?: (msg: string) => void;
  end?: () => void;
  cancel: () => void;
}>();

/**
 * Handle grpc:invoke — dispatch to unary or streaming based on rpcType.
 */
export async function handleGrpcInvoke(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
  refreshHistory?: () => void,
) {
  const tabId = msg.tabId as string;
  const envId = msg.envId as string | undefined;
  const rpcType = (msg.rpcType as string) || 'unary';

  // Resolve environment variables
  const vars = loadEnvVars(envId);
  /* Reassigned once the pre-request script has run — see below. */
  let endpoint = resolveEnvString(msg.endpoint as string || '', vars);
  let method = resolveEnvString(msg.method as string || '', vars);
  let message = resolveEnvString(msg.message as string || '{}', vars);
  const rawMetadata = msg.metadata as { key: string; value: string; enabled?: boolean }[] || [];
  let metadata = rawMetadata
    .filter(m => m.key && (m.enabled !== false))
    .map(m => ({ key: resolveEnvString(m.key, vars), value: resolveEnvString(m.value, vars) }));
  const tls = msg.tls as boolean ?? false;
  const protoFile = msg.protoFile as string | undefined;

  /*
    ── The scripts, which this handler did not run ──

    Same as SOAP: gRPC offers a Scripts tab, read `msg.preRequestScript`, wrote
    it into the history row, and never called `runScript`. A reader could write
    one, watch the tab mark itself as having content, and get silence.
  */
  const collectionId = msg.collectionId as string | undefined;
  const envVarsForScript = loadScriptEnvVars(envId);
  const colVarsForScript = loadCollectionVars(collectionId);
  const globalVarsForScript = loadGlobalVars();

  const scriptCtx: ScriptContext = {
    request: {
      method,
      url: endpoint,
      headers: Object.fromEntries(metadata.map(m => [m.key, m.value])),
      body: message,
    },
    environmentVariables: { ...envVarsForScript },
    collectionVariables: { ...colVarsForScript },
    globalVariables: { ...globalVarsForScript },
  };

  const preScript = msg.preRequestScript as string | undefined;
  if (preScript?.trim()) {
    postMessage({ type: 'requestProgress', tabId, stage: 'pre-request-script', status: 'running' });
  }
  const pre = await runPhase(
    preScript, scriptCtx, 'pre-request',
    debugFor(msg, 'pre-request', postMessage, tabId),
  );

  if (pre.stopped) {
    /* The reader stopped their own debug session. Nothing failed, so no
       error is drawn — the tab just stops waiting. */
    postMessage({ type: 'requestAborted', tabId });
    return;
  }

  if (!pre.ok) {
    /* A script that threw has not decided what to send, so nothing is sent. */
    postMessage({
      type: 'grpc:error', tabId,
      error: `Pre-request script failed: ${pre.errors.join('; ')}`,
      scriptLogs: pre.logs, scriptErrors: pre.errors,
      consoleLogs: pre.consoleLogs.length > 0 ? pre.consoleLogs : undefined,
    });
    return;
  }

  /* What the script set, filled into what the webview could not resolve. */
  const finish = afterScript(pre.layers, {
    method: 'POST', url: endpoint, headers: metadata, body: message,
  });
  endpoint = finish.str(endpoint);
  method = finish.str(method);
  message = finish.str(message);
  metadata = finish.rows(metadata) ?? metadata;

  persistScriptVars(
    envId, collectionId,
    scriptCtx.environmentVariables, scriptCtx.collectionVariables, scriptCtx.globalVariables,
    envVarsForScript, colVarsForScript, globalVarsForScript,
    postMessage,
  );

  const params: GrpcInvokeParams = {
    tabId,
    endpoint,
    method,
    message,
    metadata,
    tls,
    protoFile,
    rpcType: rpcType as any,
  };

  if (!endpoint) {
    postMessage({
      type: 'grpc:response',
      tabId,
      response: {
        status: 2,
        statusText: 'Endpoint is required',
        body: JSON.stringify({ error: 'Endpoint is required' }, null, 2),
        headers: {},
        time: 0,
        size: 0,
      },
    });
    return;
  }

  try {
    // Send progress: connecting
    postMessage({ type: 'requestProgress', tabId, stage: 'rendering-request', status: 'done' });
    postMessage({ type: 'requestProgress', tabId, stage: 'sending-request', status: 'running' });

    if (rpcType === 'unary') {
      const response = await executeGrpcUnary(params);
      postMessage({ type: 'grpc:response', tabId, response });

      // Save to history
      saveGrpcHistory(tabId, endpoint, method, response.status, response.statusText, response.time, {
        grpcMethod: method,
        grpcMessage: message,
        grpcMetadata: rawMetadata,
        grpcTls: tls,
        grpcProtoFile: protoFile,
        rpcType,
        authType: msg.authType || 'none',
        authData: msg.authData || {},
        preRequestScript: msg.preRequestScript || '',
        postResponseScript: msg.postResponseScript || '',
      }, refreshHistory);
    } else if (rpcType === 'server_streaming') {
      postMessage({ type: 'grpc:streamStatus', tabId, status: 'streaming' });
      const ctrl = executeGrpcServerStream(params, (event) => {
        handleStreamEvent(event, postMessage);
      });
      activeStreamControllers.set(tabId, ctrl);
    } else if (rpcType === 'client_streaming') {
      postMessage({ type: 'grpc:streamStatus', tabId, status: 'streaming' });
      const ctrl = executeGrpcClientStream(params, (event) => {
        handleStreamEvent(event, postMessage);
      });
      activeStreamControllers.set(tabId, ctrl);
    } else if (rpcType === 'bidi_streaming') {
      postMessage({ type: 'grpc:streamStatus', tabId, status: 'streaming' });
      const ctrl = executeGrpcBidiStream(params, (event) => {
        handleStreamEvent(event, postMessage);
      });
      activeStreamControllers.set(tabId, ctrl);
    }
  } catch (err: any) {
    const errorMsg = err.code === 'ECONNREFUSED'
      ? `Connection refused: ${endpoint}`
      : err.code === 'ENOTFOUND'
        ? `Host not found: ${endpoint}`
        : err.message || 'gRPC call failed';

    postMessage({
      type: 'grpc:response',
      tabId,
      response: {
        status: 14, // UNAVAILABLE
        statusText: errorMsg,
        body: JSON.stringify({ error: errorMsg, code: err.code || 'UNKNOWN' }, null, 2),
        headers: {},
        time: 0,
        size: 0,
      },
    });

    // Save failed request to history
    saveGrpcHistory(tabId, endpoint, method, 14, errorMsg, 0, {
      grpcMethod: method,
      grpcMessage: message,
      grpcMetadata: rawMetadata,
      grpcTls: tls,
      grpcProtoFile: protoFile,
      rpcType,
      authType: msg.authType || 'none',
      authData: msg.authData || {},
      preRequestScript: msg.preRequestScript || '',
      postResponseScript: msg.postResponseScript || '',
    }, refreshHistory);
  }
}

/**
 * Handle grpc:cancel — cancel an active call or stream.
 */
export function handleGrpcCancel(msg: Record<string, unknown>, postMessage: PostMessage) {
  const tabId = msg.tabId as string;

  const ctrl = activeStreamControllers.get(tabId);
  if (ctrl) {
    ctrl.cancel();
    activeStreamControllers.delete(tabId);
  } else {
    // Try the global cancel (for unary calls in progress)
    cancelGrpcStream(tabId);
  }

  postMessage({ type: 'grpc:cancelled', tabId });
}

/**
 * Handle grpc:streamSend — send a message on client/bidi stream.
 */
export function handleGrpcStreamSend(msg: Record<string, unknown>, postMessage: PostMessage) {
  const tabId = msg.tabId as string;
  const message = msg.message as string || '{}';

  const ctrl = activeStreamControllers.get(tabId);
  if (ctrl?.send) {
    ctrl.send(message);
  }
}

/**
 * Handle grpc:streamEnd — end client-side stream (half-close).
 */
export function handleGrpcStreamEnd(msg: Record<string, unknown>, postMessage: PostMessage) {
  const tabId = msg.tabId as string;

  const ctrl = activeStreamControllers.get(tabId);
  if (ctrl?.end) {
    ctrl.end();
  }
}

/**
 * Cleanup all active streams (called on panel dispose).
 */
export function cleanupAllGrpcStreams() {
  for (const [tabId, ctrl] of activeStreamControllers) {
    ctrl.cancel();
  }
  activeStreamControllers.clear();
}

// ─── Internal Helpers ───

function handleStreamEvent(event: GrpcStreamEvent, postMessage: PostMessage) {
  const { tabId } = event;

  if (event.type === 'message') {
    postMessage({
      type: 'grpc:streamEvent',
      tabId,
      event: {
        direction: event.direction,
        data: event.data || '',
        timestamp: event.timestamp,
      },
    });
  } else if (event.type === 'end') {
    activeStreamControllers.delete(tabId);
    postMessage({
      type: 'grpc:streamStatus',
      tabId,
      status: 'completed',
    });
    postMessage({
      type: 'grpc:response',
      tabId,
      response: {
        status: event.status ?? 0,
        statusText: event.statusText || 'OK',
        body: '',
        headers: {},
        time: 0,
        size: 0,
      },
    });
  } else if (event.type === 'error') {
    activeStreamControllers.delete(tabId);
    postMessage({
      type: 'grpc:streamStatus',
      tabId,
      status: 'error',
    });
    postMessage({
      type: 'grpc:response',
      tabId,
      response: {
        status: event.status ?? 2,
        statusText: event.statusText || 'Stream error',
        body: JSON.stringify({ error: event.data || event.statusText || 'Unknown error' }, null, 2),
        headers: {},
        time: 0,
        size: 0,
      },
    });
  }
}

function saveGrpcHistory(tabId: string, endpoint: string, method: string, status: number, statusText: string, time: number, requestData?: Record<string, unknown>, refreshHistory?: () => void) {
  try {
    insertHistory({
      request_id: tabId,
      method: 'GRPC',
      url: endpoint,
      status,
      status_text: statusText,
      response_time: time,
      response_size: 0,
      protocol: 'grpc',
      request_data: requestData ? JSON.stringify(requestData) : undefined,
    });
    trimHistory(500);
    if (refreshHistory) refreshHistory();
  } catch {
    // Non-critical: don't fail the request if history save fails
  }
}

/**
 * Handle grpc:reflect — discover services/methods via server reflection.
 */
export async function handleGrpcReflect(msg: Record<string, unknown>, postMessage: PostMessage) {
  const tabId = msg.tabId as string;
  const endpoint = msg.endpoint as string || '';
  // Auto-detect TLS from scheme, or use explicit flag
  const tls = endpoint.startsWith('https://') || (msg.tls as boolean ?? false);

  if (!endpoint) {
    postMessage({ type: 'grpc:reflectResult', tabId, error: 'Endpoint is required' });
    return;
  }

  try {
    const services = await discoverServices(endpoint, tls);
    if (services.length === 0) {
      postMessage({ type: 'grpc:reflectResult', tabId, services: [], warning: 'No services found on this server.' });
      return;
    }
    postMessage({
      type: 'grpc:reflectResult',
      tabId,
      services: services.map(s => ({
        name: s.name,
        methods: s.methods.map(m => ({
          name: m.name,
          fullName: m.fullName,
          type: m.type,
          requestType: m.requestType,
          responseType: m.responseType,
        })),
      })),
    });
  } catch (err: any) {
    postMessage({ type: 'grpc:reflectResult', tabId, error: err.message || 'Reflection failed' });
  }
}

/**
 * Handle grpc:loadProto — load a .proto file and return discovered services/methods.
 */
export async function handleGrpcLoadProto(msg: Record<string, unknown>, postMessage: PostMessage) {
  const tabId = msg.tabId as string;
  const protoPath = msg.protoPath as string || '';

  if (!protoPath) {
    postMessage({ type: 'grpc:reflectResult', tabId, error: 'Proto file path is required' });
    return;
  }

  try {
    const services = await loadProtoFile(protoPath);
    postMessage({
      type: 'grpc:reflectResult',
      tabId,
      services: services.map(s => ({
        name: s.name,
        methods: s.methods.map(m => ({
          name: m.name,
          fullName: m.fullName,
          type: m.type,
          requestType: m.requestType,
          responseType: m.responseType,
        })),
      })),
      source: 'proto',
    });
  } catch (err: any) {
    postMessage({ type: 'grpc:reflectResult', tabId, error: err.message || 'Failed to load proto file' });
  }
}
