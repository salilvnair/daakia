/**
 * gRPC Mock Server — uses @grpc/grpc-js Server class to serve
 * mock gRPC responses for local testing.
 * Follows createGrpcServer / cleanupGrpcServer pattern (same as other protocols).
 */
import * as http from 'http';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import type { MockServerConfig, MockLogEntry } from './mock-types';

type LogCallback = (entry: MockLogEntry) => void;

// ─── Internal State ───

interface GrpcBrokerState {
  server: grpc.Server;
  port: number;
}

const grpcServers = new Map<string, GrpcBrokerState>();

// ─── Public API ───

/**
 * Create and start a gRPC mock server. Returns an http.Server shim that
 * the manager can track. The real gRPC server binds to the given port.
 */
export async function createGrpcServer(
  config: MockServerConfig,
  getConfig: () => MockServerConfig,
  onLog?: LogCallback,
  port?: number,
): Promise<http.Server> {
  const methods = (config.grpcMethods || []).filter(m => m.enabled !== false && m.serviceEnabled !== false);
  const grpcServer = new grpc.Server();

  if (config.grpcProtoFile) {
    await registerFromProto(grpcServer, config.grpcProtoFile, methods, config.id, onLog);
  } else {
    registerGeneric(grpcServer, methods, config.id, onLog);
  }

  // Register server reflection so clients can auto-discover services/methods
  registerReflectionService(grpcServer, methods);

  // Bind the gRPC server
  const boundPort = await new Promise<number>((resolve, reject) => {
    grpcServer.bindAsync(
      `0.0.0.0:${port || 0}`,
      grpc.ServerCredentials.createInsecure(),
      (err, p) => {
        if (err) { reject(err); return; }
        resolve(p);
      },
    );
  });

  grpcServers.set(config.id, { server: grpcServer, port: boundPort });

  // Return a shim http.Server so the manager can treat it uniformly
  const shim = http.createServer();
  shim.listen = function (...args: any[]) {
    const cb = args.find(a => typeof a === 'function');
    if (cb) process.nextTick(cb);
    return shim;
  } as any;
  shim.close = function (cb?: (err?: Error) => void) {
    cleanupGrpcServer(config.id).then(() => cb?.()).catch(() => cb?.());
    return shim;
  } as any;
  return shim;
}

/**
 * Cleanup (shutdown) a gRPC mock server by config ID.
 */
export async function cleanupGrpcServer(id: string): Promise<void> {
  const state = grpcServers.get(id);
  if (!state) return;

  return new Promise((resolve) => {
    state.server.tryShutdown(() => {
      grpcServers.delete(id);
      resolve();
    });
  });
}

// ─── Proto-based Registration ───

async function registerFromProto(
  server: grpc.Server,
  protoFile: string,
  methods: Array<{ id?: string; service: string; method: string; type: string; response: string; responseScript?: string; streamResponses?: Array<{ data: string; delayMs: number }>; enabled?: boolean }>,
  serverId: string,
  onLog?: LogCallback,
) {
  const packageDefinition = await protoLoader.load(protoFile, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [path.dirname(protoFile)],
  });

  const grpcObj = grpc.loadPackageDefinition(packageDefinition);
  const serviceMethodMap = new Map<string, typeof methods>();
  for (const m of methods) {
    const existing = serviceMethodMap.get(m.service) || [];
    existing.push(m);
    serviceMethodMap.set(m.service, existing);
  }

  for (const [serviceName, svcMethods] of serviceMethodMap) {
    const serviceConstructor = getNestedProperty(grpcObj, serviceName);
    if (!serviceConstructor || !(serviceConstructor as any).service) continue;
    const handlers: Record<string, any> = {};
    for (const mc of svcMethods) {
      handlers[mc.method] = createHandler(mc, serverId, onLog);
    }
    server.addService((serviceConstructor as any).service, handlers);
  }
}

// ─── Generic Registration (no proto file) ───

