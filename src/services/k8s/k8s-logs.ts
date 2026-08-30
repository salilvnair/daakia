/**
 * Pull pod logs to disk.
 *
 * The whole point of a bulk export is that you are collecting evidence from
 * several pods at a moment that will not come back, so the rules here are:
 * never silently return less than was asked for, and never write a file that
 * looks complete when it is not.
 */
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { run } from './kubectl';

export type LogRange =
  | { kind: 'all' }
  | { kind: 'since'; seconds: number }
  | { kind: 'between'; fromIso: string; toIso: string };

export type LogSlice =
  | { kind: 'all' }
  | { kind: 'head'; lines: number }
  | { kind: 'tail'; lines: number };

export interface ExportOptions {
  range: LogRange;
  slice: LogSlice;
  /**
   * Also fetch the previous container's logs.
   *
   * For a CrashLoopBackOff pod the CURRENT container has usually just started
   * and its log is empty or a few lines of boot — the failure that matters is
   * in the previous one. Exporting only the current log for a crashlooper
   * produces a file that is technically correct and completely useless.
   */
  includePrevious: boolean;
  /** Keep the RFC3339 prefix kubectl adds with --timestamps. */
  keepTimestamps: boolean;
}

export interface ExportTarget {
  context: string;
  namespace: string;
  pod: string;
  /** More than one means --all-containers, so lines stay attributable. */
  containers: string[];
}

export interface ExportResult {
  pod: string;
  namespace: string;
  file?: string;
  bytes?: number;
  lines?: number;
  /** Set when the pod produced nothing — a fact, not a failure. */
  empty?: boolean;
  error?: string;
  /** True when previous-container logs were appended. */
  includedPrevious?: boolean;
}

/**
 * Build the kubectl arguments for one fetch.
 *
 * Note what is NOT here: kubectl has `--since-time` but no `--until-time`, so
 * the end of a range cannot be pushed down to the server. It is filtered here
 * instead, which is why a bounded range forces --timestamps on.
 */
function logArgs(
  t: ExportTarget,
  opts: ExportOptions,
  previous: boolean,
  needTimestamps: boolean,
): string[] {
  const args = [
    '--context', t.context, '-n', t.namespace, 'logs', t.pod,
  ];

  if (t.containers.length > 1) args.push('--all-containers=true', '--prefix');
  else if (t.containers.length === 1) args.push('-c', t.containers[0]);

  if (previous) args.push('--previous');
  if (needTimestamps) args.push('--timestamps');

  switch (opts.range.kind) {
    case 'since':
      args.push(`--since=${opts.range.seconds}s`);
      break;
    case 'between':
      // Only the start is server-side; the end is applied below.
      args.push(`--since-time=${opts.range.fromIso}`);
      break;
    case 'all':
      break;
  }

  // Ask for everything and slice locally. --tail=N would fight a head slice,
  // and for a bounded range it would take the last N of the WHOLE log rather
  // than of the range, which is a quietly wrong answer.
  args.push('--tail=-1');
  return args;
}

/** RFC3339 prefix kubectl writes with --timestamps. */
const TS_PREFIX = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s(.*)$/;

function applyRangeEnd(lines: string[], toIso: string): string[] {
  const end = Date.parse(toIso);
  if (!Number.isFinite(end)) return lines;
  const out: string[] = [];
  for (const line of lines) {
    const m = TS_PREFIX.exec(line);
    // A line without a timestamp is a continuation — a stack frame, usually —
    // so it belongs to whatever came before it rather than being dropped.
    if (!m) { if (out.length) out.push(line); continue; }
    if (Date.parse(m[1]) <= end) out.push(line);
  }
  return out;
}

function stripTimestamps(lines: string[]): string[] {
  return lines.map(l => {
    const m = TS_PREFIX.exec(l);
    return m ? m[2] : l;
  });
}

function applySlice(lines: string[], slice: LogSlice): string[] {
  if (slice.kind === 'head') return lines.slice(0, Math.max(0, slice.lines));
  if (slice.kind === 'tail') return lines.slice(-Math.max(0, slice.lines));
  return lines;
}

