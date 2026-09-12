/**
 * Two-dump growth attribution.
 *
 * The fixtures differ in exactly one variable — the cache holds 50,000 entries
 * in one and 80,000 in the other — so the delta has an arithmetic answer rather
 * than needing a second tool to confirm it. The invariant that matters is that
 * the per-class deltas account for the *whole* change: an attribution that
 * silently drops classes would still look plausible on screen.
 *
 * Run: node src/test/fixtures/heap/growth.test.mjs
 */
import { fork } from 'child_process';
import { strict as assert } from 'assert';

const BASE = 'src/test/fixtures/heap/out/leak.hprof';
const GROWN = 'src/test/fixtures/heap/out/grown.hprof';
const ADDED_ENTRIES = 30_000;   // 80,000 - 50,000
const PAYLOAD = 512;

const child = fork('dist/heap-worker.js', [], { execArgv: ['--max-old-space-size=8192'], silent: true });
let stage = 0;
let failures = 0;

const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (err) { failures++; console.error(`  FAIL  ${name}\n        ${err.message}`); }
};

child.on('message', (m) => {
  if (m.type === 'done') {
    if (stage === 0) { stage = 1; child.send({ type: 'setBaseline' }); }
    else child.send({ type: 'query', requestId: 'g', query: { type: 'growth' } });
    return;
  }
  if (m.type === 'baselineSet') { child.send({ type: 'parse', path: GROWN }); return; }
  if (m.type === 'queryError') { console.error('query failed:', m.message); process.exit(1); }
  if (m.type !== 'queryResult') return;

  const g = m.result;
  const by = (name) => g.rows.find(r => r.className === name);

  console.log('growth attribution');
  check('names both dumps', () => {
    assert.equal(g.baselineName, 'leak.hprof');
    assert.equal(g.currentName, 'grown.hprof');
  });
  check('the cache grew by exactly the added entries', () => {
    const e = by('com.daakia.fixture.DaakiaHeapFixture$LeakedEntry');
    assert.ok(e, 'LeakedEntry missing from the delta');
    assert.equal(e.deltaInstances, ADDED_ENTRIES);
  });
  check('one map node per added entry', () => {
    assert.equal(by('java.util.HashMap$Node').deltaInstances, ADDED_ENTRIES);
  });
  check('byte[] growth covers the added payloads', () => {
    const b = by('[B');
    assert.ok(b.deltaBytes >= ADDED_ENTRIES * PAYLOAD * 0.95,
      `expected >= ~${ADDED_ENTRIES * PAYLOAD}, got ${b.deltaBytes}`);
  });
  check('per-class deltas account for the entire change', () => {
    const summed = g.rows.reduce((t, r) => t + r.deltaBytes, 0);
    const actual = g.currentBytes - g.baselineBytes;
    // Only the listed rows are summed, so any shortfall must be in the tail.
    assert.ok(Math.abs(summed - actual) <= Math.abs(actual) * 0.01,
      `deltas sum to ${summed} but the heap changed by ${actual}`);
  });
  check('the leak is the largest mover', () => {
    assert.equal(g.rows[0].className, '[B');
    assert.ok(g.rows[0].deltaBytes > 0);
  });
  check('unchanged classes report no delta', () => {
    const d = by('com.daakia.fixture.DaakiaHeapFixture$DeepNode');
    assert.equal(d.deltaInstances, 0);
    assert.equal(d.deltaBytes, 0);
  });

  console.log(failures === 0 ? '\nGrowth attribution holds.' : `\n${failures} check(s) FAILED.`);
  child.kill();
  process.exit(failures === 0 ? 0 : 1);
});

child.stderr.on('data', d => process.stderr.write('[worker] ' + d));
child.send({ type: 'parse', path: BASE });