function registerGeneric(
  server: grpc.Server,
  methods: Array<{ id?: string; service: string; method: string; type: string; response: string; responseScript?: string; streamResponses?: Array<{ data: string; delayMs: number }>; enabled?: boolean }>,
  serverId: string,
  onLog?: LogCallback,
) {
  const serviceMethodMap = new Map<string, typeof methods>();
  for (const m of methods) {
    const existing = serviceMethodMap.get(m.service) || [];
    existing.push(m);
    serviceMethodMap.set(m.service, existing);
  }

  for (const [serviceName, svcMethods] of serviceMethodMap) {
    const serviceDef: Record<string, any> = {};
    const handlers: Record<string, any> = {};

    for (const mc of svcMethods) {
      serviceDef[mc.method] = {
        path: `/${serviceName}/${mc.method}`,
        requestStream: mc.type === 'client_streaming' || mc.type === 'bidi_streaming',
        responseStream: mc.type === 'server_streaming' || mc.type === 'bidi_streaming',
        requestSerialize: (v: any) => Buffer.from(JSON.stringify(v)),
        requestDeserialize: (buf: Buffer) => JSON.parse(buf.toString()),
        responseSerialize: (v: any) => Buffer.from(JSON.stringify(v)),
        responseDeserialize: (buf: Buffer) => JSON.parse(buf.toString()),
      };
      handlers[mc.method] = createHandler(mc, serverId, onLog);
    }
    server.addService(serviceDef, handlers);
  }
}

// ─── Handler Factory ───

function createHandler(
  config: { service: string; method: string; type: string; response: string; responseScript?: string; streamResponses?: Array<{ data: string; delayMs: number }>; delay?: number; statusCode?: number },
  serverId: string,
  onLog?: LogCallback,
) {
  const methodFull = `${config.service}/${config.method}`;
  const delay = config.delay || 0;
  const statusCode = config.statusCode || 0;

  switch (config.type) {
    case 'unary':
      return (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
        emitLog(onLog, serverId, 'incoming', methodFull, JSON.stringify(call.request));
        const respond = () => {
          if (statusCode > 0) {
            callback({ code: statusCode, details: `Mock error: gRPC status ${statusCode}` });
          } else {
            const response = resolveResponse(config, call.request);
            emitLog(onLog, serverId, 'outgoing', methodFull, JSON.stringify(response));
            callback(null, response);
          }
        };
        if (delay > 0) setTimeout(respond, delay); else respond();
      };

    case 'server_streaming':
      return (call: grpc.ServerWritableStream<any, any>) => {
        emitLog(onLog, serverId, 'incoming', methodFull, JSON.stringify(call.request));
        if (statusCode > 0) {
          const fn = () => call.destroy({ code: statusCode, details: `Mock error: gRPC status ${statusCode}` } as any);
          if (delay > 0) setTimeout(fn, delay); else fn();
          return;
        }
        const responses = config.streamResponses || [{ data: config.response, delayMs: 0 }];
        let index = 0;
        const sendNext = () => {
          if (index >= responses.length) { call.end(); return; }
          const item = responses[index++];
          setTimeout(() => {
            let data: any;
            try { data = JSON.parse(item.data); } catch { data = {}; }
            call.write(data);
            emitLog(onLog, serverId, 'outgoing', methodFull, item.data);
            sendNext();
          }, item.delayMs);
        };
        if (delay > 0) setTimeout(sendNext, delay); else sendNext();
      };

    case 'client_streaming':
      return (call: grpc.ServerReadableStream<any, any>, callback: grpc.sendUnaryData<any>) => {
        call.on('data', (msg: any) => {
          emitLog(onLog, serverId, 'incoming', methodFull, JSON.stringify(msg));
        });
        call.on('end', () => {
          const respond = () => {
            if (statusCode > 0) {
              callback({ code: statusCode, details: `Mock error: gRPC status ${statusCode}` });
            } else {
              const response = resolveResponse(config);
              emitLog(onLog, serverId, 'outgoing', methodFull, JSON.stringify(response));
              callback(null, response);
            }
          };
          if (delay > 0) setTimeout(respond, delay); else respond();
        });
      };

    case 'bidi_streaming':
      return (call: grpc.ServerDuplexStream<any, any>) => {
        if (statusCode > 0) {
          const fn = () => call.destroy({ code: statusCode, details: `Mock error: gRPC status ${statusCode}` } as any);
          if (delay > 0) setTimeout(fn, delay); else fn();
          return;
        }
        call.on('data', (msg: any) => {
          emitLog(onLog, serverId, 'incoming', methodFull, JSON.stringify(msg));
          const sendReply = () => {
            const response = resolveResponse(config, msg);
            call.write(response);
            emitLog(onLog, serverId, 'outgoing', methodFull, JSON.stringify(response));
          };
          if (delay > 0) setTimeout(sendReply, delay); else sendReply();
        });
        call.on('end', () => call.end());
      };

    default:
      return (_call: any, callback: any) => {
        callback({ code: grpc.status.UNIMPLEMENTED, details: 'Not implemented' });
      };
  }
}

