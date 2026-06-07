/**
 * AI Mock Server — serves OpenAI-compatible chat completions API.
 * Matches user messages to 15 pre-defined API-development scenarios.
 * Use as a drop-in base URL (http://localhost:PORT/v1) in any OpenAI-compatible provider.
 */
import * as http from 'http';
import * as crypto from 'crypto';
import type { MockServerConfig, AiMockScenario, MockLogEntry } from './mock-types';

export type LogCallback = (entry: MockLogEntry) => void;

// ─── 15 Realistic AI Mock Scenarios ──────────────────────────────────────────

export const DEFAULT_AI_SCENARIOS: Omit<AiMockScenario, 'id'>[] = [
  {
    name: 'Generate JSON Schema',
    keywords: ['json schema', 'schema', 'generate schema', 'validate json', 'schema for'],
    response: `Here's a JSON Schema for your data model:\n\n\`\`\`json\n{\n  "$schema": "http://json-schema.org/draft-07/schema#",\n  "type": "object",\n  "title": "User",\n  "required": ["id", "name", "email"],\n  "properties": {\n    "id": {\n      "type": "string",\n      "format": "uuid",\n      "description": "Unique user identifier"\n    },\n    "name": {\n      "type": "string",\n      "minLength": 1,\n      "maxLength": 255\n    },\n    "email": {\n      "type": "string",\n      "format": "email"\n    },\n    "age": {\n      "type": "integer",\n      "minimum": 0,\n      "maximum": 150\n    },\n    "roles": {\n      "type": "array",\n      "items": {\n        "type": "string",\n        "enum": ["admin", "user", "moderator"]\n      }\n    },\n    "createdAt": {\n      "type": "string",\n      "format": "date-time"\n    }\n  },\n  "additionalProperties": false\n}\n\`\`\`\n\nThis schema enforces:\n- Required fields: \`id\`, \`name\`, \`email\`\n- UUID format for \`id\`\n- Email format validation\n- Enum constraint on \`roles\`\n- No additional properties allowed`,
    delay: 400,
    enabled: true,
  },
  {
    name: 'Explain API Response',
    keywords: ['explain', 'what does', 'what is this', 'explain response', 'explain this'],
    response: `Let me break down this API response for you:\n\n**Status: 200 OK** — The request succeeded.\n\n**Key fields:**\n- \`data\` — The primary payload. Contains the requested resource.\n- \`meta\` — Pagination metadata (page, total, per_page).\n- \`links\` — HATEOAS navigation links for prev/next pages.\n\n**Pagination pattern:**\n\`\`\`json\n{\n  "data": [...],\n  "meta": {\n    "current_page": 1,\n    "total": 243,\n    "per_page": 20,\n    "total_pages": 13\n  },\n  "links": {\n    "self": "/api/users?page=1",\n    "next": "/api/users?page=2",\n    "last": "/api/users?page=13"\n  }\n}\n\`\`\`\n\n**Tips:**\n- Use \`links.next\` to implement auto-pagination.\n- Cache \`meta.total\` to show record counts in your UI.\n- The \`data\` array follows the JSON:API spec.`,
    delay: 350,
    enabled: true,
  },
  {
    name: 'Suggest HTTP Headers',
    keywords: ['headers', 'suggest header', 'which header', 'http header', 'request header'],
    response: `Here are the recommended HTTP headers for this request:\n\n| Header | Value | Purpose |\n|--------|-------|----------|\n| \`Content-Type\` | \`application/json\` | Tells server body is JSON |\n| \`Accept\` | \`application/json\` | Request JSON response |\n| \`Authorization\` | \`Bearer {token}\` | Authenticate the request |\n| \`X-Request-ID\` | \`{{$random.uuid}}\` | Correlate logs across services |\n| \`X-API-Version\` | \`2024-01\` | Pin to a stable API version |\n| \`Accept-Encoding\` | \`gzip, deflate\` | Enable response compression |\n\n**For idempotent writes (PUT/PATCH):**\n\`\`\`\nIdempotency-Key: {{$random.uuid}}\n\`\`\`\n\n**Security headers to check on the response:**\n- \`Strict-Transport-Security\` — enforces HTTPS\n- \`X-Content-Type-Options: nosniff\` — prevents MIME sniffing\n- \`X-Frame-Options: DENY\` — clickjacking protection`,
    delay: 300,
    enabled: true,
  },
  {
    name: 'Generate Test Case',
    keywords: ['test case', 'test this', 'write test', 'generate test', 'unit test', 'api test'],
    response: `Here's a comprehensive test suite for this endpoint:\n\n\`\`\`javascript\n// Test: GET /api/users/:id\n\ndescribe('GET /api/users/:id', () => {\n  test('200 - returns user when found', async () => {\n    const res = await fetch('/api/users/123', {\n      headers: { Authorization: 'Bearer valid-token' }\n    });\n    expect(res.status).toBe(200);\n    const body = await res.json();\n    expect(body).toMatchObject({\n      id: '123',\n      name: expect.any(String),\n      email: expect.stringMatching(/@/),\n    });\n  });\n\n  test('401 - missing auth token', async () => {\n    const res = await fetch('/api/users/123');\n    expect(res.status).toBe(401);\n    const body = await res.json();\n    expect(body.error).toBeDefined();\n  });\n\n  test('404 - user not found', async () => {\n    const res = await fetch('/api/users/nonexistent', {\n      headers: { Authorization: 'Bearer valid-token' }\n    });\n    expect(res.status).toBe(404);\n  });\n\n  test('validates UUID format', async () => {\n    const res = await fetch('/api/users/not-a-uuid', {\n      headers: { Authorization: 'Bearer valid-token' }\n    });\n    expect(res.status).toBe(400);\n  });\n});\n\`\`\`\n\n**Coverage achieved:** happy path, auth failure, not-found, input validation.`,
    delay: 500,
    enabled: true,
  },
  {
    name: 'Generate Request Body',
    keywords: ['request body', 'sample body', 'example body', 'body payload', 'generate body', 'sample payload'],
    response: `Here's a well-structured request body for your API call:\n\n\`\`\`json\n{\n  "name": "Acme Corporation",\n  "email": "contact@acme.example.com",\n  "phone": "+1-555-0100",\n  "address": {\n    "street": "123 Main Street",\n    "city": "San Francisco",\n    "state": "CA",\n    "zip": "94102",\n    "country": "US"\n  },\n  "metadata": {\n    "source": "api",\n    "tags": ["enterprise", "priority"],\n    "customFields": {\n      "accountManager": "jane.smith@internal.com",\n      "contractStart": "2024-01-01"\n    }\n  },\n  "settings": {\n    "notifications": true,\n    "timezone": "America/Los_Angeles",\n    "locale": "en-US"\n  }\n}\n\`\`\`\n\n**Notes:**\n- Replace placeholder values with real data\n- \`metadata.tags\` accepts up to 10 values\n- \`customFields\` supports string, number, and boolean values`,
    delay: 350,
    enabled: true,
  },
  {
    name: 'Troubleshoot Authentication',
    keywords: ['auth', 'authentication', 'bearer token', '401', 'unauthorized', 'jwt', 'oauth', 'api key'],
    response: '**Authentication Troubleshooting Guide**\n\nYou\'re getting a 401 Unauthorized. Here\'s how to diagnose it:\n\n**Step 1 — Verify token format**\n```\nAuthorization: Bearer eyJhbGciOiJSUzI1NiJ9...\n```\n❌ Common mistake: `Bearer: token` or missing the space.\n\n**Step 2 — Check token expiry**\nDecode the JWT and check:\n- `exp` claim — must be in the future\n- `iat` claim — issue time should match your timezone\n- `iss` / `aud` — must match what the API expects\n\n**Step 3 — Verify scopes/permissions**\n```json\n{\n  "sub": "user_123",\n  "scope": "read:users write:users",\n  "exp": 1735689600\n}\n```\n\n**Step 4 — Try refreshing the token**\n```bash\ncurl -X POST /oauth/token \\\n  -d grant_type=refresh_token \\\n  -d refresh_token=YOUR_REFRESH_TOKEN\n```\n\n**Step 5 — Check API key placement**\nSome APIs use `X-API-Key` header instead of `Authorization`.',
    delay: 400,
    enabled: true,
  },
  {
    name: 'Analyze Error Response',
    keywords: ['error', '400', '422', '500', '503', 'bad request', 'failed', 'status code'],
    response: `**Error Response Analysis**\n\n\`\`\`json\n{\n  "error": {\n    "code": "VALIDATION_ERROR",\n    "message": "Request validation failed",\n    "details": [\n      {\n        "field": "email",\n        "issue": "Must be a valid email address",\n        "received": "not-an-email"\n      },\n      {\n        "field": "age",\n        "issue": "Must be a positive integer",\n        "received": -5\n      }\n    ],\n    "requestId": "req_8f3a2b1c",\n    "timestamp": "2024-06-15T10:30:00Z"\n  }\n}\n\`\`\`\n\n**What to fix:**\n1. **email** — Use a valid format like \`user@domain.com\`\n2. **age** — Must be ≥ 0, got \`-5\`\n\n**Debugging the \`requestId\`:**\nShare \`req_8f3a2b1c\` with the API team — they can look it up in server logs.\n\n**HTTP Status Codes cheat sheet:**\n- 400 Bad Request — client sent invalid data\n- 401 Unauthorized — missing/invalid credentials\n- 403 Forbidden — authenticated but not authorized\n- 422 Unprocessable Entity — valid format, invalid content\n- 429 Too Many Requests — rate limit hit\n- 500 Internal Server Error — server-side bug`,
    delay: 300,
    enabled: true,
  },
  {
    name: 'Generate cURL Command',
    keywords: ['curl', 'command', 'cli', 'terminal', 'bash command', 'cURL'],
    response: `Here's the equivalent cURL command for your request:\n\n\`\`\`bash\ncurl -X POST 'https://api.example.com/v1/users' \\\\\n  -H 'Content-Type: application/json' \\\\\n  -H 'Authorization: Bearer YOUR_TOKEN' \\\\\n  -H 'X-Request-ID: $(uuidgen)' \\\\\n  -H 'Accept: application/json' \\\\\n  --data-raw '{\n    "name": "John Doe",\n    "email": "john@example.com",\n    "role": "user"\n  }' \\\\\n  --compressed \\\\\n  -v\n\`\`\`\n\n**Useful flags:**\n- \`-v\` — verbose, shows request/response headers\n- \`-s\` — silent mode (suppress progress)\n- \`-w "%{http_code}"\\n\` — print only status code\n- \`--max-time 30\` — timeout after 30 seconds\n- \`-o response.json\` — save response to file\n\n**One-liner with pretty-printed JSON:**\n\`\`\`bash\ncurl -s -X GET 'https://api.example.com/v1/users' \\\\\n  -H 'Authorization: Bearer TOKEN' | jq .\n\`\`\``,
    delay: 250,
    enabled: true,
  },
  {
    name: 'GraphQL Query Help',
    keywords: ['graphql', 'gql', 'query', 'mutation', 'subscription', 'fragment'],
    response: `Here's a well-structured GraphQL query for your use case:\n\n\`\`\`graphql\n# Fetch users with pagination and nested data\nquery GetUsers($first: Int = 20, $after: String, $filter: UserFilter) {\n  users(first: $first, after: $after, filter: $filter) {\n    pageInfo {\n      hasNextPage\n      endCursor\n    }\n    totalCount\n    edges {\n      node {\n        id\n        name\n        email\n        createdAt\n        roles {\n          id\n          name\n          permissions\n        }\n        profile {\n          avatar\n          bio\n          timezone\n        }\n      }\n    }\n  }\n}\n\`\`\`\n\n**Variables:**\n\`\`\`json\n{\n  "first": 20,\n  "filter": {\n    "role": "admin",\n    "createdAfter": "2024-01-01"\n  }\n}\n\`\`\`\n\n**Mutation example:**\n\`\`\`graphql\nmutation CreateUser($input: CreateUserInput!) {\n  createUser(input: $input) {\n    id\n    name\n    email\n  }\n}\n\`\`\``,
    delay: 450,
    enabled: true,
  },
  {
    name: 'Document API Endpoint',
    keywords: ['document', 'documentation', 'openapi', 'swagger', 'api doc', 'describe endpoint'],
    response: `**API Endpoint Documentation**\n\n---\n\n### \`POST /api/v1/users\`\n\nCreates a new user account.\n\n**Authentication:** Bearer token required (scope: \`write:users\`)\n\n**Request Body** (\`application/json\`):\n\`\`\`json\n{\n  "name": "string (required, 1-255 chars)",\n  "email": "string (required, valid email)",\n  "role": "string (optional, enum: admin|user|moderator)",\n  "timezone": "string (optional, IANA timezone)"\n}\n\`\`\`\n\n**Responses:**\n\n| Status | Description |\n|--------|-------------|\n| 201 | User created successfully |\n| 400 | Invalid request body |\n| 401 | Missing or invalid token |\n| 409 | Email already registered |\n| 422 | Validation error |\n\n**201 Response:**\n\`\`\`json\n{\n  "id": "usr_01H9X2K8BNMQZ3",\n  "name": "John Doe",\n  "email": "john@example.com",\n  "role": "user",\n  "createdAt": "2024-06-15T10:30:00Z"\n}\n\`\`\`\n\n**Rate limit:** 100 req/min per API key.`,
    delay: 500,
    enabled: true,
  },
  {
    name: 'Data Transformation',
    keywords: ['transform', 'convert', 'map data', 'parse', 'format data', 'extract field'],
    response: `Here's how to transform this data:\n\n**Input (snake_case API response):**\n\`\`\`json\n{\n  "user_id": "123",\n  "first_name": "John",\n  "last_name": "Doe",\n  "email_address": "john@example.com",\n  "created_at": "2024-01-15T10:30:00Z"\n}\n\`\`\`\n\n**Output (camelCase for frontend):**\n\`\`\`javascript\nconst transform = (user) => ({\n  userId: user.user_id,\n  fullName: \`\${user.first_name} \${user.last_name}\`,\n  email: user.email_address,\n  createdAt: new Date(user.created_at).toLocaleDateString('en-US', {\n    year: 'numeric',\n    month: 'long',\n    day: 'numeric'\n  })\n});\n\n// Result:\n// {\n//   userId: "123",\n//   fullName: "John Doe",\n//   email: "john@example.com",\n//   createdAt: "January 15, 2024"\n// }\n\`\`\`\n\n**Bulk transform with validation:**\n\`\`\`javascript\nconst transformAll = (users) =>\n  users\n    .filter(u => u.email_address?.includes('@'))\n    .map(transform);\n\`\`\``,
    delay: 350,
    enabled: true,
  },
  {
    name: 'Environment Variables Setup',
    keywords: ['environment', 'env var', 'variable', 'config', 'secret', 'env file', '.env'],
    response: `**Environment Variables for this API integration:**\n\n\`\`\`bash\n# .env file\n\n# API Configuration\nAPI_BASE_URL=https://api.example.com/v1\nAPI_VERSION=2024-01\nAPI_TIMEOUT=30000\n\n# Authentication\nAPI_CLIENT_ID=your_client_id_here\nAPI_CLIENT_SECRET=your_client_secret_here  # Never commit this!\nAPI_ACCESS_TOKEN=                           # Set at runtime via OAuth flow\n\n# Feature Flags\nAPI_RETRY_ENABLED=true\nAPI_RETRY_ATTEMPTS=3\nAPI_RETRY_DELAY_MS=1000\n\n# Logging\nAPI_LOG_REQUESTS=false\nAPI_LOG_RESPONSES=false\n\`\`\`\n\n**In Daakia — set these as Environment variables:**\n1. Open Environments panel (left sidebar)\n2. Create a new environment (e.g., "Production", "Staging")\n3. Add variables: \`baseUrl\`, \`authToken\`, \`apiVersion\`\n4. Use them: \`{{baseUrl}}/users?version={{apiVersion}}\`\n\n**Security best practices:**\n- Never hardcode secrets in requests\n- Use separate env profiles for prod/staging/dev\n- Rotate tokens regularly`,
    delay: 400,
    enabled: true,
  },
  {
    name: 'Create Mock Response',
    keywords: ['mock', 'mock response', 'fake data', 'sample response', 'dummy data', 'placeholder'],
    response: `Here's a realistic mock response for your API:\n\n\`\`\`json\n{\n  "success": true,\n  "data": {\n    "id": "usr_01H9X2K8BNMQZ3",\n    "name": "Alexandra Chen",\n    "email": "alex.chen@company.example.com",\n    "avatar": "https://i.pravatar.cc/150?u=alex",\n    "role": "admin",\n    "department": "Engineering",\n    "joinedAt": "2023-03-15T09:00:00Z",\n    "lastActiveAt": "2024-06-15T14:23:41Z",\n    "settings": {\n      "theme": "dark",\n      "notifications": {\n        "email": true,\n        "push": false,\n        "slack": true\n      },\n      "timezone": "America/Los_Angeles"\n    },\n    "stats": {\n      "requestsToday": 147,\n      "requestsThisMonth": 3821,\n      "avgResponseTime": 234\n    }\n  },\n  "meta": {\n    "requestId": "req_7d3f1a29",\n    "timestamp": "2024-06-15T14:25:00Z",\n    "version": "2024-01"\n  }\n}\n\`\`\`\n\n**To use this in Daakia Mock Server:**\n1. Open Mock Server tab\n2. Create a new REST mock server\n3. Add route: \`GET /api/users/:id\`\n4. Paste this as the response body`,
    delay: 300,
    enabled: true,
  },
  {
    name: 'Performance & Optimization',
    keywords: ['performance', 'slow', 'optimize', 'cache', 'rate limit', 'timeout', 'latency'],
    response: `**API Performance Optimization Guide**\n\n**1. Caching Strategy**\n\`\`\`http\n# Response headers to look for:\nCache-Control: public, max-age=300\nETag: "abc123def"\nLast-Modified: Sat, 15 Jun 2024 10:00:00 GMT\n\`\`\`\n\`\`\`javascript\n// Conditional request (saves bandwidth):\nfetch('/api/data', {\n  headers: { 'If-None-Match': storedEtag }\n});\n// 304 Not Modified = use cached data!\n\`\`\`\n\n**2. Pagination — fetch only what you need**\n\`\`\`\nGET /api/users?page=1&limit=20&fields=id,name,email\n\`\`\`\n\n**3. Parallel requests — don't serialize independent calls**\n\`\`\`javascript\nconst [users, products, orders] = await Promise.all([\n  fetch('/api/users'),\n  fetch('/api/products'),\n  fetch('/api/orders')\n]);\n\`\`\`\n\n**4. Rate limiting — implement exponential backoff**\n\`\`\`javascript\nasync function fetchWithRetry(url, attempts = 3) {\n  for (let i = 0; i < attempts; i++) {\n    const res = await fetch(url);\n    if (res.status !== 429) return res;\n    const delay = Math.pow(2, i) * 1000 + Math.random() * 500;\n    await new Promise(r => setTimeout(r, delay));\n  }\n}\n\`\`\`\n\n**Key metrics to monitor:** p50/p95/p99 latency, error rate, throughput.`,
    delay: 450,
    enabled: true,
  },
  {
    name: 'General API Assistant',
    keywords: [],  // fallback — matches anything
    response: `I'm your Daakia AI Mock Assistant! I can help you with:\n\n**API Development:**\n- Generate JSON Schemas for request/response validation\n- Explain API responses and error codes\n- Suggest HTTP headers for your requests\n- Create comprehensive test cases\n\n**Request Building:**\n- Generate realistic request body payloads\n- Build cURL commands from your requests\n- Troubleshoot authentication (JWT, OAuth, API keys)\n- Analyze and fix error responses (400, 401, 422, 500)\n\n**Design & Documentation:**\n- Document API endpoints (OpenAPI format)\n- Write GraphQL queries and mutations\n- Set up environment variables\n- Create mock responses with realistic data\n\n**Optimization:**\n- Performance tuning and caching strategies\n- Rate limit handling with exponential backoff\n- Data transformation and field mapping\n\n**Getting started:**\nTry asking me: *"Generate a JSON schema for a product listing"* or *"What headers should I use for a POST request?"*\n\n> This is a **mock AI server** running locally via Daakia. Set a real AI provider in Settings → LLM Providers for live responses.`,
    delay: 200,
    enabled: true,
  },
];

