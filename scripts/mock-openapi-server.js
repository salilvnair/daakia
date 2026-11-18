#!/usr/bin/env node
/**
 * A service with a Swagger page, on this machine — something for Import from
 * Swagger URL to read without the internet, and with enough in it to show
 * what the import does.
 *
 * One API, written once below, served every way the import is meant to cope
 * with:
 *
 *   /v3/api-docs                 OpenAPI 3, JSON — where springdoc puts it
 *   /openapi.json, /openapi.yaml OpenAPI 3, JSON and YAML
 *   /v2/swagger.json             the same API as Swagger 2
 *   /swagger-ui/index.html       a Swagger UI page — the import has to find the spec behind it
 *   /redoc                       a ReDoc page, the same test
 *   /private/openapi.json        needs `Authorization: Bearer test-token`, for the header table
 *
 * And the API itself answers under /api, so a request the import made can be
 * sent and get something back.
 *
 * The spec is built to exercise the import: six tags, every method from GET to
 * OPTIONS (for the method chips), path parameters shared between operations, a
 * deprecated one, an internal one, two servers, a bearer and an API-key scheme,
 * request bodies with examples, and enough operations to want the search.
 *
 *   node scripts/mock-openapi-server.js [--port 8088]
 *
 * Never ships: scripts/ is in .vscodeignore.
 */
const http = require('http');

const portArg = process.argv.indexOf('--port');
const PORT = portArg > -1 ? Number(process.argv[portArg + 1]) : 8088;
const BASE = `http://localhost:${PORT}`;

// ── The API, once ────────────────────────────────────────────────────────────

const user = { id: 'u_1042', email: 'asha@shop.test', name: 'Asha Rao', role: 'customer', createdAt: '2026-03-14T09:21:00Z' };
const product = { id: 'p_88', sku: 'MUG-BLK-12', name: 'Black mug, 12 oz', priceCents: 1499, currency: 'USD', stock: 132 };
const order = { id: 'o_5531', userId: 'u_1042', status: 'paid', items: [{ productId: 'p_88', quantity: 2 }], totalCents: 2998, currency: 'USD' };
const payment = { id: 'pay_9001', orderId: 'o_5531', amountCents: 2998, currency: 'USD', method: 'card', status: 'captured' };
const webhook = { id: 'wh_7', url: 'https://hooks.shop.test/orders', events: ['order.paid', 'order.refunded'], active: true };

