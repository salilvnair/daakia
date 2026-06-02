/**
 * OpenAPI 3.x / Swagger 2.x Importer
 *
 * Parses OpenAPI 3.x or Swagger 2.x (JSON/YAML) and imports it into Daakia's
 * SQLite collection store (folders grouped by tags, requests per operation).
 */
import { randomUUID } from 'crypto';
import * as yaml from 'js-yaml';
import { upsertCollection, upsertCollectionRequest, type CollectionRequestRow } from '../storage/db';
import type { ImportResult } from './import-types';

// ─── OpenAPI Types (subset) ──────────────────────────────────────────────────

interface OpenAPIParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required?: boolean;
  schema?: { type?: string; default?: unknown; example?: unknown };
  example?: unknown;
  description?: string;
}

interface OpenAPIRequestBody {
  content?: Record<string, { schema?: object; example?: unknown; examples?: Record<string, { value?: unknown }> }>;
  required?: boolean;
}

interface OpenAPISecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  name?: string;
  in?: string;
}

interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  security?: Record<string, string[]>[];
  deprecated?: boolean;
}

interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  head?: OpenAPIOperation;
  options?: OpenAPIOperation;
  parameters?: OpenAPIParameter[];
}

interface OpenAPISpec {
  openapi?: string; // "3.x.x"
  swagger?: string; // "2.0"
  info?: { title?: string; version?: string; description?: string };
  host?: string; // Swagger 2.x
  basePath?: string; // Swagger 2.x
  schemes?: string[]; // Swagger 2.x
  servers?: { url?: string; description?: string }[];
  paths?: Record<string, OpenAPIPathItem>;
  tags?: { name: string; description?: string }[];
  components?: { securitySchemes?: Record<string, OpenAPISecurityScheme> };
  securityDefinitions?: Record<string, OpenAPISecurityScheme>; // Swagger 2.x
}

// Swagger 2.x operation has different body handling
interface Swagger2Parameter {
  name: string;
  in: string;
  required?: boolean;
  schema?: { type?: string; default?: unknown; example?: unknown };
  example?: unknown;
  description?: string;
  type?: string;
}

