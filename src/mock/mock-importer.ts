/**
 * mock-importer.ts — Import OpenAPI / Postman / WireMock → MockRoute[] (6A.19-6A.20).
 */
import * as yaml from 'js-yaml';
import type { MockRoute, HttpMethod } from './mock-types';

// ─── OpenAPI 3.x Import (6A.19) ──────────────────────────────────────────────

export interface ImportResult {
  routes: Partial<MockRoute>[];
  warnings: string[];
}

export function importOpenApi(content: string): ImportResult {
  const warnings: string[] = [];
  let spec: Record<string, unknown>;

  try {
    spec = (content.trim().startsWith('{') ? JSON.parse(content) : yaml.load(content)) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Failed to parse OpenAPI spec: ${e}`);
  }

  const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>;
  const routes: Partial<MockRoute>[] = [];

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].indexOf(method) < 0) continue;
      const op = operation as Record<string, unknown>;
      const operationId = String(op.operationId ?? `${method}_${path.replace(/\//g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`);
      const summary = String(op.summary ?? operationId);

      // Find best response
      const responses = (op.responses ?? {}) as Record<string, Record<string, unknown>>;
      const statusCode = findBestStatus(Object.keys(responses));
      const response = responses[String(statusCode)] ?? responses['default'] ?? {};
      const responseDesc = String((response as Record<string, unknown>).description ?? '');

      // Generate body from schema
      const body = extractResponseBody(response as Record<string, unknown>, spec);

      // Extract headers from response
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const responseHeaders = ((response as Record<string, unknown>).headers ?? {}) as Record<string, Record<string, unknown>>;
      for (const [hk, hv] of Object.entries(responseHeaders)) {
        const example = (hv as Record<string, unknown>).example;
        if (example) headers[hk] = String(example);
      }

      routes.push({
        id: crypto.randomUUID(),
        method: method.toUpperCase() as HttpMethod,
        path: convertOpenApiPath(path),
        statusCode,
        headers,
        body,
        delay: 0,
        enabled: true,
        // Store operationId as a comment in body if needed
      });

      if (!body.trim() || body === '{}') {
        warnings.push(`No example response for ${method.toUpperCase()} ${path} (${statusCode} ${responseDesc})`);
      }
    }
  }

  return { routes, warnings };
}

function findBestStatus(statusCodes: string[]): number {
  const preferred = ['200', '201', '202', '204', '2xx', 'default'];
  for (const p of preferred) {
    if (statusCodes.includes(p)) return parseInt(p) || 200;
  }
  const twoxx = statusCodes.find(s => s.startsWith('2'));
  return twoxx ? parseInt(twoxx) : 200;
}

function convertOpenApiPath(path: string): string {
  // /users/{userId}/posts/{postId} → /users/:userId/posts/:postId
  return path.replace(/\{([^}]+)\}/g, ':$1');
}

function extractResponseBody(response: Record<string, unknown>, spec: Record<string, unknown>): string {
  const content = response.content as Record<string, unknown> | undefined;
  if (!content) return '{}';

  const mediaType = content['application/json'] ?? content['*/*'] ?? Object.values(content)[0];
  if (!mediaType) return '{}';

  const mt = mediaType as Record<string, unknown>;

  // Use example directly if available
  if (mt.example !== undefined) return JSON.stringify(mt.example, null, 2);

  // Use first example from examples map
  const examples = mt.examples as Record<string, Record<string, unknown>> | undefined;
  if (examples) {
    const first = Object.values(examples)[0];
    if (first?.value !== undefined) return JSON.stringify(first.value, null, 2);
  }

  // Generate from schema
  const schema = resolveRef(mt.schema as Record<string, unknown>, spec);
  if (schema) return JSON.stringify(generateFromSchema(schema, spec), null, 2);

  return '{}';
}

function resolveRef(schema: Record<string, unknown> | undefined, spec: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!schema) return undefined;
  if (!schema.$ref) return schema;
  const ref = String(schema.$ref);
  if (!ref.startsWith('#/')) return schema;
  const parts = ref.slice(2).split('/');
  let current: unknown = spec;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current as Record<string, unknown>;
}

