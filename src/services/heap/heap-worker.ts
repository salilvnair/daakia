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
import { scanStrings } from './heap-redaction';
import {
  analyzeHeap, computeClassStats, computeTreemap, dominatorChildrenOf,
  type HeapVerdict, type Dominators,
} from './heap-analysis';
import { buildEvidencePack, buildUserMessage, HEAP_SYSTEM_PROMPT } from './heap-evidence';
import { runRules, RULE_PACK_VERSION, type RuleFinding } from './heap-rules';
// Re-exported so the gate can be tested against the shipped bundle rather than
// against a copy of the sources.
export { shapeOf, scanStrings, assertNoRawContent } from './heap-redaction';
export { buildEvidencePack } from './heap-evidence';
// Exported for the CI gate in cli/daakia-heap-check.mjs, which drives this same
// bundle so the pipeline and the panel can never disagree about a dump.
export { parseHprof } from './hprof-parser';
export { analyzeHeap, computeClassStats } from './heap-analysis';
export { runRules, RULE_PACK_VERSION } from './heap-rules';
// Thread analysis rides in the same bundle: it shares the fork, the redaction
// discipline and the CI gate, and a second worker process would buy nothing.
export { parseThreadDump } from '../threads/jstack-parser';
export { analyzeThreadDump, findDeadlocks, findContention, groupThreads } from '../threads/thread-analysis';

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
  /** Present once the analysis pass has run. */
  verdict?: HeapVerdict;
  /** Deterministic rule findings — no model involved. */
  rules?: { version: string; findings: RuleFinding[] };
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

  // ── Retained size, checked by arithmetic rather than against another tool ──
  // The fixture's leak is 50,000 entries each holding byte[512], so whatever
  // dominates them must retain at least that many bytes. This is the one number
  // a heap analyzer exists to produce, so it gets an independent check.
  const { dominators, verdict } = analyzeHeap(index);
  const topRetained = verdict.suspects[0]?.retainedBytes ?? 0;
  if (topRetained < truth.payloadBytesTotal) {
    failures.push(`top suspect retains ${topRetained}, expected at least the planted ${truth.payloadBytesTotal}`);
  }
  if (verdict.liveBytes <= 0) failures.push('live heap computed as zero bytes');
  if (verdict.liveObjects <= 0) failures.push('no reachable objects');
  // Every reachable object except the virtual root must have an immediate dominator.
  let orphans = 0;
  for (let i = 1; i < dominators.order.length; i++) {
    if (dominators.idom[dominators.order[i]] < 0) orphans++;
  }
  if (orphans > 0) failures.push(`${orphans} reachable objects have no dominator`);
  // The virtual root retains exactly the sum of live shallow sizes.
  let liveShallow = 0;
  for (let i = 1; i < dominators.order.length; i++) liveShallow += index.shallow[dominators.order[i]];
  if (Math.abs(liveShallow - verdict.liveBytes) > 0.5) {
    failures.push(`retained-size accounting is lossy: root retains ${verdict.liveBytes}, live shallow sums to ${liveShallow}`);
  }

  // ── The redaction gate must see the planted duplicate content ──
  // Sampling is uniform across the dump, so a value repeated DUP_COUNT times
  // should appear roughly coverage x DUP_COUNT times in the sample.
  const pack = buildEvidencePack(index, dominators, verdict);
  const dupLen = String(truth.duplicateStringText).length;
  const expectedDupSamples = Math.floor(truth.counts.dupHolder * pack.strings.coverage * 0.5);
  const foundDup = pack.strings.duplicates.find(d => d.length === dupLen && d.count >= expectedDupSamples);
  if (!foundDup) {
    failures.push(
      `duplicate-string detection: expected a ${dupLen}-char value repeated >= ${expectedDupSamples} times ` +
      `in the sample (coverage ${(pack.strings.coverage * 100).toFixed(1)}%), got ` +
      `[${pack.strings.duplicates.slice(0, 3).map(d => `len ${d.length} x ${d.count}`).join(', ')}]`,
    );
  }
  // And the gate must never let content through.
  if (JSON.stringify(pack).includes(truth.duplicateStringText)) {
    failures.push('REDACTION FAILURE: the evidence pack contains raw string content.');
  }

  // ── Structural invariants ──
  if (index.refOffset[index.count] !== index.refTarget.length) {
    failures.push(`CSR offsets end at ${index.refOffset[index.count]} but refTarget has ${index.refTarget.length}`);
  }
  if (index.roots.length === 0) failures.push('no GC roots found');

  return failures;
}

// ── IPC protocol ─────────────────────────────────────────────────────────────
/**
 * The worker stays alive after parsing and answers queries from the resident
 * index. Re-parsing per view would cost minutes each time, and shipping the
 * whole graph to the webview is exactly what the columnar design exists to
 * avoid — so the views ask for small, pre-aggregated slices instead.
 */
type Query =
  | { type: 'histogram'; sort?: 'shallow' | 'instances' | 'retained'; search?: string; offset?: number; limit?: number }
  | { type: 'treemap' }
  | { type: 'children'; row: number; limit?: number }
  | { type: 'evidence' }
  | { type: 'growth' }
  | { type: 'rules' };

