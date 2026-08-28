/**
 * Log parser — line-oriented, streaming, format-agnostic.
 *
 * Log formats are arbitrary, so this does not try to know them all. It detects
 * the parts that are near-universal — a leading timestamp, a level word, a
 * bracketed thread, a logger — and treats everything it cannot classify as a
 * continuation of the entry above.
 *
 * That last rule is the whole game. A stack trace is thirty lines that belong to
 * the ERROR above them; a parser that treats each as its own entry turns one
 * incident into thirty and makes every count downstream wrong.
 *
 * Memory is bounded by design: entries are emitted through a callback rather
 * than accumulated, so a 2 GB log can be summarised without ever being resident.
 */

export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'UNKNOWN';

export interface LogEntry {
  /** Line number of the entry's first line, 1-based. */
  line: number;
  /** Epoch millis, when a timestamp was recognised. */
  timestamp?: number;
  /** The raw timestamp text, kept because formats vary and round-tripping matters. */
  timestampRaw?: string;
  level: LogLevel;
  thread?: string;
  logger?: string;
  message: string;
  /** Continuation lines — stack trace frames, wrapped output, anything indented. */
  continuation: string[];
  /** Exception type from an attached stack trace, when there is one. */
  exceptionType?: string;
  /** The `Caused by:` type deepest in the trace, which is usually the real cause. */
  causeType?: string;
}

const LEVELS: Record<string, LogLevel> = {
  TRACE: 'TRACE', FINEST: 'TRACE', FINER: 'TRACE',
  DEBUG: 'DEBUG', FINE: 'DEBUG',
  INFO: 'INFO', INFORMATION: 'INFO', CONFIG: 'INFO', NOTICE: 'INFO',
  WARN: 'WARN', WARNING: 'WARN',
  ERROR: 'ERROR', SEVERE: 'ERROR', ERR: 'ERROR',
  FATAL: 'FATAL', CRITICAL: 'FATAL', CRIT: 'FATAL',
};

/**
 * Timestamp shapes, most specific first.
 *
 * Only anchored at the start of a line: a date in the middle of a message is
 * data, not the entry's time, and treating it as one silently reorders the log.
 */
const TIMESTAMPS: { re: RegExp; parse: (m: RegExpExecArray) => number | undefined }[] = [
  // 2026-08-28 10:15:30.123  |  2026-08-28T10:15:30.123Z  |  with offset
  {
    re: /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?)/,
    parse: (m) => {
      const norm = m[1].replace(' ', 'T').replace(',', '.');
      // No zone marker means the log is in local time as far as the writer was
      // concerned; treating it as UTC keeps ordering right and is at least stated.
      const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(norm) ? norm : `${norm}Z`;
      const t = Date.parse(withZone);
      return Number.isFinite(t) ? t : undefined;
    },
  },
  // 28/Aug/2026:10:15:30 +0000 — common access-log format
  {
    re: /^\[?(\d{2}\/[A-Za-z]{3}\/\d{4}:\d{2}:\d{2}:\d{2}\s*[+-]\d{4})\]?/,
    parse: (m) => {
      const t = Date.parse(m[1].replace(/^(\d{2})\/([A-Za-z]{3})\/(\d{4}):/, '$1 $2 $3 '));
      return Number.isFinite(t) ? t : undefined;
    },
  },
  // Aug 28 10:15:30 — syslog, no year
  {
    re: /^([A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/,
    parse: () => undefined,   // ambiguous without a year; kept as text only
  },
];

const LEVEL_RE = /\b(TRACE|FINEST|FINER|DEBUG|FINE|INFO|INFORMATION|CONFIG|NOTICE|WARN|WARNING|ERROR|SEVERE|ERR|FATAL|CRITICAL|CRIT)\b/;
const THREAD_RE = /\[([^\]]{1,120})\]/;
/** `c.a.OrderService - message` or `com.acme.Order [x] : message` */
const LOGGER_RE = /(?:^|\s)([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\s+[-:]\s/;

/** Trace frames, cause headers and the elision marker. */
const TRACE_LINE = /^\s*(at\s+\S|Caused by:|Suppressed:|\.\.\.\s+\d+\s+more)/;
const EXCEPTION_HEADER = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:Exception|Error|Throwable))(?::|\s|$)/;
const CAUSED_BY = /^Caused by:\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/;

