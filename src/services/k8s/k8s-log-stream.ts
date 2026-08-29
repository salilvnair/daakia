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

export interface LogLine {
  /** Monotonic within a session; the webview keys on it. */
  seq: number;
  /** Milliseconds, parsed from the kubectl timestamp when there is one. */
  ts?: number;
  /** ERROR / WARN / INFO / DEBUG, best-effort from the line itself. */
  level: LogLevel;
  text: string;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'other';

export interface LogStreamCallbacks {
  onLines: (lines: LogLine[]) => void;
  onStatus: (status: 'streaming' | 'ended' | 'error', detail?: string) => void;
  /** Fired when the producer outruns the consumer and lines were discarded. */
  onDropped: (count: number) => void;
}

export interface LogStreamOptions {
  container?: string;
  /** Read the previous container — where a crashlooper's failure actually is. */
  previous?: boolean;
  tailLines?: number;
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
  // An unlabelled line that looks like a stack frame belongs with its error.
  if (/^\s+at\s|^Caused by:|^\t/.test(text)) return 'error';
  return 'other';
}

export function parseLine(raw: string, seq: number, hasTimestamps: boolean): LogLine {
  if (hasTimestamps) {
    const m = RFC3339.exec(raw);
    if (m) {
      const ts = Date.parse(m[1]);
      const text = m[2];
      return { seq, ts: Number.isFinite(ts) ? ts : undefined, level: levelOf(text), text };
    }
  }
  return { seq, level: levelOf(raw), text: raw };
}

export function streamLogs(
  context: string,
  namespace: string,
  pod: string,
  opts: LogStreamOptions,
  cb: LogStreamCallbacks,
): LogStreamHandle {
  const args = [
    '--context', context, '-n', namespace, 'logs', pod, '--follow',
    ...(opts.container ? ['-c', opts.container] : []),
    ...(opts.previous ? ['--previous'] : []),
    ...(opts.timestamps !== false ? ['--timestamps'] : []),
    ...(opts.sinceSeconds ? [`--since=${opts.sinceSeconds}s`] : []),
    `--tail=${opts.tailLines ?? 2000}`,
  ];

  let child: ChildProcess | undefined;
  let stopped = false;
  let seq = 0;
  let pending: LogLine[] = [];
  let carry = '';
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
        pending.push(parseLine(raw, seq++, opts.timestamps !== false));
      }
    });

    let stderrTail = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (d: string) => { stderrTail = (stderrTail + d).slice(-400); });

    child.on('exit', (code) => {
      if (timer) clearInterval(timer);
      if (carry) { pending.push(parseLine(carry, seq++, opts.timestamps !== false)); carry = ''; }
      flush();
      if (stopped) return;
      const detail = stderrTail.split('\n').map(l => l.trim()).filter(Boolean)[0];
      // A follow that ends on its own means the container went away — which is
      // information, not a malfunction.
      cb.onStatus(code === 0 ? 'ended' : 'error', detail || (code === 0 ? 'the container stopped producing output' : `kubectl exited ${code}`));
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
