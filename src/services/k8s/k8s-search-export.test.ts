import { describe, it, expect } from 'vitest';
import { renderMatches } from './k8s-search-export';
import type { SearchMatch } from './k8s-log-search';

/*
  These tests exist because the previous shape passed every test it had.

  Rendering each match with its own context window is correct for one match and
  wrong for two near each other, and nothing in the suite ever put two matches
  near each other. The bug only showed up on a real log, at a context width
  nobody had tried, as a dialog that never finished.
*/

/** Builds a match at `line` out of a synthetic file, the way the search does. */
function matchIn(file: string[], line: number, ctx: number, rel?: string): SearchMatch {
  const idx = line - 1;
  const m: SearchMatch = {
    pod: 'p', namespace: 'n', context: 'c',
    line, level: 'info', text: file[idx], hits: [[0, 1]],
    before: file.slice(Math.max(0, idx - ctx), idx),
    after: file.slice(idx + 1, idx + 1 + ctx),
  };
  return rel ? Object.assign(m, { rel }) : m;
}

const file = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);

describe('renderMatches', () => {
  it('writes a line shared by two windows exactly once', () => {
    const out = renderMatches([matchIn(file, 10, 3), matchIn(file, 12, 3)], 3);
    const nines = out.split('\n').filter(l => l.startsWith('9-'));
    expect(nines).toHaveLength(1);
    // Lines 7..15 are one continuous run, so nothing is elided inside it.
    expect(out.split('\n').filter(l => l !== '--')).toHaveLength(9);
  });

  it('keeps a hit marked as a hit when a neighbour also claims it as context', () => {
    const out = renderMatches([matchIn(file, 10, 3), matchIn(file, 12, 3)], 3);
    expect(out).toContain('10:line 10');
    expect(out).toContain('12:line 12');
    expect(out).not.toContain('10-line 10');
    expect(out).not.toContain('12-line 12');
  });

  it('separates runs that do not touch, and only those', () => {
    const out = renderMatches([matchIn(file, 5, 1), matchIn(file, 40, 1)], 1);
    expect(out.split('\n').filter(l => l === '--')).toHaveLength(1);
    const adjacent = renderMatches([matchIn(file, 5, 2), matchIn(file, 9, 2)], 2);
    expect(adjacent).not.toContain('--');
  });

  it('does not interleave two rotation files that share line numbers', () => {
    const older = ['a1', 'a2', 'a3'];
    const newer = ['b1', 'b2', 'b3'];
    const out = renderMatches(
      [matchIn(older, 2, 1, 'archived/old.log'), matchIn(newer, 2, 1, 'archived/new.log')], 1,
    );
    expect(out).toContain('===== archived/old.log =====');
    expect(out).toContain('===== archived/new.log =====');
    // Every line of the older file precedes every line of the newer one.
    expect(out.indexOf('a3')).toBeLessThan(out.indexOf('b1'));
  });

  it('stays bounded by the log rather than by the number of hits', () => {
    // The shape that broke: every line matches, with a wide window.
    const dense = Array.from({ length: 2_000 }, (_, i) => `hit ${i + 1}`);
    const matches = dense.map((_, i) => matchIn(dense, i + 1, 200));
    const lines = renderMatches(matches, 200).split('\n');
    expect(lines).toHaveLength(dense.length);          // not 2,000 x 401
  });

  it('writes only the matched lines when no context is asked for', () => {
    const out = renderMatches([matchIn(file, 10, 0), matchIn(file, 12, 0)], 0);
    expect(out).toBe('10:line 10\n12:line 12');
  });
});
