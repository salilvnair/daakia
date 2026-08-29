import { describe, it, expect } from 'vitest';
import { buildSearchMatcher, DEFAULT_SEARCH } from './k8s-log-search';

const opts = (over: Partial<typeof DEFAULT_SEARCH> = {}) => ({ ...DEFAULT_SEARCH, ...over });

describe('buildSearchMatcher', () => {
  it('is null for an empty query, so an empty search does not scan every pod', () => {
    expect(buildSearchMatcher(opts({ query: '' }))).toBeNull();
  });

  it('finds every occurrence of a literal, case-insensitively by default', () => {
    const m = buildSearchMatcher(opts({ query: 'timeout' }))!;
    expect(m('Read TIMEOUT after timeout ms')).toEqual([[5, 12], [19, 26]]);
  });

  it('respects case when asked', () => {
    const m = buildSearchMatcher(opts({ query: 'ERROR', caseSensitive: true }))!;
    expect(m('ERROR boom')).toEqual([[0, 5]]);
    expect(m('error boom')).toBeNull();
  });

  it('runs a real regex in regex mode', () => {
    const m = buildSearchMatcher(opts({ query: 'pool-\\d+', regex: true }))!;
    expect(m('thread pool-7 stalled')).toEqual([[7, 13]]);
    expect(m('thread pool-x stalled')).toBeNull();
  });

  it('falls back to a literal search on an invalid pattern rather than failing the run', () => {
    // Someone mid-typing "[unclosed" should get fewer results, not an error
    // that abandons a scan across a dozen pods.
    const m = buildSearchMatcher(opts({ query: '[unclosed', regex: true }));
    expect(m).not.toBeNull();
    expect(m!('nothing here')).toBeNull();
    expect(m!('an [unclosed thing')).toEqual([[3, 12]]);
  });

  it('does not hang on a zero-width regex match', () => {
    const m = buildSearchMatcher(opts({ query: 'x*', regex: true }))!;
    // The assertion is that this returns at all.
    expect(m('abc')).not.toBeUndefined();
  });

  it('caps hits per line so one pathological line cannot blow up memory', () => {
    // A minified JSON line can contain a token thousands of times; storing
    // every range would cost more than the line itself.
    const m = buildSearchMatcher(opts({ query: 'a' }))!;
    const hits = m('a'.repeat(5000))!;
    expect(hits.length).toBeLessThanOrEqual(50);
  });

  it('is case-insensitive without compiling a regex for a literal', () => {
    // Guards the fast path: a literal search must work on mixed case without
    // the caller having to opt into regex mode.
    const m = buildSearchMatcher(opts({ query: 'OutOfMemory' }))!;
    expect(m('java.lang.outofmemoryerror: Java heap space')).toEqual([[10, 21]]);
  });
});

describe('search defaults', () => {
  it('caps what is stored, per pod and overall', () => {
    // The counts stay truthful past these; only storage stops. Without both
    // caps a wide search across twenty pods would post megabytes into the
    // webview and lock the tab.
    expect(DEFAULT_SEARCH.maxMatchesPerPod).toBeGreaterThan(0);
    expect(DEFAULT_SEARCH.maxMatchesTotal).toBeGreaterThan(DEFAULT_SEARCH.maxMatchesPerPod);
  });

  it('bounds how much of each log is scanned', () => {
    expect(DEFAULT_SEARCH.tailLines).toBeGreaterThan(0);
  });

  it('keeps a little context, because a bare matching line is unreadable', () => {
    expect(DEFAULT_SEARCH.contextLines).toBeGreaterThan(0);
    // But not so much that context dominates what is sent.
    expect(DEFAULT_SEARCH.contextLines).toBeLessThanOrEqual(5);
  });
});
