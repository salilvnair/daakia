/**
 * Redaction gate tests.
 *
 * The gate makes one promise — string contents never leave the machine — and a
 * promise that strong is worth a test that can actually fail. These run against
 * the bundled worker so they exercise the shipped code, not a copy.
 *
 * Run: node src/test/fixtures/heap/gate.test.mjs
 */
import { strict as assert } from 'assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// The worker bundle exports the gate because esbuild keeps named exports for
// the CJS output; requiring it here is deliberate, so a regression in the
// shipped artifact fails rather than a regression in the sources only.
const worker = require('../../../../dist/heap-worker.js');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (err) { failures++; console.error(`  FAIL  ${name}\n        ${err.message}`); }
}

const { shapeOf, scanStrings, assertNoRawContent } = worker;

console.log('shapeOf — silhouettes without values');
check('collapses runs to class+length', () => {
  assert.equal(shapeOf('abc123'), 'a393');      // 3 lowercase, then 3 digits
  assert.equal(shapeOf('AB-12'), 'A2-92');      // punctuation kept as structure
});
check('never contains the original letters or digits', () => {
  const secret = 'hunter2-correct-horse';
  const shape = shapeOf(secret);
  for (const word of ['hunter', 'correct', 'horse']) {
    assert.ok(!shape.includes(word), `shape leaked "${word}": ${shape}`);
  }
});
check('same-shaped values collide, so the value is unrecoverable', () => {
  assert.equal(shapeOf('user-1234'), shapeOf('acme-9876'));
});
check('preserves structure well enough to be useful', () => {
  assert.notEqual(shapeOf('a@b.com'), shapeOf('550e8400e29b41d4'));
});

console.log('\nscanStrings — detects credentials without keeping them');
check('finds a JWT', () => {
  const r = scanStrings(['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.abcdefghij'], 10);
  assert.equal(r.secrets.some(s => s.kind === 'JWT'), true);
});
check('finds an AWS key and a private key block', () => {
  const r = scanStrings(['AKIAIOSFODNN7EXAMPLE', '-----BEGIN RSA PRIVATE KEY-----'], 10);
  const kinds = r.secrets.map(s => s.kind);
  assert.ok(kinds.includes('AWS access key'), `got ${kinds}`);
  assert.ok(kinds.includes('Private key'), `got ${kinds}`);
});
check('finds credentials in a connection string', () => {
  const r = scanStrings(['jdbc:postgresql://app:s3cr3t@db.internal:5432/orders'], 10);
  assert.equal(r.secrets.some(s => s.kind === 'Connection string'), true);
});
check('its own output carries no value', () => {
  const secret = 'AKIAIOSFODNN7EXAMPLE';
  const json = JSON.stringify(scanStrings([secret, secret], 10));
  assert.ok(!json.includes(secret), 'scan result leaked the value');
});
check('counts duplicates by shape', () => {
  const r = scanStrings(['repeated-value-here', 'repeated-value-here', 'other'], 10);
  assert.equal(r.duplicates.length, 1);
  assert.equal(r.duplicates[0].count, 2);
});
check('reports coverage honestly', () => {
  const r = scanStrings(['a-value'], 10, 1000);
  assert.equal(r.population, 1000);
  assert.ok(r.coverage > 0 && r.coverage < 0.01, `coverage was ${r.coverage}`);
});

console.log('\nassertNoRawContent — the last line of defence');
check('passes a clean pack', () => {
  assertNoRawContent({ totals: { objects: 1 }, suspects: [{ className: 'java.util.HashMap' }] });
});
check('throws on an embedded JWT', () => {
  assert.throws(
    () => assertNoRawContent({ note: 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig' }),
    /Refusing to send/,
  );
});
check('throws on a long free-text value', () => {
  assert.throws(() => assertNoRawContent({ blob: 'x'.repeat(400) }), /too long to be a label/);
});
check('finds it however deeply nested', () => {
  assert.throws(
    () => assertNoRawContent({ a: [{ b: { c: ['AKIAIOSFODNN7EXAMPLE'] } }] }),
    /AWS access key/,
  );
});
check('names the path so the offending field is findable', () => {
  try {
    assertNoRawContent({ suspects: [{ label: 'AKIAIOSFODNN7EXAMPLE' }] });
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err.message.includes('$.suspects[0].label'), err.message);
  }
});

console.log(failures === 0 ? '\nAll gate checks hold.' : `\n${failures} gate check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
