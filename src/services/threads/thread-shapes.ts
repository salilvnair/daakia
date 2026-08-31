/**
 * Rules that read a whole stack, not one frame.
 *
 * `thread-suspects.ts` matches a marker against the frames of a thread and
 * says "this one is blocked in a socket read". That is the right shape for
 * "where is this thread", and the wrong shape for the bugs that only exist as
 * a RELATIONSHIP between two frames.
 *
 * The one that prompted this: a `@Transactional` method that makes a network
 * call. Neither frame is remarkable alone — a thread in a socket read is
 * ordinary, and a thread inside a transaction is ordinary — but a thread doing
 * both is holding a pooled database connection open across a call it does not
 * control the latency of. Under load that empties the pool and the symptom
 * appears somewhere else entirely, on threads that are merely waiting for a
 * connection.
 *
 * A heap dump cannot see this; it is a behaviour, not a memory shape. A thread
 * dump can, because both frames are on the same stack at the same instant.
 */
import type { ThreadInfo, StackFrame, ThreadState } from './jstack-parser';

export type ShapeSeverity = 'critical' | 'warning' | 'info';

/** What a frame is doing, for the UI to badge. */
export type FrameRole = 'tx-open' | 'blocking-io' | 'db-call' | 'lock-wait' | 'app' | 'plain';

export interface AnnotatedFrame {
  raw: string;
  method: string;
  file?: string;
  line?: number;
  role: FrameRole;
}

export interface ShapeFinding {
  ruleId: string;
  severity: ShapeSeverity;
  title: string;
  /** What was found, with the numbers that make it worth reading. */
  detail: string;
  remediation: string;
  /** The threads matching, with their frames annotated. */
  threads: { name: string; state: ThreadState; frames: AnnotatedFrame[] }[];
}

/*
  The frame vocabularies.

  Deliberately conservative. A false positive here tells someone their
  transaction boundary is wrong when it is not, and they will go and move code
  around to fix a thing that was never broken — which is worse than staying
  quiet. Every pattern below is a frame that means one specific thing.
*/

/** A transaction is open below this frame. */
const TX_OPEN = [
  // Spring: the interceptor is on the stack for the whole transactional call.
  /^org\.springframework\.transaction\.interceptor\.TransactionInterceptor\.invoke/,
  /^org\.springframework\.transaction\.interceptor\.TransactionAspectSupport\.invokeWithinTransaction/,
  /^org\.springframework\.orm\.jpa\.JpaTransactionManager\./,
  // Jakarta/JEE and Quarkus interceptors.
  /^jakarta\.transaction\./,
  /^io\.quarkus\.narayana\.jta\./,
  /^com\.arjuna\.ats\.jta\./,
  // Hibernate's own transaction driver.
  /^org\.hibernate\.resource\.transaction\.backend\.jdbc\.internal\.JdbcResourceLocalTransactionCoordinator/,
  /^org\.hibernate\.engine\.transaction\.internal\.TransactionImpl/,
];

/** The thread is waiting on the network, and cannot bound how long for. */
const BLOCKING_IO = [
  // JDK 13+. The pre-13 name is below; both are matched because a dump from
  // an older JVM is still a dump someone will open.
  /^java\.base\/sun\.nio\.ch\.NioSocketImpl\.(read|connect)/,
  /^sun\.nio\.ch\.NioSocketImpl\.(read|connect)/,
  /^java\.net\.SocketInputStream\.socketRead/,
  /^java\.net\.PlainSocketImpl\.socketConnect/,
  // Common clients, which sit above the socket frame and name the intent.
  /^okhttp3\./,
  /^org\.apache\.http\.impl\.io\./,
  /^org\.apache\.hc\.core5\./,
  /^java\.net\.http\/jdk\.internal\.net\.http\./,
  /^feign\./,
  /^org\.springframework\.web\.client\.RestTemplate\./,
  /^org\.springframework\.web\.reactive\.function\.client\./,
];

/** A JDBC statement is executing — the connection is definitely in use. */
const DB_CALL = [
  /^com\.mysql\.cj\.jdbc\./,
  /^org\.postgresql\.jdbc\./,
  /^oracle\.jdbc\./,
  /^com\.microsoft\.sqlserver\.jdbc\./,
  /^com\.zaxxer\.hikari\.pool\.ProxyStatement/,
  /^com\.zaxxer\.hikari\.pool\.ProxyPreparedStatement/,
];

/** Blocked entering a monitor. */
const LOCK_WAIT = [
  /^java\.lang\.Object\.wait/,
  /^jdk\.internal\.misc\.Unsafe\.park/,
  /^sun\.misc\.Unsafe\.park/,
];

const matches = (method: string, pats: RegExp[]) => pats.some(p => p.test(method));

/** What this frame is, for a badge. Order matters — the most specific wins. */
export function roleOf(frame: StackFrame): FrameRole {
  if (matches(frame.method, TX_OPEN)) return 'tx-open';
  if (matches(frame.method, DB_CALL)) return 'db-call';
  if (matches(frame.method, BLOCKING_IO)) return 'blocking-io';
  if (matches(frame.method, LOCK_WAIT)) return 'lock-wait';
  return frame.jdk ? 'plain' : 'app';
}

export function annotate(frames: StackFrame[]): AnnotatedFrame[] {
  return frames.map(f => ({
    raw: f.raw, method: f.method, file: f.file, line: f.line, role: roleOf(f),
  }));
}

/**
 * Is a transaction open on this stack, and is the thread on the network?
 *
 * The ORDER is the whole test. A stack is printed innermost-first, so the
 * transaction frame must appear BELOW the I/O frame — that is what "the call
 * happens inside the transaction" means. Finding both in any order would also
 * match a thread that finished its transaction and then made a call, which is
 * the correct way to write it.
 */
