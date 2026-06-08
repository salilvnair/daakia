/**
 * MockApiCatalog — Pre-built mock API templates (6A.26).
 * One-click populate a server with realistic route collections.
 */
import { useState } from 'react';
import { PlusIcon } from '../../../icons';
import type { MockRoute } from '../mock-types';

const MOCK_ACCENT = 'var(--color-mock-server)';

interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  routeCount: number;
  tags: string[];
  routes: MockRoute[];
}

interface Props {
  onAddRoutes: (routes: MockRoute[]) => void;
}

export function MockApiCatalog({ onAddRoutes }: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [added, setAdded] = useState<Set<string>>(new Set());

  const categories = ['all', ...Array.from(new Set(CATALOG.map(c => c.category)))];
  const filtered = CATALOG.filter(c => {
    const matchCat = category === 'all' || c.category === category;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.tags.some(t => t.includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  const add = (entry: CatalogEntry) => {
    // Regenerate IDs before adding
    const routes = entry.routes.map(r => ({ ...r, id: crypto.randomUUID() }));
    onAddRoutes(routes);
    setAdded(prev => new Set([...prev, entry.id]));
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Search + filter */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search templates…"
          className="flex-1 h-[30px] px-3 text-[11px] rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className="h-[22px] px-2.5 text-[10px] rounded-full cursor-pointer capitalize transition-colors"
            style={{
              background: category === cat ? `color-mix(in srgb, ${MOCK_ACCENT} 15%, transparent)` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${category === cat ? `color-mix(in srgb, ${MOCK_ACCENT} 30%, transparent)` : 'rgba(255,255,255,0.08)'}`,
              color: category === cat ? MOCK_ACCENT : 'var(--color-text-muted)',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-2">
        {filtered.map(entry => (
          <CatalogCard key={entry.id} entry={entry} added={added.has(entry.id)} onAdd={() => add(entry)} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-2 py-8 text-center text-[11px] text-[var(--color-text-muted)] opacity-50">
            No templates match your search.
          </div>
        )}
      </div>
    </div>
  );
}

function CatalogCard({ entry, added, onAdd }: { entry: CatalogEntry; added: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)] transition-colors bg-[rgba(255,255,255,0.02)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12px] font-medium text-[var(--color-text-primary)]">{entry.name}</p>
          <p className="text-[9px] text-[var(--color-text-muted)] mt-0.5">{entry.routeCount} routes · {entry.category}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={added}
          className="flex items-center gap-1 h-[22px] px-2 text-[10px] rounded cursor-pointer disabled:opacity-50 flex-shrink-0"
          style={{
            background: added ? 'rgba(34,197,94,0.12)' : `color-mix(in srgb, ${MOCK_ACCENT} 12%, transparent)`,
            border: `1px solid ${added ? 'rgba(34,197,94,0.25)' : `color-mix(in srgb, ${MOCK_ACCENT} 25%, transparent)`}`,
            color: added ? 'var(--color-success)' : MOCK_ACCENT,
          }}
        >
          {added ? '✓ Added' : <><PlusIcon size={9} /> Add</>}
        </button>
      </div>
      <p className="text-[10px] text-[var(--color-text-muted)] opacity-70 leading-relaxed">{entry.description}</p>
      <div className="flex flex-wrap gap-1">
        {entry.tags.map(t => (
          <span key={t} className="text-[8px] px-1.5 py-0.5 rounded-full bg-[rgba(255,255,255,0.05)] text-[var(--color-text-muted)]">{t}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Catalog data ─────────────────────────────────────────────────────────────

function makeRoute(method: string, path: string, status: number, body: string, headers?: Record<string, string>): MockRoute {
  return {
    id: crypto.randomUUID(),
    method: method as MockRoute['method'],
    path,
    statusCode: status,
    headers: headers ?? { 'Content-Type': 'application/json' },
    body,
    delay: 0,
    enabled: true,
  };
}

const CATALOG: CatalogEntry[] = [
  {
    id: 'users-crud',
    name: 'Users CRUD',
    description: 'Full user management: list, get, create, update, delete with realistic data.',
    category: 'REST',
    routeCount: 5,
    tags: ['users', 'crud', 'rest', 'authentication'],
    routes: [
      makeRoute('GET', '/api/users', 200, JSON.stringify({ users: [{ id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'admin', createdAt: '2024-01-15T10:00:00Z' }, { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'user', createdAt: '2024-02-20T14:30:00Z' }], total: 2, page: 1, perPage: 20 }, null, 2)),
      makeRoute('GET', '/api/users/:id', 200, JSON.stringify({ id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'admin', createdAt: '2024-01-15T10:00:00Z', updatedAt: '2024-03-01T09:00:00Z' }, null, 2)),
      makeRoute('POST', '/api/users', 201, JSON.stringify({ id: 3, name: 'New User', email: 'new@example.com', role: 'user', createdAt: new Date().toISOString() }, null, 2)),
      makeRoute('PUT', '/api/users/:id', 200, JSON.stringify({ id: 1, name: 'Alice Johnson Updated', email: 'alice@example.com', role: 'admin' }, null, 2)),
      makeRoute('DELETE', '/api/users/:id', 204, ''),
    ],
  },
  {
    id: 'auth-flow',
    name: 'Auth Flow',
    description: 'Login, logout, refresh token, and profile endpoints with JWT-style responses.',
    category: 'REST',
    routeCount: 4,
    tags: ['auth', 'jwt', 'oauth', 'login'],
    routes: [
      makeRoute('POST', '/auth/login', 200, JSON.stringify({ accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsaWNlIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', refreshToken: 'refresh_abc123xyz', expiresIn: 3600, tokenType: 'Bearer' }, null, 2)),
      makeRoute('POST', '/auth/refresh', 200, JSON.stringify({ accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.newtoken', expiresIn: 3600 }, null, 2)),
      makeRoute('POST', '/auth/logout', 200, JSON.stringify({ message: 'Logged out successfully' }, null, 2)),
      makeRoute('GET', '/auth/me', 200, JSON.stringify({ id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'admin', permissions: ['read', 'write', 'delete'] }, null, 2)),
    ],
  },
  {
    id: 'products-catalog',
    name: 'Product Catalog',
    description: 'E-commerce product listing, search, categories, and inventory.',
    category: 'E-Commerce',
    routeCount: 6,
    tags: ['products', 'ecommerce', 'catalog', 'inventory'],
    routes: [
      makeRoute('GET', '/api/products', 200, JSON.stringify({ products: [{ id: 'prod_1', name: 'MacBook Pro 16"', price: 2499.00, currency: 'USD', category: 'electronics', inStock: true, sku: 'MBP-16-M3' }, { id: 'prod_2', name: 'AirPods Pro', price: 249.00, currency: 'USD', category: 'audio', inStock: false, sku: 'APP-2' }], total: 2 }, null, 2)),
      makeRoute('GET', '/api/products/:id', 200, JSON.stringify({ id: 'prod_1', name: 'MacBook Pro 16"', price: 2499.00, currency: 'USD', description: 'The most powerful MacBook Pro ever.', images: ['https://example.com/mbp-1.jpg'], variants: [{ id: 'v1', color: 'Space Black', storage: '1TB', inStock: true }] }, null, 2)),
      makeRoute('GET', '/api/categories', 200, JSON.stringify({ categories: [{ id: 'electronics', name: 'Electronics', count: 142 }, { id: 'audio', name: 'Audio', count: 38 }] }, null, 2)),
      makeRoute('GET', '/api/products/search', 200, JSON.stringify({ results: [], query: 'macbook', total: 0 }, null, 2)),
      makeRoute('POST', '/api/cart/items', 201, JSON.stringify({ cartId: 'cart_xyz', items: [{ productId: 'prod_1', quantity: 1, price: 2499.00 }], total: 2499.00 }, null, 2)),
      makeRoute('POST', '/api/orders', 201, JSON.stringify({ orderId: 'ord_abc123', status: 'pending', total: 2499.00, estimatedDelivery: '2024-12-25' }, null, 2)),
    ],
  },
  {
    id: 'error-scenarios',
    name: 'Error Scenarios',
    description: 'Common error responses: 400, 401, 403, 404, 422, 429, 500 with RFC 7807 format.',
    category: 'Testing',
    routeCount: 7,
    tags: ['errors', 'testing', 'rfc7807', '4xx', '5xx'],
    routes: [
      makeRoute('GET', '/errors/400', 400, JSON.stringify({ type: 'https://tools.ietf.org/html/rfc7807', title: 'Bad Request', status: 400, detail: 'The request body is missing required fields.', instance: '/api/users' }, null, 2)),
      makeRoute('GET', '/errors/401', 401, JSON.stringify({ type: 'https://tools.ietf.org/html/rfc7807', title: 'Unauthorized', status: 401, detail: 'Authentication credentials are required.' }, null, 2)),
      makeRoute('GET', '/errors/403', 403, JSON.stringify({ type: 'https://tools.ietf.org/html/rfc7807', title: 'Forbidden', status: 403, detail: 'You do not have permission to access this resource.' }, null, 2)),
      makeRoute('GET', '/errors/404', 404, JSON.stringify({ type: 'https://tools.ietf.org/html/rfc7807', title: 'Not Found', status: 404, detail: 'The requested resource was not found.' }, null, 2)),
      makeRoute('GET', '/errors/422', 422, JSON.stringify({ type: 'https://tools.ietf.org/html/rfc7807', title: 'Unprocessable Entity', status: 422, errors: [{ field: 'email', message: 'Invalid email format' }] }, null, 2)),
      makeRoute('GET', '/errors/429', 429, JSON.stringify({ type: 'https://tools.ietf.org/html/rfc7807', title: 'Too Many Requests', status: 429, detail: 'Rate limit exceeded. Try again in 60 seconds.' }, null, 2), { 'Content-Type': 'application/json', 'Retry-After': '60', 'X-RateLimit-Limit': '100', 'X-RateLimit-Remaining': '0' }),
      makeRoute('GET', '/errors/500', 500, JSON.stringify({ type: 'https://tools.ietf.org/html/rfc7807', title: 'Internal Server Error', status: 500, detail: 'An unexpected error occurred. Please try again later.' }, null, 2)),
    ],
  },
  {
    id: 'graphql-mock',
    name: 'GraphQL Endpoint',
    description: 'Single /graphql POST endpoint with introspection + sample query responses.',
    category: 'GraphQL',
    routeCount: 2,
    tags: ['graphql', 'introspection', 'query'],
    routes: [
      makeRoute('POST', '/graphql', 200, JSON.stringify({ data: { user: { id: '1', name: 'Alice Johnson', email: 'alice@example.com', __typename: 'User' } } }, null, 2)),
      makeRoute('GET', '/graphql', 200, JSON.stringify({ data: { __schema: { queryType: { name: 'Query' }, mutationType: { name: 'Mutation' }, types: [] } } }, null, 2)),
    ],
  },
  {
    id: 'pagination',
    name: 'Paginated Lists',
    description: 'Generic paginated list endpoint with cursor and offset pagination variants.',
    category: 'REST',
    routeCount: 2,
    tags: ['pagination', 'cursor', 'offset', 'lists'],
    routes: [
      makeRoute('GET', '/api/items', 200, JSON.stringify({ data: [{ id: 1, title: 'Item 1' }, { id: 2, title: 'Item 2' }, { id: 3, title: 'Item 3' }], pagination: { page: 1, perPage: 20, total: 100, totalPages: 5, hasNextPage: true, hasPrevPage: false } }, null, 2)),
      makeRoute('GET', '/api/items/cursor', 200, JSON.stringify({ data: [{ id: 1, title: 'Item 1' }], cursor: { next: 'eyJpZCI6MX0', prev: null, hasMore: true } }, null, 2)),
    ],
  },
  {
    id: 'webhooks-test',
    name: 'Webhook Receiver',
    description: 'Test webhook receiver that accepts and acknowledges incoming webhook payloads.',
    category: 'Testing',
    routeCount: 3,
    tags: ['webhooks', 'events', 'receiver'],
    routes: [
      makeRoute('POST', '/webhooks/receive', 200, JSON.stringify({ received: true, id: 'evt_abc123', timestamp: new Date().toISOString() }, null, 2)),
      makeRoute('POST', '/webhooks/stripe', 200, JSON.stringify({ received: true }, null, 2)),
      makeRoute('POST', '/webhooks/github', 200, JSON.stringify({ message: 'ok', event: 'push' }, null, 2)),
    ],
  },
  {
    id: 'health-checks',
    name: 'Health Checks',
    description: 'Standard health, readiness, and liveness endpoints for K8s / load balancers.',
    category: 'Infrastructure',
    routeCount: 3,
    tags: ['health', 'kubernetes', 'readiness', 'liveness', 'devops'],
    routes: [
      makeRoute('GET', '/health', 200, JSON.stringify({ status: 'ok', uptime: 99.99, version: '1.0.0', timestamp: new Date().toISOString() }, null, 2)),
      makeRoute('GET', '/health/ready', 200, JSON.stringify({ status: 'ready', checks: { database: 'ok', cache: 'ok', storage: 'ok' } }, null, 2)),
      makeRoute('GET', '/health/live', 200, JSON.stringify({ status: 'live' }, null, 2)),
    ],
  },
];
