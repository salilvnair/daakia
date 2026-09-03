/**
 * Framework-aware rule pack.
 *
 * This is what separates a heap analyzer from a heap *diagnoser*. MAT will tell
 * you a HashMap retains 2.1 GB, which is true and leaves you exactly where you
 * started. A rule says it is a Hibernate first-level cache on a session that was
 * never closed, and names the fix.
 *
 * Rules are declarative and versioned so the pack can grow without the engine
 * changing — this is the asset that compounds. Each one carries its own evidence
 * numbers so a finding is never an unsupported assertion, and a remediation so
 * it is never just a complaint.
 *
 * Every rule is deterministic. Nothing here consults a model.
 */
import { displayClassName, type HeapIndex } from './heap-index';
import { readableClassName } from '../jvm-class-name';
import { computeClassStats, type ClassStat, type Dominators, type HeapVerdict } from './heap-analysis';
import type { StringScan } from './heap-redaction';

export type Severity = 'critical' | 'warning' | 'info';

export interface RuleFinding {
  ruleId: string;
  title: string;
  severity: Severity;
  category: 'container' | 'lifecycle' | 'framework' | 'shape';
  /** One sentence naming what was seen, with the numbers in it. */
  detail: string;
  /** What to do about it. Concrete, not "investigate further". */
  remediation: string;
  /** Bytes this finding accounts for, where that is meaningful. */
  bytes?: number;
}

export interface RuleContext {
  index: HeapIndex;
  dom: Dominators;
  verdict: HeapVerdict;
  strings: StringScan;
  liveBytes: number;
  byName: Map<string, ClassStat>;
  /** Live instances of an exact class name. */
  instancesOf(name: string): number;
  /** Live shallow bytes of an exact class name. */
  bytesOf(name: string): number;
  /** Every class whose name matches. */
  matching(pattern: RegExp): ClassStat[];
  pct(bytes: number): number;
}

interface Rule {
  id: string;
  category: RuleFinding['category'];
  run(ctx: RuleContext): RuleFinding | null;
}

const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

/** Display name of the class an object belongs to. */
const classNameOf = (index: HeapIndex, row: number): string => {
  const c = index.classOf[row];
  return c >= 0 ? displayClassName(index.classes[c].name) : '<unknown>';
};

// ── Container leaks ──────────────────────────────────────────────────────────

const unboundedCache: Rule = {
  id: 'container.unbounded-cache',
  category: 'container',
  run(ctx) {
    // A map or collection that is itself the accumulation point, holding a
    // large share of the heap, is the single most common Java leak there is.
    const s = ctx.verdict.suspects[0];
    if (!s || s.retainedPercent < 25) return null;
    const holder = s.heldIn?.className ?? s.className;
    if (!/(Map|Set|List|Cache|Queue|Deque|Collection)/.test(holder)) return null;
    return {
      ruleId: this.id,
      title: 'Unbounded collection holding most of the heap',
      severity: s.retainedPercent >= 50 ? 'critical' : 'warning',
      category: this.category,
      detail: `${holder} retains ${mb(s.retainedBytes)} (${s.retainedPercent.toFixed(1)}% of live heap) across ${s.retainedObjects.toLocaleString()} objects${s.accumulates ? `, mostly ${s.accumulates.count.toLocaleString()} × ${readableClassName(s.accumulates.className)}` : ''}.`,
      remediation: `Give this collection a bound and an eviction policy. If it is a cache, use one with a size or time limit (Caffeine, Guava) rather than a plain ${holder.split('.').pop()}. If it is a registry, make sure entries are removed on the matching lifecycle event.`,
      bytes: s.retainedBytes,
    };
  },
};

