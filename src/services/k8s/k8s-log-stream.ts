/**
 * Follow a pod's logs.
 *
 * The hard part is not reading the stream, it is not drowning in it. A pod
 * doing five thousand lines a second would post five thousand messages a
 * second across the webview bridge and lock the UI solid, so lines are batched
 * into frames. And when the reader cannot keep up, the buffer is trimmed and
 * the loss is REPORTED — a log viewer that silently drops lines is worse than
 * one that refuses to open, because you cannot tell the difference between
 * "nothing was logged" and "we threw it away".
 */
import type { ChildProcess } from 'child_process';
import { spawnKubectl } from './kubectl';
import {
  compileFormat, FormatMeter,
  type CompiledFormat, type LogFormat,
} from './log-format';

export interface LogLine {
  /** Monotonic within a session; the webview keys on it. */
  seq: number;
  /** Milliseconds, parsed from the kubectl timestamp when there is one. */
  ts?: number;
  /** ERROR / WARN / INFO / DEBUG, from the pod's format or a keyword sniff. */
  level: LogLevel;
  text: string;
  /**
   * Fields a FORMAT named. Never guessed.
   *
   * Absent when no format is configured, or when one is and this line did not
   * parse. The absence is the point: a UI that offers "filter by thread" can
   * only do so where a thread was actually identified, rather than where a
   * regex found a bracket and hoped.
   */
  logger?: string;
  thread?: string;
  app?: string;
  /**
   * This line belongs to the event above it rather than being one itself.
   *
   * With a format configured this is exact — it means the format did not parse
   * the line. Without one it is the older prefix heuristic, which is a guess,
   * and is marked as such by `continuationGuessed`.
   */
  continuation?: boolean;
  /** The continuation call came from heuristics, not from a format. */
  continuationGuessed?: boolean;
  /** The line exceeded MAX_LINE_LENGTH and what is here is the head of it. */
  truncated?: boolean;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'other';

export interface LogStreamCallbacks {
  onLines: (lines: LogLine[]) => void;
  onStatus: (status: 'streaming' | 'ended' | 'error', detail?: string) => void;
  /** Fired when the producer outruns the consumer and lines were discarded. */
  onDropped: (count: number) => void;
}

export interface LogStreamOptions {
  /**
   * The application's log format, already resolved for this pod.
   *
   * Resolved once by the caller and compiled once here — never per line. When
   * absent, or when a line does not match it, `levelOf` still runs, so a pod
   * with no format is exactly as good as it was before rather than worse.
   */
  format?: LogFormat;
  /**
   * Keep the stream open.
   *
   * Off by default, and that default matters: a chatty pod pushes hundreds of
   * lines a second, which makes the view unreadable, the density ribbon
   * thrash, and any attempt to select text hopeless. A snapshot of the tail is
   * what someone actually wants when they open a log; following is a thing
   * they ask for.
   */
  follow?: boolean;
  container?: string;
  /** Read the previous container — where a crashlooper's failure actually is. */
  previous?: boolean;
  tailLines?: number;
  /**
   * Which end of the log to take.
   *
   * `last` is a server-side --tail and costs nothing. `first` has no kubectl
   * equivalent — the whole log has to come back and be sliced here — so it is
   * only worth offering because "what did this pod say when it started" is a
   * real question that --tail can never answer.
   */
  direction?: 'last' | 'first';
  sinceSeconds?: number;
  timestamps?: boolean;
}

export interface LogStreamHandle {
  stop: () => void;
}

/** ~60ms: fast enough to feel live, slow enough to coalesce a busy pod. */
const FLUSH_MS = 60;
/** Above this in one flush, the excess is dropped rather than queued forever. */
const MAX_PER_FLUSH = 2_000;

const RFC3339 = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s?(.*)$/;

/**
 * The longest line worth keeping whole.
 *
 * Applications do serialise a 40MB payload onto one line, and that line has to
 * be survivable: at this size it is already unreadable, and everything
 * downstream — the format parse, the level sniff, the DOM node — pays for
 * every character. 32KB is what log-viewer settled on for the same reason, and
 * it is far past any line a person reads.
 *
 * Truncation is marked rather than silent. A log that quietly drops the end of
 * a line is worse than one that says it did.
 */
export const MAX_LINE_LENGTH = 32 * 1024;

/**
 * SGR escape sequences, stripped before anything else looks at the line.
 *
 * A container with `spring.output.ansi.enabled=always` — which is common,
 * because the JVM sees a TTY — writes the level as `\u001b[32mINFO\u001b[m`.
 * Those bytes sit between the fields, so every position a format depends on
 * shifts, the parse fails, and the line is filed as a continuation of whatever
 * came before it. One `.replace` upstream of the parse is the whole fix.
 *
 * Deliberately only the CSI sequences a logger emits, not the full terminal
 * grammar: this runs per line on a hot path.
 */
const ANSI = /\u001b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  // The test is a cheap bail-out: the overwhelming majority of lines have no
  // escape at all, and indexOf beats running the regex on all of them.
  return text.indexOf('\u001b') === -1 ? text : text.replace(ANSI, '');
}

