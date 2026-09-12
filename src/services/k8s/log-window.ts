/**
 * Reading part of a log file without reading the file.
 *
 * Taken from `sevdokimov/log-viewer`, which shows a 10GB log instantly and
 * holds no index: it reads a window around wherever you are looking, forwards
 * or backwards, and finds a timestamp by bisecting the file rather than by
 * scanning it.
 *
 * ── Why backwards matters ──
 *
 * The end of a log is where everyone starts. Streaming from byte 0 to find the
 * last hundred lines means reading the whole file to throw nearly all of it
 * away, and on a rotated archive that is gigabytes of IO for one screen. So
 * `readLinesBack` walks pages from the end and stops as soon as it has enough.
 *
 * ── The invariant ──
 *
 * A page is twice the longest line we will keep. That guarantees any page
 * contains at least one complete line boundary, which is what lets a window be
 * snapped to line edges without ever growing unboundedly while hunting for a
 * newline. log-viewer asserts the same relationship for the same reason.
 */
import { open, type FileHandle } from 'fs/promises';
import { DATE_SHAPES } from './log-format';

/** 64KB, the unit every read is rounded to. */
export const WINDOW_SIZE = 64 * 1024;

/** The longest line kept whole. Matches the stream's own cap. */
export const MAX_LINE_LENGTH = 32 * 1024;

// A window must be able to hold a maximal line plus the boundary either side.
if (WINDOW_SIZE < MAX_LINE_LENGTH * 2) {
  throw new Error('WINDOW_SIZE must be at least twice MAX_LINE_LENGTH');
}

export interface LogWindow {
  size: number;
  /** Bytes actually read, for tests and for the footer's honesty. */
  bytesRead: number;
  close: () => Promise<void>;
  read: (from: number, length: number) => Promise<string>;
}

export async function openLog(file: string): Promise<LogWindow> {
  const fh: FileHandle = await open(file, 'r');
  const { size } = await fh.stat();
  let bytesRead = 0;

  return {
    size,
    get bytesRead() { return bytesRead; },
    close: () => fh.close(),
    read: async (from: number, length: number) => {
      const start = Math.max(0, Math.min(from, size));
      const want = Math.max(0, Math.min(length, size - start));
      if (!want) return '';
      const buf = Buffer.allocUnsafe(want);
      const { bytesRead: n } = await fh.read(buf, 0, want, start);
      bytesRead += n;
      return buf.toString('utf8', 0, n);
    },
  } as LogWindow;
}

export interface LineSlice {
  lines: string[];
  /** Byte offset of the first line returned. */
  start: number;
  /** Byte offset just past the last line returned. */
  end: number;
}

/**
 * The last `maxLines` complete lines ending at `endPos`.
 *
 * Reads pages backwards and stops the moment it has enough, so the cost is
 * proportional to what was asked for rather than to the file.
 *
 * The first line of the first page read is dropped unless the page began at
 * byte 0, because a page boundary lands mid-line and that fragment is the tail
 * of a line whose head has not been read. Keeping it would show half a line as
 * though it were whole.
 */
export async function readLinesBack(
  win: LogWindow, endPos: number, maxLines: number,
): Promise<LineSlice> {
  const end = Math.max(0, Math.min(endPos, win.size));
  if (!end || maxLines <= 0) return { lines: [], start: end, end };

  let from = end;
  let collected: string[] = [];
  let text = '';

  while (from > 0 && collected.length <= maxLines) {
    const pageStart = Math.max(0, from - WINDOW_SIZE);
    const page = await win.read(pageStart, from - pageStart);
    text = page + text;
    from = pageStart;

    const parts = text.split('\n');
    // A trailing empty part means the slice ended on a newline; drop it so an
    // empty string is not counted as a line.
    if (parts.length && parts[parts.length - 1] === '') parts.pop();
    collected = parts;

    if (from === 0) break;
    // The head of this page may be a fragment; only trust it once byte 0 is in.
    if (collected.length > maxLines) break;
  }

  if (from > 0 && collected.length) {
    collected = collected.slice(1);   // the fragment at the page boundary
  }

  const lines = collected.slice(-maxLines);
  // Where those lines actually begin, so a caller can page further back.
  const consumed = lines.reduce((n, l) => n + Buffer.byteLength(l, 'utf8') + 1, 0);
  return { lines, start: Math.max(0, end - consumed), end };
}

/**
 * Up to `maxLines` complete lines starting at `from`.
 *
 * `from` is assumed to be a line start — use `snapToLineStart` if it came from
 * arithmetic rather than from a previous slice.
 */
export async function readLinesFrom(
  win: LogWindow, from: number, maxLines: number,
): Promise<LineSlice> {
  const start = Math.max(0, Math.min(from, win.size));
  const lines: string[] = [];
  let at = start;
  let carry = '';

  while (at < win.size && lines.length < maxLines) {
    const page = await win.read(at, WINDOW_SIZE);
    at += Buffer.byteLength(page, 'utf8');
    const parts = (carry + page).split('\n');
    // The last part is incomplete unless the file ended here.
    carry = at < win.size ? parts.pop()! : '';
    for (const p of parts) {
      lines.push(p);
      if (lines.length >= maxLines) break;
    }
  }
  // A file ending in a newline leaves an empty tail; it is a terminator, not
  // a line, and returning it puts a blank row at the end of every view.
  if (carry && lines.length < maxLines) lines.push(carry);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();

  const consumed = lines.reduce((n, l) => n + Buffer.byteLength(l, 'utf8') + 1, 0);
  return { lines, start, end: Math.min(win.size, start + consumed) };
}