type Incoming =
  | { type: 'parse'; path: string }
  | { type: 'cancel' }
  | { type: 'setBaseline' }
  | ({ type: 'query'; requestId: string } & { query: Query });

type Outgoing =
  | { type: 'progress'; pass: string; bytesRead: number; totalBytes: number }
  | { type: 'done'; summary: HeapSummary }
  | { type: 'cancelled' }
  | { type: 'error'; message: string }
  | { type: 'baselineSet'; name: string | null; hasBaseline: boolean }
  | { type: 'queryResult'; requestId: string; result: unknown }
  | { type: 'queryError'; requestId: string; message: string };

let cancelled = false;

/** Held after a successful parse so queries need no re-read. */
let resident: { index: HeapIndex; dominators: Dominators } | null = null;
let residentVerdict: HeapVerdict | null = null;
let residentName = 'heap dump';

/**
 * The baseline for a two-dump comparison.
 *
 * Only per-class totals are kept, never the second index. Holding two full
 * graphs would double the resident footprint — on a pair of 4 GB dumps that is
 * well over a gigabyte for a view that only ever shows per-class deltas.
 * Dominator-level attribution across two dumps would need both graphs, and is
 * not worth that cost.
 */
interface Baseline {
  name: string;
  liveBytes: number;
  liveObjects: number;
  classes: Map<string, { instances: number; shallowBytes: number }>;
}
let baseline: Baseline | null = null;

function snapshotBaseline(): Baseline | null {
  if (!resident || !residentVerdict) return null;
  const classes = new Map<string, { instances: number; shallowBytes: number }>();
  for (const c of computeClassStats(resident.index, resident.dominators)) {
    classes.set(c.className, { instances: c.instances, shallowBytes: c.shallowBytes });
  }
  return {
    name: residentName,
    liveBytes: residentVerdict.liveBytes,
    liveObjects: residentVerdict.liveObjects,
    classes,
  };
}

function send(msg: Outgoing) { process.send?.(msg); }

