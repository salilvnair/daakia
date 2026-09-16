/**
 * Going back to where you were.
 *
 * The arithmetic is the part that can be wrong silently: a position remembered
 * from a taller version of the page, applied blind, is truncated by the
 * browser and then written back — so the original is lost on the trip that was
 * supposed to preserve it.
 */
import { describe, it, expect } from 'vitest';
import { restoreTarget, landed } from './remembered-scroll';

describe('where to scroll back to', () => {
  it('is where you were, when the page is still that tall', () => {
    expect(restoreTarget(400, 2000, 600)).toBe(400);
  });

  it('is the bottom when the page has since shrunk', () => {
    /* A filter applied or a section collapsed between visits. Clamped here
       rather than left to the browser, which would truncate it and let the
       shortened value be written back as the new memory. */
    expect(restoreTarget(1800, 900, 600)).toBe(300);
  });

  it('is the top when the page no longer scrolls at all', () => {
    expect(restoreTarget(400, 500, 600)).toBe(0);
    expect(restoreTarget(400, 600, 600)).toBe(0);
  });

  it('refuses a negative memory rather than passing it on', () => {
    expect(restoreTarget(-20, 2000, 600)).toBe(0);
  });
});

describe('whether a restore landed', () => {
  it('forgives sub-pixel rounding, which fractional zoom produces', () => {
    expect(landed(400, 400.4)).toBe(true);
    expect(landed(400, 399.2)).toBe(true);
  });

  it('does not forgive a page that grew under it', () => {
    // The case the settling window exists for: assigned 400 on a short page,
    // the browser gave 120, and the page is about to get taller.
    expect(landed(400, 120)).toBe(false);
  });
});