/** [method, path, tag, summary, operationId, extra] */
const OPS = [
  ['get', '/users', 'Users', 'List users', 'listUsers', { query: ['page', 'pageSize', 'role'], res: { items: [user], page: 1, total: 1 } }],
  ['post', '/users', 'Users', 'Create a user', 'createUser', { body: { email: 'new@shop.test', name: 'New Person', role: 'customer' }, res: user, status: 201 }],
  ['get', '/users/{userId}', 'Users', 'Get a user', 'getUser', { res: user }],
  ['put', '/users/{userId}', 'Users', 'Replace a user', 'replaceUser', { body: { email: user.email, name: user.name, role: 'customer' }, res: user }],
  ['patch', '/users/{userId}', 'Users', 'Update a user', 'updateUser', { body: { name: 'Asha R.' }, res: user }],
  ['delete', '/users/{userId}', 'Users', 'Delete a user', 'deleteUser', { status: 204 }],
  ['get', '/users/{userId}/orders', 'Users', "List a user's orders", 'listUserOrders', { query: ['status'], res: { items: [order] } }],

  ['get', '/products', 'Products', 'Search products', 'searchProducts', { query: ['q', 'minPrice', 'maxPrice', 'inStock'], res: { items: [product] } }],
  ['post', '/products', 'Products', 'Add a product', 'addProduct', { body: { sku: 'MUG-WHT-12', name: 'White mug, 12 oz', priceCents: 1499, currency: 'USD' }, res: product, status: 201 }],
  ['get', '/products/{productId}', 'Products', 'Get a product', 'getProduct', { res: product }],
  ['patch', '/products/{productId}', 'Products', 'Change price or stock', 'patchProduct', { body: { priceCents: 1299 }, res: product }],
  ['delete', '/products/{productId}', 'Products', 'Retire a product', 'retireProduct', { status: 204 }],
  ['head', '/products/{productId}', 'Products', 'Check a product exists', 'productExists', { status: 200 }],

  ['get', '/orders', 'Orders', 'List orders', 'listOrders', { query: ['status', 'from', 'to'], res: { items: [order] } }],
  ['post', '/orders', 'Orders', 'Place an order', 'placeOrder', { body: { userId: 'u_1042', items: [{ productId: 'p_88', quantity: 2 }] }, res: order, status: 201 }],
  ['get', '/orders/{orderId}', 'Orders', 'Get an order', 'getOrder', { res: order }],
  ['post', '/orders/{orderId}/cancel', 'Orders', 'Cancel an order', 'cancelOrder', { body: { reason: 'changed my mind' }, res: { ...order, status: 'cancelled' } }],
  ['get', '/orders/{orderId}/invoice', 'Orders', 'Download the invoice', 'getInvoice', { res: { url: `${BASE}/files/invoice-o_5531.pdf` }, deprecated: true }],

  ['post', '/payments', 'Payments', 'Charge an order', 'chargeOrder', { body: { orderId: 'o_5531', method: 'card', token: 'tok_visa' }, res: payment, status: 201 }],
  ['get', '/payments/{paymentId}', 'Payments', 'Get a payment', 'getPayment', { res: payment }],
  ['post', '/payments/{paymentId}/refund', 'Payments', 'Refund a payment', 'refundPayment', { body: { amountCents: 2998 }, res: { ...payment, status: 'refunded' } }],

  ['get', '/webhooks', 'Webhooks', 'List webhooks', 'listWebhooks', { res: { items: [webhook] } }],
  ['post', '/webhooks', 'Webhooks', 'Register a webhook', 'createWebhook', { body: { url: 'https://hooks.shop.test/orders', events: ['order.paid'] }, res: webhook, status: 201 }],
  ['delete', '/webhooks/{webhookId}', 'Webhooks', 'Remove a webhook', 'deleteWebhook', { status: 204 }],
  ['options', '/webhooks', 'Webhooks', 'What the webhooks endpoint allows', 'webhookOptions', { status: 204 }],

  ['get', '/internal/health', 'Admin', 'Health check', 'health', { res: { status: 'UP' }, noAuth: true }],
  ['get', '/internal/metrics', 'Admin', 'Prometheus metrics', 'metrics', { res: { requests: 1204 } }],
];

const PARAM_EXAMPLES = { userId: 'u_1042', productId: 'p_88', orderId: 'o_5531', paymentId: 'pay_9001', webhookId: 'wh_7' };
const QUERY_EXAMPLES = { page: 1, pageSize: 20, role: 'customer', status: 'paid', q: 'mug', minPrice: 500, maxPrice: 5000, inStock: true, from: '2026-01-01', to: '2026-12-31' };

const schemaOf = v => (Array.isArray(v) ? { type: 'array', items: v.length ? schemaOf(v[0]) : {} }
  : v === null ? { type: 'string', nullable: true }
  : typeof v === 'object' ? { type: 'object', properties: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, schemaOf(x)])) }
  : typeof v === 'number' ? { type: Number.isInteger(v) ? 'integer' : 'number', example: v }
  : typeof v === 'boolean' ? { type: 'boolean', example: v }
  : { type: 'string', example: v });