function generateFromSchema(schema: Record<string, unknown>, spec: Record<string, unknown>, depth = 0): unknown {
  if (depth > 5) return null;
  const resolved = resolveRef(schema, spec) ?? schema;

  if (resolved.example !== undefined) return resolved.example;

  const type = resolved.type as string;
  const format = resolved.format as string;

  if (resolved.enum) return (resolved.enum as unknown[])[0];

  switch (type) {
    case 'object': {
      const props = (resolved.properties ?? {}) as Record<string, Record<string, unknown>>;
      const obj: Record<string, unknown> = {};
      for (const [key, propSchema] of Object.entries(props)) {
        obj[key] = generateFromSchema(resolveRef(propSchema, spec) ?? propSchema, spec, depth + 1);
      }
      if (resolved.additionalProperties && Object.keys(obj).length === 0) {
        obj['key'] = 'value';
      }
      return obj;
    }
    case 'array': {
      const items = resolved.items as Record<string, unknown> | undefined;
      const item = items ? generateFromSchema(resolveRef(items, spec) ?? items, spec, depth + 1) : 'item';
      return [item];
    }
    case 'string':
      if (format === 'date-time') return new Date().toISOString();
      if (format === 'date')      return new Date().toISOString().slice(0, 10);
      if (format === 'uuid')      return crypto.randomUUID();
      if (format === 'email')     return 'user@example.com';
      if (format === 'uri')       return 'https://example.com';
      return 'string';
    case 'number':
    case 'integer':
      if (format === 'int64') return 1234567890;
      return 1;
    case 'boolean':
      return true;
    case 'null':
      return null;
    default:
      if (resolved.oneOf) return generateFromSchema((resolved.oneOf as Record<string, unknown>[])[0], spec, depth + 1);
      if (resolved.anyOf) return generateFromSchema((resolved.anyOf as Record<string, unknown>[])[0], spec, depth + 1);
      if (resolved.allOf) {
        const merged: Record<string, unknown> = {};
        (resolved.allOf as Record<string, unknown>[]).forEach(s => {
          const sub = generateFromSchema(resolveRef(s, spec) ?? s, spec, depth + 1);
          if (typeof sub === 'object' && sub !== null) Object.assign(merged, sub);
        });
        return merged;
      }
      return null;
  }
}

// ─── Postman Collection Import (6A.20) ───────────────────────────────────────

export function importPostman(content: string): ImportResult {
  const warnings: string[] = [];
  let collection: Record<string, unknown>;

  try {
    collection = JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error('Failed to parse Postman collection JSON');
  }

  const routes: Partial<MockRoute>[] = [];
  const items = (collection.item ?? []) as Record<string, unknown>[];

  function processItems(items: Record<string, unknown>[]) {
    for (const item of items) {
      if (item.item) {
        // Folder — recurse
        processItems(item.item as Record<string, unknown>[]);
        continue;
      }
      const req = item.request as Record<string, unknown> | undefined;
      if (!req) continue;

      const method = String(req.method ?? 'GET').toUpperCase() as HttpMethod;
      const urlObj = req.url as Record<string, unknown> | string | undefined;
      let path = '/';
      if (typeof urlObj === 'string') {
        try { path = new URL(urlObj).pathname; } catch { path = urlObj; }
      } else if (urlObj) {
        const rawPath = (urlObj.path as string[])?.join('/') ?? '/';
        path = '/' + rawPath.replace(/^\//, '');
        // Convert :variable → :variable (already colon style in Postman)
        path = path.replace(/:([^/]+)/g, ':$1');
      }

      // Find example response
      const responses = (item.response ?? []) as Record<string, unknown>[];
      let body = '{}';
      let statusCode = 200;
      if (responses.length > 0) {
        const firstResp = responses[0];
        statusCode = parseInt(String(firstResp.status ?? 200)) || 200;
        const rawBody = firstResp.body;
        if (typeof rawBody === 'string' && rawBody.trim()) {
          body = rawBody;
        }
      }

      routes.push({
        id: crypto.randomUUID(),
        method,
        path,
        statusCode,
        headers: { 'Content-Type': 'application/json' },
        body,
        delay: 0,
        enabled: true,
      });
    }
  }

  processItems(items);
  return { routes, warnings };
}

// ─── WireMock JSON Import (6A.20) ────────────────────────────────────────────

export function importWireMock(content: string): ImportResult {
  const warnings: string[] = [];
  const routes: Partial<MockRoute>[] = [];

  let mappings: unknown[];
  try {
    const parsed = JSON.parse(content);
    mappings = Array.isArray(parsed) ? parsed : parsed.mappings ?? [parsed];
  } catch {
    throw new Error('Failed to parse WireMock JSON');
  }

  for (const mapping of mappings as Record<string, unknown>[]) {
    const req = mapping.request as Record<string, unknown> ?? {};
    const resp = mapping.response as Record<string, unknown> ?? {};

    const method = String(req.method ?? 'GET').toUpperCase() as HttpMethod;

    // URL matching
    let path = '/';
    if (req.url)        path = String(req.url);
    else if (req.urlPath) path = String(req.urlPath);
    else if (req.urlPathPattern) path = String(req.urlPathPattern).replace(/^\^/, '').replace(/\$$/, '');
    else if (req.urlPattern)    path = String(req.urlPattern);

    const statusCode = parseInt(String(resp.status ?? 200)) || 200;
    const body = resp.body
      ? String(resp.body)
      : resp.jsonBody
        ? JSON.stringify(resp.jsonBody, null, 2)
        : '{}';

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const respHeaders = resp.headers as Record<string, string> | undefined;
    if (respHeaders) Object.assign(headers, respHeaders);

    const delay = parseInt(String(resp.fixedDelayMilliseconds ?? 0)) || 0;

    routes.push({
      id: crypto.randomUUID(),
      method,
      path,
      statusCode,
      headers,
      body,
      delay,
      enabled: true,
      priority: parseInt(String(mapping.priority ?? 5)) || 5,
    });
  }

  return { routes, warnings };
}
