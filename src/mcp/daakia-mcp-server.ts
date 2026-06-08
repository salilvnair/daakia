/**
 * Daakia MCP Server — STDIO JSON-RPC server.
 *
 * Exposes Daakia's HTTP client capabilities to external AI agents
 * (Claude Desktop, Cursor, etc.) via the Model Context Protocol.
 *
 * Tools:
 *   - send_request     Execute any HTTP request and return the response
 *   - get_collections  List saved Daakia collections and their requests
 *   - run_collection   Execute all requests in a collection, return results
 *
 * Standalone Node.js STDIO server — does NOT run inside VS Code.
 * External AI clients spawn this process and communicate via stdin/stdout.
 *
 * Claude Desktop example config (~/.config/claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "daakia": {
 *         "command": "node",
 *         "args": ["/path/to/extension/dist/daakia-mcp-server.js"]
 *       }
 *     }
 *   }
 */
import * as readline from 'readline';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as nodeUrl from 'url';

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_PATH = path.join(os.homedir(), '.salilvnair', 'daakia-vsce', 'db', 'daakia.db');
const WASM_PATH = path.join(__dirname, 'sql-wasm.wasm');
const SERVER_VERSION = '1.0.0';
const PROTOCOL_VERSION = '2024-11-05';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface RequestData {
  headers?: Array<{ key: string; value: string; enabled: boolean }>;
  params?: Array<{ key: string; value: string; enabled: boolean }>;
  bodyMode?: 'none' | 'raw' | 'form-data' | 'x-www-form-urlencoded';
  bodyRaw?: string;
  bodyFormData?: Array<{ key: string; value: string; enabled: boolean }>;
  bodyUrlEncoded?: Array<{ key: string; value: string; enabled: boolean }>;
  authType?: string;
  authData?: Record<string, unknown>;
  contentType?: string;
}

// ─── MCP Tool Definitions ─────────────────────────────────────────────────────

const DAAKIA_TOOLS = [
  {
    name: 'send_request',
    description: [
      'Send an HTTP request via Daakia and return the full response.',
      'Supports all HTTP methods, custom headers, request bodies (JSON, XML, form data).',
      'Returns status code, headers, and response body.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
          description: 'HTTP method',
        },
        url: {
          type: 'string',
          description: 'Full URL including protocol (https://api.example.com/users)',
        },
        headers: {
          type: 'object',
          description: 'Request headers as key-value pairs',
          additionalProperties: { type: 'string' },
        },
        body: {
          type: 'string',
          description: 'Request body as a string. Use JSON.stringify() for JSON bodies.',
        },
        contentType: {
          type: 'string',
          description: 'Content-Type header shorthand (e.g. "application/json", "text/xml")',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
        },
      },
      required: ['method', 'url'],
    },
  },
  {
    name: 'get_collections',
    description: [
      'List all saved Daakia API collections with their requests.',
      'Use this to discover available collections before running them.',
      'Returns collection IDs, names, and request details.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        includeRequests: {
          type: 'boolean',
          description: 'Include full request details in each collection (default: true)',
        },
        protocol: {
          type: 'string',
          enum: ['rest', 'graphql', 'grpc', 'soap', 'websocket'],
          description: 'Filter collections by protocol (default: all)',
        },
      },
    },
  },
  {
    name: 'run_collection',
    description: [
      'Execute all HTTP requests in a Daakia collection sequentially.',
      'Returns a summary with pass/fail counts and individual request results.',
      'Use get_collections first to find collection IDs.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: {
          type: 'string',
          description: 'The collection ID (from get_collections)',
        },
        baseUrl: {
          type: 'string',
          description: 'Override the {{baseUrl}} variable in all requests',
        },
        envVars: {
          type: 'object',
          description: 'Environment variable overrides as key-value pairs',
          additionalProperties: { type: 'string' },
        },
        stopOnFailure: {
          type: 'boolean',
          description: 'Stop after first failed request (default: false)',
        },
      },
      required: ['collectionId'],
    },
  },
];