/**
 * Classify a line.
 *
 * Deliberately simple and deliberately anchored: matching "error" anywhere
 * would paint every line mentioning an error handler red, and a log viewer
 * where most lines are red conveys nothing.
 */
export function levelOf(text: string): LogLevel {
  // Look only at the head of the line, where a level token actually appears.
  const head = text.slice(0, 120);
  /*
    The vocabulary is log4j's, java.util.logging's and syslog's together.

    It used to be five words, so a java.util.logging application — which says
    SEVERE, CONFIG, FINE, FINER, FINEST — had most of its lines classified as
    `other` and rendered plain. Nothing about that log was unusual; it just
    spoke a dialect this function had never been taught.
  */
  if (/\b(ERROR|SEVERE|FATAL|CRITICAL|CRIT|EMERGENCY|EMERG|ALERT|PANIC)\b/.test(head)) return 'error';
  if (/\bWARN(?:ING)?\b/.test(head)) return 'warn';
  if (/\b(INFO|NOTICE|CONFIG|INFORMATIONAL)\b/.test(head)) return 'info';
  if (/\b(DEBUG|TRACE|VERBOSE|FINEST|FINER|FINE)\b/.test(head)) return 'debug';
  /*
    Everything else is `other` — stack frames and throwable headers included.

    Those used to return 'error' from here, which was wrong and visibly so.
    Hibernate logs a failed connection at WARN and then dumps a 72-line trace
    under it; every one of those lines came out red beneath an amber warning,
    and the log said ERROR where the application had said WARN.

    A frame has no level of its own. It belongs to whatever event printed it —
    see `isContinuation` and the `prev` argument to parseLine.
  */
  return 'other';
}

/**
 * Is this line part of the event above it rather than an event of its own?
 *
 * A logging framework runs its conversion pattern once per EVENT and then
 * dumps the throwable raw, so everything from the exception header down to the
 * last `... N common frames omitted` carries no timestamp, no logger and no
 * level. It is one event printed across seventy lines, and it takes that
 * event's level.
 */
export function isContinuation(text: string): boolean {
  return /^\s*at\s/.test(text)
    || /^\s*Caused by:/.test(text)
    || /^\s*Suppressed:/.test(text)
    || /^\s*\.\.\.\s*\d+\s+(more|common frames omitted)/.test(text)
    || /^\t/.test(text)
    // The throwable's own first line: a fully-qualified name ending in
    // Exception, Error or Throwable.
    || /^[\w$]+(\.[\w$]+)*(Exception|Error|Throwable)(:|\s|$)/.test(text);
}

/**
 * Does the line start with the application's own timestamp?
 *
 * kubectl's `--timestamps` prefix is stripped before this runs, so what is
 * left is the application's own. A line without one, in a log whose other
 * lines have one, is the second or later line of a multi-line message —
 * Spring Boot's "Error starting ApplicationContext..." is the common case, and
 * it matches none of the stack-trace shapes above.
 */
export function hasAppTimestamp(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(text);
}

