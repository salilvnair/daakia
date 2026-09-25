/**
 * A pod's whole log, downloaded to a temporary file and read a page at a time.
 *
 * ── Why ──
 *
 * `kubectl logs` only returns the container's current log file, and the Logs
 * tab holds a few thousand lines of it. Following one request or one thread
 * through a pod meant downloading the log and grepping it by hand. This does
 * the download — the live log and, where an archive path covers the pod, its
 * rotated files — into `~/.salilvnair/daakia-vsce/temp/logs/`, indexes it as
 * it writes, and serves it to the same log view the Logs tab uses: a window of
 * lines at a time, so a gigabyte scrolls as fast as a page, and a filter run
 * here over the whole file, so "this thread" means every line it wrote.
 *
 * ── Temporary ──
 *
 * One file per tab, deleted when the tab closes, and the whole folder emptied
 * when Daakia starts and stops — a crash leaves nothing behind for long. A
 * size cap (Settings → DK8S → Logs, default 1 GB) stops the download; what was
 * cut off is said, not hidden.
 *
 * ── Order ──
 *
 * The archive's rotated files come first, oldest to newest, then the live log,
 * so the file reads in time order. An app that writes the same lines to stdout
 * and to its own files would appear twice where the two overlap, so archive
 * lines stop at the live log's first timestamp. Archive lines are prefixed with
 * their own timestamp the way kubectl prefixes live ones, so every line parses
 * the same way.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ChildProcess } from 'child_process';
import { spawnKubectl } from './kubectl';
import { parseLine, hasAppTimestamp, type LogLine } from './k8s-log-stream';
import { compileFormat, type LogFormat, type CompiledFormat } from './log-format';
import { listInPod, type PvInPodFile } from './pv-in-pod';
import { execArgs, type PodTarget } from './pod-files';
import { LineSelector, isEmptySpec, type HostFilterSpec } from './log-filter';

export function captureRoot(): string {
  return path.join(os.homedir(), '.salilvnair', 'daakia-vsce', 'temp', 'logs');
}

/** Empty the folder — on start and on stop, so nothing outlives a session. */
export function cleanCaptures(): void {
  for (const c of captures.values()) stopChildren(c);
  captures.clear();
  try { fs.rmSync(captureRoot(), { recursive: true, force: true }); } catch { /* nothing to clean */ }
}

export const DEFAULT_CAP_BYTES = 1024 * 1024 * 1024;

export interface CaptureRequest {
  id: string;
  target: PodTarget;
  capBytes?: number;
  /** Archive roots that apply to this pod; empty for live only. */
  archiveRoots?: string[];
  /** The app name the pod's rotated files are named after, when known. */
  app?: string;
}

export interface CaptureProgress {
  phase: 'live' | 'archive' | 'indexing';
  bytes: number;
  lines: number;
  capBytes: number;
  files?: number;
}

export interface CaptureInfo {
  lines: number;
  bytes: number;
  capBytes: number;
  /** The cap stopped the download; the file holds the first `bytes` of what there was. */
  capped: boolean;
  liveBytes: number;
  archive: { files: number; bytes: number; skipped: number };
  format?: { id: string; name: string };
  firstTs?: number;
  lastTs?: number;
}

export interface CaptureCallbacks {
  onProgress: (p: CaptureProgress) => void;
  onReady: (info: CaptureInfo) => void;
  onError: (error: string) => void;
  /** Worked out from the first lines, like the Logs tab does. */
  resolveFormat?: (sample: string[]) => Promise<LogFormat | undefined>;
}

/** Line start offsets, growable without copying on every push. */
class Offsets {
  private arr = new Float64Array(1 << 16);
  length = 0;
  push(v: number) {
    if (this.length === this.arr.length) {
      const next = new Float64Array(this.arr.length * 2);
      next.set(this.arr);
      this.arr = next;
    }
    this.arr[this.length++] = v;
  }
  get(i: number) { return this.arr[i]; }
}

class Ints {
  private arr = new Int32Array(1 << 14);
  length = 0;
  push(v: number) {
    if (this.length === this.arr.length) {
      const next = new Int32Array(this.arr.length * 2);
      next.set(this.arr);
      this.arr = next;
    }
    this.arr[this.length++] = v;
  }
  get(i: number) { return this.arr[i]; }
}

