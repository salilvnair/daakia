/** Smoke tests — sidebar "Mock Request" routes each protocol to its own Quick Mocks server. */
import { describe, it, expect } from 'vitest';
import { appendQuickMocks, createQuickMockServer, dedupeRoutes, hostVariablesOf, quickMockServerName, resolveMockProtocol } from '../components/mock/quick-mock';

describe('resolveMockProtocol', () => {
  it('defaults to REST', () => {
    expect(resolveMockProtocol(undefined, 'GET')).toBe('rest');
    expect(resolveMockProtocol('rest', 'POST')).toBe('rest');
  });

  it('keeps non-REST sidebar protocols', () => {
    expect(resolveMockProtocol('graphql', 'POST')).toBe('graphql');
    expect(resolveMockProtocol('soap', 'POST')).toBe('soap');
    expect(resolveMockProtocol('mcp', 'POST')).toBe('mcp');
  });

  it('splits the realtime protocol by display method', () => {
    expect(resolveMockProtocol('websocket', 'WS')).toBe('websocket');
    expect(resolveMockProtocol('websocket', 'SSE')).toBe('sse');
    expect(resolveMockProtocol('websocket', 'SIO')).toBe('socketio');
    expect(resolveMockProtocol('websocket', 'MQTT')).toBe('mqtt');
  });

  it('falls back to REST for unknown protocols', () => {
    expect(resolveMockProtocol('something-else', 'GET')).toBe('rest');
  });
});

describe('quickMockServerName', () => {
  it('keeps the legacy name for REST so existing servers keep collecting stubs', () => {
    expect(quickMockServerName('rest')).toBe('Quick Mocks');
    expect(quickMockServerName('graphql')).toBe('Quick Mocks (GraphQL)');
  });
});

describe('appendQuickMocks', () => {
  it('adds a REST route with the path taken from the URL', () => {
    const server = appendQuickMocks(createQuickMockServer('rest'), [{ name: 'Get user', method: 'GET', url: 'https://api.test/users?id=1' }]);
    expect(server.routes).toHaveLength(1);
    expect(server.routes[0].method).toBe('GET');
    expect(server.routes[0].path).toBe('/users?id=1');
  });

  it('adds a GraphQL operation instead of a route', () => {
    const server = appendQuickMocks(createQuickMockServer('graphql'), [{ name: 'Get users', method: 'POST', url: 'https://api.test/graphql' }]);
    expect(server.routes).toHaveLength(0);
    expect(server.graphqlOperations).toHaveLength(1);
    expect(server.graphqlOperations?.[0].operationName).toBe('GetUsers');
  });

  it('splits a gRPC "Service/Method" name', () => {
    const server = appendQuickMocks(createQuickMockServer('grpc'), [{ name: 'greet.Greeter/SayHello', method: 'GRPC', url: 'localhost:50051' }]);
    expect(server.grpcMethods?.[0]).toMatchObject({ service: 'greet.Greeter', method: 'SayHello', type: 'unary' });
  });

  it('adds a SOAP operation with a matching envelope', () => {
    const server = appendQuickMocks(createQuickMockServer('soap'), [{ name: 'Get Quote', method: 'SOAP', url: 'https://api.test/soap' }]);
    expect(server.soapOperations?.[0].operation).toBe('GetQuote');
    expect(server.soapOperations?.[0].response).toContain('<GetQuoteResponse/>');
  });

  it('appends to what the server already holds', () => {
    const first = appendQuickMocks(createQuickMockServer('mcp'), [{ name: 'List Files', method: 'MCP', url: 'stdio' }]);
    const second = appendQuickMocks(first, [{ name: 'Read File', method: 'MCP', url: 'stdio' }]);
    expect(second.mcpTools?.map(t => t.name)).toEqual(['list_files', 'read_file']);
  });
});

