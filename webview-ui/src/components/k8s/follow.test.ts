/**
 * Follow and the field readers.
 *
 * What goes wrong quietly here is exactness: a Follow that matched "mentions
 * the value" would put `exec-71` in a thread about `exec-7`, and a reader that
 * found a value where the line has none would make a field up. Both look like
 * results. These pin the difference.
 */
import { describe, it, expect } from 'vitest';
import {
  follows, followQuery, podCounts, touched, spread, numberOf, atLeast, series, isMeasure,
  whereFrom, arrange, cameFrom, nextWidth, widthLabel,
} from './follow';
import { compileCustom, readersOf, readFields, valueOf, testReader, parseCustomFields } from './field-readers';

const line = (over: Record<string, unknown> = {}) => ({
  seq: 0, level: 'info' as const, text: 'x', pod: 'p1', ts: 1000, ...over,
});

describe('follows', () => {
  it('is equality on the field, never a mention', () => {
    const c = [{ field: 'thread', value: 'exec-7', on: true }];
    expect(follows(line({ thread: 'exec-7' }), c)).toBe(true);
    expect(follows(line({ thread: 'exec-71', text: 'exec-7 mentioned' }), c)).toBe(false);
  });

  it('ANDs the conditions that are on, and ignores the ones switched off', () => {
    const l = line({ thread: 'exec-7', fields: { requestDataId: '8842' } });
    expect(follows(l, [
      { field: 'thread', value: 'exec-7', on: true },
      { field: 'requestDataId', value: '9999', on: true },
    ])).toBe(false);
    expect(follows(l, [
      { field: 'thread', value: 'exec-7', on: true },
      { field: 'requestDataId', value: '9999', on: false },
    ])).toBe(true);
  });

  it('follows nothing with every condition off', () => {
    expect(follows(line({ thread: 'a' }), [{ field: 'thread', value: 'a', on: false }])).toBe(false);
  });

  it('reads a hole from a catalogued pattern', () => {
    const readers = readersOf([{
      id: 'p', scope: '*', added: 0, source: 'paste',
      template: 'read timed out after {ms}ms', holes: ['ms'],
    }], []);
    expect(follows(line({ text: 'read timed out after 30000ms' }), [{ field: 'ms', value: '30000', on: true }], readers)).toBe(true);
  });
});

describe('followQuery', () => {
  it('asks the pods for the longest value that is on', () => {
    expect(followQuery([
      { field: 'thread', value: 'exec-7', on: true },
      { field: 'traceId', value: '4f2c9b1aa', on: true },
      { field: 'orderId', value: 'A-4470-XXXXXXXX', on: false },
    ])).toBe('4f2c9b1aa');
    expect(followQuery([{ field: 'thread', value: 'x', on: false }])).toBeUndefined();
  });
});

describe('counting', () => {
  it('lists every pod searched, a pod with nothing included', () => {
    expect(podCounts([{ pod: 'a' }, { pod: 'a' }, { pod: 'b' }], ['a', 'b', 'c']))
      .toEqual([{ pod: 'a', n: 2 }, { pod: 'b', n: 1 }, { pod: 'c', n: 0 }]);
  });

  it('says how far a value spreads, in lines and pods', () => {
    const lines = [line({ thread: 't', pod: 'a' }), line({ thread: 't', pod: 'b' }), line({ thread: 'u', pod: 'b' })];
    expect(spread(lines, 'thread', 't')).toEqual({ lines: 2, pods: 2 });
  });

  it('finds what else the followed lines carried, never the followed field', () => {
    const lines = [
      line({ thread: 't', fields: { requestDataId: '8842', orderId: 'A-1' } }),
      line({ thread: 't', fields: { requestDataId: '8842' } }),
    ];
    expect(touched(lines, [{ field: 'thread', value: 't', on: true }]))
      .toEqual([{ field: 'requestDataId', value: '8842', n: 2 }, { field: 'orderId', value: 'A-1', n: 1 }]);
  });
});

describe('numbers', () => {
  it('reads a measure and refuses an id', () => {
    expect(numberOf('30000')).toBe(30000);
    expect(numberOf('340ms')).toBe(340);
    expect(numberOf('10 / 10')).toBe(10);
    expect(numberOf('A-4470')).toBeUndefined();
    expect(numberOf('1.2.3')).toBeUndefined();
  });

  it('tells a measure from an id by its name, not its digits', () => {
    expect(isMeasure('requestDataId', '8842')).toBe(false);
    expect(isMeasure('order_id', '12')).toBe(false);
    expect(isMeasure('hikari.active', '10 / 10')).toBe(true);
    expect(isMeasure('tookMs', '340')).toBe(true);
    expect(isMeasure('latency', '340ms')).toBe(true);
    expect(isMeasure('status', '504')).toBe(false);
    expect(isMeasure('amount', '12.50')).toBe(true);
  });

  it('keeps lines at or above a floor, and charts in time order', () => {
    const lines = [line({ ts: 3, fields: { ms: '5' } }), line({ ts: 1, fields: { ms: '50' } }), line({ ts: 2, fields: {} })];
    expect(atLeast(lines, 'ms', 10).map(l => l.ts)).toEqual([1]);
    expect(series(lines, 'ms')).toEqual([{ ts: 1, v: 50 }, { ts: 3, v: 5 }]);
  });
});

