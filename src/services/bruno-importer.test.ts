/**
 * Bruno, in each of the shapes it saves a collection in.
 *
 * The fixtures are what the Bruno VS Code extension (6.0) actually wrote: a
 * folder of OpenCollection YAML, and the JSON its Export makes of the same
 * collection — which the import used to reject as "Not a valid Postman
 * Collection v2.1 file", and whose one request it wrote with no URL.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const written = vi.hoisted(() => ({
  collections: [] as { id: string; name: string; parentId?: string | null }[],
  requests: [] as { collection_id: string; name: string; method: string; url: string; data: string }[],
  environments: [] as { name: string; variables: string }[],
}));
vi.mock('../storage/db', () => ({
  upsertCollection: (id: string, name: string, parentId?: string | null) => written.collections.push({ id, name, parentId }),
  upsertCollectionRequest: (r: (typeof written.requests)[number]) => written.requests.push(r),
  upsertEnvironment: (e: (typeof written.environments)[number]) => written.environments.push(e),
}));
vi.mock('./vault', () => ({ encryptEnvVariables: <T>(v: T) => v }));

import {
  readBrunoFolder, readBrunoJsonExport, isBrunoJsonExport, parseBruRequest,
  parseOpenCollectionRequest, requestRow, importBrunoJsonExport, importBrunoCollection,
} from './bruno-importer';
import { importAnyCollection } from './import-any';

const OPENCOLLECTION = `opencollection: 1.0.0

info:
  name: test
bundled: false
extensions:
  bruno:
    ignore:
      - node_modules
      - .git
`;

const HOPPER = `info:
  name: Hopper
  type: http

http:
  method: GET
  url: https://echo.hoppscotch.io
  auth: inherit

settings:
  encodeUrl: true
  timeout: 0
  followRedirects: true
  maxRedirects: 5
`;

let dir: string;

function write(rel: string, text: string) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  return p;
}

/** Bruno's export of the collection above, trimmed of its UI state. */
function exportOf(pathname: string) {
  return JSON.stringify({
    version: '1',
    name: 'test',
    items: [{
      name: 'Hopper', type: 'http', seq: 1,
      request: { method: 'get', url: '', params: [], headers: [], auth: { mode: 'none' }, body: { mode: 'none' }, script: {}, vars: {} },
      filename: 'Hopper.yml', pathname, partial: true,
    }],
    environments: [],
    brunoConfig: { opencollection: '1.0.0', name: 'test', type: 'collection' },
    exportedUsing: 'Bruno VS Code Extension',
  });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daakia-bruno-'));
  written.collections.length = 0;
  written.requests.length = 0;
  written.environments.length = 0;
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('a YAML (OpenCollection) folder', () => {
  it('reads the collection name and its requests', () => {
    write('opencollection.yml', OPENCOLLECTION);
    write('Hopper.yml', HOPPER);
    const c = readBrunoFolder(dir);
    expect(c.name).toBe('test');
    expect(c.format).toBe('yml');
    expect(c.root.requests).toHaveLength(1);
    expect(c.root.requests[0]).toMatchObject({ name: 'Hopper', method: 'GET', url: 'https://echo.hoppscotch.io' });
  });

  it('does not take the collection file for a request', () => {
    write('opencollection.yml', OPENCOLLECTION);
    expect(readBrunoFolder(dir).root.requests).toEqual([]);
  });

  it('reads folders by their folder.yml, in seq order', () => {
    write('opencollection.yml', OPENCOLLECTION);
    write('b/folder.yml', 'info:\n  name: Users\n  type: folder\n  seq: 2\n');
    write('a/folder.yml', 'info:\n  name: Orders\n  type: folder\n  seq: 1\n');
    write('b/Get user.yml', HOPPER.replace('Hopper', 'Get user'));
    const c = readBrunoFolder(dir);
    expect(c.root.folders.map(f => f.name)).toEqual(['Orders', 'Users']);
    expect(c.root.folders[1].requests[0].name).toBe('Get user');
  });

  it('reads headers, query params, a JSON body, bearer auth and scripts', () => {
    const r = parseOpenCollectionRequest(`info:
  name: Create
  type: http
  seq: 3
http:
  method: POST
  url: "{{host}}/orders"
  headers:
    - name: X-Trace
      value: abc
    - name: X-Off
      value: x
      disabled: true
  params:
    - name: dry
      value: "true"
      type: query
    - name: id
      value: "1"
      type: path
  body:
    type: json
    data: |-
      { "qty": 1 }
  auth:
    type: bearer
    token: "{{token}}"
runtime:
  scripts:
    - type: before-request
      code: bru.setVar("a", 1)
    - type: tests
      code: test("ok", () => {})
`, 'Create.yml')!;
    expect(r.headers).toEqual([
      { key: 'X-Trace', value: 'abc', enabled: true },
      { key: 'X-Off', value: 'x', enabled: false },
    ]);
    // Path params are part of the URL, not the query.
    expect(r.params).toEqual([{ key: 'dry', value: 'true', enabled: true }]);
    const row = requestRow(r);
    expect(row.data).toMatchObject({ bodyMode: 'json', bodyRaw: '{ "qty": 1 }', authType: 'bearer', authData: { token: '{{token}}' } });
    expect(row.data.preRequestScript).toContain('dk.env.set("a", 1)');
    expect(row.data.postResponseScript).toContain('test(');
  });

  it('brings the environments, secrets without their values', () => {
    write('opencollection.yml', OPENCOLLECTION);
    write('environments/dev.yml', 'name: dev\nvariables:\n  - name: host\n    value: http://localhost\n  - name: token\n    secret: true\n');
    importBrunoCollection(dir);
    expect(written.environments).toHaveLength(1);
    expect(written.environments[0].name).toBe('dev (test)');
    const vars = JSON.parse(written.environments[0].variables);
    expect(vars.map((v: { key: string; initialValue: string; isSecret: boolean }) => [v.key, v.initialValue, v.isSecret]))
      .toEqual([['host', 'http://localhost', false], ['token', '', true]]);
  });
});

describe("Bruno's JSON export", () => {
  it('is recognised as Bruno, not refused as a bad Postman file', () => {
    const json = exportOf('/nowhere/Hopper.yml');
    expect(isBrunoJsonExport(json)).toBe(true);
    const r = importAnyCollection(json);
    expect(r.success).toBe(true);
    expect(r.format).toBe('Bruno (JSON export)');
  });

  it('is not mistaken for a Postman collection, or the other way round', () => {
    const postman = JSON.stringify({ info: { name: 'p', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: [] });
    expect(isBrunoJsonExport(postman)).toBe(false);
  });

  /* Bruno exports requests it had not loaded as `partial`, with their name
     and nothing else. The file they came from has the rest. */
  it('reads a request the export left empty from its file, when the file is here', () => {
    const file = write('test/Hopper.yml', HOPPER);
    const c = readBrunoJsonExport(exportOf(file));
    expect(c.root.requests[0]).toMatchObject({ name: 'Hopper', method: 'GET', url: 'https://echo.hoppscotch.io' });
    expect(c.notes.join('\n')).toContain('read from');
  });

  it('says so when it cannot', () => {
    const c = readBrunoJsonExport(exportOf(path.join(dir, 'gone.yml')));
    expect(c.root.requests[0].url).toBe('');
    expect(c.notes.join('\n')).toContain('without a URL');
  });

  it('writes the collection and its request', () => {
    const file = write('test/Hopper.yml', HOPPER);
    const r = importBrunoJsonExport(exportOf(file));
    expect(r).toMatchObject({ success: true, collectionName: 'test', requestCount: 1 });
    expect(written.requests[0]).toMatchObject({ name: 'Hopper', method: 'GET', url: 'https://echo.hoppscotch.io' });
  });

  it('maps folders, form bodies and API keys', () => {
    const c = readBrunoJsonExport(JSON.stringify({
      version: '1', name: 'shop', items: [{
        type: 'folder', name: 'Auth', items: [{
          type: 'http-request', name: 'Login',
          request: {
            method: 'post', url: 'https://x/login',
            auth: { mode: 'apikey', apikey: { key: 'X-Key', value: 'k', placement: 'header' } },
            body: { mode: 'formUrlEncoded', formUrlEncoded: [{ name: 'user', value: 'a', enabled: true }] },
          },
        }],
      }],
    }));
    const login = c.root.folders[0].requests[0];
    const row = requestRow(login);
    expect(row.data).toMatchObject({
      bodyMode: 'x-www-form-urlencoded',
      authType: 'api-key',
      authData: { apiKeyName: 'X-Key', apiKeyValue: 'k', addTo: 'header' },
    });
  });
});

describe('picking a Bruno .yml in the ordinary Import dialog', () => {
  it('imports the collection the file belongs to', () => {
    write('opencollection.yml', OPENCOLLECTION);
    const file = write('Hopper.yml', HOPPER);
    const r = importAnyCollection(HOPPER, file);
    expect(r).toMatchObject({ success: true, collectionName: 'test', requestCount: 1, format: 'Bruno (YAML)' });
  });
});

describe('.bru, the older format', () => {
  it('still reads, and no longer takes folder.bru for a request', () => {
    write('bruno.json', JSON.stringify({ name: 'legacy' }));
    write('users/folder.bru', 'meta {\n  name: People\n  seq: 1\n}\n');
    write('users/Get.bru', 'meta {\n  name: Get\n  seq: 1\n}\n\nget {\n  url: https://x/users\n}\n');
    const c = readBrunoFolder(dir);
    expect(c.name).toBe('legacy');
    expect(c.root.folders[0].name).toBe('People');
    expect(c.root.folders[0].requests.map(r => r.name)).toEqual(['Get']);
  });

  it('sends a urlencoded body in the mode the executor knows', () => {
    const r = parseBruRequest('post {\n  url: https://x\n}\n\nbody:form-urlencoded {\n  a: 1\n}\n', 'F.bru');
    expect(requestRow(r).data.bodyMode).toBe('x-www-form-urlencoded');
  });
});

describe('a file nobody recognises', () => {
  it('says what it tried and what the file looked like', () => {
    const r = importAnyCollection(JSON.stringify({ hello: 1, world: [] }));
    expect(r.success).toBe(false);
    expect(r.error).toBe('Not a collection format Daakia recognises');
    expect(r.notes!.join('\n')).toContain('Tried:');
    expect(r.notes!.join('\n')).toContain('hello, world');
  });
});
