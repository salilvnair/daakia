#!/usr/bin/env node
/**
 * daakia-run — CI collection runner (newman-style) for Daakia exports.
 *
 * Usage:
 *   node cli/daakia-run.mjs <collection.daakia.json> [options]
 *
 * Options:
 *   --env <file>        Environment file: {"key":"value"} map, or Daakia env export
 *   --env-var k=v       Override one variable; repeatable, wins over --env
 *   --folder <name>     Only run requests under the folder of that name
 *   --filter <text>     Only run requests whose name contains <text>
 *   --data <file>       CSV or JSON rows — one iteration of the run per row
 *   --iterations <n>    Run the collection n times (ignored when --data is given)
 *   --delay <ms>        Wait between requests
 *   --timeout <ms>      Per-request timeout (default 30000)
 *   --bail              Stop on first failure
 *   --insecure          Ignore TLS certificate errors
 *   --json              Emit machine-readable JSON report to stdout
 *   --junit <file>      Write a JUnit XML report — what CI actually renders
 *
 * Accepts Daakia JSON ({version, collections:[...]}) and Postman v2.1 collections.
 * Exit code: 0 = all passed, 1 = failures or runner error.
 */
import { readFileSync, writeFileSync } from 'fs';
import { toJUnitXml } from './lib/junit.mjs';
import { parseDataFile, parseEnvVar, inFolder } from './lib/data.mjs';

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('Usage: node cli/daakia-run.mjs <collection.json> [--env env.json] [--env-var k=v]'
    + ' [--folder name] [--filter text] [--data rows.csv] [--iterations n] [--delay ms]'
    + ' [--timeout ms] [--bail] [--insecure] [--json] [--junit report.xml]');
  process.exit(args.length === 0 ? 1 : 0);
}

