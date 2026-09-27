import { describe, expect, it } from 'vitest';
import { parseScope, scopeFromPlan, linesInScope, bufferCovers, defaultScope, type AskScope } from './ask-scope';

/* 2026-09-27 11:50:55 local. */
const NOW = new Date(2026, 8, 27, 11, 50, 55).getTime();
const MIN = 60_000;

describe('parseScope — the question says how much to read', () => {
  it('reads a number of lines', () => {
    expect(parseScope('what is that last 100 lines have in the logs', NOW)).toMatchObject({ kind: 'tail', n: 100, label: 'last 100 lines' });
    expect(parseScope('summarise the latest 2,000 log lines', NOW)).toMatchObject({ kind: 'tail', n: 2000 });
    expect(parseScope('tail 50', NOW)).toMatchObject({ kind: 'tail', n: 50 });
    expect(parseScope('what are the first 20 lines', NOW)).toMatchObject({ kind: 'head', n: 20, label: 'first 20 lines' });
  });

  it('reads a span back from now', () => {
    const s = parseScope('what went wrong in the last 10 minutes', NOW) as Extract<AskScope, { kind: 'range' }>;
    expect(s).toMatchObject({ kind: 'range', label: 'last 10 minutes' });
    expect(NOW - s.fromMs).toBe(10 * MIN);
    expect(parseScope('errors in the past hour', NOW)).toMatchObject({ label: 'last 1 hour' });
    expect(parseScope('anything odd in the last 2h', NOW)).toMatchObject({ label: 'last 2 hours' });
    expect(parseScope('what happened 15 minutes ago', NOW)).toMatchObject({ label: 'last 15 minutes' });
    expect(parseScope('last half an hour please', NOW)).toMatchObject({ label: 'last 30 minutes' });
    expect(parseScope('the last few minutes', NOW)).toMatchObject({ label: 'last 3 minutes' });
  });

  it('reads days and clock times', () => {
    const y = parseScope('anything new since yesterday', NOW) as Extract<AskScope, { kind: 'range' }>;
    expect(new Date(y.fromMs).getDate()).toBe(26);
    expect(y.toMs).toBeUndefined();
    const only = parseScope('what failed yesterday', NOW) as Extract<AskScope, { kind: 'range' }>;
    expect(only.toMs).toBe(new Date(2026, 8, 27).getTime());
    expect(parseScope('errors today', NOW)).toMatchObject({ label: 'today' });
    const since = parseScope('slow calls since 09:30', NOW) as Extract<AskScope, { kind: 'range' }>;
    expect(new Date(since.fromMs).getHours()).toBe(9);
    expect(since.label).toBe('since 09:30');
    const between = parseScope('timeouts between 9am and 10:15', NOW) as Extract<AskScope, { kind: 'range' }>;
    expect(between.label).toBe('09:00 – 10:15');
    expect(between.toMs).toBe(new Date(2026, 8, 27, 10, 15).getTime());
  });

  it('a clock time still to come today means yesterday', () => {
    const s = parseScope('since 23:00', NOW) as Extract<AskScope, { kind: 'range' }>;
    expect(new Date(s.fromMs).getDate()).toBe(26);
  });

  it('reads restart and everything', () => {
    expect(parseScope('what happened since the last restart', NOW)).toMatchObject({ kind: 'restart' });
    expect(parseScope('go through all the logs', NOW)).toMatchObject({ kind: 'all' });
  });

  it('says nothing about a question with no time in it', () => {
    expect(parseScope('orderId A-4470', NOW)).toBeUndefined();
    expect(parseScope('which loggers went quiet', NOW)).toBeUndefined();
    expect(parseScope('why did the payment call fail', NOW)).toBeUndefined();
  });
});

describe('scopeFromPlan — the model’s answer when the parser has none', () => {
  it('reads each kind', () => {
    expect(scopeFromPlan('{"tail": 300, "label": "last 300 lines"}', NOW)).toMatchObject({ kind: 'tail', n: 300 });
    expect(scopeFromPlan('{"sinceMinutes": 45}', NOW)).toMatchObject({ kind: 'range', label: 'last 45 minutes' });
    const r = scopeFromPlan('```json\n{"from": "2026-09-27T08:00:00", "to": "2026-09-27T09:00:00", "label": "the deploy at 8"}\n```', NOW);
    expect(r).toMatchObject({ kind: 'range', label: 'the deploy at 8' });
  });

  it('is undefined when nothing is named, or the answer is not JSON', () => {
    expect(scopeFromPlan('{"tail": null, "from": null}', NOW)).toBeUndefined();
    expect(scopeFromPlan('no idea', NOW)).toBeUndefined();
  });
});

describe('linesInScope and bufferCovers', () => {
  const buf = [0, 1, 2, 3, 4, 5].map(i => ({ ts: NOW - (5 - i) * MIN, i }));

  it('slices by count and by time', () => {
    expect(linesInScope(buf, { kind: 'tail', n: 2, label: '' }).map(l => l.i)).toEqual([4, 5]);
    expect(linesInScope(buf, { kind: 'head', n: 2, label: '' }).map(l => l.i)).toEqual([0, 1]);
    expect(linesInScope(buf, { kind: 'range', fromMs: NOW - 2 * MIN, label: '' }).map(l => l.i)).toEqual([3, 4, 5]);
    expect(linesInScope(buf, { kind: 'range', fromMs: NOW - 4 * MIN, toMs: NOW - 3 * MIN, label: '' }).map(l => l.i)).toEqual([1, 2]);
  });

  it('knows when the buffer is too short and a fetch is needed', () => {
    const fetched = { direction: 'last' as const, since: 'all', tail: 200 };
    expect(bufferCovers(buf, { kind: 'tail', n: 6, label: '' }, fetched)).toBe(true);
    expect(bufferCovers(buf, { kind: 'tail', n: 100, label: '' }, fetched)).toBe(false);
    expect(bufferCovers(buf, { kind: 'range', fromMs: NOW - 3 * MIN, label: '' }, fetched)).toBe(true);
    /* Five seconds held, ten minutes asked for — the case that made every window read "11:50 – 11:50". */
    expect(bufferCovers(buf, defaultScope(NOW), fetched)).toBe(false);
  });
});
