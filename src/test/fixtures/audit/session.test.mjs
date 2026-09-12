/**
 * Realtime session audit tests.
 *
 * A session is not a request, so this drives the actual lifecycle each handler
 * emits — connect, connected, traffic, error, disconnected — and checks the one
 * row written at the end.
 *
 * The message type and field names below are taken from the handlers, not
 * invented: `socketio:*` on the wire but `sio.*` as the audit event id, `topic`
 * for MQTT and `event` for Socket.IO, `code`/`reason` on a WebSocket close.
 *
 * Run: node src/test/fixtures/audit/session.test.mjs
 */
import { strict as assert } from 'assert';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const dir = mkdtempSync(join(tmpdir(), 'daakia-session-'));
const entry = join(dir, 'entry.ts');
const bundle = join(dir, 'bundle.cjs');
const stub = join(dir, 'db-stub.ts');

writeFileSync(stub, `
export const rows: any[] = [];
export function insertUiAudit(entry: any) { rows.push(entry); }
export function getSetting<T>(_k: string): T { return { sslVerification: true } as unknown as T; }
`);
writeFileSync(entry, [
  `export * from ${JSON.stringify(resolve('src/services/session-audit.ts'))};`,
  `export { rows } from ${JSON.stringify(stub)};`,
].join('\n'));

const esbuild = await import(pathToFileURL(resolve('node_modules/esbuild/lib/main.js')).href);
await esbuild.build({
  entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs',
  outfile: bundle, logLevel: 'error',
  plugins: [{
    name: 'stub-db',
    setup(build) { build.onResolve({ filter: /storage\/db$/ }, () => ({ path: stub })); },
  }],
});

const { noteSessionConnect, auditSessionMessage, flushOpenSessions, _resetSessionAudit, rows } =
  createRequire(import.meta.url)(bundle);

let failures = 0;
const check = (name, fn) => {
  try { _resetSessionAudit(); rows.length = 0; fn(); console.log(`  PASS  ${name}`); }
  catch (err) { failures++; console.error(`  FAIL  ${name}\n        ${err.message}`); }
};
const meta = (i = 0) => JSON.parse(rows[i].metadata);

console.log('one row per session');

check('a WebSocket session records traffic both ways and the close code', () => {
  noteSessionConnect({ type: 'ws:connect', tabId: 'w1', url: 'wss://api.test/stream', protocols: 'graphql-ws' });
  auditSessionMessage({ type: 'ws:connected', tabId: 'w1' });
  auditSessionMessage({ type: 'ws:initSent', tabId: 'w1', data: 'subscribe' });
  auditSessionMessage({ type: 'ws:sent', tabId: 'w1', data: 'ping' });
  auditSessionMessage({ type: 'ws:message', tabId: 'w1', data: 'hello' });
  auditSessionMessage({ type: 'ws:message', tabId: 'w1', data: 'world!' });
  assert.equal(rows.length, 0, 'a row was written before the session ended');

  auditSessionMessage({ type: 'ws:disconnected', tabId: 'w1', code: 1006, reason: 'abnormal closure' });
  assert.equal(rows.length, 1, 'the session produced no row');
  assert.equal(rows[0].event_type, 'ws.connect');
  const m = meta();
  assert.equal(m.kind, 'session');
  assert.equal(m.connection.url, 'wss://api.test/stream');
  assert.equal(m.connection.details.subprotocols, 'graphql-ws');
  assert.equal(m.traffic.received, 2);
  assert.equal(m.traffic.sent, 2, 'a confirmed outgoing frame was not counted');
  assert.equal(m.traffic.bytesReceived, 11, 'byte totals are wrong');
  assert.equal(m.outcome.state, 'closed');
  assert.equal(m.outcome.code, '1006', 'the close code was not recorded');
  assert.equal(m.outcome.reason, 'abnormal closure');
});

check('a thousand frames still produce exactly one row', () => {
  // The whole point of the session shape: a chatty socket must not be able to
  // flood the audit log.
  noteSessionConnect({ type: 'ws:connect', tabId: 'w2', url: 'wss://busy.test' });
  auditSessionMessage({ type: 'ws:connected', tabId: 'w2' });
  for (let i = 0; i < 1000; i++) auditSessionMessage({ type: 'ws:message', tabId: 'w2', data: 'x' });
  auditSessionMessage({ type: 'ws:disconnected', tabId: 'w2', code: 1000 });
  assert.equal(rows.length, 1);
  assert.equal(meta().traffic.received, 1000);
});

