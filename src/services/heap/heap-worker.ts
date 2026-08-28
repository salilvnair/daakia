/**
 * Heap parse worker — forked child process.
 *
 * Parsing runs here rather than in the extension host for two reasons. A 45M
 * object graph will not fit in the host's default heap, and this process can be
 * started with a raised ceiling; and a parser that dies on a malformed dump must
 * not take VS Code down with it. The host forks this, streams progress, and
 * kills it on cancel.
 *
 * Also runnable standalone for verification:
 *   node dist/heap-worker.js <dump.hprof> [--json]
 */
import { readFileSync } from 'fs';
import { parseHprof, ParseCancelled, type ParseProgress } from './hprof-parser';
import { displayClassName, KIND_INSTANCE, type HeapIndex } from './heap-index';

export interface HeapSummary {
  objects: number;
  classes: number;
  gcRoots: number;
  totalBytes: number;
  idSize: number;
  timestamp: number;
  references: number;
  /** Largest classes by instance count, already display-formatted. */
  histogram: { name: string; instances: number; shallowBytes: number }[];
}

export function summarize(index: HeapIndex, topN = 25): HeapSummary {
  const histogram = index.classes
    .filter(c => c.instanceCount > 0)
    .sort((a, b) => b.instanceCount - a.instanceCount)
    .slice(0, topN)
    .map(c => ({ name: displayClassName(c.name), instances: c.instanceCount, shallowBytes: c.shallowBytes }));

  return {
    objects: index.count,
    classes: index.classes.length,
    gcRoots: index.roots.length,
    totalBytes: index.totalBytes,
    idSize: index.idSize,
    timestamp: index.timestamp,
    references: index.refTarget.length,
    histogram,
  };
}


/**
 * Self-test against a generated fixture's ground truth.
 *
 * The histogram alone would pass even if reference extraction were broken, so
 * this also walks the planted DeepNode chain edge by edge. Field-layout
 * resolution across the superclass chain is the part most likely to be subtly
 * wrong, and the part whose failure looks like plausible output.
 */
export function verifyAgainstTruth(index: HeapIndex, truthPath: string): string[] {
  const truth = JSON.parse(readFileSync(truthPath, 'utf8'));
  const failures: string[] = [];
  const check = (label: string, actual: unknown, expected: unknown) => {
    if (actual !== expected) failures.push(`${label}: expected ${expected}, got ${actual}`);
  };

  const byName = new Map<string, { row: number; instances: number }>();
  index.classes.forEach((c, row) => byName.set(displayClassName(c.name), { row, instances: c.instanceCount }));
  const named = (internal: string) => byName.get(displayClassName(internal));

  // ── Instance counts for the planted classes ──
  for (const [key, count] of Object.entries(truth.counts as Record<string, number>)) {
    if (key === 'fixtureThreads') continue;
    const className = (truth.classes as Record<string, string>)[key];
    if (!className) continue;
    check(`${key} instances`, named(className)?.instances, count);
  }

  // ── byte[] must account for at least the planted payloads ──
  const byteArrays = named('[B');
  if (!byteArrays) failures.push('no byte[] class synthesised');
  else {
    const total = index.classes[byteArrays.row].shallowBytes;
    if (total < truth.payloadBytesTotal) {
      failures.push(`byte[] bytes: expected >= ${truth.payloadBytesTotal}, got ${total}`);
    }
  }

  // ── Reference extraction: walk the planted chain ──
  const deepNodeRow = named(truth.classes.deepNode)?.row;
  if (deepNodeRow === undefined) {
    failures.push('DeepNode class missing');
  } else {
    const isDeepNode = (row: number) => index.kind[row] === KIND_INSTANCE && index.classOf[row] === deepNodeRow;
    // The chain head is the only DeepNode nothing else points at.
    const pointedAt = new Set<number>();
    for (let row = 0; row < index.count; row++) {
      for (let e = index.refOffset[row]; e < index.refOffset[row + 1]; e++) {
        const t = index.refTarget[e];
        if (t >= 0 && isDeepNode(t) && isDeepNode(row)) pointedAt.add(t);
      }
    }
    let head = -1;
    for (let row = 0; row < index.count && head < 0; row++) {
      if (isDeepNode(row) && !pointedAt.has(row)) head = row;
    }
    if (head < 0) {
      failures.push('chain head not found — reference extraction is broken');
    } else {
      let length = 1;
      let cursor = head;
      const seen = new Set<number>([head]);
      for (;;) {
        let next = -1;
        for (let e = index.refOffset[cursor]; e < index.refOffset[cursor + 1]; e++) {
          const t = index.refTarget[e];
          if (t >= 0 && isDeepNode(t) && !seen.has(t)) { next = t; break; }
        }
        if (next < 0) break;
        seen.add(next); cursor = next; length++;
      }
      check('chain length reachable by following refs', length, truth.chainDepth);
    }
  }

  // ── Structural invariants ──
  if (index.refOffset[index.count] !== index.refTarget.length) {
    failures.push(`CSR offsets end at ${index.refOffset[index.count]} but refTarget has ${index.refTarget.length}`);
  }
  if (index.roots.length === 0) failures.push('no GC roots found');

  return failures;
}

