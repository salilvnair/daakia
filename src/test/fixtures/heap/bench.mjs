/**
 * Heap analyzer benchmark.
 *
 * Every scale claim made about this analyzer so far has been arithmetic —
 * "620 MB of CSR for a 4 GB dump", "about 30 seconds", "Cooper–Harvey–Kennedy
 * converges quickly enough". None of that was measured. This measures what can
 * be measured on the fixtures and, more usefully, reports the per-object and
 * per-byte costs so an extrapolation to a real dump is at least grounded in
 * observed numbers rather than in hope.
 *
 * It also prints peak RSS, because the memory question is the one that decides
 * whether a 4 GB dump opens at all.
 *
 * Run:  node src/test/fixtures/heap/bench.mjs [dump.hprof ...]
 *       npm run heap:bench
 */
import { createRequire } from 'module';
import { statSync, existsSync, rmSync } from 'fs';

const require = createRequire(import.meta.url);
const w = require('../../../../dist/heap-worker.js');
const { parseHprof, analyzeHeap, computeClassStats, runRules, scanStrings } = w;

const DEFAULTS = [
  'src/test/fixtures/heap/out/leak.hprof',
  'src/test/fixtures/heap/out/grown.hprof',
];
const dumps = (process.argv.slice(2).length ? process.argv.slice(2) : DEFAULTS).filter(existsSync);
if (!dumps.length) {
  console.error('No dumps found. Generate the fixtures first — see src/test/fixtures/heap/README.md');
  process.exit(2);
}

/** The typed-array columns whose sizes make up the resident index. */
const COLUMN_NAMES = ['classOf', 'shallow', 'kind', 'flags', 'refOffset', 'refTarget', 'refWeak'];

const MB = 1048576;
const mb = (b) => (b / MB).toFixed(1);
const ms = (n) => `${n.toFixed(0)}ms`;

/**
 * Peak RSS, sampled synchronously.
 *
 * A setInterval sampler reads 0 here: the whole benchmark is synchronous, so
 * the event loop never gets a turn and the timer never fires — it reports a
 * confident zero rather than failing, which is exactly the kind of measurement
 * worth not trusting. Marking around each phase costs nothing and is real.
 */
let peakRss = 0;
const mark = () => {
  const rss = process.memoryUsage().rss;
  if (rss > peakRss) peakRss = rss;
  return rss;
};

function time(fn) {
  mark();
  const t = process.hrtime.bigint();
  const value = fn();
  const elapsed = Number(process.hrtime.bigint() - t) / 1e6;
  mark();
  return { value, ms: elapsed };
}

console.log('dump                     size     parse   analyze    rules   objects      refs   MB/s   µs/obj');
console.log('─'.repeat(100));

const rows = [];
for (const path of dumps) {
  // Always measure a cold parse: the sidecar makes a warm one meaningless here.
  rmSync(`${path}.dkheap`, { force: true });

  const bytes = statSync(path).size;
  // Reclaim what the previous dump held so each row's RSS reflects that dump.
  if (global.gc) global.gc();
  const rssBefore = mark();
  const parse = time(() => parseHprof(path, { cache: false }));
  const index = parse.value;
  const analysis = time(() => analyzeHeap(index));
  const { dominators, verdict } = analysis.value;
  const rules = time(() => {
    const strings = scanStrings(index.textSamples, 20000, index.textCandidates);
    computeClassStats(index, dominators);
    return runRules(index, dominators, verdict, strings);
  });

  const name = path.split(/[\\/]/).pop().padEnd(22);
  const throughput = bytes / MB / (parse.ms / 1000);
  const perObject = (parse.ms * 1000) / index.count;

  console.log(
    `${name} ${mb(bytes).padStart(6)}M ${ms(parse.ms).padStart(8)} ${ms(analysis.ms).padStart(9)} ` +
    `${ms(rules.ms).padStart(8)} ${index.count.toLocaleString().padStart(9)} ` +
    `${index.refTarget.length.toLocaleString().padStart(9)} ${throughput.toFixed(0).padStart(6)} ` +
    `${perObject.toFixed(2).padStart(8)}`);

  mark();
  // The index size is exact and worth measuring directly. Inferring it from RSS
  // deltas gave 1.40x the file size, which was mostly first-run warmup — an
  // extrapolation from that would have claimed 5.7 GB for a 4 GB dump on no
  // real evidence.
  const indexBytes = COLUMN_NAMES.reduce((t, name) => t + index[name].byteLength, 0);
  rows.push({
    bytes, parseMs: parse.ms, analyzeMs: analysis.ms,
    objects: index.count, refs: index.refTarget.length, indexBytes,
  });
  console.log(`${' '.repeat(23)}columnar index ${mb(indexBytes)} MB ` +
              `(${((indexBytes / bytes) * 100).toFixed(0)}% of the dump, ${(indexBytes / index.count).toFixed(0)} bytes/object)`);

  // Sidecar round-trip: the number that decides whether reopening feels instant.
  const warm = time(() => parseHprof(path, { cache: true }));   // writes it
  const cached = time(() => parseHprof(path, { cache: true }));  // reads it
  console.log(`${' '.repeat(23)}sidecar write ${ms(warm.ms - parse.ms > 0 ? warm.ms : warm.ms)}, ` +
              `read ${ms(cached.ms)} (${(parse.ms / Math.max(cached.ms, 0.01)).toFixed(0)}x faster than parsing)`);
}


// ── Extrapolation, clearly labelled as such ──────────────────────────────────
const totalBytes = rows.reduce((t, r) => t + r.bytes, 0);
const totalParse = rows.reduce((t, r) => t + r.parseMs, 0);
const totalObjects = rows.reduce((t, r) => t + r.objects, 0);
const totalRefs = rows.reduce((t, r) => t + r.refs, 0);

const mbPerSec = (totalBytes / MB) / (totalParse / 1000);
const objectsPerMb = totalObjects / (totalBytes / MB);
const refsPerObject = totalRefs / totalObjects;

console.log('\nobserved rates');
console.log(`  parse throughput      ${mbPerSec.toFixed(0)} MB/s`);
console.log(`  objects per MB        ${objectsPerMb.toFixed(0)}`);
console.log(`  references per object ${refsPerObject.toFixed(2)}`);
console.log(`  peak RSS this run     ${mb(peakRss)} MB`);
const bytesPerObject = rows.reduce((t, r) => t + r.indexBytes, 0) / totalObjects;
console.log(`  index bytes/object    ${bytesPerObject.toFixed(1)} (exact, from the column widths)`);

const target = 4096;   // a 4 GB dump, the size the plan kept citing
const projObjects = objectsPerMb * target;
const projRefs = projObjects * refsPerObject;
const projIndexBytes = projObjects * bytesPerObject;

console.log(`\nextrapolated to a ${target / 1024} GB dump — arithmetic from the rates above, NOT measured`);
console.log(`  objects               ~${(projObjects / 1e6).toFixed(0)}M`);
console.log(`  references            ~${(projRefs / 1e6).toFixed(0)}M`);
console.log(`  columnar index        ~${mb(projIndexBytes)} MB resident`);
console.log(`  peak RSS on fixtures  ${mb(peakRss)} MB — the process needs headroom above the index`);
console.log(`  parse time            ~${(target / mbPerSec).toFixed(0)}s`);
console.log('\nThese scale linearly by construction. The parse does; the dominator');
console.log('iteration does not necessarily, and only a real dump of that size will');
console.log('say whether Cooper-Harvey-Kennedy converges as quickly at 45M nodes.');
