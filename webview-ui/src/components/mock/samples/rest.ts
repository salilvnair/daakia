/**
 * REST mock server sample routes.
 * Each sample provides 3 routes with method, path, status, headers, and body.
 */
import type { MockRoute, StateMachineConfig, StateNode, StateTransition } from '../mock-types';

export interface RestSample {
  id: string;
  label: string;
  description: string;
  routes: Array<Omit<MockRoute, 'id'>>;
  /** Auto-enabled server-level state machine config — applied when loading this sample */
  stateMachine?: StateMachineConfig;
  /**
   * Extra workflows to auto-connect alongside `stateMachine` — keyed by a
   * lookup key into sm-rest-workflows.ts's SM_REST_WORKFLOW_MAP (for the
   * canvas id/name) paired with the real StateMachineConfig that actually
   * drives routes referencing it via connectedWorkflowId. Lets one sample
   * demonstrate multiple simultaneously connected workflows on one server.
   */
  additionalWorkflows?: Record<string, StateMachineConfig>;
}

function route(
  method: MockRoute['method'],
  path: string,
  statusCode: number,
  body: string,
  headers: Record<string, string> = {},
  triggerEvent?: string,
): Omit<MockRoute, 'id'> {
  return {
    method, path, statusCode, body,
    headers: { 'Content-Type': 'application/json', ...headers },
    delay: 0, enabled: true,
    ...(triggerEvent ? { triggerEvent } : {}),
  };
}

/** Build a server-level StateMachineConfig for header-based session tracking. */
function smCfg(
  states: Array<{ id: string; name: string; initial?: boolean; mockResponses?: StateNode['mockResponses'] }>,
  transitions: Array<{ from: string; to: string; label: string }>,
): StateMachineConfig {
  const nodes: StateNode[] = states.map((s, i) => ({
    id: s.id, name: s.name, x: 250, y: 20 + i * 120,
    isInitial: s.initial, mockResponses: s.mockResponses,
  }));
  const edges: StateTransition[] = transitions.map((t, i) => ({
    id: `t${i + 1}`, from: t.from, to: t.to, routeId: '', label: t.label,
  }));
  return {
    enabled: true,
    sessionMode: 'header',
    sessionKey: 'X-Session-ID',
    defaultState: states.find(s => s.initial)?.id ?? states[0]?.id ?? '',
    states: nodes,
    transitions: edges,
  };
}

