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
const { executeRequest, normalizeProxyConfig, resolveProxy, isBypassed } = require(bundle);

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
