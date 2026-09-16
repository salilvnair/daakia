/**
 * Turning a search into something readable.
 *
 * The translation is where this can go wrong quietly: a hit marked as context
 * greys out the answer, a line number taken from the view instead of the pod
 * makes the result impossible to check against `kubectl logs`, and a `seq`
 * that repeats across pods breaks selection and folding in ways that look like
 * a rendering bug.
 */
import { describe, it, expect } from 'vitest';
import {
  resultLines, podsLabel, podsIn, timings, totals, levelsIn,
} from './search-results';
import type { PodGroup, SearchMatch } from '../../store/dk8s-search-store';

function match(over: Partial<SearchMatch> = {}): SearchMatch {
  return {
    pod: 'prodapp-bc8f7bf84-mhz5f',
    namespace: 'pvfix',
    context: 'kind-dk8s-prod',
    line: 42,
    ts: 1_789_000_000_000,
    level: 'error',
    text: 'ERROR timeout talking to billing',
    hits: [[6, 13]],
    before: [],
    after: [],
    ...over,
  };
}

function group(over: Partial<PodGroup> = {}): PodGroup {
  return {
    result: {
      pod: 'prodapp-bc8f7bf84-mhz5f', namespace: 'pvfix', context: 'kind-dk8s-prod',
      scanned: 500, matched: 1, capped: false, elapsedMs: 5,
    },
    matches: [match()],
    ...over,
  } as PodGroup;
}

describe('a search as lines', () => {
  it('keeps the hit a hit and the neighbours context', () => {
    const lines = resultLines([group({
      matches: [match({ before: ['before one'], after: ['after one'] })],
    })]);
    expect(lines.map(l => !!l.context)).toEqual([true, false, true]);
    expect(lines[1].hits).toEqual([[6, 13]]);
    expect(lines[0].hits).toBeUndefined();
  });

  it('numbers context lines against the pod, not against the view', () => {
    /* A reader checks this against `kubectl logs`. A frame three above the
       match is line 39 there, so it is line 39 here. */
    const lines = resultLines([group({
      matches: [match({ line: 42, before: ['a', 'b', 'c'], after: ['d'] })],
    })]);
    expect(lines.map(l => l.sourceLine)).toEqual([39, 40, 41, 42, 43]);
  });

  it('gives every line a seq that is unique across pods', () => {
    /*
      Two pods whose logs both start at line 1 is the ordinary case, and
      selection, folding and the expanded set all key on `seq`. Reusing the
      pod's own line number here would silently collapse them.
    */
    const a = group({ matches: [match({ pod: 'a', line: 1 })] });
    const b = group({
      result: { pod: 'b', namespace: 'pvfix', context: 'c', scanned: 1, matched: 1, capped: false, elapsedMs: 1 },
      matches: [match({ pod: 'b', line: 1 })],
    } as Partial<PodGroup>);
    const lines = resultLines([a, b]);
    expect(new Set(lines.map(l => l.seq)).size).toBe(lines.length);
    expect(lines.map(l => l.pod)).toEqual(['a', 'b']);
  });

  it('carries the cluster under a name that is not `context`', () => {
    /*
      `SearchMatch.context` is a cluster; `LogLine.context` is "kept for what
      it sits next to". One name, two meanings — and conflating them marks
      every hit as context and greys out the whole result.
    */
    const lines = resultLines([group()]);
    expect(lines[0].cluster).toBe('kind-dk8s-prod');
    expect(lines[0].context).toBeUndefined();
  });

  it('calls a group with no source a live one', () => {
    // Only the archive half bothers to say which it is.
    expect(resultLines([group()])[0].source).toBe('live');
    expect(resultLines([group({ source: 'archive' })])[0].source).toBe('archive');
  });

  it('gives a context line no timestamp of its own', () => {
    /* It was never parsed for one — it came back as text beside a hit, and a
       column of the hit's own time repeated down the page is a lie about
       three different lines. */
    const lines = resultLines([group({ matches: [match({ before: ['x'] })] })]);
    expect(lines[0].ts).toBeUndefined();
    expect(lines[1].ts).toBe(1_789_000_000_000);
  });
});

describe('naming what was searched', () => {
  it('is the pod, when there was one', () => {
    expect(podsLabel(['prodapp-bc8f7bf84-mhz5f'])).toBe('prodapp-bc8f7bf84-mhz5f');
  });

  it('is the first and a count, when there were more', () => {
    expect(podsLabel(['a', 'b'])).toBe('a  +1 other');
    expect(podsLabel(['a', 'b', 'c'])).toBe('a  +2 others');
  });

  it('counts each pod once', () => {
    expect(podsLabel(['a', 'a', 'b'])).toBe('a  +1 other');
  });

  it('says so when there were none', () => {
    expect(podsLabel([])).toBe('no pods');
    expect(podsLabel([''])).toBe('no pods');
  });
});