interface Swagger2Operation extends Omit<OpenAPIOperation, 'parameters'> {
  consumes?: string[];
  produces?: string[];
  parameters?: Swagger2Parameter[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

function getBaseUrl(spec: OpenAPISpec): string {
  // OpenAPI 3.x
  if (spec.servers && spec.servers.length > 0) {
    return spec.servers[0].url ?? '';
  }
  // Swagger 2.x
  if (spec.host) {
    const scheme = spec.schemes?.[0] ?? 'https';
    const basePath = spec.basePath ?? '';
    return `${scheme}://${spec.host}${basePath}`;
  }
  return '';
}

function resolveParameterValue(param: OpenAPIParameter): string {
  if (param.example !== undefined) return String(param.example);
  if (param.schema?.example !== undefined) return String(param.schema.example);
  if (param.schema?.default !== undefined) return String(param.schema.default);
  // Use placeholder
  return `{{${param.name}}}`;
}

function buildHeaders(params: OpenAPIParameter[] | undefined): { key: string; value: string; enabled: boolean }[] {
  if (!params) return [];
  return params
    .filter(p => p.in === 'header')
    .map(p => ({ key: p.name, value: resolveParameterValue(p), enabled: true }));
}

function buildQueryParams(params: OpenAPIParameter[] | undefined): { key: string; value: string; enabled: boolean }[] {
  if (!params) return [];
  return params
    .filter(p => p.in === 'query')
    .map(p => ({ key: p.name, value: resolveParameterValue(p), enabled: !!(p.required) }));
}

function buildUrlWithPathParams(baseUrl: string, path: string, params: OpenAPIParameter[] | undefined): string {
  let fullPath = path;
  if (params) {
    for (const p of params) {
      if (p.in === 'path') {
        const value = resolveParameterValue(p);
        fullPath = fullPath.replace(`{${p.name}}`, value);
      }
    }
  }
  // Replace any remaining {param} with {{param}} variable syntax
  fullPath = fullPath.replace(/\{([^}]+)\}/g, '{{$1}}');
  return `${baseUrl}${fullPath}`;
}

function extractRequestBody(operation: OpenAPIOperation | Swagger2Operation, isSwagger2: boolean): { bodyMode: string; bodyRaw: string; bodyFormData: object[]; bodyUrlEncoded: object[] } {
  const noBody = { bodyMode: 'none', bodyRaw: '', bodyFormData: [], bodyUrlEncoded: [] };

  if (isSwagger2) {
    // Swagger 2.x: body is in parameters with in=body or in=formData
    const swOp = operation as Swagger2Operation;
    const bodyParam = swOp.parameters?.find(p => p.in === 'body');
    if (bodyParam) {
      return { bodyMode: 'json', bodyRaw: '{}', bodyFormData: [], bodyUrlEncoded: [] };
    }
    const formParams = swOp.parameters?.filter(p => p.in === 'formData');
    if (formParams && formParams.length > 0) {
      const consumes = swOp.consumes ?? [];
      if (consumes.includes('multipart/form-data')) {
        return {
          bodyMode: 'form-data',
          bodyRaw: '',
          bodyFormData: formParams.map(p => ({ key: p.name, value: '', type: 'text', enabled: true })),
          bodyUrlEncoded: [],
        };
      }
      return {
        bodyMode: 'x-www-form-urlencoded',
        bodyRaw: '',
        bodyFormData: [],
        bodyUrlEncoded: formParams.map(p => ({ key: p.name, value: '', enabled: true })),
      };
    }
    return noBody;
  }

  // OpenAPI 3.x
  const reqBody = operation.requestBody;
  if (!reqBody?.content) return noBody;

  const contentTypes = Object.keys(reqBody.content);
  if (contentTypes.includes('application/json')) {
    const jsonContent = reqBody.content['application/json'];
    let rawBody = '{}';
    if (jsonContent.example) {
      rawBody = JSON.stringify(jsonContent.example, null, 2);
    } else if (jsonContent.examples) {
      const first = Object.values(jsonContent.examples)[0];
      if (first?.value) rawBody = JSON.stringify(first.value, null, 2);
    }
    return { bodyMode: 'json', bodyRaw: rawBody, bodyFormData: [], bodyUrlEncoded: [] };
  }
  if (contentTypes.includes('multipart/form-data')) {
    return { bodyMode: 'form-data', bodyRaw: '', bodyFormData: [], bodyUrlEncoded: [] };
  }
  if (contentTypes.includes('application/x-www-form-urlencoded')) {
    return { bodyMode: 'x-www-form-urlencoded', bodyRaw: '', bodyFormData: [], bodyUrlEncoded: [] };
  }
  if (contentTypes.includes('application/xml') || contentTypes.includes('text/xml')) {
    return { bodyMode: 'raw', bodyRaw: '', bodyFormData: [], bodyUrlEncoded: [] };
  }

  return noBody;
}

function getOperationName(method: string, path: string, operation: OpenAPIOperation): string {
  if (operation.summary) return operation.summary;
  if (operation.operationId) return operation.operationId;
  return `${method.toUpperCase()} ${path}`;
}

// ─── Importer ────────────────────────────────────────────────────────────────

function importOperations(spec: OpenAPISpec, rootCollectionId: string): number {
  const baseUrl = getBaseUrl(spec);
  const isSwagger2 = !!spec.swagger;
  const paths = spec.paths ?? {};

  // Group operations by tag
  const tagFolders = new Map<string, string>(); // tag name → folder ID
  let requestCount = 0;

  for (const [path, pathItem] of Object.entries(paths)) {
    const pathParams = pathItem.parameters;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      // Merge path-level + operation-level parameters
      const allParams = [...(pathParams ?? []), ...(operation.parameters ?? [])];

      // Determine folder (use first tag, or "Untagged")
      const tag = operation.tags?.[0] ?? 'Untagged';
      let folderId = tagFolders.get(tag);
      if (!folderId) {
        folderId = randomUUID();
        upsertCollection(folderId, tag, rootCollectionId);
        tagFolders.set(tag, folderId);
      }

      // Build request
      const name = getOperationName(method, path, operation);
      const url = buildUrlWithPathParams(baseUrl, path, allParams);
      const headers = buildHeaders(allParams);
      const params = buildQueryParams(allParams);
      const body = extractRequestBody(operation, isSwagger2);

      // Add content-type header for body requests
      if (body.bodyMode === 'json' && !headers.some(h => h.key.toLowerCase() === 'content-type')) {
        headers.push({ key: 'Content-Type', value: 'application/json', enabled: true });
      }

      const requestRow: CollectionRequestRow = {
        id: randomUUID(),
        collection_id: folderId,
        name,
        method: method.toUpperCase(),
        url,
        data: JSON.stringify({
          headers,
          params,
          ...body,
          authType: 'none',
          authData: {},
        }),
        sort_order: requestCount,
      };
      upsertCollectionRequest(requestRow);
      requestCount++;
    }
  }

  return requestCount;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Detect whether a string is an OpenAPI/Swagger spec.
 * Returns true if it looks like OpenAPI 3.x or Swagger 2.x.
 */
export function isOpenAPISpec(content: string): boolean {
  // Quick heuristic before full parse
  return content.includes('"openapi"') || content.includes("'openapi'") ||
    content.includes('openapi:') || content.includes('"swagger"') ||
    content.includes("'swagger'") || content.includes('swagger:');
}

/**
 * Parse and import an OpenAPI 3.x or Swagger 2.x spec (JSON or YAML)
 * into the database as a collection with tag-based folders.
 */
export function importOpenAPISpec(content: string): ImportResult {
  try {
    // Parse JSON or YAML
    let spec: OpenAPISpec;
    const trimmed = content.trim();
    if (trimmed.startsWith('{')) {
      spec = JSON.parse(trimmed);
    } else {
      spec = yaml.load(trimmed) as OpenAPISpec;
    }

    // Validate
    if (!spec.openapi && !spec.swagger) {
      return { success: false, collectionName: '', requestCount: 0, error: 'Not a valid OpenAPI 3.x or Swagger 2.x file' };
    }
    if (!spec.paths || Object.keys(spec.paths).length === 0) {
      return { success: false, collectionName: '', requestCount: 0, error: 'No paths/endpoints found in the spec' };
    }

    const collectionName = spec.info?.title ?? 'Imported API';
    const collectionId = randomUUID();

    // Create root collection
    upsertCollection(collectionId, collectionName, null);

    // Import all operations
    const requestCount = importOperations(spec, collectionId);

    return { success: true, collectionName, requestCount };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown parse error';
    return { success: false, collectionName: '', requestCount: 0, error: message };
  }
}
