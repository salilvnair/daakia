/**
 * gRPC executor — handles unary, server streaming, client streaming,
 * and bidirectional streaming gRPC calls.
 * Uses @grpc/grpc-js + @grpc/proto-loader.
 */
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';

export type GrpcMethodType = 'unary' | 'server_streaming' | 'client_streaming' | 'bidi_streaming';

export interface GrpcInvokeParams {
  tabId: string;
  endpoint: string;
  method: string; // package.Service/Method
  message: string; // JSON string
  metadata: { key: string; value: string }[];
  tls: boolean;
  protoFile?: string;
  rpcType?: GrpcMethodType;
}

export interface GrpcResponse {
  tabId: string;
  status: number; // gRPC status code (0 = OK)
  statusText: string;
  body: string; // JSON response
  headers: Record<string, string>; // response metadata
  time: number; // duration ms
  size: number;
}

export interface GrpcStreamEvent {
  tabId: string;
  type: 'message' | 'end' | 'error' | 'status';
  direction: 'sent' | 'received';
  data?: string;
  timestamp: number;
  status?: number;
  statusText?: string;
}

// Keep track of active streams for cancellation
const activeStreams = new Map<string, grpc.ClientDuplexStream<unknown, unknown> | grpc.ClientReadableStream<unknown> | grpc.ClientWritableStream<unknown>>();

/**
 * Execute a unary gRPC call.
 */
export async function executeGrpcUnary(params: GrpcInvokeParams): Promise<GrpcResponse> {
  const startTime = Date.now();

  const { client, methodDef } = await createClient(params);
  const methodName = params.method.split('/').pop() || params.method;

  // Build metadata
  const metadata = new grpc.Metadata();
  for (const m of params.metadata) {
    if (m.key) metadata.set(m.key, m.value);
  }

  // Parse message
  let message: unknown;
  try {
    message = JSON.parse(params.message || '{}');
  } catch {
    message = {};
  }

  return new Promise((resolve, reject) => {
    const responseHeaders: Record<string, string> = {};

    const call = client[methodName](message, metadata, (err: grpc.ServiceError | null, response: unknown) => {
      const duration = Date.now() - startTime;
      const peer = call?.getPeer?.() || '';
      if (peer) responseHeaders['peer'] = peer;

      if (err) {
        // Add error metadata from ServiceError
        if (err.metadata) {
          const errMd = err.metadata.getMap();
          for (const [k, v] of Object.entries(errMd)) {
            responseHeaders[`trailer:${k}`] = String(v);
          }
        }
        responseHeaders['grpc-status'] = String(err.code ?? 2);
        responseHeaders['grpc-message'] = err.details || err.message;

        resolve({
          tabId: params.tabId,
          status: err.code ?? 2,
          statusText: err.details || err.message,
          body: JSON.stringify({ error: err.details || err.message, code: err.code }, null, 2),
          headers: responseHeaders,
          time: duration,
          size: 0,
        });
        return;
      }

      responseHeaders['grpc-status'] = '0';
      responseHeaders['grpc-message'] = 'OK';

      const body = JSON.stringify(response, null, 2);
      resolve({
        tabId: params.tabId,
        status: 0,
        statusText: 'OK',
        body,
        headers: responseHeaders,
        time: duration,
        size: Buffer.byteLength(body, 'utf8'),
      });
    });

    // Capture initial response metadata (headers)
    call.on('metadata', (md: grpc.Metadata) => {
      const map = md.getMap();
      for (const [k, v] of Object.entries(map)) {
        responseHeaders[k] = String(v);
      }
    });

    // Capture trailing metadata
    call.on('status', (status: { metadata?: grpc.Metadata; code?: number }) => {
      if (status.metadata) {
        const map = status.metadata.getMap();
        for (const [k, v] of Object.entries(map)) {
          responseHeaders[`trailer:${k}`] = String(v);
        }
      }
    });
  });
}

/**
 * Start a server-streaming gRPC call. Returns events via callback.
 */
export function executeGrpcServerStream(
  params: GrpcInvokeParams,
  onEvent: (event: GrpcStreamEvent) => void,
): { cancel: () => void } {
  const startTime = Date.now();

  createClient(params).then(({ client }) => {
    const methodName = params.method.split('/').pop() || params.method;

    const metadata = new grpc.Metadata();
    for (const m of params.metadata) {
      if (m.key) metadata.set(m.key, m.value);
    }

    let message: unknown;
    try { message = JSON.parse(params.message || '{}'); } catch { message = {}; }

    const call = client[methodName](message, metadata);
    activeStreams.set(params.tabId, call);

    call.on('data', (data: unknown) => {
      onEvent({
        tabId: params.tabId,
        type: 'message',
        direction: 'received',
        data: JSON.stringify(data, null, 2),
        timestamp: Date.now(),
      });
    });

    call.on('end', () => {
      activeStreams.delete(params.tabId);
      onEvent({
        tabId: params.tabId,
        type: 'end',
        direction: 'received',
        timestamp: Date.now(),
        status: 0,
        statusText: 'OK',
      });
    });

    call.on('error', (err: grpc.ServiceError) => {
      activeStreams.delete(params.tabId);
      onEvent({
        tabId: params.tabId,
        type: 'error',
        direction: 'received',
        data: err.details || err.message,
        timestamp: Date.now(),
        status: err.code ?? 2,
        statusText: err.details || err.message,
      });
    });
  }).catch((err) => {
    onEvent({
      tabId: params.tabId,
      type: 'error',
      direction: 'received',
      data: (err as Error).message,
      timestamp: Date.now(),
      status: 2,
      statusText: (err as Error).message,
    });
  });

  return {
    cancel: () => {
      const stream = activeStreams.get(params.tabId);
      if (stream) {
        (stream as grpc.ClientReadableStream<unknown>).cancel();
        activeStreams.delete(params.tabId);
      }
    },
  };
}

