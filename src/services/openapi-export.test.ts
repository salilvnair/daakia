/**
 * What the OpenAPI export says about where an API lives and how to get in.
 *
 * The document had `openapi`, `info` and `paths` and nothing else: no
 * `servers`, so the base URL was baked into every path, and no
 * `components.securitySchemes`, so the bearer token or API key each request
 * carries simply vanished — the spec described an API that lives nowhere and
 * needs no credentials.
 *
 * The two helpers below are the whole of that decision, which is why they are
 * exported: the rest of the exporter is a save dialog.
 */
import { describe, it, expect } from 'vitest';
import { splitUrl, schemeFor, buildOpenApiDoc, inferSchema, schemaFromBody, responsesFrom } from './openapi-doc';

describe('splitting a URL into a path and a server', () => {
  it('takes the origin off an absolute URL', () => {
    expect(splitUrl('https://api.example.com/v1/users?a=1'))
      .toEqual({ path: '/v1/users', server: 'https://api.example.com' });
  });

  /* The convention every exported Postman collection uses. It used to parse
     as a host of `placeholder{{baseurl}}`, so the base URL vanished. */
  it('treats a leading variable as the base URL', () => {
    expect(splitUrl('{{baseUrl}}/users')).toEqual({ path: '/users', server: '{{baseUrl}}' });
  });

  /* And when the variable IS the whole URL, the path is the root — not a
     collision with every other request that also collapsed to `/`. */
  it('handles a URL that is only the variable', () => {
    expect(splitUrl('{{baseUrl}}')).toEqual({ path: '/', server: '{{baseUrl}}' });
  });

  /* `{id}` is OpenAPI's own path-parameter syntax. Percent-encoded it is a
     literal no tool reads as a parameter. */
  it('keeps path templating unescaped', () => {
    expect(splitUrl('{{baseUrl}}/users/{id}/posts').path).toBe('/users/{id}/posts');
    expect(splitUrl('https://api.example.com/users/{id}').path).toBe('/users/{id}');
  });

  it('drops the query, which OpenAPI carries as parameters', () => {
    expect(splitUrl('{{baseUrl}}/search?q=1&page=2').path).toBe('/search');
  });

  it('leaves a bare path alone', () => {
    expect(splitUrl('/users')).toEqual({ path: '/users' });
  });

  it('gives an empty URL the root path and no server', () => {
    expect(splitUrl('')).toEqual({ path: '/' });
  });
});

describe('the security scheme a request implies', () => {
  it('names a bearer token as HTTP bearer', () => {
    expect(schemeFor({ authType: 'bearer', authData: { token: 't' } }))
      .toEqual({ name: 'bearerAuth', scheme: { type: 'http', scheme: 'bearer' } });
  });

  it('names basic auth as HTTP basic', () => {
    expect(schemeFor({ authType: 'basic', authData: { username: 'u' } })?.scheme)
      .toEqual({ type: 'http', scheme: 'basic' });
  });

  it('carries an API key with its header name and location', () => {
    expect(schemeFor({ authType: 'apikey', authData: { key: 'X-Api-Key', addTo: 'header' } }))
      .toEqual({ name: 'apiKey_X_Api_Key', scheme: { type: 'apiKey', in: 'header', name: 'X-Api-Key' } });
  });

  /* Two different API-key headers in one collection are two schemes. Naming
     both `apiKeyAuth` would silently keep whichever was written last. */
  it('gives two different keys two different names', () => {
    const a = schemeFor({ authType: 'apikey', authData: { key: 'X-Api-Key' } })!;
    const b = schemeFor({ authType: 'apikey', authData: { key: 'X-Tenant' } })!;
    expect(a.name).not.toBe(b.name);
  });

  it('has nothing to say about no auth, or an API key with no name', () => {
    expect(schemeFor({ authType: 'none' })).toBeNull();
    expect(schemeFor({ authType: 'apikey', authData: { key: '  ' } })).toBeNull();
  });
});