const opt = {
  file: args[0], env: null, envVars: [], folder: null, filter: null,
  data: null, iterations: 1, delay: 0,
  timeout: 30000, bail: false, insecure: false, json: false, junit: null,
};
for (let i = 1; i < args.length; i++) {
  switch (args[i]) {
    case '--env': opt.env = args[++i]; break;
    case '--env-var': opt.envVars.push(args[++i]); break;
    case '--folder': opt.folder = args[++i]; break;
    case '--filter': opt.filter = args[++i]; break;
    case '--data': opt.data = args[++i]; break;
    case '--iterations': opt.iterations = Math.max(1, Number(args[++i]) || 1); break;
    case '--delay': opt.delay = Math.max(0, Number(args[++i]) || 0); break;
    case '--timeout': opt.timeout = Number(args[++i]) || 30000; break;
    case '--bail': opt.bail = true; break;
    case '--insecure': opt.insecure = true; break;
    case '--json': opt.json = true; break;
    case '--junit': opt.junit = args[++i]; break;
    default: console.error(`Unknown option: ${args[i]}`); process.exit(1);
  }
}
if (opt.insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ── Environment variables ──
let vars = {};
if (opt.env) {
  const raw = JSON.parse(readFileSync(opt.env, 'utf8'));
  if (Array.isArray(raw)) {
    for (const v of raw) if (v.key) vars[v.key] = v.currentValue ?? v.initialValue ?? v.value ?? '';
  } else if (raw.variables) {
    for (const v of raw.variables) if (v.key) vars[v.key] = v.currentValue ?? v.initialValue ?? v.value ?? '';
  } else {
    vars = raw;
  }
}
/*
  `--env-var` last, so a CI secret beats whatever the committed env file says.
  That order is the point of the flag: the same collection runs against three
  environments by overriding two values at the call site.
*/
for (const pair of opt.envVars) {
  const parsed = parseEnvVar(pair);
  if (!parsed) { console.error(`--env-var expects key=value, got: ${pair}`); process.exit(1); }
  vars[parsed.key] = parsed.value;
}

/*
  The data row is a layer above both, rebound per iteration. `rowVars` is
  reassigned by the loop below rather than merged into `vars`, so row three's
  values cannot leak into row four when a column is missing.
*/
let rowVars = {};
const resolve = (s) => typeof s === 'string'
  ? s.replace(/\{\{([\w.\-]+)\}\}|\$\{([\w.\-]+)\}/g, (m, a, b) => {
      const key = a || b;
      return rowVars[key] ?? vars[key] ?? m;
    })
  : s;

// ── Collect requests from Daakia or Postman format ──
const doc = JSON.parse(readFileSync(opt.file, 'utf8'));
const requests = [];

function walkDaakia(node, prefix) {
  const path = prefix ? `${prefix} / ${node.name}` : node.name;
  for (const req of node.requests ?? []) {
    let data = {};
    try { data = typeof req.data === 'string' ? JSON.parse(req.data || '{}') : (req.data ?? {}); } catch { /* ignore */ }
    requests.push({ name: `${path} / ${req.name}`, method: req.method || 'GET', url: req.url || data.url || '', data });
  }
  for (const child of node.children ?? []) walkDaakia(child, path);
}
function walkPostman(item, prefix) {
  const path = prefix ? `${prefix} / ${item.name}` : item.name;
  if (item.request) {
    const r = item.request;
    const url = typeof r.url === 'string' ? r.url : r.url?.raw ?? '';
    const headers = (r.header ?? []).filter(h => !h.disabled).map(h => ({ key: h.key, value: h.value, enabled: true }));
    const body = r.body?.mode === 'raw' ? { bodyType: 'raw', body: r.body.raw } : {};
    requests.push({ name: path, method: r.method || 'GET', url, data: { headers, ...body } });
  }
  for (const child of item.item ?? []) walkPostman(child, path);
}

if (Array.isArray(doc.collections)) {
  for (const node of doc.collections) walkDaakia(node, '');
} else if (doc.info && Array.isArray(doc.item)) {
  for (const item of doc.item) walkPostman(item, doc.info.name ?? '');
} else {
  console.error('Unrecognized collection format — expected Daakia export ({version, collections}) or Postman v2.1.');
  process.exit(1);
}

let toRun = requests;
if (opt.folder) toRun = toRun.filter(r => inFolder(r.name, opt.folder));
if (opt.filter) toRun = toRun.filter(r => r.name.toLowerCase().includes(opt.filter.toLowerCase()));
if (toRun.length === 0) {
  const why = [opt.folder && `folder "${opt.folder}"`, opt.filter && `filter "${opt.filter}"`]
    .filter(Boolean).join(' and ');
  console.error(why ? `No requests match ${why}.` : 'Collection contains no requests.');
  process.exit(1);
}

// ── Iterations: one run of the collection per data row ──
let dataRows = [];
if (opt.data) {
  try {
    dataRows = parseDataFile(readFileSync(opt.data, 'utf8'), opt.data);
  } catch (e) {
    console.error(`Could not read --data ${opt.data}: ${e.message}`);
    process.exit(1);
  }
  if (dataRows.length === 0) {
    console.error(`--data ${opt.data} has no rows.`);
    process.exit(1);
  }
}
// A data file sets the count; --iterations only applies without one, so the
// two can never disagree about how many times the collection ran.
const iterations = dataRows.length > 0 ? dataRows.length : opt.iterations;

// ── Build and execute ──
function buildRequest(entry) {
  const d = entry.data ?? {};
  let url = resolve(entry.url);
  const params = (d.params ?? []).filter(p => p.enabled !== false && p.key);
  if (params.length) {
    const qs = params.map(p => `${encodeURIComponent(resolve(p.key))}=${encodeURIComponent(resolve(p.value ?? ''))}`).join('&');
    url += (url.includes('?') ? '&' : '?') + qs;
  }
  const headers = {};
  for (const h of d.headers ?? []) {
    if (h.enabled !== false && h.key) headers[resolve(h.key)] = resolve(h.value ?? '');
  }
  // Auth
  const auth = d.auth ?? {};
  const authType = auth.type ?? d.authType;
  const authData = auth.data ?? d.authData ?? auth;
  if (authType === 'bearer' && (authData.token || authData.bearerToken)) {
    headers['Authorization'] = `Bearer ${resolve(authData.token || authData.bearerToken)}`;
  } else if (authType === 'basic' && (authData.username || authData.password)) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${resolve(authData.username ?? '')}:${resolve(authData.password ?? '')}`).toString('base64');
  } else if (authType === 'apikey' && authData.key) {
    if ((authData.addTo ?? 'header') === 'header') headers[resolve(authData.key)] = resolve(authData.value ?? '');
    else url += (url.includes('?') ? '&' : '?') + `${encodeURIComponent(resolve(authData.key))}=${encodeURIComponent(resolve(authData.value ?? ''))}`;
  }
  // Body
  let body;
  const method = entry.method.toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) {
    const bodyType = d.bodyType ?? d.body?.mode;
    if ((bodyType === 'raw' || bodyType === 'json' || !bodyType) && typeof d.body === 'string' && d.body) {
      body = resolve(d.body);
      if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json';
    } else if (bodyType === 'urlencoded' && Array.isArray(d.formData ?? d.urlencoded)) {
      const rows = (d.formData ?? d.urlencoded).filter(r => r.enabled !== false && r.key);
      body = rows.map(r => `${encodeURIComponent(resolve(r.key))}=${encodeURIComponent(resolve(r.value ?? ''))}`).join('&');
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }
  return { url, method, headers, body };
}

const results = [];
let failures = 0;
let stopped = false;

for (let iteration = 0; iteration < iterations && !stopped; iteration++) {
  rowVars = dataRows[iteration] ?? {};
  if (iterations > 1 && !opt.json) {
    const label = dataRows.length > 0
      ? `iteration ${iteration + 1}/${iterations} — ${Object.entries(rowVars).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(' ')}`
      : `iteration ${iteration + 1}/${iterations}`;
    console.log(`
── ${label}`);
  }
  for (const entry of toRun) {
    const { url, method, headers, body } = buildRequest(entry);
    const started = Date.now();
    let status = 0, statusText = '', error = null, size = 0;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opt.timeout);
      const res = await fetch(url, { method, headers, body, signal: ctrl.signal, redirect: 'follow' });
      clearTimeout(timer);
      status = res.status;
      statusText = res.statusText;
      const buf = await res.arrayBuffer();
      size = buf.byteLength;
    } catch (e) {
      error = e.name === 'AbortError' ? `timeout after ${opt.timeout}ms` : (e.cause?.code ?? e.message);
    }
    const ms = Date.now() - started;
    const passed = !error && status > 0 && status < 400;
    if (!passed) failures++;
    results.push({ name: entry.name, method, url, status, statusText, ms, size, passed, error, iteration });

    if (!opt.json) {
      const mark = passed ? '✓' : '✗';
      const detail = error ? `ERROR ${error}` : `${status} ${statusText}`;
      console.log(`${mark} ${method.padEnd(6)} ${entry.name}  →  ${detail}  (${ms}ms, ${size}B)`);
    }
    if (!passed && opt.bail) { stopped = true; break; }
    if (opt.delay > 0) await new Promise(r => setTimeout(r, opt.delay));
  }
}

// ── Reports ──
/*
  JUnit before anything else, and before the exit code decides anything: a
  report that only exists when the run passed is a report CI cannot use.
*/
if (opt.junit) {
  const name = doc.info?.name ?? doc.collections?.[0]?.name ?? 'daakia';
  try {
    writeFileSync(opt.junit, toJUnitXml(results, { name }), 'utf8');
    if (!opt.json) console.log(`
JUnit report → ${opt.junit}`);
  } catch (e) {
    console.error(`Could not write --junit ${opt.junit}: ${e.message}`);
  }
}

// ── Summary ──
if (opt.json) {
  console.log(JSON.stringify({
    total: results.length, passed: results.length - failures, failed: failures,
    iterations, results,
  }, null, 2));
} else {
  const passedCount = results.length - failures;
  console.log('\n──────────────────────────────────');
  console.log(`  Requests: ${results.length}   Passed: ${passedCount}   Failed: ${failures}`);
  if (iterations > 1) console.log(`  Iterations: ${iterations}`);
  console.log(`  Total time: ${results.reduce((a, r) => a + r.ms, 0)}ms`);
  console.log('──────────────────────────────────');
  if (failures > 0) {
    console.log('\nFailed:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  ✗ ${r.name} — ${r.error ?? `${r.status} ${r.statusText}`}`);
    }
  }
}
/*
  The exit code, without killing the process to deliver it.

  `process.exit()` here aborted the whole run on Windows with a libuv
  assertion — "!(handle->flags & UV_HANDLE_CLOSING)" — the moment more than
  one request had been sent, because fetch's connection pool still held
  sockets it was in the middle of closing. The process died with code 127 on
  a run where every request passed, which in CI is indistinguishable from the
  runner being broken.

  Setting `exitCode` and closing the pool lets the loop drain and node exit on
  its own, with the code the results earned.
*/
process.exitCode = failures > 0 ? 1 : 0;
const dispatcher = globalThis[Symbol.for('undici.globalDispatcher.1')];
if (dispatcher && typeof dispatcher.close === 'function') {
  try { await dispatcher.close(); } catch { /* already gone — nothing to close */ }
}
