import { describe, it, expect } from 'vitest';
import {
  buildMatcher, filterLines, densityBuckets, levelCounts,
  formatLogTime, selectionText, describeBucket,
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
