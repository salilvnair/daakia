/**
 * Proto file loader — parses .proto files using @grpc/proto-loader
 * and extracts service definitions, method lists, and message types.
 */
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';

export interface ProtoService {
  name: string; // full service name (e.g. "helloworld.Greeter")
  methods: ProtoMethod[];
}

export interface ProtoMethod {
  name: string; // method name (e.g. "SayHello")
  fullName: string; // "helloworld.Greeter/SayHello"
  requestType: string;
  responseType: string;
  requestStream: boolean;
  responseStream: boolean;
  type: 'unary' | 'server_streaming' | 'client_streaming' | 'bidi_streaming';
}

export interface ProtoMessageField {
  name: string;
  type: string;
  repeated: boolean;
  optional: boolean;
}

/**
 * Load and parse a .proto file, returning available services and methods.
 */
export async function loadProtoFile(protoPath: string): Promise<ProtoService[]> {
  const packageDefinition = await protoLoader.load(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [path.dirname(protoPath)],
  });

  const services: ProtoService[] = [];

  for (const [name, def] of Object.entries(packageDefinition)) {
    // Service definitions have a "format" property that's absent
    if (isServiceDefinition(def)) {
      const methods: ProtoMethod[] = [];

      for (const [methodName, methodDef] of Object.entries(def)) {
        if (typeof methodDef === 'object' && methodDef && 'requestType' in methodDef) {
          const md = methodDef as any;
          const requestStream = md.requestStream || false;
          const responseStream = md.responseStream || false;

          let type: ProtoMethod['type'] = 'unary';
          if (requestStream && responseStream) type = 'bidi_streaming';
          else if (requestStream) type = 'client_streaming';
          else if (responseStream) type = 'server_streaming';

          methods.push({
            name: methodName,
            fullName: `${name}/${methodName}`,
            requestType: md.requestType?.type?.name || md.requestType?.name || 'unknown',
            responseType: md.responseType?.type?.name || md.responseType?.name || 'unknown',
            requestStream,
            responseStream,
            type,
          });
        }
      }

      if (methods.length > 0) {
        services.push({ name, methods });
      }
    }
  }

  return services;
}

/**
 * Generate a default JSON message from a proto message type's fields.
 * Returns a JSON string with all fields set to their default values.
 */
export function generateDefaultMessage(packageDefinition: any, messageType: string): string {
  try {
    const typeDef = packageDefinition[messageType];
    if (!typeDef || !typeDef.type || !typeDef.type.field) {
      return '{}';
    }

    const obj: Record<string, unknown> = {};
    for (const field of typeDef.type.field) {
      obj[field.name] = getDefaultForType(field.type, field.label === 'LABEL_REPEATED');
    }

    return JSON.stringify(obj, null, 2);
  } catch {
    return '{}';
  }
}

function getDefaultForType(type: string, repeated: boolean): unknown {
  const defaults: Record<string, unknown> = {
    TYPE_STRING: '',
    TYPE_BYTES: '',
    TYPE_BOOL: false,
    TYPE_INT32: 0,
    TYPE_INT64: '0',
    TYPE_UINT32: 0,
    TYPE_UINT64: '0',
    TYPE_SINT32: 0,
    TYPE_SINT64: '0',
    TYPE_FIXED32: 0,
    TYPE_FIXED64: '0',
    TYPE_SFIXED32: 0,
    TYPE_SFIXED64: '0',
    TYPE_FLOAT: 0.0,
    TYPE_DOUBLE: 0.0,
    TYPE_ENUM: 0,
    TYPE_MESSAGE: {},
  };

  const value = defaults[type] ?? '';
  return repeated ? [value] : value;
}

function isServiceDefinition(def: unknown): boolean {
  if (!def || typeof def !== 'object') return false;
  // Service definitions in proto-loader have methods as direct properties
  // with requestType/responseType
  const entries = Object.values(def as object);
  return entries.length > 0 && entries.some(
    (v) => typeof v === 'object' && v !== null && 'requestType' in v
  );
}
