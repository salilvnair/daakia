/**
 * Protocol audit tests.
 *
 * The audit hook lives on the outbound message path so that every handler
 * return route is covered without each one remembering to call it. That design
 * only pays off if the pairing is right, so this drives the hook the way
 * MainPanel does — note the send, post the response — for each protocol, and
 * checks what lands in the database.
 *
 * insertUiAudit is stubbed, because what is being tested is the correlation and
 * the record, not SQLite.
 *
 * The payloads below are copied from the field names the webview actually
 * posts — `envelope`, `message`, `metadata`, `query` — not from what the audit
 * code hopes they are called. An earlier version of this file invented
 * `soapEnvelope` and `grpcMessage`, matched the same invented names in the
 * code, and passed while recording nothing.
 *
 * Run: node src/test/fixtures/audit/audit.test.mjs
 */
import { strict as assert } from 'assert';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const dir = mkdtempSync(join(tmpdir(), 'daakia-audit-'));
const entry = join(dir, 'entry.ts');
const bundle = join(dir, 'bundle.cjs');
const abs = (p) => JSON.stringify(resolve(p));

// The db module is replaced at bundle time: the hook's job is correlation, and
// standing up SQLite would test something else.
const stub = join(dir, 'db-stub.ts');
writeFileSync(stub, `
export const rows: any[] = [];
export function insertUiAudit(entry: any) { rows.push(entry); }
export function getSetting<T>(_k: string): T { return { followRedirects: true, sslVerification: false, timeout: 4000 } as unknown as T; }
`);
writeFileSync(entry, [
  `export * from ${abs('src/services/protocol-audit.ts')};`,
  `export { rows } from ${JSON.stringify(stub)};`,
].join('\n'));

const esbuild = await import(pathToFileURL(resolve('node_modules/esbuild/lib/main.js')).href);
await esbuild.build({
  entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs',
  outfile: bundle, logLevel: 'error',
  plugins: [{
    name: 'stub-db',
    setup(build) {
      build.onResolve({ filter: /storage\/db$/ }, () => ({ path: stub }));
    },
  }],
});

const { noteProtocolSend, auditProtocolResponse, _resetProtocolAudit, rows } =
  createRequire(import.meta.url)(bundle);

let failures = 0;
const check = (name, fn) => {
  try { _resetProtocolAudit(); rows.length = 0; fn(); console.log(`  PASS  ${name}`); }
  catch (err) { failures++; console.error(`  FAIL  ${name}\n        ${err.message}`); }
};
const meta = (i = 0) => JSON.parse(rows[i].metadata);

console.log('per-protocol capture');