export function parseLine(
  raw: string,
  seq: number,
  hasTimestamps: boolean,
  format?: CompiledFormat,
  meter?: FormatMeter,
  /**
   * What came before, for lines that are not events of their own.
   *
   * A logging framework runs its conversion pattern once per EVENT, so a
   * message with a newline in it — or a throwable — prints its prefix on the
   * first line and dumps the rest raw. Those trailing lines carry no
   * timestamp, no logger and no level, and they belong to the event above.
   *
   * `sawAppTimestamp` is how a line with no recognisable shape is judged.
   * Spring Boot's "Error starting ApplicationContext..." is not a stack frame
   * and not a throwable header; the only thing that marks it as a
   * continuation is that every real event in this log starts with a timestamp
   * and it does not. Tracking that is what lets the rule fire without a
   * configured format, and what stops it firing in a log that never had
   * timestamps to begin with.
   */
  prev?: { level: LogLevel; sawAppTimestamp: boolean },
): LogLine {
  let ts: number | undefined;
  let text = raw;

  // kubectl's own prefix first. It is guaranteed by `--timestamps`, so this is
  // not a guess and happens regardless of the application's format.
  if (hasTimestamps) {
    const m = RFC3339.exec(raw);
    if (m) {
      const parsed = Date.parse(m[1]);
      if (Number.isFinite(parsed)) ts = parsed;
      text = m[2];
    }
  }

  // Colour codes go before anything reads a position in this line — see ANSI.
  text = stripAnsi(text);

  let truncated = false;
  if (text.length > MAX_LINE_LENGTH) {
    text = text.slice(0, MAX_LINE_LENGTH);
    truncated = true;
  }

  /*
    ── With a format, the parse decides everything ──

    A line that parses is an event and its fields are what the format named.
    A line that does not parse is a continuation of the event above it. That is
    the whole rule, and it is exact rather than heuristic: stack frames,
    `Caused by:`, wrapped SQL, ASCII-art banners, a Python traceback and a Go
    panic all fail to match an event layout, so all of them are handled without
    this file knowing what any of them are.

    The prefix heuristics below run only when there is no format to ask.
  */
  if (format && (!meter || meter.healthy)) {
    const p = meter ? meter.run(() => format.parse(text)) : format.parse(text);

    if (p) {
      return {
        seq,
        // The pod's own timestamp is more precise than the kubelet's receipt
        // time, so it wins where the format found one.
        ts: p.ts ?? ts,
        // Only sniff when the format has no level field at all. If it named
        // one and the token was unrecognised, `other` is the format's answer
        // and finding the word ERROR elsewhere in the line would be overruling
        // it — see CompiledFormat.hasLevel.
        level: p.level !== 'other' ? p.level
          : format.hasLevel ? 'other'
            : levelOf(text),
        logger: p.logger,
        thread: p.thread,
        app: p.app,
        text,
        /*
          Explicitly false, not absent.

          Three states, and consumers need all three: `true` is a continuation,
          `false` is "a format looked at this and it is an event", `undefined`
          is "nobody decided". Leaving it absent here collapsed the last two,
          so the fold fell back to its text heuristic for lines a format had
          already ruled on — and an application that logs a line beginning
          `  at the gate` would have had it folded into the event above.
        */
        continuation: false,
        truncated: truncated || undefined,
      };
    }

    /*
      Did not parse, so it is not an event.

      Inheriting the level is what keeps a WARN's seventy-line stack trace
      amber instead of repainting it red, and `continuation` lets the view fold
      it. No level of its own is invented: a frame under an event that was
      never seen — the header scrolled past, or filtered away — is left as
      `other` rather than guessed at.
    */
    return {
      seq, ts, level: prev ? prev.level : 'other', text,
      continuation: true,
      truncated: truncated || undefined,
    };
  }

  // ── No format: the older heuristics, and honest about being heuristics ──
  const guessed = classify(text, prev);
  const isCont = guessed.continuation;
  return {
    seq, ts, level: guessed.level, text,
    // Left absent when the heuristic says "event", because it did not decide
    // that — it merely failed to recognise a continuation, which is a weaker
    // claim than the format path's `false`.
    continuation: isCont || undefined,
    continuationGuessed: isCont || undefined,
    truncated: truncated || undefined,
  };
}

/**
 * The level of one line, and whether it is a continuation, in the context of
 * the line before it.
 *
 * This is the NO-FORMAT path. With a format configured, `parseLine` never
 * reaches here — a line is a continuation exactly when the format failed to
 * parse it, which needs no heuristics at all. What follows is the best that
 * can be done for a pod nobody has configured a format for, and callers can
 * tell the two apart through `continuationGuessed`.
 *
 * Order matters. A level the line states itself always wins — that is the
 * application telling you what it thinks, and nothing here should second-guess
 * it. Only when a line says nothing do we ask whether it is a continuation,
 * and a continuation takes its event's level rather than a level of its own.
 *
 * A trace with no event above it falls back to `error`, which is the one place
 * this guesses: an orphaned stack trace, with the header scrolled off or
 * filtered away, is far more often an error than anything else.
 */
function classify(
  text: string,
  prev?: { level: LogLevel; sawAppTimestamp: boolean },
): { level: LogLevel; continuation: boolean } {
  const own = levelOf(text);
  if (own !== 'other') return { level: own, continuation: false };

  if (isContinuation(text)) {
    return { level: prev ? prev.level : 'error', continuation: true };
  }

  // No shape to go on: a line with no timestamp where every event has one.
  if (prev?.sawAppTimestamp && !hasAppTimestamp(text)) {
    return { level: prev.level, continuation: true };
  }

  return { level: 'other', continuation: false };
}

