/**
 * GraphQL Mock Server - handles introspection, queries, mutations.
 * Supports full schema introspection so the Daakia GraphQL client can display Schema/Documentation panels.
 */
import * as http from 'http';
import type { MockServerConfig, GraphQLMockOperation, MockLogEntry } from './mock-types';
import { buildIntrospectionResponse } from './mock-graphql-schema';

export type LogCallback = (entry: MockLogEntry) => void;

export function createGraphQLServer(config: MockServerConfig, getConfig: () => MockServerConfig, onLog?: LogCallback): http.Server {
  return http.createServer((req, res) => {
    const startTime = Date.now();

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://localhost`);

    // Health check
    if (req.method === 'GET' && url.pathname === '/.well-known/apollo/server-health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'pass' }));
      return;
    }

    // GET with query param
    if (req.method === 'GET' && url.searchParams.has('query')) {
      const query = url.searchParams.get('query') || '';
      const variables = url.searchParams.get('variables');
      const parsedVars = variables ? JSON.parse(variables) : null;
      handleGraphQLQuery(config, getConfig, query, parsedVars, res, startTime, req, onLog);
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errors: [{ message: 'Method not allowed. Use POST for GraphQL.' }] }));
      return;
    }

    // ─── Content-Type validation (like Apollo Server / graphql-http) ───
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('application/json') && !contentType.includes('application/graphql')) {
      res.writeHead(415, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        errors: [{
          message: `Unsupported Content-Type: "${req.headers['content-type'] || '(none)'}". GraphQL requires "application/json" or "application/graphql".`,
          extensions: { code: 'UNSUPPORTED_MEDIA_TYPE' }
        }]
      }));
      return;
    }

    // Parse POST body
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      // ─── Body size limit: 5 MB ───
      if (body.length > 5 * 1024 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errors: [{ message: 'Request body exceeds 5 MB limit', extensions: { code: 'PAYLOAD_TOO_LARGE' } }] }));
        return;
      }

      try {
        const parsed = JSON.parse(body);

        // ─── "query" field required (GraphQL spec) ───
        if (!parsed.query || typeof parsed.query !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            errors: [{
              message: 'Missing required field "query". GraphQL requests must include a query string.',
              extensions: { code: 'BAD_REQUEST' }
            }]
          }));
          return;
        }

        // ─── Basic GraphQL syntax validation ───
        const syntaxError = validateGraphQLSyntax(parsed.query);
        if (syntaxError) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            errors: [{
              message: syntaxError,
              extensions: { code: 'GRAPHQL_PARSE_FAILED' }
            }]
          }));
          return;
        }

        // ─── variables must be object/null if present ───
        if (parsed.variables !== undefined && parsed.variables !== null && typeof parsed.variables !== 'object') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            errors: [{
              message: '"variables" field must be an object or null',
              extensions: { code: 'BAD_REQUEST' }
            }]
          }));
          return;
        }

        const query = parsed.query;
        const variables = parsed.variables || null;
        handleGraphQLQuery(config, getConfig, query, variables, res, startTime, req, onLog, body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errors: [{ message: 'Invalid JSON body. Expected a JSON object with a "query" field.', extensions: { code: 'BAD_REQUEST' } }] }));
      }
    });
  });
}

