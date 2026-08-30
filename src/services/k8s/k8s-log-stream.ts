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
  /** The logger or component, where the format names one. */
  logger?: string;
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
 * Classify a line.
 *
 * Deliberately simple and deliberately anchored: matching "error" anywhere
 * would paint every line mentioning an error handler red, and a log viewer
 * where most lines are red conveys nothing.
 */
export function levelOf(text: string): LogLevel {
  // Look only at the head of the line, where a level token actually appears.
  const head = text.slice(0, 120);
  if (/\b(ERROR|SEVERE|FATAL|CRITICAL)\b/.test(head)) return 'error';
  if (/\bWARN(?:ING)?\b/.test(head)) return 'warn';
  if (/\bINFO\b/.test(head)) return 'info';
  if (/\b(DEBUG|TRACE)\b/.test(head)) return 'debug';
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

  // Then the application's format, over what is left.
  if (format && (!meter || meter.healthy)) {
    const p = meter ? meter.run(() => format.parse(text)) : format.parse(text);
    if (p) {
      return {
        seq,
        // The pod's own timestamp is more precise than the kubelet's receipt
        // time, so it wins where the format found one.
        ts: p.ts ?? ts,
        level: p.level !== 'other' ? p.level : levelOf(text),
        logger: p.logger,
        text,
      };
    }
  }

  return { seq, ts, level: classify(text, prev), text };
}

/**
 * The level of one line, in the context of the line before it.
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
function classify(text: string, prev?: { level: LogLevel; sawAppTimestamp: boolean }): LogLevel {
  const own = levelOf(text);
  if (own !== 'other') return own;

  if (isContinuation(text)) return prev ? prev.level : 'error';

  // No shape to go on: a line with no timestamp where every event has one.
  if (prev?.sawAppTimestamp && !hasAppTimestamp(text)) return prev.level;

  return 'other';
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