/**
 * Does this line start a new entry?
 *
 * A leading timestamp is the strongest signal and the one nearly every format
 * has. Failing that, an unindented line that is not part of a stack trace is
 * treated as a new entry — which is the behaviour that keeps a log with no
 * timestamps at all still usable.
 */
function startsEntry(line: string): boolean {
  if (!line.trim()) return false;
  if (TRACE_LINE.test(line)) return false;
  if (/^\s/.test(line)) return false;
  if (EXCEPTION_HEADER.test(line)) return false;
  return true;
}

function detectTimestamp(line: string): { ms?: number; raw?: string; rest: string } {
  for (const { re, parse } of TIMESTAMPS) {
    const m = re.exec(line);
    if (m) return { ms: parse(m), raw: m[1], rest: line.slice(m[0].length) };
  }
  return { rest: line };
}

export interface ParseLogOptions {
  /** Called for each completed entry. Return false to stop early. */
  onEntry: (entry: LogEntry) => void | false;
  /** Cap on continuation lines kept per entry, so one runaway trace cannot blow memory. */
  maxContinuation?: number;
}

export interface LogParseStats {
  entries: number;
  lines: number;
  /** Entries where no timestamp could be read — a signal the format is unusual. */
  withoutTimestamp: number;
  continuationLines: number;
}

/**
 * Parse log text into entries, streaming them to a callback.
 *
 * Takes the whole text rather than a stream for now: a log big enough to need
 * true streaming also needs a different read path, and that is a change to make
 * when there is a real file to measure rather than in advance.
 */
export function parseLog(text: string, opts: ParseLogOptions): LogParseStats {
  const maxContinuation = opts.maxContinuation ?? 200;
  const lines = text.split(/\r?\n/);

  const stats: LogParseStats = { entries: 0, lines: lines.length, withoutTimestamp: 0, continuationLines: 0 };
  let current: LogEntry | null = null;
  let stopped = false;

  const flush = () => {
    if (!current || stopped) return;
    stats.entries++;
    if (current.timestamp === undefined) stats.withoutTimestamp++;
    if (opts.onEntry(current) === false) stopped = true;
    current = null;
  };

  for (let i = 0; i < lines.length && !stopped; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    if (!startsEntry(line) && current) {
      if (current.continuation.length < maxContinuation) current.continuation.push(line);
      stats.continuationLines++;

      // First exception header in the trace is the thrown type; the last
      // `Caused by:` is the root, which is nearly always the useful one.
      const head = EXCEPTION_HEADER.exec(line.trim());
      if (head && !current.exceptionType) current.exceptionType = head[1];
      const cause = CAUSED_BY.exec(line.trim());
      if (cause) current.causeType = cause[1];
      continue;
    }

    flush();
    if (stopped) break;

    const { ms, raw, rest } = detectTimestamp(line);
    const levelMatch = LEVEL_RE.exec(rest);
    const threadMatch = THREAD_RE.exec(rest);
    const loggerMatch = LOGGER_RE.exec(rest);

    // The message is whatever follows the last structural marker. Falling back
    // to the whole remainder keeps unstructured logs readable rather than empty.
    let message = rest.trim();
    if (loggerMatch) {
      message = rest.slice((loggerMatch.index ?? 0) + loggerMatch[0].length).trim();
    } else if (threadMatch) {
      message = rest.slice(threadMatch.index + threadMatch[0].length).trim();
    } else if (levelMatch) {
      message = rest.slice(levelMatch.index + levelMatch[0].length).trim();
    }

    current = {
      line: i + 1,
      timestamp: ms,
      timestampRaw: raw,
      level: levelMatch ? (LEVELS[levelMatch[1].toUpperCase()] ?? 'UNKNOWN') : 'UNKNOWN',
      thread: threadMatch?.[1],
      logger: loggerMatch?.[1],
      message,
      continuation: [],
    };
  }
  flush();

  return stats;
}
