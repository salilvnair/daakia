/**
 * The summary is the part a tester reads instead of the log, so being wrong
 * here is worse than being wrong anywhere else in the feature: nobody checks a
 * number against four hundred lines.
 */
import { describe, it, expect } from 'vitest';
import { summarise, asNumber, numericHoles, holeSpread, determinantsIn } from './determinants';
import { fromLoggerCall } from './logger-pattern';
import type { CataloguePattern } from '../../store/dk8s-logger-store';
import type { LogLine } from '../../store/k8s-store';

const api = (summary: CataloguePattern['summary']): CataloguePattern => ({
  id: 'api',
  scope: '*',
  added: 1,
  summary,
  ...fromLoggerCall('log.info("{} {} -> {} in {}ms", method, path, status, took)')!,
});

const line = (text: string, ts?: number): LogLine => ({ seq: 0, level: 'info', text, ts });

const calls = [
  line('GET /orders/{id} -> 200 in 120ms', 10),
  line('GET /orders/{id} -> 200 in 340ms', 20),
  line('POST /ledger/entries -> 201 in 90ms', 30),
  line('POST /ledger/entries -> 504 in 30000ms', 40),
  line('POST /ledger/entries -> 201 in 110ms', 50),
  line('heartbeat ok', 60),
];

describe('which patterns are determinants', () => {
  it('is the ones that were told how to summarise', () => {
    expect(determinantsIn([api({ groupBy: ['method', 'path'] }), api(undefined)])).toHaveLength(1);
  });

  it('ignores one with an empty grouping, which would be one row for everything', () => {
    expect(determinantsIn([api({ groupBy: [] })])).toHaveLength(0);
  });
});

describe('summarising a window', () => {
  it('groups by the holes it was told to', () => {
    const [summary] = summarise(calls, [api({ groupBy: ['method', 'path'] })]);
    expect(summary.rows.map(r => [r.key, r.count])).toEqual([
      [['POST', '/ledger/entries'], 3],
      [['GET', '/orders/{id}'], 2],
    ]);
  });

  it('puts the busiest group first, because that is where reading stops', () => {
    const [summary] = summarise(calls, [api({ groupBy: ['path'] })]);
    expect(summary.rows[0].key).toEqual(['/ledger/entries']);
  });

  it('reports the worst measure, not the last one', () => {
    const [summary] = summarise(calls, [api({ groupBy: ['path'], measure: 'took' })]);
    const ledger = summary.rows.find(r => r.key[0] === '/ledger/entries')!;
    expect(ledger.worst).toBe(30000);
  });

  it('counts the mix, most common first', () => {
    const [summary] = summarise(calls, [api({ groupBy: ['path'], mix: 'status' })]);
    const ledger = summary.rows.find(r => r.key[0] === '/ledger/entries')!;
    expect(ledger.mix).toEqual([['201', 2], ['504', 1]]);
  });

  it('carries the span it saw', () => {
    const [summary] = summarise(calls, [api({ groupBy: ['path'] })]);
    const orders = summary.rows.find(r => r.key[0] === '/orders/{id}')!;
    expect([orders.firstTs, orders.lastTs]).toEqual([10, 20]);
  });

  it('ignores the lines that are not this logger', () => {
    const [summary] = summarise(calls, [api({ groupBy: ['path'] })]);
    expect(summary.rows.reduce((n, r) => n + r.count, 0)).toBe(5);
  });

  it('lets two determinants both claim a line', () => {
    // Unlike a mark, where first match wins: one question may count a call and
    // another may count it as a slow one, and both answers are wanted.
    const summaries = summarise(calls, [
      { ...api({ groupBy: ['path'] }), id: 'a' },
      { ...api({ groupBy: ['status'] }), id: 'b' },
    ]);
    expect(summaries[0].rows.reduce((n, r) => n + r.count, 0)).toBe(5);
    expect(summaries[1].rows.reduce((n, r) => n + r.count, 0)).toBe(5);
  });

  it('is empty rather than wrong when nothing matched', () => {
    const [summary] = summarise([line('heartbeat ok')], [api({ groupBy: ['path'] })]);
    expect(summary.rows).toEqual([]);
  });
});

describe('reading a number out of a hole', () => {
  it('takes the number off the front, unit and all', () => {
    expect(asNumber('30000ms')).toBe(30000);
    expect(asNumber('1.9s')).toBe(1.9);
    expect(asNumber('248.40')).toBe(248.4);
    expect(asNumber('1,204')).toBe(1204);
  });

  it('is undefined for something that is not a number', () => {
    expect(asNumber('fast')).toBeUndefined();
    expect(asNumber(undefined)).toBeUndefined();
    expect(asNumber('')).toBeUndefined();
  });

  /*
    Deliberately not converting: `1.9s` and `30000ms` in one "worst" would be a
    number nobody can act on, and one determinant covers one logger, whose unit
    does not change between lines.
  */
  it('does not convert a unit', () => {
    expect(asNumber('1.9s')).toBe(1.9);
  });
});

describe('what the builder offers', () => {
  it('calls a hole numeric only when it was a number every time', () => {
    expect(numericHoles(calls, api(undefined))).toEqual(['status', 'took']);
  });

  it('counts how many values each hole took, so a bad grouping can be warned about', () => {
    const spread = holeSpread(calls, api(undefined));
    expect(spread.path).toBe(2);
    expect(spread.method).toBe(2);
    // `took` is different on nearly every line: grouping by it is a list.
    expect(spread.took).toBe(5);
  });
});
