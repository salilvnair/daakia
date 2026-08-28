#!/usr/bin/env node
/**
 * daakia-heap-check — fail a build when a heap dump regresses.
 *
 * The point of a memory analyzer in CI is not to produce a report nobody reads;
 * it is to stop a change that makes things worse. This exits non-zero on a
 * budget breach so a pipeline can gate on it, and says exactly what broke.
 *
 * It drives dist/heap-worker.js — the same bundle the extension uses — so the
 * pipeline and the panel can never disagree about what a dump contains.
 *
 * Usage:
 *   node cli/daakia-heap-check.mjs <dump.hprof> [options]
 *
 * Budgets (any breach fails the run):
 *   --max-live-mb <n>            live heap must stay under this
 *   --max-retained-percent <n>   no single object may retain more than this share
 *   --baseline <dump.hprof>      earlier dump to compare against
 *   --max-growth-mb <n>          growth over the baseline must stay under this
 *   --fail-on <level>            also fail on rule findings: critical | warning | info
 *
 * Output:
 *   --json                       machine-readable result on stdout
 *   --junit <file>               JUnit XML, which is what CI actually renders
 *
 * Exit codes: 0 budgets held · 1 a budget was breached · 2 bad usage or an
 * unreadable dump.
 */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';

const require = createRequire(import.meta.url);
let heap;
try {
  heap = require('../dist/heap-worker.js');
} catch {
  console.error('Could not load dist/heap-worker.js — run `npm run build:ext` first.');
  process.exit(2);
}
const { parseHprof, analyzeHeap, runRules, scanStrings, computeClassStats, RULE_PACK_VERSION } = heap;

const USAGE = `Usage: node cli/daakia-heap-check.mjs <dump.hprof> [options]

  --max-live-mb <n>           fail if the live heap exceeds n MB
  --max-retained-percent <n>  fail if any single object retains more than n%
  --baseline <dump.hprof>     compare against an earlier dump
  --max-growth-mb <n>         fail if growth over the baseline exceeds n MB
  --fail-on <level>           fail on rule findings at or above: critical|warning|info
  --json                      print the result as JSON
  --junit <file>              write a JUnit report`;

const argv = process.argv.slice(2);
if (!argv.length || argv[0] === '-h' || argv[0] === '--help') {
  console.log(USAGE);
  process.exit(argv.length ? 0 : 2);
}

const opt = {
  dump: argv[0], baseline: null,
  maxLiveMb: null, maxRetainedPct: null, maxGrowthMb: null,
  failOn: null, json: false, junit: null,
};
for (let i = 1; i < argv.length; i++) {
  const next = () => argv[++i];
  switch (argv[i]) {
    case '--baseline': opt.baseline = next(); break;
    case '--max-live-mb': opt.maxLiveMb = Number(next()); break;
    case '--max-retained-percent': opt.maxRetainedPct = Number(next()); break;
    case '--max-growth-mb': opt.maxGrowthMb = Number(next()); break;
    case '--fail-on': opt.failOn = next(); break;
    case '--json': opt.json = true; break;
    case '--junit': opt.junit = next(); break;
    default: console.error(`Unknown option: ${argv[i]}`); process.exit(2);
  }
}
if (opt.maxGrowthMb !== null && !opt.baseline) {
  console.error('--max-growth-mb needs --baseline to compare against.');
  process.exit(2);
}
const RANK = { critical: 0, warning: 1, info: 2 };
if (opt.failOn !== null && RANK[opt.failOn] === undefined) {
  console.error('--fail-on must be critical, warning or info.');
  process.exit(2);
}

const MB = 1048576;
const mb = (b) => `${(b / MB).toFixed(1)} MB`;

function analyze(path) {
  const index = parseHprof(path);
  const { dominators, verdict } = analyzeHeap(index);
  const strings = scanStrings(index.textSamples, 20000, index.textCandidates);
  return { index, dominators, verdict, strings, classes: computeClassStats(index, dominators) };
}

