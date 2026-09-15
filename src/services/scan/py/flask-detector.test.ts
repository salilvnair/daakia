/**
 * Flask.
 *
 * Two behaviours matter more than the rest: `methods` defaults to GET when it
 * is absent, and a blueprint's prefix can come from either the declaration or
 * the registration, with the registration winning.
 */
import { describe, it, expect } from 'vitest';
import { flaskDetector, blueprintPrefix, buildRegistrations, stripConverters } from './flask-detector';
import type { RepoRoot } from '../api-detector';

const repo = (files: Record<string, string>): RepoRoot => ({
  dir: '/repo', files: Object.keys(files), read: (r) => files[r],
});

function scan(files: Record<string, string>) {
  const root = repo(files);
  const index = flaskDetector.index!(root);
  const findings = [], unresolved = [];
  for (const path of flaskDetector.candidates(root)) {
    const r = flaskDetector.detect({ path, text: root.read(path)! }, index, root);
    findings.push(...r.findings);
    unresolved.push(...r.unresolved);
  }
  return { findings, unresolved, root };
}

const REQ = 'Flask==3.0.0\n';

describe('methods', () => {
  const files = {
    'requirements.txt': REQ,
    'app.py': `
from flask import Flask
app = Flask(__name__)

@app.route("/health")
def health():
    return "ok"

@app.route("/api/orders", methods=["GET", "POST"])
def orders():
    ...
`,
  };

  it('default to GET when they are not stated', () => {
    /* The commonest shape in any Flask codebase. A reader that treats "no
       methods" as "no route" loses most of a read-only API in silence. */
    const get = scan(files).findings.find(f => f.path === '/health')!;
    expect(get.method).toBe('GET');
  });

  it('are marked as the assumption they are when defaulted', () => {
    const get = scan(files).findings.find(f => f.path === '/health')!;
    expect(get.provenance.method.kind).toBe('generated');
    const stated = scan(files).findings.find(f => f.path === '/api/orders')!;
    expect(stated.provenance.method.kind).toBe('read');
  });

  it('become one request each when several are stated', () => {
    const orders = scan(files).findings.filter(f => f.path === '/api/orders');
    expect(orders.map(f => f.method)).toEqual(['GET', 'POST']);
    expect(orders.map(f => f.discriminator)).toEqual(['get', 'post']);
  });

  it('are read off the shorthand decorators too', () => {
    const { findings } = scan({
      'requirements.txt': REQ,
      'app.py': 'from flask import Flask\napp = Flask(__name__)\n\n@app.post("/api/x")\ndef x():\n    ...\n',
    });
    expect(findings[0].method).toBe('POST');
    expect(findings[0].provenance.method.kind).toBe('read');
  });
});

describe('converters', () => {
  it('are routing rules, not part of the URL', () => {
    expect(stripConverters('/orders/<int:order_id>')).toBe('/orders/{order_id}');
    expect(stripConverters('/files/<path:subpath>')).toBe('/files/{subpath}');
    expect(stripConverters('/x/<name>')).toBe('/x/{name}');
  });

  it('are stripped from a real route', () => {
    const { findings } = scan({
      'requirements.txt': REQ,
      'app.py': 'from flask import Flask\napp = Flask(__name__)\n\n@app.route("/orders/<int:order_id>")\ndef get_order(order_id):\n    ...\n',
    });
    expect(findings[0].path).toBe('/orders/{order_id}');
    expect(findings[0].pathParams).toEqual([{ name: 'order_id', value: '', required: true }]);
  });
});

