/**
 * Log parser and analysis tests.
 *
 * Two things here are easy to get subtly wrong and hard to notice:
 *
 *   Multi-line entries. A stack trace is thirty lines belonging to the ERROR
 *   above it. A parser that makes them thirty entries inflates every count
 *   downstream while still looking like it worked.
 *
 *   Template collapsing. Under-collapsing is silent — you get 2,000 templates
 *   instead of 10 and the "reduction" achieves nothing — so the fixture plants
 *   an exact number of shapes to check against.
 *
 * Run: node src/test/fixtures/logs/logs.test.mjs
 */
import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const w = require('../../../../dist/heap-worker.js');
const { parseLog, LogAccumulator, templateOf } = w;

const truth = JSON.parse(readFileSync('src/test/fixtures/logs/out/app.truth.json', 'utf8'));
const text = readFileSync('src/test/fixtures/logs/out/app.log', 'utf8');

const acc = new LogAccumulator();
const stats = parseLog(text, { onEntry: (e) => acc.add(e) });
const v = acc.build(stats.lines, stats.withoutTimestamp);

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (err) { failures++; console.error(`  FAIL  ${name}\n        ${err.message}`); }
};

console.log(`${v.entries} entries from ${v.lines} lines, ${v.distinctTemplates} templates`);

console.log('\nparsing');
check('counts entries, not lines', () => {
  assert.equal(v.entries, truth.totalEntries);
  assert.ok(v.lines > v.entries, 'the file should have more lines than entries');
});

check('folds stack traces into the entry above', () => {
  // 40 traces of 6 lines each. If they became entries, the count would be wrong.
  assert.ok(stats.continuationLines >= truth.stackTraces * 4,
    `only ${stats.continuationLines} continuation lines`);
  assert.equal(v.entries, truth.totalEntries, 'stack trace lines leaked in as entries');
});

check('reads levels exactly', () => {
  assert.equal(v.byLevel.INFO, truth.infoLines);
  assert.equal(v.byLevel.WARN, truth.backgroundWarnings);
  assert.equal(v.byLevel.ERROR, truth.burstErrors);
  assert.equal(v.byLevel.UNKNOWN, 0, 'some entries had no level recognised');
});

check('reads timestamps for every entry', () => {
  assert.equal(v.withoutTimestamp, 0, `${v.withoutTimestamp} entries had no timestamp`);
  assert.ok(v.timeRange, 'no time range derived');
  assert.ok(v.timeRange.end > v.timeRange.start);
});

check('extracts the exception type and its root cause', () => {
  const e = v.exceptions.find(x => x.type === truth.exceptionType);
  assert.ok(e, `expected ${truth.exceptionType}, got ${v.exceptions.map(x => x.type).join(', ')}`);
  assert.equal(e.count, truth.stackTraces);
  assert.equal(e.cause, truth.causeType);
});

console.log('\ntemplate extraction');
check('collapses to the planted number of shapes', () => {
  // 8 INFO shapes + 1 ERROR + 1 WARN.
  const expected = truth.templateCount + 2;
  assert.equal(v.distinctTemplates, expected,
    `got ${v.distinctTemplates}: ${v.templates.slice(0, 12).map(t => t.template).join(' | ')}`);
});

check('achieves a real reduction', () => {
  assert.ok(v.entries / v.distinctTemplates > 500,
    `only ${Math.round(v.entries / v.distinctTemplates)}:1`);
});

check('collapses numbers with unit suffixes', () => {
  assert.equal(templateOf('completed in 212ms'), 'completed in <n>ms');
  assert.equal(templateOf('older than 1800s'), 'older than <n>s');
  assert.equal(templateOf('took 1.5s'), 'took <n>s');
});

check('collapses identifiers, uuids, ips and paths', () => {
  assert.equal(templateOf('customer cust-888'), 'customer cust-<n>');
  assert.equal(templateOf('from 10.0.4.21'), 'from <ip>');
  assert.equal(templateOf('id 550e8400-e29b-41d4-a716-446655440000'), 'id <uuid>');
  assert.equal(templateOf('read /var/log/app/output.txt'), 'read <path>');
});

check('two lines differing only in values share a template', () => {
  const a = templateOf('Processed order 73120 for customer cust-888 in 212ms');
  const b = templateOf('Processed order 11 for customer cust-100 in 9ms');
  assert.equal(a, b);
});

