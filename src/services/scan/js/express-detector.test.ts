/**
 * Express, whose hard part is that a route file does not know its own prefix.
 */
import { describe, it, expect } from 'vitest';
import { expressDetector, buildPrefixes, resolveImport, nameFor } from './express-detector';
import type { RepoRoot } from '../api-detector';

const repo = (files: Record<string, string>): RepoRoot => ({
  dir: '/repo', files: Object.keys(files), read: (r) => files[r],
});

function scan(files: Record<string, string>) {
  const root = repo(files);
  const index = expressDetector.index!(root);
  const findings = [], unresolved = [];
  for (const path of expressDetector.candidates(root)) {
    const r = expressDetector.detect({ path, text: root.read(path)! }, index, root);
    findings.push(...r.findings);
    unresolved.push(...r.unresolved);
  }
  return { findings, unresolved, root };
}

const PKG = '{"dependencies":{"express":"^4.18.0"}}';

describe('routes in one file', () => {
  const files = {
    'package.json': PKG,
    'app.js': `
const express = require('express');
const app = express();
app.get('/health', (req, res) => res.send('ok'));
app.post('/api/orders', createOrder);
app.delete('/api/orders/:id', removeOrder);
app.listen(3000);
`,
  };

  it('finds them, with parameters in daakia’s spelling', () => {
    expect(scan(files).findings.map(f => `${f.method} ${f.path}`)).toEqual([
      'GET /health', 'POST /api/orders', 'DELETE /api/orders/{id}',
    ]);
  });

  it('lists the path parameters', () => {
    const del = scan(files).findings[2];
    expect(del.pathParams).toEqual([{ name: 'id', value: '', required: true }]);
  });

  it('reads the port off listen', () => {
    expect(expressDetector.baseUrl!(scan(files).root)?.url).toBe('http://localhost:3000');
  });
});

describe('a router mounted somewhere else', () => {
  const files = {
    'package.json': PKG,
    'app.js': `
const express = require('express');
const orders = require('./routes/orders');
const app = express();
app.use('/api/orders', orders);
`,
    'routes/orders.js': `
const router = require('express').Router();
router.get('/', list);
router.get('/:id', getOne);
module.exports = router;
`,
  };

  it('gives the route its mounted prefix', () => {
    /* The whole point: /:id in routes/orders.js is NOT /:id on the wire, and a
       detector reading one file at a time gets it wrong in a way that looks
       right. */
    expect(scan(files).findings.map(f => f.path).sort())
      .toEqual(['/api/orders', '/api/orders/{id}']);
  });

  it('marks the path resolved, and says what mounted it', () => {
    const f = scan(files).findings[0];
    expect(f.provenance.path.kind).toBe('resolved');
    expect((f.provenance.path as { from: string }).from).toContain('/api/orders');
  });

  it('resolves an import to the file it names', () => {
    const root = repo(files);
    expect(resolveImport(root, 'app.js', './routes/orders')).toBe('routes/orders.js');
    expect(resolveImport(root, 'app.js', 'express')).toBeUndefined();
  });
});

describe('a router mounted on a router', () => {
  const files = {
    'package.json': PKG,
    'app.js': `
const api = require('./routes/api');
app.use('/api', api);
`,
    'routes/api.js': `
const orders = require('./orders');
const router = require('express').Router();
router.use('/orders', orders);
module.exports = router;
`,
    'routes/orders.js': `
const router = require('express').Router();
router.get('/:id', getOne);
module.exports = router;
`,
  };

  it('collects every prefix on the way down', () => {
    expect(scan(files).findings.map(f => f.path)).toEqual(['/api/orders/{id}']);
  });

  it('builds the prefix map for each mounted file', () => {
    const p = buildPrefixes(repo(files));
    expect(p.get('routes/api.js')).toBe('/api');
    expect(p.get('routes/orders.js')).toBe('/api/orders');
  });
});

describe('what it will not guess', () => {
  it('reports a path built at runtime', () => {
    const { findings, unresolved } = scan({
      'package.json': PKG,
      'routes/crud.js': `
for (const entity of ENTITIES) {
  router.get(\`/\${entity}/search\`, search);
}
`,
    });
    expect(findings).toHaveLength(0);
    expect(unresolved[0].expression).toContain('router.get');
    expect(unresolved[0].why).toContain('runtime');
  });

  it('resolves a template whose parts are all constants in the file', () => {
    /* This one IS knowable, so it is not reported — it is resolved. */
    const { findings } = scan({
      'package.json': PKG,
      'routes/x.js': "const BASE = '/api/v1';\nrouter.get(`${BASE}/orders`, list);\n",
    });
    expect(findings.map(f => f.path)).toEqual(['/api/v1/orders']);
  });

  it('will not pick a method for app.all', () => {
    const { findings, unresolved } = scan({
      'package.json': PKG,
      'app.js': "app.all('/any', handler);\n",
    });
    expect(findings).toHaveLength(0);
    expect(unresolved[0].why).toContain('every method');
  });
});

describe('auth', () => {
  it('notices a guard in the middleware chain', () => {
    const [f] = scan({
      'package.json': PKG,
      'app.js': "app.post('/api/orders', requireAuth, createOrder);\n",
    }).findings;
    expect(f.auth?.scheme).toBe('bearer');
    expect(f.provenance.auth.kind).toBe('resolved');
  });

  it('leaves an unguarded route alone', () => {
    const [f] = scan({ 'package.json': PKG, 'app.js': "app.get('/health', ok);\n" }).findings;
    expect(f.auth).toBeUndefined();
  });
});

describe('presence', () => {
  it('is decided by package.json alone', () => {
    expect(expressDetector.present(repo({ 'package.json': PKG }))).toBe(true);
    expect(expressDetector.present(repo({ 'package.json': '{"dependencies":{"next":"14"}}' }))).toBe(false);
  });

  it('ignores a manifest it cannot parse', () => {
    expect(expressDetector.present(repo({ 'package.json': 'not json' }))).toBe(false);
  });

  it('skips tests', () => {
    const r = repo({ 'a.js': '', 'a.test.js': '', '__tests__/b.js': '' });
    expect(expressDetector.candidates(r)).toEqual(['a.js']);
  });
});

describe('naming', () => {
  it('reads from the path, because Express has no handler name', () => {
    expect(nameFor('GET', '/api/orders/{id}')).toBe('Get api orders by id');
    expect(nameFor('POST', '/')).toBe('Post root');
  });
});
