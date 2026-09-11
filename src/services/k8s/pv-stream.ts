/**
 * Writing an archived volume to disk without holding it in memory.
 *
 * ── What this replaces ──
 *
 * The export used to read every archived file into a string, push them all
 * into an array, and `join('\n')` the lot before writing. A comment above it
 * claimed the opposite — "streamed one file at a time rather than joined in
 * memory" — which is the kind of comment that stops anybody checking.
 *
 * It could not work on the files it was written for. A persistent volume is
 * where a log goes *because it does not fit*, and:
 *
 *   - every file was fully materialised, so the peak was the whole archive;
 *   - `join` then asked for one contiguous string of all of it, and V8 refuses
 *     past 512MB with `RangeError: Invalid string length`.
 *
 * A 1–2GB archive therefore spent several minutes reading and then threw. The
 * progress bar counted pods, so a single pod showed "0 of 1" throughout.
 *
 * ── What this does instead ──
 *
 * Pipes each file into the output as it reads it. Nothing above a chunk is
 * ever held, so the peak is a buffer rather than the archive, and the size
 * that can be written is the disk's business rather than V8's.
 *
 * **Bytes, not files.** The total is known before a byte is read — `walkRoot`
 * already records every file's size — so progress is a real fraction rather
 * than "file 3 of 9", where file 3 might be 900MB of the gigabyte.
 *
 * **Cancel leaves no half-file pretending to be a log.** A partial export is
 * worse than none: it looks complete, it has a plausible name, and the missing
 * half is the end, which is where people look. On cancel the partial file is
 * removed.
 */
import { createReadStream, createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import type { PvFile } from './pv-logs';

/** How often progress is reported. Often enough to move, rarely enough to be free. */
export const TICK_MS = 120;

export interface StreamProgress {
  /** Bytes read from the source files so far. */
  bytes: number;
  /** Bytes in every file that is going to be written. Known before we start. */
  totalBytes: number;
  /** The file being read right now, relative to its mount. */
  file: string;
  /** Which of the files this is, for "3 of 9" alongside the bar. */
  index: number;
  count: number;
}

export interface StreamOptions {
  onProgress?: (p: StreamProgress) => void;
  /** Checked between chunks. Returning true stops and removes the partial. */
  cancelled?: () => boolean;
  now?: () => number;
}

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled.');
    this.name = 'ExportCancelled';
  }
}

/** Sum of every file's size, which is what a byte-level bar divides by. */
export function totalBytes(files: PvFile[]): number {
  return files.reduce((n, f) => n + (f.bytes || 0), 0);
}

/**
 * Oldest first.
 *
 * An archive read newest-first is a log that runs backwards, and the whole
 * point of pulling the volume is to read the part that came before what
 * kubectl still holds.
 */
export function oldestFirst(files: PvFile[]): PvFile[] {
  return [...files].sort((a, b) => a.mtime - b.mtime);
}

/**
 * Counts what passes through, and says so on a timer.
 *
 * Counting bytes off the *source* rather than the sink, so a compressed file
 * reports the progress its size predicted — a gzip that expands eight-fold
 * would otherwise make the bar overshoot to 800%.
 */
function meter(onChunk: (n: number) => void): Transform {
  return new Transform({
    transform(chunk, _enc, done) {
      onChunk(chunk.length);
      done(null, chunk);
    },
  });
}

/** A cancel that stops the pipe rather than waiting for the file to finish. */
function guard(cancelled: () => boolean): Transform {
  return new Transform({
    transform(chunk, _enc, done) {
      if (cancelled()) { done(new ExportCancelled()); return; }
      done(null, chunk);
    },
  });
}

export interface StreamResult {
  bytes: number;
  files: number;
}

/**
 * Write every archived file into one output, in order, streaming.
 *
 * Each file is introduced by the same `===== rel =====` marker the old code
 * wrote, because that is what the reader on the other end is looking for.
 */
export async function streamArchive(
  files: PvFile[],
  dest: string,
  opts: StreamOptions = {},
): Promise<StreamResult> {
  const now = opts.now ?? (() => Date.now());
  const cancelled = opts.cancelled ?? (() => false);
  const ordered = oldestFirst(files);
  const total = totalBytes(ordered);

  /* Nothing is created until we know we are going to write. A cancel that
     arrived while the folder dialog was open would otherwise leave an empty
     file named like a log. */
  if (cancelled()) throw new ExportCancelled();

  const out = createWriteStream(dest, { encoding: 'utf8' });
  let bytes = 0;
  let lastTick = 0;

  const tick = (file: string, index: number, force = false) => {
    const at = now();
    if (!force && at - lastTick < TICK_MS) return;
    lastTick = at;
    opts.onProgress?.({
      bytes, totalBytes: total, file, index, count: ordered.length,
    });
  };

  try {
    for (let i = 0; i < ordered.length; i++) {
      if (cancelled()) throw new ExportCancelled();
      const f = ordered[i];
      tick(f.rel, i, true);

      await write(out, `===== ${f.rel} =====\n`);

      const source = createReadStream(f.file);
      const stages: NodeJS.ReadWriteStream[] = [
        meter(n => { bytes += n; tick(f.rel, i); }),
        guard(cancelled),
      ];
      /* Decompressed on the way through. Most of an archive is `.gz`, and
         its bytes read as text are a file of replacement characters. */
      if (/\.gz$/i.test(f.file)) {
        const { createGunzip } = await import('zlib');
        /* The meter goes before the gunzip so it counts the file's own size,
           which is the number the total was built from. */
        stages.splice(1, 0, createGunzip());
      }

      await pipeline(source, ...(stages as [NodeJS.ReadWriteStream]), out, { end: false });
      await write(out, '\n');
    }

    /* The last file, not one past it: `('', length)` rendered as "(7/6)" with
       no name beside it, which reads as a seventh file that went wrong. */
    const last = ordered[ordered.length - 1];
    tick(last?.rel ?? '', Math.max(0, ordered.length - 1), true);
    await new Promise<void>((resolve, reject) => {
      out.on('error', reject);
      out.on('finish', () => resolve());
      out.end();
    });
    return { bytes, files: ordered.length };
  } catch (err) {
    /*
      Closed *before* it is removed.

      Windows refuses to unlink a file something still holds open, and
      `destroy()` returns before the handle is released — so an unlink fired
      straight after it fails silently and leaves exactly the half-file this
      is here to prevent.
    */
    await closed(out);
    /* A partial export is worse than none: it looks complete, it is named
       like a log, and what is missing is the end — which is where people
       look. */
    await unlink(dest).catch(() => {});
    throw err;
  }
}

/** Resolves once the stream has let go of the file. */
function closed(out: ReturnType<typeof createWriteStream>): Promise<void> {
  return new Promise(resolve => {
    if (out.destroyed || out.closed) { resolve(); return; }
    out.once('close', () => resolve());
    out.destroy();
  });
}

function write(out: NodeJS.WritableStream, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    out.write(text, err => (err ? reject(err) : resolve()));
  });
}
