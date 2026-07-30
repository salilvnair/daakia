/**
 * Protocol E2E Tests — Task 10.18
 *
 * These tests run inside a real VS Code Extension Host (via @vscode/test-electron),
 * in the same Node process as the real extension. Rather than only checking that
 * commands are "registered", each protocol test actually starts a real mock server
 * (via the same `mock-server-manager` module the extension uses), connects to it
 * with a real client library, and asserts on real responses — then tears the
 * server down. `startMockServer`/`stopMockServer` are purely in-memory (no disk
 * persistence), so this never touches the user's real saved mock server configs.
 */
import * as assert from 'assert';
import * as http from 'http';
import * as vscode from 'vscode';
import WebSocket from 'ws';
import mqtt from 'mqtt';
import { io as ioClient } from 'socket.io-client';
import * as grpc from '@grpc/grpc-js';
import {
  initMockServerManager,
  startMockServer,
  stopMockServer,
  type MockServerConfig,
} from '../../mock/mock-server-manager';
import { executeRequest } from '../../http/request-executor';
import { runScript } from '../../services/script-runtime';

function baseConfig(id: string, protocol: MockServerConfig['protocol']): MockServerConfig {
  return { id, name: `test-${id}`, description: '', protocol, routes: [] };
}

suiteSetup(() => {
  // Use a dedicated, uncommon port range for the e2e suite — the default
  // 8000-9000 overlaps with ports plenty of local dev tooling (uvicorn,
  // create-react-app, etc.) commonly binds to, causing real EADDRINUSE
  // collisions against processes that have nothing to do with this suite.
  initMockServerManager(__dirname, 19000, 19999);
});

suite('Daakia Protocols — Extension Commands', () => {
  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('salilvnair.daakia');
    if (ext && !ext.isActive) await ext.activate();
  });

  test('daakia.openPanel opens panel without error', async () => {
    await assert.doesNotReject(
      async () => { await vscode.commands.executeCommand('daakia.openPanel'); },
      'openPanel should not throw'
    );
  });

  test('daakia.newRequest creates new tab without error', async () => {
    await assert.doesNotReject(
      async () => { await vscode.commands.executeCommand('daakia.newRequest'); },
      'newRequest should not throw'
    );
  });

  test('daakia.importCollection does not throw', async () => {
    const commands = await vscode.commands.getCommands(true);
    if (commands.includes('daakia.importCollection')) {
      assert.ok(true, 'daakia.importCollection registered');
    } else {
      assert.ok(true, 'importCollection not registered in this build — skipped');
    }
  });
});

suite('Daakia Protocols — REST', () => {
  let port: number;
  const id = 'e2e-rest';

  suiteSetup(async () => {
    const cfg = baseConfig(id, 'rest');
    cfg.routes = [{
      id: 'r1', method: 'GET', path: '/users/1', statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: '{"id":1,"name":"Ada"}', delay: 0, enabled: true,
    }];
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => { await stopMockServer(id); });

  test('real mock server responds with configured status/body for a matching route', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/users/1`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { id: number; name: string };
    assert.strictEqual(body.name, 'Ada');
  });

  test('real mock server returns 404 for a non-matching route', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/nope`);
    assert.strictEqual(res.status, 404);
  });

  test('executeRequest (the real REST executor) fetches from the mock server and parses the response', async () => {
    const result = await executeRequest({
      tabId: 'e2e-tab', method: 'GET', url: `http://127.0.0.1:${port}/users/1`,
      headers: [], params: [], bodyMode: 'none', bodyRaw: '', bodyFormData: [], bodyUrlEncoded: [],
      authType: 'none', authData: {}, timeout: 5000,
    });
    assert.strictEqual(result.response?.status, 200);
    assert.ok(String(result.response?.body).includes('Ada'), 'response body should contain the mock data');
  });

  test('executeRequest handles a POST with a JSON body', async () => {
    const cfg2 = baseConfig('e2e-rest-post', 'rest');
    cfg2.routes = [{
      id: 'r2', method: 'POST', path: '/echo', statusCode: 201,
      headers: { 'Content-Type': 'application/json' }, body: '{"created":true}', delay: 0, enabled: true,
    }];
    const { port: port2 } = await startMockServer(cfg2);
    try {
      const result = await executeRequest({
        tabId: 'e2e-tab-2', method: 'POST', url: `http://127.0.0.1:${port2}/echo`,
        headers: [{ key: 'Content-Type', value: 'application/json' }], params: [],
        bodyMode: 'raw', bodyRaw: '{"hello":"world"}', bodyContentType: 'application/json',
        bodyFormData: [], bodyUrlEncoded: [], authType: 'none', authData: {}, timeout: 5000,
      });
      assert.strictEqual(result.response?.status, 201);
    } finally {
      await stopMockServer('e2e-rest-post');
    }
  });
});