interface FilterState {
  token: number;
  spec: HostFilterSpec;
  matches: Ints;
  scanned: number;
  done: boolean;
}

interface Capture {
  id: string;
  target: PodTarget;
  file: string;
  capBytes: number;
  status: 'downloading' | 'ready' | 'error' | 'closed';
  /** Start offset of every line; the end of the file follows the last. */
  offsets: Offsets;
  bytes: number;
  pendingLine: boolean;
  capped: boolean;
  liveBytes: number;
  archive: { files: number; bytes: number; skipped: number };
  format?: CompiledFormat;
  formatInfo?: { id: string; name: string };
  children: Set<ChildProcess>;
  fd?: number;
  filter?: FilterState;
  filterToken: number;
}

const captures = new Map<string, Capture>();

function safeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || 'capture';
}

/* A function, not an inline comparison: a download awaits, and closeCapture can
   run while it does — TypeScript would otherwise narrow the status and call
   every later check impossible. */
function isClosed(c: Capture): boolean {
  return c.status === 'closed';
}

function stopChildren(c: Capture): void {
  for (const ch of c.children) { try { ch.kill(); } catch { /* already gone */ } }
  c.children.clear();
}

const RFC3339_PREFIX = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s/;
/** An application's own timestamp at the start of a line, zone optional (then UTC). */
const APP_TS = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:[.,](\d{1,9}))?(Z|[+-]\d{2}:?\d{2})?/;

export function appTimestamp(line: string): number | undefined {
  const m = APP_TS.exec(line);
  if (!m) return undefined;
  const frac = m[3] ? `.${m[3].slice(0, 3).padEnd(3, '0')}` : '';
  const zone = m[4] ? (m[4] === 'Z' ? 'Z' : m[4].length === 5 ? `${m[4].slice(0, 3)}:${m[4].slice(3)}` : m[4]) : 'Z';
  const ms = Date.parse(`${m[1]}T${m[2]}${frac}${zone}`);
  return Number.isFinite(ms) ? ms : undefined;
}

/** The kubectl timestamp a stored line starts with. */
export function storedTimestamp(line: string): number | undefined {
  const m = RFC3339_PREFIX.exec(line);
  if (!m) return undefined;
  const ms = Date.parse(m[1]);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Which rotated files are this pod's, newest-first until the budget runs out,
 * then returned oldest-first to be written in time order.
 *
 * A shared volume holds every app's files; when some carry the app's name,
 * only those are taken. When none do, the volume is taken to be this pod's own.
 */
export function pickArchiveFiles(
  files: PvInPodFile[], budget: number, app?: string,
): { take: PvInPodFile[]; skipped: number } {
  let pool = files;
  if (app) {
    const named = files.filter(f => f.rel.toLowerCase().includes(app.toLowerCase()));
    if (named.length) pool = named;
  }
  const newestFirst = [...pool].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
  const take: PvInPodFile[] = [];
  let used = 0;
  for (const f of newestFirst) {
    if (used + f.bytes > budget) break;
    take.push(f);
    used += f.bytes;
  }
  return { take: take.reverse(), skipped: pool.length - take.length };
}

// ── Writing ────────────────────────────────────────────────────────────────

/** Truncate a file to its last newline; returns the new size. */
function trimToLastLine(file: string, size: number): number {
  const fd = fs.openSync(file, 'r+');
  try {
    const span = Math.min(size, 1 << 20);
    const buf = Buffer.alloc(span);
    fs.readSync(fd, buf, 0, span, size - span);
    const nl = buf.lastIndexOf(0x0a);
    const next = nl < 0 ? 0 : size - span + nl + 1;
    if (next !== size) fs.ftruncateSync(fd, next);
    return next;
  } finally {
    fs.closeSync(fd);
  }
}

/** Append text to the capture, indexing every line start. False once the cap is reached. */
function append(c: Capture, text: string): boolean {
  if (isClosed(c) || c.fd === undefined || c.capped) return false;
  let buf = Buffer.from(text, 'utf8');
  if (c.bytes + buf.length > c.capBytes) {
    /* Cut at the last whole line that fits, so the file never ends mid-line. */
    const room = c.capBytes - c.bytes;
    /* lastIndexOf counts a negative offset from the END — no room means no cut. */
    const cut = room > 0 ? buf.lastIndexOf(0x0a, room - 1) : -1;
    buf = cut >= 0 ? buf.subarray(0, cut + 1) : Buffer.alloc(0);
    c.capped = true;
  }
  if (buf.length) {
    fs.writeSync(c.fd, buf);
    let at = 0;
    while (at < buf.length) {
      if (!c.pendingLine) { c.offsets.push(c.bytes + at); c.pendingLine = true; }
      const nl = buf.indexOf(0x0a, at);
      if (nl < 0) break;
      c.pendingLine = false;
      at = nl + 1;
    }
    c.bytes += buf.length;
  }
  return !c.capped;
}

function lineCount(c: Capture): number {
  return c.offsets.length;
}

/** Run a kubectl child, feeding stdout to `onChunk`; resolves with stderr when it exits. */
function streamChild(
  c: Capture, args: string[], onChunk: (s: string) => boolean,
): Promise<{ code: number | null; stderr: string }> {
  return new Promise(resolve => {
    void spawnKubectl(args).then(child => {
      c.children.add(child);
      let stderr = '';
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (d: string) => {
        if (!onChunk(d)) { try { child.kill(); } catch { /* gone */ } }
      });
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (d: string) => { stderr = (stderr + d).slice(-2000); });
      child.on('close', code => { c.children.delete(child); resolve({ code, stderr }); });
      child.on('error', err => { c.children.delete(child); resolve({ code: -1, stderr: err.message }); });
    }).catch(err => resolve({ code: -1, stderr: (err as Error).message }));
  });
}