check('MQTT records topics, and never the broker password', () => {
  noteSessionConnect({
    type: 'mqtt:connect', tabId: 'm1', url: 'mqtt://broker.test:1883',
    clientId: 'daakia-1', username: 'sensor', password: 'hunter2',
    keepAlive: 30, cleanSession: false, lastWillTopic: 'status/down',
    subscriptions: [{ topic: 'a' }, { topic: 'b' }],
  });
  auditSessionMessage({ type: 'mqtt:connected', tabId: 'm1' });
  auditSessionMessage({ type: 'mqtt:message', tabId: 'm1', topic: 'sensors/temp', payload: '21.5' });
  auditSessionMessage({ type: 'mqtt:message', tabId: 'm1', topic: 'sensors/temp', payload: '21.7' });
  auditSessionMessage({ type: 'mqtt:message', tabId: 'm1', topic: 'sensors/humidity', payload: '40' });
  auditSessionMessage({ type: 'mqtt:published', tabId: 'm1', topic: 'cmd', payload: 'on' });
  auditSessionMessage({ type: 'mqtt:disconnected', tabId: 'm1', reason: 'Connection closed' });

  const m = meta();
  assert.equal(rows[0].module, 'MQTT');
  assert.equal(m.connection.details.clientId, 'daakia-1');
  assert.equal(m.connection.details.username, 'sensor');
  assert.equal(m.connection.details.password, '(set)');
  assert.equal(m.connection.details.cleanSession, 'false');
  assert.equal(m.traffic.channels['sensors/temp'], 2, 'topics were not tallied');
  assert.equal(m.traffic.channels['sensors/humidity'], 1);
  assert.equal(m.traffic.sent, 1);
  assert.ok(!JSON.stringify(m).includes('hunter2'), 'the broker password was written to the audit log');
});

check('Socket.IO tallies event names and uses its registered event id', () => {
  noteSessionConnect({ type: 'socketio:connect', tabId: 's1', url: 'https://rt.test', namespace: '/chat' });
  auditSessionMessage({ type: 'socketio:connected', tabId: 's1' });
  auditSessionMessage({ type: 'socketio:event', tabId: 's1', event: 'message', args: ['hi'] });
  auditSessionMessage({ type: 'socketio:event', tabId: 's1', event: 'typing' });
  auditSessionMessage({ type: 'socketio:sent', tabId: 's1', event: 'message', args: ['yo'] });
  auditSessionMessage({ type: 'socketio:disconnected', tabId: 's1', reason: 'transport close' });

  // The audit event id is `sio.connect` even though the messages say socketio.
  assert.equal(rows[0].event_type, 'sio.connect', 'a Socket.IO row used an unregistered event id');
  const m = meta();
  assert.equal(m.connection.details.namespace, '/chat');
  assert.equal(m.traffic.channels.message, 2);
  assert.equal(m.outcome.reason, 'transport close');
});

check('SSE records the routing the handler resolved', () => {
  noteSessionConnect({ type: 'sse:connect', tabId: 'e1', url: 'https://api.test/events', headers: [{ key: 'a', value: 'b' }] });
  auditSessionMessage({
    type: 'sse:connected', tabId: 'e1',
    proxy: { used: true, description: 'http://proxy:8080' },
  });
  auditSessionMessage({ type: 'sse:event', tabId: 'e1', event: 'tick', data: '{"n":1}' });
  auditSessionMessage({ type: 'sse:disconnected', tabId: 'e1' });

  const m = meta();
  assert.equal(rows[0].module, 'SSE');
  assert.equal(m.routing.proxied, true, 'SSE routing was not recorded');
  assert.equal(m.traffic.received, 1);
  assert.equal(m.traffic.sent, 0, 'SSE is one-directional; a sent count would be a bug');
  assert.equal(m.traffic.channels.tick, 1, 'SSE event names were not tallied');
});