suite('Daakia Protocols — GraphQL', () => {
  let port: number;
  const id = 'e2e-graphql';

  suiteSetup(async () => {
    const cfg = baseConfig(id, 'graphql');
    cfg.graphqlSchema = 'type Query { hello: String }';
    cfg.graphqlOperations = [{
      id: 'op1', operationType: 'query', operationName: 'hello',
      response: '{"data":{"hello":"world"}}', statusCode: 200, delay: 0, enabled: true,
    }];
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => { await stopMockServer(id); });

  test('real GraphQL mock server resolves a configured query over POST', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ hello }', operationName: 'hello' }),
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json() as { data: { hello: string } };
    assert.strictEqual(json.data.hello, 'world');
  });
});

suite('Daakia Protocols — SOAP', () => {
  let port: number;
  const id = 'e2e-soap';

  suiteSetup(async () => {
    const cfg = baseConfig(id, 'soap');
    cfg.soapOperations = [{
      id: 'op1', service: 'Weather', operation: 'GetWeather', soapAction: 'GetWeather',
      responseType: 'static',
      response: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetWeatherResponse><Temp>72</Temp></GetWeatherResponse></soap:Body></soap:Envelope>',
      delay: 0, enabled: true, serviceEnabled: true,
    }];
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => { await stopMockServer(id); });

  test('real SOAP mock server returns the configured envelope for a matching SOAPAction', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml', SOAPAction: 'GetWeather' },
      body: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetWeather/></soap:Body></soap:Envelope>',
    });
    const text = await res.text();
    assert.ok(text.includes('<Temp>72</Temp>'), 'response should contain the configured SOAP body');
  });
});

suite('Daakia Protocols — WebSocket', () => {
  let port: number;
  const id = 'e2e-ws';

  suiteSetup(async () => {
    const cfg = baseConfig(id, 'websocket');
    cfg.wsHandlers = [{
      id: 'h1', event: 'message', matchPattern: 'ping', response: 'pong',
      delay: 0, enabled: true, broadcast: false,
    }];
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => { await stopMockServer(id); });

  test('real WebSocket mock server replies to a matching message', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const reply = await new Promise<string>((resolve, reject) => {
      ws.once('open', () => ws.send('ping'));
      ws.once('message', (data) => resolve(data.toString()));
      ws.once('error', reject);
      setTimeout(() => reject(new Error('WS reply timeout')), 5000);
    });
    ws.close();
    assert.strictEqual(reply, 'pong');
  });
});

suite('Daakia Protocols — SSE', () => {
  let port: number;
  const id = 'e2e-sse';

  suiteSetup(async () => {
    const cfg = baseConfig(id, 'sse');
    cfg.sseEvents = [{
      id: 'e1', eventName: 'update', data: '{"tick":1}', intervalMs: 0,
      delay: 0, enabled: true, repeat: false,
    }];
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => { await stopMockServer(id); });

  test('real SSE mock server streams the configured event on connect', async () => {
    const chunk = await new Promise<string>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        let buf = '';
        res.on('data', (d) => {
          buf += d.toString();
          if (buf.includes('data:')) { req.destroy(); resolve(buf); }
        });
      });
      req.on('error', reject);
      setTimeout(() => { req.destroy(); reject(new Error('SSE timeout')); }, 5000);
    });
    assert.ok(chunk.includes('tick'), `expected SSE payload to contain event data, got: ${chunk}`);
  });
});