let current;
let baseline = null;
try {
  current = analyze(opt.dump);
  if (opt.baseline) baseline = analyze(opt.baseline);
} catch (err) {
  console.error(`Could not analyze the dump: ${err.message}`);
  process.exit(2);
}

const findings = runRules(current.index, current.dominators, current.verdict, current.strings);

// ── Budgets ──────────────────────────────────────────────────────────────────
const checks = [];
const record = (name, ok, detail) => checks.push({ name, ok, detail });

if (opt.maxLiveMb !== null) {
  const live = current.verdict.liveBytes;
  record('live heap budget', live <= opt.maxLiveMb * MB,
    `live heap is ${mb(live)}, budget ${opt.maxLiveMb} MB`);
}
if (opt.maxRetainedPct !== null) {
  const top = current.verdict.suspects[0];
  const pct = top ? top.retainedPercent : 0;
  record('retained share budget', pct <= opt.maxRetainedPct,
    top ? `${top.className} retains ${pct.toFixed(1)}%, budget ${opt.maxRetainedPct}%`
        : `no object retains an outsized share, budget ${opt.maxRetainedPct}%`);
}
if (baseline) {
  const growth = current.verdict.liveBytes - baseline.verdict.liveBytes;
  const ok = opt.maxGrowthMb === null || growth <= opt.maxGrowthMb * MB;
  record('growth budget', ok,
    `grew ${mb(growth)} over ${opt.baseline}` +
    (opt.maxGrowthMb === null ? ' (no budget set)' : `, budget ${opt.maxGrowthMb} MB`));
}
if (opt.failOn !== null) {
  const tripped = findings.filter(f => RANK[f.severity] <= RANK[opt.failOn]);
  record(`rule findings (${opt.failOn} and above)`, tripped.length === 0,
    tripped.length ? tripped.map(f => `${f.severity}: ${f.title}`).join('; ') : 'none');
}

const failed = checks.filter(c => !c.ok);
const top = current.verdict.suspects[0];
const result = {
  dump: opt.dump,
  liveBytes: Math.round(current.verdict.liveBytes),
  liveObjects: current.verdict.liveObjects,
  topSuspect: top ? { className: top.className, retainedPercent: Number(top.retainedPercent.toFixed(2)) } : null,
  rulePackVersion: RULE_PACK_VERSION,
  findings: findings.map(f => ({ ruleId: f.ruleId, severity: f.severity, title: f.title, detail: f.detail })),
  checks,
  passed: failed.length === 0,
};

// ── Report ───────────────────────────────────────────────────────────────────
if (opt.junit) {
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  const cases = checks.map((c) =>
    `    <testcase classname="daakia.heap" name="${esc(c.name)}">` +
    (c.ok ? '' : `\n      <failure message="${esc(c.detail)}"/>`) +
    `\n    </testcase>`).join('\n');
  writeFileSync(opt.junit,
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuites>\n  <testsuite name="daakia-heap-check" tests="${checks.length}" failures="${failed.length}">\n` +
    `${cases}\n  </testsuite>\n</testsuites>\n`);
}

if (opt.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`${opt.dump}: ${mb(current.verdict.liveBytes)} live across ${current.verdict.liveObjects.toLocaleString()} objects`);
  if (result.topSuspect) {
    console.log(`  top suspect: ${result.topSuspect.className} at ${result.topSuspect.retainedPercent}%`);
  }
  if (findings.length) {
    console.log(`\nrule findings (pack ${RULE_PACK_VERSION}):`);
    for (const f of findings) console.log(`  [${f.severity}] ${f.title} — ${f.detail}`);
  }
  if (!checks.length) {
    console.log('\nNo budgets given, so there is nothing to fail on.');
    console.log('Pass --max-live-mb, --max-retained-percent, --max-growth-mb or --fail-on.');
  } else {
    console.log('');
    for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name} — ${c.detail}`);
  }
}

process.exit(failed.length ? 1 : 0);