describe('what the overview reports', () => {
  it('names a scanned count only where one was taken', () => {
    /*
      `grep` inside a pod reports what matched and never how much it read. A 0
      there is an absence, and printing it as "0 lines scanned" reports a
      measurement nobody made.
    */
    const inPod = group({
      result: {
        pod: 'p', namespace: 'n', context: 'c', scanned: 0, matched: 3,
        capped: false, elapsedMs: 12, inPod: true,
      },
      source: 'archive',
    } as Partial<PodGroup>);
    expect(timings([inPod])[0].scannedKnown).toBe(false);
    expect(timings([group()])[0].scannedKnown).toBe(true);
  });

  it('carries the roots an archive was searched under', () => {
    const g = group({
      result: {
        pod: 'p', namespace: 'n', context: 'c', scanned: 0, matched: 0, capped: false, elapsedMs: 8,
        roots: ['/prodapp-prod-pvc/prodapp_prod_logs'],
      },
      source: 'archive',
    } as Partial<PodGroup>);
    expect(timings([g])[0].roots).toEqual(['/prodapp-prod-pvc/prodapp_prod_logs']);
  });
});

describe('the totals in the header', () => {
  it('counts matches, pods and the pods that had any', () => {
    const empty = group({
      result: { pod: 'q', namespace: 'n', context: 'c', scanned: 9, matched: 0, capped: false, elapsedMs: 1 },
      matches: [],
    } as Partial<PodGroup>);
    expect(totals([group(), empty])).toEqual({
      matches: 1, pods: 2, podsWithHits: 1, errors: 0,
    });
  });

  it('counts pods that were searched, not pods that matched', () => {
    /* A pod with no hits never reaches `groups`, so counting them there read
       "1 of 1 pods" for a search across three — a complete hit rate, and the
       pod somebody is asking about missing from the count entirely. */
    expect(totals([group()], [
      { pod: 'prodapp-bc8f7bf84-mhz5f' }, { pod: 'a' }, { pod: 'b' },
    ])).toMatchObject({ pods: 3, podsWithHits: 1 });
  });
});

describe('the level chips', () => {
  it('count events, never the lines kept beside them', () => {
    /* One ERROR with eight neighbours is one error. Counting the neighbours
       would make every chip a function of the context setting. */
    const lines = resultLines([group({
      matches: [match({ before: ['a', 'b'], after: ['c'] })],
    })]);
    expect(levelsIn(lines).error).toBe(1);
  });
});

describe('every pod a search touched', () => {
  it('lists them in the order they were searched, once each', () => {
    const a = group();
    const b = group({
      result: { pod: 'other', namespace: 'pvfix', context: 'c', scanned: 1, matched: 0, capped: false, elapsedMs: 1 },
      matches: [],
    } as Partial<PodGroup>);
    expect(podsIn([a, b, a])).toEqual(['prodapp-bc8f7bf84-mhz5f', 'other']);
  });
});

describe('pods that matched nothing', () => {
  it('still get a row, because "nothing there" is an answer', () => {
    /*
      `groups` only carries pods that matched — right for a list of results,
      wrong for a page claiming to say what the search did. The missing row is
      the one somebody looks for when they expected a hit in that pod, and its
      absence turns "there was nothing there" into "was it even searched?".
    */
    const rows = timings([group()], [
      { pod: 'prodapp-bc8f7bf84-mhz5f', namespace: 'pvfix' },
      { pod: 'checkout-worker-6b68bdb9b5-nqp4j', namespace: 'checkout' },
    ]);
    expect(rows.map(r => r.pod)).toEqual([
      'prodapp-bc8f7bf84-mhz5f',
      'checkout-worker-6b68bdb9b5-nqp4j',
    ]);
    expect(rows[1].matched).toBe(0);
  });

  it('does not duplicate a pod that did match', () => {
    const rows = timings([group()], [
      { pod: 'prodapp-bc8f7bf84-mhz5f', namespace: 'pvfix' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].matched).toBe(1);
  });

  it('claims no line count for a pod it never reported one for', () => {
    const rows = timings([], [{ pod: 'x', namespace: 'n' }]);
    expect(rows[0].scannedKnown).toBe(false);
  });
});