check('MCP tallies the tools a session actually called', () => {
  noteSessionConnect({
    type: 'mcp:connect', tabId: 'k1', url: '', transport: 'stdio',
    command: 'npx @modelcontextprotocol/server-filesystem',
  });
  auditSessionMessage({ type: 'mcp:connected', tabId: 'k1', capabilities: { tools: {} } });
  auditSessionMessage({ type: 'mcp:toolResult', tabId: 'k1', success: true, toolName: 'read_file', result: { ok: 1 }, duration: 12 });
  auditSessionMessage({ type: 'mcp:toolResult', tabId: 'k1', success: true, toolName: 'read_file', result: { ok: 1 }, duration: 9 });
  auditSessionMessage({ type: 'mcp:toolResult', tabId: 'k1', success: true, toolName: 'list_dir', result: {}, duration: 3 });
  auditSessionMessage({ type: 'mcp:disconnected', tabId: 'k1' });

  assert.equal(rows[0].event_type, 'mcp.connect');
  const m = meta();
  assert.equal(m.connection.details.transport, 'stdio');
  assert.equal(m.traffic.received, 3);
  assert.equal(m.traffic.channels.read_file, 2, 'MCP tool calls were not tallied');
  assert.equal(m.traffic.channels.list_dir, 1);
});

check('an MCP failure is captured even though it reports on `message`', () => {
  // MCP puts the text on `message`; every other protocol uses `error`.
  noteSessionConnect({ type: 'mcp:connect', tabId: 'k2', transport: 'stdio', command: 'missing-binary' });
  auditSessionMessage({ type: 'mcp:error', tabId: 'k2', message: 'spawn missing-binary ENOENT' });
  auditSessionMessage({ type: 'mcp:connectFailed', tabId: 'k2' });
  assert.equal(rows.length, 1, 'a failed MCP connect produced no row');
  const m = meta();
  assert.equal(m.outcome.state, 'failed');
  assert.deepEqual(m.outcome.errors, ['spawn missing-binary ENOENT'],
    'the failure text was recorded as "unknown error"');
});

console.log('\nendings that are not a clean close');

check('a connection that never opens is recorded as failed', () => {
  noteSessionConnect({ type: 'ws:connect', tabId: 'f1', url: 'wss://nope.test' });
  auditSessionMessage({ type: 'ws:error', tabId: 'f1', error: 'ECONNREFUSED' });
  // Nothing will close a connection that never existed, so the row has to be
  // written here or never.
  assert.equal(rows.length, 1, 'a failed connection produced no row');
  const m = meta();
  assert.equal(m.outcome.state, 'failed');
  assert.equal(m.connection.neverOpened, true);
  assert.deepEqual(m.outcome.errors, ['ECONNREFUSED']);
});

check('an error after opening is kept, and the close still writes one row', () => {
  noteSessionConnect({ type: 'ws:connect', tabId: 'f2', url: 'wss://flaky.test' });
  auditSessionMessage({ type: 'ws:connected', tabId: 'f2' });
  auditSessionMessage({ type: 'ws:message', tabId: 'f2', data: 'ok' });
  auditSessionMessage({ type: 'ws:error', tabId: 'f2', error: 'read ECONNRESET' });
  auditSessionMessage({ type: 'ws:disconnected', tabId: 'f2', code: 1006 });
  assert.equal(rows.length, 1);
  const m = meta();
  assert.equal(m.outcome.state, 'failed', 'a session that errored was reported as a clean close');
  assert.equal(m.connection.neverOpened, false);
  assert.equal(m.traffic.received, 1);
});

check('reconnecting on the same tab closes the old session rather than losing it', () => {
  noteSessionConnect({ type: 'ws:connect', tabId: 'r1', url: 'wss://a.test' });
  auditSessionMessage({ type: 'ws:connected', tabId: 'r1' });
  auditSessionMessage({ type: 'ws:message', tabId: 'r1', data: 'first session' });
  noteSessionConnect({ type: 'ws:connect', tabId: 'r1', url: 'wss://a.test' });
  assert.equal(rows.length, 1, 'the superseded session was dropped');
  assert.equal(meta().outcome.state, 'abandoned');
  assert.equal(meta().traffic.received, 1);

  auditSessionMessage({ type: 'ws:connected', tabId: 'r1' });
  auditSessionMessage({ type: 'ws:disconnected', tabId: 'r1', code: 1000 });
  assert.equal(rows.length, 2);
  assert.equal(meta(1).traffic.received, 0, 'traffic leaked across sessions');
});