describe('blueprints', () => {
  it('take the prefix from the declaration', () => {
    const { findings } = scan({
      'requirements.txt': REQ,
      'orders.py': `
from flask import Blueprint
bp = Blueprint("orders", __name__, url_prefix="/orders")

@bp.route("/<int:id>")
def one(id):
    ...
`,
    });
    expect(findings[0].path).toBe('/orders/{id}');
  });

  it('let the registration override it', () => {
    /* Both are legal and either may be the one in force; when both state a
       prefix the registration is what Flask actually uses. */
    const files = {
      'requirements.txt': REQ,
      'app.py': `
from flask import Flask
from orders import bp
app = Flask(__name__)
app.register_blueprint(bp, url_prefix="/api/v2/orders")
`,
      'orders.py': `
from flask import Blueprint
bp = Blueprint("orders", __name__, url_prefix="/orders")

@bp.route("/<int:id>")
def one(id):
    ...
`,
    };
    expect(scan(files).findings.map(f => f.path)).toEqual(['/api/v2/orders/{id}']);
    expect(buildRegistrations(repo(files)).get('orders.py')).toBe('/api/v2/orders');
  });

  it('keep the declaration when the registration states none', () => {
    const files = {
      'requirements.txt': REQ,
      'app.py': 'from flask import Flask\nfrom orders import bp\napp.register_blueprint(bp)\n',
      'orders.py': 'from flask import Blueprint\nbp = Blueprint("o", __name__, url_prefix="/orders")\n\n@bp.route("/x")\ndef x():\n    ...\n',
    };
    expect(scan(files).findings.map(f => f.path)).toEqual(['/orders/x']);
  });

  it('read the declared prefix on its own', () => {
    expect(blueprintPrefix('bp = Blueprint("o", __name__, url_prefix="/o")')).toBe('/o');
    expect(blueprintPrefix('bp = Blueprint("o", __name__)')).toBeUndefined();
  });
});

describe('auth', () => {
  it('is another decorator on the same function', () => {
    const [f] = scan({
      'requirements.txt': REQ,
      'app.py': `
from flask import Flask
app = Flask(__name__)

@app.route("/api/me")
@login_required
def me():
    ...
`,
    }).findings;
    expect(f.auth).toEqual({ scheme: 'bearer', named: 'login_required' });
  });

  it('reads jwt_required too', () => {
    const [f] = scan({
      'requirements.txt': REQ,
      'app.py': 'from flask import Flask\napp = Flask(__name__)\n\n@app.route("/api/x")\n@jwt_required()\ndef x():\n    ...\n',
    }).findings;
    expect(f.auth?.named).toBe('jwt_required');
  });

  it('leaves an unguarded route alone', () => {
    const [f] = scan({
      'requirements.txt': REQ,
      'app.py': 'from flask import Flask\napp = Flask(__name__)\n\n@app.route("/health")\ndef health():\n    ...\n',
    }).findings;
    expect(f.auth).toBeUndefined();
  });
});

describe('the base URL', () => {
  it('is read off app.run when it is there', () => {
    const { root } = scan({
      'requirements.txt': REQ,
      'app.py': 'from flask import Flask\napp = Flask(__name__)\n\napp.run(port=8080)\n',
    });
    expect(flaskDetector.baseUrl!(root)?.url).toBe('http://localhost:8080');
  });

  it('falls back to Flask’s own default, and says it did', () => {
    const { root } = scan({ 'requirements.txt': REQ, 'app.py': 'from flask import Flask\napp = Flask(__name__)\n\n@app.route("/x")\ndef x():\n    ...\n' });
    const b = flaskDetector.baseUrl!(root)!;
    expect(b.url).toBe('http://localhost:5000');
    expect(b.parts.port.kind).toBe('generated');
  });
});

describe('what it will not guess', () => {
  it('reports a path built at runtime', () => {
    const { findings, unresolved } = scan({
      'requirements.txt': REQ,
      'app.py': 'from flask import Flask\napp = Flask(__name__)\n\n@app.route(f"/{entity}/search")\ndef search():\n    ...\n',
    });
    expect(findings).toHaveLength(0);
    expect(unresolved[0].why).toContain('runtime');
  });
});

describe('presence', () => {
  it('takes Flask or Quart', () => {
    expect(flaskDetector.present(repo({ 'requirements.txt': REQ }))).toBe(true);
    expect(flaskDetector.present(repo({ 'requirements.txt': 'quart\n' }))).toBe(true);
    expect(flaskDetector.present(repo({ 'requirements.txt': 'fastapi\n' }))).toBe(false);
  });
});
