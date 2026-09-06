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
import { splitUrl, schemeFor, buildOpenApiDoc } from './openapi-doc';

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
