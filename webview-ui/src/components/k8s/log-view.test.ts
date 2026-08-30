import { describe, it, expect } from 'vitest';
import {
  buildMatcher, filterLines, densityBuckets, levelCounts,
  formatLogTime, selectionText, describeBucket,
  foldStackTraces, isStackFrame, compactCount, placeSelectionToolbar, grepTermFor,
} from './log-view';
import type { LogLine } from '../../store/k8s-store';

const line = (seq: number, level: LogLine['level'], text: string, ts?: number): LogLine =>
  ({ seq, level, text, ts });

describe('buildMatcher', () => {
  it('is null for an empty query, so an empty box shows everything', () => {
    expect(buildMatcher('')).toBeNull();
    expect(buildMatcher('   ')).toBeNull();
  });

  it('matches substrings case-insensitively and reports every hit', () => {
    const m = buildMatcher('timeout')!;
    expect(m('Read TIMEOUT after timeout ms')).toEqual([[5, 12], [19, 26]]);
  });

  it('treats /.../ as a regex', () => {
    const m = buildMatcher('/pool-\\d+/')!;
    expect(m('thread pool-7 stalled')).toEqual([[7, 13]]);
    expect(m('thread pool-x stalled')).toBeNull();
  });

  it('falls back to substring on a half-typed regex rather than throwing', () => {
    // Typing "/[unclosed/" mid-search must narrow, not explode.
    const m = buildMatcher('/[unclosed/');
    expect(m).not.toBeNull();
    expect(m!('nothing here')).toBeNull();
  });

  it('does not hang on a zero-width regex match', () => {
    const m = buildMatcher('/x*/')!;
    // The guard is that this returns at all.
    expect(m('abc')).not.toBeUndefined();
  });
});

describe('filterLines', () => {
  const lines = [
    line(0, 'info', 'started'),
    line(1, 'error', 'connection refused'),
    line(2, 'warn', 'retrying connection'),
    line(3, 'debug', 'pool size 4'),
  ];

  it('returns everything when no level is chosen', () => {
    // An empty level list must mean "all", never "none" — the opposite would
    // show a blank viewer the moment a user deselected their last chip.
    expect(filterLines(lines, { query: '', levels: [] })).toHaveLength(4);
  });

  it('narrows by level', () => {
    const out = filterLines(lines, { query: '', levels: ['error', 'warn'] });
    expect(out.map(l => l.seq)).toEqual([1, 2]);
  });

  it('combines level and text, and carries hit ranges for highlighting', () => {
    const out = filterLines(lines, { query: 'connection', levels: ['error'] });
    expect(out).toHaveLength(1);
    expect(out[0].hits).toEqual([[0, 10]]);
  });
});

describe('densityBuckets', () => {
  it('is empty for an empty buffer', () => {
    expect(densityBuckets([], 40)).toEqual([]);
  });

  it('covers every line exactly once', () => {
    const lines = Array.from({ length: 250 }, (_, i) => line(i, 'info', `l${i}`));
    const buckets = densityBuckets(lines, 40);
    expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(250);
    expect(buckets[0].startIndex).toBe(0);
  });

  it('takes the worst level in the bucket, not the most common', () => {
    // 99 info lines and one error must still read as an error column, or the
    // ribbon hides exactly what it exists to surface.
    const lines = [
      ...Array.from({ length: 99 }, (_, i) => line(i, 'info', 'ok')),
      line(99, 'error', 'boom'),
    ];
    const [bucket] = densityBuckets(lines, 1);
    expect(bucket.worst).toBe('error');
    expect(bucket.errors).toBe(1);
  });

  it('drops to a flat strip when every bucket is the same size', () => {
    // The common case: fewer lines than the ribbon is pixels wide, so every
    // bucket holds one line. Full height for all of them would read as
    // "maximum density everywhere" — a solid wall that means nothing.
    const lines = Array.from({ length: 12 }, (_, i) => line(i, 'info', `l${i}`));
    const buckets = densityBuckets(lines, 400);
    expect(buckets).toHaveLength(12);
    expect(buckets.every(b => b.height === 0.45)).toBe(true);
  });

  it('gives a sparse bucket a visible floor', () => {
    const lines = [
      ...Array.from({ length: 100 }, (_, i) => line(i, 'info', 'busy')),
      line(100, 'info', 'lonely'),
    ];
    const buckets = densityBuckets(lines, 2);
    const smallest = buckets[buckets.length - 1];
    expect(smallest.count).toBeLessThan(buckets[0].count);
    // A single-line bucket must still be drawable, not a zero-height gap.
    expect(smallest.height).toBeGreaterThanOrEqual(0.12);
  });

  it('carries the time span when lines are timestamped', () => {
    const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
    const lines = [line(0, 'info', 'a', t0), line(1, 'info', 'b', t0 + 5000)];
    const [b] = densityBuckets(lines, 1);
    expect(b.fromTs).toBe(t0);
    expect(b.toTs).toBe(t0 + 5000);
  });
});