// ─── SQLite Access ────────────────────────────────────────────────────────────

type SqlJsDatabase = import('sql.js').Database;
let _db: SqlJsDatabase | null = null;

async function getDb(): Promise<SqlJsDatabase | null> {
  if (_db) return _db;
  if (!fs.existsSync(DB_PATH)) return null;
  if (!fs.existsSync(WASM_PATH)) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const initSqlJs = require('sql.js') as typeof import('sql.js').default;
    const SQL = await initSqlJs({ locateFile: () => WASM_PATH });
    const buffer = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buffer);
    return _db;
  } catch {
    return null;
  }
}

function runQuery<T = Record<string, unknown>>(
  db: SqlJsDatabase,
  sql: string,
  params: (string | number | null)[] = [],
): T[] {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return rows;
  } catch {
    return [];
  }
}

// ─── HTTP Request Executor ────────────────────────────────────────────────────

interface HttpResult {
  status: number;
  statusText: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  time: number;
  error?: string;
}

function executeHttp(
  method: string,
  reqUrl: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number,
): Promise<HttpResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    let parsed: URL;
    try {
      parsed = new nodeUrl.URL(reqUrl);
    } catch {
      resolve({ status: 0, statusText: 'Invalid URL', headers: {}, body: '', time: 0, error: `Invalid URL: ${reqUrl}` });
      return;
    }

    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqHeaders: Record<string, string> = {
      'User-Agent': 'Daakia-MCP/' + SERVER_VERSION,
      ...headers,
    };

    if (body) {
      reqHeaders['Content-Length'] = String(Buffer.byteLength(body, 'utf-8'));
    }

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port
        ? parseInt(parsed.port)
        : isHttps ? 443 : 80,
      path: parsed.pathname + parsed.search,
      method: method.toUpperCase(),
      headers: reqHeaders,
    };

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const resBody = Buffer.concat(chunks).toString('utf-8');
        const resHeaders: Record<string, string | string[] | undefined> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          resHeaders[k] = v;
        }
        resolve({
          status: res.statusCode ?? 0,
          statusText: res.statusMessage ?? '',
          headers: resHeaders,
          body: resBody,
          time: Date.now() - start,
        });
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({
        status: 0,
        statusText: 'Timeout',
        headers: {},
        body: '',
        time: Date.now() - start,
        error: `Request timed out after ${timeoutMs}ms`,
      });
    });

    req.on('error', (err) => {
      resolve({
        status: 0,
        statusText: 'Network Error',
        headers: {},
        body: '',
        time: Date.now() - start,
        error: err.message,
      });
    });

    if (body) req.write(body, 'utf-8');
    req.end();
  });
}

// ─── Tool Handlers ────────────────────────────────────────────────────────────

async function handleSendRequest(args: Record<string, unknown>): Promise<string> {
  const method = ((args.method as string) || 'GET').toUpperCase();
  const reqUrl = args.url as string;
  const headers = (args.headers as Record<string, string>) || {};
  const body = args.body as string | undefined;
  const contentType = args.contentType as string | undefined;
  const timeout = (args.timeout as number) || 30000;

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  const result = await executeHttp(method, reqUrl, headers, body, timeout);

  if (result.error) {
    return JSON.stringify({
      success: false,
      error: result.error,
      time: result.time,
    }, null, 2);
  }

  // Try to pretty-print JSON body
  let parsedBody: unknown = result.body;
  try {
    parsedBody = JSON.parse(result.body);
  } catch { /* keep as string */ }

  return JSON.stringify({
    success: true,
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
    body: parsedBody,
    rawBody: typeof parsedBody !== 'string' ? result.body : undefined,
    time: result.time,
  }, null, 2);
}