export async function startCapture(req: CaptureRequest, cb: CaptureCallbacks): Promise<void> {
  closeCapture(req.id);
  const root = captureRoot();
  fs.mkdirSync(root, { recursive: true });
  const id = safeId(req.id);
  const file = path.join(root, `${id}.log`);
  const livePart = path.join(root, `${id}.live.part`);
  const c: Capture = {
    id: req.id, target: req.target, file,
    capBytes: Math.max(1024 * 1024, req.capBytes ?? DEFAULT_CAP_BYTES),
    status: 'downloading', offsets: new Offsets(), bytes: 0, pendingLine: false, capped: false,
    liveBytes: 0, archive: { files: 0, bytes: 0, skipped: 0 },
    children: new Set(), filterToken: 0,
  };
  captures.set(req.id, c);
  const t = req.target;
  let lastProgress = 0;
  const progress = (phase: CaptureProgress['phase'], files?: number, force = false) => {
    const now = Date.now();
    if (!force && now - lastProgress < 250) return;
    lastProgress = now;
    cb.onProgress({ phase, bytes: c.bytes + c.liveBytes, lines: lineCount(c), capBytes: c.capBytes, files });
  };

  try {
    /* 1 — the live log, whole, to a side file: its size decides the archive's budget
       and its first timestamp where the archive stops. */
    const liveFd = fs.openSync(livePart, 'w');
    let liveFirstTs: number | undefined;
    let liveCapped = false;
    const live = await streamChild(c, [
      '--context', t.context, '-n', t.namespace, 'logs', t.pod,
      ...(t.container ? ['-c', t.container] : []),
      '--timestamps', '--tail=-1',
    ], chunk => {
      /* Chunks already in flight keep arriving after the kill — ignore them. */
      if (isClosed(c) || liveCapped) return false;
      if (liveFirstTs === undefined) liveFirstTs = storedTimestamp(chunk);
      const buf = Buffer.from(chunk, 'utf8');
      if (c.liveBytes + buf.length > c.capBytes) {
        /* Keep what fits, up to the last whole line — never a half line at the end. */
        /* lastIndexOf counts a negative offset from the END — no room means no cut. */
        const room = c.capBytes - c.liveBytes;
        const cut = room > 0 ? buf.lastIndexOf(0x0a, room - 1) : -1;
        if (cut >= 0) { fs.writeSync(liveFd, buf.subarray(0, cut + 1)); c.liveBytes += cut + 1; }
        liveCapped = true;
        return false;
      }
      fs.writeSync(liveFd, buf);
      c.liveBytes += buf.length;
      progress('live');
      return true;
    });
    fs.closeSync(liveFd);
    /* A cut download may end mid-line when no newline fell inside the room left. */
    if (liveCapped && c.liveBytes > 0) c.liveBytes = trimToLastLine(livePart, c.liveBytes);
    if (isClosed(c)) return;
    if (live.code !== 0 && !c.liveBytes && !liveCapped) {
      throw new Error(live.stderr.trim().split('\n').pop() || `kubectl logs exited ${live.code}`);
    }

    /* Read-write: pages are read back from the same descriptor that writes them. */
    c.fd = fs.openSync(file, 'w+');

    /* 2 — the archive, oldest file first, up to where the live log begins. */
    const budget = c.capBytes - c.liveBytes;
    if (!liveCapped && budget > 0 && req.archiveRoots?.length) {
      const all: PvInPodFile[] = [];
      for (const r of req.archiveRoots) {
        const listing = await listInPod(t, r);
        all.push(...listing.files);
      }
      const { take, skipped } = pickArchiveFiles(all, budget, req.app);
      c.archive.skipped = skipped;
      let lastIso = '';
      let reachedLive = false;
      for (const f of take) {
        if (isClosed(c) || reachedLive || c.capped) break;
        c.archive.files++;
        let carry = '';
        const before = c.bytes;
        await streamChild(c, execArgs(t, ['cat', f.path]), chunk => {
          const parts = (carry + chunk).split('\n');
          carry = parts.pop() ?? '';
          let out = '';
          for (const raw of parts) {
            const ts = appTimestamp(raw);
            if (ts !== undefined) {
              if (liveFirstTs !== undefined && ts >= liveFirstTs) { reachedLive = true; break; }
              lastIso = new Date(ts).toISOString();
            }
            const iso = lastIso || new Date(f.mtime ?? Date.now()).toISOString();
            out += `${iso} ${raw}\n`;
          }
          const more = append(c, out);
          progress('archive', c.archive.files);
          return more && !reachedLive && !isClosed(c);
        });
        if (carry && !reachedLive) {
          const ts = appTimestamp(carry);
          append(c, `${ts !== undefined ? new Date(ts).toISOString() : lastIso || new Date().toISOString()} ${carry}\n`);
        }
        c.archive.bytes += c.bytes - before;
      }
    }

    /* 3 — the live log after it. */
    if (!isClosed(c) && !c.capped) {
      const rs = fs.createReadStream(livePart, { encoding: 'utf8', highWaterMark: 1 << 20 });
      for await (const chunk of rs) {
        if (!append(c, chunk as string) || isClosed(c)) break;
        progress('indexing');
      }
    }
    try { fs.rmSync(livePart, { force: true }); } catch { /* gone */ }
    if (liveCapped) c.capped = true;
    if (isClosed(c)) return;

    /* 4 — the format, from the first lines, the way the Logs tab picks it. */
    if (cb.resolveFormat && lineCount(c)) {
      const sample = readRaw(c, 0, Math.min(200, lineCount(c)));
      try {
        const fmt = await cb.resolveFormat(sample);
        if (fmt) { c.format = compileFormat(fmt); c.formatInfo = { id: fmt.id, name: fmt.name }; }
      } catch { /* unparsed lines still read */ }
    }

    c.status = 'ready';
    progress('indexing', c.archive.files, true);
    const n = lineCount(c);
    cb.onReady({
      lines: n, bytes: c.bytes, capBytes: c.capBytes, capped: c.capped, liveBytes: c.liveBytes,
      archive: c.archive, format: c.formatInfo,
      firstTs: n ? storedTimestamp(readRaw(c, 0, 1)[0] ?? '') : undefined,
      lastTs: n ? storedTimestamp(readRaw(c, n - 1, 1)[0] ?? '') : undefined,
    });
  } catch (err) {
    if (isClosed(c)) return;
    c.status = 'error';
    stopChildren(c);
    try { fs.rmSync(livePart, { force: true }); } catch { /* gone */ }
    cb.onError((err as Error).message);
  }
}

