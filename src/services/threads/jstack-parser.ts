/**
 * jstack / `jcmd Thread.print` parser.
 *
 * Text rather than binary, and thousands of entries rather than millions, so
 * this is a far smaller problem than the heap parser — the value is entirely in
 * what gets computed afterwards.
 *
 * Written against a real JDK 17 dump (src/test/fixtures/threads/README.md).
 * The format is not specified anywhere and varies between vendors and versions,
 * so everything here is defensive: an unrecognised line is skipped rather than
 * throwing, because one odd frame in a 2,000-thread dump must not lose the
 * other 1,999.
 */

export type ThreadState =
  | 'NEW' | 'RUNNABLE' | 'BLOCKED' | 'WAITING' | 'TIMED_WAITING' | 'TERMINATED' | 'UNKNOWN';

export interface LockRef {
  /** Object identity from the dump, e.g. "0x000000064f8fd070". */
  id: string;
  /** Declared type of the locked object, where the dump gives one. */
  className?: string;
}

export interface StackFrame {
  raw: string;
  /** Fully qualified method, e.g. "com.acme.Service.handle". */
  method: string;
  /** Source file and line where the dump provides them. */
  file?: string;
  line?: number;
  /** True for JDK/library frames — useful for finding the application frame. */
  jdk: boolean;
}

export interface ThreadInfo {
  name: string;
  /** JVM thread number from the "#26" field. */
  number?: number;
  daemon: boolean;
  priority?: number;
  /** Milliseconds of CPU time, when the dump reports it. */
  cpuMs?: number;
  elapsedSec?: number;
  tid?: string;
  nid?: string;
  /** The raw status words, e.g. "waiting for monitor entry". */
  status: string;
  state: ThreadState;
  /** Extra detail on the state line, e.g. "on object monitor" or "parking". */
  stateDetail?: string;
  frames: StackFrame[];
  /** Monitors this thread owns. */
  locked: LockRef[];
  /** Monitor it is blocked trying to enter, if any. */
  waitingToLock?: LockRef;
  /** Condition it is parked on, if any. */
  parkingOn?: LockRef;
}

/** A deadlock cycle, either as the JVM reported it or as we found it ourselves. */
export interface DeadlockCycle {
  threads: string[];
  /** 'jvm' when taken from the dump's own section, 'computed' when we derived it. */
  source: 'jvm' | 'computed';
}

export interface ThreadDump {
  /** Header timestamp line, when present. */
  timestamp?: string;
  /** JVM banner, e.g. "Java HotSpot(TM) 64-Bit Server VM (17.0.12+8-LTS-286…)". */
  jvm?: string;
  threads: ThreadInfo[];
  /** Deadlocks the JVM itself reported. */
  reportedDeadlocks: DeadlockCycle[];
  /** Lines the parser did not recognise — surfaced rather than hidden. */
  unparsedLines: number;
}

// ── Line patterns ────────────────────────────────────────────────────────────

/** `"name" #26 daemon prio=5 os_prio=0 cpu=0.00ms elapsed=1.69s tid=0x.. nid=0x.. status [0x..]` */
const HEADER = /^"(.*)"\s+(?:#(\d+)\s+)?(daemon\s+)?(?:prio=(\d+)\s+)?(?:os_prio=\S+\s+)?(?:cpu=([\d.]+)ms\s+)?(?:elapsed=([\d.]+)s\s+)?(?:allocated=\S+\s+)?(?:defined_classes=\S+\s+)?(?:tid=(\S+)\s+)?(?:nid=(\S+)\s+)?(.*?)(?:\s*\[[0-9a-fx]+\])?$/;

const STATE = /^\s*java\.lang\.Thread\.State:\s*(\w+)(?:\s*\((.*)\))?/;
const FRAME = /^\s*at\s+(.+)$/;
const LOCKED = /^\s*-\s+locked\s+<(\S+)>(?:\s*\(a\s+([^)]+)\))?/;
const WAITING_TO_LOCK = /^\s*-\s+waiting to lock\s+<(\S+)>(?:\s*\(a\s+([^)]+)\))?/;
const PARKING = /^\s*-\s+parking to wait for\s+<(\S+)>(?:\s*\(a\s+([^)]+)\))?/;
const WAITING_ON = /^\s*-\s+waiting on\s+<(\S+)>(?:\s*\(a\s+([^)]+)\))?/;

/** "…, a java.lang.Object)," inside the JVM's own deadlock section. */
const DL_THREAD = /^"(.*)":\s*$/;
const DL_HELD_BY = /which is held by "(.*)"/;

const JDK_PREFIXES = ['java.', 'javax.', 'jdk.', 'sun.', 'com.sun.', 'kotlin.', 'scala.'];