async function handleGetCollections(args: Record<string, unknown>): Promise<string> {
  const includeRequests = args.includeRequests !== false;
  const protocol = args.protocol as string | undefined;

  const db = await getDb();
  if (!db) {
    return JSON.stringify({
      success: false,
      error: 'Daakia database not found.',
      hint: 'Open Daakia VS Code extension and create at least one collection.',
      dbPath: DB_PATH,
    }, null, 2);
  }

  // Top-level collections (no parent)
  const colQuery = protocol
    ? 'SELECT id, name, protocol FROM collections WHERE parent_id IS NULL AND protocol = ? ORDER BY sort_order, name'
    : 'SELECT id, name, protocol FROM collections WHERE parent_id IS NULL ORDER BY sort_order, name';
  const params = protocol ? [protocol] : [];
  const collections = runQuery<{ id: string; name: string; protocol: string }>(db, colQuery, params);

  if (!includeRequests) {
    return JSON.stringify({ success: true, collections }, null, 2);
  }

  // Attach requests for each collection
  const result = collections.map(col => {
    const requests = runQuery<{ id: string; name: string; method: string; url: string }>(
      db,
      'SELECT id, name, method, url FROM collection_requests WHERE collection_id = ? ORDER BY sort_order, name',
      [col.id],
    );
    return { ...col, requestCount: requests.length, requests };
  });

  return JSON.stringify({ success: true, collections: result }, null, 2);
}

async function handleRunCollection(args: Record<string, unknown>): Promise<string> {
  const collectionId = args.collectionId as string;
  const baseUrl = args.baseUrl as string | undefined;
  const envVars = (args.envVars as Record<string, string>) || {};
  const stopOnFailure = Boolean(args.stopOnFailure);

  const db = await getDb();
  if (!db) {
    return JSON.stringify({ success: false, error: 'Daakia database not found.' }, null, 2);
  }

  // Get collection name
  const [col] = runQuery<{ id: string; name: string }>(db, 'SELECT id, name FROM collections WHERE id = ?', [collectionId]);
  if (!col) {
    return JSON.stringify({ success: false, error: `Collection not found: ${collectionId}` }, null, 2);
  }

  // Get all requests in collection
  const requests = runQuery<{ id: string; name: string; method: string; url: string; data: string }>(
    db,
    'SELECT id, name, method, url, data FROM collection_requests WHERE collection_id = ? ORDER BY sort_order, name',
    [collectionId],
  );

  if (requests.length === 0) {
    return JSON.stringify({ success: false, error: 'Collection has no requests', collectionId }, null, 2);
  }

  // Helper: resolve variables in a string
  const resolveVars = (str: string): string => {
    let result = str;
    if (baseUrl) result = result.replace(/\{\{baseUrl\}\}/gi, baseUrl);
    for (const [k, v] of Object.entries(envVars)) {
      result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'gi'), v);
    }
    return result;
  };

  const results: Array<{
    id: string;
    name: string;
    method: string;
    url: string;
    status: number | null;
    statusText: string;
    passed: boolean;
    time: number;
    error?: string;
  }> = [];

  let passed = 0;
  let failed = 0;
  let stopped = false;

  for (const req of requests) {
    // Parse stored data
    let reqData: RequestData = {};
    try { reqData = JSON.parse(req.data || '{}') as RequestData; } catch { /* ignore */ }

    // Build headers from stored data
    const hdrs: Record<string, string> = {};
    for (const h of reqData.headers || []) {
      if (h.enabled && h.key) hdrs[h.key] = resolveVars(h.value || '');
    }
    if (reqData.contentType) hdrs['Content-Type'] = reqData.contentType;

    // Build body
    let body: string | undefined;
    if (reqData.bodyMode === 'raw' && reqData.bodyRaw) {
      body = resolveVars(reqData.bodyRaw);
    } else if (reqData.bodyMode === 'x-www-form-urlencoded' && reqData.bodyUrlEncoded) {
      const pairs = reqData.bodyUrlEncoded
        .filter(e => e.enabled && e.key)
        .map(e => `${encodeURIComponent(resolveVars(e.key))}=${encodeURIComponent(resolveVars(e.value || ''))}`);
      body = pairs.join('&');
    }

    const resolvedUrl = resolveVars(req.url);

    try {
      const httpResult = await executeHttp(req.method, resolvedUrl, hdrs, body, 30000);
      const ok = !httpResult.error && httpResult.status >= 100 && httpResult.status < 400;
      if (ok) passed++; else failed++;
      results.push({
        id: req.id,
        name: req.name,
        method: req.method,
        url: resolvedUrl,
        status: httpResult.status || null,
        statusText: httpResult.statusText,
        passed: ok,
        time: httpResult.time,
        error: httpResult.error,
      });
      if (!ok && stopOnFailure) { stopped = true; break; }
    } catch (err) {
      failed++;
      results.push({
        id: req.id,
        name: req.name,
        method: req.method,
        url: resolvedUrl,
        status: null,
        statusText: 'Error',
        passed: false,
        time: 0,
        error: String(err),
      });
      if (stopOnFailure) { stopped = true; break; }
    }
  }

  const total = results.length;
  return JSON.stringify({
    success: true,
    collection: { id: col.id, name: col.name },
    summary: {
      total,
      passed,
      failed,
      stopped,
      successRate: total > 0 ? `${Math.round((passed / total) * 100)}%` : '0%',
    },
    results,
  }, null, 2);
}