describe('the page\'s sentences and order', () => {
  it('says where fields came from, grouped by reader', () => {
    expect(whereFrom([
      { key: 'thread', origin: 'format' },
      { key: 'requestDataId', origin: 'mdc' }, { key: 'downstream', origin: 'mdc' },
      { key: 'ms', origin: 'pattern' },
    ])).toBe('thread from the layout pattern, requestDataId and downstream from the MDC, ms from a catalogued pattern.');
  });

  it('merges pods into one timeline, or keeps each pod whole', () => {
    const ls = [line({ pod: 'b', ts: 1, seq: 1 }), line({ pod: 'a', ts: 2, seq: 2 }), line({ pod: 'b', ts: 3, seq: 3 })];
    expect(arrange(ls, true).map(l => l.seq)).toEqual([1, 2, 3]);
    expect(arrange(ls, false).map(l => l.seq)).toEqual([2, 1, 3]);
  });

  it('finds the line you came from', () => {
    const ls = [line({ pod: 'a', text: 'x', ts: 1 }), line({ pod: 'b', text: 'y', ts: 2 })];
    expect(cameFrom(ls, { pod: 'b', text: 'y', ts: 2 })).toBe(1);
    expect(cameFrom(ls, { pod: 'b', text: 'z' })).toBe(-1);
  });

  it('widens 90s → 5m → 15m → 1h, then stops', () => {
    expect(nextWidth(90)).toBe(300);
    expect(nextWidth(3600)).toBeUndefined();
    expect(widthLabel(90)).toBe('± 90s');
    expect(widthLabel(900)).toBe('± 15m');
  });
});

describe('custom fields', () => {
  it('names the holes of a pasted logger call after its arguments', () => {
    const { reader } = compileCustom({ id: '1', name: 'batch', kind: 'call', source: 'log.info("settling batch {} for merchant {}", batchId, merchantId);' });
    expect(reader!.read('settling batch B-91 for merchant M-4')).toEqual({ batchId: 'B-91', merchantId: 'M-4' });
  });

  it('takes named groups from a regex, else group 1 as the field', () => {
    expect(compileCustom({ id: '1', name: 'x', kind: 'regex', source: 'took (?<took>\\d+)ms' }).reader!.read('took 34ms')).toEqual({ took: '34' });
    expect(compileCustom({ id: '1', name: 'batchId', kind: 'regex', source: 'batch (\\S+)' }).reader!.read('batch B-9 done')).toEqual({ batchId: 'B-9' });
  });

  it('learns from a value picked out of a real line', () => {
    const { reader } = compileCustom({ id: '1', name: 'batchId', kind: 'line', source: 'settling batch B-91 for merchant M-4', pick: 'B-91' });
    expect(reader!.read('settling batch B-92 for merchant M-7')).toEqual({ batchId: 'B-92' });
    expect(reader!.read('nothing like it')).toBeUndefined();
  });

  it('says why a field cannot be read, rather than never finding it', () => {
    expect(compileCustom({ id: '1', name: 'x', kind: 'regex', source: '(' }).problem).toMatch(/does not compile/);
    expect(compileCustom({ id: '1', name: 'x', kind: 'call', source: 'hello' }).problem).toMatch(/not a logger call/);
    expect(compileCustom({ id: '1', name: 'x', kind: 'line', source: 'abc', pick: 'zzz' }).problem).toMatch(/Pick the value/);
  });

  it('lets a named field win over a pattern hole of the same name', () => {
    const readers = readersOf(
      [{ id: 'p', scope: '*', added: 0, source: 'paste', template: 'batch {batchId} done', holes: ['batchId'] }],
      [{ id: 'c', name: 'batchId', kind: 'regex', source: 'batch B-(\\d+)', added: 0 }],
    );
    expect(readFields({ text: 'batch B-9 done' }, readers)).toEqual([
      { key: 'batchId', value: '9', origin: 'custom', reader: 'batchId' },
    ]);
    expect(valueOf({ text: 'batch B-9 done' }, 'batchId', readers)).toBe('9');
  });

  it('tests a field against lines on hand: how many, on how many pods', () => {
    const { reader } = compileCustom({ id: '1', name: 'b', kind: 'regex', source: 'batch (\\S+)' });
    const r = testReader(reader!, [{ text: 'batch 1', pod: 'a' }, { text: 'batch 2', pod: 'b' }, { text: 'no', pod: 'c' }]);
    expect(r.lines).toBe(2);
    expect(r.pods).toBe(2);
    expect(r.examples).toHaveLength(2);
  });

  it('reads a stored list, and survives a broken one', () => {
    expect(parseCustomFields('not json')).toEqual([]);
    expect(parseCustomFields(JSON.stringify([{ id: 'a', name: 'n', kind: 'regex', source: 'x', added: 0 }]))).toHaveLength(1);
  });
});

describe('fieldValues', () => {
  it('lists the fields the lines carry, each with its values and how many lines carry them', async () => {
    const { fieldValues } = await import('./follow');
    const lines = [
      { text: 'a', thread: 'scheduling-2', logger: 'Api', pod: 'p1', fields: { requestDataId: '42' } },
      { text: 'b', thread: 'scheduling-2', logger: 'Api', pod: 'p1' },
      { text: 'c', thread: 'nio-1', logger: 'Job', pod: 'p1' },
    ];
    const out = fieldValues(lines);
    expect(out.find(f => f.field === 'thread')).toEqual({ field: 'thread', n: 3, values: [{ value: 'scheduling-2', n: 2 }, { value: 'nio-1', n: 1 }] });
    expect(out.find(f => f.field === 'requestDataId')).toEqual({ field: 'requestDataId', n: 1, values: [{ value: '42', n: 1 }] });
    /* Only what a condition can be checked against: no level. */
    expect(out.some(f => f.field === 'level')).toBe(false);
  });
});
