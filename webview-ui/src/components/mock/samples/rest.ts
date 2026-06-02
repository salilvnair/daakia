/**
 * REST mock server sample routes.
 * Each sample provides 3 routes with method, path, status, headers, and body.
 */
import type { MockRoute } from '../mock-types';

export interface RestSample {
  id: string;
  label: string;
  description: string;
  routes: Array<Omit<MockRoute, 'id'>>;
}

function route(method: MockRoute['method'], path: string, statusCode: number, body: string, headers: Record<string, string> = {}): Omit<MockRoute, 'id'> {
  return { method, path, statusCode, body, headers: { 'Content-Type': 'application/json', ...headers }, delay: 0, enabled: true };
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
    routes: [
      route('POST', '/api/auth/login', 200, '{\n  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ",\n  "refreshToken": "rt_abc123def456",\n  "expiresIn": 3600,\n  "user": { "id": "u1", "email": "user@example.com", "name": "John Doe" }\n}', { 'X-Auth-Provider': 'local' }),
      route('POST', '/api/auth/refresh', 200, '{\n  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.newtoken",\n  "expiresIn": 3600\n}'),
      route('POST', '/api/auth/logout', 200, '{\n  "message": "Successfully logged out"\n}'),
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
    description: 'Order management with listing, creation, and status updates',
    routes: [
      route('GET', '/api/orders', 200, '{\n  "orders": [\n    { "id": "ord-001", "status": "delivered", "total": 89.99, "items": 3, "createdAt": "2026-05-18" },\n    { "id": "ord-002", "status": "shipped", "total": 249.50, "items": 1, "createdAt": "2026-05-20" },\n    { "id": "ord-003", "status": "processing", "total": 34.99, "items": 2, "createdAt": "2026-05-21" }\n  ]\n}'),
      route('POST', '/api/orders', 201, '{\n  "id": "ord-004",\n  "status": "pending",\n  "total": 159.98,\n  "items": [\n    { "productId": "p1", "name": "Widget", "quantity": 2, "price": 79.99 }\n  ],\n  "estimatedDelivery": "2026-05-28"\n}', { 'X-Order-Id': 'ord-004' }),
      route('PATCH', '/api/orders/:id/status', 200, '{\n  "id": "ord-003",\n  "status": "shipped",\n  "trackingNumber": "1Z999AA10123456784",\n  "updatedAt": "2026-05-21T18:00:00Z"\n}'),
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
    description: 'Payment processing API with charges, balance, and refunds',
    routes: [
      route('POST', '/api/payments/charge', 200, '{\n  "id": "ch_abc123",\n  "amount": 2999,\n  "currency": "usd",\n  "status": "succeeded",\n  "description": "Pro Plan Subscription",\n  "receipt_url": "https://pay.example.com/receipts/ch_abc123",\n  "created": 1716321600\n}', { 'Idempotency-Key': 'idk_unique123' }),
      route('GET', '/api/payments/balance', 200, '{\n  "available": [\n    { "amount": 125000, "currency": "usd" }\n  ],\n  "pending": [\n    { "amount": 4500, "currency": "usd" }\n  ]\n}'),
      route('POST', '/api/payments/refund', 200, '{\n  "id": "re_xyz789",\n  "charge": "ch_abc123",\n  "amount": 2999,\n  "status": "succeeded",\n  "reason": "requested_by_customer"\n}'),
    ],
  },
  {
    id: 'health-check',
    label: 'Health / Status',
    description: 'Service health monitoring with status checks and configuration',
    routes: [
      route('GET', '/health', 200, '{\n  "status": "healthy",\n  "version": "2.1.0",\n  "uptime": 864000,\n  "services": {\n    "database": "connected",\n    "cache": "connected",\n    "queue": "connected"\n  }\n}', { 'X-Version': '2.1.0' }),
      route('GET', '/api/status', 200, '{\n  "api": "operational",\n  "latency": { "p50": 12, "p95": 45, "p99": 120 },\n  "requestsPerMinute": 2500,\n  "errorRate": 0.02\n}'),
      route('GET', '/api/config', 200, '{\n  "environment": "production",\n  "region": "us-east-1",\n  "features": {\n    "darkMode": true,\n    "betaFeatures": false,\n    "maxUploadSize": 10485760\n  },\n  "maintenance": false\n}'),
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
];
