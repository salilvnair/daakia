/**
 * The window a download opens on.
 *
 * It is the reader's own number: they searched, the hits came back between
 * 10:00 and 10:30, and that half hour is what they want on disk. Getting it
 * from the wrong lines produces a range nobody asked for, and the download
 * would then re-read the cluster for it.
 */
import { describe, it, expect } from 'vitest';
import { hitSpan } from './SearchResultsPage';

const at = (h: number, m = 0) => Date.UTC(2026, 8, 16, h, m);

describe('when the hits happened', () => {
  it('is the first and the last of them', () => {
    expect(hitSpan([
      { ts: at(10, 30) },
      { ts: at(10, 0) },
      { ts: at(10, 15) },
    ])).toEqual({ from: at(10, 0), to: at(10, 30) });
  });

  it('is not stretched by a neighbour', () => {
    /* A line kept for sitting beside a hit is not a hit. Letting one widen
       the window hands back a range the search never found anything in. */
    expect(hitSpan([
      { ts: at(9, 0), context: true },
      { ts: at(10, 0) },
      { ts: at(10, 5) },
      { ts: at(23, 0), context: true },
    ])).toEqual({ from: at(10, 0), to: at(10, 5) });
  });

  it('ignores lines that carry no time of their own', () => {
    expect(hitSpan([
      { ts: undefined },
      { ts: at(10, 0) },
    ])).toEqual({ from: at(10, 0), to: at(10, 0) });
  });

  it('is nothing at all when no hit has a timestamp', () => {
    /* A format with no timestamps gives no span, and the dialog opens on
       everything — true, rather than a range invented from nothing. */
    expect(hitSpan([{ ts: undefined }, { ts: undefined, context: true }])).toBeUndefined();
    expect(hitSpan([])).toBeUndefined();
  });

  it('is a single instant when one hit is all there was', () => {
    expect(hitSpan([{ ts: at(10, 0) }])).toEqual({ from: at(10, 0), to: at(10, 0) });
  });
});