/*
  A mock replaces the host, so the host is exactly what must come off the
  route — and everything after it must survive untouched.

  Mocking a collection whose requests are written `{{backend}}/actuator/health`
  produced `/%7B%7Bbackend%7D%7D/actuator/health`: the variable kept as a
  literal path segment with its braces percent-encoded, matching nothing that
  would ever be requested. Every case below is a URL shape that appears in
  real collections.
*/
describe('the path a mock route answers on', () => {
  const pathOf = (url: string) =>
    appendQuickMocks(createQuickMockServer('rest'), [{ name: 'r', method: 'GET', url }])
      .routes.slice(-1)[0]!.path;

  it('drops a leading variable host', () => {
    expect(pathOf('{{backend}}/actuator/health')).toBe('/actuator/health');
  });

  it('never percent-encodes braces', () => {
    expect(pathOf('{{emailServer}}/email/inbound/excel')).not.toContain('%7B');
  });

  it('keeps a variable that is part of the path', () => {
    // Only the leading one is the host; the rest belong to the route.
    expect(pathOf('{{backend}}/users/{{userId}}/orders')).toBe('/users/{{userId}}/orders');
  });

  it('keeps a path variable even when the host is written out', () => {
    expect(pathOf('https://api.example.com/users/{{id}}')).toBe('/users/{{id}}');
  });

  it('drops a written-out scheme and host', () => {
    expect(pathOf('https://api.example.com/v1/orders')).toBe('/v1/orders');
  });

  it('drops a bare host and port', () => {
    expect(pathOf('localhost:8080/api/health')).toBe('/api/health');
  });

  it('keeps the query string', () => {
    expect(pathOf('{{backend}}/search?q=1&page=2')).toBe('/search?q=1&page=2');
  });

  it('drops a fragment, which never reaches a server', () => {
    expect(pathOf('{{backend}}/docs#section')).toBe('/docs');
  });

  it('collapses a doubled slash from joining host and path', () => {
    expect(pathOf('{{backend}}//actuator/health')).toBe('/actuator/health');
  });

  it('gives the root for a bare variable', () => {
    expect(pathOf('{{backend}}')).toBe('/');
  });

  it('leaves an already-relative path alone', () => {
    expect(pathOf('/actuator/health')).toBe('/actuator/health');
  });

  it('adds the leading slash a relative path is missing', () => {
    expect(pathOf('actuator/health')).toBe('/actuator/health');
  });
});

describe('which variable to repoint', () => {
  /*
    The routes cannot say that `{{backend}}` is now meant to be the mock's
    address — stripping it is the whole point — so the name is reported for
    the toast to pass on.
  */
  it('names the host variables it stripped', () => {
    expect(hostVariablesOf(['{{backend}}/a', '{{emailServer}}/b', '{{backend}}/c']))
      .toEqual(['backend', 'emailServer']);
  });

  it('names nothing when the host was written out', () => {
    expect(hostVariablesOf(['https://api.example.com/a', '/b'])).toEqual([]);
  });

  it('ignores a variable that is only in the path', () => {
    expect(hostVariablesOf(['/users/{{id}}'])).toEqual([]);
  });
});

/*
  One route per method and path.

  A collection holds the same endpoint many times over — the same POST with
  three different bodies, a GET saved twice under different folders — and each
  became its own route, so 52 requests produced 52 routes with the same path
  repeated down the list. Only the first could ever match.
*/
describe('deduplicating routes', () => {
  const rest = () => createQuickMockServer('rest');
  const req = (method: string, url: string) => ({ name: url, method, url });

  it('collapses repeats of the same method and path', () => {
    const s = appendQuickMocks(rest(), [
      req('POST', '{{emailServer}}/email/inbound/excel'),
      req('POST', '{{emailServer}}/email/inbound/excel'),
      req('POST', '{{emailServer}}/email/inbound/excel'),
    ]);
    expect(s.routes).toHaveLength(1);
    expect(s.routes[0]!.path).toBe('/email/inbound/excel');
  });

  it('keeps the same path under a different method', () => {
    const s = appendQuickMocks(rest(), [
      req('GET', '{{backend}}/orders'),
      req('POST', '{{backend}}/orders'),
    ]);
    expect(s.routes.map(r => `${r.method} ${r.path}`)).toEqual(['GET /orders', 'POST /orders']);
  });

  /*
    Inherent to pointing several variables at one mock: two services that were
    distinct become one path. It is a merge worth reporting, which is what the
    returned count is for.
  */
  it('merges two services that share a sub-path once the host is gone', () => {
    const s = appendQuickMocks(rest(), [
      req('GET', '{{emailServer}}/health'),
      req('GET', '{{validationService}}/health'),
    ]);
    expect(s.routes).toHaveLength(1);
  });

  it('adds nothing when the routes are already there', () => {
    const first = appendQuickMocks(rest(), [req('GET', '{{backend}}/a')]);
    const second = appendQuickMocks(first, [req('GET', '{{backend}}/a')]);
    expect(second.routes).toHaveLength(1);
  });

  /*
    Re-running Mock must not overwrite work. A route that has been given a
    body is worth more than the empty one that would replace it.
  */
  it('leaves an edited route alone rather than replacing it', () => {
    const first = appendQuickMocks(rest(), [req('GET', '{{backend}}/a')]);
    const edited = { ...first, routes: [{ ...first.routes[0]!, body: '{"real":true}' }] };
    const again = appendQuickMocks(edited, [req('GET', '{{backend}}/a')]);
    expect(again.routes[0]!.body).toBe('{"real":true}');
  });

  it('reports what it added and what it merged', () => {
    const existing = appendQuickMocks(rest(), [req('GET', '{{backend}}/a')]);
    const r = dedupeRoutes(existing.routes, [
      { ...existing.routes[0]! },
      { ...existing.routes[0]!, path: '/b' },
    ]);
    expect(r.added).toBe(1);
    expect(r.merged).toBe(1);
    expect(r.routes).toHaveLength(2);
  });
});
