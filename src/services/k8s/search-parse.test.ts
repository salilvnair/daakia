import { describe, it, expect } from 'vitest';
import { compileFormat } from './log-format';
import { BUILTIN_FORMATS } from './log-format-builtins';
import { parseOf, withParse, sampleOf } from './search-parse';

const spring = compileFormat(BUILTIN_FORMATS.find(f => f.id === 'builtin.spring')!);
const json = compileFormat({ id: 'j', name: 'JSON', kind: 'json', fields: { timestamp: 'ts', level: 'level', logger: 'logger', message: 'msg', thread: 'thread' } } as never);

const LINE = '2026-09-25T10:00:01.123Z  WARN 1 --- [app] [http-nio-8080-exec-7] c.a.OrderService : read timed out';

describe('parseOf', () => {
  it('reads the thread and logger the format names', () => {
    const p = parseOf(spring, LINE)!;
    expect(p.thread).toBe('http-nio-8080-exec-7');
    expect(p.logger).toBe('c.a.OrderService');
    expect(p.message).toBe('read timed out');
  });

  it('is undefined for a line the format does not read, and with no format', () => {
    expect(parseOf(spring, '\tat com.acme.Foo.bar(Foo.java:10)')).toBeUndefined();
    expect(parseOf(undefined, LINE)).toBeUndefined();
  });

  it('carries MDC keys a JSON line puts beside the standard ones', () => {
    const p = parseOf(json, JSON.stringify({ ts: '2026-09-25T10:00:00Z', level: 'INFO', logger: 'x.Y', msg: 'hi', traceId: 'abc123' }))!;
    expect(p.fields?.traceId).toBe('abc123');
  });
});

describe('withParse', () => {
  it('parses the hit and its neighbours, null where a neighbour has nothing', () => {
    const m = withParse({ text: LINE, before: [LINE], after: ['\tat a.B.c(B.java:1)'] }, spring);
    expect(m.parse?.thread).toBe('http-nio-8080-exec-7');
    expect(m.beforeParse?.[0]?.logger).toBe('c.a.OrderService');
    expect(m.afterParse).toBeUndefined();
  });

  it('returns the hit untouched without a format', () => {
    const hit = { text: LINE, before: [], after: [] };
    expect(withParse(hit, undefined)).toBe(hit);
  });
});

describe('sampleOf', () => {
  it('takes context and hits in order, up to the cap', () => {
    expect(sampleOf([{ text: 'b', before: ['a'], after: ['c'] }, { text: 'e', before: ['d'], after: [] }], 4)).toEqual(['a', 'b', 'c', 'd']);
  });
});