export const REST_SAMPLES: RestSample[] = [
  {
    id: 'users-crud',
    label: 'Users CRUD',
    description: 'Full user management API with list, create, and delete operations',
    routes: [
      route('GET', '/api/users', 200, '[\n  { "id": 1, "name": "Alice Johnson", "email": "alice@example.com", "role": "admin" },\n  { "id": 2, "name": "Bob Smith", "email": "bob@example.com", "role": "user" },\n  { "id": 3, "name": "Charlie Brown", "email": "charlie@example.com", "role": "user" }\n]'),
      route('POST', '/api/users', 201, '{\n  "id": 4,\n  "name": "New User",\n  "email": "new@example.com",\n  "role": "user",\n  "createdAt": "2026-05-21T18:00:00Z"\n}', { 'X-Request-Id': 'req-abc123' }),
      route('DELETE', '/api/users/:id', 204, '', { 'X-Request-Id': 'req-del456' }),
    ],
  },
  {
    id: 'products-api',
    label: 'Products API',
    description: 'E-commerce product catalog with listing, detail, and update endpoints',
    routes: [
      route('GET', '/api/products', 200, '{\n  "data": [\n    { "id": "p1", "name": "Laptop Pro", "price": 1299.99, "category": "Electronics", "inStock": true },\n    { "id": "p2", "name": "Ergonomic Chair", "price": 549.00, "category": "Furniture", "inStock": true },\n    { "id": "p3", "name": "4K Monitor", "price": 699.99, "category": "Electronics", "inStock": false }\n  ],\n  "total": 3,\n  "page": 1\n}'),
      route('GET', '/api/products/:id', 200, '{\n  "id": "p1",\n  "name": "Laptop Pro",\n  "price": 1299.99,\n  "description": "High-performance laptop with 16GB RAM and 512GB SSD",\n  "category": "Electronics",\n  "inStock": true,\n  "specs": { "cpu": "M3 Pro", "ram": "16GB", "storage": "512GB" }\n}'),
      route('PUT', '/api/products/:id', 200, '{\n  "id": "p1",\n  "name": "Laptop Pro Updated",\n  "price": 1199.99,\n  "updatedAt": "2026-05-21T18:00:00Z"\n}', { 'X-Updated-By': 'admin' }),
    ],
  },
  {
    id: 'auth-api',
    label: 'Authentication',
    description: 'JWT-based auth flow with login, token refresh, and logout',
    stateMachine: smCfg(
      [
        { id: 'logged_out', name: 'LoggedOut', initial: true },
        { id: 'authenticated', name: 'Authenticated' },
      ],
      [
        { from: 'logged_out', to: 'authenticated', label: 'LOGIN' },
        { from: 'authenticated', to: 'authenticated', label: 'LOGIN' }, // re-login while already authenticated
        { from: 'authenticated', to: 'authenticated', label: 'REFRESH' },
        { from: 'authenticated', to: 'logged_out', label: 'LOGOUT' },
      ],
    ),
    routes: [
      // login: works from either state (LoggedOut → Authenticated, or re-login while Authenticated)
      route('POST', '/api/auth/login', 200,
        '{\n  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ",\n  "refreshToken": "rt_abc123def456",\n  "expiresIn": 3600,\n  "user": { "id": "u1", "email": "user@example.com", "name": "John Doe" }\n}',
        { 'X-Auth-Provider': 'local' },
        'LOGIN',
      ),
      // refresh: only works when Authenticated, issues new token, stays Authenticated
      route('POST', '/api/auth/refresh', 200,
        '{\n  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refreshed",\n  "expiresIn": 3600\n}',
        {},
        'REFRESH',
      ),
      // logout: Authenticated → LoggedOut
      route('POST', '/api/auth/logout', 200,
        '{\n  "message": "Successfully logged out"\n}',
        {},
        'LOGOUT',
      ),
    ],
  },
  {
    id: 'blog-posts',
    label: 'Blog Posts',
    description: 'Blog CMS API with paginated posts, single post, and creation',
    routes: [
      route('GET', '/api/posts', 200, '{\n  "posts": [\n    { "id": 1, "title": "Getting Started with REST APIs", "slug": "rest-apis-intro", "excerpt": "Learn the basics...", "author": "Jane", "publishedAt": "2026-05-20" },\n    { "id": 2, "title": "Advanced Caching Strategies", "slug": "caching-strategies", "excerpt": "Optimize your API...", "author": "Bob", "publishedAt": "2026-05-19" }\n  ],\n  "pagination": { "page": 1, "perPage": 10, "total": 24 }\n}', { 'X-Total-Count': '24', 'X-Page': '1' }),
      route('GET', '/api/posts/:slug', 200, '{\n  "id": 1,\n  "title": "Getting Started with REST APIs",\n  "body": "# Introduction\\n\\nREST APIs are the backbone of modern web development...",\n  "author": { "name": "Jane Doe", "avatar": "https://example.com/avatar.jpg" },\n  "tags": ["api", "rest", "tutorial"],\n  "publishedAt": "2026-05-20T10:00:00Z"\n}'),
      route('POST', '/api/posts', 201, '{\n  "id": 3,\n  "title": "New Post",\n  "slug": "new-post",\n  "status": "draft",\n  "createdAt": "2026-05-21T18:00:00Z"\n}', { 'Location': '/api/posts/3' }),
    ],
  },
  {
    id: 'orders-api',
    label: 'Orders / E-Commerce',
    description: 'Order lifecycle — state transitions drive status: pending → processing → shipped → delivered',
    stateMachine: smCfg(
      [
        {
          id: 'pending', name: 'Pending', initial: true,
          mockResponses: [{ method: 'POST', path: '/api/orders', status: 201, body: '{\n  "id": "ord-004",\n  "status": "pending",\n  "total": 159.98,\n  "estimatedDelivery": "2026-05-28"\n}' }],
        },
        {
          id: 'processing', name: 'Processing',
          mockResponses: [{ method: 'POST', path: '/api/orders', status: 200, body: '{\n  "id": "ord-004",\n  "status": "processing",\n  "trackingNumber": null,\n  "updatedAt": "2026-05-22T08:00:00Z"\n}' }],
        },
        {
          id: 'shipped', name: 'Shipped',
          mockResponses: [{ method: 'POST', path: '/api/orders', status: 200, body: '{\n  "id": "ord-004",\n  "status": "shipped",\n  "trackingNumber": "1Z999AA10123456784",\n  "updatedAt": "2026-05-22T12:00:00Z"\n}' }],
        },
        { id: 'delivered', name: 'Delivered' },
      ],
      [
        // POST /api/orders repeatedly cycles the same order through stages
        { from: 'pending', to: 'processing', label: 'CREATE' },
        { from: 'processing', to: 'shipped', label: 'CREATE' },
        { from: 'shipped', to: 'delivered', label: 'CREATE' },
        // PATCH /api/orders/:id/status advances explicitly (independent of CREATE)
        { from: 'processing', to: 'shipped', label: 'SHIP' },
        { from: 'shipped', to: 'delivered', label: 'DELIVER' },
      ],
    ),
    routes: [
      route('GET', '/api/orders', 200,
        '{\n  "orders": [\n    { "id": "ord-001", "status": "delivered", "total": 89.99, "items": 3, "createdAt": "2026-05-18" },\n    { "id": "ord-002", "status": "shipped", "total": 249.50, "items": 1, "createdAt": "2026-05-20" },\n    { "id": "ord-003", "status": "processing", "total": 34.99, "items": 2, "createdAt": "2026-05-21" }\n  ]\n}',
      ),
      // POST /api/orders: same URL, response varies by the order's current stage
      // (state node Mock Responses above override this default body/status)
      route('POST', '/api/orders', 201,
        '{\n  "id": "ord-004",\n  "status": "pending",\n  "total": 159.98,\n  "items": [{ "productId": "p1", "name": "Widget", "quantity": 2, "price": 79.99 }],\n  "estimatedDelivery": "2026-05-28"\n}',
        { 'X-Order-Id': 'ord-004' },
        'CREATE',
      ),
      // PATCH: advance status explicitly — two routes, one per stage
      route('PATCH', '/api/orders/:id/status', 200,
        '{\n  "id": "ord-003",\n  "status": "shipped",\n  "trackingNumber": "1Z999AA10123456784",\n  "updatedAt": "2026-05-22T12:00:00Z"\n}',
        {},
        'SHIP',
      ),
      route('PATCH', '/api/orders/:id/status', 200,
        '{\n  "id": "ord-003",\n  "status": "delivered",\n  "deliveredAt": "2026-05-25T09:00:00Z"\n}',
        {},
        'DELIVER',
      ),
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Push notification system with read/unread management and bulk actions',
    routes: [
      route('GET', '/api/notifications', 200, '{\n  "notifications": [\n    { "id": "n1", "type": "info", "title": "Welcome!", "message": "Your account is ready", "read": true, "createdAt": "2026-05-20T10:00:00Z" },\n    { "id": "n2", "type": "warning", "title": "Storage limit", "message": "You are using 90% of your storage", "read": false, "createdAt": "2026-05-21T14:00:00Z" },\n    { "id": "n3", "type": "success", "title": "Payment received", "message": "Your invoice has been paid", "read": false, "createdAt": "2026-05-21T16:00:00Z" }\n  ],\n  "unreadCount": 2\n}', { 'X-Unread-Count': '2' }),
      route('PATCH', '/api/notifications/:id/read', 200, '{\n  "id": "n2",\n  "read": true,\n  "readAt": "2026-05-21T18:00:00Z"\n}'),
      route('DELETE', '/api/notifications', 204, ''),
    ],
  },
  {
    id: 'file-storage',
    label: 'File Storage',
    description: 'Cloud file storage API with listing, upload, and deletion',
    routes: [
      route('GET', '/api/files', 200, '{\n  "files": [\n    { "id": "f1", "name": "report.pdf", "size": 2048576, "mimeType": "application/pdf", "uploadedAt": "2026-05-20" },\n    { "id": "f2", "name": "photo.jpg", "size": 1024000, "mimeType": "image/jpeg", "uploadedAt": "2026-05-21" },\n    { "id": "f3", "name": "data.csv", "size": 512000, "mimeType": "text/csv", "uploadedAt": "2026-05-21" }\n  ],\n  "totalSize": 3584576,\n  "quota": 10737418240\n}'),
      route('POST', '/api/files/upload', 201, '{\n  "id": "f4",\n  "name": "document.docx",\n  "size": 45000,\n  "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",\n  "url": "https://storage.example.com/files/f4",\n  "uploadedAt": "2026-05-21T18:00:00Z"\n}', { 'Content-Type': 'application/json', 'X-Upload-Id': 'up-789' }),
      route('DELETE', '/api/files/:id', 200, '{\n  "deleted": true,\n  "freedSpace": 2048576\n}'),
    ],
  },
  {
    id: 'search-api',
    label: 'Search Engine',
    description: 'Full-text search API with suggestions and indexing endpoints',
    routes: [
      route('GET', '/api/search', 200, '{\n  "query": "typescript",\n  "results": [\n    { "id": 1, "title": "TypeScript Documentation", "url": "https://typescriptlang.org", "snippet": "TypeScript is a strongly typed programming language..." },\n    { "id": 2, "title": "TypeScript Handbook", "url": "https://typescriptlang.org/docs", "snippet": "The TypeScript Handbook is a comprehensive guide..." }\n  ],\n  "totalResults": 1250,\n  "responseTime": 45\n}', { 'X-Response-Time': '45ms', 'X-Total-Results': '1250' }),
      route('GET', '/api/search/suggest', 200, '{\n  "suggestions": [\n    "typescript tutorial",\n    "typescript vs javascript",\n    "typescript generics",\n    "typescript react"\n  ]\n}'),
      route('POST', '/api/search/index', 202, '{\n  "jobId": "idx-001",\n  "status": "queued",\n  "documentsCount": 150,\n  "estimatedTime": 30\n}', { 'X-Job-Id': 'idx-001' }),
    ],
  },
  {
    id: 'payments',
    label: 'Payments / Stripe-like',
    description: 'Payment lifecycle — initiated → pending → processing → succeeded → refunded',
    stateMachine: smCfg(
      [
        {
          id: 'not_started', name: 'Not Started', initial: true,
          mockResponses: [{ method: 'POST', path: '/api/payments/charge', status: 202, body: '{\n  "id": "ch_abc123",\n  "amount": 2999,\n  "currency": "usd",\n  "status": "pending",\n  "description": "Pro Plan Subscription"\n}' }],
        },
        {
          id: 'pending', name: 'Pending',
          mockResponses: [{ method: 'POST', path: '/api/payments/charge', status: 200, body: '{\n  "id": "ch_abc123",\n  "amount": 2999,\n  "currency": "usd",\n  "status": "processing"\n}' }],
        },
        {
          id: 'processing', name: 'Processing',
          mockResponses: [{ method: 'POST', path: '/api/payments/charge', status: 200, body: '{\n  "id": "ch_abc123",\n  "amount": 2999,\n  "currency": "usd",\n  "status": "succeeded",\n  "receipt_url": "https://pay.example.com/receipts/ch_abc123"\n}' }],
        },
        { id: 'succeeded', name: 'Succeeded' },
        { id: 'refunded', name: 'Refunded' },
      ],
      [
        { from: 'not_started', to: 'pending', label: 'CHARGE' },
        { from: 'pending', to: 'processing', label: 'CHARGE' },
        { from: 'processing', to: 'succeeded', label: 'CHARGE' },
        { from: 'succeeded', to: 'refunded', label: 'REFUND' },
      ],
    ),
    routes: [
      // POST /api/payments/charge: cycles through payment states on repeat calls
      // (state node Mock Responses above override this default body/status)
      route('POST', '/api/payments/charge', 202,
        '{\n  "id": "ch_abc123",\n  "amount": 2999,\n  "currency": "usd",\n  "status": "pending",\n  "description": "Pro Plan Subscription"\n}',
        { 'Idempotency-Key': 'idk_unique123' },
        'CHARGE',
      ),
      route('GET', '/api/payments/balance', 200,
        '{\n  "available": [{ "amount": 125000, "currency": "usd" }],\n  "pending": [{ "amount": 4500, "currency": "usd" }]\n}',
      ),
      // POST /api/payments/refund: only works after Succeeded
      route('POST', '/api/payments/refund', 200,
        '{\n  "id": "re_xyz789",\n  "charge": "ch_abc123",\n  "amount": 2999,\n  "status": "succeeded",\n  "reason": "requested_by_customer"\n}',
        {},
        'REFUND',
      ),
    ],
  },
  {
    id: 'health-check',
    label: 'Health / Status',
    description: 'Health probe simulation — GET /health cycles through healthy → degraded → down → recovery',
    stateMachine: smCfg(
      [
        {
          id: 'starting', name: 'Starting', initial: true,
          mockResponses: [{ method: 'GET', path: '/health', status: 200, body: '{\n  "status": "healthy",\n  "version": "2.1.0",\n  "uptime": 864000,\n  "services": { "database": "connected", "cache": "connected", "queue": "connected" }\n}' }],
        },
        {
          id: 'healthy', name: 'Healthy',
          mockResponses: [{ method: 'GET', path: '/health', status: 200, body: '{\n  "status": "degraded",\n  "version": "2.1.0",\n  "uptime": 864000,\n  "services": { "database": "connected", "cache": "slow", "queue": "connected" },\n  "warnings": ["Cache latency elevated"]\n}' }],
        },
        {
          id: 'degraded', name: 'Degraded',
          mockResponses: [{ method: 'GET', path: '/health', status: 503, body: '{\n  "status": "down",\n  "version": "2.1.0",\n  "uptime": 864000,\n  "services": { "database": "disconnected", "cache": "disconnected", "queue": "disconnected" },\n  "error": "Database connection pool exhausted"\n}' }],
        },
        {
          id: 'down', name: 'Down',
          mockResponses: [{ method: 'GET', path: '/health', status: 200, body: '{\n  "status": "healthy",\n  "version": "2.1.0",\n  "uptime": 864060,\n  "services": { "database": "connected", "cache": "connected", "queue": "connected" },\n  "recovered": true\n}' }],
        },
      ],
      [
        { from: 'starting', to: 'healthy', label: 'CHECK' },
        { from: 'healthy', to: 'degraded', label: 'CHECK' },
        { from: 'degraded', to: 'down', label: 'CHECK' },
        { from: 'down', to: 'healthy', label: 'CHECK' },
      ],
    ),
    routes: [
      // GET /health: each call advances degradation — great for chaos testing
      // (state node Mock Responses above override this default body/status)
      route('GET', '/health', 200,
        '{\n  "status": "healthy",\n  "version": "2.1.0",\n  "uptime": 864000\n}',
        { 'X-Version': '2.1.0' },
        'CHECK',
      ),
      route('GET', '/api/status', 200,
        '{\n  "api": "operational",\n  "latency": { "p50": 12, "p95": 45, "p99": 120 },\n  "requestsPerMinute": 2500,\n  "errorRate": 0.02\n}',
      ),
      route('GET', '/api/config', 200,
        '{\n  "environment": "production",\n  "region": "us-east-1",\n  "features": { "darkMode": true, "betaFeatures": false, "maxUploadSize": 10485760 },\n  "maintenance": false\n}',
      ),
    ],
  },
  {
    id: 'oauth2-flow',
    label: 'OAuth2 Flow',
    description: 'OAuth 2.0 Authorization Code flow with authorize, token, userinfo, and discovery endpoints',
    routes: [
      {
        method: 'GET',
        path: '/oauth/authorize',
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: '',
        delay: 0,
        enabled: true,
        responseScript: `const redirect_uri = req.query.redirect_uri || 'http://localhost:3000/callback';
const state = req.query.state || '';
const client_id = req.query.client_id || 'default-client';

return \`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>OAuth 2.0 Authorization</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#0f0f23 0%,#1a1a3e 50%,#0f0f23 100%);color:#e2e8f0}
.card{background:rgba(30,30,60,0.6);backdrop-filter:blur(20px);border:1px solid rgba(99,102,241,0.2);border-radius:16px;padding:40px 32px;max-width:420px;width:100%}
.header{text-align:center;margin-bottom:32px}
.header h1{font-size:22px;font-weight:700;background:linear-gradient(135deg,#818cf8,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
.header p{font-size:13px;color:#94a3b8}
.chip{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;margin-top:8px}
.form-group{margin-bottom:20px}
.form-group label{display:block;font-size:12px;font-weight:500;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px}
.form-group input{width:100%;padding:12px 16px;background:rgba(15,15,35,0.8);border:1px solid rgba(99,102,241,0.2);border-radius:10px;color:#e2e8f0;font-size:14px;outline:none}
.form-group input:focus{border-color:rgba(99,102,241,0.6);box-shadow:0 0 0 3px rgba(99,102,241,0.1)}
.btn{width:100%;padding:14px;border:none;border-radius:10px;font-size:15px;font-weight:600;color:#fff;background:linear-gradient(135deg,#6366f1,#8b5cf6);cursor:pointer;margin-top:8px}
.btn:hover{transform:translateY(-1px);box-shadow:0 10px 30px rgba(99,102,241,0.3)}
.footer{text-align:center;margin-top:24px;font-size:11px;color:#475569}
.footer span{color:#6366f1}
</style></head>
<body><div class="card">
<div class="header"><h1>OAuth 2.0 Authorization</h1><p>Grant access to your account</p><span class="chip">\${client_id}</span></div>
<form onsubmit="handleAuth(event)">
<div class="form-group"><label>Username</label><input type="text" id="username" placeholder="Enter your username" required /></div>
<div class="form-group"><label>Password</label><input type="password" id="password" placeholder="Enter your password" required /></div>
<button type="submit" class="btn">Authorize</button>
</form>
<div class="footer">Powered by <span>Daakia Mock Server</span></div>
</div>
<script>
function handleAuth(e){e.preventDefault();var u=document.getElementById('username').value;var code=btoa(u+':'+Date.now()).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');window.location.href='\${redirect_uri}'+'?code='+code+'&state='+'\${state}';}
</script></body></html>\`;`,
      },
      {
        method: 'POST',
        path: '/oauth/token',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '',
        delay: 100,
        enabled: true,
        responseScript: `// OAuth2 Token endpoint — supports authorization_code and refresh_token grants
const body = req.body || {};
const grant_type = body.grant_type;

if (grant_type === 'authorization_code') {
  const code = body.code || '';
  let username = 'unknown';
  try { username = atob(code).split(':')[0]; } catch(e) {}
  const accessToken = jwt.sign(
    { sub: username, role: 'user', scope: 'openid profile email' },
    'mock-secret-key',
    { expiresIn: 3600 }
  );
  const refreshToken = jwt.sign(
    { sub: username, type: 'refresh' },
    'mock-refresh-secret',
    { expiresIn: 86400 }
  );
  const idToken = jwt.sign(
    { sub: username, name: username, email: username + '@example.com', iss: 'daakia-mock' },
    'mock-secret-key',
    { expiresIn: 3600 }
  );
  return { access_token: accessToken, refresh_token: refreshToken, id_token: idToken, token_type: 'Bearer', expires_in: 3600 };
}

if (grant_type === 'refresh_token') {
  const newToken = jwt.sign(
    { sub: 'refreshed-user', role: 'user', scope: 'openid profile email' },
    'mock-secret-key',
    { expiresIn: 3600 }
  );
  return { access_token: newToken, token_type: 'Bearer', expires_in: 3600 };
}

return { error: 'unsupported_grant_type', status: 400 };`,
      },
      {
        method: 'GET',
        path: '/oauth/userinfo',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '',
        delay: 0,
        enabled: true,
        responseScript: `// Protected userinfo endpoint
const auth = req.headers['authorization'] || req.headers['Authorization'] || '';
if (!auth.startsWith('Bearer ')) {
  return { error: 'invalid_token', error_description: 'Missing or invalid Bearer token', status: 401 };
}
const token = auth.replace('Bearer ', '');
if (token.split('.').length !== 3) {
  return { error: 'invalid_token', error_description: 'Malformed token', status: 401 };
}
let sub = 'mock-user';
try { sub = JSON.parse(atob(token.split('.')[1])).sub || sub; } catch(e) {}
return { sub, name: sub, email: sub + '@example.com', email_verified: true, picture: 'https://i.pravatar.cc/150' };`,
      },
      {
        method: 'GET',
        path: '/.well-known/openid-configuration',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '',
        delay: 0,
        enabled: true,
        responseScript: `// OpenID Connect Discovery document
const host = req.headers['host'] || 'localhost:3000';
const issuer = 'http://' + host;
return {
  issuer,
  authorization_endpoint: issuer + '/oauth/authorize',
  token_endpoint: issuer + '/oauth/token',
  userinfo_endpoint: issuer + '/oauth/userinfo',
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['HS256'],
  scopes_supported: ['openid', 'profile', 'email'],
  token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic']
};`,
      },
    ],
  },
  {
    id: 'cookie-testing',
    label: 'Cookie Testing',
    description: 'Endpoints that set, read, and clear cookies — test the Cookies tab in response panel',
    routes: [
      route('POST', '/api/login', 200, '{\n  "message": "Login successful",\n  "user": { "id": "u1", "name": "John Doe", "email": "john@example.com" }\n}', { 'Set-Cookie': 'session_id=abc123xyz; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600' }),
      route('GET', '/api/profile', 200, '{\n  "id": "u1",\n  "name": "John Doe",\n  "email": "john@example.com",\n  "role": "admin",\n  "preferences": { "theme": "dark", "language": "en" }\n}', { 'Set-Cookie': 'last_visit=2026-05-27T18:00:00Z; Path=/; Max-Age=86400' }),
      route('POST', '/api/logout', 200, '{\n  "message": "Logged out successfully"\n}', { 'Set-Cookie': 'session_id=; Path=/; HttpOnly; Max-Age=0' }),
    ],
  },
  {
    id: 'auth-conditional',
    label: 'Auth Flow (Real Validation)',
    description: 'Login only succeeds when the request body actually has non-empty username + password — checked against the real request content, not just "any state matches". Wrong/missing credentials get a 401 and no state change. Uses the event-driven Trigger Event mode: open the State Machine tab to see the connected workflow, or any route\'s Response tab to see its Trigger Event. Ships with a SECOND connected workflow ("Auth Flow — Partner Login") to demo per-route workflow selection: send the X-Partner-Id header on POST /api/auth/login (any value, no body needed) to route through the partner workflow instead — open that route\'s Response tab to see the State Machine dropdown pick "Auth Flow — Partner Login" and its Trigger Event scoped to PARTNER_LOGIN_SUCCESS only.',
    additionalWorkflows: {
      'auth-conditional-partner': {
        enabled: true,
        sessionMode: 'header',
        sessionKey: 'X-Session-ID',
        defaultState: 'partner_unauthenticated',
        states: [
          { id: 'partner_unauthenticated', name: 'Partner Unauthenticated', x: 250, y: 20, isInitial: true },
          { id: 'partner_authorized', name: 'Partner Authorized', x: 250, y: 200 },
        ],
        transitions: [
          { id: 'partner-t1', from: 'partner_unauthenticated', to: 'partner_authorized', routeId: '', label: 'PARTNER_LOGIN_SUCCESS' },
          { id: 'partner-t2', from: 'partner_authorized', to: 'partner_unauthenticated', routeId: '', label: 'PARTNER_LOGOUT' },
        ],
      },
    },
    stateMachine: {
      enabled: true,
      sessionMode: 'header',
      sessionKey: 'X-Session-ID',
      defaultState: 'unauthenticated',
      states: [
        { id: 'unauthenticated', name: 'Unauthenticated', x: 250, y: 20, isInitial: true },
        { id: 'authorized', name: 'Authorized', x: 250, y: 200 },
      ],
      transitions: [
        { id: 'auth-t1', from: 'unauthenticated', to: 'authorized', routeId: '', label: 'LOGIN_SUCCESS' },
        { id: 'auth-t2', from: 'authorized', to: 'authorized', routeId: '', label: 'VIEW_PROFILE' },
        { id: 'auth-t3', from: 'authorized', to: 'unauthenticated', routeId: '', label: 'LOGOUT' },
        { id: 'auth-t4', from: 'unauthenticated', to: 'unauthenticated', routeId: '', label: 'LOGIN_FAILED' },
      ],
    },
    routes: [
      // Partner login — matched purely on a custom header's presence (Matching
      // tab), regardless of body. Highest priority (0) so it's tried before
      // the username/password route below on the same path+method. Scoped to
      // the SECOND connected workflow via connectedWorkflowId — demonstrates
      // that a route's Trigger Event is resolved against ONE specific
      // workflow, not a merged pool of every connected workflow's events.
      {
        method: 'POST', path: '/api/auth/login', statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{\n  "success": true,\n  "partner": true,\n  "token": "eyJhbGciOiJIUzI1NiJ9.partner-demo-token",\n  "message": "Partner logged in"\n}',
        delay: 0, enabled: true, priority: 0,
        headerMatchers: [{ id: 'partner-hdr', key: 'X-Partner-Id', matchType: 'present', value: '' }],
        connectedWorkflowId: 'sm-wf-auth-conditional-partner',
        triggerEvent: 'PARTNER_LOGIN_SUCCESS',
      },
      // Real validation: only matches when the body actually contains non-empty
      // "username" and "password" fields (checked via a regex bodyMatcher against
      // the real request content) — the request itself decides whether this fires.
      {
        method: 'POST', path: '/api/auth/login', statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{\n  "success": true,\n  "token": "eyJhbGciOiJIUzI1NiJ9.demo-token",\n  "message": "Logged in"\n}',
        delay: 0, enabled: true, priority: 1,
        bodyMatcher: { matchType: 'regex', value: '(?=.*"username"\\s*:\\s*"[^"]+")(?=.*"password"\\s*:\\s*"[^"]+")' },
        connectedWorkflowId: 'sm-wf-auth-conditional',
        triggerEvent: 'LOGIN_SUCCESS',
      },
      // Fallback — no partner header, body didn't have both real fields either.
      // No matchers (always matches), lowest priority. Fires a real event too
      // (LOGIN_FAILED, a self-loop that keeps the session unauthenticated) —
      // a failed attempt is still a real, traceable event, not an unfired
      // "None". Only valid from "unauthenticated", so it can't fire while an
      // already-authorized session happens to hit this route.
      {
        method: 'POST', path: '/api/auth/login', statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: '{\n  "success": false,\n  "error": "username and password are required"\n}',
        delay: 0, enabled: true,
        connectedWorkflowId: 'sm-wf-auth-conditional',
        triggerEvent: 'LOGIN_FAILED',
      },
      // Protected resource — the graph only allows VIEW_PROFILE from
      // "authorized", so this 404s until a real login has actually fired.
      {
        method: 'GET', path: '/api/profile', statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{\n  "user": "demo",\n  "authorized": true\n}',
        delay: 0, enabled: true,
        connectedWorkflowId: 'sm-wf-auth-conditional',
        triggerEvent: 'VIEW_PROFILE',
      },
      // Partner logout — same header-gating + priority pattern as partner login.
      {
        method: 'POST', path: '/api/auth/logout', statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{\n  "success": true,\n  "partner": true,\n  "message": "Partner logged out"\n}',
        delay: 0, enabled: true, priority: 0,
        headerMatchers: [{ id: 'partner-hdr-logout', key: 'X-Partner-Id', matchType: 'present', value: '' }],
        connectedWorkflowId: 'sm-wf-auth-conditional-partner',
        triggerEvent: 'PARTNER_LOGOUT',
      },
      {
        method: 'POST', path: '/api/auth/logout', statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{\n  "success": true,\n  "message": "Logged out"\n}',
        delay: 0, enabled: true,
        connectedWorkflowId: 'sm-wf-auth-conditional',
        triggerEvent: 'LOGOUT',
      },
    ],
  },
];
