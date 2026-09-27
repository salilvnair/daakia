/**
 * The summary is the part a tester reads instead of the log, so being wrong
 * here is worse than being wrong anywhere else in the feature: nobody checks a
 * number against four hundred lines.
 */
import { describe, it, expect } from 'vitest';
import {
  summarise, asNumber, numericHoles, holeSpread, determinantsIn, enabledDeterminants,
  podScope, scopeApplies, determinantsFor, scopeLabel, showOf, describeSpec, determinantName,
  previewWindow, matchStrip,
} from './determinants';
import { fromLoggerCall, fromRegex } from './logger-pattern';
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

describe('which determinants a window answers', () => {
  it('leaves out the ones switched off, but Settings still lists them', () => {
    const on = { ...api({ groupBy: ['path'] }), id: 'on' };
    const off = { ...api({ groupBy: ['path'], off: true }), id: 'off' };
    expect(enabledDeterminants([on, off]).map(p => p.id)).toEqual(['on']);
    expect(determinantsIn([on, off]).map(p => p.id)).toEqual(['on', 'off']);
  });
});

describe('where a determinant applies', () => {
  const pod = { name: 'payments-7d9f2', namespace: 'pay', context: 'prod' };
  const target = { workload: 'prod/pay/Deployment/payments', pod: podScope(pod) };

  it('writes a pod scope that cannot be mistaken for a workload one', () => {
    expect(podScope(pod)).toBe('prod/pay/Pod/payments-7d9f2');
  });

  it('applies everywhere with *, even with no pod open', () => {
    expect(scopeApplies('*', target)).toBe(true);
    expect(scopeApplies('*', undefined)).toBe(true);
  });

  it('applies to every pod of its workload', () => {
    expect(scopeApplies('prod/pay/Deployment/payments', target)).toBe(true);
    expect(scopeApplies('prod/pay/Deployment/ledger', target)).toBe(false);
  });

  it('applies to its own pod and no other replica', () => {
    expect(scopeApplies('prod/pay/Pod/payments-7d9f2', target)).toBe(true);
    expect(scopeApplies('prod/pay/Pod/payments-4b218', target)).toBe(false);
  });

  it('never matches a workload whose name only starts the same', () => {
    expect(scopeApplies('prod/pay/Deployment/pay', target)).toBe(false);
  });

  it('keeps only the ones that apply', () => {
    const everywhere = { ...api({ groupBy: ['path'] }), id: 'a' };
    const elsewhere = { ...api({ groupBy: ['path'] }), id: 'b', scope: 'prod/pay/Deployment/ledger' };
    expect(determinantsFor([everywhere, elsewhere], target).map(p => p.id)).toEqual(['a']);
  });

  it('reads a scope out the way the picker set it', () => {
    expect(scopeLabel('*')).toBe('every workload');
    expect(scopeLabel('prod/pay/Deployment/payments')).toBe('payments only');
    expect(scopeLabel('prod/pay/Pod/payments-7d9f2')).toBe('pod payments-7d9f2');
    expect(scopeLabel('prod/pay/Pod')).toBe('unowned pods in pay');
  });
});

describe('summarise as', () => {
  it('keeps the columns a summary always had when nothing was chosen', () => {
    expect(showOf({ groupBy: ['path'], measure: 'took' })).toEqual({ count: true, worst: true, seen: true, draw: false });
  });

  it('never shows a worst without a measure to take it of', () => {
    expect(showOf({ groupBy: ['path'], show: { count: true, worst: true, seen: false, draw: false } }).worst).toBe(false);
  });

  it('says what it groups by and what it answers', () => {
    expect(describeSpec({
      groupBy: ['method', 'path'], mix: 'status', measure: 'took',
      show: { count: true, worst: true, seen: false, draw: false },
    })).toEqual({ grouping: 'method + path', answer: 'how many, status mix, worst took' });
  });

  it('is named by its name, or by its template when it has none', () => {
    expect(determinantName(api({ groupBy: ['path'], name: '  API calls ' }))).toBe('API calls');
    expect(determinantName(api({ groupBy: ['path'] }))).toBe('{method} {path} -> {status} in {took}ms');
  });
});

describe('the window a preview reads', () => {
  const MIN = 60_000;
  const at = (m: number, text = 'GET /a -> 200 in 5ms') => line(text, m * MIN);

  it('is the last N minutes back from the newest line, not from now', () => {
    const w = previewWindow([at(0), at(30), at(61), at(100)], 40);
    expect(w.lines.map(l => l.ts! / MIN)).toEqual([61, 100]);
    expect([w.from! / MIN, w.to! / MIN]).toEqual([61, 100]);
    expect(w.wholeBuffer).toBe(false);
  });

  it('leaves out lines with no time, and counts them', () => {
    const w = previewWindow([at(0), line('no time'), at(10)], 40);
    expect(w.lines).toHaveLength(2);
    expect(w.untimed).toBe(1);
  });

  it('is the whole buffer, flagged, when no line has a time at all', () => {
    const w = previewWindow([line('a'), line('b')], 40);
    expect(w.lines).toHaveLength(2);
    expect(w.wholeBuffer).toBe(true);
  });

  it('is empty, not an error, with nothing open', () => {
    expect(previewWindow([], 40).lines).toEqual([]);
  });
});

describe('drawing it over the window', () => {
  it('puts each match in the slot of time it fell in', () => {
    const { counts } = matchStrip(calls, api({ groupBy: ['path'] }), 5);
    // Five calls at 10..50, and a heartbeat at 60 that is not one of them.
    expect(counts.reduce((a, b) => a + b, 0)).toBe(5);
    expect(counts[0]).toBe(1);
  });

  it('draws nothing for lines with no timestamps', () => {
    expect(matchStrip([line('GET /a -> 200 in 5ms')], api({ groupBy: ['path'] }), 5).from).toBeUndefined();
  });
});

describe('a determinant written as a regex', () => {
  it('summarises by its named groups, the same as by holes', () => {
    const p = fromRegex('(GET|POST) (?<path>\\S+) -> (?<status>\\d{3})');
    if ('error' in p) throw new Error(p.error);
    const [summary] = summarise(calls, [{ ...p, id: 'r', scope: '*', added: 1, summary: { groupBy: ['path'], mix: 'status' } }]);
    expect(summary.rows.map(r => [r.key, r.count])).toEqual([[['/ledger/entries'], 3], [['/orders/{id}'], 2]]);
    expect(summary.rows[0].mix).toEqual([['201', 2], ['504', 1]]);
  });
});
