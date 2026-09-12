/**
 * Frames that mean something is wrong.
 *
 * A thread dump is mostly noise — a hundred threads parked in a pool are the
 * normal state of every server. What matters is the handful sitting in a frame
 * that should never take long, and knowing which frames those are is what
 * separates someone who reads dumps for a living from someone opening their
 * first one.
 *
 * The markers are ordered by how strongly each implicates a real problem, and
 * every one of them carries the reason. A finding that says "suspicious" and
 * nothing else is worse than no finding at all, because it costs the reader
 * time to dismiss.
 */
import type { ThreadInfo, ThreadState, StackFrame } from './jstack-parser';

export type SuspectSeverity = 'critical' | 'warning' | 'info';

export interface SuspectMarker {
  id: string;
  /** Matched against the fully qualified frame, e.g. `java.net.SocketInputStream.read`. */
  pattern: RegExp;
  /** Only fires when the thread is in one of these states, if given. */
  states?: ThreadState[];
  severity: SuspectSeverity;
  title: string;
  /** Why this frame is worth looking at. Shown next to the finding. */
  why: string;
}

export interface SuspectFinding {
  markerId: string;
  severity: SuspectSeverity;
  title: string;
  why: string;
  /** Threads matching this marker, most interesting first. */
  threads: { name: string; state: ThreadState; frame: string; cpuMs?: number }[];
}

/**
 * The markers.
 *
 * A note on the socket ones, because this is the trap: before JDK 13 a blocked
 * read showed as `java.net.SocketInputStream.socketRead0`, and every guide
 * written before 2019 tells you to look for it. On 13 and later that class does
 * not exist — the same stall appears as `sun.nio.ch.NioSocketImpl.read`. A
 * modern dump matched only against the old name comes back completely clean.
 * Both are matched, and only the second one will ever fire on a current JVM.
 */
export const SUSPECT_MARKERS: SuspectMarker[] = [
  {
    id: 'socket-read-blocked',
    pattern: /^(sun\.nio\.ch\.NioSocketImpl\.(read|implRead)|java\.net\.SocketInputStream\.(read|socketRead0))/,
    states: ['RUNNABLE'],
    severity: 'critical',
    title: 'Blocked in a socket read',
    why: 'The JVM reports a socket read as RUNNABLE even though the thread is doing '
      + 'nothing but waiting for bytes. If there is no read timeout set, this thread '
      + 'will sit here until the peer replies — which may be never. This is the single '
      + 'most common cause of a service that has silently stopped serving.',
  },
  {
    id: 'jdbc-wait',
    pattern: /^(com\.zaxxer\.hikari|org\.apache\.commons\.dbcp|com\.mchange\.v2\.c3p0)/,
    severity: 'critical',
    title: 'Waiting for a database connection',
    why: 'Threads queued on the connection pool rather than on the database. The pool '
      + 'is exhausted, which usually means connections are being held far longer than '
      + 'the queries need — a leak, or a transaction left open. Raising the pool size '
      + 'moves the symptom rather than fixing it.',
  },
  {
    id: 'blocked-on-monitor',
    pattern: /./,
    states: ['BLOCKED'],
    severity: 'critical',
    title: 'Blocked on a monitor',
    why: 'Waiting to enter a synchronized block another thread holds. A few of these '
      + 'is contention; many on the same monitor is a bottleneck that serialises the '
      + 'whole service through one lock.',
  },
  {
    id: 'class-loading',
    pattern: /^java\.lang\.ClassLoader\.loadClass/,
    states: ['BLOCKED'],
    severity: 'warning',
    title: 'Blocked in class loading',
    why: 'Class loading is serialised per classloader. Under a burst of first-time '
      + 'requests this shows up as a stall that vanishes once everything is warm, so '
      + 'it is worth ruling out before chasing it as a leak.',
  },
  {
    id: 'gc-finalizer',
    pattern: /^java\.lang\.ref\.(Finalizer|ReferenceQueue)/,
    states: ['BLOCKED', 'RUNNABLE'],
    severity: 'warning',
    title: 'Finalizer thread is busy',
    why: 'The finalizer queue is backing up. Objects with finalizers cannot be '
      + 'collected until it drains, so a busy finalizer thread turns into heap '
      + 'pressure that looks exactly like a leak.',
  },
  {
    id: 'http-client-wait',
    pattern: /^(org\.apache\.http|okhttp3|java\.net\.http\.|feign\.)/,
    states: ['RUNNABLE', 'TIMED_WAITING'],
    severity: 'warning',
    title: 'Waiting on an outbound HTTP call',
    why: 'Blocked on a downstream service. If many threads are here, this instance is '
      + 'healthy and something it depends on is not — look upstream of this dump '
      + 'before changing anything here.',
  },
  {
    id: 'thread-sleep',
    pattern: /^java\.lang\.Thread\.sleep/,
    severity: 'info',
    title: 'Sleeping',
    why: 'Usually a poller or a retry backoff, and usually fine. Worth a glance only '
      + 'if a request-handling thread is doing it.',
  },
  {
    id: 'parked-pool',
    pattern: /^(java\.util\.concurrent\.locks\.LockSupport\.park|jdk\.internal\.misc\.Unsafe\.park)/,
    states: ['WAITING', 'TIMED_WAITING'],
    severity: 'info',
    title: 'Idle pool workers',
    why: 'Parked workers waiting for work. This is what a healthy idle pool looks '
      + 'like — and if most of the dump is this, the application is NOT busy and the '
      + 'problem is somewhere else entirely.',
  },
];

