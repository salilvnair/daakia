/**
 * What "total" means once a collection runs more than once.
 */
import { describe, it, expect } from 'vitest';
import { mergeRuns, passCount } from './run-merge';
import type { RunResult } from './collection-runner';

const pass = (over: Partial<RunResult> = {}): RunResult => ({
  collectionId: 'c1', collectionName: 'Api', flow: 'sandwich',
  total: 2, passed: 2, failed: 0, skipped: 0,
  totalTests: 4, passedTests: 4, failedTests: 0,
  results: [{ id: 'r1', name: 'a' } as never, { id: 'r2', name: 'b' } as never],
  duration: 100, ...over,
});

const empty: RunResult = {
  collectionId: 'c1', collectionName: 'Api', flow: 'sandwich', iterations: 0,
  total: 0, passed: 0, failed: 0, skipped: 0,
  totalTests: 0, passedTests: 0, failedTests: 0, results: [], duration: 0,
};

describe('merging passes', () => {
  /* Fifty rows over four requests is two hundred requests. Reporting four
     would report the shape of the collection, not what happened. */
  it('sums the totals across passes', () => {
    const out = mergeRuns([pass(), pass({ failed: 1, passed: 1 })], empty);
    expect(out.total).toBe(4);
    expect(out.passed).toBe(3);
    expect(out.failed).toBe(1);
    expect(out.totalTests).toBe(8);
    expect(out.duration).toBe(200);
  });

  it('says how many passes there were', () => {
    expect(mergeRuns([pass(), pass(), pass()], empty).iterations).toBe(3);
  });

  it('keeps every result, in the order they ran', () => {
    const out = mergeRuns([
      pass({ results: [{ id: 'a' } as never] }),
      pass({ results: [{ id: 'b' } as never] }),
    ], empty);
    expect(out.results.map(r => r.id)).toEqual(['a', 'b']);
  });

  it('keeps the collection identity from the first pass', () => {
    expect(mergeRuns([pass({ collectionName: 'Api' })], empty).collectionName).toBe('Api');
  });

  /* An aborted run before the first pass finished — the caller still needs a
     shaped result, and `iterations: 0` is the honest count. */
  it('falls back when nothing ran', () => {
    const out = mergeRuns([], empty);
    expect(out.iterations).toBe(0);
    expect(out.total).toBe(0);
    expect(out.results).toEqual([]);
  });

  it('leaves a single pass reading exactly as it did before', () => {
    const one = pass();
    const out = mergeRuns([one], empty);
    expect(out).toMatchObject({ total: 2, passed: 2, iterations: 1, duration: 100 });
  });
});

describe('how many passes a config asks for', () => {
  it('is the row count when there is a data file', () => {
    expect(passCount(3, [{}, {}, {}, {}, {}])).toBe(5);
  });

  /* Two numbers that can disagree about how many times something ran is a bug
     report waiting to be written, so the rows win outright. */
  it('ignores iterations when rows are given', () => {
    expect(passCount(99, [{}])).toBe(1);
  });

  it('is the iteration count without a file', () => {
    expect(passCount(4, [])).toBe(4);
    expect(passCount(4, undefined)).toBe(4);
  });

  it('is at least one, whatever it was asked', () => {
    expect(passCount(0, [])).toBe(1);
    expect(passCount(-5, undefined)).toBe(1);
    expect(passCount(undefined, undefined)).toBe(1);
  });
});
