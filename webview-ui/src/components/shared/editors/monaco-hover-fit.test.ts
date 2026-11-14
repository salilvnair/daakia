/**
 * A Monaco tooltip near the edge of a clipped editor moves back inside it.
 */
import { describe, it, expect } from 'vitest';
import { shiftInto } from './monaco-hover-fit';

const clip = { left: 40, right: 1580 };

describe('shiftInto', () => {
  it('leaves a tooltip that fits where Monaco put it', () => {
    expect(shiftInto({ left: 900, right: 990 }, clip)).toBe(0);
  });

  it('moves one cut off on the right back in, 4px from the edge', () => {
    /* "Close (Escape)" over the find widget's X, past the sidebar's edge. */
    expect(shiftInto({ left: 1540, right: 1633 }, clip)).toBe(1576 - 1633);
  });

  it('moves one cut off on the left back in', () => {
    expect(shiftInto({ left: 10, right: 100 }, clip)).toBe(34);
  });

  it('wider than the space: shows its start rather than its end', () => {
    expect(shiftInto({ left: 1000, right: 2700 }, clip)).toBe(44 - 1000);
  });
});
