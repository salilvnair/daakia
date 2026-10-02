import { describe, it, expect } from 'vitest';
import { fieldsOf, countHere, isExact } from './line-fields';
import { findPayload } from './log-payload';
import { compileMarks, markOf } from './logger-marks';
import { fromLoggerCall } from './logger-pattern';
import type { LogLine } from '../../store/k8s-store';

const line = (over: Partial<LogLine> = {}): LogLine => ({
  seq: 1, level: 'info', text: 'read timed out after 30000ms', ...over,
});

describe('where a field comes from', () => {
  it('takes the slots the format parsed', () => {
    const fields = fieldsOf(line({ thread: 'http-nio-8080-exec-7', logger: 'c.d.o.LedgerClient' }));
    expect(fields).toEqual([
      { key: 'thread', value: 'http-nio-8080-exec-7', origin: 'format', secret: undefined },
      { key: 'logger', value: 'c.d.o.LedgerClient', origin: 'format', secret: undefined },
    ]);
  });

  it('takes the MDC the application put on it', () => {
    const fields = fieldsOf(line({ fields: { requestDataId: '8842', downstream: 'ledger-svc:8080' } }));
    expect(fields.map(f => [f.key, f.origin])).toEqual([
      ['requestDataId', 'mdc'], ['downstream', 'mdc'],
    ]);
  });

  /*
    The point of the catalogue: a value inside the message is not a field until
    a pattern names the hole it sits in.
  */
  it('takes a catalogued pattern\'s holes', () => {
    const marks = compileMarks([{
      id: 'p1', scope: '*', added: 1, marked: true, color: 0,
      ...fromLoggerCall('log.error("read timed out after {}ms", timeoutMs)')!,
    }]);
    const mark = markOf('read timed out after 30000ms', marks)!;
    const fields = fieldsOf(line(), { mark });
    expect(fields).toEqual([
      { key: 'timeoutMs', value: '30000', origin: 'pattern', secret: undefined },
    ]);
  });

  it('takes a payload\'s leaves by their dotted path', () => {
    const payload = findPayload('payload {"requestId":"A-4470","card":{"last4":"4471"}}')!;
    const fields = fieldsOf(line(), { payload });
    expect(fields.map(f => f.key)).toEqual(['requestId', 'card.last4']);
    expect(fields.every(f => f.origin === 'payload')).toBe(true);
  });

  it('keeps an array index, because two entries are two things', () => {
    const payload = findPayload('{"items":[{"sku":"BK-1"},{"sku":"BK-9"}]}')!;
    expect(fieldsOf(line(), { payload }).map(f => f.key))
      .toEqual(['items[0].sku', 'items[1].sku']);
  });

  it('offers a container as nothing, only its leaves', () => {
    const payload = findPayload('{"card":{"last4":"4471","brand":"visa"}}')!;
    expect(fieldsOf(line(), { payload }).map(f => f.key)).toEqual(['card.last4', 'card.brand']);
  });

  it('says nothing at all for a line that names nothing', () => {
    expect(fieldsOf(line())).toEqual([]);
  });
});

describe('when two sources name the same thing', () => {
  it('lets the format win over a pattern', () => {
    const marks = compileMarks([{
      id: 'p1', scope: '*', added: 1, marked: true, color: 0,
      ...fromLoggerCall('log.info("[{}] working", thread)')!,
    }]);
    const mark = markOf('[worker-3] working', marks)!;
    const fields = fieldsOf(line({ thread: 'http-nio-8080-exec-7', text: '[worker-3] working' }), { mark });
    const thread = fields.find(f => f.key === 'thread')!;
    expect(thread.value).toBe('http-nio-8080-exec-7');
    expect(thread.origin).toBe('format');
    expect(fields.filter(f => f.key === 'thread')).toHaveLength(1);
  });
});

describe('secrets', () => {
  it('marks a token-looking key so the rail can hide it', () => {
    const payload = findPayload('{"card":{"token":"tok_live_9Qa"}}')!;
    expect(fieldsOf(line(), { payload })[0]).toMatchObject({ key: 'card.token', secret: true });
  });
});

describe('how many lines carry it', () => {
  const lines = [
    line({ seq: 1, thread: 'exec-7', text: 'a' }),
    line({ seq: 2, thread: 'exec-7', text: 'b' }),
    line({ seq: 3, thread: 'exec-2', text: 'c' }),
  ];

  it('counts an exact field exactly', () => {
    expect(countHere(lines, { key: 'thread', value: 'exec-7', origin: 'format' })).toBe(2);
  });

  it('counts a payload field by what mentions the value', () => {
    // Over-counts by design, and the rail says "mentions" rather than "is".
    const text = [line({ seq: 1, text: 'order A-4470 accepted' }), line({ seq: 2, text: 'retry for A-4470' })];
    expect(countHere(text, { key: 'orderId', value: 'A-4470', origin: 'payload' })).toBe(2);
  });
});

describe('what can be filtered exactly', () => {
  it('is the format\'s own and the MDC, and nothing else', () => {
    expect(isExact({ key: 'thread', value: 'x', origin: 'format' })).toBe(true);
    expect(isExact({ key: 'tenant', value: 'x', origin: 'mdc' })).toBe(true);
    expect(isExact({ key: 'ms', value: 'x', origin: 'pattern' })).toBe(false);
    expect(isExact({ key: 'card.last4', value: 'x', origin: 'payload' })).toBe(false);
  });
});