/**
 * The start of the line containing `pos`.
 *
 * Scans back at most one maximal line, which the window invariant guarantees
 * is enough — a boundary is always within `MAX_LINE_LENGTH` of any position in
 * a well-formed log, and a file with no newline in that span has one line
 * longer than we keep whole anyway.
 */
export async function snapToLineStart(win: LogWindow, pos: number): Promise<number> {
  const at = Math.max(0, Math.min(pos, win.size));
  if (at === 0) return 0;
  const from = Math.max(0, at - MAX_LINE_LENGTH);
  const text = await win.read(from, at - from);
  const nl = text.lastIndexOf('\n');
  return nl === -1 ? from : from + nl + 1;
}

// ── Time ────────────────────────────────────────────────────────────────────

const DATE_AT_START = new RegExp(`^(?:${DATE_SHAPES})`);
/** kubectl's own prefix, which archived files often keep. */
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/;

/**
 * The time a line carries, or undefined.
 *
 * Deliberately format-agnostic: this is used to bisect a file, and the whole
 * point of bisecting is to avoid reading enough of it to detect a format.
 * `Date.parse` handles the ISO-ish shapes, which is what a rotated log written
 * by anything modern uses; anything it cannot read makes the line unusable as
 * a bisection point and the search steps to a neighbouring line instead.
 */
export function lineTime(line: string): number | undefined {
  const m = RFC3339.exec(line) ?? DATE_AT_START.exec(line);
  if (!m) return undefined;
  const n = Date.parse(m[0]);
  return Number.isFinite(n) ? n : undefined;
}

/** Below this the remaining range is read linearly — bisecting further costs more. */
const LINEAR_BELOW = 8 * 1024;

/** How much to read at a probe point. Small: a probe wants one timestamp. */
const PROBE_BYTES = 4 * 1024;

/**
 * The first time found at or after `from`, and nothing else read.
 *
 * Bounded twice over: it stops at `limit` so a probe never runs past the range
 * being bisected, and it gives up after a few widenings so a long stretch of
 * stack trace cannot turn one probe into a scan.
 *
 * Reading a whole 64KB page per probe was the first version, and twenty probes
 * of that on a 2.8MB file read nearly half of it — bisection that costs as
 * much as the scan it replaces.
 */
async function timeNear(
  win: LogWindow, from: number, limit: number,
): Promise<{ t: number; at: number } | undefined> {
  let want = PROBE_BYTES;
  while (want <= PROBE_BYTES * 8) {
    const end = Math.min(limit, from + want);
    if (end <= from) return undefined;
    const text = await win.read(from, end - from);
    const lines = text.split('\n');
    // The last one may be a fragment unless the read reached the limit.
    if (end < limit) lines.pop();

    let at = from;
    for (const line of lines) {
      const t = lineTime(line);
      if (t !== undefined) return { t, at };
      at += Buffer.byteLength(line, 'utf8') + 1;
    }
    if (end >= limit) return undefined;
    want *= 4;
  }
  return undefined;
}

export async function findTimeOffset(win: LogWindow, timeMs: number): Promise<number> {
  let lo = 0;
  let hi = win.size;

  while (hi - lo > LINEAR_BELOW) {
    const mid = await snapToLineStart(win, lo + Math.floor((hi - lo) / 2));
    // A snap can land back on `lo` when the midpoint is inside the range's
    // first line, which would loop forever.
    if (mid <= lo || mid >= hi) break;

    const found = await timeNear(win, mid, hi);
    /*
      Bisect on where the time WAS, not on where we probed.

      A probe landing inside a stack trace reads no time at `mid` and walks
      forward to the next line that has one — so the answer it returns belongs
      to a later offset. Narrowing on `mid` would then exclude everything
      between the two, and on a file with a trace every fifty lines that
      overshot the target by more than a thousand lines.
    */
    if (!found) break;
    if (found.t < timeMs) lo = found.at + 1; else hi = found.at;
  }

  /*
    Linear finish, in bounded chunks.

    Reading `lo` to the end of the file in one go was the first version, and on
    a target near the middle that read half the file — bisection paying for the
    scan it exists to avoid. The bisection has already put `lo` close, so this
    almost always walks one chunk.
  */
  let at = await snapToLineStart(win, lo);
  while (at < win.size) {
    const text = await win.read(at, LINEAR_BELOW);
    const lines = text.split('\n');
    const complete = at + Buffer.byteLength(text, 'utf8') >= win.size ? lines : lines.slice(0, -1);
    if (!complete.length) break;
    for (const line of complete) {
      const t = lineTime(line);
      if (t !== undefined && t >= timeMs) return at;
      at += Buffer.byteLength(line, 'utf8') + 1;
    }
  }
  return Math.min(at, win.size);
}
