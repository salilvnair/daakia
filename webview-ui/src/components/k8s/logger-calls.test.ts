/**
 * The Add patterns page takes four calls at once, a dropped file, or a
 * template typed by hand. Each must end as the same kind of pattern.
 */
import { describe, it, expect } from 'vitest';
import {
  findCalls, fromAnyCall, fromPlainText, parsePaste, dialectsOf, regexSource, learnShapes, numericHoles,
} from './logger-calls';
import { compilePattern, matchPattern } from './logger-pattern';

const BOARD = `log.info("checking bcbl api for request:{}", reqId);
log.warn("bcbl api slow for request:{} took {}ms", reqId, tookMs);
log.error("bcbl api failed for request:{}", reqId, ex);
log.info("bcbl settled request:{} in {}ms", reqId, tookMs);`;

describe('a paste of several calls', () => {
  it('finds all four and names the holes after the arguments', () => {
    const parsed = parsePaste(BOARD);
    expect(parsed.map(p => p.pattern.template)).toEqual([
      'checking bcbl api for request:{reqId}',
      'bcbl api slow for request:{reqId} took {tookMs}ms',
      'bcbl api failed for request:{reqId}',
      'bcbl settled request:{reqId} in {tookMs}ms',
    ]);
    expect(parsed.map(p => p.pattern.level)).toEqual(['info', 'warn', 'error', 'info']);
  });

  it('knows the last argument is the exception', () => {
    expect(parsePaste(BOARD)[2].pattern.exception).toBe(true);
    expect(parsePaste(BOARD)[0].pattern.exception).toBeUndefined();
  });

  it('says where each call starts', () => {
    expect(findCalls(BOARD).map(c => c.line)).toEqual([1, 2, 3, 4]);
  });

  it('reads plain lines as templates, and not the code around calls in a file', () => {
    const parsed = parsePaste('order {} accepted\nsettled %s in %dms');
    expect(parsed.map(p => p.pattern.template)).toEqual(['order {arg1} accepted', 'settled {arg1} in {arg2}ms']);
    const file = parsePaste('package a;\npublic class A {\n  private final Repo repo;\n  void f() { log.info("x {}", id); }\n}');
    expect(parsed.length).toBe(2);
    expect(file.map(p => p.pattern.template)).toEqual(['x {id}']);
  });

  it('collapses the same message twice', () => {
    expect(parsePaste('log.info("a {}", x);\nlog.info("a {}", x);')).toHaveLength(1);
  });
});

describe('the other call shapes', () => {
  it('python printf and f-string', () => {
    expect(fromAnyCall('logger.info("settled %s rows=%d", batch_id, rows)')!.template)
      .toBe('settled {batch_id} rows={rows}');
    expect(fromAnyCall('logger.info(f"settlement finished for {batch_id}")')!.template)
      .toBe('settlement finished for {batch_id}');
    expect(fromAnyCall('log.exception("boom %s", x)')!.level).toBe('error');
  });

  it('pino: the object is fields, the message is the pattern', () => {
    const p = fromAnyCall('log.info({ orderId, ms: took }, "checkout completed")')!;
    expect(p.template).toBe('checkout completed');
    expect(p.objectFields).toEqual(['orderId', 'ms']);
  });

  it('slog: key/value pairs after the message', () => {
    const p = fromAnyCall('slog.Info("settled", "batch", id, "rows", n)')!;
    expect(p.template).toBe('settled');
    expect(p.level).toBe('info');
    expect(p.objectFields).toEqual(['batch', 'rows']);
  });

  it('a message glued from strings has a shape, and says it was glued', () => {
    const p = fromAnyCall('log.info("user " + user + " logged in")')!;
    expect(p.template).toBe('user {user} logged in');
    expect(p.glued).toBe(true);
    const py = fromAnyCall('logger.info("rows %s" % count)')!;
    expect(py.template).toBe('rows {count}');
    expect(py.glued).toBe(true);
  });

  it('refuses what is not a message', () => {
    expect(fromAnyCall('log.info(buildMessage())')).toBeUndefined();
  });
});

describe('plain text and dialects', () => {
  it('keeps named holes and names the anonymous ones', () => {
    expect(fromPlainText('request:{reqId} took {}ms')).toEqual({
      template: 'request:{reqId} took {arg1}ms', holes: ['arg1', 'reqId'], source: 'manual',
    });
  });

  it('lights the chips for what was used', () => {
    expect(dialectsOf(BOARD)).toEqual({ slf4j: true, printf: false, fstring: false, plain: false });
    expect(dialectsOf('logger.info(f"x {y}")\nsome text {z}')).toMatchObject({ fstring: true, plain: true });
    expect(dialectsOf('log.info("%s", a)').printf).toBe(true);
  });
});

describe('what it matches on', () => {
  it('is the pattern with the holes named', () => {
    expect(regexSource({ template: 'checking bcbl api for request:{reqId}' }))
      .toBe('^checking bcbl api for request:(?<reqId>.+)$');
    expect(regexSource({ template: 'took {ms}ms (p99)' })).toBe('^took (?<ms>.+)ms \\(p99\\)$');
  });

  it('a compiled pattern skips lines without its words', () => {
    const c = compilePattern({ template: 'checking bcbl api for request:{reqId}', holes: ['reqId'], source: 'paste' });
    expect(c.needle).toBe('checking bcbl api for request:');
    expect(matchPattern(c, 'something else entirely')).toBeUndefined();
    expect(matchPattern(c, 'checking bcbl api for request:A-4470')!.fields).toEqual({ reqId: 'A-4470' });
  });
});

describe('learning from the log', () => {
  it('groups lines by shape, commonest first', () => {
    const shapes = learnShapes([
      { text: 'Order A-1 accepted', level: 'info' },
      { text: 'Order A-2 accepted', level: 'info' },
      { text: 'Stock reserved for 42', level: 'info' },
      { text: '  at x.y(Z.java:1)', continuation: true },
    ]);
    expect(shapes.map(s => [s.pattern.template, s.count])).toEqual([
      ['Order {value1} accepted', 2],
      ['Stock reserved for {value1}', 1],
    ]);
  });

  it('knows a numeric hole', () => {
    const p = { template: 'took {ms} for {id}', holes: ['ms', 'id'], source: 'manual' as const };
    expect(numericHoles(p, [{ ms: '12', id: 'A-1' }, { ms: '40ms', id: 'B-2' }])).toEqual(['ms']);
  });
});