describe('the assembled document', () => {
  const ctx = () => ({
    paths: { '/users': { get: { summary: 'List', operationId: 'List', tags: ['t'], responses: {} } } },
    servers: new Set(['https://api.example.com']),
    schemes: new Map([['bearerAuth', { type: 'http' as const, scheme: 'bearer' }]]),
  });

  it('declares the servers it found', () => {
    expect(buildOpenApiDoc('Api', ctx() as never).servers).toEqual([{ url: 'https://api.example.com' }]);
  });

  it('declares the schemes it found', () => {
    const doc = buildOpenApiDoc('Api', ctx() as never) as { components?: { securitySchemes: unknown } };
    expect(doc.components?.securitySchemes).toEqual({ bearerAuth: { type: 'http', scheme: 'bearer' } });
  });

  /* One app was producing two spec versions depending which button you
     pressed — the exporter said 3.0.3, the AI generator said 3.1. */
  it('is 3.1, the same version the AI generator claims', () => {
    expect(buildOpenApiDoc('Api', ctx() as never).openapi).toBe('3.1.0');
  });

  /* An empty `servers: []` is not "unknown", it is a claim — and an empty
     securitySchemes block is noise in a diff. */
  it('omits both blocks entirely when there is nothing to say', () => {
    const doc = buildOpenApiDoc('Api', { paths: {}, servers: new Set(), schemes: new Map() } as never);
    expect('servers' in doc).toBe(false);
    expect('components' in doc).toBe(false);
  });
});

describe('a schema inferred from a body that came back', () => {
  it('describes an object by its keys, and says they were all there', () => {
    expect(inferSchema({ id: 1, name: 'Ada' })).toEqual({
      type: 'object',
      properties: { id: { type: 'integer' }, name: { type: 'string' } },
      required: ['id', 'name'],
    });
  });

  it('tells an integer from a number', () => {
    expect(inferSchema(3)).toEqual({ type: 'integer' });
    expect(inferSchema(3.5)).toEqual({ type: 'number' });
  });

  it('describes an array by its first element', () => {
    expect(inferSchema([{ id: 1 }])).toEqual({
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    });
  });

  it('says only "array" when there is nothing in it to describe', () => {
    expect(inferSchema([])).toEqual({ type: 'array' });
  });

  it.each([
    ['2026-09-06T12:00:00Z', 'date-time'],
    ['2026-09-06', 'date'],
    ['3f2504e0-4f89-11d3-9a0c-0305e82c3301', 'uuid'],
    ['ada@example.com', 'email'],
  ])('recognises %s as %s', (value, format) => {
    expect(inferSchema(value)).toEqual({ type: 'string', format });
  });

  it('leaves an ordinary string alone', () => {
    expect(inferSchema('hello')).toEqual({ type: 'string' });
  });

  /* A deeply nested response would otherwise produce a spec longer than the
     API it describes. */
  it('stops descending eventually', () => {
    let deep: unknown = 'leaf';
    for (let i = 0; i < 20; i++) deep = { next: deep };
    const json = JSON.stringify(inferSchema(deep));
    expect(json.length).toBeLessThan(2000);
  });

  it('has nothing to say about a body that is not JSON', () => {
    expect(schemaFromBody('<xml/>')).toBeUndefined();
    expect(schemaFromBody('')).toBeUndefined();
    expect(schemaFromBody(undefined)).toBeUndefined();
  });
});

describe('responses, from saved examples', () => {
  const ex = (over: Record<string, unknown> = {}) => ({
    id: 'e1', name: '200 OK', status: 200, statusText: 'OK',
    body: '{"id":1}', contentType: 'application/json; charset=utf-8', ...over,
  });

  it('describes each status it has an example for', () => {
    const out = responsesFrom([ex(), ex({ id: 'e2', name: 'Expired token', status: 401, body: '{"error":"expired"}' })]);
    expect(Object.keys(out).sort()).toEqual(['200', '401']);
    expect(out['401']!.description).toBe('Expired token');
  });

  it('carries a schema and the body itself, under the media type', () => {
    const media = responsesFrom([ex()])['200']!.content!['application/json']!;
    expect(media.schema).toEqual({ type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] });
    expect(media.example).toEqual({ id: 1 });
  });

  /* Two examples of the same status is the normal case — the first is the
     one the spec shows rather than the last one silently winning. */
  it('keeps the first example for a status', () => {
    const out = responsesFrom([ex({ name: 'First' }), ex({ id: 'e2', name: 'Second' })]);
    expect(out['200']!.description).toBe('First');
  });

  /* Says nothing rather than nothing at all: the placeholder trio is a shape
     tools can read, which an empty responses block is not. */
  it('falls back to the placeholders when there are no examples', () => {
    expect(Object.keys(responsesFrom(undefined))).toEqual(['200', '400', '500']);
    expect(Object.keys(responsesFrom([]))).toEqual(['200', '400', '500']);
  });

  it('ignores an example with no status', () => {
    expect(Object.keys(responsesFrom([ex({ status: 0 })]))).toEqual(['200', '400', '500']);
  });
});