const oversizedCollections: Rule = {
  id: 'container.oversized-backing-arrays',
  category: 'container',
  run(ctx) {
    // Collections grow their backing array by doubling and never shrink, so a
    // collection that peaked large stays large even after it is emptied.
    const arrays = ctx.matching(/^\[L(java\.lang\.Object|java\.util\.HashMap\$Node|java\.util\.concurrent\.ConcurrentHashMap\$Node);$/);
    const bytes = arrays.reduce((t, a) => t + a.shallowBytes, 0);
    if (ctx.pct(bytes) < 15) return null;
    const count = arrays.reduce((t, a) => t + a.instances, 0);
    return {
      ruleId: this.id,
      title: 'Collection backing arrays dominate the heap',
      severity: 'warning',
      category: this.category,
      detail: `${count.toLocaleString()} collection backing arrays occupy ${mb(bytes)} (${ctx.pct(bytes).toFixed(1)}% of live heap).`,
      remediation: 'Size collections at construction where the capacity is known, and replace long-lived collections that have been emptied — clear() keeps the grown array, only a fresh instance releases it.',
      bytes,
    };
  },
};

const duplicateStrings: Rule = {
  id: 'container.duplicate-strings',
  category: 'container',
  run(ctx) {
    const wasted = ctx.strings.duplicates.reduce((t, d) => t + d.wastedBytes, 0);
    // The scan is a sample, so scale the estimate to the whole population and
    // say so rather than quoting the sample figure as a total.
    const scaled = ctx.strings.coverage > 0 ? wasted / ctx.strings.coverage : wasted;
    if (scaled < 2 * 1048576) return null;
    const top = ctx.strings.duplicates[0];
    return {
      ruleId: this.id,
      title: 'Duplicated string content',
      severity: ctx.pct(scaled) > 10 ? 'warning' : 'info',
      category: this.category,
      detail: `Roughly ${mb(scaled)} is duplicate string content, extrapolated from a ${(ctx.strings.coverage * 100).toFixed(1)}% sample. The most repeated is a ${top.length}-character value seen ${top.count.toLocaleString()} times in the sample.`,
      remediation: 'Intern or canonicalise repeated values at the boundary where they are created — usually a parser, a database row mapper, or an enum-like column being read as a String. String.intern() is rarely the right tool; a small HashMap canonicaliser usually is.',
      bytes: scaled,
    };
  },
};

// ── Lifecycle leaks ──────────────────────────────────────────────────────────

const threadLocalLeak: Rule = {
  id: 'lifecycle.threadlocal',
  category: 'lifecycle',
  run(ctx) {
    const entries = ctx.instancesOf('java.lang.ThreadLocal$ThreadLocalMap$Entry');
    const threads = ctx.instancesOf('java.lang.Thread');
    if (entries < 1000 || threads === 0) return null;
    const perThread = entries / threads;
    if (perThread < 20) return null;
    return {
      ruleId: this.id,
      title: 'ThreadLocal entries accumulating on pooled threads',
      severity: perThread > 100 ? 'critical' : 'warning',
      category: this.category,
      detail: `${entries.toLocaleString()} ThreadLocal entries across ${threads} threads — about ${Math.round(perThread)} per thread.`,
      remediation: 'Pooled threads outlive the request that set the value, so the entry survives with them. Call remove() in a finally block, not just set(null), and check any framework holding request context in a ThreadLocal.',
    };
  },
};

const classloaderLeak: Rule = {
  id: 'lifecycle.classloader',
  category: 'lifecycle',
  run(ctx) {
    const loaders = ctx.matching(/ClassLoader$/).reduce((t, c) => t + c.instances, 0);
    if (loaders < 20) return null;
    return {
      ruleId: this.id,
      title: 'Many class loaders retained',
      severity: loaders > 100 ? 'critical' : 'warning',
      category: this.category,
      detail: `${loaders} class loader instances are still reachable.`,
      remediation: 'Classic hot-redeploy leak: one loader survives per deployment, keeping every class and static it loaded. Look for JDBC drivers, ThreadLocals, shutdown hooks or JMX registrations holding a reference to the old loader.',
    };
  },
};

const finalizerBacklog: Rule = {
  id: 'lifecycle.finalizer-backlog',
  category: 'lifecycle',
  run(ctx) {
    const pending = ctx.instancesOf('java.lang.ref.Finalizer');
    if (pending < 10_000) return null;
    return {
      ruleId: this.id,
      title: 'Finalizer queue backlog',
      severity: pending > 100_000 ? 'critical' : 'warning',
      category: this.category,
      detail: `${pending.toLocaleString()} objects are waiting on the finalizer queue.`,
      remediation: 'The finalizer thread cannot keep up, so these objects and everything they hold cannot be collected. Replace finalize() with an explicit close()/try-with-resources, or a Cleaner.',
    };
  },
};

const unreachableBacklog: Rule = {
  id: 'lifecycle.uncollected',
  category: 'lifecycle',
  run(ctx) {
    const { unreachableBytes, unreachableObjects } = ctx.verdict;
    if (ctx.pct(unreachableBytes) < 20) return null;
    return {
      ruleId: this.id,
      title: 'Large amount of uncollected garbage in the dump',
      severity: 'info',
      category: this.category,
      detail: `${unreachableObjects.toLocaleString()} objects (${mb(unreachableBytes)}) are unreachable but still present.`,
      remediation: 'The dump was taken without a preceding full GC, so these numbers overstate live usage. Re-take it with a live-objects-only dump (jmap -dump:live) before drawing conclusions about growth.',
      bytes: unreachableBytes,
    };
  },
};

// ── Framework signatures ─────────────────────────────────────────────────────

interface Signature {
  id: string;
  title: string;
  classes: RegExp;
  minPercent: number;
  detail: (bytes: number, pct: number, count: number) => string;
  remediation: string;
}

const SIGNATURES: Signature[] = [
  {
    id: 'framework.hibernate-session',
    title: 'Hibernate persistence context retained',
    classes: /^org\.hibernate\.(engine|internal|collection)\./,
    minPercent: 5,
    detail: (b, p, c) => `${c.toLocaleString()} Hibernate engine objects hold ${mb(b)} (${p.toFixed(1)}%).`,
    remediation: 'A Session or EntityManager is being kept open past its transaction, so its first-level cache grows without bound. Scope it to the transaction, and call clear() inside long batch loops.',
  },
  {
    id: 'framework.netty-bytebuf',
    title: 'Netty buffers not released',
    classes: /^io\.netty\.buffer\./,
    minPercent: 10,
    detail: (b, p, c) => `${c.toLocaleString()} Netty buffer objects hold ${mb(b)} (${p.toFixed(1)}%).`,
    remediation: 'Reference-counted buffers are not being released. Ensure every retain() has a matching release() in a finally block, and run with -Dio.netty.leakDetection.level=paranoid to find the site.',
  },
  {
    id: 'framework.connection-pool',
    title: 'Connection pool holding significant memory',
    classes: /^(com\.zaxxer\.hikari|org\.apache\.commons\.dbcp|com\.mchange\.v2)\./,
    minPercent: 5,
    detail: (b, p, c) => `${c.toLocaleString()} pool objects hold ${mb(b)} (${p.toFixed(1)}%).`,
    remediation: 'Usually connections that were borrowed and never returned, each holding statement and result-set state. Check for missing close() on Connection/Statement/ResultSet, and lower the pool maximum.',
  },
  {
    id: 'framework.jackson-mappers',
    title: 'Duplicate Jackson ObjectMappers',
    classes: /^com\.fasterxml\.jackson\.databind\.ObjectMapper$/,
    minPercent: 0,
    detail: (b, p, c) => `${c.toLocaleString()} ObjectMapper instances (${mb(b)}).`,
    remediation: 'ObjectMapper is thread-safe once configured and carries a large serializer cache. Create one per application, not one per request or per class.',
  },
  {
    id: 'framework.kafka-buffers',
    title: 'Kafka client buffers retained',
    classes: /^org\.apache\.kafka\.(clients|common)\./,
    minPercent: 10,
    detail: (b, p, c) => `${c.toLocaleString()} Kafka client objects hold ${mb(b)} (${p.toFixed(1)}%).`,
    remediation: 'Usually unacknowledged records piling up because the consumer cannot keep up. Reduce max.poll.records or fetch.max.bytes, or make the handler faster.',
  },
  {
    id: 'framework.logging-queue',
    title: 'Logging framework queue growing',
    classes: /^(ch\.qos\.logback|org\.apache\.logging\.log4j)\./,
    minPercent: 5,
    detail: (b, p, c) => `${c.toLocaleString()} logging objects hold ${mb(b)} (${p.toFixed(1)}%).`,
    remediation: 'An async appender queue is filling faster than it drains. Check the appender queue size and discard policy, and whether a downstream sink is blocked.',
  },
];

const signatureRules: Rule[] = SIGNATURES.map(sig => ({
  id: sig.id,
  category: 'framework' as const,
  run(ctx: RuleContext): RuleFinding | null {
    const hits = ctx.matching(sig.classes);
    if (!hits.length) return null;
    const bytes = hits.reduce((t, h) => t + h.shallowBytes, 0);
    const count = hits.reduce((t, h) => t + h.instances, 0);
    const pct = ctx.pct(bytes);
    // ObjectMapper is judged by count, everything else by share of heap.
    if (sig.minPercent === 0 ? count < 5 : pct < sig.minPercent) return null;
    return {
      ruleId: sig.id,
      title: sig.title,
      severity: pct > 25 ? 'critical' : 'warning',
      category: 'framework',
      detail: sig.detail(bytes, pct, count),
      remediation: sig.remediation,
      bytes,
    };
  },
}));

// ── Shape anomalies ──────────────────────────────────────────────────────────

const singleClassDominance: Rule = {
  id: 'shape.single-class-dominance',
  category: 'shape',
  run(ctx) {
    const stats = [...ctx.byName.values()]
      .filter(c => !c.className.startsWith('['))
      .sort((a, b) => b.shallowBytes - a.shallowBytes);
    const top = stats[0];
    if (!top || ctx.pct(top.shallowBytes) < 40) return null;
    return {
      ruleId: this.id,
      title: 'One class accounts for most of the heap',
      severity: 'warning',
      category: this.category,
      detail: `${top.className} occupies ${mb(top.shallowBytes)} (${ctx.pct(top.shallowBytes).toFixed(1)}%) across ${top.instances.toLocaleString()} instances.`,
      remediation: 'Either these instances are individually large, or far more of them exist than intended. Compare against a second dump to see whether the count is still climbing.',
      bytes: top.shallowBytes,
    };
  },
};

const deepRetentionChain: Rule = {
  id: 'shape.deep-retention-chain',
  category: 'shape',
  run(ctx) {
    // A long unbranched dominator chain means each object holds exactly one
    // other, so a single stale reference at the head pins all of them.
    //
    // Computed exactly rather than by sampling leaves. The first version walked
    // up from a bounded sample of leaves, which made the answer depend on which
    // leaves happened to be sampled — adding unrelated objects to the heap made
    // it stop finding a chain that was still there. This is one pass over the
    // dominator tree and cannot miss.
    const { idom, order } = ctx.dom;
    const n = ctx.index.count;
    const childCount = new Int32Array(n + 1);
    const onlyChild = new Int32Array(n + 1).fill(-1);
    for (let i = 1; i < order.length; i++) {
      const node = order[i];
      const d = idom[node];
      if (d < 0) continue;
      childCount[d]++;
      onlyChild[d] = childCount[d] === 1 ? node : -1;
    }

    // Reverse postorder puts a dominator before what it dominates, so walking
    // it backwards means a node's chain length is known before its parent needs it.
    const chainLen = new Int32Array(n + 1);
    let longest = 0;
    let longestHead = -1;
    for (let i = order.length - 1; i >= 1; i--) {
      const node = order[i];
      const child = childCount[node] === 1 ? onlyChild[node] : -1;
      chainLen[node] = child >= 0 ? chainLen[child] + 1 : 1;
      if (chainLen[node] > longest) { longest = chainLen[node]; longestHead = node; }
    }

    if (longest < 500) return null;
    return {
      ruleId: this.id,
      title: 'Deep unbranched retention chain',
      severity: 'info',
      category: this.category,
      detail: `${longest.toLocaleString()} objects form a chain where each holds only the next, headed by ${classNameOf(ctx.index, longestHead)}, so a single reference at the head pins all of them.`,
      remediation: 'Typically a linked list, a builder chain or a nested wrapper that was never flattened. If it is a queue, check that consumers are draining it.',
    };
  },
};

const secretsInMemory: Rule = {
  id: 'shape.credentials-in-memory',
  category: 'shape',
  run(ctx) {
    if (!ctx.strings.secrets.length) return null;
    const total = ctx.strings.secrets.reduce((t, s) => t + s.matches, 0);
    return {
      ruleId: this.id,
      title: 'Credential-shaped values present in memory',
      severity: 'warning',
      category: this.category,
      detail: `${total.toLocaleString()} sampled values match credential patterns: ${ctx.strings.secrets.map(s => `${s.kind} (${s.matches})`).join(', ')}.`,
      remediation: 'Treat this dump as a secret: it can be read by anyone who obtains the file. Store credentials in char[] and clear them after use where the API allows, and restrict who can take and keep heap dumps of this service.',
    };
  },
};

const ALL_RULES: Rule[] = [
  unboundedCache, oversizedCollections, duplicateStrings,
  threadLocalLeak, classloaderLeak, finalizerBacklog, unreachableBacklog,
  ...signatureRules,
  singleClassDominance, deepRetentionChain, secretsInMemory,
];

/** Pack version — bump when rules change, so findings can be compared over time. */
export const RULE_PACK_VERSION = '1.0.0';

export function runRules(
  index: HeapIndex, dom: Dominators, verdict: HeapVerdict, strings: StringScan,
): RuleFinding[] {
  const stats = computeClassStats(index, dom);
  const byName = new Map(stats.map(c => [c.className, c]));
  const liveBytes = verdict.liveBytes || 1;

  const ctx: RuleContext = {
    index, dom, verdict, strings, liveBytes, byName,
    instancesOf: (name) => byName.get(name)?.instances ?? 0,
    bytesOf: (name) => byName.get(name)?.shallowBytes ?? 0,
    matching: (pattern) => stats.filter(c => pattern.test(c.className)),
    pct: (bytes) => (bytes / liveBytes) * 100,
  };

  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  const findings: RuleFinding[] = [];
  for (const rule of ALL_RULES) {
    try {
      const f = rule.run(ctx);
      if (f) findings.push(f);
    } catch {
      // A broken rule must never take the whole analysis down with it.
    }
  }
  return findings.sort((a, b) => order[a.severity] - order[b.severity] || (b.bytes ?? 0) - (a.bytes ?? 0));
}
