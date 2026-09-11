/**
 * Writing a volume that does not fit in memory.
 *
 * The test that matters is the last one: a set of files whose total is larger
 * than V8 will hold in a single string. The code this replaced read every file
 * into a string and `join`ed them, so it threw `RangeError: Invalid string
 * length` on exactly the archives it existed for — after several minutes of
 * reading, with a progress bar that had shown "0 of 1" throughout.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, stat, mkdir } from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createGzip } from 'zlib';
import {
  ExportCancelled, oldestFirst, streamArchive, totalBytes,
} from './pv-stream';
import type { PvFile } from './pv-logs';

let dir: string;

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'pv-stream-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

async function plain(name: string, body: string, mtime = 0): Promise<PvFile> {
  const file = join(dir, name);
  await mkdir(join(dir, 'src'), { recursive: true }).catch(() => {});
  await writeFile(file, body, 'utf8');
  return { file, rel: name, bytes: Buffer.byteLength(body), mtime };
}

async function gzipped(name: string, body: string, mtime = 0): Promise<PvFile> {
  const file = join(dir, name);
  await new Promise<void>((resolve, reject) => {
    const gz = createGzip();
    const out = createWriteStream(file);
    gz.pipe(out);
    out.on('finish', () => resolve());
    out.on('error', reject);
    gz.end(body);
  });
  const bytes = (await stat(file)).size;
  return { file, rel: name, bytes, mtime };
}

describe('totalBytes and oldestFirst', () => {
  it('adds up what is going to be read, before reading any of it', () => {
    expect(totalBytes([
      { bytes: 100 } as PvFile, { bytes: 200 } as PvFile,
    ])).toBe(300);
  });

  it('survives a file whose size was never recorded', () => {
    expect(totalBytes([{ } as PvFile, { bytes: 50 } as PvFile])).toBe(50);
  });

  it('reads oldest first — an archive newest-first is a log running backwards', () => {
    const out = oldestFirst([
      { rel: 'b', mtime: 200 } as PvFile,
      { rel: 'a', mtime: 100 } as PvFile,
    ]);
    expect(out.map(f => f.rel)).toEqual(['a', 'b']);
  });

  it('does not reorder the caller s own array', () => {
    const given = [{ rel: 'b', mtime: 2 } as PvFile, { rel: 'a', mtime: 1 } as PvFile];
    oldestFirst(given);
    expect(given.map(f => f.rel)).toEqual(['b', 'a']);
  });
});

describe('streamArchive', () => {
  it('writes each file under its own marker, oldest first', async () => {
    const files = [
      await plain('new.log', 'second\n', 200),
      await plain('old.log', 'first\n', 100),
    ];
    const dest = join(dir, 'out.log');
    await streamArchive(files, dest);
    expect(await readFile(dest, 'utf8')).toBe(
      '===== old.log =====\nfirst\n\n===== new.log =====\nsecond\n\n',
    );
  });

  it('decompresses a .gz on the way through', async () => {
    const dest = join(dir, 'out.log');
    await streamArchive([await gzipped('a.log.gz', 'compressed body\n')], dest);
    expect(await readFile(dest, 'utf8')).toContain('compressed body');
  });

  it('counts the compressed size, so the bar cannot overshoot', async () => {
    /* A gzip of repetitive text expands enormously. Counting what comes out
       would run the bar to several hundred percent. */
    const file = await gzipped('a.log.gz', 'x'.repeat(200_000));
    const dest = join(dir, 'out.log');
    const seen: number[] = [];
    const out = await streamArchive([file], dest, {
      now: () => seen.length * 1000,
      onProgress: p => seen.push(p.bytes),
    });
    expect(out.bytes).toBeLessThanOrEqual(file.bytes);
    expect(out.bytes).toBeGreaterThan(0);
  });

  it('reports progress against a total known before it starts', async () => {
    const files = [await plain('a.log', 'a'.repeat(1000))];
    const dest = join(dir, 'out.log');
    const totals = new Set<number>();
    await streamArchive(files, dest, {
      now: () => Date.now() + totals.size * 1000,
      onProgress: p => totals.add(p.totalBytes),
    });
    expect([...totals]).toEqual([1000]);
  });

  it('says which file it is on, and where that is in the set', async () => {
    const files = [await plain('a.log', 'a', 1), await plain('b.log', 'b', 2)];
    const dest = join(dir, 'out.log');
    const seen: { file: string; index: number; count: number }[] = [];
    let t = 0;
    await streamArchive(files, dest, {
      now: () => (t += 1000),
      onProgress: p => seen.push({ file: p.file, index: p.index, count: p.count }),
    });
    expect(seen.some(s => s.file === 'a.log' && s.index === 0 && s.count === 2)).toBe(true);
    expect(seen.some(s => s.file === 'b.log' && s.index === 1)).toBe(true);
  });

  it('stops when cancelled, and leaves no half-file behind', async () => {
    const files = [
      await plain('a.log', 'a'.repeat(400_000), 1),
      await plain('b.log', 'b'.repeat(400_000), 2),
    ];
    const dest = join(dir, 'out.log');
    let seen = 0;
    await expect(streamArchive(files, dest, {
      onProgress: () => { seen++; },
      cancelled: () => seen > 0,
    })).rejects.toBeInstanceOf(ExportCancelled);
    /* A partial export is worse than none: it is named like a log, it opens
       like one, and the half that is missing is the end. */
    expect(existsSync(dest)).toBe(false);
  });

  it('is cancelled before it starts when the flag is already set', async () => {
    const dest = join(dir, 'out.log');
    await expect(streamArchive([await plain('a.log', 'x')], dest, {
      cancelled: () => true,
    })).rejects.toBeInstanceOf(ExportCancelled);
    expect(existsSync(dest)).toBe(false);
  });

  it('an empty set writes an empty file rather than failing', async () => {
    const dest = join(dir, 'out.log');
    const out = await streamArchive([], dest);
    expect(out).toEqual({ bytes: 0, files: 0 });
    expect(await readFile(dest, 'utf8')).toBe('');
  });

  it('removes the output and rethrows when a file cannot be read', async () => {
    const dest = join(dir, 'out.log');
    const missing: PvFile = {
      file: join(dir, 'not-here.log'), rel: 'not-here.log', bytes: 10, mtime: 1,
    };
    await expect(streamArchive([missing], dest)).rejects.toThrow();
    expect(existsSync(dest)).toBe(false);
  });

  /*
    The one the old code could not do.

    V8 refuses a single string past ~512MB, and the previous implementation
    built exactly that: every file read into a string, pushed into an array,
    then `join`ed. This writes more than that limit through a pipe, where the
    ceiling is the disk rather than the heap.

    600MB of real I/O, so it is slower than the rest of this file — and it is
    the only test here that proves the bug is actually gone.
  */
  it('writes more than V8 will hold in one string', async () => {
    const { constants } = await import('buffer');
    const chunk = 'x'.repeat(1024 * 1024);
    const perFile = 60;
    const files: PvFile[] = [];
    for (let i = 0; i < 10; i++) {
      const file = join(dir, `big-${i}.log`);
      await new Promise<void>((resolve, reject) => {
        const ws = createWriteStream(file);
        ws.on('error', reject);
        ws.on('finish', () => resolve());
        for (let n = 0; n < perFile; n++) ws.write(chunk);
        ws.end();
      });
      files.push({
        file, rel: `big-${i}.log`, bytes: perFile * 1024 * 1024, mtime: i,
      });
    }

    const want = 10 * perFile * 1024 * 1024;
    expect(want).toBeGreaterThan(constants.MAX_STRING_LENGTH);

    const dest = join(dir, 'huge.log');
    const out = await streamArchive(files, dest);
    expect(out.bytes).toBe(want);
    expect((await stat(dest)).size).toBeGreaterThan(constants.MAX_STRING_LENGTH);
  }, 180_000);
});
