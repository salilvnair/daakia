/**
 * Proxy routing tests, against a real proxy.
 *
 * The proxy setting was broken in the quietest possible way: the settings
 * dialog wrote to webview localStorage and posted a `proxy:configure` message
 * that nothing in the extension host listened for, while the request executor
 * read `settings.proxy` — which the dialog never wrote. Saving a proxy did
 * nothing, and nothing on screen said so.
 *
 * Asserting on config objects would not have caught that, and would not catch
 * it coming back. So this stands up an actual HTTP proxy and an actual origin
 * server and checks whether the bytes went through the proxy: the proxy counts
 * its own hits, and the origin reports a header only the proxy adds.
 *
 * Run: node src/test/fixtures/proxy/proxy.test.mjs
 */
import { strict as assert } from 'assert';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import http from 'http';

// The executor and the resolver are free of the VS Code API, so they bundle and
// run standalone — no extension host needed to prove routing works.
//
// esbuild is driven through its JS API rather than its CLI: spawning the .cmd
// shim fails with EINVAL on Windows, and the API needs no shell either way.
// The entry references the sources by ABSOLUTE path, since it is written into a
// temp directory where a relative import would resolve to nothing.
const dir = mkdtempSync(join(tmpdir(), 'daakia-proxy-'));
const entry = join(dir, 'entry.ts');
const bundle = join(dir, 'bundle.cjs');
// JSON.stringify gives a correctly quoted and backslash-escaped literal, which
// is what a Windows absolute path needs inside a TypeScript import.
const abs = (p) => JSON.stringify(resolve(p));
writeFileSync(entry, [
  `export { executeRequest } from ${abs('src/http/request-executor.ts')};`,
  `export { executeSoapRequest } from ${abs('src/soap/soap-executor.ts')};`,
  `export * from ${abs('src/services/proxy-config.ts')};`,
].join('\n'));

try {
  const esbuild = await import(pathToFileURL(resolve('node_modules/esbuild/lib/main.js')).href);
  await esbuild.build({
    entryPoints: [entry], bundle: true, platform: 'node',
    format: 'cjs', outfile: bundle, logLevel: 'error',
  });
} catch (err) {
  console.error('Could not bundle the executor for testing:', err.message);
  process.exit(2);
}

const require = createRequire(import.meta.url);
const { executeRequest, executeSoapRequest, normalizeProxyConfig, resolveProxy, isBypassed } = require(bundle);

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (err) { failures++; console.error(`  FAIL  ${name}\n        ${err.message}`); }
};

// ── Real servers ─────────────────────────────────────────────────────────────
const origin = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  // Only the proxy sets this header, so the origin can testify to the route.
  res.end(JSON.stringify({ viaProxy: req.headers['x-through-proxy'] === 'yes' }));
});
await new Promise(r => origin.listen(0, '127.0.0.1', r));
const originPort = origin.address().port;

let proxyHits = 0;
const proxy = http.createServer((req, res) => {
  proxyHits++;
  const target = new URL(req.url);
  const upstream = http.request(
    {
      host: target.hostname, port: target.port, path: target.pathname,
      method: req.method, headers: { ...req.headers, 'x-through-proxy': 'yes' },
    },
    (up) => { res.writeHead(up.statusCode, up.headers); up.pipe(res); },
  );
  upstream.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(upstream);
});
await new Promise(r => proxy.listen(0, '127.0.0.1', r));
const proxyPort = proxy.address().port;

const send = async (label, uiConfig) => {
  proxyHits = 0;
  const result = await executeRequest({
    tabId: label, method: 'GET', url: `http://127.0.0.1:${originPort}/resource`,
    headers: [], params: [], bodyMode: 'none',
    proxy: normalizeProxyConfig(uiConfig),
  });
  return { result, hits: proxyHits, body: JSON.parse(result.response.body) };
};

const manual = (extra = {}) => ({ enabled: true, type: 'http', host: '127.0.0.1', port: proxyPort, noProxy: '', ...extra });

console.log('routing (verified against a real proxy process)');