function parseFrame(raw: string): StackFrame {
  // `com.acme.Service.handle(Service.java:42)` or
  // `java.lang.Thread.run(java.base@17.0.12/Thread.java:842)` or `…(Native Method)`
  const open = raw.lastIndexOf('(');
  const method = open > 0 ? raw.slice(0, open).trim() : raw.trim();
  let file: string | undefined;
  let line: number | undefined;

  if (open > 0) {
    const inside = raw.slice(open + 1, raw.lastIndexOf(')'));
    // Strip a module@version prefix, which JDK 9+ adds and nothing needs.
    const loc = inside.includes('/') ? inside.slice(inside.lastIndexOf('/') + 1) : inside;
    const colon = loc.lastIndexOf(':');
    if (colon > 0) {
      file = loc.slice(0, colon);
      const n = Number(loc.slice(colon + 1));
      if (Number.isFinite(n)) line = n;
    } else if (loc && loc !== 'Native Method' && loc !== 'Unknown Source') {
      file = loc;
    }
  }

  return { raw: raw.trim(), method, file, line, jdk: JDK_PREFIXES.some(p => method.startsWith(p)) };
}

const KNOWN_STATES: readonly string[] =
  ['NEW', 'RUNNABLE', 'BLOCKED', 'WAITING', 'TIMED_WAITING', 'TERMINATED'];

function toState(word: string): ThreadState {
  const s = word.toUpperCase();
  return KNOWN_STATES.includes(s) ? (s as ThreadState) : 'UNKNOWN';
}

/**
 * A thread's status words imply a state even when the explicit
 * `java.lang.Thread.State:` line is missing, which happens in dumps from some
 * vendors and in older formats.
 */
function stateFromStatus(status: string): ThreadState {
  const s = status.toLowerCase();
  if (s.includes('waiting for monitor entry')) return 'BLOCKED';
  if (s.includes('in object.wait')) return 'WAITING';
  if (s.includes('waiting on condition')) return 'WAITING';
  if (s.includes('runnable')) return 'RUNNABLE';
  return 'UNKNOWN';
}

export function parseThreadDump(text: string): ThreadDump {
  const lines = text.split(/\r?\n/);
  const threads: ThreadInfo[] = [];
  const reportedDeadlocks: DeadlockCycle[] = [];
  let timestamp: string | undefined;
  let jvm: string | undefined;
  let unparsedLines = 0;

  let current: ThreadInfo | null = null;
  const push = () => { if (current) { threads.push(current); current = null; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { continue; }

    if (!timestamp && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(trimmed)) { timestamp = trimmed; continue; }
    if (trimmed.startsWith('Full thread dump')) { jvm = trimmed.replace(/^Full thread dump\s*/, ''); continue; }

    // ── The JVM's own deadlock section ──
    if (/^Found (one|\d+) Java-level deadlock/.test(trimmed)) {
      push();
      const names: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const t = lines[j].trim();
        if (t.startsWith('Java stack information')) break;
        // Each thread shows up twice in this section — once as the waiter and
        // once as the holder named by the other. Dedupe both, or the cycle
        // reads as longer than it is and stops matching the computed one.
        const owner = DL_THREAD.exec(t);
        if (owner) { if (!names.includes(owner[1])) names.push(owner[1]); continue; }
        const held = DL_HELD_BY.exec(t);
        if (held && !names.includes(held[1])) names.push(held[1]);
      }
      if (names.length) reportedDeadlocks.push({ threads: names, source: 'jvm' });
      i = j;
      continue;
    }

    // ── Thread header ──
    if (trimmed.startsWith('"')) {
      const m = HEADER.exec(trimmed);
      if (m) {
        push();
        const status = (m[9] ?? '').trim();
        current = {
          name: m[1],
          number: m[2] ? Number(m[2]) : undefined,
          daemon: !!m[3],
          priority: m[4] ? Number(m[4]) : undefined,
          cpuMs: m[5] ? Number(m[5]) : undefined,
          elapsedSec: m[6] ? Number(m[6]) : undefined,
          tid: m[7],
          nid: m[8],
          status,
          state: stateFromStatus(status),
          frames: [], locked: [],
        };
        continue;
      }
      unparsedLines++;
      continue;
    }

    if (!current) {
      // Header noise (SMR info, JNI refs, the pid line) — not an error.
      continue;
    }

    const st = STATE.exec(line);
    if (st) { current.state = toState(st[1]); current.stateDetail = st[2]; continue; }

    const fr = FRAME.exec(line);
    if (fr) { current.frames.push(parseFrame(fr[1])); continue; }

    const lk = LOCKED.exec(line);
    if (lk) { current.locked.push({ id: lk[1], className: lk[2] }); continue; }

    const wl = WAITING_TO_LOCK.exec(line);
    if (wl) { current.waitingToLock = { id: wl[1], className: wl[2] }; continue; }

    const pk = PARKING.exec(line);
    if (pk) { current.parkingOn = { id: pk[1], className: pk[2] }; continue; }

    const wo = WAITING_ON.exec(line);
    if (wo) { current.parkingOn = { id: wo[1], className: wo[2] }; continue; }

    if (trimmed.startsWith('-') || trimmed.startsWith('at ')) unparsedLines++;
  }
  push();

  return { timestamp, jvm, threads, reportedDeadlocks, unparsedLines };
}