export function closeCapture(id: string): void {
  const c = captures.get(id);
  if (!c) return;
  c.status = 'closed';
  c.filterToken++;
  stopChildren(c);
  if (c.fd !== undefined) { try { fs.closeSync(c.fd); } catch { /* closed */ } c.fd = undefined; }
  captures.delete(id);
  try { fs.rmSync(c.file, { force: true }); } catch { /* gone */ }
  try { fs.rmSync(c.file.replace(/\.log$/, '.live.part'), { force: true }); } catch { /* gone */ }
}

// ── Reading ────────────────────────────────────────────────────────────────

function lineEnd(c: Capture, i: number): number {
  return i + 1 < c.offsets.length ? c.offsets.get(i + 1) : c.bytes;
}

/** Raw lines [from, from+count) — one read. */
function readRaw(c: Capture, from: number, count: number): string[] {
  const n = lineCount(c);
  if (from >= n || count <= 0 || c.fd === undefined) return [];
  const to = Math.min(n, from + count);
  const start = c.offsets.get(from);
  const end = lineEnd(c, to - 1);
  const buf = Buffer.alloc(end - start);
  fs.readSync(c.fd, buf, 0, buf.length, start);
  const lines = buf.toString('utf8').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.map(l => (l.endsWith('\r') ? l.slice(0, -1) : l));
}

