/**
 * Swagger URL import: from a URL, to an outline, to a collection that runs
 * against any environment.
 *
 * The fixture is a cut of the real Swagger Petstore 3 spec — its relative
 * server, its two security schemes, a path parameter shared by several
 * operations and a body that only has an example on its schema.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../storage/db', () => ({
  getCollectionBreadcrumb: () => [], getCollectionData: () => '{}',
  upsertCollection: () => {}, upsertCollectionRequest: () => {}, updateCollectionData: () => {},
}));
import { parseSpec, outlineSpec } from './spec-outline';
import { buildCollection, exampleFor, type ImportPlan } from './spec-build';
import { fetchSpec, specUrlsIn, isAllowedUrl, type FetchFn } from './spec-fetch';
import { mergeCollectionChain } from '../collection-inherit';

const PETSTORE = {
  openapi: '3.0.4',
  info: { title: 'Swagger Petstore - OpenAPI 3.0', version: '1.0.27' },
  servers: [{ url: '/api/v3' }],
  tags: [{ name: 'pet' }, { name: 'store' }],
  paths: {
    '/pet': {
      put: { tags: ['pet'], summary: 'Update an existing pet.', operationId: 'updatePet', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } }, security: [{ petstore_auth: ['write:pets'] }] },
    },
    '/pet/{petId}': {
      get: { tags: ['pet'], summary: 'Find pet by ID.', operationId: 'getPetById', parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'integer', format: 'int64' } }], security: [{ api_key: [] }, { petstore_auth: ['read:pets'] }] },
      delete: { tags: ['pet'], summary: 'Deletes a pet.', operationId: 'deletePet', parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'integer' } }], security: [{ petstore_auth: [] }] },
    },
    '/store/inventory': {
      get: { tags: ['store'], summary: 'Returns pet inventories by status.', operationId: 'getInventory', security: [{ api_key: [] }] },
    },
  },
  components: {
    schemas: {
      Pet: { type: 'object', properties: { id: { type: 'integer', example: 10 }, name: { type: 'string', example: 'doggie' }, status: { type: 'string', enum: ['available', 'pending'] }, photoUrls: { type: 'array', items: { type: 'string' } } } },
    },
    securitySchemes: {
      petstore_auth: { type: 'oauth2', flows: { implicit: { authorizationUrl: 'https://petstore3.swagger.io/oauth/authorize', scopes: { 'write:pets': '', 'read:pets': '' } } } },
      api_key: { type: 'apiKey', name: 'api_key', in: 'header' },
    },
  },
};
const TEXT = JSON.stringify(PETSTORE);
const SPEC_URL = 'https://petstore3.swagger.io/api/v3/openapi.json';

describe('the outline', () => {
  const { spec, format } = parseSpec(TEXT);
  const o = outlineSpec(spec, format, SPEC_URL);

  it('lists every operation with its tag, and names without the trailing full stop', () => {
    expect(o.operations.map(x => x.id)).toEqual(['PUT /pet', 'GET /pet/{petId}', 'DELETE /pet/{petId}', 'GET /store/inventory']);
    expect(o.operations[1]).toMatchObject({ summary: 'Find pet by ID', operationId: 'getPetById', tag: 'pet', security: ['api_key', 'petstore_auth'] });
    expect(o.tags).toEqual([{ name: 'pet', count: 3 }, { name: 'store', count: 1 }]);
  });

  it('resolves a relative server against the address the spec came from', () => {
    expect(o.servers[0]).toMatchObject({ url: '/api/v3', resolved: 'https://petstore3.swagger.io/api/v3' });
  });

  it('turns each security scheme into Daakia auth with its own secret variable', () => {
    const key = o.schemes.find(s => s.name === 'api_key')!;
    expect(key).toMatchObject({ kind: 'api-key', apiKeyName: 'api_key', apiKeyIn: 'header', variables: [{ key: 'apiKey', secret: true }], operationCount: 2 });
    const oauth = o.schemes.find(s => s.name === 'petstore_auth')!;
    expect(oauth).toMatchObject({ kind: 'oauth2', authorizationUrl: 'https://petstore3.swagger.io/oauth/authorize', scopes: ['write:pets', 'read:pets'], operationCount: 3 });
    expect(oauth.variables[0]).toEqual({ key: 'accessToken', secret: true });
  });

  it('counts a path parameter once, with every request that uses it', () => {
    expect(o.pathParams).toEqual([{ name: 'petId', type: 'integer · int64', example: '', used: 2 }]);
  });

  it('refuses a document that is not a spec, saying so', () => {
    expect(() => parseSpec('{"hello":"world"}')).toThrow(/not an OpenAPI 3 or Swagger 2 spec/);
    expect(() => parseSpec('openapi: 3.0.0\ninfo: {title: x}\npaths: {}')).toThrow(/no paths/);
  });
});

describe('the collection it builds', () => {
  const { spec, format } = parseSpec(TEXT);
  const outline = outlineSpec(spec, format, SPEC_URL);
  const plan: ImportPlan = {
    collectionName: 'Petstore',
    folders: [{ id: 'f-pet', name: 'pet', parentId: null }, { id: 'f-by-id', name: 'by id', parentId: 'f-pet' }],
    requests: [
      { opId: 'PUT /pet', folderId: 'f-pet', name: 'Update an existing pet' },
      { opId: 'GET /pet/{petId}', folderId: 'f-by-id', name: 'Find pet by ID' },
      { opId: 'GET /store/inventory', folderId: null, name: 'Inventory' },
    ],
    pathVars: [{ name: 'petId', shared: true, value: '10' }],
    environments: [
      { name: 'Production', values: { baseUrl: 'https://petstore3.swagger.io/api/v3' } },
      { name: 'Local', values: { baseUrl: 'http://localhost:8080/api/v3', apiKey: 'dev-key' } },
    ],
  };
  const built = buildCollection(spec, outline, plan);

  it('writes every URL against {{baseUrl}}, with shared path params as variables', () => {
    expect(built.requests.map(r => r.url)).toEqual(['{{baseUrl}}/pet', '{{baseUrl}}/pet/{{petId}}', '{{baseUrl}}/store/inventory']);
    expect(built.root.data.variables).toEqual([{ key: 'petId', value: '10', enabled: true }]);
  });

  it('keeps the wizard\'s folders, nested where they were dropped', () => {
    const pet = built.folders.find(f => f.name === 'pet')!;
    const byId = built.folders.find(f => f.name === 'by id')!;
    expect(pet.parentId).toBe(built.root.id);
    expect(byId.parentId).toBe(pet.id);
    expect(built.requests[1].folderId).toBe(byId.id);
    expect(built.requests[2].folderId).toBe(built.root.id);
  });

  it('puts the most-used scheme on the collection, and the other on the request that needs it', () => {
    // GET by id and inventory lead with api_key; only PUT leads with OAuth.
    expect(built.root.data).toMatchObject({ authType: 'api-key', authData: { apiKeyName: 'api_key', apiKeyValue: '{{apiKey}}', apiKeyIn: 'header' } });
    expect(built.requests[2].data.authType).toBe('none'); // inherits the collection's
    expect(built.requests[0].data).toMatchObject({
      authType: 'oauth2',
      authData: { accessToken: '{{accessToken}}', oauth2AuthUrl: 'https://petstore3.swagger.io/oauth/authorize', oauth2Scope: 'write:pets read:pets' },
    });
  });

  it('builds a JSON body from the schema when the spec gives no example body', () => {
    const put = built.requests[0];
    expect(put.data.bodyMode).toBe('json');
    expect(JSON.parse(put.data.bodyRaw as string)).toEqual({ id: 10, name: 'doggie', status: 'available', photoUrls: ['string'] });
  });

  it('gives every environment every variable, secrets marked', () => {
    const local = built.environments.find(e => e.name === 'Local')!;
    expect(local.variables.map(v => [v.key, v.isSecret])).toEqual([
      ['baseUrl', false], ['accessToken', true], ['clientId', false], ['apiKey', true],
    ]);
    expect(local.variables.find(v => v.key === 'baseUrl')!.currentValue).toBe('http://localhost:8080/api/v3');
    expect(local.variables.find(v => v.key === 'apiKey')!).toMatchObject({ currentValue: 'dev-key', isSecret: true });
  });

  it('follows $ref, allOf and arrays when making an example', () => {
    expect(exampleFor({ allOf: [{ $ref: '#/components/schemas/Pet' }, { type: 'object', properties: { extra: { type: 'boolean' } } }] }, spec))
      .toMatchObject({ id: 10, extra: false });
  });
});

describe('fetching', () => {
  const html = '<!doctype html><html><body><script src="./swagger-initializer.js"></script></body></html>';
  const initializer = 'window.ui = SwaggerUIBundle({ url: "/api/v3/openapi.json", dom_id: "#swagger-ui", oauth2RedirectUrl: "x" })';
  function fake(routes: Record<string, { status?: number; body: string; type?: string; location?: string }>): FetchFn {
    return async (url) => {
      const r = routes[url];
      if (!r) return { status: 404, ok: false, headers: { get: () => null }, text: async () => 'not found' };
      const status = r.status ?? 200;
      return {
        status, ok: status < 300,
        headers: { get: (n: string) => (n === 'content-type' ? r.type ?? 'application/json' : n === 'location' ? r.location ?? null : null) },
        text: async () => r.body,
      };
    };
  }

  it('reads a spec URL directly', async () => {
    const got = await fetchSpec(SPEC_URL, {}, fake({ [SPEC_URL]: { body: TEXT } }));
    expect(got).toMatchObject({ specUrl: SPEC_URL, foundFromUi: false, status: 200 });
  });

  it('finds the spec behind a Swagger UI page', async () => {
    const got = await fetchSpec('https://petstore3.swagger.io/', {}, fake({
      'https://petstore3.swagger.io/': { body: html, type: 'text/html' },
      'https://petstore3.swagger.io/swagger-initializer.js': { body: initializer, type: 'text/javascript' },
      [SPEC_URL]: { body: TEXT },
    }));
    expect(got).toMatchObject({ specUrl: SPEC_URL, foundFromUi: true });
  });

  it('follows springdoc\'s configUrl', async () => {
    const got = await fetchSpec('http://localhost:8080/swagger-ui/index.html', {}, fake({
      'http://localhost:8080/swagger-ui/index.html': { body: '<html><script>SwaggerUIBundle({ configUrl: "/v3/api-docs/swagger-config" })</script></html>', type: 'text/html' },
      'http://localhost:8080/v3/api-docs/swagger-config': { body: '{"urls":[{"url":"/v3/api-docs/public","name":"public"}]}' },
      'http://localhost:8080/v3/api-docs/public': { body: TEXT },
    }));
    expect(got.specUrl).toBe('http://localhost:8080/v3/api-docs/public');
  });

  it('follows a redirect on the same site, and refuses one that leaves it', async () => {
    const ok = await fetchSpec('https://api.example.com/docs', {}, fake({
      'https://api.example.com/docs': { status: 302, body: '', location: '/docs/openapi.json' },
      'https://api.example.com/docs/openapi.json': { body: TEXT },
    }));
    expect(ok.specUrl).toBe('https://api.example.com/docs/openapi.json');
    await expect(fetchSpec('https://api.example.com/docs', {}, fake({
      'https://api.example.com/docs': { status: 302, body: '', location: 'https://elsewhere.example.net/spec.json' },
    }))).rejects.toThrow(/different site/);
  });

  it('allows plain http only to this machine', () => {
    expect(isAllowedUrl(new URL('http://localhost:8080/v3/api-docs'))).toBeNull();
    expect(isAllowedUrl(new URL('http://127.0.0.1/x'))).toBeNull();
    expect(isAllowedUrl(new URL('https://api.example.com'))).toBeNull();
    expect(isAllowedUrl(new URL('http://api.example.com'))).toMatch(/only allowed to this machine/);
    expect(isAllowedUrl(new URL('file:///etc/passwd'))).toMatch(/Only http and https/);
  });

  it('says what the server said when it needs credentials', async () => {
    await expect(fetchSpec(SPEC_URL, {}, fake({ [SPEC_URL]: { status: 401, body: '' } }))).rejects.toThrow(/401 — add the header/);
  });

  it('reads spec URLs out of a page, not the redirect or validator ones', () => {
    expect(specUrlsIn(initializer).urls).toEqual(['/api/v3/openapi.json']);
  });

  it('finds the spec when the page picks it in code, as petstore3\'s own initializer does', async () => {
    // The real swagger-initializer.js on petstore3.swagger.io, cut down.
    const real = `window.onload = function() {
      const defaultDefinitionUrl = "https://petstore.swagger.io/v2/swagger.json";
      const ossServices = \`petstore3.swagger.io=https://petstore3.swagger.io/api/v3/openapi.json,petstore.swagger.io=https://petstore.swagger.io/v2/swagger.json\`;
      const definitionURL = pick(ossServices) || defaultDefinitionUrl;
      window.ui = SwaggerUIBundle({ url: definitionURL, validatorUrl: "https://validator.swagger.io/validator" })
    };`;
    const got = await fetchSpec('https://petstore3.swagger.io/', {}, fake({
      'https://petstore3.swagger.io/': { body: html, type: 'text/html' },
      'https://petstore3.swagger.io/swagger-initializer.js': { body: real, type: 'text/javascript' },
      [SPEC_URL]: { body: TEXT },
    }));
    expect(got).toMatchObject({ specUrl: SPEC_URL, foundFromUi: true });
  });
});

describe('what a folder inherits', () => {
  it('layers variables and headers by key, nearest winning, and takes the nearest real auth', () => {
    const merged = mergeCollectionChain([
      { variables: [{ key: 'baseUrl', value: 'https://root', enabled: true }, { key: 'petId', value: '1', enabled: true }], headers: [{ key: 'X-Trace', value: 'root', enabled: true }], authType: 'api-key', authData: { apiKeyName: 'api_key' } },
      { variables: [{ key: 'petId', value: '2', enabled: true }, { key: 'off', value: 'x', enabled: false }], headers: [{ key: 'x-trace', value: 'folder', enabled: true }], authType: 'none', authData: {} },
    ]);
    expect(merged.variables).toEqual([{ key: 'baseUrl', value: 'https://root', enabled: true }, { key: 'petId', value: '2', enabled: true }]);
    expect(merged.headers).toEqual([{ key: 'x-trace', value: 'folder', enabled: true }]);
    expect(merged).toMatchObject({ authType: 'api-key', authData: { apiKeyName: 'api_key' } });
  });

  it('keeps variable names case-sensitive', () => {
    const merged = mergeCollectionChain([
      { variables: [{ key: 'Token', value: 'a', enabled: true }] },
      { variables: [{ key: 'token', value: 'b', enabled: true }] },
    ]);
    expect(merged.variables.map(v => v.key)).toEqual(['Token', 'token']);
  });
});
