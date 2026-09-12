/**
 * Thread dump analysis — deadlocks, contention, and where the threads actually are.
 *
 * Deadlock cycles are computed from the wait-for graph rather than lifted from
 * the dump's own "Found one Java-level deadlock" section. Two reasons: the JVM
 * only reports monitor deadlocks it can see at that instant, missing cycles
 * involving ReentrantLock and cross-dump patterns; and computing it means the
 * JVM's report becomes an independent check on this code rather than its source.
 * Where both exist and disagree, that is worth surfacing, not hiding.
 */
import type { DeadlockCycle, ThreadDump, ThreadInfo, ThreadState } from './jstack-parser';
import { findSuspects, summariseSuspects, type SuspectFinding } from './thread-suspects';
import { findStackShapes, type ShapeFinding } from './thread-shapes';

export interface LockContention {
  lockId: string;
  className?: string;
  /** Thread holding the monitor, when the dump says who. */
  ownerThread?: string;
  /** Threads blocked trying to enter it. */
  blockedThreads: string[];
  /** The frame the blocked threads are stuck at, when they agree on one. */
  blockedAt?: string;
}

export interface HotFrame {
  method: string;
  file?: string;
  line?: number;
  /** How many threads have this as their top application frame. */
  threads: number;
  jdk: boolean;
}

export interface ThreadGroupStat {
  /** Pool name inferred by stripping a trailing worker index. */
  name: string;
  count: number;
  byState: Partial<Record<ThreadState, number>>;
}

export interface ThreadVerdict {
  totalThreads: number;
  daemonThreads: number;
  byState: Record<ThreadState, number>;
  /** Every cycle found, computed and reported alike. */
  deadlocks: DeadlockCycle[];
  /** True when the JVM reported a deadlock this analysis did not find, or vice versa. */
  deadlockDisagreement?: string;
  contention: LockContention[];
  hotFrames: HotFrame[];
  pools: ThreadGroupStat[];
  /** Threads that are runnable and burning CPU, most first. */
  topCpu: { name: string; cpuMs: number; state: ThreadState; topFrame?: string }[];
  /** Frames known to mean trouble, worst first. */
  suspects: SuspectFinding[];
  /**
   * Bugs that exist as a relationship between two frames rather than in any
   * one of them — a transaction held across a network call, a starved pool.
   * See thread-shapes.
   */
  shapes: ShapeFinding[];
  /** One line on what the dump shows — including "nothing, look elsewhere". */
  headline: string;
}

const EMPTY_STATES = (): Record<ThreadState, number> => ({
  NEW: 0, RUNNABLE: 0, BLOCKED: 0, WAITING: 0, TIMED_WAITING: 0, TERMINATED: 0, UNKNOWN: 0,
});

/**
 * Who owns each monitor.
 *
 * A thread that is blocked on a lock does not name its owner, so ownership has
 * to come from whichever thread reports having locked it.
 */
function buildOwnership(threads: ThreadInfo[]): Map<string, string> {
  const owner = new Map<string, string>();
  for (const t of threads) {
    for (const lock of t.locked) {
      if (!owner.has(lock.id)) owner.set(lock.id, t.name);
    }
  }
  return owner;
}

/**
 * Cycles in the wait-for graph: thread → the thread holding what it waits for.
 *
 * Each thread has at most one outgoing edge, so this is a functional graph and
 * cycle detection is a walk with a visit stamp — no general SCC machinery
 * needed, and it cannot blow the stack on a long chain.
 */
export function findDeadlocks(threads: ThreadInfo[]): DeadlockCycle[] {
  const owner = buildOwnership(threads);
  const byName = new Map(threads.map(t => [t.name, t]));

  const waitsFor = new Map<string, string>();
  for (const t of threads) {
    const blockedOn = t.waitingToLock?.id;
    if (!blockedOn) continue;
    const holder = owner.get(blockedOn);
    if (holder && holder !== t.name) waitsFor.set(t.name, holder);
  }

  const state = new Map<string, number>();   // 0 unvisited, 1 on stack, 2 done
  const cycles: DeadlockCycle[] = [];

  for (const start of waitsFor.keys()) {
    if (state.get(start)) continue;
    const path: string[] = [];
    let node: string | undefined = start;

    while (node && state.get(node) !== 2) {
      if (state.get(node) === 1) {
        // Re-entered a node on the current path: everything from it onwards is the cycle.
        const at = path.indexOf(node);
        const cycle = path.slice(at);
        if (cycle.length > 1) cycles.push({ threads: cycle, source: 'computed' });
        break;
      }
      state.set(node, 1);
      path.push(node);
      node = waitsFor.get(node);
    }
    for (const n of path) state.set(n, 2);
  }

  // Deterministic ordering so two runs of the same dump report identically.
  for (const c of cycles) {
    const lowest = c.threads.reduce((a, b) => (a < b ? a : b));
    const at = c.threads.indexOf(lowest);
    c.threads = [...c.threads.slice(at), ...c.threads.slice(0, at)];
  }
  cycles.sort((a, b) => a.threads[0].localeCompare(b.threads[0]));

  // Names that appear in a cycle but not in the dump would mean a parse problem.
  return cycles.filter(c => c.threads.every(n => byName.has(n)));
}

