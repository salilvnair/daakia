/**
 * MDC: the keys an application logged that dk8s has no slot for.
 *
 * The rule this must not break is the one that killed `na:na` as a thread
 * name — fields come from a configured structured format, never from a guess
 * at free text.
 */
import { describe, it, expect } from 'vitest';
import { extraFields, logfmtPairs, compileFormat } from './log-format';
import type { LogFormat } from './log-format';

const JSON_FMT: LogFormat = {
  id: 'test-json', name: 'Test JSON', kind: 'json',
  fields: { timestamp: '@timestamp', level: 'level', logger: 'logger_name', message: 'message' },
};

describe('extraFields', () => {
  it('keeps the scalars an application added', () => {
    const out = extraFields({ traceId: '4b1e9c22', orderId: 'ORD-88413', attempt: 3, retried: true });
    expect(out).toEqual({ traceId: '4b1e9c22', orderId: 'ORD-88413', attempt: '3', retried: 'true' });
  });

  it('never repeats a field that already has its own slot', () => {
    const out = extraFields({ level: 'ERROR', message: 'x', thread_name: 't', tenant: 'eu' });
    expect(out).toEqual({ tenant: 'eu' });
  });

  it('drops nested objects rather than inventing dotted names', () => {
    // `context.user.id` would read like something the application chose to
    // log, when it is something this code made up.
    const out = extraFields({ tenant: 'eu', context: { user: { id: 7 } }, tags: ['a'] });
    expect(out).toEqual({ tenant: 'eu' });
  });

  it('drops a value long enough to be a stack trace', () => {
    const out = extraFields({ ok: 'short', huge: 'x'.repeat(400) });
    expect(out).toEqual({ ok: 'short' });
  });

  it('bounds how many keys one line may carry', () => {
    const wide: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) wide[`k${i}`] = String(i);
    expect(Object.keys(extraFields(wide) ?? {}).length).toBeLessThanOrEqual(24);
  });

  it('is absent rather than empty when there is nothing extra', () => {
    expect(extraFields({ level: 'INFO', message: 'hello' })).toBeUndefined();
  });
});

describe('logfmtPairs', () => {
  it('reads quoted values containing spaces and equals signs', () => {
    const out = logfmtPairs('level=info msg="a=b c" trace=9f2');
    expect(out).toMatchObject({ level: 'info', msg: 'a=b c', trace: '9f2' });
  });

  it('does not turn a message containing = into a field', () => {
    const out = logfmtPairs('level=info msg=hello tenant=eu');
    expect(out).toMatchObject({ level: 'info', msg: 'hello', tenant: 'eu' });
    expect(Object.keys(out)).toHaveLength(3);
  });
});

describe('parseLine, end to end', () => {
  it('carries MDC off a Logback JSON line', () => {
    const line = JSON.stringify({
      '@timestamp': '2026-03-04T09:12:41.882Z', level: 'ERROR',
      logger_name: 'com.zp.SettlementJob', thread_name: 'settle-worker-3',
      message: 'settlement batch failed',
      traceId: '4b1e9c22', orderId: 'ORD-88413', tenant: 'eu-west',
    });
    const p = compileFormat(JSON_FMT).parse(line);
    expect(p?.thread).toBe('settle-worker-3');
    expect(p?.fields).toEqual({ traceId: '4b1e9c22', orderId: 'ORD-88413', tenant: 'eu-west' });
    // The named fields are not duplicated into the extras.
    expect(p?.fields).not.toHaveProperty('level');
    expect(p?.fields).not.toHaveProperty('message');
  });

  it('gives a pattern format no extras at all', () => {
    // The rule: a pattern has exactly the fields its pattern names. Anything
    // more would be back to reading structure out of free text.
    const fmt: LogFormat = {
      id: 'p', name: 'P', kind: 'pattern',
      pattern: '%{TIMESTAMP} %{LEVEL} \[%{THREAD}\] %{LOGGER} - %{MESSAGE}',
    };
    const p = compileFormat(fmt)
      .parse('2026-03-04 09:12:41 ERROR [main] com.zp.App - boom traceId=abc');
    expect(p?.thread).toBe('main');
    expect(p?.fields).toBeUndefined();
  });
});