// Sequential, because proxyHits is shared state.
{
  const off = await send('off', { enabled: false, type: 'http', host: '', port: 0 });
  check('goes direct when no proxy is configured', () => {
    assert.equal(off.hits, 0);
    assert.equal(off.body.viaProxy, false);
    assert.equal(off.result.proxy.used, false);
  });

  const on = await send('on', manual());
  check('actually routes through the proxy when enabled', () => {
    assert.equal(on.hits, 1, 'the proxy was never contacted');
    assert.equal(on.body.viaProxy, true, 'the origin did not see the proxy');
    assert.equal(on.result.proxy.used, true);
    assert.match(on.result.proxy.description, /127\.0\.0\.1/);
  });

  const bypassed = await send('bypass', manual({ noProxy: '127.0.0.1' }));
  check('honours the bypass list', () => {
    assert.equal(bypassed.hits, 0, 'bypassed host still went through the proxy');
    assert.equal(bypassed.result.proxy.used, false);
    assert.match(bypassed.result.proxy.description, /bypass/);
  });

  const socks = await send('socks', manual({ type: 'socks5' }));
  check('says so rather than silently ignoring SOCKS5', () => {
    assert.equal(socks.result.proxy.used, false);
    assert.match(socks.result.proxy.warning ?? '', /SOCKS5/);
  });

  const noHost = await send('nohost', { enabled: true, type: 'http', host: '', port: 8080 });
  check('warns when the proxy is enabled but has no host', () => {
    assert.equal(noHost.result.proxy.used, false);
    assert.match(noHost.result.proxy.warning ?? '', /no host/);
  });

  check('every result carries a route for the log and the audit trail', () => {
    for (const r of [off, on, bypassed, socks, noHost]) {
      assert.ok(r.result.proxy?.description, 'a result had no route description');
    }
  });
}

// ── SOAP ─────────────────────────────────────────────────────────────────────
// SOAP posts through the raw http module rather than axios, so it does not
// inherit REST's proxy handling and needed its own proof. It had none, and
// silently ignored the proxy setting entirely.
console.log('\nSOAP (its own transport, so proxied separately)');
{
  const soap = async (label, uiConfig) => {
    proxyHits = 0;
    const url = `http://127.0.0.1:${originPort}/soap`;
    const result = await executeSoapRequest({
      tabId: label, endpoint: url, soapVersion: '1.1', soapAction: 'GetQuote',
      envelope: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body/></soap:Envelope>',
      headers: [], timeout: 5000,
      proxy: resolveProxy(normalizeProxyConfig(uiConfig), url),
    });
    return { result, hits: proxyHits, body: JSON.parse(result.body) };
  };

  const direct = await soap('soap-direct', { enabled: false, type: 'http', host: '', port: 0 });
  check('SOAP goes direct when no proxy is set', () => {
    assert.equal(direct.hits, 0);
    assert.equal(direct.body.viaProxy, false);
  });

  const viaProxy = await soap('soap-proxy', manual());
  check('SOAP actually routes through the proxy', () => {
    assert.equal(viaProxy.hits, 1, 'SOAP ignored the proxy setting');
    assert.equal(viaProxy.body.viaProxy, true, 'the origin did not see SOAP arrive via the proxy');
  });

  const bypass = await soap('soap-bypass', manual({ noProxy: '127.0.0.1' }));
  check('SOAP honours the bypass list', () => {
    assert.equal(bypass.hits, 0, 'a bypassed host still went through the proxy');
  });

  check('SOAP reports the headers it actually sent, not just the typed ones', () => {
    // The executor builds SOAPAction, Content-Type and Content-Length itself;
    // an audit log that omits them cannot answer why a server rejected a call.
    const h = viaProxy.result.requestHeaders ?? {};
    assert.equal(h.SOAPAction, '"GetQuote"');
    assert.match(h['Content-Type'] ?? '', /text\/xml/);
    assert.ok(h['Content-Length'], 'Content-Length was not reported');
  });
}

