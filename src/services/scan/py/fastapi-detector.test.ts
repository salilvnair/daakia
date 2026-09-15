/**
 * FastAPI — the richest of the six, because it asks people to declare what
 * REST leaves implicit.
 *
 * The case that matters most is the two prefixes: a router carries one and the
 * include that mounts it carries another, and both apply. Reading only one
 * gives every path in a large application a missing segment.
 */
import { describe, it, expect } from 'vitest';
import { fastapiDetector, routerPrefix, buildIncludePrefixes, nameFromDef, defAfter } from './fastapi-detector';
import type { RepoRoot } from '../api-detector';

const repo = (files: Record<string, string>): RepoRoot => ({
  dir: '/repo', files: Object.keys(files), read: (r) => files[r],
});

function scan(files: Record<string, string>) {
  const root = repo(files);
  const index = fastapiDetector.index!(root);
  const findings = [], unresolved = [];
  for (const path of fastapiDetector.candidates(root)) {
    const r = fastapiDetector.detect({ path, text: root.read(path)! }, index, root);
    findings.push(...r.findings);
    unresolved.push(...r.unresolved);
  }
  return { findings, unresolved, root };
}

const REQ = 'fastapi==0.110.0\nuvicorn\npydantic\n';

describe('routes on the app itself', () => {
  const files = {
    'requirements.txt': REQ,
    'main.py': `
from fastapi import FastAPI
app = FastAPI()

@app.get("/health")
async def health():
    return {"ok": True}

@app.delete("/api/orders/{order_id}", status_code=204)
async def cancel_order(order_id: str):
    ...
`,
  };

  it('are found, with their path parameters', () => {
    expect(scan(files).findings.map(f => `${f.method} ${f.path}`))
      .toEqual(['GET /health', 'DELETE /api/orders/{order_id}']);
  });

  it('take the declared status, and mark an undeclared one an assumption', () => {
    const f = scan(files).findings;
    expect(f[1].response?.status).toBe(204);
    expect(f[1].provenance.status.kind).toBe('read');
    expect(f[0].response?.status).toBe(200);
    expect(f[0].provenance.status.kind).toBe('generated');
  });

  it('name the request after the function', () => {
    expect(scan(files).findings[1].name).toBe('Cancel order');
  });
});

describe('a router included under a prefix', () => {
  const files = {
    'requirements.txt': REQ,
    'main.py': `
from fastapi import FastAPI
from app.orders import router as orders_router
app = FastAPI()
app.include_router(orders_router, prefix="/api")
`,
    'app/orders.py': `
from fastapi import APIRouter
router = APIRouter(prefix="/orders")

@router.get("/{order_id}")
async def get_order(order_id: str):
    ...
`,
  };

  it('carries BOTH prefixes', () => {
    /* The include's and the router's own. Reading one of them gives every
       path in the application a missing segment. */
    expect(scan(files).findings.map(f => f.path)).toEqual(['/api/orders/{order_id}']);
  });

  it('marks the path resolved, and says where the prefix came from', () => {
    const [f] = scan(files).findings;
    expect(f.provenance.path.kind).toBe('resolved');
    expect((f.provenance.path as { from: string }).from).toContain('/api/orders');
  });

  it('reads the router’s own prefix out of APIRouter(...)', () => {
    expect(routerPrefix('router = APIRouter(prefix="/orders", tags=["orders"])')).toBe('/orders');
    expect(routerPrefix('router = APIRouter()')).toBe('');
  });

  it('builds the include map', () => {
    expect(buildIncludePrefixes(repo(files)).get('app/orders.py')).toBe('/api');
  });
});

describe('a Pydantic body', () => {
  const files = {
    'requirements.txt': REQ,
    'main.py': `
from fastapi import FastAPI
from models import CheckoutRequest
app = FastAPI()

@app.post("/api/checkout", status_code=201)
async def create_checkout(body: CheckoutRequest):
    ...
`,
    'models.py': `
from pydantic import BaseModel, Field
from typing import List

class Item(BaseModel):
    sku: str
    quantity: int

class CheckoutRequest(BaseModel):
    cart_id: str
    quantity: int = Field(gt=0)
    items: List[Item]
    coupon: str
`,
  };

  it('is read off the model, one level into nested ones', () => {
    const [f] = scan(files).findings;
    expect(JSON.parse(f.body!.raw!)).toEqual({
      cart_id: '',
      quantity: 1,
      items: [{ sku: '', quantity: 0 }],
      coupon: '',
    });
  });

  it('marks a constrained value generated, and names the constraint', () => {
    const [f] = scan(files).findings;
    expect(f.provenance.body.kind).toBe('generated');
    expect((f.provenance.body as { rule: string }).rule).toContain('Field(gt=0)');
  });

  it('sets the content type, since there is a body', () => {
    expect(scan(files).findings[0].headers).toContainEqual(
      { name: 'Content-Type', value: 'application/json', required: true });
  });
});

describe('auth', () => {
  it('reads Depends as a guard', () => {
    const [f] = scan({
      'requirements.txt': REQ,
      'main.py': `
from fastapi import FastAPI, Depends
app = FastAPI()

@app.get("/api/me")
async def me(user = Depends(current_user)):
    ...
`,
    }).findings;
    expect(f.auth?.scheme).toBe('bearer');
    expect(f.provenance.auth.kind).toBe('read');
  });

  it('leaves an unguarded route alone', () => {
    const [f] = scan({
      'requirements.txt': REQ,
      'main.py': 'from fastapi import FastAPI\napp = FastAPI()\n\n@app.get("/health")\nasync def health():\n    ...\n',
    }).findings;
    expect(f.auth).toBeUndefined();
  });
});

describe('what it will not guess', () => {
  it('reports a path built at runtime', () => {
    const { findings, unresolved } = scan({
      'requirements.txt': REQ,
      'main.py': 'from fastapi import FastAPI\napp = FastAPI()\n\n@app.get(f"/{prefix}/search")\nasync def search():\n    ...\n',
    });
    expect(findings).toHaveLength(0);
    expect(unresolved[0].why).toContain('runtime');
  });

  it('resolves a path built from module constants', () => {
    const { findings } = scan({
      'requirements.txt': REQ,
      'main.py': 'from fastapi import FastAPI\nBASE = "/api/v2"\n\n@app.get(f"{BASE}/orders")\nasync def list_orders():\n    ...\n',
    });
    expect(findings.map(f => f.path)).toEqual(['/api/v2/orders']);
  });
});

describe('presence', () => {
  it('is decided by the requirements alone', () => {
    expect(fastapiDetector.present(repo({ 'requirements.txt': REQ }))).toBe(true);
    expect(fastapiDetector.present(repo({ 'pyproject.toml': '[tool.poetry.dependencies]\nfastapi = "^0.110"' }))).toBe(true);
    expect(fastapiDetector.present(repo({ 'requirements.txt': 'flask\n' }))).toBe(false);
  });

  it('skips tests', () => {
    const py = 'from fastapi import FastAPI\n';
    const r = repo({ 'app.py': py, 'test_app.py': py, 'tests/x.py': py });
    expect(fastapiDetector.candidates(r)).toEqual(['app.py']);
  });
});

describe('the small parts', () => {
  it('finds the function under a decorator', () => {
    const src = '@app.get("/x")\nasync def get_thing(a: int, b: str):\n    ...\n';
    expect(defAfter(src, 0)).toEqual({ name: 'get_thing', params: 'a: int, b: str' });
  });

  it('turns a function name into something readable', () => {
    expect(nameFromDef('create_checkout')).toBe('Create checkout');
  });
});