// ─── Helpers ───

function resolveResponse(config: { response: string; responseScript?: string }, request?: any): any {
  if (config.responseScript) {
    try { return new Function('req', config.responseScript)(request); }
    catch (e) { return { error: (e as Error).message }; }
  }
  try { return JSON.parse(config.response); } catch { return {}; }
}

function emitLog(onLog: LogCallback | undefined, serverId: string, direction: string, method: string, data?: string) {
  onLog?.({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    serverId,
    direction: direction as any,
    protocol: 'grpc',
    event: method,
    body: data,
  });
}

function getNestedProperty(obj: any, pathStr: string): any {
  const parts = pathStr.split('.');
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

// ─── Server Reflection ───

/**
 * Register the grpc.reflection.v1alpha.ServerReflection service on the mock server.
 * This allows gRPC clients to auto-discover services and methods via reflection.
 */
function registerReflectionService(
  server: grpc.Server,
  methods: Array<{ service: string; method: string; type: string; enabled?: boolean }>,
) {
  const REFLECTION_PATH = '/grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo';

  // Build service→methods map
  const serviceMap = new Map<string, Array<{ method: string; type: string }>>();
  for (const m of methods) {
    const existing = serviceMap.get(m.service) || [];
    existing.push({ method: m.method, type: m.type });
    serviceMap.set(m.service, existing);
  }

  const serviceNames = Array.from(serviceMap.keys());

  // Define the reflection service as a bidi stream handler
  const reflectionServiceDef: Record<string, any> = {
    ServerReflectionInfo: {
      path: REFLECTION_PATH,
      requestStream: true,
      responseStream: true,
      requestSerialize: (v: any) => v, // pass-through (we handle raw buffers)
      requestDeserialize: (buf: Buffer) => buf,
      responseSerialize: (v: any) => v,
      responseDeserialize: (buf: Buffer) => buf,
    },
  };

  const handlers: Record<string, any> = {
    ServerReflectionInfo: (call: grpc.ServerDuplexStream<Buffer, Buffer>) => {
      call.on('data', (reqBuf: Buffer) => {
        // Parse the request to determine what's being asked
        const parsed = parseReflectionRequest(reqBuf);

        if (parsed.listServices) {
          // Respond with list of services
          const response = encodeListServicesResponse(serviceNames);
          call.write(response);
        } else if (parsed.fileContainingSymbol) {
          // Respond with a file descriptor for the requested service
          const svcName = parsed.fileContainingSymbol;
          const svcMethods = serviceMap.get(svcName);
          if (svcMethods) {
            const response = encodeFileDescriptorResponse(svcName, svcMethods);
            call.write(response);
          } else {
            // Service not found — send error
            const response = encodeErrorResponse(5, `Service not found: ${svcName}`);
            call.write(response);
          }
        }
      });
      call.on('end', () => call.end());
    },
  };

  server.addService(reflectionServiceDef, handlers);
}

// ─── Reflection Protocol Encoding Helpers ───

function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0;
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return Buffer.from(bytes);
}

function encodeStringField(fieldNumber: number, value: string): Buffer {
  const strBuf = Buffer.from(value, 'utf-8');
  const tag = encodeVarint((fieldNumber << 3) | 2);
  const len = encodeVarint(strBuf.length);
  return Buffer.concat([tag, len, strBuf]);
}

function encodeBytesField(fieldNumber: number, data: Buffer): Buffer {
  const tag = encodeVarint((fieldNumber << 3) | 2);
  const len = encodeVarint(data.length);
  return Buffer.concat([tag, len, data]);
}

function encodeSubmessageField(fieldNumber: number, data: Buffer): Buffer {
  const tag = encodeVarint((fieldNumber << 3) | 2);
  const len = encodeVarint(data.length);
  return Buffer.concat([tag, len, data]);
}

function encodeVarintField(fieldNumber: number, value: number): Buffer {
  const tag = encodeVarint((fieldNumber << 3) | 0);
  const val = encodeVarint(value);
  return Buffer.concat([tag, val]);
}