function txAcrossIo(t: ThreadInfo): { io: number; tx: number } | null {
  const io = t.frames.findIndex(f => matches(f.method, BLOCKING_IO));
  if (io === -1) return null;
  const tx = t.frames.findIndex((f, i) => i > io && matches(f.method, TX_OPEN));
  if (tx === -1) return null;
  return { io, tx };
}

/**
 * Third-party code. Not the JDK, and not yours either.
 *
 * The `jdk` flag on a frame only separates the runtime from everything else,
 * which is not the distinction that matters here: `okhttp3.Http2Stream.read`
 * is not a JDK frame, and it is also not a method anyone reading this can
 * change. Naming it as the culprit sends someone to read the source of their
 * HTTP client.
 */
const LIBRARY = [
  /^okhttp3?\./, /^retrofit2?\./, /^feign\./,
  /^org\.apache\./, /^org\.springframework\./, /^org\.hibernate\./,
  /^io\.netty\./, /^reactor\./, /^com\.zaxxer\./, /^com\.fasterxml\./,
  /^org\.postgresql\./, /^com\.mysql\./, /^oracle\./,
  /^ch\.qos\./, /^org\.slf4j\./, /^kotlin(x)?\./, /^scala\./,
];

/** Is this the caller's own code, rather than the runtime or a dependency? */
export function isApplicationFrame(frame: StackFrame): boolean {
  return !frame.jdk && !matches(frame.method, LIBRARY);
}

/**
 * The method someone has to change.
 *
 * Scanned from the network end DOWN toward the transaction, taking the first
 * frame that belongs to the application: that is the call site that reached
 * for the network while the transaction was open. Going the other way finds
 * the transactional entry point instead, which is where the transaction is
 * declared but not where the mistake is.
 */
export function culpritFrame(frames: StackFrame[], io: number, tx: number): StackFrame | undefined {
  for (let i = io + 1; i < tx; i++) {
    if (isApplicationFrame(frames[i])) return frames[i];
  }
  return undefined;
}

export function findStackShapes(threads: ThreadInfo[]): ShapeFinding[] {
  const out: ShapeFinding[] = [];

  // ── A transaction held across a network call ──
  const across = threads
    .map(t => ({ t, hit: txAcrossIo(t) }))
    .filter((x): x is { t: ThreadInfo; hit: { io: number; tx: number } } => x.hit !== null);

  if (across.length) {
    const culprits = new Set<string>();
    for (const { t, hit } of across) {
      const c = culpritFrame(t.frames, hit.io, hit.tx);
      if (c) culprits.add(c.file && c.line ? `${c.method} (${c.file}:${c.line})` : c.method);
    }

    out.push({
      ruleId: 'tx.across-network-call',
      severity: 'warning',
      title: 'Transaction held across a network call',
      detail: `${across.length} of ${threads.length} threads are inside a transaction `
        + `while blocked on the network. The database connection is held for the whole `
        + `call, and nothing here bounds how long that takes.`
        + (culprits.size ? ` In ${[...culprits].slice(0, 3).join(', ')}.` : ''),
      remediation: 'Move the call outside the transaction boundary, or make it '
        + 'asynchronous and commit first. If it must stay, give the client a timeout '
        + 'shorter than the pool\'s connection timeout so a slow dependency cannot '
        + 'empty the pool.',
      threads: across.map(({ t }) => ({
        name: t.name, state: t.state, frames: annotate(t.frames),
      })),
    });
  }

  // ── A transaction blocked on a lock ──
  //
  // Same failure, different cause: the connection is held while the thread
  // waits for a monitor rather than for a socket. Worth separating because the
  // fix is different — nothing to move, the lock is the problem.
  const onLock = threads.filter(t => {
    if (t.state !== 'BLOCKED') return false;
    return t.frames.some(f => matches(f.method, TX_OPEN));
  });

  if (onLock.length) {
    out.push({
      ruleId: 'tx.blocked-on-lock',
      severity: 'warning',
      title: 'Transaction blocked on a monitor',
      detail: `${onLock.length} thread${onLock.length === 1 ? '' : 's'} hold a database `
        + 'connection while blocked entering a synchronized block. The connection is idle '
        + 'and unavailable for as long as the lock is held by someone else.',
      remediation: 'Narrow the synchronized region, or take the lock before opening the '
        + 'transaction so the connection is not held while waiting for it.',
      threads: onLock.map(t => ({ name: t.name, state: t.state, frames: annotate(t.frames) })),
    });
  }

  // ── A JDBC statement running under no transaction is fine; running while
  //    another thread holds the pool empty is not. Reported only when both
  //    halves are visible, or it is just a busy database.
  const executing = threads.filter(t => t.frames.some(f => matches(f.method, DB_CALL)));
  const waitingForPool = threads.filter(t =>
    t.frames.some(f => /^com\.zaxxer\.hikari\.pool\.HikariPool\.getConnection/.test(f.method)
      || /^org\.apache\.commons\.dbcp2?\./.test(f.method)));

  if (waitingForPool.length && executing.length) {
    out.push({
      ruleId: 'pool.starved',
      severity: 'critical',
      title: 'Connection pool starved',
      detail: `${waitingForPool.length} thread${waitingForPool.length === 1 ? ' is' : 's are'} `
        + `waiting for a connection while ${executing.length} hold one. `
        + 'The pool is the bottleneck, not the database.',
      remediation: 'Find what the holders are doing — if any of them are on the network '
        + 'inside a transaction, that is the cause and not the pool size.',
      threads: waitingForPool.map(t => ({ name: t.name, state: t.state, frames: annotate(t.frames) })),
    });
  }

  return out;
}