function openapi3() {
  const paths = {};
  for (const [method, path, tag, summary, operationId, x] of OPS) {
    const params = [
      ...[...path.matchAll(/\{(\w+)\}/g)].map(m => ({ name: m[1], in: 'path', required: true, schema: { type: 'string', example: PARAM_EXAMPLES[m[1]] } })),
      ...(x.query || []).map(q => ({ name: q, in: 'query', required: false, schema: { type: typeof QUERY_EXAMPLES[q] === 'number' ? 'integer' : typeof QUERY_EXAMPLES[q] === 'boolean' ? 'boolean' : 'string', example: QUERY_EXAMPLES[q] } })),
    ];
    const status = String(x.status || 200);
    (paths[path] ??= {})[method] = {
      tags: [tag], summary, operationId,
      ...(x.deprecated ? { deprecated: true } : {}),
      ...(params.length ? { parameters: params } : {}),
      ...(x.body ? { requestBody: { required: true, content: { 'application/json': { schema: schemaOf(x.body), example: x.body } } } } : {}),
      responses: {
        [status]: x.res ? { description: 'OK', content: { 'application/json': { schema: schemaOf(x.res), example: x.res } } } : { description: 'Done' },
        ...(method !== 'head' && method !== 'options' ? { 401: { description: 'Not signed in' } } : {}),
      },
      ...(x.noAuth ? { security: [] } : {}),
    };
  }
  return {
    openapi: '3.0.3',
    info: { title: 'Daakia Test Shop', version: '1.4.0', description: 'A shop API for trying Import from Swagger URL. Served by scripts/mock-openapi-server.js.' },
    servers: [
      { url: `${BASE}/api`, description: 'This machine' },
      { url: 'https://staging.shop.test/api', description: 'Staging' },
    ],
    tags: ['Users', 'Products', 'Orders', 'Payments', 'Webhooks', 'Admin'].map(name => ({ name })),
    security: [{ bearerAuth: [] }, { apiKey: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
    },
    paths,
  };
}

function swagger2() {
  const paths = {};
  for (const [method, path, tag, summary, operationId, x] of OPS) {
    if (method === 'options') continue;
    const params = [
      ...[...path.matchAll(/\{(\w+)\}/g)].map(m => ({ name: m[1], in: 'path', required: true, type: 'string', 'x-example': PARAM_EXAMPLES[m[1]] })),
      ...(x.query || []).map(q => ({ name: q, in: 'query', required: false, type: 'string' })),
      ...(x.body ? [{ name: 'body', in: 'body', required: true, schema: { ...schemaOf(x.body), example: x.body } }] : []),
    ];
    (paths[path] ??= {})[method] = {
      tags: [tag], summary, operationId,
      ...(x.deprecated ? { deprecated: true } : {}),
      ...(params.length ? { parameters: params } : {}),
      produces: ['application/json'],
      responses: { [String(x.status || 200)]: { description: 'OK', ...(x.res ? { schema: schemaOf(x.res), examples: { 'application/json': x.res } } : {}) } },
    };
  }
  return {
    swagger: '2.0',
    info: { title: 'Daakia Test Shop (Swagger 2)', version: '1.4.0' },
    host: `localhost:${PORT}`, basePath: '/api', schemes: ['http'],
    securityDefinitions: { bearerAuth: { type: 'apiKey', in: 'header', name: 'Authorization' } },
    security: [{ bearerAuth: [] }],
    paths,
  };
}

/** Enough YAML for a spec: maps, lists, scalars. */
function toYaml(v, indent = '') {
  if (Array.isArray(v)) {
    if (!v.length) return ' []';
    return v.map(x => (x && typeof x === 'object'
      ? `\n${indent}-${toYaml(x, indent + '  ').replace(/^\n\s*/, ' ')}`
      : `\n${indent}- ${scalar(x)}`)).join('');
  }
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (!keys.length) return ' {}';
    return keys.map(k => {
      const x = v[k];
      const key = /^[\w.-]+$/.test(k) ? k : JSON.stringify(k);
      return x && typeof x === 'object' ? `\n${indent}${key}:${toYaml(x, indent + '  ')}` : `\n${indent}${key}: ${scalar(x)}`;
    }).join('');
  }
  return ` ${scalar(v)}`;
}
const scalar = x => (typeof x === 'string' ? JSON.stringify(x) : String(x));