check('two genuinely different lines do not', () => {
  assert.notEqual(templateOf('Order 5 created'), templateOf('Order 5 cancelled'));
});

check('templates carry no values — the reduction is also redaction', () => {
  for (const t of v.templates) {
    assert.ok(!/\b\d{3,}\b/.test(t.template), `template kept a number: ${t.template}`);
    assert.ok(!/cust-\d/.test(t.template), `template kept an id: ${t.template}`);
  }
});

console.log('\nburst detection');
check('finds the planted burst', () => {
  assert.ok(v.bursts.length >= 1, 'no burst detected');
  const b = v.bursts[0];
  const expected = Date.parse(truth.burstStartIso.replace(' ', 'T') + 'Z');
  // The burst must be located within a bucket width of where it was planted.
  assert.ok(Math.abs(b.start - expected) < 5 * 60 * 1000,
    `burst at ${new Date(b.start).toISOString()}, expected near ${truth.burstStartIso}`);
});

check('attributes every burst error', () => {
  assert.equal(v.bursts[0].errors, truth.burstErrors);
});

check('names the template driving the burst', () => {
  assert.match(v.bursts[0].dominantTemplate, /Failed to persist order/);
});

check('a lone burst is not treated as its own baseline', () => {
  // Errors appear ONLY in the burst here. Using the median of error-bearing
  // buckets would make the burst its own baseline and hide it entirely.
  assert.ok(v.bursts[0].timesBaseline > 3, `only ${v.bursts[0].timesBaseline}x baseline`);
});

check('reports no burst in a steady log', () => {
  const steady = new LogAccumulator();
  const s = parseLog(text.split('\n').filter(l => !l.includes('ERROR')).join('\n'),
    { onEntry: (e) => steady.add(e) });
  assert.equal(steady.build(s.lines, s.withoutTimestamp).bursts.length, 0);
});

console.log('\ncorrelation — the hook that joins the three analyzers');
check('reports what happened around a moment in time', () => {
  const burstTs = Date.parse(truth.burstStartIso.replace(' ', 'T') + 'Z');
  const near = acc.around(burstTs + 30_000, 60_000);
  assert.ok(near.errors > 100, `only ${near.errors} errors near the burst`);
  assert.match(near.templates[0].template, /Failed to persist order/);
});

check('a quiet moment reports as quiet', () => {
  const quiet = acc.around(Date.parse('2026-08-17T21:00:00Z'), 60_000);
  assert.equal(quiet.errors, 0);
});

console.log('\nrobustness');
check('handles an empty file', () => {
  const a = new LogAccumulator();
  const s = parseLog('', { onEntry: (e) => a.add(e) });
  assert.equal(s.entries, 0);
  assert.equal(a.build(s.lines, s.withoutTimestamp).bursts.length, 0);
});

check('handles a log with no timestamps at all', () => {
  const a = new LogAccumulator();
  const s = parseLog('starting up\nsomething happened\nshutting down\n', { onEntry: (e) => a.add(e) });
  assert.equal(s.entries, 3);
  assert.equal(s.withoutTimestamp, 3);
  const built = a.build(s.lines, s.withoutTimestamp);
  assert.equal(built.timeRange, undefined);
  assert.equal(built.distinctTemplates, 3);
});

check('handles CRLF line endings', () => {
  const a = new LogAccumulator();
  const s = parseLog(text.slice(0, 200000).replace(/\n/g, '\r\n'), { onEntry: (e) => a.add(e) });
  assert.ok(s.entries > 100);
  assert.equal(a.build(s.lines, s.withoutTimestamp).byLevel.UNKNOWN, 0);
});

check('caps continuation lines so one runaway trace cannot blow memory', () => {
  const huge = '2026-01-01 00:00:00.000 ERROR [t] c.a.X - boom\n' + '\tat com.a.B.c(B.java:1)\n'.repeat(5000);
  let entry;
  parseLog(huge, { onEntry: (e) => { entry = e; }, maxContinuation: 50 });
  assert.equal(entry.continuation.length, 50);
});

check('stops early when the callback asks it to', () => {
  let seen = 0;
  parseLog(text, { onEntry: () => { seen++; return seen < 10 ? undefined : false; } });
  assert.ok(seen <= 11, `kept going for ${seen} entries`);
});

console.log(failures === 0 ? '\nLog analysis holds.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
