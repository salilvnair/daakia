/**
 * Searching archived logs on the mounted volume.
 *
 * The same search as `k8s-log-search`, pointed at files instead of at the API
 * server — same matcher, same context-line handling, same caps — so a hit
 * found in an archive is presented and highlighted exactly like a live one.
 * Sharing the matcher is the point: two implementations would drift, and a
 * regex that behaved differently depending on which half of the results it
 * landed in would be worse than not searching archives at all.
 *
 * Files are streamed a line at a time and never read whole. A rotated log can
 * be gigabytes, and the reason this feature exists is to look through a lot of
 * them at once.
 */

import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import * as readline from 'readline';
import {
  buildSearchMatcher, levelOf, isContinuation, hasAppTimestamp,
  type SearchOptions, type SearchMatch, type Matcher,
} from './k8s-log-search';
import type { LogLevel } from './k8s-log-stream';
import { parseLogTime } from './log-time';
import { filesForPod, type PvLogConfig, type PvFile, type PodRef } from './pv-logs';
import { openLog, findTimeOffset } from './log-window';

/**
 * Where the window starts, in epoch ms, however it was asked for.
 *
 * An absolute start beats a relative one — the presets are only a quicker way
 * of naming a `fromMs`, so if both arrive the explicit one is the answer.
 */
function cutoffFor(opts: SearchOptions): number | undefined {
  if (opts.fromMs !== undefined) return opts.fromMs;
  return opts.sinceSeconds && opts.sinceSeconds > 0
    ? Date.now() - opts.sinceSeconds * 1000
    : undefined;
}

/** One archived file that matched, for the per-pod file list in the results. */
export interface PvFileResult {
  rel: string;
  file: string;
  bytes: number;
  mtime: number;
  scanned: number;
  matched: number;
  error?: string;
}

export interface PvPodResult {
  pod: string;
  namespace: string;
  scanned: number;
  matched: number;
  capped: boolean;
  elapsedMs: number;
  files: PvFileResult[];
  error?: string;
}

/** Same shape as a live match, with the file it came from. */
export interface PvMatch extends SearchMatch {
  source: 'archive';
  /** Root-relative path, which is what the UI shows. */
  rel: string;
  file: string;
}

/** Keeps the last N lines, for the `before` context of a hit. */
class Ring {
  private buf: string[] = [];
  constructor(private readonly n: number) {}
  push(v: string): void {
    if (this.n <= 0) return;
    this.buf.push(v);
    if (this.buf.length > this.n) this.buf.shift();
  }
  values(): string[] { return [...this.buf]; }
}