// ── The pages in front of the spec ───────────────────────────────────────────

const swaggerUi = `<!doctype html>
<html><head><meta charset="utf-8"><title>Swagger UI</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css"></head>
<body><div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script src="./swagger-initializer.js"></script>
</body></html>`;
const swaggerInit = `window.onload = function () {
  window.ui = SwaggerUIBundle({ url: "/v3/api-docs", dom_id: '#swagger-ui', deepLinking: true });
};`;
const redoc = `<!doctype html>
<html><head><meta charset="utf-8"><title>ReDoc</title></head>
<body><redoc spec-url="/openapi.json"></redoc>
<script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body></html>`;

// ── The API answering ────────────────────────────────────────────────────────

function route(method, pathname) {
  for (const [m, path, , , , x] of OPS) {
    if (m !== method) continue;
    const re = new RegExp(`^/api${path.replace(/\{\w+\}/g, '[^/]+')}$`);
    if (re.test(pathname)) return x;
  }
  return null;
}

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
  res.end(body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body, null, 2));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, BASE);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toLowerCase();
  const stamp = new Date().toISOString().slice(11, 19);
  console.log(`${stamp} ${req.method} ${req.url}`);

  if (method === 'get') {
    if (p === '/v3/api-docs' || p === '/openapi.json') return send(res, 200, openapi3());
    if (p === '/openapi.yaml' || p === '/openapi.yml') return send(res, 200, toYaml(openapi3()).trimStart() + '\n', 'application/yaml');
    if (p === '/v2/swagger.json' || p === '/swagger.json') return send(res, 200, swagger2());
    if (p === '/private/openapi.json') {
      return req.headers.authorization === 'Bearer test-token'
        ? send(res, 200, openapi3())
        : send(res, 401, { error: 'Send Authorization: Bearer test-token' });
    }
    if (p === '/swagger-ui' || p === '/swagger-ui/index.html' || p === '/swagger-ui.html') return send(res, 200, swaggerUi, 'text/html');
    if (p === '/swagger-ui/swagger-initializer.js') return send(res, 200, swaggerInit, 'application/javascript');
    if (p === '/redoc') return send(res, 200, redoc, 'text/html');
    if (p === '/') {
      return send(res, 200, `Daakia Test Shop — try these in Import from Swagger URL:\n\n${[
        '/v3/api-docs', '/openapi.json', '/openapi.yaml', '/v2/swagger.json', '/swagger-ui/index.html', '/redoc',
        '/private/openapi.json  (header: Authorization: Bearer test-token)',
      ].map(x => `  ${BASE}${x}`).join('\n')}\n`, 'text/plain');
    }
  }

  const hit = route(method, p);
  if (!hit) return send(res, 404, { error: `No ${req.method} ${p} here` });
  /* The API wants a key or a token, as its spec says — except health. */
  if (!hit.noAuth && !req.headers.authorization && !req.headers['x-api-key']) {
    return send(res, 401, { error: 'Send Authorization: Bearer <token> or X-API-Key' });
  }
  if (method === 'options') { res.writeHead(204, { Allow: 'GET, POST, OPTIONS', 'Access-Control-Allow-Origin': '*' }); return res.end(); }
  const status = hit.status || 200;
  if (status === 204 || method === 'head') { res.writeHead(status); return res.end(); }
  send(res, status, hit.res ?? {});
});

server.listen(PORT, () => {
  console.log(`Daakia Test Shop on ${BASE}`);
  console.log(`  Swagger UI     ${BASE}/swagger-ui/index.html`);
  console.log(`  OpenAPI 3      ${BASE}/v3/api-docs   (also /openapi.json, /openapi.yaml)`);
  console.log(`  Swagger 2      ${BASE}/v2/swagger.json`);
  console.log(`  ReDoc          ${BASE}/redoc`);
  console.log(`  Private spec   ${BASE}/private/openapi.json   with  Authorization: Bearer test-token`);
  console.log(`  ${OPS.length} operations under ${BASE}/api`);
});