const SEVERITY_RANK: Record<SuspectSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** The parser already gives a fully qualified method; raw is the fallback. */
function frameSignature(frame: StackFrame): string {
  return frame.method || frame.raw.replace(/^\s*at\s+/, '').replace(/\(.*$/, '');
}

/**
 * Which markers this dump trips.
 *
 * Only the top few frames are considered. A stack is thirty frames deep and
 * `Thread.sleep` appears somewhere in most of them; what the thread is actually
 * doing is at the top, and matching deeper turns every marker into a match.
 */
const FRAMES_TO_CONSIDER = 6;

export function findSuspects(threads: ThreadInfo[]): SuspectFinding[] {
  const findings = new Map<string, SuspectFinding>();

  for (const thread of threads) {
    const top = thread.frames.slice(0, FRAMES_TO_CONSIDER);

    for (const marker of SUSPECT_MARKERS) {
      if (marker.states && !marker.states.includes(thread.state)) continue;

      let hit: string | undefined;
      for (const frame of top) {
        const sig = frameSignature(frame);
        if (marker.pattern.test(sig)) { hit = sig; break; }
      }
      // A marker with no frames at all still fires on state alone — a BLOCKED
      // thread with an empty stack is exactly the case worth reporting, and
      // requiring a frame match would drop it silently.
      if (!hit && marker.pattern.source === '.' && !top.length) hit = thread.status;
      if (!hit) continue;

      let finding = findings.get(marker.id);
      if (!finding) {
        finding = {
          markerId: marker.id, severity: marker.severity,
          title: marker.title, why: marker.why, threads: [],
        };
        findings.set(marker.id, finding);
      }
      finding.threads.push({
        name: thread.name, state: thread.state, frame: hit, cpuMs: thread.cpuMs,
      });

      // One marker per thread. Without this a blocked JDBC thread appears under
      // both 'jdbc-wait' and 'blocked-on-monitor', and the counts stop adding up.
      break;
    }
  }

  const out = [...findings.values()];
  for (const f of out) {
    // Busiest first inside a finding — the thread burning CPU in a suspicious
    // frame is the one to read.
    f.threads.sort((a, b) => (b.cpuMs ?? 0) - (a.cpuMs ?? 0));
  }
  return out.sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || b.threads.length - a.threads.length);
}

/**
 * One line summarising what the dump shows.
 *
 * Deliberately refuses to overclaim: a dump full of parked workers gets told
 * so, because "nothing is wrong here, look elsewhere" is a genuinely useful
 * answer and the one people most often fail to reach.
 */
export function summariseSuspects(findings: SuspectFinding[], totalThreads: number): string {
  const critical = findings.filter(f => f.severity === 'critical');
  if (!critical.length) {
    const idle = findings.find(f => f.markerId === 'parked-pool');
    if (idle && idle.threads.length > totalThreads / 2) {
      return `Most of this JVM's threads are parked and idle. Whatever is wrong, this process is not busy — look upstream of it.`;
    }
    return findings.length
      ? 'Nothing critical. The findings below are worth a glance, not an investigation.'
      : 'No suspicious frames. This dump looks like a JVM going about its business.';
  }
  const worst = critical[0];
  return `${worst.threads.length} thread${worst.threads.length === 1 ? '' : 's'} `
    + `${worst.title.toLowerCase()} — start there.`;
}