async function scanFile(
  f: PvFile, match: Matcher, opts: SearchOptions, pod: string, namespace: string,
  budget: { left: number }, signal: { cancelled: boolean },
  /** The zone this log's own timestamps are written in — see `parseLogTime`. */
  logZone: string,
): Promise<{ result: PvFileResult; matches: PvMatch[] }> {
  const result: PvFileResult = {
    rel: f.rel, file: f.file, bytes: f.bytes, mtime: f.mtime, scanned: 0, matched: 0,
  };
  const matches: PvMatch[] = [];
  const before = new Ring(opts.contextLines);
  // Lines still owed an `after` context, so a hit near the end still gets it.
  let pending: { m: PvMatch; want: number }[] = [];

  /*
    Start where the time range starts, rather than at byte 0.

    An archive is opened and bisected to find the first line at or after the
    cutoff, so `--since 1h` over a multi-gigabyte rotated log reads the last
    hour rather than the whole history. Without this the range narrowed what
    was REPORTED and not what was read — the slow half of the work happened
    either way, which is the opposite of what a filter is for.

    A failure here is not fatal: the offset falls back to 0 and the file is
    scanned in full, which is exactly the old behaviour.
  */
  const cutoffMs = cutoffFor(opts);
  const untilMs = opts.toMs;

  const gz = /\.gz$/i.test(f.file);

  let startAt = 0;
  if (cutoffMs !== undefined && !gz) {
    try {
      const win = await openLog(f.file);
      try {
        startAt = await findTimeOffset(win, cutoffMs);
      } finally {
        await win.close();
      }
    } catch {
      startAt = 0;
    }
  }

  /*
    A rotated archive is usually compressed, and reading it as text finds
    nothing.

    `app.log.gz` passes the extension filter — the check is a contains, so
    `.log` matches — and was then opened as UTF-8, which turns compressed bytes
    into replacement characters. The search ran, scanned a nonsense line count
    and reported no matches, which is indistinguishable from a file that simply
    did not contain the term.

    A gzip stream cannot be seeked into, so the time-range offset does not
    apply to one: there is no way to know where a byte lands in the compressed
    file without inflating everything before it. The range still filters what
    is reported, it just cannot save the read — which is why the range is also
    enforced per line below.
  */
  let stream;
  try {
    const raw = createReadStream(f.file, gz ? {} : { encoding: 'utf8', start: startAt });
    stream = gz ? raw.pipe(createGunzip()).setEncoding('utf8') : raw;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    return { result, matches };
  }

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  /*
    The running level, so a matched stack frame is reported at the level of the
    event that printed it rather than at no level at all.

    An archive is read start to finish, so unlike a live search there is always
    a preceding line to inherit from — the context is free, and skipping it
    would show a WARN's trace as unclassified text.
  */
  let prevLevel: LogLevel = 'other';
  let sawAppTimestamp = false;
  /** The most recent time seen, carried across lines that have none. */
  let seenTs: number | undefined;

  try {
    for await (const line of rl) {
      if (signal.cancelled) break;
      result.scanned++;

      /*
        The range, enforced on the line as well as on the offset.

        Seeking was the only thing keeping out-of-range lines out of the
        answer: everything before the cutoff was physically skipped, so no
        check was needed. A compressed file cannot be seeked, so that
        arrangement silently stopped filtering the moment one was read — a
        one-hour search returned hits from days ago, because nothing had ever
        compared a line's time to the cutoff.

        A line with no time of its own inherits the last one seen, so a stack
        frame is kept or dropped with the event that printed it, and a file
        whose format carries no timestamp at all is never filtered away.
      */
      const lineTs = parseLogTime(line, logZone);
      if (lineTs !== undefined) seenTs = lineTs;
      // The window is closed at both ends now. The seek below still handles the
      // lower one by skipping bytes; this is what makes the upper one real,
      // and what covers a compressed file, which cannot be seeked at all.
      const inRange = seenTs === undefined
        || ((cutoffMs === undefined || seenTs >= cutoffMs)
          && (untilMs === undefined || seenTs <= untilMs));

      const own = levelOf(line);
      const level: LogLevel = own !== 'other'
        ? own
        : isContinuation(line) ? (prevLevel === 'other' ? 'error' : prevLevel)
          : sawAppTimestamp && !hasAppTimestamp(line) ? prevLevel
            : 'other';
      prevLevel = level;
      sawAppTimestamp = sawAppTimestamp || hasAppTimestamp(line);

      for (const p of pending) {
        p.m.after.push(line);
        p.want--;
      }
      pending = pending.filter(p => p.want > 0);

      const hits = inRange ? match(line) : null;
      if (hits) {
        result.matched++;
        if (budget.left > 0) {
          budget.left--;
          const m: PvMatch = {
            source: 'archive',
            rel: f.rel,
            file: f.file,
            pod, namespace,
            // The archive has no cluster context; the field exists so a hit
            // renders through exactly the same component as a live one.
            context: '',
            line: result.scanned,
            ts: lineTs,
            level,
            text: line,
            hits,
            before: before.values(),
            after: [],
          };
          matches.push(m);
          if (opts.contextLines > 0) pending.push({ m, want: opts.contextLines });
        }
      }
      before.push(line);
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  } finally {
    rl.close();
    stream.destroy();
  }

  return { result, matches };
}

/**
 * Search one pod's archived files.
 *
 * Newest file first, so the most likely answer arrives before the budget runs
 * out on a pod with a year of rotated logs behind it.
 */
export async function searchPvForPod(
  cfg: PvLogConfig, ref: PodRef, opts: SearchOptions, signal: { cancelled: boolean },
): Promise<{ result: PvPodResult; matches: PvMatch[] }> {
  const started = Date.now();
  const result: PvPodResult = {
    pod: ref.pod, namespace: ref.namespace,
    scanned: 0, matched: 0, capped: false, elapsedMs: 0, files: [],
  };
  const matches: PvMatch[] = [];

  const match = buildSearchMatcher(opts);
  if (!match) {
    result.elapsedMs = Date.now() - started;
    return { result, matches };
  }

  let files: PvFile[];
  try {
    files = await filesForPod(cfg, ref);
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    result.elapsedMs = Date.now() - started;
    return { result, matches };
  }

  /*
    A file whose last write predates the window holds nothing inside it.

    Its newest line is older than the oldest line asked for, so the whole file
    can be skipped without opening it. This is what makes a narrow window over
    a long archive quick rather than merely accurate: searching the 1st to the
    5th across a year of rotations should not read the other three hundred and
    sixty days to decide they do not apply.

    Only the lower bound is safe to judge from the file's own timestamp. `mtime`
    says when the file stopped being written, which bounds its contents from
    above; nothing in the listing says when it STARTED, so a file that may end
    inside the window is opened and judged line by line.
  */
  const skipBefore = cutoffFor(opts);
  // Configured once beside the mounts, because it describes the log rather
  // than the search. UTC when unset: that is what a container writes.
  const logZone = cfg.logTimeZone || 'UTC';
  const budget = { left: opts.maxMatchesPerPod };
  for (const f of files) {
    if (signal.cancelled) break;
    if (skipBefore !== undefined && f.mtime < skipBefore) continue;
    const { result: fr, matches: fm } = await scanFile(
      f, match, opts, ref.pod, ref.namespace, budget, signal, logZone,
    );
    // A file with nothing in it is noise in the file list.
    if (fr.matched > 0 || fr.error) result.files.push(fr);
    result.scanned += fr.scanned;
    result.matched += fr.matched;
    matches.push(...fm);
  }

  result.capped = result.matched > matches.length;
  result.elapsedMs = Date.now() - started;
  return { result, matches };
}
