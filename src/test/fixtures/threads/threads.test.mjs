/**
 * Thread dump parser and analysis tests.
 *
 * The fixture is a real `jcmd Thread.print` dump of a process that was actually
 * deadlocked, with the JVM's own deadlock report inside it. That gives two
 * independent authorities: the planted counts, and the JVM's own conclusion —
 * which the analyzer's cycle detection is checked against rather than copied
 * from.
 *
 * Run: node src/test/fixtures/threads/threads.test.mjs
 */
import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const w = require('../../../../dist/heap-worker.js');
const { parseThreadDump, analyzeThreadDump, findDeadlocks, findContention, groupThreads } = w;

const truth = JSON.parse(readFileSync('src/test/fixtures/threads/out/deadlock.truth.json', 'utf8'));
const text = readFileSync('src/test/fixtures/threads/out/deadlock.txt', 'utf8');
const dump = parseThreadDump(text);
const v = analyzeThreadDump(dump);

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (err) { failures++; console.error(`  FAIL  ${name}\n        ${err.message}`); }
};

console.log(`parsed ${dump.threads.length} threads, ${dump.unparsedLines} unparsed lines`);

console.log('\nparsing');
check('finds every fixture thread', () => {
  const names = new Set(dump.threads.map(t => t.name));
  for (const n of truth.deadlockNames) assert.ok(names.has(n), `missing ${n}`);
  assert.ok(names.has(truth.lockHolderName), 'missing the lock holder');
  for (let i = 0; i < truth.contendedCount; i++) {
    assert.ok(names.has(`${truth.contendedPrefix}${i}`), `missing contended thread ${i}`);
  }
  for (let i = 0; i < truth.parkedCount; i++) {
    assert.ok(names.has(`${truth.parkedPrefix}${i}`), `missing parked thread ${i}`);
  }
});

check('reads the header fields', () => {
  const t = dump.threads.find(x => x.name === `${truth.contendedPrefix}0`);
  assert.equal(t.daemon, true);
  assert.equal(t.state, 'BLOCKED');
  assert.equal(t.stateDetail, 'on object monitor');
  assert.ok(typeof t.number === 'number' && t.number > 0);
  assert.ok(t.tid && t.tid.startsWith('0x'));
});

check('reads stack frames with file and line', () => {
  const t = dump.threads.find(x => x.name === `${truth.contendedPrefix}0`);
  assert.ok(t.frames.length >= 2, `only ${t.frames.length} frames`);
  const app = t.frames.find(f => !f.jdk);
  assert.ok(app, 'no application frame found');
  assert.equal(app.file, 'DaakiaThreadFixture.java');
  assert.ok(app.line > 0, `line was ${app.line}`);
});

check('separates JDK frames from application frames', () => {
  const t = dump.threads.find(x => x.name === `${truth.parkedPrefix}0`);
  assert.ok(t.frames.some(f => f.jdk), 'no JDK frame recognised');
  assert.ok(t.frames[0].method.startsWith('jdk.internal.misc.Unsafe.park'));
});

check('reads lock lines', () => {
  const blocked = dump.threads.find(x => x.name === `${truth.contendedPrefix}0`);
  assert.ok(blocked.waitingToLock, 'no waiting-to-lock recorded');
  assert.equal(blocked.waitingToLock.className, 'java.lang.Object');
  const holder = dump.threads.find(x => x.name === truth.lockHolderName);
  assert.ok(holder.locked.length >= 1, 'holder reports no locked monitor');
});

check('reads parking lines', () => {
  const parked = dump.threads.find(x => x.name === `${truth.parkedPrefix}0`);
  assert.ok(parked.parkingOn, 'no parking target recorded');
  assert.match(parked.parkingOn.className, /CountDownLatch/);
});

check('leaves almost nothing unparsed', () => {
  assert.ok(dump.unparsedLines <= 5, `${dump.unparsedLines} unparsed lines`);
});

