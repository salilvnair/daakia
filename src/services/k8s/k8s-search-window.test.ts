import { describe, it, expect } from 'vitest';
import { searchArgs, DEFAULT_SEARCH, type SearchOptions, type SearchTarget } from './k8s-log-search';

/*
  The window the search runs over.

  Relative presets could only ever reach backwards from now, so a question
  about a window that has already passed — "what happened between the 1st and
  the 5th" — had no way to be asked. These cover the half of that which is
  testable without a cluster: what kubectl is told, and where the boundary
  falls.
*/

const target: SearchTarget = {
  pod: 'p', namespace: 'n', context: 'c',
};

const opts = (over: Partial<SearchOptions> = {}): SearchOptions => ({
  ...DEFAULT_SEARCH, query: 'x', ...over,
});

describe('searchArgs', () => {
  it('asks kubectl for a relative window when given a preset', () => {
    const args = searchArgs(target, opts({ sinceSeconds: 3600 }), false);
    expect(args).toContain('--since=3600s');
    expect(args.some(a => a.startsWith('--since-time'))).toBe(false);
  });

  it('asks for an exact instant when given an absolute start', () => {
    const fromMs = Date.parse('2026-08-01T00:00:00.000Z');
    const args = searchArgs(target, opts({ fromMs }), false);
    expect(args).toContain('--since-time=2026-08-01T00:00:00.000Z');
  });

  it('prefers the absolute start, so the two cannot both apply', () => {
    const fromMs = Date.parse('2026-08-01T00:00:00.000Z');
    const args = searchArgs(target, opts({ fromMs, sinceSeconds: 3600 }), false);
    expect(args).toContain('--since-time=2026-08-01T00:00:00.000Z');
    expect(args.some(a => a.startsWith('--since='))).toBe(false);
  });

  it('does not ask kubectl for an upper bound, because it has none', () => {
    // `kubectl logs` has --since/--since-time and no --until. An end asked for
    // here has to be enforced per line, so nothing may be passed that implies
    // the server is doing it.
    const args = searchArgs(target, opts({ toMs: Date.parse('2026-08-05T00:00:00Z') }), false);
    expect(args.some(a => /until|--to/.test(a))).toBe(false);
  });

  it('still asks for all time when no window is set', () => {
    const args = searchArgs(target, opts(), false);
    expect(args.some(a => a.startsWith('--since'))).toBe(false);
  });
});
