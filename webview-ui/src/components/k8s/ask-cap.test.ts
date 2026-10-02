import { describe, expect, it } from 'vitest';
import { capLines, grepTerms } from './ask-cap';

const line = (text: string, continuation = false) => ({ text, continuation });

describe('grepTerms', () => {
  it('prefers ids to words', () => {
    expect(grepTerms('what happened to orderId A-4470 since 09:30')).toEqual(['a-4470']);
  });
  it('keeps the words that are not about time', () => {
    expect(grepTerms('why the payment timeout in the last hour')).toEqual(['payment', 'timeout']);
    expect(grepTerms('what went wrong in the last 10 minutes')).toEqual([]);
  });
});

describe('capLines', () => {
  it('leaves a short scope alone', () => {
    const lines = [line('a'), line('b')];
    const c = capLines(lines, 'x', 10);
    expect(c).toMatchObject({ lines, total: 2 });
    expect(c.how).toBeUndefined();
  });

  it('greps for the question, then keeps the newest', () => {
    const lines = Array.from({ length: 50 }, (_, i) => line(i % 10 === 0 ? `payment ${i} timed out` : `ok ${i}`));
    const c = capLines(lines, 'why did the payment fail', 3);
    expect(c.how).toBe('grep-newest');
    expect(c.lines.map(l => l.text)).toEqual(['payment 20 timed out', 'payment 30 timed out', 'payment 40 timed out']);
    expect(capLines(lines, 'why did the payment fail', 5).how).toBe('grep');
  });

  it('falls back to the newest lines when nothing matches, and keeps a trace with its line', () => {
    const lines = [line('one'), line('two'), line('boom'), line('  at x', true), line('  at y', true)];
    const c = capLines(lines, 'what went wrong', 3);
    expect(c.how).toBe('newest');
    expect(c.lines.map(l => l.text)).toEqual(['boom', '  at x', '  at y']);
  });
});