/**
 * Encode a ListServicesResponse (ServerReflectionResponse field 6)
 */
function encodeListServicesResponse(serviceNames: string[]): Buffer {
  // ListServiceResponse: repeated ServiceResponse (field 1)
  // ServiceResponse: string name (field 1)
  const serviceBuffers = serviceNames.map(name => {
    const nameField = encodeStringField(1, name);
    return encodeSubmessageField(1, nameField); // ServiceResponse in repeated field 1
  });
  const listResponse = Buffer.concat(serviceBuffers);
  // ServerReflectionResponse: ListServiceResponse is field 6
  return encodeSubmessageField(6, listResponse);
}

/**
 * Encode a FileDescriptorResponse (ServerReflectionResponse field 4)
 * containing a synthetic FileDescriptorProto for the given service.
 */
function encodeFileDescriptorResponse(
  serviceName: string,
  methods: Array<{ method: string; type: string }>,
): Buffer {
  // Build a FileDescriptorProto
  const pkg = serviceName.includes('.') ? serviceName.substring(0, serviceName.lastIndexOf('.')) : '';
  const shortName = serviceName.includes('.') ? serviceName.substring(serviceName.lastIndexOf('.') + 1) : serviceName;

  // Encode MethodDescriptorProto for each method
  const methodBuffers = methods.map(m => {
    const parts: Buffer[] = [];
    parts.push(encodeStringField(1, m.method)); // name
    parts.push(encodeStringField(2, `.${serviceName}.${m.method}Request`)); // input_type
    parts.push(encodeStringField(3, `.${serviceName}.${m.method}Response`)); // output_type
    if (m.type === 'client_streaming' || m.type === 'bidi_streaming') {
      parts.push(encodeVarintField(5, 1)); // client_streaming = true
    }
    if (m.type === 'server_streaming' || m.type === 'bidi_streaming') {
      parts.push(encodeVarintField(6, 1)); // server_streaming = true
    }
    return Buffer.concat(parts);
  });

  // ServiceDescriptorProto: name (field 1) + repeated method (field 2)
  const svcParts: Buffer[] = [encodeStringField(1, shortName)];
  for (const mb of methodBuffers) {
    svcParts.push(encodeSubmessageField(2, mb));
  }
  const serviceDesc = Buffer.concat(svcParts);

  // FileDescriptorProto: package (field 2) + service (field 6)
  const fdParts: Buffer[] = [];
  fdParts.push(encodeStringField(1, `${serviceName}.proto`)); // name (field 1)
  if (pkg) fdParts.push(encodeStringField(2, pkg)); // package (field 2)
  fdParts.push(encodeSubmessageField(6, serviceDesc)); // service (field 6)
  const fileDescriptor = Buffer.concat(fdParts);

  // FileDescriptorResponse: repeated bytes file_descriptor_proto (field 1)
  const fdResponse = encodeBytesField(1, fileDescriptor);
  // ServerReflectionResponse: FileDescriptorResponse is field 4
  return encodeSubmessageField(4, fdResponse);
}

/**
 * Encode an ErrorResponse (ServerReflectionResponse field 7)
 */
function encodeErrorResponse(code: number, message: string): Buffer {
  const parts = [encodeVarintField(1, code), encodeStringField(2, message)];
  return encodeSubmessageField(7, Buffer.concat(parts));
}

/**
 * Parse a ServerReflectionRequest buffer to determine the request type.
 */
function parseReflectionRequest(buf: Buffer): { listServices?: boolean; fileContainingSymbol?: string } {
  let offset = 0;
  while (offset < buf.length) {
    // Read tag
    let tag = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = buf[offset++];
      tag |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);

    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      // Length-delimited
      let len = 0;
      shift = 0;
      do {
        byte = buf[offset++];
        len |= (byte & 0x7f) << shift;
        shift += 7;
      } while (byte & 0x80);

      const data = buf.slice(offset, offset + len);
      offset += len;

      if (fieldNumber === 3) {
        // list_services (field 3)
        return { listServices: true };
      } else if (fieldNumber === 4) {
        // file_containing_symbol (field 4)
        return { fileContainingSymbol: data.toString('utf-8') };
      }
    } else if (wireType === 0) {
      // Varint — skip
      do { byte = buf[offset++]; } while (byte & 0x80);
    }
  }
  return {};
}