function handleGraphQLQuery(
  config: MockServerConfig,
  getConfig: () => MockServerConfig,
  query: string,
  variables: any,
  res: http.ServerResponse,
  startTime: number,
  req: http.IncomingMessage,
  onLog?: LogCallback,
  rawBody?: string,
): void {
  const currentConfig = getConfig();
  const operations = currentConfig.graphqlOperations;
  const schema = currentConfig.graphqlSchema;

  // Check if this is an introspection query
  if (isIntrospectionQuery(query)) {
    const introspectionResponse = buildIntrospectionResponse(schema || '');
    const responseBody = JSON.stringify(introspectionResponse);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(responseBody);

    onLog?.({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      serverId: config.id,
      direction: 'incoming',
      protocol: 'graphql',
      method: 'POST',
      path: '/graphql',
      statusCode: 200,
      headers: req.headers as Record<string, string>,
      body: rawBody || query,
      responseBody,
      duration: Date.now() - startTime,
      event: 'introspection',
    });
    return;
  }

  if (!operations || operations.length === 0) {
    const responseBody = JSON.stringify({ data: null, errors: [{ message: 'No mock operations configured' }] });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(responseBody);

    onLog?.({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      serverId: config.id,
      direction: 'incoming',
      protocol: 'graphql',
      method: 'POST',
      path: '/graphql',
      statusCode: 200,
      headers: req.headers as Record<string, string>,
      body: rawBody || query,
      responseBody,
      duration: Date.now() - startTime,
    });
    return;
  }

  // Extract operation name from query string
  const opNameMatch = query.match(/(?:query|mutation|subscription)\s+(\w+)/);
  const queryOpName = opNameMatch?.[1] || '';

  // Determine operation type
  const isQuery = query.trimStart().startsWith('query') || (!query.trimStart().startsWith('mutation') && !query.trimStart().startsWith('subscription'));
  const isMutation = query.trimStart().startsWith('mutation');
  const opType: 'query' | 'mutation' | 'subscription' = isMutation ? 'mutation' : isQuery ? 'query' : 'subscription';

  // Find matching operation (by name first, then by type)
  let match = operations.find(op => op.enabled && op.operationName && op.operationName === queryOpName);
  if (!match) {
    match = operations.find(op => op.enabled && op.operationType === opType);
  }
  if (!match) {
    match = operations.find(op => op.enabled);
  }

  if (!match) {
    const responseBody = JSON.stringify({ data: null, errors: [{ message: `No mock for operation "${queryOpName || opType}"` }] });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(responseBody);

    onLog?.({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      serverId: config.id,
      direction: 'incoming',
      protocol: 'graphql',
      method: 'POST',
      path: '/graphql',
      statusCode: 200,
      headers: req.headers as Record<string, string>,
      body: rawBody || query,
      responseBody,
      duration: Date.now() - startTime,
    });
    return;
  }

  const sendResponse = () => {
    const statusCode = match!.statusCode || 200;
    let responseBody: string;
    try {
      JSON.parse(match!.response);
      responseBody = match!.response;
    } catch {
      responseBody = JSON.stringify({ data: match!.response });
    }

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(responseBody);

    onLog?.({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      serverId: config.id,
      direction: 'incoming',
      protocol: 'graphql',
      method: 'POST',
      path: '/graphql',
      statusCode,
      headers: req.headers as Record<string, string>,
      body: rawBody || query,
      responseBody,
      duration: Date.now() - startTime,
      event: queryOpName || opType,
    });
  };

  if (match.delay > 0) {
    setTimeout(sendResponse, match.delay);
  } else {
    sendResponse();
  }
}

function isIntrospectionQuery(query: string): boolean {
  return query.includes('__schema') || query.includes('IntrospectionQuery');
}

/**
 * Basic GraphQL syntax validation — like Apollo Server / graphql-js would do.
 * Returns error string if invalid, undefined if OK.
 */
function validateGraphQLSyntax(query: string): string | undefined {
  const trimmed = query.trim();

  if (!trimmed) {
    return 'Syntax Error: Unexpected end of input. Expected a GraphQL document.';
  }

  // Must start with a valid keyword or shorthand query (starts with '{')
  const validStarts = ['query', 'mutation', 'subscription', 'fragment', '{'];
  const startsValid = validStarts.some(s => trimmed.startsWith(s));
  if (!startsValid) {
    return `Syntax Error: Unexpected token at start of query. Expected "query", "mutation", "subscription", or "{".`;
  }

  // Must contain at least one selection set (opening brace)
  if (!trimmed.includes('{')) {
    return 'Syntax Error: Expected selection set "{". Every GraphQL operation must have a selection set.';
  }

  // Balanced braces check
  let depth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth < 0) {
      return `Syntax Error: Unexpected "}" at position ${i}. Unmatched closing brace.`;
    }
  }
  if (depth !== 0) {
    return `Syntax Error: Expected "}" but reached end of input. ${depth} unclosed brace(s).`;
  }

  return undefined;
}