check('sessions still open when the panel closes are written out', () => {
  noteSessionConnect({ type: 'mqtt:connect', tabId: 'p1', url: 'mqtt://a.test' });
  auditSessionMessage({ type: 'mqtt:connected', tabId: 'p1' });
  auditSessionMessage({ type: 'mqtt:message', tabId: 'p1', topic: 't', payload: 'x' });
  noteSessionConnect({ type: 'ws:connect', tabId: 'p2', url: 'wss://b.test' });
  auditSessionMessage({ type: 'ws:connected', tabId: 'p2' });

  flushOpenSessions();
  assert.equal(rows.length, 2, 'live sessions were lost when the panel closed');
  assert.ok(rows.every(r => JSON.parse(r.metadata).outcome.state === 'abandoned'));
  // And flushing twice must not write them again.
  flushOpenSessions();
  assert.equal(rows.length, 2);
});

console.log('\nhousekeeping');

check('respects the per-event audit toggle', () => {
  noteSessionConnect({ type: 'ws:connect', tabId: 'x1', url: 'wss://a.test', auditEnabled: false });
  auditSessionMessage({ type: 'ws:connected', tabId: 'x1' });
  auditSessionMessage({ type: 'ws:disconnected', tabId: 'x1', code: 1000 });
  assert.equal(rows.length, 0, 'a disabled event was still audited');
});

check('traffic for a session that was never opened is ignored', () => {
  auditSessionMessage({ type: 'ws:message', tabId: 'ghost', data: 'x' });
  auditSessionMessage({ type: 'ws:disconnected', tabId: 'ghost', code: 1000 });
  assert.equal(rows.length, 0);
});

check('a wildcard subscription cannot grow the channel list without bound', () => {
  noteSessionConnect({ type: 'mqtt:connect', tabId: 'c1', url: 'mqtt://a.test' });
  auditSessionMessage({ type: 'mqtt:connected', tabId: 'c1' });
  for (let i = 0; i < 500; i++) {
    auditSessionMessage({ type: 'mqtt:message', tabId: 'c1', topic: `t/${i}`, payload: 'x' });
  }
  auditSessionMessage({ type: 'mqtt:disconnected', tabId: 'c1' });
  const m = meta();
  assert.equal(m.traffic.received, 500, 'frames stopped being counted');
  assert.ok(Object.keys(m.traffic.channels).length <= 20, 'the channel list was unbounded');
});

check('concurrent sessions on different tabs stay separate', () => {
  noteSessionConnect({ type: 'ws:connect', tabId: 'a', url: 'wss://a.test' });
  noteSessionConnect({ type: 'mqtt:connect', tabId: 'b', url: 'mqtt://b.test' });
  auditSessionMessage({ type: 'ws:connected', tabId: 'a' });
  auditSessionMessage({ type: 'mqtt:connected', tabId: 'b' });
  auditSessionMessage({ type: 'ws:message', tabId: 'a', data: 'to a' });
  auditSessionMessage({ type: 'mqtt:message', tabId: 'b', topic: 't', payload: 'to b' });
  auditSessionMessage({ type: 'mqtt:disconnected', tabId: 'b' });
  auditSessionMessage({ type: 'ws:disconnected', tabId: 'a', code: 1000 });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].module, 'MQTT');
  assert.equal(rows[1].module, 'WebSocket');
  assert.equal(JSON.parse(rows[0].metadata).traffic.received, 1);
  assert.equal(JSON.parse(rows[1].metadata).traffic.received, 1);
});

check('an unrelated message never touches a live session', () => {
  noteSessionConnect({ type: 'ws:connect', tabId: 'u1', url: 'wss://a.test' });
  auditSessionMessage({ type: 'ws:connected', tabId: 'u1' });
  auditSessionMessage({ type: 'responseData', tabId: 'u1', response: { status: 200 } });
  auditSessionMessage({ type: 'requestProgress', tabId: 'u1', stage: 'x' });
  auditSessionMessage({ type: 'ws:disconnected', tabId: 'u1', code: 1000 });
  assert.equal(meta().traffic.received, 0, 'an unrelated message was counted as traffic');
});

rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? '\nSession auditing holds.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