type Prev = Parameters<typeof parseLine>[5];

/** Parse lines in order, the way the stream does, carrying the continuation state. */
function parseRun(c: Capture, raw: string[], firstSeq: number, prev?: Prev): { lines: LogLine[]; prev: Prev } {
  const out: LogLine[] = [];
  let p = prev;
  raw.forEach((r, k) => {
    const line = parseLine(r, firstSeq + k, true, c.format, undefined, p);
    /* The stream's own rule — see `remember` in k8s-log-stream. */
    p = { level: line.level, sawAppTimestamp: (p?.sawAppTimestamp ?? false) || hasAppTimestamp(line.text) };
    out.push(line);
  });
  return { lines: out, prev: p };
}

/** Parse state just before line `i`, from a short look-back. */
function prevBefore(c: Capture, i: number): Prev {
  if (i <= 0) return undefined;
  const from = Math.max(0, i - 20);
  return parseRun(c, readRaw(c, from, i - from), from).prev;
}

export interface CapturePage {
  /** Position of the first line in the list being paged — the file, or the filter's matches. */
  from: number;
  total: number;
  filtered: boolean;
  /** Still scanning: `total` will grow. */
  partial: boolean;
  lines: LogLine[];
}

/** A page of lines: the file's own, or the filter's matches when a filter is on. */
export function readPage(id: string, from: number, count: number): CapturePage | undefined {
  const c = captures.get(id);
  if (!c || c.fd === undefined) return undefined;
  const f = c.filter;
  if (!f) {
    const total = lineCount(c);
    const start = Math.max(0, Math.min(from, total));
    const raw = readRaw(c, start, count);
    return { from: start, total, filtered: false, partial: c.status === 'downloading', lines: parseRun(c, raw, start, prevBefore(c, start)).lines };
  }
  const total = f.matches.length;
  const start = Math.max(0, Math.min(from, total));
  const end = Math.min(total, start + count);
  const lines: LogLine[] = [];
  /* Contiguous runs are read and parsed together; each run starts from the
     parse state of the line before it in the FILE, not in the match list. */
  let i = start;
  while (i < end) {
    let j = i;
    while (j + 1 < end && f.matches.get(j + 1) === f.matches.get(j) + 1) j++;
    const a = f.matches.get(i);
    const b = f.matches.get(j);
    lines.push(...parseRun(c, readRaw(c, a, b - a + 1), a, prevBefore(c, a)).lines);
    i = j + 1;
  }
  return { from: start, total, filtered: true, partial: !f.done, lines };
}

// ── Filtering the whole file ───────────────────────────────────────────────

