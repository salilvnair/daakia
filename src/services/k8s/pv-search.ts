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
import * as readline from 'readline';
import {
  buildSearchMatcher, levelOf, isContinuation, hasAppTimestamp,
  type SearchOptions, type SearchMatch, type Matcher,
} from './k8s-log-search';
import type { LogLevel } from './k8s-log-stream';
import { filesForPod, type PvLogConfig, type PvFile, type PodRef } from './pv-logs';

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

/** RFC3339 or a bare `2026-08-30 06:32:25` at the head of a line. */
const TS = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/;

function timeOf(line: string): number | undefined {
  const m = TS.exec(line);
  if (!m) return undefined;
  const t = Date.parse(m[1].replace(' ', 'T'));
  return Number.isFinite(t) ? t : undefined;
}

async function scanFile(
  f: PvFile, match: Matcher, opts: SearchOptions, pod: string, namespace: string,
  budget: { left: number }, signal: { cancelled: boolean },
): Promise<{ result: PvFileResult; matches: PvMatch[] }> {
  const result: PvFileResult = {
    rel: f.rel, file: f.file, bytes: f.bytes, mtime: f.mtime, scanned: 0, matched: 0,
  };
  const matches: PvMatch[] = [];
  const before = new Ring(opts.contextLines);
  // Lines still owed an `after` context, so a hit near the end still gets it.
  let pending: { m: PvMatch; want: number }[] = [];

  let stream;
  try {
    stream = createReadStream(f.file, { encoding: 'utf8' });
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

  try {
    for await (const line of rl) {
      if (signal.cancelled) break;
      result.scanned++;

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

      const hits = match(line);
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
            ts: timeOf(line),
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

  const budget = { left: opts.maxMatchesPerPod };
  for (const f of files) {
    if (signal.cancelled) break;
    const { result: fr, matches: fm } = await scanFile(
      f, match, opts, ref.pod, ref.namespace, budget, signal,
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
