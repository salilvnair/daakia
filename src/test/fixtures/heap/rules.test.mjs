/**
 * Rule pack and CI gate tests.
 *
 * A rule that never fires is worse than no rule — it looks like coverage while
 * providing none. The fixture plants two shapes the pack is supposed to
 * recognise (an unbounded cache and a long unbranched chain), so both the hits
 * and the misses are checkable.
 *
 * Run: node src/test/fixtures/heap/rules.test.mjs
 */
import { strict as assert } from 'assert';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';

const require = createRequire(import.meta.url);
const heap = require('../../../../dist/heap-worker.js');
const { parseHprof, analyzeHeap, runRules, scanStrings, RULE_PACK_VERSION } = heap;

const DUMP = 'src/test/fixtures/heap/out/leak.hprof';
const GROWN = 'src/test/fixtures/heap/out/grown.hprof';

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (err) { failures++; console.error(`  FAIL  ${name}\n        ${err.message}`); }
};

function analyze(path) {
  const index = parseHprof(path);
  const { dominators, verdict } = analyzeHeap(index);
  const strings = scanStrings(index.textSamples, 20000, index.textCandidates);
  return { findings: runRules(index, dominators, verdict, strings), verdict };
}

const { findings } = analyze(DUMP);
const byId = (id) => findings.find(f => f.ruleId === id);

console.log(`rule pack ${RULE_PACK_VERSION} — ${findings.length} findings on the fixture`);

check('recognises the planted unbounded cache', () => {
  const f = byId('container.unbounded-cache');
  assert.ok(f, `not found; got ${findings.map(x => x.ruleId).join(', ') || 'nothing'}`);
  assert.equal(f.severity, 'critical');
  assert.match(f.detail, /HashMap/);
});

check('recognises the planted retention chain', () => {
  const f = byId('shape.deep-retention-chain');
  assert.ok(f, 'deep chain not detected');
  // The rule walks a bounded sample of leaves, so the length it reports is a
  // floor. The fixture plants 5,000 nodes; anything close to that is correct,
  // and the wording must not claim more precision than the method has.
  const reported = Number((f.detail.match(/([\d,]+) objects/) ?? [])[1]?.replace(/,/g, ''));
  assert.ok(reported >= 4900 && reported <= 5000, `reported ${reported}, expected ~5000`);
  assert.match(f.detail, /At least/);
});

check('every finding carries evidence and a remediation', () => {
  for (const f of findings) {
    assert.ok(f.detail && f.detail.length > 20, `${f.ruleId} has no detail`);
    assert.ok(f.remediation && f.remediation.length > 20, `${f.ruleId} has no remediation`);
    assert.ok(/\d/.test(f.detail), `${f.ruleId} states no numbers: ${f.detail}`);
  }
});

check('does not invent framework findings that are not there', () => {
  // The fixture uses no Hibernate, Netty, Kafka or connection pool.
  for (const id of ['framework.hibernate-session', 'framework.netty-bytebuf',
                    'framework.kafka-buffers', 'framework.connection-pool']) {
    assert.equal(byId(id), undefined, `${id} fired on a dump that contains none of it`);
  }
});

check('findings are ordered by severity', () => {
  const rank = { critical: 0, warning: 1, info: 2 };
  for (let i = 1; i < findings.length; i++) {
    assert.ok(rank[findings[i - 1].severity] <= rank[findings[i].severity],
      'findings are not sorted by severity');
  }
});

check('a broken rule cannot take the analysis down', () => {
  // runRules swallows per-rule failures by design; assert it still returns.
  assert.ok(Array.isArray(runRules(parseHprof(DUMP), ...(() => {
    const index = parseHprof(DUMP);
    const { dominators, verdict } = analyzeHeap(index);
    return [dominators, verdict, scanStrings([], 10, 0)];
  })())));
});

console.log('\nCI gate');
const gate = (args) => {
  try {
    execFileSync('node', ['cli/daakia-heap-check.mjs', ...args], { stdio: 'pipe' });
    return 0;
  } catch (err) { return err.status; }
};

check('passes when budgets are generous', () => {
  assert.equal(gate([DUMP, '--max-live-mb', '500', '--max-retained-percent', '99']), 0);
});
check('fails when the live heap budget is breached', () => {
  assert.equal(gate([DUMP, '--max-live-mb', '1']), 1);
});
check('fails when the retained share budget is breached', () => {
  assert.equal(gate([DUMP, '--max-retained-percent', '10']), 1);
});
check('fails on a growth budget breach', () => {
  assert.equal(gate([GROWN, '--baseline', DUMP, '--max-growth-mb', '1']), 1);
});
check('passes a growth budget that allows the real growth', () => {
  assert.equal(gate([GROWN, '--baseline', DUMP, '--max-growth-mb', '50']), 0);
});
check('--fail-on critical trips on the planted leak', () => {
  assert.equal(gate([DUMP, '--fail-on', 'critical']), 1);
});
check('rejects bad usage with exit 2, not a failed build', () => {
  assert.equal(gate([DUMP, '--max-growth-mb', '5']), 2);   // no --baseline
  assert.equal(gate([DUMP, '--fail-on', 'nonsense']), 2);
  assert.equal(gate(['no-such-file.hprof', '--max-live-mb', '1']), 2);
});

console.log(failures === 0 ? '\nRule pack and gate hold.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
