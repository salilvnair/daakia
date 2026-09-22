/**
 * A manual proxy, inside real VS Code.
 *
 * The report: a request with Settings → Proxy → Manual (an office proxy on
 * 8080) failed with the firewall's "proxy required", while `curl -x` through
 * the same proxy worked. Outside VS Code the request path is right — axios
 * opens a CONNECT tunnel for an HTTPS target, as curl does. Inside, VS Code
 * patches Node's http/https for extensions (`http.proxySupport`, default
 * "override") and can replace the agent a request brought with it.
 *
 * So this runs in the Extension Development Host, against a local CONNECT
 * proxy, for a hostname that only resolves through that proxy: a request that
 * really went through it gets a 200; one that went direct fails DNS.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import { execFileSync } from 'child_process';
import type { AddressInfo } from 'net';

type Msg = { type: string; [k: string]: unknown };
interface PanelInternals {
  postMessage: (msg: unknown) => void;
  _handleMessage: (msg: Msg) => void;
}

const TARGET = 'daakia-proxy-test.invalid';

suite('Proxy — a manual proxy is honoured inside VS Code', () => {
  const forwarded: string[] = [];
  let panel: PanelInternals;
  let original: (msg: unknown) => void;
  const seen: Msg[] = [];
  const connects: string[] = [];
  let tmp: string;
  let origin: https.Server;
  let proxy: http.Server;
  let proxyPort = 0;

  suiteSetup(async function () {
    this.timeout(60_000);
    const ext = vscode.extensions.getExtension('salilvnair.daakia');
    if (!ext) throw new Error('extension not found');
    const exports = ext.isActive ? ext.exports : await ext.activate();
    const MainPanel = exports.MainPanel as { currentPanel?: unknown };
    if (!MainPanel.currentPanel) await vscode.commands.executeCommand('daakia.openPanel');
    for (let i = 0; i < 40 && !MainPanel.currentPanel; i++) await new Promise(r => setTimeout(r, 250));
    if (!MainPanel.currentPanel) throw new Error('MainPanel.currentPanel never became available');
    await new Promise(r => setTimeout(r, 2000));

    panel = MainPanel.currentPanel as PanelInternals;
    original = panel.postMessage.bind(panel);
    panel.postMessage = (msg: unknown) => { seen.push(msg as Msg); original(msg); };

    // The origin: HTTPS with a throwaway certificate for the target name.
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'daakia-proxy-e2e-'));
    const key = path.join(tmp, 'key.pem');
    const cert = path.join(tmp, 'cert.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert,
      '-days', '1', '-subj', `/CN=${TARGET}`], { stdio: 'ignore' });
    origin = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('through-the-proxy');
    });
    await new Promise<void>(r => origin.listen(0, '127.0.0.1', () => r()));
    const originPort = (origin.address() as AddressInfo).port;

    // The office proxy: CONNECT is the only way through, like the real one.
    /* Plain HTTP arrives in forward-proxy form, with the absolute URL as the
       request target — answered here, as a real proxy would pass it on. */
    proxy = http.createServer((req, res) => {
      if (String(req.url).startsWith('http://')) {
        forwarded.push(String(req.url));
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('forwarded-by-the-proxy');
        return;
      }
      res.writeHead(403); res.end('proxy required');
    });
    proxy.on('connect', (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
      connects.push(String(req.url));
      const upstream = net.connect(originPort, '127.0.0.1', () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
      });
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
    });
    await new Promise<void>(r => proxy.listen(0, '127.0.0.1', () => r()));
    proxyPort = (proxy.address() as AddressInfo).port;

    console.log(`[proxy-e2e] http.proxySupport = ${vscode.workspace.getConfiguration('http').get('proxySupport')}`);
  });

  suiteTeardown(() => {
    if (panel) panel._handleMessage({ type: 'saveSettings', settings: { proxy: { mode: 'none', type: 'http', host: '', port: 0, bypass: [] }, sslVerification: true } });
    if (panel && original) panel.postMessage = original;
    proxy?.close();
    origin?.close();
    try { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
  });

  test('an HTTPS request goes through the manual proxy with CONNECT', async function () {
    this.timeout(40_000);
    const tabId = `proxy-e2e-${Date.now()}`;
    const from = seen.length;
    panel._handleMessage({
      type: 'executeRequest',
      tabId,
      protocol: 'rest',
      method: 'GET',
      url: `https://${TARGET}/ping`,
      headers: [],
      params: [],
      bodyMode: 'none',
      settings: {
        sslVerification: false,
        proxy: { mode: 'manual', type: 'http', host: '127.0.0.1', port: proxyPort, bypass: [] },
      },
    });

    let reply: Msg | undefined;
    for (let i = 0; i < 300 && !reply; i++) {
      reply = seen.slice(from).find(m => (m.type === 'responseData' || m.type === 'requestError') && m.tabId === tabId);
      if (!reply) await new Promise(r => setTimeout(r, 100));
    }
    const response = reply?.response as { status?: number; body?: string } | undefined;
    const summary = JSON.stringify({ type: reply?.type, status: response?.status, error: reply?.error ?? reply?.message, connects });
    console.log(`[proxy-e2e] ${summary}`);

    assert.deepStrictEqual(connects, [`${TARGET}:443`], `the proxy never saw a CONNECT — the request did not go through it: ${summary}`);
    assert.strictEqual(reply?.type, 'responseData', summary);
    assert.strictEqual(response?.status, 200, summary);
  });

  /** Send, then wait for the first reply of one of `types` for this tab. */
  async function exchange(msg: Msg, types: string[], tabId: string, timeoutMs = 20_000): Promise<Msg | undefined> {
    const from = seen.length;
    panel._handleMessage(msg);
    for (let waited = 0; waited < timeoutMs; waited += 100) {
      const hit = seen.slice(from).find(m => types.includes(m.type) && m.tabId === tabId);
      if (hit) return hit;
      await new Promise(r => setTimeout(r, 100));
    }
    return undefined;
  }

  /* The rest go through the global proxy, the way Settings → Proxy sets it:
     every protocol that honours Daakia's proxy, each checked at the proxy. */
  suite('with the global proxy set', () => {
    suiteSetup(async () => {
      panel._handleMessage({
        type: 'saveSettings',
        settings: { sslVerification: false, proxy: { mode: 'manual', type: 'http', host: '127.0.0.1', port: proxyPort, bypass: [] } },
      });
      await new Promise(r => setTimeout(r, 300));
    });

    test('REST over HTTPS, inheriting it', async function () {
      this.timeout(30_000);
      const before = connects.length;
      const tabId = `rest-inherit-${Date.now()}`;
      const reply = await exchange({
        type: 'executeRequest', tabId, protocol: 'rest', method: 'GET', url: `https://${TARGET}/inherit`,
        headers: [], params: [], bodyMode: 'none',
      }, ['responseData', 'requestError'], tabId);
      const status = (reply?.response as { status?: number } | undefined)?.status;
      assert.strictEqual(connects.length, before + 1, `no CONNECT: ${JSON.stringify(reply?.response ?? reply)}`);
      assert.strictEqual(status, 200);
    });

    test('REST over plain HTTP, in forward-proxy form', async function () {
      this.timeout(30_000);
      const before = forwarded.length;
      const tabId = `rest-http-${Date.now()}`;
      const reply = await exchange({
        type: 'executeRequest', tabId, protocol: 'rest', method: 'GET', url: `http://${TARGET}/plain`,
        headers: [], params: [], bodyMode: 'none',
      }, ['responseData', 'requestError'], tabId);
      const response = reply?.response as { status?: number; body?: string } | undefined;
      assert.strictEqual(forwarded.length, before + 1, `the proxy never saw it: ${JSON.stringify(response ?? reply)}`);
      assert.strictEqual(response?.status, 200);
      assert.ok(String(response?.body).includes('forwarded-by-the-proxy'));
    });

    test('GraphQL over HTTPS', async function () {
      this.timeout(30_000);
      const before = connects.length;
      const tabId = `gql-${Date.now()}`;
      const reply = await exchange({
        type: 'executeGraphQL', tabId, endpoint: `https://${TARGET}/graphql`, query: '{ ping }', headers: [],
      }, ['responseData', 'requestError'], tabId);
      const status = (reply?.response as { status?: number } | undefined)?.status ?? reply?.status;
      assert.strictEqual(connects.length, before + 1, `no CONNECT: ${JSON.stringify(reply)}`.slice(0, 400));
      assert.strictEqual(status, 200);
    });

    test('GraphQL schema introspection over HTTPS', async function () {
      this.timeout(30_000);
      const before = connects.length;
      const tabId = `gql-connect-${Date.now()}`;
      const reply = await exchange({
        type: 'graphql:connect', tabId, endpoint: `https://${TARGET}/graphql`, headers: [],
      }, ['graphql:connected', 'graphql:connectError'], tabId);
      // The origin is not a GraphQL server, so the schema cannot load — what
      // matters is that the request reached it through the proxy, not DNS.
      assert.strictEqual(connects.length, before + 1, `no CONNECT: ${JSON.stringify(reply)}`);
      assert.ok(!/ENOTFOUND|getaddrinfo/i.test(String(reply?.error)), String(reply?.error));
    });

    test('SOAP over HTTPS', async function () {
      this.timeout(30_000);
      const before = connects.length;
      const tabId = `soap-${Date.now()}`;
      const reply = await exchange({
        type: 'soap:invoke', tabId, endpoint: `https://${TARGET}/soap`, soapVersion: '1.1', soapAction: 'Ping',
        envelope: '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body/></soap:Envelope>',
        headers: [],
      }, ['soap:response'], tabId);
      assert.strictEqual(connects.length, before + 1, `no CONNECT: ${JSON.stringify(reply)}`.slice(0, 400));
      const status = reply?.status ?? (reply?.response as { status?: number } | undefined)?.status;
      assert.strictEqual(status, 200, JSON.stringify(reply).slice(0, 400));
    });

    test('SSE over HTTPS', async function () {
      this.timeout(30_000);
      const before = connects.length;
      const tabId = `sse-${Date.now()}`;
      const reply = await exchange({
        type: 'sse:connect', tabId, url: `https://${TARGET}/events`, headers: [],
      }, ['sse:connected', 'sse:error'], tabId);
      panel._handleMessage({ type: 'sse:disconnect', tabId });
      assert.strictEqual(connects.length, before + 1, `no CONNECT: ${JSON.stringify(reply)}`);
      assert.strictEqual(reply?.type, 'sse:connected', JSON.stringify(reply));
    });
  });
});