// ─── JSON-RPC Protocol ────────────────────────────────────────────────────────

function writeMessage(msg: JsonRpcMessage): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function sendResult(id: number | string, result: unknown): void {
  writeMessage({ jsonrpc: '2.0', id, result });
}

function sendError(id: number | string | null, code: number, message: string): void {
  writeMessage({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleRpcMessage(msg: JsonRpcMessage): Promise<void> {
  const { id, method, params } = msg;
  const p = (params || {}) as Record<string, unknown>;

  // Notifications have no id — don't send a response
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize':
      if (!isNotification) {
        sendResult(id!, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: { name: 'daakia', version: SERVER_VERSION },
        });
      }
      break;

    case 'notifications/initialized':
      // No response needed
      break;

    case 'tools/list':
      if (!isNotification) {
        sendResult(id!, { tools: DAAKIA_TOOLS });
      }
      break;

    case 'tools/call': {
      if (isNotification) break;
      const toolName = p.name as string;
      const toolArgs = (p.arguments as Record<string, unknown>) || {};

      try {
        let text: string;
        if (toolName === 'send_request') {
          text = await handleSendRequest(toolArgs);
        } else if (toolName === 'get_collections') {
          text = await handleGetCollections(toolArgs);
        } else if (toolName === 'run_collection') {
          text = await handleRunCollection(toolArgs);
        } else {
          sendError(id!, -32601, `Unknown tool: ${toolName}`);
          return;
        }
        sendResult(id!, { content: [{ type: 'text', text }] });
      } catch (err) {
        sendResult(id!, {
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          isError: true,
        });
      }
      break;
    }

    case 'ping':
      if (!isNotification) {
        sendResult(id!, {});
      }
      break;

    default:
      if (!isNotification) {
        sendError(id!, -32601, `Method not found: ${method}`);
      }
      break;
  }
}

// ─── Main — STDIO JSON-RPC loop ───────────────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  output: undefined,
  terminal: false,
});

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const msg = JSON.parse(trimmed) as JsonRpcMessage;
    handleRpcMessage(msg).catch(() => {
      sendError(msg.id ?? null, -32603, 'Internal error');
    });
  } catch {
    sendError(null, -32700, 'Parse error: invalid JSON');
  }
});

rl.on('close', () => {
  process.exit(0);
});

process.on('unhandledRejection', () => { /* suppress */ });
process.on('uncaughtException', () => { /* suppress */ });
