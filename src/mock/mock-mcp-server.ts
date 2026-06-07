/**
 * MCP Mock Server — serves MCP JSON-RPC protocol over HTTP.
 * Provides 15 pre-defined tools covering API development workflows.
 * Compatible with Claude's MCP client and Daakia's MCP tab.
 */
import * as http from 'http';
import * as crypto from 'crypto';
import type { MockServerConfig, McpMockTool, MockLogEntry } from './mock-types';

export type LogCallback = (entry: MockLogEntry) => void;

// ─── 15 Default MCP Tools ─────────────────────────────────────────────────────

export const DEFAULT_MCP_TOOLS: Omit<McpMockTool, 'id'>[] = [
  {
    name: 'analyze_endpoint',
    description: 'Analyzes a REST API endpoint and returns detailed information about its purpose, expected inputs, and common response patterns.',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'HTTP method' },
        url: { type: 'string', description: 'Full endpoint URL' },
        description: { type: 'string', description: 'Optional context about the endpoint' },
      },
      required: ['method', 'url'],
    }),
    response: JSON.stringify({
      analysis: {
        purpose: 'Retrieves a paginated list of users with optional filtering and sorting',
        restPattern: 'Collection resource — returns multiple items',
        httpSemantics: 'GET is safe and idempotent. No request body expected.',
        commonQueryParams: ['page', 'limit', 'sort', 'order', 'filter', 'search', 'fields'],
        suggestedHeaders: ['Authorization', 'Accept', 'X-Request-ID'],
        expectedResponseCodes: { '200': 'Success with data', '401': 'Missing auth', '403': 'Insufficient permissions', '429': 'Rate limit exceeded' },
        performanceTips: ['Use field selection to reduce payload size', 'Cache results with ETag/Last-Modified', 'Request compression with Accept-Encoding: gzip'],
      },
    }),
    delay: 300,
    enabled: true,
  },
  {
    name: 'generate_json_schema',
    description: 'Generates a JSON Schema (draft-07) from a sample JSON object or description of the data structure.',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        sample: { type: 'string', description: 'Sample JSON object as a string' },
        title: { type: 'string', description: 'Schema title' },
        strict: { type: 'boolean', description: 'If true, adds additionalProperties: false' },
      },
      required: ['sample'],
    }),
    response: JSON.stringify({
      schema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        title: 'GeneratedSchema',
        required: ['id', 'name', 'email', 'createdAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', minLength: 1, maxLength: 255 },
          email: { type: 'string', format: 'email' },
          age: { type: 'integer', minimum: 0, maximum: 150 },
          active: { type: 'boolean' },
          tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          createdAt: { type: 'string', format: 'date-time' },
          metadata: { type: 'object', additionalProperties: { type: 'string' } },
        },
        additionalProperties: false,
      },
    }),
    delay: 400,
    enabled: true,
  },
  {
    name: 'explain_response',
    description: 'Explains an API response JSON, describing each field, its type, and its purpose in plain English.',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        response: { type: 'string', description: 'JSON response body as a string' },
        statusCode: { type: 'integer', description: 'HTTP status code' },
      },
      required: ['response'],
    }),
    response: JSON.stringify({
      explanation: {
        summary: 'This is a successful paginated list response following JSON:API conventions.',
        statusMeaning: '200 OK — The server successfully returned the requested data.',
        fields: {
          data: 'Array of user objects — the primary payload of the response.',
          'meta.total': 'Total number of matching records across all pages.',
          'meta.page': 'Current page number (1-indexed).',
          'meta.per_page': 'Maximum items per page as configured by the server.',
          'links.next': 'URL for the next page. Null when on the last page.',
          'links.prev': 'URL for the previous page. Null when on the first page.',
        },
        patterns: ['Cursor pagination via links.next', 'RFC 7807 problem details for errors', 'HATEOAS navigation links'],
        recommendations: ['Cache the total count for UI display', 'Use links.next for infinite scroll implementation'],
      },
    }),
    delay: 250,
    enabled: true,
  },
  {
    name: 'suggest_headers',
    description: 'Suggests appropriate HTTP request headers based on the request method, URL pattern, and content type.',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        url: { type: 'string' },
        contentType: { type: 'string', description: 'Body content type if applicable' },
        authType: { type: 'string', enum: ['none', 'bearer', 'apikey', 'basic', 'oauth2'] },
      },
      required: ['method', 'url'],
    }),
    response: JSON.stringify({
      requiredHeaders: [
        { key: 'Content-Type', value: 'application/json', reason: 'Declare JSON body format' },
        { key: 'Authorization', value: 'Bearer {{authToken}}', reason: 'Authenticate the request' },
      ],
      recommendedHeaders: [
        { key: 'Accept', value: 'application/json', reason: 'Request JSON response format' },
        { key: 'X-Request-ID', value: '{{$random.uuid}}', reason: 'Correlate logs and traces' },
        { key: 'Accept-Encoding', value: 'gzip, deflate', reason: 'Enable response compression' },
      ],
      conditionalHeaders: [
        { key: 'Idempotency-Key', value: '{{$random.uuid}}', reason: 'Safe to retry — for POST/PATCH writes', condition: 'Use for write operations that should be idempotent' },
        { key: 'If-None-Match', value: '"{{etag}}"', reason: 'Avoid re-fetching unchanged data', condition: 'Use with cached ETag values' },
      ],
    }),
    delay: 200,
    enabled: true,
  },
  {
    name: 'create_test_case',
    description: 'Creates a comprehensive test case for a given API endpoint including happy path, error cases, and edge cases.',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        method: { type: 'string' },
        url: { type: 'string' },
        expectedStatus: { type: 'integer' },
        framework: { type: 'string', enum: ['jest', 'mocha', 'vitest', 'playwright'], description: 'Testing framework' },
      },
      required: ['method', 'url'],
    }),
    response: JSON.stringify({
      testFile: {
        framework: 'jest',
        language: 'javascript',
        tests: [
          { name: '200 - returns expected response for valid input', type: 'happy_path', assertions: ['status === 200', 'body.data is array', 'body.meta.total is number'] },
          { name: '401 - rejects requests without authentication', type: 'auth_error', assertions: ['status === 401', 'body.error is defined'] },
          { name: '400 - rejects invalid request body', type: 'validation_error', assertions: ['status === 400', 'body.errors is array'] },
          { name: '404 - returns not found for unknown resource', type: 'not_found', assertions: ['status === 404'] },
          { name: '429 - handles rate limiting gracefully', type: 'rate_limit', assertions: ['status === 429', 'headers.Retry-After is defined'] },
          { name: 'handles network timeout', type: 'timeout', assertions: ['throws AbortError'] },
        ],
        code: 'describe("GET /api/users/:id", () => {\n  test("200 - returns user", async () => { ... });\n  test("401 - missing auth", async () => { ... });\n  // ...\n});',
      },
    }),
    delay: 450,
    enabled: true,
  },
  {
    name: 'validate_openapi',
    description: 'Validates an OpenAPI 3.x specification and reports errors, warnings, and suggestions for improvement.',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        spec: { type: 'string', description: 'OpenAPI spec as JSON or YAML string' },
        version: { type: 'string', enum: ['3.0', '3.1'], description: 'OpenAPI version' },
      },
      required: ['spec'],
    }),
    response: JSON.stringify({
      valid: true,
      score: 87,
      errors: [],
      warnings: [
        { path: 'paths./users.get.responses', message: 'Missing 429 (Too Many Requests) response', severity: 'warning' },
        { path: 'components.schemas.User.properties.email', message: 'Consider adding format: email', severity: 'info' },
      ],
      suggestions: [
        'Add x-rateLimit-* headers to describe rate limiting behavior',
        'Include example objects in request/response schemas for better documentation',
        'Add security schemes to locked endpoints',
        'Consider using $ref for repeated schema patterns',
      ],
      stats: { endpoints: 12, schemas: 8, securitySchemes: 1, examples: 3 },
    }),
    delay: 500,
    enabled: true,
  },
  {
    name: 'generate_curl',
    description: 'Generates a ready-to-run cURL command from a request configuration.',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        method: { type: 'string' },
        url: { type: 'string' },
        headers: { type: 'object', description: 'Request headers as key-value pairs' },
        body: { type: 'string', description: 'Request body JSON string' },
        verbose: { type: 'boolean', description: 'Include -v flag' },
      },
      required: ['method', 'url'],
    }),
    response: JSON.stringify({
      curl: "curl -X POST 'https://api.example.com/v1/users' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer YOUR_TOKEN' \\\n  -H 'X-Request-ID: $(uuidgen)' \\\n  --data-raw '{\n    \"name\": \"John Doe\",\n    \"email\": \"john@example.com\"\n  }' \\\n  --compressed -v",
      httpie: "http POST https://api.example.com/v1/users \\\n  Authorization:'Bearer YOUR_TOKEN' \\\n  name='John Doe' email='john@example.com'",
      wget: "wget --method=POST --header='Authorization: Bearer YOUR_TOKEN' \\\n  --body-data='{\"name\":\"John Doe\"}' \\\n  --output-document=- https://api.example.com/v1/users",
    }),
    delay: 150,
    enabled: true,
  },
  {
    name: 'check_auth_config',
    description: 'Validates an authentication configuration and suggests fixes for common auth issues.',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        authType: { type: 'string', enum: ['bearer', 'apikey', 'basic', 'oauth2', 'digest'] },
        token: { type: 'string', description: 'Token value (will not be logged)' },
        headerName: { type: 'string', description: 'Header name used for auth' },
      },
      required: ['authType'],
    }),
    response: JSON.stringify({
      status: 'valid',
      issues: [],
      tokenInfo: {
        type: 'JWT',
        algorithm: 'RS256',
        issuer: 'https://auth.example.com',
        audience: 'api.example.com',
        expiresIn: '3599 seconds',
        scopes: ['read:users', 'write:users'],
      },
      recommendations: [
        'Token expires in ~60 minutes — implement automatic refresh',
        'Store tokens in secure storage, never in localStorage',
        'Validate token on the client before sending to reduce 401 round-trips',
      ],
    }),
    delay: 250,
    enabled: true,
  },
  {
    name: 'parse_error_response',
    description: 'Parses and explains an API error response, identifying the root cause and suggesting fixes.',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        statusCode: { type: 'integer' },
        body: { type: 'string', description: 'Error response body as JSON string' },
        requestContext: { type: 'string', description: 'What was being attempted when the error occurred' },
      },
      required: ['statusCode', 'body'],
    }),
    response: JSON.stringify({
      errorCategory: 'Client Error — Validation Failure',
      httpStatus: { code: 422, meaning: 'Unprocessable Entity — Request format is valid JSON but semantically wrong' },
      rootCause: 'The email field contains a value that fails server-side email validation',
      fieldErrors: [
        { field: 'email', issue: 'Invalid email format', fix: 'Use a valid email like user@domain.com' },
        { field: 'birthDate', issue: 'Date in the past beyond maximum age limit', fix: 'Provide a date within the last 120 years' },
      ],
      immediateActions: [
        'Fix the highlighted field validation errors',
        'Re-submit the request with corrected values',
      ],
      preventionTips: [
        'Validate email format client-side before submitting',
        'Use JSON Schema to validate request bodies before sending',
      ],
    }),
    delay: 300,
    enabled: true,
  },
  {
    name: 'suggest_environment_vars',
    description: 'Suggests environment variable names and structure for a given API integration based on its configuration.',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        apiName: { type: 'string', description: 'Name of the API (e.g., "Stripe", "Twilio")' },
        baseUrl: { type: 'string' },
        authType: { type: 'string' },
        environments: { type: 'array', items: { type: 'string' }, description: 'Target environments e.g. ["dev", "staging", "prod"]' },
      },
      required: ['apiName'],
    }),
    response: JSON.stringify({
      variables: {
        required: [
          { name: 'API_BASE_URL', example: 'https://api.example.com/v1', description: 'Base URL for all API requests' },
          { name: 'API_SECRET_KEY', example: 'sk_live_...', description: 'Secret API key — never expose client-side' },
        ],
        optional: [
          { name: 'API_TIMEOUT_MS', example: '30000', description: 'Request timeout in milliseconds' },
          { name: 'API_MAX_RETRIES', example: '3', description: 'Max retry attempts on transient failures' },
          { name: 'API_VERSION', example: '2024-01', description: 'Pinned API version for stability' },
        ],
        perEnvironment: [
          { name: 'API_WEBHOOK_SECRET', description: 'Environment-specific webhook signing secret' },
          { name: 'API_LOG_LEVEL', example: 'debug | info | warn | error', description: 'Logging verbosity' },
        ],
      },
      daakiaVariables: [
        { name: 'baseUrl', scope: 'environment', usage: '{{baseUrl}}/users' },
        { name: 'authToken', scope: 'environment', usage: 'Bearer {{authToken}}' },
        { name: 'apiVersion', scope: 'environment', usage: '{{baseUrl}}/{{apiVersion}}/users' },
      ],
    }),
    delay: 350,
    enabled: true,
  },
  {
    name: 'document_endpoint',
    description: 'Generates complete API endpoint documentation in OpenAPI format from a request/response example.',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        method: { type: 'string' },
        path: { type: 'string' },
        requestBody: { type: 'string' },
        responseBody: { type: 'string' },
        statusCode: { type: 'integer' },
        description: { type: 'string' },
      },
      required: ['method', 'path'],
    }),
    response: JSON.stringify({
      openApiPath: {
        summary: 'Create a new user',
        description: 'Creates a new user account and returns the created user with a generated ID.',
        operationId: 'createUser',
        tags: ['Users'],
        security: [{ bearerAuth: ['write:users'] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateUserRequest' },
              example: { name: 'John Doe', email: 'john@example.com', role: 'user' },
            },
          },
        },
        responses: {
          '201': { description: 'User created successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          '400': { description: 'Invalid request body' },
          '409': { description: 'Email already registered' },
        },
      },
    }),
    delay: 500,
    enabled: true,
  },
  {
    name: 'transform_data',
    description: 'Provides a JavaScript transformation function to convert data between two formats (e.g., snake_case to camelCase, array to map, etc.).',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        inputSample: { type: 'string', description: 'Sample input data as JSON string' },
        outputFormat: { type: 'string', description: 'Describe the desired output format' },
        language: { type: 'string', enum: ['javascript', 'typescript', 'python'], description: 'Code language' },
      },
      required: ['inputSample', 'outputFormat'],
    }),
    response: JSON.stringify({
      transformFunction: {
        language: 'javascript',
        code: `function transform(input) {
  return {
    userId: input.user_id,
    fullName: [input.first_name, input.last_name].filter(Boolean).join(' '),
    email: input.email_address?.toLowerCase().trim(),
    isActive: Boolean(input.active_flag),
    createdAt: new Date(input.created_timestamp).toISOString(),
    tags: (input.tag_list || '').split(',').map(t => t.trim()).filter(Boolean),
  };
}`,
        bulkTransform: `const transformed = inputArray.filter(item => item.active_flag).map(transform);`,
        validation: `// Validate output matches expected shape\nconst isValid = result => result.userId && result.email?.includes('@');`,
      },
    }),
    delay: 400,
    enabled: true,
  },
  {
    name: 'mock_response_generator',
    description: 'Generates a realistic mock response for an API endpoint based on its schema or description.',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        schema: { type: 'string', description: 'JSON Schema or OpenAPI response schema' },
        count: { type: 'integer', minimum: 1, maximum: 50, description: 'Number of items to generate (for arrays)' },
        locale: { type: 'string', description: 'Locale for generated data (e.g., en-US)' },
      },
      required: [],
    }),
    response: JSON.stringify({
      mockData: {
        id: 'usr_01H9X2K8BNMQZ3',
        name: 'Alexandra Chen',
        email: 'alex.chen@company.example.com',
        avatar: 'https://i.pravatar.cc/150?u=alex',
        role: 'admin',
        department: 'Engineering',
        joinedAt: '2023-03-15T09:00:00Z',
        lastActiveAt: '2024-06-15T14:23:41Z',
        settings: {
          theme: 'dark',
          notifications: { email: true, push: false, slack: true },
          timezone: 'America/Los_Angeles',
        },
        stats: { requestsToday: 147, requestsThisMonth: 3821, avgResponseTimeMs: 234 },
      },
      daakiaMockRoute: {
        method: 'GET',
        path: '/api/users/:id',
        statusCode: 200,
        body: '/* paste mockData here */',
      },
    }),
    delay: 200,
    enabled: true,
  },
  {
    name: 'performance_audit',
    description: 'Audits an API request/response for performance issues and suggests optimizations.',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        responseTimeMs: { type: 'number', description: 'Response time in milliseconds' },
        responseSizeBytes: { type: 'number', description: 'Response body size in bytes' },
        headers: { type: 'string', description: 'Response headers as JSON string' },
        url: { type: 'string' },
      },
      required: ['responseTimeMs'],
    }),
    response: JSON.stringify({
      score: 72,
      rating: 'Needs Improvement',
      metrics: {
        responseTime: { value: '1240ms', status: 'slow', target: '<200ms', percentile: 'p95' },
        payloadSize: { value: '48KB', status: 'acceptable', target: '<50KB', tip: 'Enable gzip compression to reduce by ~70%' },
        caching: { status: 'missing', issue: 'No Cache-Control header', fix: 'Add Cache-Control: public, max-age=300' },
        compression: { status: 'disabled', fix: 'Add Content-Encoding: gzip to response headers' },
      },
      topRecommendations: [
        { priority: 'high', action: 'Add database query index on user_id (currently doing full table scan)', impact: '~600ms improvement' },
        { priority: 'high', action: 'Enable gzip/brotli compression for JSON responses', impact: '70% payload size reduction' },
        { priority: 'medium', action: 'Implement Redis caching for user profile data (TTL: 5min)', impact: '~400ms improvement on cache hit' },
        { priority: 'low', action: 'Use field selection (?fields=id,name,email) to reduce payload', impact: '~30% payload reduction' },
      ],
    }),
    delay: 350,
    enabled: true,
  },
  {
    name: 'generate_postman_collection',
    description: 'Generates a Postman/Daakia collection definition for a set of API endpoints.',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        apiName: { type: 'string' },
        baseUrl: { type: 'string' },
        endpoints: { type: 'array', items: { type: 'object', properties: { method: { type: 'string' }, path: { type: 'string' } } } },
        authType: { type: 'string' },
      },
      required: ['apiName'],
    }),
    response: JSON.stringify({
      collection: {
        info: { name: 'Users API', version: '1.0.0', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
        variable: [
          { key: 'baseUrl', value: 'https://api.example.com/v1' },
          { key: 'authToken', value: '' },
        ],
        auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{authToken}}' }] },
        item: [
          {
            name: 'List Users',
            request: { method: 'GET', url: '{{baseUrl}}/users?page=1&limit=20', header: [{ key: 'Accept', value: 'application/json' }] },
          },
          {
            name: 'Create User',
            request: { method: 'POST', url: '{{baseUrl}}/users', body: { mode: 'raw', raw: '{"name":"","email":""}', options: { raw: { language: 'json' } } } },
          },
        ],
      },
      importNote: 'Import via Daakia: File → Import Collection → Paste this JSON',
    }),
    delay: 400,
    enabled: true,
  },
];

