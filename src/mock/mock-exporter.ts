/**
 * mock-exporter.ts — Export mock server config as standalone Node.js / WireMock JSON (6A.24-6A.25).
 */
import type { MockServerConfig, MockRoute } from './mock-types';

// ─── Export as WireMock JSON (6A.25) ─────────────────────────────────────────

export function exportAsWireMock(config: MockServerConfig): string {
  const mappings = config.routes.filter(r => r.enabled).map(routeToWireMock);
  return JSON.stringify({ mappings }, null, 2);
}

function routeToWireMock(route: MockRoute): Record<string, unknown> {
  const mapping: Record<string, unknown> = {
    priority: route.priority ?? 5,
    request: {
      method: route.method,
      url: route.path,
    },
    response: {
      status: route.statusCode,
      body: route.body || undefined,
      headers: Object.keys(route.headers).length > 0 ? route.headers : undefined,
      fixedDelayMilliseconds: route.delay || undefined,
    },
  };

  // Advanced URL matching
  if (route.urlMatch) {
    const req = mapping.request as Record<string, unknown>;
    delete req.url;
    switch (route.urlMatch.type) {
      case 'exact':      req.url = route.urlMatch.value; break;
      case 'regex':      req.urlPattern = route.urlMatch.value; break;
      case 'pathPrefix': req.urlPathPattern = `^${route.urlMatch.value}.*`; break;
      case 'glob':       req.urlPath = route.urlMatch.value; break;
      case 'template':   req.urlPath = route.urlMatch.value; break;
    }
  }

  // Header matchers
  if (route.headerMatchers?.length) {
    const headers: Record<string, unknown> = {};
    route.headerMatchers.forEach(m => {
      headers[m.key] = { [m.matchType === 'equalTo' ? 'equalTo' : m.matchType === 'contains' ? 'contains' : 'matches']: m.value };
    });
    (mapping.request as Record<string, unknown>).headers = headers;
  }

  // Body matcher
  if (route.bodyMatcher) {
    const req = mapping.request as Record<string, unknown>;
    switch (route.bodyMatcher.matchType) {
      case 'equalToJson':      req.bodyPatterns = [{ equalToJson: route.bodyMatcher.value }]; break;
      case 'matchesJsonPath':  req.bodyPatterns = [{ matchesJsonPath: route.bodyMatcher.value }]; break;
      case 'contains':         req.bodyPatterns = [{ contains: route.bodyMatcher.value }]; break;
      case 'regex':            req.bodyPatterns = [{ matches: route.bodyMatcher.value }]; break;
    }
  }

  // Fault injection
  if (route.fault?.enabled && route.fault.type) {
    (mapping.response as Record<string, unknown>).fault = route.fault.type;
  }

  // Response template
  if (route.isTemplate) {
    (mapping.response as Record<string, unknown>).transformers = ['response-template'];
  }

  return mapping;
}

// ─── Export as standalone Node.js server (6A.24) ─────────────────────────────

export function exportAsNodeServer(config: MockServerConfig): string {
  const port = config.port ?? 3000;
  const routesJson = JSON.stringify(config.routes.filter(r => r.enabled), null, 2);

  return `/**
 * Daakia Mock Server — Standalone Export
 * Generated from: ${config.name}
 * Run: npm start
 */
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || ${port};

const routes = ${routesJson};

function matchPath(routePath, reqPath) {
  if (routePath === reqPath) return { matched: true, params: {} };
  const rParts = routePath.split('/').filter(Boolean);
  const qParts = reqPath.split('/').filter(Boolean);
  if (rParts.length !== qParts.length) return { matched: false, params: {} };
  const params = {};
  const matched = rParts.every((p, i) => {
    if (p.startsWith(':')) { params[p.slice(1)] = qParts[i]; return true; }
    return p === qParts[i];
  });
  return { matched, params };
}

const server = http.createServer((req, res) => {
  const startTime = Date.now();
  const method = (req.method || 'GET').toUpperCase();
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const queryParams = {};
    url.searchParams.forEach((v, k) => { queryParams[k] = v; });

    const route = routes.find(r => r.enabled && (r.method === 'ANY' || r.method === method) && matchPath(r.path, pathname).matched);
    if (!route) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found', path: pathname, method }));
      return;
    }

    const { params } = matchPath(route.path, pathname);
    const sendResponse = () => {
      let responseBody = route.body || '{}';
      if (route.responseScript) {
        try {
          let bodyParsed = body;
          try { bodyParsed = JSON.parse(body); } catch {}
          const req2 = { method, path: pathname, headers: req.headers, query: queryParams, body: bodyParsed, rawBody: body, params };
          const fn = new Function('req', 'JSON', 'Date', 'Math', 'crypto', route.responseScript + '\\nreturn undefined;');
          const result = fn(req2, JSON, Date, Math, { randomUUID: () => crypto.randomUUID() });
          if (result !== undefined) responseBody = typeof result === 'string' ? result : JSON.stringify(result);
        } catch(e) { responseBody = JSON.stringify({ error: 'Script error', message: e.message }); }
      }
      Object.entries(route.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
      res.writeHead(route.statusCode || 200);
      res.end(responseBody);
      console.log(\`[\${new Date().toISOString()}] \${method} \${pathname} → \${route.statusCode} (\${Date.now() - startTime}ms)\`);
    };

    if (route.delay > 0) setTimeout(sendResponse, route.delay);
    else sendResponse();
  });
});

server.listen(PORT, () => {
  console.log(\`\\n🚀 Daakia Mock Server "${config.name}" running on http://localhost:\${PORT}\`);
  console.log(\`   Routes: \${routes.filter(r => r.enabled).length} active\\n\`);
  routes.filter(r => r.enabled).forEach(r => {
    console.log(\`   \${r.method.padEnd(7)} \${r.path} → \${r.statusCode}\`);
  });
  console.log('');
});
`;
}

export function exportDockerfile(config: MockServerConfig): string {
  return `FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY server.js .
EXPOSE ${config.port ?? 3000}
CMD ["node", "server.js"]
`;
}

export function exportPackageJson(config: MockServerConfig): string {
  return JSON.stringify({
    name: config.name.toLowerCase().replace(/\s+/g, '-') + '-mock',
    version: '1.0.0',
    description: `Daakia Mock Server: ${config.name}`,
    main: 'server.js',
    scripts: { start: 'node server.js' },
    dependencies: {},
  }, null, 2);
}