console.log('\ndeadlock detection');
check('derives the cycle from the wait-for graph', () => {
  const computed = findDeadlocks(dump.threads);
  assert.equal(computed.length, 1, `found ${computed.length} cycles`);
  assert.deepEqual([...computed[0].threads].sort(), [...truth.deadlockNames].sort());
  assert.equal(computed[0].source, 'computed');
});

check('agrees with the JVM, which reported it independently', () => {
  assert.ok(dump.reportedDeadlocks.length >= 1, 'the JVM section was not parsed');
  const jvmCycle = [...dump.reportedDeadlocks[0].threads].sort();
  assert.deepEqual(jvmCycle, [...truth.deadlockNames].sort());
  assert.equal(v.deadlocks.length, 1, 'the same cycle was counted twice');
  assert.equal(v.deadlockDisagreement, undefined, `unexpected disagreement: ${v.deadlockDisagreement}`);
});

check('reports the cycle deterministically', () => {
  const a = findDeadlocks(dump.threads);
  const b = findDeadlocks([...dump.threads].reverse());
  assert.deepEqual(a[0].threads, b[0].threads, 'cycle order depends on input order');
});

check('finds nothing in a dump with no cycle', () => {
  const healthy = dump.threads.filter(t => !truth.deadlockNames.includes(t.name));
  assert.equal(findDeadlocks(healthy).length, 0);
});

console.log('\ncontention and grouping');
check('finds the contended monitor and its owner', () => {
  const hot = v.contention[0];
  assert.ok(hot, 'no contention found');
  assert.equal(hot.blockedThreads.length, truth.contendedCount);
  assert.equal(hot.ownerThread, truth.lockHolderName);
  assert.equal(hot.className, 'java.lang.Object');
});

check('names the frame the blocked threads share', () => {
  assert.match(v.contention[0].blockedAt, /DaakiaThreadFixture/);
});

check('ignores a monitor with only one waiter', () => {
  // The deadlock pair each block on a different monitor, one waiter apiece.
  const single = v.contention.filter(c => c.blockedThreads.length < 2);
  assert.equal(single.length, 0);
});

check('groups pools by stripping the worker index', () => {
  const pools = groupThreads(dump.threads);
  const contended = pools.find(p => p.name === 'daakia-contended');
  assert.ok(contended, `no pool grouped; got ${pools.slice(0, 5).map(p => p.name).join(', ')}`);
  assert.equal(contended.count, truth.contendedCount);
  assert.equal(contended.byState.BLOCKED, truth.contendedCount);
});

check('state distribution matches what was planted', () => {
  assert.ok(v.byState.BLOCKED >= truth.contendedCount + 2,
    `expected at least ${truth.contendedCount + 2} blocked, got ${v.byState.BLOCKED}`);
  assert.ok(v.byState.TIMED_WAITING >= truth.parkedCount,
    `expected at least ${truth.parkedCount} timed-waiting, got ${v.byState.TIMED_WAITING}`);
  assert.equal(Object.values(v.byState).reduce((a, b) => a + b, 0), dump.threads.length);
});

console.log('\nrobustness');
check('survives an empty dump', () => {
  const d = parseThreadDump('');
  assert.equal(d.threads.length, 0);
  assert.equal(analyzeThreadDump(d).totalThreads, 0);
});
check('survives text that is not a thread dump', () => {
  const d = parseThreadDump('hello\nthis is not a dump\n{"json": true}\n');
  assert.equal(d.threads.length, 0);
});
check('survives a truncated dump mid-thread', () => {
  const cut = text.slice(0, Math.floor(text.length * 0.4));
  const d = parseThreadDump(cut);
  assert.ok(d.threads.length > 0, 'lost every thread');
  assert.ok(analyzeThreadDump(d).totalThreads > 0);
});
check('handles CRLF line endings', () => {
  const d = parseThreadDump(text.replace(/\n/g, '\r\n'));
  assert.equal(d.threads.length, dump.threads.length);
});

console.log(failures === 0 ? '\nThread analysis holds.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