/**
 * Start a client-streaming gRPC call.
 */
export function executeGrpcClientStream(
  params: GrpcInvokeParams,
  onEvent: (event: GrpcStreamEvent) => void,
): { send: (msg: string) => void; end: () => void; cancel: () => void } {
  let call: grpc.ClientWritableStream<unknown> | null = null;

  createClient(params).then(({ client }) => {
    const methodName = params.method.split('/').pop() || params.method;

    const metadata = new grpc.Metadata();
    for (const m of params.metadata) {
      if (m.key) metadata.set(m.key, m.value);
    }

    call = client[methodName](metadata, (err: grpc.ServiceError | null, response: unknown) => {
      activeStreams.delete(params.tabId);
      if (err) {
        onEvent({
          tabId: params.tabId,
          type: 'error',
          direction: 'received',
          data: err.details || err.message,
          timestamp: Date.now(),
          status: err.code ?? 2,
          statusText: err.details || err.message,
        });
      } else {
        onEvent({
          tabId: params.tabId,
          type: 'message',
          direction: 'received',
          data: JSON.stringify(response, null, 2),
          timestamp: Date.now(),
          status: 0,
          statusText: 'OK',
        });
      }
    });

    activeStreams.set(params.tabId, call);
  }).catch((err) => {
    onEvent({
      tabId: params.tabId,
      type: 'error',
      direction: 'received',
      data: (err as Error).message,
      timestamp: Date.now(),
      status: 2,
      statusText: (err as Error).message,
    });
  });

  return {
    send: (msg: string) => {
      if (!call) return;
      let parsed: unknown;
      try { parsed = JSON.parse(msg); } catch { parsed = {}; }
      call.write(parsed);
      onEvent({
        tabId: params.tabId,
        type: 'message',
        direction: 'sent',
        data: msg,
        timestamp: Date.now(),
      });
    },
    end: () => {
      if (call) call.end();
    },
    cancel: () => {
      const stream = activeStreams.get(params.tabId);
      if (stream) {
        (stream as grpc.ClientWritableStream<unknown>).cancel();
        activeStreams.delete(params.tabId);
      }
    },
  };
}

/**
 * Start a bidirectional streaming gRPC call.
 */
export function executeGrpcBidiStream(
  params: GrpcInvokeParams,
  onEvent: (event: GrpcStreamEvent) => void,
): { send: (msg: string) => void; end: () => void; cancel: () => void } {
  let call: grpc.ClientDuplexStream<unknown, unknown> | null = null;

  createClient(params).then(({ client }) => {
    const methodName = params.method.split('/').pop() || params.method;

    const metadata = new grpc.Metadata();
    for (const m of params.metadata) {
      if (m.key) metadata.set(m.key, m.value);
    }

    call = client[methodName](metadata);
    activeStreams.set(params.tabId, call);

    call.on('data', (data: unknown) => {
      onEvent({
        tabId: params.tabId,
        type: 'message',
        direction: 'received',
        data: JSON.stringify(data, null, 2),
        timestamp: Date.now(),
      });
    });

    call.on('end', () => {
      activeStreams.delete(params.tabId);
      onEvent({
        tabId: params.tabId,
        type: 'end',
        direction: 'received',
        timestamp: Date.now(),
        status: 0,
        statusText: 'OK',
      });
    });

    call.on('error', (err: grpc.ServiceError) => {
      activeStreams.delete(params.tabId);
      onEvent({
        tabId: params.tabId,
        type: 'error',
        direction: 'received',
        data: err.details || err.message,
        timestamp: Date.now(),
        status: err.code ?? 2,
        statusText: err.details || err.message,
      });
    });
  }).catch((err) => {
    onEvent({
      tabId: params.tabId,
      type: 'error',
      direction: 'received',
      data: (err as Error).message,
      timestamp: Date.now(),
      status: 2,
      statusText: (err as Error).message,
    });
  });

  return {
    send: (msg: string) => {
      if (!call) return;
      let parsed: unknown;
      try { parsed = JSON.parse(msg); } catch { parsed = {}; }
      call.write(parsed);
      onEvent({
        tabId: params.tabId,
        type: 'message',
        direction: 'sent',
        data: msg,
        timestamp: Date.now(),
      });
    },
    end: () => {
      if (call) call.end();
    },
    cancel: () => {
      const stream = activeStreams.get(params.tabId);
      if (stream) {
        (stream as grpc.ClientDuplexStream<unknown, unknown>).cancel();
        activeStreams.delete(params.tabId);
      }
    },
  };
}

