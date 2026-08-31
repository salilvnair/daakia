/**
 * The windowed reader, against real files on disk.
 *
 * Written against a generated multi-megabyte log rather than a handful of
 * lines, because the whole claim is about not reading the file — and a
 * three-line fixture cannot tell "read a window" from "read everything".
 * `bytesRead` is asserted directly, so the claim is measured.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  openLog, readLinesBack, readLinesFrom, snapToLineStart, findTimeOffset,
  lineTime, WINDOW_SIZE, MAX_LINE_LENGTH,
} from './log-window';

let dir: string;
let big: string;
let small: string;
let noTrailingNewline: string;

/** One line per second from a known start, so a time maps to a known line. */
const START = Date.parse('2026-08-31T00:00:00.000Z');
const LINES = 40_000;

const lineAt = (i: number) =>
  `${new Date(START + i * 1000).toISOString()}  INFO 1 --- [main] com.acme.Boot : line ${i}`;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'dk8s-window-'));

  big = join(dir, 'big.log');
  const body: string[] = [];
  for (let i = 0; i < LINES; i++) body.push(lineAt(i));
  writeFileSync(big, body.join('\n') + '\n');

  small = join(dir, 'small.log');
  writeFileSync(small, 'one\ntwo\nthree\n');

  noTrailingNewline = join(dir, 'no-nl.log');
  writeFileSync(noTrailingNewline, 'alpha\nbeta\ngamma');
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('readLinesBack', () => {
  it('returns the last lines of a large file', async () => {
    const win = await openLog(big);
    const { lines } = await readLinesBack(win, win.size, 5);
    expect(lines).toEqual([
      lineAt(LINES - 5), lineAt(LINES - 4), lineAt(LINES - 3),
      lineAt(LINES - 2), lineAt(LINES - 1),
    ]);
    await win.close();
  });

  /*
    The reason the whole file exists. Streaming to find the tail means reading
    everything to discard nearly all of it.
  */
  it('reads a fraction of the file to do it', async () => {
    const win = await openLog(big);
    await readLinesBack(win, win.size, 20);
    expect(win.size).toBeGreaterThan(2_000_000);
    expect(win.bytesRead).toBeLessThanOrEqual(WINDOW_SIZE * 2);
    await win.close();
  });

  it('spans more than one page when asked for many lines', async () => {
    const win = await openLog(big);
    const { lines } = await readLinesBack(win, win.size, 2000);
    expect(lines).toHaveLength(2000);
    expect(lines[lines.length - 1]).toBe(lineAt(LINES - 1));
    expect(lines[0]).toBe(lineAt(LINES - 2000));
    await win.close();
  });

  it('never returns a half line from a page boundary', async () => {
    // Every line in the fixture starts with a timestamp; a fragment would not.
    const win = await openLog(big);
    const { lines } = await readLinesBack(win, win.size, 3000);
    expect(lines.every(l => /^\d{4}-\d{2}-\d{2}T/.test(l))).toBe(true);
    await win.close();
  });

  it('handles a file smaller than one page', async () => {
    const win = await openLog(small);
    expect((await readLinesBack(win, win.size, 10)).lines).toEqual(['one', 'two', 'three']);
    await win.close();
  });

  it('handles a file with no trailing newline', async () => {
    const win = await openLog(noTrailingNewline);
    expect((await readLinesBack(win, win.size, 10)).lines).toEqual(['alpha', 'beta', 'gamma']);
    await win.close();
  });

  it('reports where the returned lines begin, so a caller can page further', async () => {
    const win = await openLog(big);
    const first = await readLinesBack(win, win.size, 10);
    const next = await readLinesBack(win, first.start, 10);
    expect(next.lines[next.lines.length - 1]).toBe(lineAt(LINES - 11));
    await win.close();
  });

  it('returns nothing for an empty request', async () => {
    const win = await openLog(big);
    expect((await readLinesBack(win, win.size, 0)).lines).toEqual([]);
    expect((await readLinesBack(win, 0, 10)).lines).toEqual([]);
    await win.close();
  });
});

describe('readLinesFrom', () => {
  it('reads forward from the start', async () => {
    const win = await openLog(big);
    const { lines } = await readLinesFrom(win, 0, 3);
    expect(lines).toEqual([lineAt(0), lineAt(1), lineAt(2)]);
    await win.close();
  });

  it('reads only what it needs', async () => {
    const win = await openLog(big);
    await readLinesFrom(win, 0, 5);
    expect(win.bytesRead).toBeLessThanOrEqual(WINDOW_SIZE);
    await win.close();
  });

  it('spans pages for a large request', async () => {
    const win = await openLog(big);
    const { lines } = await readLinesFrom(win, 0, 2500);
    expect(lines).toHaveLength(2500);
    expect(lines[2499]).toBe(lineAt(2499));
    await win.close();
  });

  it('stops cleanly at the end of the file', async () => {
    const win = await openLog(small);
    expect((await readLinesFrom(win, 0, 99)).lines).toEqual(['one', 'two', 'three']);
    await win.close();
  });

  it('reads the last line when there is no trailing newline', async () => {
    const win = await openLog(noTrailingNewline);
    expect((await readLinesFrom(win, 0, 99)).lines).toEqual(['alpha', 'beta', 'gamma']);
    await win.close();
  });
});