async function fetchLog(
  t: ExportTarget,
  opts: ExportOptions,
  previous: boolean,
): Promise<{ lines: string[]; error?: string }> {
  const bounded = opts.range.kind === 'between';
  // Timestamps are needed to filter a range end even if the user does not want
  // them in the file; they are stripped afterwards in that case.
  const needTimestamps = opts.keepTimestamps || bounded;

  const res = await run(logArgs(t, opts, previous, needTimestamps), {
    timeoutMs: 120_000,
    maxBuffer: 256 * 1024 * 1024,
  });

  if (!res.ok) {
    const err = (res.stderr || res.failure || '').split('\n')[0] ?? '';
    // "previous terminated container not found" just means the pod has never
    // restarted. Not an error worth showing next to a successful export.
    if (previous && /previous terminated container|not found/i.test(err)) {
      return { lines: [] };
    }
    return { lines: [], error: err || `kubectl exited ${res.code}` };
  }

  let lines = res.stdout.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();

  if (opts.range.kind === 'between') lines = applyRangeEnd(lines, opts.range.toIso);
  if (!opts.keepTimestamps && needTimestamps) lines = stripTimestamps(lines);
  return { lines };
}

/** Filesystem-safe, and still recognisably the pod. */
export function logFileName(pod: string, namespace: string, multiNamespace: boolean): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');
  // Two clusters can hold a pod of the same name; prefix only when it matters,
  // so the common case stays a clean `<pod>.log`.
  return multiNamespace ? `${safe(namespace)}__${safe(pod)}.log` : `${safe(pod)}.log`;
}

/**
 * Write exactly what the viewer is showing.
 *
 * No kubectl call: the lines are already on screen, already filtered, already
 * the thing the user was looking at when they decided to keep it. Re-fetching
 * would produce a DIFFERENT file — the pod has logged more since, the filter
 * would not be applied, and a range would be re-resolved against a moved
 * "now". Someone exporting what they can see should get what they can see.
 */
export async function exportVisibleLines(
  pod: string,
  namespace: string,
  lines: string[],
  destDir: string,
): Promise<ExportResult> {
  await mkdir(destDir, { recursive: true });
  const file = join(destDir, logFileName(pod, namespace, false));
  const body = lines.join('\n');
  await writeFileStream(file, body ? body + '\n' : '');
  return {
    pod, namespace, file,
    lines: lines.length,
    bytes: Buffer.byteLength(body, 'utf8'),
    empty: lines.length === 0,
  };
}

export async function exportPodLogs(
  targets: ExportTarget[],
  opts: ExportOptions,
  destDir: string,
  onProgress?: (done: number, total: number, pod: string) => void,
): Promise<ExportResult[]> {
  await mkdir(destDir, { recursive: true });

  const namespaces = new Set(targets.map(t => t.namespace));
  const multiNamespace = namespaces.size > 1;

  const results: ExportResult[] = [];
  let done = 0;

  for (const t of targets) {
    onProgress?.(done, targets.length, t.pod);
    const result: ExportResult = { pod: t.pod, namespace: t.namespace };

    try {
      const current = await fetchLog(t, opts, false);
      if (current.error) throw new Error(current.error);

      let lines = current.lines;

      if (opts.includePrevious) {
        const prev = await fetchLog(t, opts, true);
        if (prev.lines.length) {
          result.includedPrevious = true;
          // Previous run first — it is the older half of the story, and a
          // marker so nobody mistakes one run's output for the other's.
          lines = [
            `===== previous container (before the last restart) =====`,
            ...prev.lines,
            `===== current container =====`,
            ...lines,
          ];
        }
      }

      lines = applySlice(lines, opts.slice);

      const file = join(destDir, logFileName(t.pod, t.namespace, multiNamespace));
      const body = lines.join('\n');
      await writeFileStream(file, body ? body + '\n' : '');

      result.file = file;
      result.lines = lines.length;
      result.bytes = Buffer.byteLength(body, 'utf8');
      // An empty log is a real answer — usually "this pod just restarted" —
      // so the file is still written and the emptiness reported.
      if (!lines.length) result.empty = true;
    } catch (err) {
      result.error = (err as Error).message;
    }

    results.push(result);
    done++;
    onProgress?.(done, targets.length, t.pod);
  }

  return results;
}

function writeFileStream(path: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = createWriteStream(path, { encoding: 'utf8' });
    ws.on('error', reject);
    ws.on('finish', () => resolve());
    ws.end(content);
  });
}

/** Human summary for the toast, so the result is legible without opening a file. */
export function summariseExport(results: ExportResult[]): string {
  const ok = results.filter(r => r.file && !r.error);
  const empty = ok.filter(r => r.empty);
  const failed = results.filter(r => r.error);
  const lines = ok.reduce((n, r) => n + (r.lines ?? 0), 0);

  const parts = [`${ok.length} log${ok.length === 1 ? '' : 's'} written`];
  if (lines) parts.push(`${lines.toLocaleString()} lines`);
  if (empty.length) parts.push(`${empty.length} empty`);
  if (failed.length) parts.push(`${failed.length} failed`);
  return parts.join(' · ');
}