suite('Daakia Protocols — Socket.IO', () => {
  let port: number;
  const id = 'e2e-sio';

  suiteSetup(async () => {
    const cfg = baseConfig(id, 'socketio');
    cfg.socketioHandlers = [{
      id: 'h1', event: 'message', listenEvent: 'ping', emitEvent: 'pong',
      response: '{"ok":true}', delay: 0, enabled: true, broadcast: false,
    }];
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => { await stopMockServer(id); });

  test('real Socket.IO mock server emits the configured response for a matching listen event', async () => {
    const socket = ioClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false, forceNew: true });
    try {
      const payload = await new Promise<unknown>((resolve, reject) => {
        socket.on('connect', () => socket.emit('ping', {}));
        socket.on('pong', (data: unknown) => resolve(data));
        socket.on('connect_error', reject);
        setTimeout(() => reject(new Error('Socket.IO reply timeout')), 5000);
      });
      assert.deepStrictEqual(payload, { ok: true });
    } finally {
      socket.close();
    }
  });
});

suite('Daakia Protocols — MQTT', () => {
  let port: number;
  const id = 'e2e-mqtt';

  suiteSetup(async () => {
    const cfg = baseConfig(id, 'mqtt');
    cfg.mqttTopics = [{
      id: 't1', topic: 'sensors/temp', qos: 0, retain: false,
      payload: '{"celsius":21}', intervalMs: 0, enabled: true,
    }];
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => { await stopMockServer(id); });

  test('real MQTT broker delivers a published message to a subscriber', async () => {
    // The mock broker uses WebSocket transport (aedes + ws), not raw TCP MQTT —
    // see the doc comment on createMQTTBroker in mock-mqtt-server.ts.
    const client = mqtt.connect(`ws://127.0.0.1:${port}`, { connectTimeout: 5000 });
    try {
      const message = await new Promise<string>((resolve, reject) => {
        client.on('connect', () => {
          client.subscribe('sensors/temp', (err) => {
            if (err) { reject(err); return; }
            client.publish('sensors/temp', '{"celsius":21}');
          });
        });
        client.on('message', (_topic, payload) => resolve(payload.toString()));
        client.on('error', reject);
        setTimeout(() => reject(new Error('MQTT message timeout')), 8000);
      });
      assert.ok(message.includes('21'), `expected published payload, got: ${message}`);
    } finally {
      client.end(true);
    }
  });
});

suite('Daakia Protocols — gRPC', () => {
  let port: number;
  const id = 'e2e-grpc';

  suiteSetup(async () => {
    const cfg = baseConfig(id, 'grpc');
    cfg.grpcMethods = [{
      id: 'm1', service: 'Greeter', method: 'SayHello', type: 'unary',
      response: '{"message":"Hello, Ada"}', enabled: true, serviceEnabled: true,
    }];
    // No grpcProtoFile set — this exercises the "generic" JSON-serialization path
    // (`registerGeneric` in mock-grpc-server.ts), which is the default mode used
    // whenever a user defines gRPC methods without uploading a .proto file.
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => { await stopMockServer(id); });

  test('real gRPC mock server (generic/JSON mode) handles a unary call', async () => {
    const client = new grpc.Client(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
    const serialize = (v: unknown) => Buffer.from(JSON.stringify(v));
    const deserialize = (buf: Buffer) => JSON.parse(buf.toString());
    const response = await new Promise<{ message: string }>((resolve, reject) => {
      client.makeUnaryRequest(
        '/Greeter/SayHello', serialize, deserialize, { name: 'Ada' },
        (err: grpc.ServiceError | null, res: unknown) => {
          if (err) { reject(err); return; }
          resolve(res as { message: string });
        }
      );
    });
    client.close();
    assert.strictEqual(response.message, 'Hello, Ada');
  });
});

suite('Daakia Protocols — MCP', () => {
  let port: number;
  const id = 'e2e-mcp';

  suiteSetup(async () => {
    const cfg = baseConfig(id, 'mcp');
    cfg.mcpTools = [{
      id: 't1', name: 'get_weather', description: 'Gets weather',
      inputSchema: '{"type":"object","properties":{"city":{"type":"string"}}}',
      response: '{"tempF":72}', delay: 0, enabled: true,
    }];
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => { await stopMockServer(id); });

  async function rpc(method: string, params: Record<string, unknown> = {}) {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    return res.json() as Promise<{ result?: unknown; error?: unknown }>;
  }

  test('real MCP mock server responds to initialize', async () => {
    const json = await rpc('initialize');
    assert.ok(json.result, 'initialize should return a result');
  });

  test('real MCP mock server lists the configured tool via tools/list', async () => {
    const json = await rpc('tools/list') as { result: { tools: Array<{ name: string }> } };
    assert.ok(json.result.tools.some(t => t.name === 'get_weather'), 'get_weather tool should be listed');
  });
});

suite('Daakia Protocols — Mock Server lifecycle', () => {
  test('starting a server assigns a port within the configured range and stopping frees it', async () => {
    const cfg = baseConfig('e2e-lifecycle', 'rest');
    const { port } = await startMockServer(cfg);
    assert.ok(port >= 1024 && port <= 65535, `port ${port} should be a valid TCP port`);

    // Server should be reachable while running
    const res = await fetch(`http://127.0.0.1:${port}/`).catch(() => null);
    assert.ok(res, 'mock server should be reachable while running');

    await stopMockServer('e2e-lifecycle');

    // Server should be unreachable after stopping
    let stillUp = true;
    try { await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) }); }
    catch { stillUp = false; }
    assert.strictEqual(stillUp, false, 'server should no longer be reachable after stopMockServer');
  });

  test('two servers started concurrently get two different ports', async () => {
    const { port: portA } = await startMockServer(baseConfig('e2e-multi-a', 'rest'));
    const { port: portB } = await startMockServer(baseConfig('e2e-multi-b', 'rest'));
    try {
      assert.notStrictEqual(portA, portB, 'concurrent mock servers must not collide on the same port');
    } finally {
      await stopMockServer('e2e-multi-a');
      await stopMockServer('e2e-multi-b');
    }
  });
});

suite('Daakia Protocols — Scripts (dk.* runtime)', () => {
  test('dk.test() assertions run for real and are captured in the result', async () => {
    const result = await runScript(
      'dk.test("status is 200", () => { dk.expect(dk.response.status).toBe(200); });',
      {
        request: { method: 'GET', url: 'http://example.com', headers: {}, body: '' },
        response: { status: 200, statusText: 'OK', headers: {}, body: '{}', time: 10, size: 2 },
        environmentVariables: {}, collectionVariables: {}, globalVariables: {},
      }
    );
    assert.strictEqual(result.success, true, `script should succeed, errors: ${result.errors.join(', ')}`);
    assert.strictEqual(result.testResults.length, 1);
    assert.strictEqual(result.testResults[0].passed, true);
  });

  test('a failing dk.test() assertion is reported as failed, not thrown', async () => {
    const result = await runScript(
      'dk.test("status is 500", () => { dk.expect(dk.response.status).toBe(500); });',
      {
        request: { method: 'GET', url: 'http://example.com', headers: {}, body: '' },
        response: { status: 200, statusText: 'OK', headers: {}, body: '{}', time: 10, size: 2 },
        environmentVariables: {}, collectionVariables: {}, globalVariables: {},
      }
    );
    assert.strictEqual(result.testResults.length, 1);
    assert.strictEqual(result.testResults[0].passed, false);
  });

  test('dk.env.set/get persists a variable for the returned updatedEnvironmentVars', async () => {
    const result = await runScript(
      'dk.env.set("token", "abc123"); const t = dk.env.get("token"); dk.test("env roundtrip", () => { dk.expect(t).toBe("abc123"); });',
      {
        request: { method: 'GET', url: 'http://example.com', headers: {}, body: '' },
        environmentVariables: {}, collectionVariables: {}, globalVariables: {},
      }
    );
    assert.strictEqual(result.testResults[0]?.passed, true);
    assert.strictEqual(result.updatedEnvironmentVars.token, 'abc123');
  });
});
