/**
 * The Logs tab's mark map, rail and "Only marked" all read one index of the
 * whole buffer. It has to be right, and it has to be cheap on a following log.
 */
import { describe, it, expect } from 'vitest';
import {
  compileMarks, indexMarks, countIndex, markFacets, nextMarked, keepMarked, markedLevels, type MarkHit,
} from './logger-marks';
import type { CataloguePattern } from '../../store/dk8s-logger-store';

const p = (id: string, template: string, holes: string[], color = 0): CataloguePattern =>
  ({ id, template, holes, source: 'paste', scope: 's', added: 1, marked: true, color });

const marks = compileMarks([
  p('rej', 'Order {orderId} rejected: {reason}', ['orderId', 'reason'], 0),
  p('cap', 'Payment capture failed for order {orderId}', ['orderId'], 1),
]);

const lines = [
  { seq: 1, text: 'Order A-4469 rejected: card_declined' },
  { seq: 2, text: 'Stock reserved for A-4470' },
  { seq: 3, text: 'Payment capture failed for order A-4470' },
  { seq: 4, text: '  at x.y(Z.java:1)', continuation: true },
  { seq: 5, text: 'Order A-4470 rejected: capture_timeout' },
];

describe('the index', () => {
  it('finds every marked line in the buffer', () => {
    const index = indexMarks(lines, marks, new Map());
    expect([...index.keys()]).toEqual([1, 3, 5]);
    expect(countIndex(index)).toEqual({ rej: 2, cap: 1 });
  });

  it('never works a line out twice', () => {
    const cache = new Map<number, MarkHit | null>();
    indexMarks(lines, marks, cache);
    cache.set(2, { id: 'fake', color: 0, template: '', start: 0, end: 0, fields: {} });
    expect(indexMarks(lines, marks, cache).get(2)?.id).toBe('fake');
  });

  it('offers the holes as facets', () => {
    const facets = markFacets(indexMarks(lines, marks, new Map()));
    expect(facets.find(f => f.field === 'orderId')?.values[0]).toEqual(['A-4470', 2]);
    expect(facets.map(f => f.field)).toEqual(['orderId', 'reason']);
  });

  it('keeps the marked lines and their frames for Only marked', () => {
    const index = indexMarks(lines, marks, new Map());
    expect(keepMarked(lines, index).map(l => l.seq)).toEqual([1, 3, 4, 5]);
    expect(keepMarked(lines, index, { field: 'orderId', value: 'A-4470' }).map(l => l.seq)).toEqual([3, 4, 5]);
  });

  it('counts the marked lines by level', () => {
    const index = indexMarks(lines, marks, new Map());
    const levelled = lines.map((l, i) => ({ ...l, level: i === 2 ? 'error' : 'warn' }));
    expect(markedLevels(levelled, index)).toEqual([['error', 1], ['warn', 2]]);
  });

  it('steps to the next match, wrapping, optionally of one mark', () => {
    const index = indexMarks(lines, marks, new Map());
    const rows = lines.map(line => ({ line }));
    expect(nextMarked(rows, index, 0)).toBe(2);
    expect(nextMarked(rows, index, 4)).toBe(0);
    expect(nextMarked(rows, index, 0, 'rej')).toBe(4);
  });
});