describe('snapToLineStart', () => {
  it('snaps a mid-line offset back to the line it is inside', async () => {
    const win = await openLog(small);
    // 'one\n' is 4 bytes; offset 5 is inside 'two'.
    expect(await snapToLineStart(win, 5)).toBe(4);
    await win.close();
  });

  it('leaves a position that is already a line start alone', async () => {
    const win = await openLog(small);
    expect(await snapToLineStart(win, 4)).toBe(4);
    await win.close();
  });

  it('returns 0 at the head of the file', async () => {
    const win = await openLog(small);
    expect(await snapToLineStart(win, 0)).toBe(0);
    await win.close();
  });
});

describe('lineTime', () => {
  it('reads an ISO timestamp at the head of a line', () => {
    expect(lineTime('2026-08-31T00:00:05.000Z INFO up'))
      .toBe(Date.parse('2026-08-31T00:00:05.000Z'));
  });

  it('reads a space-separated timestamp', () => {
    expect(lineTime('2026-08-31 00:00:05 INFO up')).toBeGreaterThan(0);
  });

  it('returns nothing for a stack frame', () => {
    // A frame has no time of its own, which is why bisection steps past it.
    expect(lineTime('\tat com.acme.Foo.run(Foo.java:1)')).toBeUndefined();
  });

  it('returns nothing for prose', () => {
    expect(lineTime('Picked up JAVA_TOOL_OPTIONS')).toBeUndefined();
  });
});

describe('findTimeOffset', () => {
  const at = (i: number) => START + i * 1000;

  it('finds the first line at or after a time', async () => {
    const win = await openLog(big);
    const off = await findTimeOffset(win, at(30_000));
    const { lines } = await readLinesFrom(win, off, 1);
    expect(lines[0]).toBe(lineAt(30_000));
    await win.close();
  });

  /*
    The claim Stage 4 is about. A date filter over a large archive should cost
    a handful of reads, not the file.
  */
  it('bisects rather than scanning', async () => {
    const win = await openLog(big);
    await findTimeOffset(win, at(30_000));
    expect(win.size).toBeGreaterThan(2_000_000);
    // Twenty-odd probes plus the linear finish, nowhere near the file.
    expect(win.bytesRead).toBeLessThan(win.size / 4);
    await win.close();
  });

  it('returns 0 when the target predates the whole file', async () => {
    const win = await openLog(big);
    expect(await findTimeOffset(win, START - 60_000)).toBe(0);
    await win.close();
  });

  it('returns the end when the target is after everything', async () => {
    const win = await openLog(big);
    expect(await findTimeOffset(win, at(LINES + 1000))).toBe(win.size);
    await win.close();
  });

  it.each([0, 1, 137, 8_192, 19_999, 39_998, 39_999])(
    'lands exactly on line %i', async i => {
      const win = await openLog(big);
      const off = await findTimeOffset(win, at(i));
      const { lines } = await readLinesFrom(win, off, 1);
      expect(lines[0]).toBe(lineAt(i));
      await win.close();
    });

  it('steps past lines that carry no time', async () => {
    // A trace in the middle of the file must not stall the bisection.
    const withTrace = join(dir, 'trace.log');
    const body: string[] = [];
    for (let i = 0; i < 5000; i++) {
      body.push(lineAt(i));
      if (i % 50 === 0) {
        for (let f = 0; f < 20; f++) body.push('\tat com.acme.Foo.run(Foo.java:' + f + ')');
      }
    }
    writeFileSync(withTrace, body.join('\n') + '\n');

    const win = await openLog(withTrace);
    const off = await findTimeOffset(win, at(2500));
    const { lines } = await readLinesFrom(win, off, 1);
    expect(lines[0]).toBe(lineAt(2500));
    await win.close();
  });

  it('copes with a file of one line', async () => {
    const one = join(dir, 'one.log');
    writeFileSync(one, lineAt(0) + '\n');
    const win = await openLog(one);
    expect(await findTimeOffset(win, at(0))).toBe(0);
    expect(await findTimeOffset(win, at(5))).toBe(win.size);
    await win.close();
  });
});

describe('the window invariant', () => {
  it('holds a maximal line plus both boundaries', () => {
    // What makes it safe to snap to a line edge without an unbounded hunt.
    expect(WINDOW_SIZE).toBeGreaterThanOrEqual(MAX_LINE_LENGTH * 2);
  });
});