// ── IPC protocol ─────────────────────────────────────────────────────────────
type Incoming = { type: 'parse'; path: string } | { type: 'cancel' };
type Outgoing =
  | { type: 'progress'; pass: string; bytesRead: number; totalBytes: number }
  | { type: 'done'; summary: HeapSummary }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

let cancelled = false;

function send(msg: Outgoing) { process.send?.(msg); }

function run(path: string) {
  // Progress is chatty by nature; throttle so IPC doesn't dominate the parse.
  let lastPost = 0;
  const onProgress = (p: ParseProgress) => {
    const now = Date.now();
    if (now - lastPost < 100) return;
    lastPost = now;
    send({ type: 'progress', pass: p.pass, bytesRead: p.bytesRead, totalBytes: p.totalBytes });
  };

  try {
    const index = parseHprof(path, { onProgress, isCancelled: () => cancelled });
    send({ type: 'done', summary: summarize(index) });
  } catch (err) {
    if (err instanceof ParseCancelled) send({ type: 'cancelled' });
    else send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

if (process.send) {
  // Forked by the extension host.
  process.on('message', (msg: Incoming) => {
    if (msg.type === 'parse') run(msg.path);
    else if (msg.type === 'cancel') cancelled = true;
  });
} else {
  // Standalone: node dist/heap-worker.js <dump.hprof> [--json]
  const path = process.argv[2];
  if (!path) {
    console.error('usage: node heap-worker.js <dump.hprof> [--json]');
    process.exit(2);
  }
  const asJson = process.argv.includes('--json');
  const verifyIdx = process.argv.indexOf('--verify');
  const truthPath = verifyIdx >= 0 ? process.argv[verifyIdx + 1] : undefined;
  const started = Date.now();
  let lastPass = '';
  const index = parseHprof(path, {
    onProgress: (p) => {
      if (p.pass === lastPass || asJson) return;
      lastPass = p.pass;
      process.stderr.write(`pass ${p.pass}…\n`);
    },
  });
  const summary = summarize(index);
  const elapsed = Date.now() - started;

  if (truthPath) {
    const failures = verifyAgainstTruth(index, truthPath);
    console.log(`parsed in ${(elapsed / 1000).toFixed(1)}s — objects=${summary.objects} refs=${summary.references} roots=${summary.gcRoots}`);
    if (failures.length) {
      console.error(`
FAIL — ${failures.length} check(s) did not hold:`);
      for (const f of failures) console.error(`  ✗ ${f}`);
      process.exit(1);
    }
    console.log('PASS — all ground-truth checks hold');
  } else if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`parsed in ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`objects=${summary.objects}  classes=${summary.classes}  refs=${summary.references}  roots=${summary.gcRoots}`);
    console.log(`totalBytes=${summary.totalBytes}  idSize=${summary.idSize}`);
    console.log('\ntop classes by instance count:');
    for (const h of summary.histogram.slice(0, 10)) {
      console.log(`  ${String(h.instances).padStart(8)}  ${String(h.shallowBytes).padStart(11)}B  ${h.name}`);
    }
  }
}
