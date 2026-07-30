#!/usr/bin/env node
/**
 * Audits every AI-feature postMsg({ type: ... }) call site in webview-ui against
 * MainPanel.ts's message switch. A "generation trigger" type with zero matching
 * `case` in MainPanel.ts is a dead call — the webview posts, the extension host
 * silently drops it (default: break;), and the UI spinner never resolves.
 *
 * Usage: node scripts/audit-ai-message-contracts.mjs [--json]
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const WEBVIEW_SRC = join(ROOT, 'webview-ui', 'src');
const MAIN_PANEL = join(ROOT, 'src', 'panel', 'main', 'MainPanel.ts');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      walk(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// Matches postMsg({ type: '...', ... }) — allows the object literal's other keys
// to appear before or after `type` and spans newlines (multi-line calls are the norm).
const POSTMSG_TYPE_RE = /postMsg\(\s*\{[^}]{0,40}?type:\s*(['"])([\w:.-]+)\1/gs;

function extractPostedTypes(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const types = [];
  let m;
  while ((m = POSTMSG_TYPE_RE.exec(content))) {
    types.push(m[2]);
  }
  return types;
}

function extractHandledTypes(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const types = new Set();
  const re = /case\s+(['"])([\w:.-]+)\1\s*:/g;
  let m;
  while ((m = re.exec(content))) types.add(m[2]);
  return types;
}

// Message types that are AI-generation triggers (post a request expecting the host
// to call an LLM/tool and reply). Established naming conventions in this codebase:
//   ai:send            — the one real, working path (handleAiSend -> executeAiRequest)
//   ai:discovery:start — wired, but a deterministic HTTP prober, not an LLM call
//   aiChat / aiStream / aiStreamRequest — an apparently-intended second contract that
//     was never implemented host-side (webview listens for aiStream:chunk/done/error
//     events that are never emitted)
const AI_TRIGGER_TYPES = new Set(['ai:send', 'ai:discovery:start', 'aiChat', 'aiStream', 'aiStreamRequest']);

/**
 * Runs the audit and returns structured results. Exported so the e2e regression
 * test (src/test/suite/ai-message-contract.test.ts) can reuse the exact same scan
 * instead of duplicating the extraction logic.
 */
export function runAudit() {
  const files = walk(WEBVIEW_SRC);
  const handled = extractHandledTypes(MAIN_PANEL);

  /** @type {Map<string, Set<string>>} type -> set of relative file paths */
  const byType = new Map();

  for (const file of files) {
    const types = extractPostedTypes(file);
    for (const t of types) {
      if (!AI_TRIGGER_TYPES.has(t)) continue;
      const rel = relative(ROOT, file);
      if (!byType.has(t)) byType.set(t, new Set());
      byType.get(t).add(rel);
    }
  }

  const report = [];
  for (const type of AI_TRIGGER_TYPES) {
    const typeFiles = [...(byType.get(type) ?? [])].sort();
    report.push({
      type,
      handled: handled.has(type),
      fileCount: typeFiles.length,
      files: typeFiles,
    });
  }

  const totalCallSites = report.reduce((n, r) => n + r.fileCount, 0);
  const brokenCallSites = report.filter(r => !r.handled).reduce((n, r) => n + r.fileCount, 0);

  return { report, totalCallSites, brokenCallSites };
}

function main() {
  const { report, totalCallSites, brokenCallSites } = runAudit();

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ report, totalCallSites, brokenCallSites }, null, 2));
    return;
  }

  console.log('AI message-contract audit — MainPanel.ts vs. webview-ui postMsg call sites\n');
  for (const r of report.sort((a, b) => Number(a.handled) - Number(b.handled))) {
    console.log(`${r.handled ? '✅ HANDLED' : '❌ DEAD   '}  type: '${r.type}'  (${r.fileCount} file${r.fileCount === 1 ? '' : 's'})`);
    if (!r.handled) {
      for (const f of r.files) console.log(`             - ${f}`);
    }
  }
  console.log(`\nTotal AI-trigger call sites: ${totalCallSites}`);
  console.log(`Broken (no host handler):    ${brokenCallSites}`);
  console.log(`Working (routed to a real handler): ${totalCallSites - brokenCallSites}`);
}

// Only run the CLI report when invoked directly (`node scripts/audit-ai-message-contracts.mjs`),
// not when imported by the e2e test.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