/** Monitors with more than one thread queued behind them. */
export function findContention(threads: ThreadInfo[]): LockContention[] {
  const owner = buildOwnership(threads);
  const blocked = new Map<string, ThreadInfo[]>();

  for (const t of threads) {
    const id = t.waitingToLock?.id;
    if (!id) continue;
    const list = blocked.get(id) ?? [];
    list.push(t);
    blocked.set(id, list);
  }

  const out: LockContention[] = [];
  for (const [lockId, waiters] of blocked) {
    if (waiters.length < 2) continue;
    // The frame they are all stuck at, when they agree — that is the hot section.
    const frames = waiters.map(w => w.frames.find(f => !f.jdk)?.raw ?? w.frames[0]?.raw);
    const agreed = frames.every(f => f === frames[0]) ? frames[0] : undefined;
    out.push({
      lockId,
      className: waiters[0].waitingToLock?.className,
      ownerThread: owner.get(lockId),
      blockedThreads: waiters.map(w => w.name).sort(),
      blockedAt: agreed,
    });
  }
  return out.sort((a, b) => b.blockedThreads.length - a.blockedThreads.length);
}

/**
 * Frames many threads share.
 *
 * Application frames are counted in preference to JDK ones — "40 threads are in
 * Unsafe.park" is true of every healthy pool and says nothing, whereas 40
 * threads in one of your own methods is the finding.
 */
export function findHotFrames(threads: ThreadInfo[], limit = 10): HotFrame[] {
  const tally = new Map<string, HotFrame>();
  for (const t of threads) {
    const frame = t.frames.find(f => !f.jdk) ?? t.frames[0];
    if (!frame) continue;
    const key = `${frame.method}:${frame.line ?? ''}`;
    const hit = tally.get(key);
    if (hit) hit.threads++;
    else tally.set(key, { method: frame.method, file: frame.file, line: frame.line, threads: 1, jdk: frame.jdk });
  }
  return [...tally.values()]
    .filter(f => f.threads > 1)
    .sort((a, b) => b.threads - a.threads)
    .slice(0, limit);
}

/**
 * Group threads into pools by stripping a trailing index.
 *
 * "http-nio-8080-exec-3" and "…-exec-17" are the same pool, and a dump with 400
 * threads is unreadable until they are collapsed.
 */
export function groupThreads(threads: ThreadInfo[]): ThreadGroupStat[] {
  const groups = new Map<string, ThreadGroupStat>();
  for (const t of threads) {
    const name = t.name.replace(/[-_ #]?\d+$/, '') || t.name;
    let g = groups.get(name);
    if (!g) { g = { name, count: 0, byState: {} }; groups.set(name, g); }
    g.count++;
    g.byState[t.state] = (g.byState[t.state] ?? 0) + 1;
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

export function analyzeThreadDump(dump: ThreadDump): ThreadVerdict {
  const { threads } = dump;
  const byState = EMPTY_STATES();
  let daemonThreads = 0;
  for (const t of threads) {
    byState[t.state]++;
    if (t.daemon) daemonThreads++;
  }

  const computed = findDeadlocks(threads);

  // Rotate reported cycles to the same canonical start the computed ones use,
  // or an identical cycle written from a different thread compares as different.
  const canonical = (c: DeadlockCycle): DeadlockCycle => {
    if (c.threads.length < 2) return c;
    const lowest = c.threads.reduce((a, b) => (a < b ? a : b));
    const at = c.threads.indexOf(lowest);
    return { ...c, threads: [...c.threads.slice(at), ...c.threads.slice(0, at)] };
  };
  const reported = dump.reportedDeadlocks.map(canonical);

  // Merge the JVM's own report with ours, and say so when they differ. A cycle
  // only one side found is a fact about the tooling worth knowing.
  const key = (c: DeadlockCycle) => [...c.threads].sort().join('|');
  const computedKeys = new Set(computed.map(key));
  const reportedKeys = new Set(reported.map(key));
  const deadlocks: DeadlockCycle[] = [...computed];
  for (const r of reported) {
    if (!computedKeys.has(key(r))) deadlocks.push(r);
  }

  let deadlockDisagreement: string | undefined;
  const missedByUs = reported.filter(r => !computedKeys.has(key(r)));
  const missedByJvm = computed.filter(c => !reportedKeys.has(key(c)));
  if (missedByUs.length) {
    deadlockDisagreement = `The JVM reported ${missedByUs.length} deadlock(s) this analysis did not derive from the wait-for graph — the dump may not name every lock owner.`;
  } else if (missedByJvm.length && reported.length) {
    deadlockDisagreement = `${missedByJvm.length} cycle(s) were derived from the wait-for graph that the JVM did not report.`;
  }

  const topCpu = threads
    .filter(t => typeof t.cpuMs === 'number' && t.cpuMs > 0)
    .sort((a, b) => (b.cpuMs ?? 0) - (a.cpuMs ?? 0))
    .slice(0, 10)
    .map(t => ({
      name: t.name,
      cpuMs: t.cpuMs ?? 0,
      state: t.state,
      topFrame: (t.frames.find(f => !f.jdk) ?? t.frames[0])?.raw,
    }));

  const suspects = findSuspects(threads);

  return {
    totalThreads: threads.length,
    daemonThreads,
    byState,
    deadlocks,
    deadlockDisagreement,
    contention: findContention(threads),
    hotFrames: findHotFrames(threads),
    pools: groupThreads(threads),
    topCpu,
    suspects,
    shapes: findStackShapes(threads),
    headline: summariseSuspects(suspects, threads.length),
  };
}
