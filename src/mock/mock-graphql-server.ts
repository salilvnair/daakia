/**
 * GraphQL Mock Server - handles introspection, queries, mutations, AND subscriptions over WebSocket.
 * Supports full schema introspection so the Daakia GraphQL client can display Schema/Documentation panels.
 */
import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { MockServerConfig, GraphQLMockOperation, MockLogEntry } from './mock-types';
import { buildIntrospectionResponse } from './mock-graphql-schema';
import { matchRules, matchBody } from './mock-matcher';
import { pickSequenceItem, evaluateFault, checkRateLimit, sleep } from './mock-protocol-helpers';

export type LogCallback = (entry: MockLogEntry) => void;

export function createGraphQLServer(config: MockServerConfig, getConfig: () => MockServerConfig, onLog?: LogCallback): http.Server {
  const server = http.createServer((req, res) => {
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
      res.end(JSON.stringify({ errors: [{ message: 'Method not allowed. Use POST for GraphQL queries/mutations.' }] }));
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

  // ─── WebSocket Subscription Support (graphql-ws protocol) ───
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    // Only handle WebSocket upgrades on /graphql path
    const url = new URL(request.url || '/', `http://localhost`);
    if (url.pathname === '/graphql') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  let clientCounter = 0;

  wss.on('connection', (ws: WebSocket) => {
    const clientId = `gql-sub-${++clientCounter}`;

    // Log connection
    onLog?.({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      serverId: config.id,
      direction: 'incoming',
      protocol: 'graphql',
      event: 'subscription_connect',
      clientId,
    });

    // Don't send connection_ack immediately — wait for connection_init from client

    ws.on('message', (rawData: Buffer) => {
      let msg: any;
      try { msg = JSON.parse(rawData.toString()); } catch { return; }

      if (msg.type === 'connection_init') {
        // graphql-ws protocol: respond to connection_init with connection_ack
        ws.send(JSON.stringify({ type: 'connection_ack' }));
      } else if (msg.type === 'subscribe') {
        const subId = msg.id;
        const payload = msg.payload || {};
        const subQuery = payload.query || '';
        const subVars = payload.variables || {};

        // Log subscription
        onLog?.({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          serverId: config.id,
          direction: 'incoming',
          protocol: 'graphql',
          event: 'subscribe',
          clientId,
          body: JSON.stringify({ query: subQuery, variables: subVars }),
        });

        // Send next message with mock data
        const currentConfig = getConfig();
        const operations = currentConfig.graphqlOperations || [];
        const opNameMatch = subQuery.match(/subscription\s+(\w+)/);
        const opName = opNameMatch?.[1] || '';
        const match = operations.find(op => op.enabled && op.operationType === 'subscription' && op.operationName === opName);

        // Sprint 13.3: subscription sequences — emit N items then complete
        const sendSubscriptionItem = (body: string) => {
          let responseData: unknown;
          try { responseData = JSON.parse(body); } catch { responseData = { data: body }; }
          const wsPayload = responseData && typeof responseData === 'object' && 'data' in (responseData as object)
            ? responseData
            : { data: responseData };
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ id: subId, type: 'next', payload: wsPayload }));
          }
        };

        if (match?.responses?.length) {
          // Emit each sequence item with its configured delay then complete
          const items = match.responses;
          let idx = 0;
          const sendNext = () => {
            if (idx >= items.length || ws.readyState !== WebSocket.OPEN) {
              ws.send(JSON.stringify({ id: subId, type: 'complete' }));
              return;
            }
            const item = items[idx++];
            setTimeout(() => {
              sendSubscriptionItem(item.body);
              sendNext();
            }, item.delayMs ?? match.delay ?? 0);
          };
          setTimeout(sendNext, match.delay || 0);
        } else {
          const responseBody = match?.response || JSON.stringify({ data: { [opName || 'subscriptionResult']: { message: 'Mock subscription data' } } });
          sendSubscriptionItem(responseBody);
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ id: subId, type: 'complete' }));
            }
          }, match?.delay || 0);
        }

        // Log subscription started
        onLog?.({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          serverId: config.id,
          direction: 'outgoing',
          protocol: 'graphql',
          event: 'subscription_started',
          clientId,
        });
      } else if (msg.type === 'complete') {
        onLog?.({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          serverId: config.id,
          direction: 'incoming',
          protocol: 'graphql',
          event: 'complete',
          clientId,
        });
      }
    });

    ws.on('close', () => {
      onLog?.({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        serverId: config.id,
        direction: 'incoming',
        protocol: 'graphql',
        event: 'subscription_disconnect',
        clientId,
      });
    });
  });

  return server;
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

  // ── Rate limit check (Sprint 13.1) ──
  if (!checkRateLimit(match.id, match.rateLimit)) {
    const rlBody = JSON.stringify({ data: null, errors: [{ message: 'Rate limit exceeded', extensions: { code: 'RATE_LIMITED' } }] });
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(rlBody);
    return;
  }

  // ── Header/body matching (Sprint 13.1) ──
  const reqHeaders = req.headers as Record<string, string>;
  if (match.headerMatchers?.length) {
    const logic = match.compositeLogic === 'OR' ? 'OR' : 'AND';
    if (!matchRules(match.headerMatchers, reqHeaders, logic)) {
      const responseBody = JSON.stringify({ data: null, errors: [{ message: `No mock for operation "${queryOpName || opType}" (header match failed)` }] });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(responseBody);
      return;
    }
  }
  if (match.bodyMatcher && rawBody) {
    if (!matchBody(match.bodyMatcher, rawBody)) {
      const responseBody = JSON.stringify({ data: null, errors: [{ message: `No mock for operation "${queryOpName || opType}" (body match failed)` }] });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(responseBody);
      return;
    }
  }

  const doSend = async () => {
    // ── Fault injection (Sprint 13.2) ──
    const fault = evaluateFault(match!.fault);
    if (fault.delayMs > 0) await sleep(fault.delayMs);

    if (fault.triggered && fault.errorMessage && fault.errorMessage !== '{{malformed_json_fault}}') {
      const statusCode = fault.statusCode || 500;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: null, errors: [{ message: fault.errorMessage, extensions: { code: 'FAULT_INJECTED' } }] }));
      return;
    }

    // ── Pick response body (sequence or static) (Sprint 13.3 sequences) ──
    let statusCode = match!.statusCode || 200;
    let responseBody: string;

    const seqItem = match!.responses?.length
      ? pickSequenceItem(match!.id, match!.responses, match!.sequenceMode)
      : null;

    if (seqItem) {
      statusCode = seqItem.statusCode || statusCode;
      responseBody = seqItem.body || match!.response;
    } else if (fault.triggered && fault.errorMessage === '{{malformed_json_fault}}') {
      responseBody = '{"data": {broken json}}';
    } else {
      try {
        JSON.parse(match!.response);
        responseBody = match!.response;
      } catch {
        responseBody = JSON.stringify({ data: match!.response });
      }
    }

    if (match!.delay > 0) await sleep(match!.delay);

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
      headers: reqHeaders,
      body: rawBody || query,
      responseBody,
      duration: Date.now() - startTime,
      event: queryOpName || opType,
    });
  };

  doSend().catch(() => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: null, errors: [{ message: 'Mock server error' }] }));
    }
  });
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
