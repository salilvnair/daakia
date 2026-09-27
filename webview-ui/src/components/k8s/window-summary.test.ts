/**
 * The Window's arithmetic: where the lines fall, which rows failed, and what
 * narrowing leaves. A density strip off by a bucket puts the burst at the
 * wrong minute; a row called failing on a guess sends somebody after the
 * wrong endpoint.
 */
import { describe, it, expect } from 'vitest';
import { density, isFailingValue, failing, mixLabel, mixVerdict, narrowBy, narrowed, summaryText, rowLines } from './window-summary';

describe('density', () => {
  it('buckets lines across the window, errors counted apart', () => {
    const d = density([{ ts: 0 }, { ts: 5 }, { ts: 99, level: 'error' }, { ts: 100 }, { ts: 200 }], 0, 100, 4);
    expect(d.map(b => b.n)).toEqual([2, 0, 0, 2]);
    expect(d[3].errors).toBe(1);
  });
});

describe('failing', () => {
  it('is a 4xx/5xx or a word that says so, and nothing else', () => {
    expect(isFailingValue('504')).toBe(true);
    expect(isFailingValue('409')).toBe(true);
    expect(isFailingValue('201')).toBe(false);
    expect(isFailingValue('timed out')).toBe(true);
    expect(isFailingValue('ok')).toBe(false);
    const row = { key: ['POST', '/x'], count: 31, mix: [['201', 28], ['504', 3]] as [string, number][] };
    expect(failing(row)).toBe(3);
    expect(mixLabel(row)).toBe('28·201 3·504');
    expect(mixVerdict(row)).toBe('3 504');
    expect(mixVerdict({ key: ['a'], count: 2, mix: [['200', 2]] })).toBe('all fine');
  });
});

describe('narrowing', () => {
  it('offers what the anchor line names, then narrows exactly', () => {
    const anchor = { text: 'x', thread: 'exec-7', fields: { requestDataId: '8842' }, pod: 'p1' };
    const chips = narrowBy(anchor, () => [{ key: 'orderId', value: 'A-1' }]);
    expect(chips.map(c => c.field)).toEqual(['thread', 'requestDataId', 'orderId', 'pod']);
    const lines = [{ text: 'a', thread: 'exec-7' }, { text: 'b', thread: 'exec-71' }];
    expect(narrowed(lines, [{ field: 'thread', value: 'exec-7' }], []).map(l => l.text)).toEqual(['a']);
  });
});

describe('summary text', () => {
  it('writes each determinant as a table', () => {
    const text = summaryText([{
      pattern: { id: 'p', scope: '*', added: 0, source: 'paste', template: '{method} {path} -> {status} in {ms}ms', holes: ['method', 'path', 'status', 'ms'],
        summary: { groupBy: ['method', 'path'], mix: 'status', measure: 'ms' } },
      rows: [{ key: ['GET', '/a'], count: 2, mix: [['200', 2]], worst: 40, firstTs: 0 }],
      ungrouped: 0,
    }], { from: 0, to: 60000, lines: 10, pods: ['p1'] }, []);
    expect(text).toContain('method\tpath\tcount\tstatus\tmax ms\tfirst seen');
    expect(text).toContain('GET\t/a\t2\t2·200\t40\t1970-01-01T00:00:00.000Z');
  });

  it('finds the lines a row was counted from', () => {
    const lines = [{ text: 'GET /a' }, { text: 'GET /b' }];
    const read = (l: { text: string }) => { const [m, p] = l.text.split(' '); return { method: m, path: p }; };
    expect(rowLines(lines, read, ['method', 'path'], ['GET', '/b'])).toEqual([{ text: 'GET /b' }]);
  });
});
