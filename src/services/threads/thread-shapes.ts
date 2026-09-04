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
import { vocabulary, matchesCategory } from '../rules/vocabulary';

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
  The frame vocabulary lives in `services/rules/vocabulary`, as data.

  The logic here is small and stable — a transaction frame above a blocking-IO
  frame is a transaction held across a network call — while the list of frames
  that MEAN those things grows every time somebody uses a framework nobody had
  thought of. Keeping the list in this file made every new framework a release,
  and gave the person running Vert.x or an in-house RPC client silence with no
  way to fix it.
*/



/** What this frame is, for a badge. Order matters — the most specific wins. */
export function roleOf(frame: StackFrame): FrameRole {
  const v = vocabulary();
  if (matchesCategory(v, 'txOpen', frame.method)) return 'tx-open';
  if (matchesCategory(v, 'dbCall', frame.method)) return 'db-call';
  if (matchesCategory(v, 'blockingIo', frame.method)) return 'blocking-io';
  if (matchesCategory(v, 'lockWait', frame.method)) return 'lock-wait';
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
  const io = t.frames.findIndex(f => matchesCategory(vocabulary(), 'blockingIo', f.method));
  if (io === -1) return null;
  const tx = t.frames.findIndex((f, i) => i > io && matchesCategory(vocabulary(), 'txOpen', f.method));
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

/** Is this the caller's own code, rather than the runtime or a dependency? */
export function isApplicationFrame(frame: StackFrame): boolean {
  return !frame.jdk && !matchesCategory(vocabulary(), 'library', frame.method);
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
    return t.frames.some(f => matchesCategory(vocabulary(), 'txOpen', f.method));
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
  const executing = threads.filter(t => t.frames.some(f => matchesCategory(vocabulary(), 'dbCall', f.method)));
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

  /*
    ── Blocking on an event loop ──

    The pitfall the reactive stacks make easy and expensive. An event loop
    serves many connections from one thread, so a blocking call on it does not
    slow one request — it stalls every request that thread is carrying, and the
    symptom is latency on endpoints that have nothing to do with the slow one.

    The thread NAME is what makes this findable. The same `RestTemplate` call
    on `http-nio-exec-3` is ordinary; on `reactor-http-nio-2` it is a bug. No
    amount of reading the stack can tell those apart.
  */
  const onLoop = threads.filter(t => matchesCategory(vocabulary(), 'eventLoop', t.name));
  const blockedLoops = onLoop.filter(t => t.frames.some(f =>
    matchesCategory(vocabulary(), 'blockingIo', f.method)
    || matchesCategory(vocabulary(), 'dbCall', f.method)));

  if (blockedLoops.length) {
    const where = new Set<string>();
    for (const t of blockedLoops) {
      const c = t.frames.find(isApplicationFrame);
      if (c) where.add(c.file && c.line ? `${c.method} (${c.file}:${c.line})` : c.method);
    }
    out.push({
      ruleId: 'reactive.blocked-event-loop',
      severity: 'critical',
      title: 'Blocking call on an event loop',
      detail: `${blockedLoops.length} of ${onLoop.length} event-loop thread`
        + `${onLoop.length === 1 ? ' is' : 's are'} blocked on I/O`
        + `${where.size ? ` in ${[...where].slice(0, 3).join(', ')}` : ''}. `
        + 'An event loop carries many connections, so this stalls every request on '
        + 'that thread — including ones that never touched the slow dependency.',
      remediation: 'Move the call off the loop: subscribeOn(Schedulers.boundedElastic()) '
        + 'in Reactor, executeBlocking in Vert.x, or a reactive driver (R2DBC rather '
        + 'than JDBC). A blocking call on an event loop is a bug even when it is fast, '
        + 'because it stops being fast under load.',
      threads: blockedLoops.map(t => ({ name: t.name, state: t.state, frames: annotate(t.frames) })),
    });
  }

  /*
    The same bug on a loop the thread NAME cannot identify.

    asyncio runs its loop on `MainThread` more often than not, so the rule
    above — which finds a loop by its name — sees nothing on a Python
    service. The stack is the identifier instead: everything the loop runs
    sits on top of `_run_once`.

    Two conditions, and both are needed:

      1. Application code ABOVE the loop frame. A loop waiting for work sits
         in `selectors.select`, which is stdlib, so an application frame there
         means the loop is inside a task rather than in the selector.

      2. The thread is not executing bytecode. py-spy reports `idle` for a
         thread that has released the GIL inside a C call — `time.sleep`, a
         synchronous socket read, a blocking driver. A loop legitimately
         running a task reads `active`.

    Either alone is normal. A loop is always running tasks, and a loop is
    often idle. Together they say the loop is stopped inside a task, which is
    the whole bug: one thread carries every connection, so it is not one slow
    request, it is all of them.
  */
  const loops = threads.filter(t =>
    t.frames.some(f => matchesCategory(vocabulary(), 'eventLoopFrame', f.method)));

  const stalled = loops.filter(t => {
    // py-spy prints innermost first, so the loop frame is BELOW the task.
    const at = t.frames.findIndex(f =>
      matchesCategory(vocabulary(), 'eventLoopFrame', f.method));
    if (at <= 0) return false;
    return t.state !== 'RUNNABLE'
      && t.frames.slice(0, at).some(isApplicationFrame);
  });

  if (stalled.length) {
    const where = new Set<string>();
    for (const t of stalled) {
      const c = t.frames.find(isApplicationFrame);
      if (c) where.add(c.file && c.line ? `${c.method} (${c.file}:${c.line})` : c.method);
    }
    out.push({
      ruleId: 'asyncio.blocked-event-loop',
      severity: 'critical',
      title: 'Blocking call on the asyncio event loop',
      detail: `${stalled.length} event loop${stalled.length === 1 ? ' is' : 's are'} `
        + `stopped inside a task rather than waiting for work`
        + `${where.size ? `, at ${[...where].slice(0, 3).join(', ')}` : ''}. `
        + 'The loop has released the GIL in a C call, which means a synchronous '
        + 'one — time.sleep, a blocking driver, requests — not an await. Every '
        + 'other task on this loop is stopped for the duration, including the ones '
        + 'that never touch the slow dependency.',
      remediation: 'Await an async equivalent (asyncio.sleep, aiohttp/httpx, asyncpg) '
        + 'or push the synchronous call off the loop with '
        + 'asyncio.to_thread / run_in_executor. A blocking call on a loop is a bug '
        + 'even when it is fast, because it stops being fast under load.',
      threads: stalled.map(t => ({ name: t.name, state: t.state, frames: annotate(t.frames) })),
    });
  }

  return out;
}