export function streamLogs(
  context: string,
  namespace: string,
  pod: string,
  opts: LogStreamOptions,
  cb: LogStreamCallbacks,
): LogStreamHandle {
  const args = [
    '--context', context, '-n', namespace, 'logs', pod,
    ...(opts.follow ? ['--follow'] : []),
    ...(opts.container ? ['-c', opts.container] : []),
    ...(opts.previous ? ['--previous'] : []),
    ...(opts.timestamps !== false ? ['--timestamps'] : []),
    ...(opts.sinceSeconds ? [`--since=${opts.sinceSeconds}s`] : []),
    // Asking for the head means asking for everything and stopping early.
    opts.direction === 'first' ? '--tail=-1' : `--tail=${opts.tailLines ?? 200}`,
  ];

  const headLimit = opts.direction === 'first' ? (opts.tailLines ?? 200) : undefined;

  // Compiled once for the whole stream. Building this per line is the single
  // easiest way to turn format support into the reason the view stutters.
  const compiled = opts.format ? compileFormat(opts.format) : undefined;
  const meter = compiled ? new FormatMeter() : undefined;

  let child: ChildProcess | undefined;
  let stopped = false;
  let seq = 0;
  let pending: LogLine[] = [];
  let carry = '';
  /**
   * What the last line was, for continuations — see the note on parseLine.
   *
   * `sawAppTimestamp` latches: once this log has shown that its events start
   * with a timestamp, a later line without one is a continuation even though
   * the lines immediately around it may also lack one.
   */
  let prev: { level: LogLevel; sawAppTimestamp: boolean } | undefined;

  const remember = (line: LogLine) => {
    prev = {
      level: line.level,
      sawAppTimestamp: (prev?.sawAppTimestamp ?? false) || hasAppTimestamp(line.text),
    };
  };
  let timer: NodeJS.Timeout | undefined;

  const flush = () => {
    if (!pending.length) return;
    let batch = pending;
    pending = [];
    if (batch.length > MAX_PER_FLUSH) {
      const dropped = batch.length - MAX_PER_FLUSH;
      // Keep the NEWEST: in a live tail the recent lines are the ones being
      // read, and silently keeping the oldest would freeze the view in the past.
      batch = batch.slice(-MAX_PER_FLUSH);
      cb.onDropped(dropped);
    }
    cb.onLines(batch);
  };

  void (async () => {
    try {
      child = await spawnKubectl(args);
    } catch (err) {
      cb.onStatus('error', (err as Error).message);
      return;
    }
    if (stopped) { child.kill(); return; }

    cb.onStatus('streaming');
    timer = setInterval(flush, FLUSH_MS);

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      // A chunk boundary lands mid-line often enough that not carrying the
      // remainder would corrupt roughly one line per read.
      const parts = (carry + chunk).split('\n');
      carry = parts.pop() ?? '';
      for (const raw of parts) {
        if (!raw) continue;
        pending.push(parseLine(raw, seq++, opts.timestamps !== false, compiled, meter, prev));
        remember(pending[pending.length - 1]);
      }
      // Head mode: once we have what was asked for, stop reading. Streaming a
      // 400MB log to the floor to show its first 200 lines is not a thing to
      // do to someone's API server.
      if (headLimit !== undefined && seq >= headLimit) {
        flush();
        stopped = true;
        child?.kill();
        if (timer) clearInterval(timer);
        cb.onStatus('ended', `first ${headLimit} lines`);
      }
    });

    let stderrTail = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (d: string) => { stderrTail = (stderrTail + d).slice(-400); });

    child.on('exit', (code) => {
      if (timer) clearInterval(timer);
      // Nothing more after stop(). kill() triggers this handler, and a caller
      // that has stopped may already have torn down what these lines were for.
      // The final flush below is only correct for an exit we did not cause.
      if (stopped) return;
      if (carry) {
        pending.push(parseLine(carry, seq++, opts.timestamps !== false, compiled, meter, prev));
        remember(pending[pending.length - 1]);
        carry = '';
      }
      flush();
      const detail = stderrTail.split('\n').map(l => l.trim()).filter(Boolean)[0];
      // A follow that ends on its own means the container went away — which is
      // information, not a malfunction.
      cb.onStatus(
        code === 0 ? 'ended' : 'error',
        detail || (code === 0
          ? (opts.follow ? 'the container stopped producing output' : 'snapshot complete')
          : `kubectl exited ${code}`),
      );
    });

    child.on('error', (err) => {
      if (timer) clearInterval(timer);
      if (!stopped) cb.onStatus('error', err.message);
    });
  })();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
      child?.kill();
      child = undefined;
    },
  };
}
