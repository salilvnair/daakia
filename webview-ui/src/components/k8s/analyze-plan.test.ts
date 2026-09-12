import { describe, it, expect } from 'vitest';
import { planAnalyze, ANALYZE_HEAD, ANALYZE_TAIL, ANALYZE_FULL_LIMIT } from './AnalyzeModal';
import type { LogLine } from '../../store/k8s-store';

const lines = (n: number, text = 'x'.repeat(80)): LogLine[] =>
  Array.from({ length: n }, (_, i) => ({ seq: i, level: 'info', text }));

describe('planAnalyze', () => {
  it('sends the whole buffer when it fits', () => {
    const p = planAnalyze(lines(200));
    expect(p.truncated).toBe(false);
    expect(p.sentLines).toBe(200);
    expect(p.omittedLines).toBe(0);
  });

  it('sends everything right up to the limit', () => {
    // The boundary matters: an off-by-one here would claim truncation on a
    // buffer that fits, and warn about dropping nothing.
    const p = planAnalyze(lines(ANALYZE_FULL_LIMIT));
    expect(p.truncated).toBe(false);
    expect(p.omittedLines).toBe(0);
  });

  it('truncates head-and-tail past the limit', () => {
    const p = planAnalyze(lines(5000));
    expect(p.truncated).toBe(true);
    expect(p.sentLines).toBe(ANALYZE_HEAD + ANALYZE_TAIL);
    expect(p.omittedLines).toBe(5000 - ANALYZE_FULL_LIMIT);
    // Every line is accounted for — the dialog's numbers have to add up or it
    // is worse than showing none.
    expect(p.sentLines + p.omittedLines).toBe(p.totalLines);
  });

  it('measures the bytes actually sent, not the whole buffer', () => {
    // Reporting the buffer's size on a truncated send would overstate the cost
    // by an order of magnitude and make the warning untrustworthy.
    const small = planAnalyze(lines(100));
    const huge = planAnalyze(lines(10_000));
    expect(huge.bytes).toBeLessThan(small.bytes * 20);
    expect(huge.bytes).toBeGreaterThan(0);
  });

  it('handles an empty buffer without pretending it sent something', () => {
    const p = planAnalyze([]);
    expect(p.totalLines).toBe(0);
    expect(p.sentLines).toBe(0);
    expect(p.bytes).toBe(0);
    expect(p.truncated).toBe(false);
  });
});
