/** Smoke tests — sidebar "Mock Request" routes each protocol to its own Quick Mocks server. */
import { describe, it, expect } from 'vitest';
import { appendQuickMocks, createQuickMockServer, quickMockServerName, resolveMockProtocol } from '../components/mock/quick-mock';

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
