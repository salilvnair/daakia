#!/usr/bin/env node
/**
 * daakia-run — CI collection runner (newman-style) for Daakia exports.
 *
 * Usage:
 *   node cli/daakia-run.mjs <collection.daakia.json> [options]
 *
 * Options:
 *   --env <file>        Environment file: {"key":"value"} map, or Daakia env export
 *   --filter <text>     Only run requests whose name contains <text>
 *   --timeout <ms>      Per-request timeout (default 30000)
 *   --bail              Stop on first failure
 *   --insecure          Ignore TLS certificate errors
 *   --json              Emit machine-readable JSON report to stdout
 *
 * Accepts Daakia JSON ({version, collections:[...]}) and Postman v2.1 collections.
 * Exit code: 0 = all passed, 1 = failures or runner error.
 */
import { readFileSync } from 'fs';

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('Usage: node cli/daakia-run.mjs <collection.json> [--env env.json] [--filter text] [--timeout ms] [--bail] [--insecure] [--json]');
  process.exit(args.length === 0 ? 1 : 0);
}

const opt = { file: args[0], env: null, filter: null, timeout: 30000, bail: false, insecure: false, json: false };
for (let i = 1; i < args.length; i++) {
  switch (args[i]) {
    case '--env': opt.env = args[++i]; break;
    case '--filter': opt.filter = args[++i]; break;
    case '--timeout': opt.timeout = Number(args[++i]) || 30000; break;
    case '--bail': opt.bail = true; break;
    case '--insecure': opt.insecure = true; break;
    case '--json': opt.json = true; break;
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
const resolve = (s) => typeof s === 'string'
  ? s.replace(/\{\{([\w.\-]+)\}\}|\$\{([\w.\-]+)\}/g, (m, a, b) => vars[a || b] ?? m)
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

const toRun = opt.filter ? requests.filter(r => r.name.toLowerCase().includes(opt.filter.toLowerCase())) : requests;
if (toRun.length === 0) {
  console.error(opt.filter ? `No requests match filter "${opt.filter}".` : 'Collection contains no requests.');
  process.exit(1);
}

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
  results.push({ name: entry.name, method, url, status, statusText, ms, size, passed, error });

  if (!opt.json) {
    const mark = passed ? '✓' : '✗';
    const detail = error ? `ERROR ${error}` : `${status} ${statusText}`;
    console.log(`${mark} ${method.padEnd(6)} ${entry.name}  →  ${detail}  (${ms}ms, ${size}B)`);
  }
  if (!passed && opt.bail) break;
}

// ── Summary ──
if (opt.json) {
  console.log(JSON.stringify({ total: results.length, passed: results.length - failures, failed: failures, results }, null, 2));
} else {
  const passedCount = results.length - failures;
  console.log('\n──────────────────────────────────');
  console.log(`  Requests: ${results.length}   Passed: ${passedCount}   Failed: ${failures}`);
  console.log(`  Total time: ${results.reduce((a, r) => a + r.ms, 0)}ms`);
  console.log('──────────────────────────────────');
  if (failures > 0) {
    console.log('\nFailed:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  ✗ ${r.name} — ${r.error ?? `${r.status} ${r.statusText}`}`);
    }
  }
}
process.exit(failures > 0 ? 1 : 0);
