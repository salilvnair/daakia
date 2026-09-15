/**
 * Next.js, where the route is the file's own place on disk.
 *
 * That makes the path the most reliable of the six — it cannot be built at
 * runtime — and moves all the uncertainty onto the method.
 */
import { describe, it, expect } from 'vitest';
import {
  nextjsDetector, pathFromFile, exportedMethods, methodsFromBody, basePathOf,
} from './nextjs-detector';
import type { RepoRoot } from '../api-detector';

const repo = (files: Record<string, string>): RepoRoot => ({
  dir: '/repo', files: Object.keys(files), read: (r) => files[r],
});

function scan(files: Record<string, string>) {
  const root = repo(files);
  const index = nextjsDetector.index!(root);
  const findings = [];
  for (const path of nextjsDetector.candidates(root)) {
    findings.push(...nextjsDetector.detect({ path, text: root.read(path)! }, index, root).findings);
  }
  return { findings, root };
}

const PKG = '{"dependencies":{"next":"14.2.0","react":"18"}}';

describe('the path, which is the file', () => {
  it('comes from the app router directory', () => {
    expect(pathFromFile('app/api/orders/route.ts')).toBe('/api/orders');
    expect(pathFromFile('src/app/api/orders/[id]/route.ts')).toBe('/api/orders/{id}');
  });

  it('turns a catch-all into one parameter', () => {
    expect(pathFromFile('app/api/files/[...slug]/route.ts')).toBe('/api/files/{slug}');
  });

  it('drops a route group, which organises without appearing', () => {
    /* `(marketing)` is a Next.js convention for grouping files. Taking it
       literally puts a segment in the URL that the server never serves. */
    expect(pathFromFile('app/(marketing)/api/leads/route.ts')).toBe('/api/leads');
  });

  it('ignores a private folder, which is not a route', () => {
    expect(pathFromFile('app/_lib/helpers/route.ts')).toBeUndefined();
  });

  it('reads the pages router, index and all', () => {
    expect(pathFromFile('pages/api/orders.ts')).toBe('/api/orders');
    expect(pathFromFile('pages/api/orders/index.ts')).toBe('/api/orders');
    expect(pathFromFile('pages/api/orders/[id].ts')).toBe('/api/orders/{id}');
  });

  it('is nothing for a file that is not a route', () => {
    expect(pathFromFile('app/page.tsx')).toBeUndefined();
    expect(pathFromFile('lib/db.ts')).toBeUndefined();
  });
});

describe('the app router', () => {
  const files = {
    'package.json': PKG,
    'app/api/orders/route.ts': `
export async function GET(request: Request) { return Response.json([]); }
export async function POST(request: Request) { return Response.json({}); }
`,
    'app/api/orders/[id]/route.ts': 'export async function DELETE() { return new Response(null, { status: 204 }); }\n',
  };

  it('takes its methods from the exports, exactly', () => {
    expect(scan(files).findings.map(f => `${f.method} ${f.path}`).sort())
      .toEqual(['DELETE /api/orders/{id}', 'GET /api/orders', 'POST /api/orders']);
  });

  it('marks both path and method as read — neither was inferred', () => {
    const [f] = scan(files).findings;
    expect(f.provenance.path.kind).toBe('read');
    expect(f.provenance.method.kind).toBe('read');
  });

  it('tells two methods on one file apart', () => {
    const orders = scan(files).findings.filter(f => f.path === '/api/orders');
    expect(orders.map(f => f.discriminator)).toEqual(['get', 'post']);
  });

  it('finds nothing in a route file that exports no verb', () => {
    /* A route file with no handler serves nothing. Assuming GET would invent
       an endpoint that returns 405. */
    const { findings } = scan({
      'package.json': PKG,
      'app/api/wip/route.ts': 'export const dynamic = "force-dynamic";\n',
    });
    expect(findings).toHaveLength(0);
  });

  it('reads a re-export', () => {
    expect(exportedMethods('import { GET } from "./handlers";\nexport { GET };')).toEqual(['GET']);
  });
});

describe('the pages router', () => {
  it('reads the methods the handler compares against', () => {
    const { findings } = scan({
      'package.json': PKG,
      'pages/api/orders.ts': `
export default function handler(req, res) {
  if (req.method === 'POST') return create(req, res);
  if (req.method === 'DELETE') return remove(req, res);
  res.status(405).end();
}
`,
    });
    expect(findings.map(f => f.method).sort()).toEqual(['DELETE', 'POST']);
  });

  it('reads a switch', () => {
    expect(methodsFromBody("switch (req.method) { case 'GET': break; case 'PUT': break; }").sort())
      .toEqual(['GET', 'PUT']);
  });

  it('reads an includes check', () => {
    expect(methodsFromBody("if (['GET','HEAD'].includes(req.method)) {}").sort())
      .toEqual(['GET', 'HEAD']);
  });

  it('assumes GET when the handler says nothing, and marks the assumption', () => {
    const { findings } = scan({
      'package.json': PKG,
      'pages/api/health.ts': 'export default function handler(req, res) { res.json({ ok: true }); }\n',
    });
    expect(findings[0].method).toBe('GET');
    expect(findings[0].provenance.method.kind).toBe('generated');
    /* The path is still read — it is the file's own name. */
    expect(findings[0].provenance.path.kind).toBe('read');
  });
});

describe('basePath', () => {
  const files = {
    'package.json': PKG,
    'next.config.js': "module.exports = { basePath: '/shop', reactStrictMode: true };\n",
    'app/api/orders/route.ts': 'export async function GET() {}\n',
  };

  it('prefixes every route', () => {
    expect(scan(files).findings[0].path).toBe('/shop/api/orders');
  });

  it('is read on its own', () => {
    expect(basePathOf(repo(files))).toBe('/shop');
    expect(basePathOf(repo({ 'next.config.js': 'module.exports = {};' }))).toBe('');
  });
});

describe('the base URL', () => {
  it('is Next’s default, and says so', () => {
    const b = nextjsDetector.baseUrl!(repo({ 'package.json': PKG }))!;
    expect(b.url).toBe('http://localhost:3000');
    expect(b.parts.port.kind).toBe('generated');
  });

  it('takes a port out of the dev script', () => {
    const b = nextjsDetector.baseUrl!(repo({
      'package.json': '{"dependencies":{"next":"14"},"scripts":{"dev":"next dev -p 4200"}}',
    }))!;
    expect(b.url).toBe('http://localhost:4200');
    expect(b.parts.port.kind).toBe('read');
  });
});

describe('presence and candidates', () => {
  it('is decided by package.json', () => {
    expect(nextjsDetector.present(repo({ 'package.json': PKG }))).toBe(true);
    expect(nextjsDetector.present(repo({ 'package.json': '{"dependencies":{"express":"^4"}}' }))).toBe(false);
  });

  it('opens only route files, never build output', () => {
    const r = repo({
      'app/api/a/route.ts': '', 'pages/api/b.ts': '',
      'app/page.tsx': '', '.next/server/app/api/a/route.js': '',
    });
    expect(nextjsDetector.candidates(r).sort()).toEqual(['app/api/a/route.ts', 'pages/api/b.ts']);
  });
});