export interface FilterProgress {
  token: number;
  scanned: number;
  total: number;
  matched: number;
  done: boolean;
}

/**
 * Run the log view's filter over the whole file, in batches so the host stays
 * responsive; `onProgress` reports as it goes and pages can be read from the
 * matches found so far. A newer call supersedes an older one. An empty spec
 * clears the filter.
 */
export async function filterCapture(
  id: string, spec: HostFilterSpec, onProgress: (p: FilterProgress) => void,
): Promise<void> {
  const c = captures.get(id);
  if (!c) return;
  const token = ++c.filterToken;
  if (isEmptySpec(spec)) {
    c.filter = undefined;
    onProgress({ token, scanned: lineCount(c), total: lineCount(c), matched: lineCount(c), done: true });
    return;
  }
  const state: FilterState = { token, spec, matches: new Ints(), scanned: 0, done: false };
  c.filter = state;
  const selector = new LineSelector(spec);
  const needsParse = spec.levels.length > 0 || (spec.fields?.length ?? 0) > 0;
  const out: number[] = [];
  const total = lineCount(c);
  const BATCH = 20_000;
  let prev: Prev;
  let lastReport = 0;
  for (let from = 0; from < total; from += BATCH) {
    if (c.filterToken !== token || isClosed(c)) return;
    const raw = readRaw(c, from, BATCH);
    if (needsParse) {
      const run = parseRun(c, raw, from, prev);
      prev = run.prev;
      run.lines.forEach((line, k) => selector.push(from + k, line, out));
    } else {
      /* Text only: the view tests `line.text`, which is the line without
         kubectl's timestamp — strip it and skip the full parse. */
      raw.forEach((r, k) => {
        const m = RFC3339_PREFIX.exec(r);
        selector.push(from + k, { seq: from + k, level: 'other', text: m ? r.slice(m[0].length) : r } as LogLine, out);
      });
    }
    for (const x of out) state.matches.push(x);
    out.length = 0;
    state.scanned = Math.min(total, from + BATCH);
    const now = Date.now();
    if (now - lastReport > 200) {
      lastReport = now;
      onProgress({ token, scanned: state.scanned, total, matched: state.matches.length, done: false });
    }
    /* Let other messages through between batches. */
    await new Promise(r => setImmediate(r));
  }
  if (c.filterToken !== token) return;
  state.done = true;
  onProgress({ token, scanned: total, total, matched: state.matches.length, done: true });
}

// ── Finding a line ─────────────────────────────────────────────────────────

/**
 * Where a line is, as a position in what is being paged (the file, or the
 * matches): the line with this text nearest `ts`, else the first at or after
 * `ts`. Undefined when the file is empty.
 */
export function locate(id: string, target: { ts?: number; text?: string }): number | undefined {
  const c = captures.get(id);
  if (!c || c.fd === undefined) return undefined;
  const n = lineCount(c);
  if (!n) return undefined;
  let at = 0;
  if (target.ts !== undefined) {
    /* Binary search on the stored timestamps; the file is in time order. */
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const ts = storedTimestamp(readRaw(c, mid, 1)[0] ?? '') ?? 0;
      if (ts < target.ts) lo = mid + 1; else hi = mid;
    }
    at = lo;
  }
  if (target.text) {
    const needle = target.text.trim();
    const from = Math.max(0, at - 3000);
    const raw = readRaw(c, from, 6000);
    let best = -1;
    raw.forEach((r, k) => {
      if (r.includes(needle) && (best < 0 || Math.abs(from + k - at) < Math.abs(best - at))) best = from + k;
    });
    if (best >= 0) at = best;
  }
  const f = c.filter;
  if (!f) return at;
  /* In a filtered view: the nearest match. */
  let lo = 0, hi = f.matches.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (f.matches.get(mid) < at) lo = mid + 1; else hi = mid;
  }
  return f.matches.length ? lo : undefined;
}

/** For tests. */
export function _captureState(id: string) {
  const c = captures.get(id);
  return c && { lines: lineCount(c), bytes: c.bytes, capped: c.capped, status: c.status, archive: c.archive };
}
