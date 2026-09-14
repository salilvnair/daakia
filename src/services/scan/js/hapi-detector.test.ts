/**
 * Hapi, whose routes are data.
 *
 * That makes them easy to read when they are literals and impossible when they
 * are not — a route table built by mapping over a list is idiomatic Hapi and
 * completely opaque. Both halves are tested, because the second is the one a
 * scanner is tempted to guess at.
 */
import { describe, it, expect } from 'vitest';
import { hapiDetector, readMethods, readAuth } from './hapi-detector';
import type { RepoRoot } from '../api-detector';

const repo = (files: Record<string, string>): RepoRoot => ({
  dir: '/repo', files: Object.keys(files), read: (r) => files[r],
});

function scan(files: Record<string, string>) {
  const root = repo(files);
  const index = hapiDetector.index?.(root) ?? {};
  const findings = [], unresolved = [];
  for (const path of hapiDetector.candidates(root)) {
    const r = hapiDetector.detect({ path, text: root.read(path)! }, index, root);
    findings.push(...r.findings);
    unresolved.push(...r.unresolved);
  }
  return { findings, unresolved, root };
}

const PKG = '{"dependencies":{"@hapi/hapi":"^21.0.0"}}';

describe('a route object', () => {
  const files = {
    'package.json': PKG,
    'server.js': `
const Hapi = require('@hapi/hapi');
const server = Hapi.server({ port: 4000, host: 'localhost' });

server.route({
  method: 'GET',
  path: '/api/orders/{id}',
  handler: getOrder,
});

server.route({
  method: 'POST',
  path: '/api/orders',
  options: { auth: 'jwt' },
  handler: createOrder,
});
`,
  };

  it('is read, path parameters and all', () => {
    expect(scan(files).findings.map(f => `${f.method} ${f.path}`))
      .toEqual(['GET /api/orders/{id}', 'POST /api/orders']);
  });

  it('reads the strategy off options.auth', () => {
    const post = scan(files).findings[1];
    expect(post.auth).toEqual({ scheme: 'bearer', named: 'jwt' });
    expect(post.provenance.auth.kind).toBe('read');
  });

  it('reads the port off Hapi.server', () => {
    expect(hapiDetector.baseUrl!(scan(files).root)?.url).toBe('http://localhost:4000');
  });
});

describe('an array of routes', () => {
  it('is every route in it', () => {
    const { findings } = scan({
      'package.json': PKG,
      'routes.js': `
server.route([
  { method: 'GET', path: '/health', handler: ok },
  { method: 'DELETE', path: '/api/orders/{id}', handler: remove },
]);
`,
    });
    expect(findings.map(f => `${f.method} ${f.path}`))
      .toEqual(['GET /health', 'DELETE /api/orders/{id}']);
  });
});

describe('several methods on one path', () => {
  it('is several routes, told apart by the method', () => {
    const { findings } = scan({
      'package.json': PKG,
      'r.js': "server.route({ method: ['GET', 'POST'], path: '/api/thing', handler: h });\n",
    });
    expect(findings.map(f => f.method)).toEqual(['GET', 'POST']);
    expect(findings.map(f => f.discriminator)).toEqual(['get', 'post']);
  });
});

describe('what it will not guess', () => {
  it('reports a route table built from a value', () => {
    const { findings, unresolved } = scan({
      'package.json': PKG,
      'r.js': 'server.route(buildCrudRoutes(Order));\n',
    });
    expect(findings).toHaveLength(0);
    expect(unresolved[0].why).toContain('value rather than a literal');
  });

  it('reports a computed path', () => {
    const { unresolved } = scan({
      'package.json': PKG,
      'r.js': "server.route({ method: 'GET', path: `${prefix}/x`, handler: h });\n",
    });
    expect(unresolved[0].why).toContain('runtime');
  });

  it('will not expand a wildcard method', () => {
    const { findings, unresolved } = scan({
      'package.json': PKG,
      'r.js': "server.route({ method: '*', path: '/any', handler: h });\n",
    });
    expect(findings).toHaveLength(0);
    expect(unresolved[0].why).toContain('will not pick one');
  });

  it('resolves a path built from this file’s own constants', () => {
    const { findings } = scan({
      'package.json': PKG,
      'r.js': "const BASE = '/api/v2';\nserver.route({ method: 'GET', path: `${BASE}/orders`, handler: h });\n",
    });
    expect(findings.map(f => f.path)).toEqual(['/api/v2/orders']);
  });
});

describe('auth', () => {
  it('reads a named strategy', () => {
    expect(readAuth("auth: 'jwt', handler: h")).toEqual({ scheme: 'bearer', named: 'jwt' });
  });

  it('reads a strategy object', () => {
    expect(readAuth("auth: { strategy: 'session', mode: 'try' }"))
      .toEqual({ scheme: 'bearer', named: 'session' });
  });

  it('treats auth: false as a statement, not an absence', () => {
    /* A route that opts out of authentication is deliberately public, which is
       worth showing rather than leaving blank. */
    expect(readAuth('auth: false')).toEqual({ scheme: 'none' });
  });

  it('says nothing when the route says nothing', () => {
    expect(readAuth('handler: h')).toBeUndefined();
  });
});

describe('methods', () => {
  it('reads one, or a list', () => {
    expect(readMethods("'get'")).toEqual(['GET']);
    expect(readMethods("['GET','post']")).toEqual(['GET', 'POST']);
  });

  it('reads a wildcard as nothing it can use', () => {
    expect(readMethods("'*'")).toEqual([]);
  });

  it('ignores something that is not a method', () => {
    expect(readMethods("'TELEPORT'")).toEqual([]);
  });
});

describe('presence', () => {
  it('takes either package name', () => {
    expect(hapiDetector.present(repo({ 'package.json': PKG }))).toBe(true);
    expect(hapiDetector.present(repo({ 'package.json': '{"dependencies":{"hapi":"^18"}}' }))).toBe(true);
    expect(hapiDetector.present(repo({ 'package.json': '{"dependencies":{"express":"^4"}}' }))).toBe(false);
  });
});
