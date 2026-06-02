/**
 * gRPC Server Reflection client — discovers services/methods from a
 * gRPC server without requiring local proto files.
 * Uses the grpc.reflection.v1alpha protocol (falls back to v1).
 *
 * Flow:
 * 1. Connect to server and send ListServices request
 * 2. For each service, send FileContainingSymbol to get the FileDescriptorProto
 * 3. Parse FileDescriptorProto to extract methods + streaming types
 */
import * as grpc from '@grpc/grpc-js';
import type { ProtoService, ProtoMethod } from './proto-loader';

const REFLECTION_SERVICE_ALPHA = 'grpc.reflection.v1alpha.ServerReflection';
const REFLECTION_SERVICE_V1 = 'grpc.reflection.v1.ServerReflection';

// ─── Minimal protobuf wire-format helpers for reflection protocol ───
// We manually encode/decode to avoid requiring a full protobuf library dependency.

/**
 * Encode a varint (LEB128)
 */
function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return Buffer.from(bytes);
}

/**
 * Encode a string field: (field_tag) + (length) + (utf8 bytes)
 */
function encodeStringField(fieldNumber: number, value: string): Buffer {
  const strBuf = Buffer.from(value, 'utf-8');
  const tag = encodeVarint((fieldNumber << 3) | 2); // wire type 2 = length-delimited
  const len = encodeVarint(strBuf.length);
  return Buffer.concat([tag, len, strBuf]);
}

/**
 * Encode a ServerReflectionRequest for list_services (field 3)
 */
function encodeListServicesRequest(): Buffer {
  return encodeStringField(3, '');
}

/**
 * Encode a ServerReflectionRequest for file_containing_symbol (field 4)
 */
function encodeFileContainingSymbolRequest(symbol: string): Buffer {
  return encodeStringField(4, symbol);
}

/**
 * Decode a varint from buffer at offset. Returns [value, newOffset].
 */
function decodeVarint(buf: Buffer, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let byte: number;
  do {
    if (offset >= buf.length) throw new Error('Varint overflows buffer');
    byte = buf[offset++];
    result |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);
  return [result >>> 0, offset];
}

/**
 * Skip a field based on wire type.
 */
function skipField(buf: Buffer, offset: number, wireType: number): number {
  switch (wireType) {
    case 0: { // varint
      while (offset < buf.length && buf[offset++] & 0x80) { /* skip */ }
      return offset;
    }
    case 1: return offset + 8; // 64-bit
    case 2: { // length-delimited
      const [len, newOff] = decodeVarint(buf, offset);
      return newOff + len;
    }
    case 5: return offset + 4; // 32-bit
    default: throw new Error(`Unknown wire type: ${wireType}`);
  }
}

interface ParsedField {
  fieldNumber: number;
  wireType: number;
  data: Buffer | number;
}

/**
 * Parse all fields from a protobuf message buffer.
 */
function parseMessage(buf: Buffer): ParsedField[] {
  const fields: ParsedField[] = [];
  let offset = 0;
  while (offset < buf.length) {
    const [tag, tagEnd] = decodeVarint(buf, offset);
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x07;

    if (wireType === 0) {
      const [value, newOff] = decodeVarint(buf, tagEnd);
      fields.push({ fieldNumber, wireType, data: value });
      offset = newOff;
    } else if (wireType === 2) {
      const [len, lenEnd] = decodeVarint(buf, tagEnd);
      const data = buf.slice(lenEnd, lenEnd + len);
      fields.push({ fieldNumber, wireType, data });
      offset = lenEnd + len;
    } else if (wireType === 1) {
      fields.push({ fieldNumber, wireType, data: buf.slice(tagEnd, tagEnd + 8) as any });
      offset = tagEnd + 8;
    } else if (wireType === 5) {
      fields.push({ fieldNumber, wireType, data: buf.slice(tagEnd, tagEnd + 4) as any });
      offset = tagEnd + 4;
    } else {
      offset = skipField(buf, tagEnd, wireType);
    }
  }
  return fields;
}