check('REST', () => {
  noteProtocolSend({
    type: 'executeRequest', tabId: 't1', method: 'POST', url: 'https://api.test/orders',
    authType: 'bearer', bodyMode: 'json',
  });
  auditProtocolResponse({
    type: 'responseData', tabId: 't1',
    requestMethod: 'POST', requestUrl: 'https://api.test/orders',
    requestHeaders: { Authorization: 'Bearer x', 'Content-Type': 'application/json' },
    requestBody: '{"a":1}',
    response: { status: 201, statusText: 'Created', headers: { 'content-type': 'application/json' }, body: '{"id":1}', size: 8, time: 42 },
    proxy: { used: true, description: 'http://proxy:8080' },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_type, 'rest.send');
  assert.equal(rows[0].module, 'REST');
  const m = meta();
  assert.equal(m.protocol, 'rest');
  assert.equal(m.request.headerCount, 2);
  assert.equal(m.response.status, 201);
  assert.equal(m.routing.proxied, true);
  assert.equal(m.settings.sslVerification, false, 'settings in force were not captured');
});

check('GraphQL, whose operation name is in the document not the payload', () => {
  noteProtocolSend({
    type: 'executeGraphQL', tabId: 't2', endpoint: 'https://api.test/graphql',
    query: 'query GetUser($id: ID!) { user(id: $id) { name } }',
  });
  auditProtocolResponse({
    type: 'responseData', tabId: 't2',
    requestMethod: 'POST', requestUrl: 'https://api.test/graphql',
    requestHeaders: { 'Content-Type': 'application/json' },
    requestBody: '{"query":"{ user { id } }"}',
    response: { status: 200, statusText: 'OK', headers: {}, body: '{"data":{}}', size: 11, time: 30 },
  });
  assert.equal(rows[0].module, 'GraphQL');
  assert.equal(rows[0].event_type, 'graphql.send');
  const m = meta();
  assert.equal(m.protocol, 'graphql');
  assert.equal(m.operation.operationName, 'GetUser', 'GraphQL operation name was not recovered from the query');
  assert.equal(m.operation.operationType, 'query');
  // The handler's body wins over the tab's raw query: it is the resolved
  // document plus the variables, which is what actually went out.
  assert.ok(m.request.body.includes('"query"'), 'the sent body was replaced by the raw tab query');
});

check('an anonymous GraphQL document is labelled, not dropped', () => {
  noteProtocolSend({ type: 'executeGraphQL', tabId: 't2b', endpoint: 'e', query: '{ me { id } }\nmutation { noop }' });
  auditProtocolResponse({ type: 'responseData', tabId: 't2b', response: { status: 200, statusText: 'OK' } });
  assert.equal(meta().operation.operationName, '(anonymous)');
});

check('SOAP, whose headers are a list not a map', () => {
  noteProtocolSend({
    type: 'soap:invoke', tabId: 't3', endpoint: 'https://api.test/soap',
    soapAction: 'GetQuote', soapOperation: 'GetQuote', soapVersion: '1.1',
    envelope: '<soap:Envelope/>',
    headers: [{ key: 'X-Trace', value: 'abc' }],
  });
  auditProtocolResponse({
    type: 'soap:response', tabId: 't3',
    requestMethod: 'POST', requestUrl: 'https://api.test/soap',
    // What the executor really put on the wire, not what the tab asked for.
    requestHeaders: { SOAPAction: '"GetQuote"', 'Content-Type': 'text/xml;charset=UTF-8', 'X-Trace': 'abc' },
    requestBody: '<soap:Envelope/>',
    proxy: { used: true, description: 'http://proxy:8080' },
    response: { status: 200, statusText: 'OK', headers: [{ key: 'content-type', value: 'text/xml' }], body: '<r/>', size: 4, time: 55 },
  });
  assert.equal(rows[0].module, 'SOAP');
  const m = meta();
  assert.equal(m.request.headers.SOAPAction, '"GetQuote"', 'the headers actually sent were not recorded');
  assert.equal(m.request.headers['Content-Type'], 'text/xml;charset=UTF-8');
  assert.equal(m.response.headers['content-type'], 'text/xml', 'list-shaped response headers were not converted');
  assert.equal(m.operation.soapAction, 'GetQuote');
  assert.equal(m.request.body, '<soap:Envelope/>');
  assert.equal(m.routing.proxied, true, 'SOAP routing was not recorded');
});

check('SOAP falls back to the tab headers when the executor reports none', () => {
  noteProtocolSend({ type: 'soap:invoke', tabId: 't3b', endpoint: 'e', envelope: '<e/>',
                     headers: [{ key: 'X-Trace', value: 'abc' }] });
  auditProtocolResponse({ type: 'soap:response', tabId: 't3b', response: { status: 0, statusText: 'boom', headers: [] } });
  assert.equal(meta().request.headers['X-Trace'], 'abc');
});

check('gRPC', () => {
  noteProtocolSend({
    type: 'grpc:invoke', tabId: 't4', endpoint: 'localhost:50051',
    method: 'greet.Greeter/SayHello', rpcType: 'unary', tls: false,
    message: '{"name":"ada"}',
    metadata: [{ key: 'x-api-key', value: 'secret' }],
  });
  auditProtocolResponse({
    type: 'grpc:response', tabId: 't4',
    response: { status: 0, statusText: 'OK', headers: { 'grpc-status': '0' }, body: '{"msg":"hi"}', size: 12, time: 18 },
  });
  assert.equal(rows[0].module, 'gRPC');
  const m = meta();
  assert.equal(m.operation.method, 'greet.Greeter/SayHello');
  assert.equal(m.operation.rpcType, 'unary');
  assert.equal(m.request.url, 'localhost:50051');
  assert.equal(m.request.body, '{"name":"ada"}');
  assert.equal(m.request.headers['x-api-key'], 'secret', 'gRPC metadata was not recorded as headers');
  // `method` on a gRPC payload is the RPC name; recording it as the HTTP verb
  // would put "greet.Greeter/SayHello" in the method column.
  assert.equal(m.request.method, 'RPC', `HTTP method column read the RPC name: ${m.request.method}`);
  assert.equal(m.routing.proxied, false);
  assert.match(m.routing.warning ?? '', /HTTP\/2|proxy/i, 'gRPC did not explain why it is unproxied');
});

console.log('\ncorrelation');

check('an error path is audited too — that is the point of hooking the post', () => {
  noteProtocolSend({ type: 'soap:invoke', tabId: 't5', endpoint: '' });
  auditProtocolResponse({
    type: 'soap:response', tabId: 't5',
    response: { status: 0, statusText: 'Endpoint is required', headers: [], body: '<fault/>', size: 8, time: 0 },
  });
  assert.equal(rows.length, 1, 'the failure path produced no audit row');
  assert.equal(meta().response.statusText, 'Endpoint is required');
});

check('one row per send, not one per message', () => {
  noteProtocolSend({ type: 'executeRequest', tabId: 't6', method: 'GET', url: 'u' });
  const res = { type: 'responseData', tabId: 't6', response: { status: 200, statusText: 'OK' } };
  auditProtocolResponse(res);
  auditProtocolResponse(res);   // a stream frame or a re-post must not duplicate
  assert.equal(rows.length, 1);
});

check('a response with no matching send is ignored', () => {
  auditProtocolResponse({ type: 'responseData', tabId: 'unknown', response: { status: 200, statusText: 'OK' } });
  assert.equal(rows.length, 0);
});

check('unrelated outbound messages are ignored', () => {
  noteProtocolSend({ type: 'executeRequest', tabId: 't7', method: 'GET', url: 'u' });
  auditProtocolResponse({ type: 'requestProgress', tabId: 't7', stage: 'pre-request-script' });
  auditProtocolResponse({ type: 'toast', message: 'hi' });
  assert.equal(rows.length, 0, 'a progress message was mistaken for a response');
});

check('respects the per-event audit toggle', () => {
  noteProtocolSend({ type: 'executeRequest', tabId: 't8', method: 'GET', url: 'u', auditEnabled: false });
  auditProtocolResponse({ type: 'responseData', tabId: 't8', response: { status: 200, statusText: 'OK' } });
  assert.equal(rows.length, 0, 'a disabled event was still audited');
});

check('concurrent tabs do not cross over', () => {
  noteProtocolSend({ type: 'executeRequest', tabId: 'a', method: 'GET', url: 'https://a.test' });
  noteProtocolSend({ type: 'grpc:invoke', tabId: 'b', endpoint: 'localhost:1', grpcMethod: 'S/M' });
  auditProtocolResponse({ type: 'grpc:response', tabId: 'b', response: { status: 0, statusText: 'OK' } });
  auditProtocolResponse({ type: 'responseData', tabId: 'a', requestUrl: 'https://a.test', response: { status: 200, statusText: 'OK' } });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].module, 'gRPC');
  assert.equal(rows[1].module, 'REST');
  assert.equal(JSON.parse(rows[1].metadata).request.url, 'https://a.test');
});

check('a send whose response never arrives does not leak', () => {
  for (let i = 0; i < 500; i++) {
    noteProtocolSend({ type: 'executeRequest', tabId: `leak-${i}`, method: 'GET', url: 'u' });
  }
  // The map is swept, so an abandoned send cannot accumulate without bound.
  auditProtocolResponse({ type: 'responseData', tabId: 'leak-499', response: { status: 200, statusText: 'OK' } });
  assert.equal(rows.length, 1, 'the most recent send should still pair');
});

rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? '\nProtocol auditing holds.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