// ── CONNECT tunnelling ───────────────────────────────────────────────────────
// An HTTPS target cannot be handed to a proxy in the clear — it needs a CONNECT
// tunnel, which is a different code path from proxied plain HTTP and the one
// most likely to be wrong. It is exercised here against a real TLS origin.
//
// The certificate is self-signed, so this call passes rejectUnauthorized:false
// explicitly — the same thing the SSL verification setting does.
console.log('\nHTTPS through the proxy (CONNECT tunnel)');
{
  let cert;
  try {
    const { execFileSync } = await import('child_process');
    const keyPath = join(dir, 'k.pem'), certPath = join(dir, 'c.pem');
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-keyout', keyPath, '-out', certPath,
      '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
    ], { stdio: 'ignore' });
    const { readFileSync } = await import('fs');
    cert = { key: readFileSync(keyPath), cert: readFileSync(certPath) };
  } catch (err) {
    console.log(`  SKIP  no certificate could be generated (${err.message.split('\n')[0]})`);
  }

  if (cert) {
    const tls = await import('tls');
    const net = await import('net');

    const tlsOrigin = tls.createServer(cert, (socket) => {
      socket.on('data', () => {
        const body = JSON.stringify({ secure: true });
        socket.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body}`);
      });
    });
    await new Promise(r => tlsOrigin.listen(0, '127.0.0.1', r));
    const tlsPort = tlsOrigin.address().port;

    // A CONNECT proxy: it splices two sockets and never sees the plaintext.
    let connects = 0;
    let lastTarget = '';
    const connectProxy = http.createServer();
    connectProxy.on('connect', (req, clientSocket, head) => {
      connects++;
      lastTarget = req.url;
      const [host, port] = req.url.split(':');
      const upstream = net.connect(Number(port), host, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head?.length) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      upstream.on('error', () => clientSocket.destroy());
      clientSocket.on('error', () => upstream.destroy());
    });
    await new Promise(r => connectProxy.listen(0, '127.0.0.1', r));
    const connectPort = connectProxy.address().port;

    let tunnelled, tunnelErr;
    try {
      const url = `https://127.0.0.1:${tlsPort}/soap`;
      tunnelled = await executeSoapRequest({
        tabId: 'soap-tls', endpoint: url, soapVersion: '1.1', soapAction: 'X',
        envelope: '<e/>', headers: [], timeout: 5000,
        rejectUnauthorized: false,
        proxy: resolveProxy(
          normalizeProxyConfig({ enabled: true, type: 'http', host: '127.0.0.1', port: connectPort, noProxy: '' }),
          url,
        ),
      });
    } catch (err) {
      tunnelErr = err;
    }

    check('an HTTPS SOAP call opens a CONNECT tunnel through the proxy', () => {
      assert.ifError(tunnelErr);
      assert.equal(connects, 1, 'the proxy was never asked to open a tunnel');
      assert.equal(lastTarget, `127.0.0.1:${tlsPort}`, `the tunnel targeted ${lastTarget}`);
      assert.equal(tunnelled.status, 200);
      assert.deepEqual(JSON.parse(tunnelled.body), { secure: true });
    });

    // Verification is the default, and it has to actually bite: a test that
    // only ever runs with checking disabled would pass against an executor
    // that never verifies anything.
    let rejected;
    try {
      const url = `https://127.0.0.1:${tlsPort}/soap`;
      await executeSoapRequest({
        tabId: 'soap-tls-verify', endpoint: url, soapVersion: '1.1', soapAction: 'X',
        envelope: '<e/>', headers: [], timeout: 5000,
        rejectUnauthorized: true,
      });
    } catch (err) {
      rejected = err;
    }
    check('a self-signed certificate is rejected when verification is on', () => {
      assert.ok(rejected, 'the self-signed certificate was accepted');
      assert.match(String(rejected.message), /self.signed|SELF_SIGNED|certificate/i);
    });

    let accepted, acceptErr;
    try {
      const url = `https://127.0.0.1:${tlsPort}/soap`;
      accepted = await executeSoapRequest({
        tabId: 'soap-tls-off', endpoint: url, soapVersion: '1.1', soapAction: 'X',
        envelope: '<e/>', headers: [], timeout: 5000,
        rejectUnauthorized: false,
      });
    } catch (err) { acceptErr = err; }
    check('turning SSL verification off actually reaches the server', () => {
      // This is the setting that did nothing for SOAP before.
      assert.ifError(acceptErr);
      assert.equal(accepted.status, 200);
    });

    tlsOrigin.close();
    connectProxy.close();
  }
}

console.log('\nconfiguration');
check('translates the dialog shape into the stored shape', () => {
  const c = normalizeProxyConfig({ enabled: true, type: 'https', host: 'p.example', port: '3128', noProxy: 'a, .b, *.c' });
  assert.equal(c.mode, 'manual');
  assert.equal(c.port, 3128, 'a string port must become a number');
  assert.deepEqual(c.bypass, ['a', '.b', '*.c']);
});
check('enabled with no host stays manual so the user is warned', () => {
  // Downgrading this to 'none' would report "no proxy configured" at someone
  // who configured one and mistyped the host.
  assert.equal(normalizeProxyConfig({ enabled: true, type: 'http', host: '', port: 1 }).mode, 'manual');
});
check('disabled is none regardless of host', () => {
  assert.equal(normalizeProxyConfig({ enabled: false, type: 'http', host: 'p.example', port: 1 }).mode, 'none');
});
check('bypass matches exact hosts, leading dots and wildcards', () => {
  assert.equal(isBypassed('api.internal', ['.internal']), true);
  assert.equal(isBypassed('api.internal', ['*.internal']), true);
  assert.equal(isBypassed('internal', ['.internal']), true);
  assert.equal(isBypassed('api.external', ['.internal']), false);
  assert.equal(isBypassed('anything', ['*']), true);
});
check('system mode reports honestly when no env proxy is set', () => {
  const saved = { ...process.env };
  delete process.env.HTTP_PROXY; delete process.env.http_proxy;
  delete process.env.HTTPS_PROXY; delete process.env.https_proxy;
  const r = resolveProxy({ mode: 'system', type: 'http', host: '', port: 0, bypass: [] }, 'https://x.test/');
  assert.equal(r.used, false);
  assert.match(r.warning ?? '', /no HTTP_PROXY/);
  Object.assign(process.env, saved);
});

origin.close();
proxy.close();
rmSync(dir, { recursive: true, force: true });

console.log(failures === 0 ? '\nProxy routing holds.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
