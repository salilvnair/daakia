/**
 * The scale has to mean the same thing in all five views, so it is worth
 * pinning: a band that quietly shifts turns a red row in Hot spots and an
 * amber row in Allocation into the same underlying number, which is exactly
 * the confusion colour was added to remove.
 */
import { describe, it, expect } from 'vitest';
import { heatOf, heatOfMax, HEAT_LEGEND } from './heat';

describe('heatOf', () => {
  it('puts a dominant frame in critical', () => {
    expect(heatOf(92.7).band).toBe('critical');
    expect(heatOf(25).band).toBe('critical');
  });

  it('puts a significant frame in high', () => {
    expect(heatOf(24.9).band).toBe('high');
    expect(heatOf(10).band).toBe('high');
  });

  it('puts a minor frame in moderate', () => {
    expect(heatOf(9.9).band).toBe('moderate');
    expect(heatOf(5).band).toBe('moderate');
  });

  it('leaves the long tail uncoloured', () => {
    expect(heatOf(4.9).band).toBe('low');
    expect(heatOf(0).band).toBe('low');
  });

  it('washes only the two bands worth washing', () => {
    /* A tint behind every row is a tinted table, not a signal. */
    expect(heatOf(30).wash).not.toBe('transparent');
    expect(heatOf(12).wash).not.toBe('transparent');
    expect(heatOf(7).wash).toBe('transparent');
    expect(heatOf(1).wash).toBe('transparent');
  });

  it('describes each band in words, for the tooltip', () => {
    expect(heatOf(90).label).toContain('dominant');
    expect(heatOf(1).label).toBe('negligible');
  });
});

describe('heatOfMax', () => {
  it('reads a value against the worst row rather than against a total', () => {
    expect(heatOfMax(400, 400).band).toBe('critical');
    expect(heatOfMax(40, 400).band).toBe('high');
    expect(heatOfMax(4, 400).band).toBe('low');
  });

  it('does not divide by zero when nothing was measured', () => {
    expect(heatOfMax(0, 0).band).toBe('low');
    expect(heatOfMax(10, 0).band).toBe('low');
  });

  it('agrees with heatOf on the same ratio', () => {
    expect(heatOfMax(30, 100).band).toBe(heatOf(30).band);
    expect(heatOfMax(3, 100).band).toBe(heatOf(3).band);
  });
});

describe('HEAT_LEGEND', () => {
  it('covers every band once, worst first', () => {
    expect(HEAT_LEGEND.map(l => l.band)).toEqual(['critical', 'high', 'moderate', 'low']);
  });

  it('quotes the thresholds the code actually uses', () => {
    /* A legend that drifts from the function is worse than none — it is a
       label saying the colour means something it no longer means. */
    const byBand = Object.fromEntries(HEAT_LEGEND.map(l => [l.band, l]));
    expect(heatOf(25).color).toBe(byBand.critical.color);
    expect(heatOf(10).color).toBe(byBand.high.color);
    expect(heatOf(5).color).toBe(byBand.moderate.color);
    expect(heatOf(4).color).toBe(byBand.low.color);
  });
});