describe('describeBucket', () => {
  it('names errors and warnings when there are any', () => {
    const lines = [line(0, 'error', 'x'), line(1, 'warn', 'y'), line(2, 'info', 'z')];
    const [b] = densityBuckets(lines, 1);
    const text = describeBucket(b);
    expect(text).toContain('3 lines');
    expect(text).toContain('1 error');
    expect(text).toContain('1 warning');
  });
});

describe('levelCounts', () => {
  it('counts every level, including the ones at zero', () => {
    const counts = levelCounts([line(0, 'error', 'a'), line(1, 'error', 'b'), line(2, 'info', 'c')]);
    expect(counts).toEqual({ error: 2, warn: 0, info: 1, debug: 0, other: 0 });
  });
});

describe('formatLogTime', () => {
  it('is empty when there is no timestamp', () => {
    expect(formatLogTime(undefined)).toBe('');
  });

  it('renders milliseconds, since log timing is usually sub-second', () => {
    const d = new Date(2026, 0, 1, 14, 32, 7, 412);
    expect(formatLogTime(d.getTime())).toBe('14:32:07.412');
  });
});

describe('selectionText', () => {
  const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
  const lines = [
    line(0, 'info', 'before'),
    line(1, 'error', 'boom', t0),
    line(2, 'error', '  at Foo.bar', t0 + 400),
    line(3, 'info', 'after'),
  ];

  it('takes the inclusive seq range', () => {
    const out = selectionText(lines, 1, 2).split('\n');
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('boom');
    expect(out[1]).toContain('at Foo.bar');
  });

  it('restores timestamps the DOM does not carry', () => {
    // "these two lines are 400ms apart" is frequently the whole diagnosis, so
    // the AI must get the times even though the rendered gutter is separate.
    const out = selectionText(lines, 1, 2);
    expect(out).toContain('2026-01-01T12:00:00.000Z');
    expect(out).toContain('2026-01-01T12:00:00.400Z');
  });

  it('leaves untimestamped lines bare', () => {
    expect(selectionText(lines, 0, 0)).toBe('before');
  });
});

describe('foldStackTraces', () => {
  const err = (seq: number, text: string) => line(seq, 'error', text);
  const trace = [
    err(0, 'ERROR c.d.o.LedgerClient read timed out after 30000ms'),
    err(1, '\tat java.net.SocketInputStream.socketRead0(Native Method)'),
    err(2, '\tat java.net.SocketInputStream.read(SocketInputStream.java:150)'),
    err(3, '\tat com.example.Client.call(Client.java:42)'),
    line(4, 'info', 'INFO retrying'),
  ];

  it('folds the frames under the message that heads them', () => {
    const rows = foldStackTraces(trace, true);
    expect(rows).toHaveLength(2);
    expect(rows[0].line.seq).toBe(0);
    expect(rows[0].folded).toHaveLength(3);
    expect(rows[1].line.seq).toBe(4);
  });

  it('keeps every line when folding is off', () => {
    expect(foldStackTraces(trace, false)).toHaveLength(5);
  });

  it('keeps "Caused by" visible rather than folding it away', () => {
    // The root cause is the useful half of a trace; folding it defeats the
    // entire point of opening the log.
    const lines = [
      err(0, 'ERROR boom'),
      err(1, '\tat com.example.A.a(A.java:1)'),
      err(2, 'Caused by: java.net.SocketTimeoutException: Read timed out'),
      err(3, '\tat com.example.B.b(B.java:2)'),
    ];
    const rows = foldStackTraces(lines, true);
    expect(rows).toHaveLength(2);
    expect(rows[1].line.text).toContain('Caused by');
  });

  it('does not lose a run of frames whose header was filtered out', () => {
    const rows = foldStackTraces([
      err(0, '\tat com.example.A.a(A.java:1)'),
      err(1, '\tat com.example.B.b(B.java:2)'),
    ], true);
    expect(rows).toHaveLength(1);
    expect(rows[0].folded).toHaveLength(1);
  });

  it('does not fold plain indented text under an info line', () => {
    const rows = foldStackTraces([
      line(0, 'info', 'INFO config:'),
      line(1, 'info', '  key = value'),
    ], true);
    expect(rows).toHaveLength(2);
  });

  it('recognises the omitted-frames marker as a frame', () => {
    expect(isStackFrame('\t... 20 common frames omitted')).toBe(true);
    expect(isStackFrame('   ... 35 more')).toBe(true);
    expect(isStackFrame('INFO started')).toBe(false);
  });
});