function getStringField(fields: ParsedField[], fieldNumber: number): string | undefined {
  const f = fields.find(ff => ff.fieldNumber === fieldNumber && ff.wireType === 2);
  return f ? (f.data as Buffer).toString('utf-8') : undefined;
}

function getBoolField(fields: ParsedField[], fieldNumber: number): boolean {
  const f = fields.find(ff => ff.fieldNumber === fieldNumber && ff.wireType === 0);
  return f ? (f.data as number) !== 0 : false;
}

function getSubmessageFields(fields: ParsedField[], fieldNumber: number): ParsedField[][] {
  return fields
    .filter(f => f.fieldNumber === fieldNumber && f.wireType === 2)
    .map(f => parseMessage(f.data as Buffer));
}

function getBytesFields(fields: ParsedField[], fieldNumber: number): Buffer[] {
  return fields
    .filter(f => f.fieldNumber === fieldNumber && f.wireType === 2)
    .map(f => f.data as Buffer);
}

/**
 * Discover all services and their methods from a gRPC server via reflection.
 * Returns services with fully typed methods including streaming info.
 */
export async function discoverServices(
  endpoint: string,
  tls: boolean
): Promise<ProtoService[]> {
  // grpc-js expects host:port without scheme — strip http(s)://
  const target = endpoint.replace(/^https?:\/\//, '');

  const credentials = tls
    ? grpc.credentials.createSsl()
    : grpc.credentials.createInsecure();

  // Try v1alpha first (most common), fall back to v1
  try {
    return await reflectWithService(target, credentials, REFLECTION_SERVICE_ALPHA);
  } catch (err: any) {
    if (err.message?.includes('UNIMPLEMENTED') || err.message?.includes('not found')) {
      return await reflectWithService(target, credentials, REFLECTION_SERVICE_V1);
    }
    throw err;
  }
}

async function reflectWithService(
  endpoint: string,
  credentials: grpc.ChannelCredentials,
  reflectionService: string,
): Promise<ProtoService[]> {
  const client = new grpc.Client(endpoint, credentials);

  try {
    // Step 1: List all services
    const serviceNames = await listServices(client, reflectionService);

    // Step 2: For each service, get file descriptor and extract methods
    const services: ProtoService[] = [];
    for (const svcName of serviceNames) {
      try {
        const methods = await getServiceMethods(client, reflectionService, svcName);
        services.push({ name: svcName, methods });
      } catch {
        // If we can't get methods for a service, include it with empty methods
        services.push({ name: svcName, methods: [] });
      }
    }

    return services;
  } finally {
    client.close();
  }
}

function listServices(client: grpc.Client, reflectionService: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const call = client.makeBidiStreamRequest(
      `/${reflectionService}/ServerReflectionInfo`,
      (msg: Buffer) => msg,
      (buf: Buffer) => buf,
      new grpc.Metadata()
    );

    let resolved = false;

    call.on('data', (responseBuf: Buffer) => {
      if (resolved) return;

      try {
        const fields = parseMessage(responseBuf);
        // Field 7 = error_response
        const errorFields = getSubmessageFields(fields, 7);
        if (errorFields.length > 0) {
          const errMsg = getStringField(errorFields[0], 2) || 'Reflection error';
          resolved = true;
          call.end();
          reject(new Error(errMsg));
          return;
        }

        // Field 6 = list_services_response
        const listSvcFields = getSubmessageFields(fields, 6);
        if (listSvcFields.length > 0) {
          resolved = true;
          // Field 1 = service (repeated ServiceResponse)
          const serviceResponses = getSubmessageFields(listSvcFields[0], 1);
          const names = serviceResponses
            .map(svc => getStringField(svc, 1) || '')
            .filter(n =>
              n &&
              n !== REFLECTION_SERVICE_ALPHA &&
              n !== REFLECTION_SERVICE_V1 &&
              !n.startsWith('grpc.reflection')
            );
          call.end();
          resolve(names);
        }
      } catch (err: any) {
        if (!resolved) { resolved = true; call.end(); reject(err); }
      }
    });

    call.on('error', (err: Error) => {
      if (!resolved) { resolved = true; reject(err); }
    });

    call.on('end', () => {
      if (!resolved) { resolved = true; resolve([]); }
    });

    // Send list services request
    call.write(encodeListServicesRequest());

    setTimeout(() => {
      if (!resolved) { resolved = true; call.cancel(); reject(new Error('Server reflection timed out')); }
    }, 15000);
  });
}