// ─── MCP JSON-RPC helpers ─────────────────────────────────────────────────────

function mcpResponse(id: unknown, result: unknown) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function mcpError(id: unknown, code: number, message: string) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

// ─── Server factory ───────────────────────────────────────────────────────────

export function createMcpServer(config: MockServerConfig, onLog?: LogCallback): http.Server {
  const tools: McpMockTool[] = (config.mcpTools && config.mcpTools.length > 0)
    ? config.mcpTools
    : DEFAULT_MCP_TOOLS.map(t => ({ ...t, id: crypto.randomUUID() }));

  return http.createServer((req, res) => {
    const startTime = Date.now();
    const method = (req.method || 'GET').toUpperCase();
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/json');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (method !== 'POST' || (pathname !== '/mcp' && pathname !== '/')) {
      res.writeHead(404);
      res.end(mcpError(null, -32700, 'Not found — POST to /mcp'));
      return;
    }

    let reqBody = '';
    req.on('data', chunk => { reqBody += chunk; });
    req.on('end', () => {
      let rpc: Record<string, unknown> = {};
      try { rpc = JSON.parse(reqBody); } catch {
        res.writeHead(400);
        res.end(mcpError(null, -32700, 'Parse error'));
        return;
      }

      const id = rpc.id;
      const rpcMethod = (rpc.method as string) || '';
      const params = (rpc.params as Record<string, unknown>) || {};

      let responseBody = '';

      if (rpcMethod === 'initialize') {
        responseBody = mcpResponse(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: config.name || 'Daakia MCP Mock', version: '1.0.0' },
        });
      } else if (rpcMethod === 'tools/list') {
        const enabledTools = tools.filter(t => t.enabled);
        responseBody = mcpResponse(id, {
          tools: enabledTools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: JSON.parse(t.inputSchema),
          })),
        });
      } else if (rpcMethod === 'tools/call') {
        const toolName = (params.name as string) || '';
        const tool = tools.find(t => t.name === toolName && t.enabled);
        if (!tool) {
          responseBody = mcpError(id, -32602, `Tool '${toolName}' not found or disabled`);
        } else {
          const delay = tool.delay || 0;
          setTimeout(() => {
            let parsedResponse: unknown = tool.response;
            try { parsedResponse = JSON.parse(tool.response); } catch { /* keep as string */ }
            const body = mcpResponse(id, {
              content: [{ type: 'text', text: typeof parsedResponse === 'string' ? parsedResponse : JSON.stringify(parsedResponse, null, 2) }],
            });
            res.writeHead(200);
            res.end(body);
            onLog?.({
              id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
              direction: 'incoming', protocol: 'mcp', path: pathname, method: 'POST',
              statusCode: 200, body: reqBody.slice(0, 500), responseBody: body.slice(0, 1000),
              duration: Date.now() - startTime + delay, event: `tools/call:${toolName}`,
            });
          }, delay);
          return;
        }
      } else if (rpcMethod === 'notifications/initialized') {
        // No response for notifications
        res.writeHead(204);
        res.end();
        return;
      } else {
        responseBody = mcpError(id, -32601, `Method '${rpcMethod}' not found`);
      }

      res.writeHead(200);
      res.end(responseBody);
      onLog?.({
        id: crypto.randomUUID(), timestamp: Date.now(), serverId: config.id,
        direction: 'incoming', protocol: 'mcp', path: pathname, method: 'POST',
        statusCode: 200, body: reqBody.slice(0, 500), responseBody: responseBody.slice(0, 1000),
        duration: Date.now() - startTime, event: rpcMethod,
      });
    });
  });
}