/**
 * Cancel an active gRPC stream.
 */
export function cancelGrpcStream(tabId: string): void {
  const stream = activeStreams.get(tabId);
  if (stream) {
    (stream as { cancel(): void }).cancel();
    activeStreams.delete(tabId);
  }
}

// ─── Internal Helpers ───

async function createClient(params: GrpcInvokeParams): Promise<{ client: any; methodDef?: any }> {
  const { method, tls, protoFile } = params;

  // Strip http:// or https:// scheme — gRPC uses host:port format
  const endpoint = params.endpoint.replace(/^https?:\/\//, '');

  // Determine credentials
  const credentials = tls
    ? grpc.credentials.createSsl()
    : grpc.credentials.createInsecure();

  // Parse method path: "package.Service/Method" → service = "package.Service"
  const slashIdx = method.lastIndexOf('/');
  const servicePath = slashIdx > 0 ? method.substring(0, slashIdx) : method;

  if (protoFile) {
    // Load from proto file
    const packageDefinition = await protoLoader.load(protoFile, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [path.dirname(protoFile)],
    });

    const grpcObj = grpc.loadPackageDefinition(packageDefinition);

    // Navigate to the service constructor
    const serviceConstructor = getNestedProperty(grpcObj, servicePath);
    if (!serviceConstructor) {
      throw new Error(`Service "${servicePath}" not found in proto file`);
    }

    const client = new (serviceConstructor as any)(endpoint, credentials);
    return { client };
  } else {
    // Generic client — make calls without proto using raw serialization.
    // This works with servers that accept JSON (like mock servers).
    const client = new grpc.Client(endpoint, credentials);
    const methodPath = `/${method}`; // e.g. "/echo.EchoService/Echo"

    // Create a wrapper that mimics a service client for unary/streaming calls
    const methodName = method.split('/').pop() || method;
    const rpcType = params.rpcType || 'unary';
    const serialize = (value: unknown) => Buffer.from(JSON.stringify(value));
    const deserialize = (buf: Buffer) => JSON.parse(buf.toString());

    const genericClient: any = {};

    if (rpcType === 'unary') {
      genericClient[methodName] = (msg: unknown, metadata: grpc.Metadata, callback: (err: grpc.ServiceError | null, res: unknown) => void) => {
        return client.makeUnaryRequest(methodPath, serialize, deserialize, msg, metadata, callback);
      };
    } else if (rpcType === 'server_streaming') {
      genericClient[methodName] = (msg: unknown, metadata: grpc.Metadata) => {
        return client.makeServerStreamRequest(methodPath, serialize, deserialize, msg, metadata);
      };
    } else if (rpcType === 'client_streaming') {
      genericClient[methodName] = (metadata: grpc.Metadata, callback: (err: grpc.ServiceError | null, res: unknown) => void) => {
        return client.makeClientStreamRequest(methodPath, serialize, deserialize, metadata, callback);
      };
    } else if (rpcType === 'bidi_streaming') {
      genericClient[methodName] = (metadata: grpc.Metadata) => {
        return client.makeBidiStreamRequest(methodPath, serialize, deserialize, metadata);
      };
    }

    return { client: genericClient };
  }
}

function getNestedProperty(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function extractMetadata(call: any): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    const peer = call?.getPeer?.();
    if (peer) headers['peer'] = peer;
  } catch { /* ignore */ }

  // Extract initial metadata (response headers)
  try {
    const md = call?._metadata || call?.metadata;
    if (md && typeof md.getMap === 'function') {
      const map = md.getMap();
      for (const [k, v] of Object.entries(map)) {
        headers[`header:${k}`] = String(v);
      }
    }
  } catch { /* ignore */ }

  return headers;
}

/**
 * Enhanced metadata extraction using event listeners on the call object.
 * Returns a promise that resolves with full metadata after the call completes.
 */
function collectCallMetadata(call: any): { metadata: Record<string, string>; collect: () => void } {
  const result: Record<string, string> = {};

  const collect = () => {
    try {
      const peer = call?.getPeer?.();
      if (peer) result['peer'] = peer;
    } catch { /* ignore */ }
  };

  // Listen for 'metadata' event (initial response headers)
  try {
    call.on('metadata', (md: grpc.Metadata) => {
      const map = md.getMap();
      for (const [k, v] of Object.entries(map)) {
        result[k] = String(v);
      }
    });
  } catch { /* ignore */ }

  // Listen for 'status' event (trailing metadata)
  try {
    call.on('status', (status: { metadata?: grpc.Metadata }) => {
      if (status.metadata) {
        const map = status.metadata.getMap();
        for (const [k, v] of Object.entries(map)) {
          result[`trailer:${k}`] = String(v);
        }
      }
    });
  } catch { /* ignore */ }

  return { metadata: result, collect };
}