// ─── Helper: match scenario ───────────────────────────────────────────────────

function matchScenario(scenarios: AiMockScenario[], userMessage: string): AiMockScenario {
  const lower = userMessage.toLowerCase();
  for (const s of scenarios) {
    if (!s.enabled) continue;
    if (s.keywords.length === 0) continue; // skip fallback in initial scan
    if (s.keywords.some(k => lower.includes(k))) return s;
  }
  // Return fallback (last enabled with no keywords)
  return scenarios.find(s => s.enabled && s.keywords.length === 0) ?? scenarios[scenarios.length - 1];
}

// ─── Helper: build OpenAI-compatible response ─────────────────────────────────

function buildChatResponse(model: string, content: string): object {
  return {
    id: `chatcmpl-mock-${crypto.randomBytes(8).toString('hex')}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'daakia-mock-1',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: Math.floor(Math.random() * 200) + 50,
      completion_tokens: Math.floor(content.length / 4),
      total_tokens: Math.floor(content.length / 4) + Math.floor(Math.random() * 200) + 50,
    },
    system_fingerprint: 'daakia-mock',
  };
}

function buildModelsResponse(): object {
  return {
    object: 'list',
    data: [
      { id: 'daakia-mock-1', object: 'model', created: 1700000000, owned_by: 'daakia' },
      { id: 'daakia-mock-fast', object: 'model', created: 1700000000, owned_by: 'daakia' },
      { id: 'daakia-mock-pro', object: 'model', created: 1700000000, owned_by: 'daakia' },
    ],
  };
}

// ─── Server factory ───────────────────────────────────────────────────────────

export function createAiServer(config: MockServerConfig, onLog?: LogCallback): http.Server {
  const scenarios: AiMockScenario[] = (config.aiScenarios && config.aiScenarios.length > 0)
    ? config.aiScenarios
    : DEFAULT_AI_SCENARIOS.map(s => ({ ...s, id: crypto.randomUUID() }));

  return http.createServer((req, res) => {
    const startTime = Date.now();
    const method = (req.method || 'GET').toUpperCase();
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // GET /v1/models
    if (method === 'GET' && (pathname === '/v1/models' || pathname === '/models')) {
      const body = JSON.stringify(buildModelsResponse());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      onLog?.({
        id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
        direction: 'incoming', protocol: 'ai', method: 'GET', path: pathname,
        statusCode: 200, body: '', responseBody: body, duration: Date.now() - startTime,
      });
      return;
    }

    // POST /v1/chat/completions
    if (method === 'POST' && (pathname === '/v1/chat/completions' || pathname === '/chat/completions')) {
      let reqBody = '';
      req.on('data', chunk => { reqBody += chunk; });
      req.on('end', () => {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(reqBody); } catch { /* ignore */ }

        const messages = (parsed.messages as Array<{ role: string; content: string }>) || [];
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
        const modelId = (parsed.model as string) || 'daakia-mock-1';

        const scenario = matchScenario(scenarios, lastUserMsg);
        const delay = scenario.delay ?? 300;

        setTimeout(() => {
          const responseObj = buildChatResponse(modelId, scenario.response);
          const responseBody = JSON.stringify(responseObj);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(responseBody);
          onLog?.({
            id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
            direction: 'incoming', protocol: 'ai', method: 'POST', path: pathname,
            statusCode: 200, body: reqBody.slice(0, 500),
            responseBody: responseBody.slice(0, 1000), duration: Date.now() - startTime + delay,
          });
        }, delay);
      });
      return;
    }

    // 404 for anything else
    const notFound = JSON.stringify({ error: { message: 'Not found', type: 'invalid_request_error', code: 'not_found' } });
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(notFound);
  });
}
