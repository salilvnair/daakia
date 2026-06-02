/**
 * Mock server handlers.
 */
import {
  startMockServer,
  stopMockServer,
  updateMockServerRoutes,
  updateMockServerGraphQLSchema,
  updateMockServerGraphQLOps,
  updateMockServerWsHandlers,
  updateMockServerSoapOps,
  updateMockServerGrpcMethods,
  saveConfigs,
  loadSavedConfigs,
  getRunningServers,
  getPortRange,
  setPortRange,
  setLogCallback,
} from '../../../mock/mock-server-manager';

type PostMessage = (msg: unknown) => void;

let _postMessage: PostMessage | null = null;

/** Call once to wire log callback to webview */
export function initMockLogForwarding(postMessage: PostMessage) {
  _postMessage = postMessage;
  setLogCallback((entry) => {
    _postMessage?.({ type: 'mockServer:log', entry });
  });
}

export async function handleStartMockServer(msg: Record<string, unknown>, postMessage: PostMessage) {
  try {
    const config = msg.config as any;
    const { port } = await startMockServer(config);
    postMessage({ type: 'mockServer:started', id: config.id, port });
    postMessage({ type: 'toast', toastType: 'success', message: `Mock server "${config.name}" started on port ${port}` });
    // System log entry for start
    postMessage({
      type: 'mockServer:log',
      entry: {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        serverId: config.id,
        direction: 'system',
        protocol: config.protocol || 'rest',
        event: 'started',
        body: `Server "${config.name}" started on port ${port}`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    postMessage({ type: 'mockServer:error', id: (msg.config as any)?.id, error: message });
    postMessage({ type: 'toast', toastType: 'error', message: `Failed to start mock server: ${message}` });
  }
}

export async function handleStopMockServer(msg: Record<string, unknown>, postMessage: PostMessage) {
  try {
    const id = msg.id as string;
    // Get server info before stopping
    const running = getRunningServers();
    const serverInfo = running.find(s => s.id === id);
    await stopMockServer(id);
    postMessage({ type: 'mockServer:stopped', id });
    // System log entry for stop
    postMessage({
      type: 'mockServer:log',
      entry: {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        serverId: id,
        direction: 'system',
        protocol: serverInfo?.protocol || 'rest',
        event: 'stopped',
        body: `Server stopped`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    postMessage({ type: 'mockServer:error', id: msg.id as string, error: message });
  }
}

export function handleUpdateMockRoutes(msg: Record<string, unknown>) {
  const id = msg.id as string;
  const routes = msg.routes as any[];
  updateMockServerRoutes(id, routes);
}

export function handleSaveMockConfigs(msg: Record<string, unknown>) {
  const configs = msg.configs as any[];
  saveConfigs(configs);
}

export function handleGetMockServerState(postMessage: PostMessage) {
  const savedConfigs = loadSavedConfigs();
  const running = getRunningServers();
  const portRange = getPortRange();
  postMessage({ type: 'mockServersInit', configs: savedConfigs, running, portRange });
}

export function handleSetMockPortRange(msg: Record<string, unknown>, postMessage: PostMessage) {
  const min = msg.min as number;
  const max = msg.max as number;
  setPortRange(min, max);
  postMessage({ type: 'mockServer:portRangeUpdated', min, max });
}

export function handleUpdateMockGraphQLSchema(msg: Record<string, unknown>) {
  const id = msg.id as string;
  const schema = msg.schema as string;
  updateMockServerGraphQLSchema(id, schema);
}

export function handleUpdateMockGraphQLOps(msg: Record<string, unknown>) {
  const id = msg.id as string;
  const operations = msg.operations as any[];
  updateMockServerGraphQLOps(id, operations);
}

export function handleUpdateMockWsHandlers(msg: Record<string, unknown>) {
  const id = msg.id as string;
  const handlers = msg.handlers as any[];
  updateMockServerWsHandlers(id, handlers);
}

export function handleUpdateMockSoapOps(msg: Record<string, unknown>) {
  const id = msg.id as string;
  const operations = msg.operations as any[];
  updateMockServerSoapOps(id, operations);
}

export function handleUpdateMockGrpcMethods(msg: Record<string, unknown>) {
  const id = msg.id as string;
  const methods = msg.methods as any[];
  updateMockServerGrpcMethods(id, methods);
}