describe('compactCount', () => {
  it('keeps small numbers exact and abbreviates large ones', () => {
    expect(compactCount(142)).toBe('142');
    expect(compactCount(1200)).toBe('1.2k');
    expect(compactCount(18_400)).toBe('18k');
  });
});

describe('placeSelectionToolbar', () => {
  const host = { top: 0, bottom: 600, left: 0, height: 600, width: 1000 };
  const toolbar = { width: 430, height: 58 };

  it('sits below the selection when there is room', () => {
    // Above was the first version's behaviour and it covered the very lines
    // that had just been highlighted.
    const p = placeSelectionToolbar(
      { top: 100, bottom: 160, left: 40, height: 60, width: 500 }, host, toolbar);
    expect(p.top).toBe(170);
  });

  it('never overlaps the selection', () => {
    const sel = { top: 100, bottom: 160, left: 40, height: 60, width: 500 };
    const p = placeSelectionToolbar(sel, host, toolbar);
    const overlaps = !(p.top + toolbar.height <= sel.top - host.top || p.top >= sel.bottom - host.top);
    expect(overlaps).toBe(false);
  });

  it('flips above when the selection is near the bottom', () => {
    const p = placeSelectionToolbar(
      { top: 520, bottom: 570, left: 40, height: 50, width: 500 }, host, toolbar);
    expect(p.top).toBe(520 - 58 - 10);
  });

  it('keeps the strip clear of the density ribbon on the right', () => {
    // Without the gutter the strip slides under the ribbon, which is the one
    // place it must not go — the ribbon is how you navigate away from here.
    const p = placeSelectionToolbar(
      { top: 100, bottom: 160, left: 940, height: 60, width: 40 }, host, toolbar, 38);
    expect(p.left + toolbar.width + 38).toBeLessThanOrEqual(host.width);
  });

  it('does not go off the left edge', () => {
    const p = placeSelectionToolbar(
      { top: 100, bottom: 160, left: -50, height: 60, width: 500 }, host, toolbar);
    expect(p.left).toBeGreaterThanOrEqual(8);
  });

  it('prefers below rather than covering text when neither side fits', () => {
    const tiny = { top: 0, bottom: 80, left: 0, height: 80, width: 1000 };
    const p = placeSelectionToolbar(
      { top: 10, bottom: 70, left: 0, height: 60, width: 500 }, tiny, toolbar);
    expect(p.top).toBeGreaterThanOrEqual(4);
  });
});

describe('grepTermFor', () => {
  it('greps the fragment that was highlighted, not its line', () => {
    // The bug this replaces: selecting a port put the entire log line into the
    // filter, which matched that one line and nothing else.
    expect(grepTermFor('5432')).toBe('5432');
  });

  it('keeps inner whitespace but trims the edges', () => {
    expect(grepTermFor('  connection refused  ')).toBe('connection refused');
  });

  it('is null for a selection of only whitespace', () => {
    expect(grepTermFor('   ')).toBeNull();
    expect(grepTermFor('')).toBeNull();
  });

  it('takes the first real line of a multi-line selection', () => {
    // No single line can contain a newline, so searching the whole thing would
    // reliably match nothing.
    expect(grepTermFor('\n\n  SocketTimeoutException\n  at Foo.bar\n'))
      .toBe('SocketTimeoutException');
  });

  it('caps a very long selection', () => {
    const term = grepTermFor('x'.repeat(500))!;
    expect(term.length).toBe(120);
  });
});