function runQuery(query: Query): unknown {
  if (!resident) throw new Error('No heap dump is loaded.');
  const { index, dominators } = resident;

  if (query.type === 'histogram') {
    const search = (query.search ?? '').trim().toLowerCase();
    let rows = computeClassStats(index, dominators);
    if (search) rows = rows.filter(r => r.className.toLowerCase().includes(search));
    const sort = query.sort ?? 'shallow';
    rows.sort((a, b) =>
      sort === 'instances' ? b.instances - a.instances
      : sort === 'retained' ? b.retainedSumBytes - a.retainedSumBytes
      : b.shallowBytes - a.shallowBytes);
    const offset = query.offset ?? 0;
    const limit = Math.min(query.limit ?? 200, 1000);
    return { total: rows.length, rows: rows.slice(offset, offset + limit) };
  }

  if (query.type === 'treemap') return computeTreemap(index, dominators);

  if (query.type === 'rules') {
    if (!residentVerdict) throw new Error('Analysis has not finished yet.');
    const strings = scanStrings(index.textSamples, 20000, index.textCandidates);
    return { version: RULE_PACK_VERSION, findings: runRules(index, dominators, residentVerdict, strings) };
  }

  /**
   * Growth attribution — what actually changed between two dumps.
   *
   * This is the workflow leaks are really found by, and the one MAT barely
   * supports. Classes are matched by name; anything present in only one dump
   * shows as a pure gain or loss rather than being silently dropped.
   */
  if (query.type === 'growth') {
    if (!baseline) throw new Error('No baseline loaded. Open a dump, set it as the baseline, then open a second one.');
    if (!residentVerdict) throw new Error('Analysis has not finished yet.');

    const current = computeClassStats(index, dominators);
    const seen = new Set<string>();
    const rows: {
      className: string;
      beforeBytes: number; afterBytes: number; deltaBytes: number;
      beforeInstances: number; afterInstances: number; deltaInstances: number;
    }[] = [];

    for (const c of current) {
      seen.add(c.className);
      const b = baseline.classes.get(c.className);
      rows.push({
        className: c.className,
        beforeBytes: Math.round(b?.shallowBytes ?? 0),
        afterBytes: Math.round(c.shallowBytes),
        deltaBytes: Math.round(c.shallowBytes - (b?.shallowBytes ?? 0)),
        beforeInstances: b?.instances ?? 0,
        afterInstances: c.instances,
        deltaInstances: c.instances - (b?.instances ?? 0),
      });
    }
    // Classes that vanished entirely still matter — they are the other half of
    // the story when something was released.
    for (const [className, b] of baseline.classes) {
      if (seen.has(className)) continue;
      rows.push({
        className,
        beforeBytes: Math.round(b.shallowBytes), afterBytes: 0,
        deltaBytes: -Math.round(b.shallowBytes),
        beforeInstances: b.instances, afterInstances: 0, deltaInstances: -b.instances,
      });
    }

    rows.sort((a, b) => Math.abs(b.deltaBytes) - Math.abs(a.deltaBytes));
    return {
      baselineName: baseline.name,
      currentName: residentName,
      baselineBytes: Math.round(baseline.liveBytes),
      currentBytes: Math.round(residentVerdict.liveBytes),
      baselineObjects: baseline.liveObjects,
      currentObjects: residentVerdict.liveObjects,
      rows: rows.slice(0, 60),
      truncatedRows: Math.max(0, rows.length - 60),
    };
  }

  // The pack is built here, inside the process that holds the dump, so the
  // redaction gate runs before anything can reach the host — let alone a model.
  if (query.type === 'evidence') {
    if (!residentVerdict) throw new Error('Analysis has not finished yet.');
    const pack = buildEvidencePack(index, dominators, residentVerdict);
    // The prompt travels with the pack so the view renders exactly what will be
    // sent, rather than a webview-side copy that could drift from the real one.
    return { pack, systemPrompt: HEAP_SYSTEM_PROMPT, userMessage: buildUserMessage(pack, residentName) };
  }

  if (query.type === 'children') {
    return {
      row: query.row,
      children: dominatorChildrenOf(index, dominators, query.row, query.limit ?? 12),
    };
  }

  throw new Error(`Unknown query`);
}

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
    send({ type: 'progress', pass: 'analyze', bytesRead: 0, totalBytes: 0 });
    const { dominators, verdict } = analyzeHeap(index);
    resident = { index, dominators };
    residentVerdict = verdict;
    const strings = scanStrings(index.textSamples, 20000, index.textCandidates);
    const rules = { version: RULE_PACK_VERSION, findings: runRules(index, dominators, verdict, strings) };
    send({ type: 'done', summary: { ...summarize(index), verdict, rules } });
  } catch (err) {
    if (err instanceof ParseCancelled) send({ type: 'cancelled' });
    else send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

if (process.send) {
  // Forked by the extension host.
  process.on('message', (msg: Incoming) => {
    if (msg.type === 'parse') {
      // Deliberately keeps `baseline` — the second dump is parsed precisely so
      // it can be compared against the first.
      resident = null; residentVerdict = null;
      residentName = msg.path.split(/[\/]/).pop() || 'heap dump';
      run(msg.path);
    }
    else if (msg.type === 'cancel') cancelled = true;
    else if (msg.type === 'setBaseline') {
      baseline = snapshotBaseline();
      send({ type: 'baselineSet', name: baseline?.name ?? null, hasBaseline: !!baseline });
    }
    else if (msg.type === 'query') {
      try {
        send({ type: 'queryResult', requestId: msg.requestId, result: runQuery(msg.query) });
      } catch (err) {
        send({ type: 'queryError', requestId: msg.requestId, message: err instanceof Error ? err.message : String(err) });
      }
    }
  });
} else if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  // Standalone: node dist/heap-worker.js <dump.hprof> [--json]
  // Guarded on require.main so importing this bundle (the gate tests do) does
  // not fire the CLI and exit the importing process.
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
  // The CLI runs the same analysis the fork does, so `--json` and the panel
  // never disagree about what the dump contains.
  const cliAnalysis = analyzeHeap(index);
  const cliStrings = scanStrings(index.textSamples, 20000, index.textCandidates);
  const summary: HeapSummary = {
    ...summarize(index),
    verdict: cliAnalysis.verdict,
    rules: { version: RULE_PACK_VERSION, findings: runRules(index, cliAnalysis.dominators, cliAnalysis.verdict, cliStrings) },
  };
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
    for (const h of summary.histogram.slice(0, 6)) {
      console.log(`  ${String(h.instances).padStart(8)}  ${String(h.shallowBytes).padStart(11)}B  ${h.name}`);
    }

    const { verdict } = analyzeHeap(index);
    const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;
    console.log(`\nlive        ${verdict.liveObjects} objects / ${mb(verdict.liveBytes)}`);
    console.log(`unreachable ${verdict.unreachableObjects} objects / ${mb(verdict.unreachableBytes)}`);

    console.log('\ntop classes by live shallow bytes:');
    for (const c of verdict.topClasses.slice(0, 6)) {
      console.log(`  ${mb(c.shallowBytes).padStart(9)}  ${String(c.instances).padStart(7)} objs  ${c.className}`);
    }

    console.log('\nleak suspects:');
    if (!verdict.suspects.length) console.log('  (none above threshold)');
    for (const s of verdict.suspects) {
      console.log(`  ${s.retainedPercent.toFixed(1).padStart(5)}%  ${mb(s.retainedBytes).padStart(9)}  ${String(s.retainedObjects).padStart(7)} objs  ${s.className}`);
      if (s.heldIn) {
        console.log(`          held in ${s.heldIn.className} (${mb(s.heldIn.retainedBytes)})`);
      }
      if (s.accumulates) {
        console.log(`          accumulating ${s.accumulates.count} x ${s.accumulates.className}`);
      }
      console.log(`          via ${s.pathToRoot.map(p => p.className).join(' → ')}`);
    }
  }
}