function getServiceMethods(
  client: grpc.Client,
  reflectionService: string,
  serviceName: string,
): Promise<ProtoMethod[]> {
  return new Promise((resolve, reject) => {
    const call = client.makeBidiStreamRequest(
      `/${reflectionService}/ServerReflectionInfo`,
      (msg: Buffer) => msg,
      (buf: Buffer) => buf,
      new grpc.Metadata()
    );

    let resolved = false;

    call.on('data', (responseBuf: Buffer) => {
      if (resolved) return;

      try {
        const fields = parseMessage(responseBuf);

        // Field 7 = error_response
        const errorFields = getSubmessageFields(fields, 7);
        if (errorFields.length > 0) {
          resolved = true;
          call.end();
          const errMsg = getStringField(errorFields[0], 2) || 'Cannot get file descriptor';
          reject(new Error(errMsg));
          return;
        }

        // Field 4 = file_descriptor_response
        const fdResponseFields = getSubmessageFields(fields, 4);
        if (fdResponseFields.length > 0) {
          resolved = true;
          call.end();

          const methods: ProtoMethod[] = [];
          // Field 1 = file_descriptor_proto (repeated bytes)
          const fdBytes = getBytesFields(fdResponseFields[0], 1);

          for (const fdBuf of fdBytes) {
            try {
              const fdFields = parseMessage(fdBuf);
              const pkg = getStringField(fdFields, 2) || ''; // field 2 = package

              // Field 6 = service (repeated ServiceDescriptorProto)
              const serviceDescs = getSubmessageFields(fdFields, 6);
              for (const svcFields of serviceDescs) {
                const svcName = getStringField(svcFields, 1) || '';
                const fullSvcName = pkg ? `${pkg}.${svcName}` : svcName;

                // Only extract methods for the requested service
                if (fullSvcName === serviceName || svcName === serviceName) {
                  // Field 2 = method (repeated MethodDescriptorProto)
                  const methodDescs = getSubmessageFields(svcFields, 2);
                  for (const mFields of methodDescs) {
                    const name = getStringField(mFields, 1) || '';
                    const inputType = (getStringField(mFields, 2) || '').replace(/^\./, '');
                    const outputType = (getStringField(mFields, 3) || '').replace(/^\./, '');
                    const clientStreaming = getBoolField(mFields, 5);
                    const serverStreaming = getBoolField(mFields, 6);

                    let type: ProtoMethod['type'] = 'unary';
                    if (clientStreaming && serverStreaming) type = 'bidi_streaming';
                    else if (clientStreaming) type = 'client_streaming';
                    else if (serverStreaming) type = 'server_streaming';

                    methods.push({
                      name,
                      fullName: `${fullSvcName}/${name}`,
                      requestType: inputType.split('.').pop() || inputType,
                      responseType: outputType.split('.').pop() || outputType,
                      requestStream: clientStreaming,
                      responseStream: serverStreaming,
                      type,
                    });
                  }
                }
              }
            } catch {
              // Skip unparseable descriptors
            }
          }

          resolve(methods);
        }
      } catch (err: any) {
        if (!resolved) { resolved = true; call.end(); reject(err); }
      }
    });

    call.on('error', (err: Error) => {
      if (!resolved) { resolved = true; reject(err); }
    });

    call.on('end', () => {
      if (!resolved) { resolved = true; resolve([]); }
    });

    // Request file descriptor for the service
    call.write(encodeFileContainingSymbolRequest(serviceName));

    setTimeout(() => {
      if (!resolved) { resolved = true; call.cancel(); reject(new Error('File descriptor request timed out')); }
    }, 15000);
  });
}
