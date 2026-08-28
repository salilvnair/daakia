/**
 * The evidence pack — the only thing that crosses the trust boundary.
 *
 * A 4 GB dump is ~45M objects. As JSON that is roughly 22 GB, or 5.5 billion
 * tokens, against a practical analysis budget of about 15,000. The reduction
 * needed is on the order of 370,000:1, which is why the model cannot be the
 * analyzer: the engine computes dominators and retained sizes, and the model
 * only ranks and explains what the engine already found.
 *
 * Everything here is a number, a class name or a shape. No string contents, no
 * field values, no stack variables. The pack is built safe by construction and
 * then checked by `assertNoRawContent` before anyone can send it.
 */
import { displayClassName, type HeapIndex } from './heap-index';
import { computeClassStats, type Dominators, type HeapVerdict } from './heap-analysis';
import { scanStrings, assertNoRawContent, type StringScan } from './heap-redaction';

export interface EvidencePack {
  schema: 'daakia.heap.evidence/1';
  runtime: { idSize: number; dumpTakenAt: string };
  totals: {
    objects: number;
    classes: number;
    references: number;
    gcRoots: number;
    liveBytes: number;
    liveObjects: number;
    unreachableBytes: number;
    unreachableObjects: number;
  };
  suspects: {
    rank: number;
    className: string;
    retainedBytes: number;
    retainedPercent: number;
    retainedObjects: number;
    heldIn?: string;
    accumulating?: { className: string; count: number };
    pathToRoot: string[];
  }[];
  histogram: {
    className: string;
    instances: number;
    shallowBytes: number;
    retainedSumBytes: number;
  }[];
  strings: StringScan;
  anomalies: string[];
}

/** Rounded so the pack does not spend tokens on meaningless precision. */
const round = (n: number) => Math.round(n);

export function buildEvidencePack(
  index: HeapIndex,
  dom: Dominators,
  verdict: HeapVerdict,
  { topClasses = 40, textSampleLimit = 20000 } = {},
): EvidencePack {
  const strings = scanStrings(index.textSamples, textSampleLimit, index.textCandidates);

  const histogram = computeClassStats(index, dom)
    .sort((a, b) => b.shallowBytes - a.shallowBytes)
    .slice(0, topClasses)
    .map(c => ({
      className: c.className,
      instances: c.instances,
      shallowBytes: round(c.shallowBytes),
      retainedSumBytes: round(c.retainedSumBytes),
    }));

  // Facts worth stating plainly, so the model does not have to infer them from
  // the histogram and get them wrong.
  const anomalies: string[] = [];
  if (verdict.unreachableObjects > verdict.liveObjects * 0.2) {
    anomalies.push(
      `${verdict.unreachableObjects} objects (${round((verdict.unreachableBytes / (verdict.liveBytes || 1)) * 100)}% of live bytes) are unreachable but still present, which suggests the dump was taken before a full collection.`,
    );
  }
  const wasted = strings.duplicates.reduce((t, d) => t + d.wastedBytes, 0);
  if (wasted > 1_000_000) {
    anomalies.push(`At least ${round(wasted / 1048576)} MB is duplicate string content across the sampled values.`);
  }
  if (strings.secrets.length) {
    anomalies.push(
      `Credential-shaped values are present in memory: ${strings.secrets.map(s => `${s.kind} (${s.matches})`).join(', ')}. Values were not read out of this process.`,
    );
  }
  const overlapping = histogram.filter(h => h.retainedSumBytes > verdict.liveBytes);
  if (overlapping.length) {
    anomalies.push(
      `${overlapping.map(h => h.className).join(', ')} report a retained sum larger than the live heap, meaning instances dominate one another — typically a linked or nested structure.`,
    );
  }

  const pack: EvidencePack = {
    schema: 'daakia.heap.evidence/1',
    runtime: {
      idSize: index.idSize,
      dumpTakenAt: index.timestamp ? new Date(index.timestamp).toISOString() : 'unknown',
    },
    totals: {
      objects: index.count,
      classes: index.classes.length,
      references: index.refTarget.length,
      gcRoots: index.roots.length,
      liveBytes: round(verdict.liveBytes),
      liveObjects: verdict.liveObjects,
      unreachableBytes: round(verdict.unreachableBytes),
      unreachableObjects: verdict.unreachableObjects,
    },
    suspects: verdict.suspects.map((s, i) => ({
      rank: i + 1,
      className: s.className,
      retainedBytes: round(s.retainedBytes),
      retainedPercent: Number(s.retainedPercent.toFixed(2)),
      retainedObjects: s.retainedObjects,
      heldIn: s.heldIn?.className,
      accumulating: s.accumulates,
      pathToRoot: s.pathToRoot.map(p => p.className),
    })),
    histogram,
    strings,
    anomalies,
  };

  // Safe by construction, and verified anyway — a future field that carries
  // content should fail loudly here rather than quietly ship it.
  assertNoRawContent(pack);
  return pack;
}

/** The system prompt. Kept beside the pack so the two evolve together. */
export const HEAP_SYSTEM_PROMPT = `You are a JVM memory analyst reading the output of a heap dump analyzer.

The numbers you are given were computed by a real dominator-tree analysis — treat them as facts and never recompute or contradict them. You are NOT being asked to find the leak; the analyzer already did. You are being asked to explain it.

Ground rules:
- Only discuss classes that appear in the evidence. Never invent a class, field or stack frame.
- Cite the actual number beside every claim you make.
- String contents were deliberately withheld. Reason about shapes and counts; never speculate about what a value contained.
- If the evidence does not support a conclusion, say what further evidence would settle it.

Answer in four short sections:
1. **What is holding the memory** — the accumulation point in one or two sentences.
2. **Why it is still reachable** — read the path to GC roots.
3. **Most likely cause** — the framework or code pattern this shape usually indicates. Say how confident you are.
4. **What to check first** — two or three concrete things to look at in the codebase, most specific first.

Be direct and short. A senior engineer is reading this while an incident is open.`;

export function buildUserMessage(pack: EvidencePack, dumpName: string): string {
  return `Heap dump: ${dumpName}\n\nEvidence:\n${JSON.stringify(pack, null, 2)}`;
}
