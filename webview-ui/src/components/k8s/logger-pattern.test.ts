/**
 * The whole feature rests on one paste working: somebody copies the logger call
 * out of the source they have open, and dk8s can then find every line it wrote
 * and name the value inside it.
 */
import { describe, it, expect } from 'vitest';
import {
  fromLoggerCall, fromLogLine, fromRegex, compilePattern, matchPattern, templateParts,
} from './logger-pattern';

const match = (call: string, line: string) => {
  const p = fromLoggerCall(call)!;
  return matchPattern(compilePattern(p), line);
};

describe('a pasted Java call', () => {
  it('names the hole after the argument that fills it', () => {
    const p = fromLoggerCall('log.info("checking bcbl api for request:{}", reqId)')!;
    expect(p.template).toBe('checking bcbl api for request:{reqId}');
    expect(p.holes).toEqual(['reqId']);
    expect(p.level).toBe('info');
  });

  it('takes the level from the method and normalises the odd ones', () => {
    expect(fromLoggerCall('log.warning("careful")')!.level).toBe('warn');
    expect(fromLoggerCall('log.fatal("gone")')!.level).toBe('error');
    expect(fromLoggerCall('LOG.error("boom")')!.level).toBe('error');
  });

  it('names holes for several arguments, in order', () => {
    const p = fromLoggerCall('log.debug("settling batch {} for merchant {}", batchId, merchantId)')!;
    expect(p.template).toBe('settling batch {batchId} for merchant {merchantId}');
    expect(p.holes).toEqual(['batchId', 'merchantId']);
  });

  it('reads a getter as the thing it gets', () => {
    // `order.getId()` is an id, and a field called `arg1` tells nobody that.
    const p = fromLoggerCall('log.info("rejecting {}", order.getId())')!;
    expect(p.holes).toEqual(['id']);
  });

  it('does not split an argument list on the commas inside a call', () => {
    const p = fromLoggerCall('log.info("{} of {}", items.get(0, "first"), items.size())')!;
    expect(p.holes).toHaveLength(2);
    expect(p.holes[1]).toBe('itemsSize');
  });

  it('calls the exception argument what it is', () => {
    const p = fromLoggerCall('log.error("capture failed for {}", orderId, e)')!;
    // One hole, so only the first argument names anything — but the name it
    // picks has to be the right one.
    expect(p.holes).toEqual(['orderId']);
  });

  it('keeps the logger when it is not the usual one', () => {
    expect(fromLoggerCall('auditLog.info("written")')!.logger).toBe('auditLog');
    expect(fromLoggerCall('log.info("written")')!.logger).toBeUndefined();
    expect(fromLoggerCall('logger.info("written")')!.logger).toBeUndefined();
  });

  it('survives what people actually paste', () => {
    const pasted = '        log.info("checking bcbl api for request:{}", reqId);\n';
    expect(fromLoggerCall(pasted)!.template).toBe('checking bcbl api for request:{reqId}');
  });

  it('refuses anything that is not a call', () => {
    expect(fromLoggerCall('checking bcbl api for request:A-4470')).toBeUndefined();
    expect(fromLoggerCall('')).toBeUndefined();
    expect(fromLoggerCall('int x = compute(1, 2);')).toBeUndefined();
  });

  it('takes a message with no holes at all', () => {
    const p = fromLoggerCall('log.info("starting the nightly sweep")')!;
    expect(p.holes).toEqual([]);
    expect(p.template).toBe('starting the nightly sweep');
  });
});

describe('the other languages', () => {
  it('reads Python printf holes', () => {
    const p = fromLoggerCall('logger.info("cache %s for key %s", outcome, key)')!;
    expect(p.template).toBe('cache {outcome} for key {key}');
  });

  it('reads an f-string, which carries its own names', () => {
    const p = fromLoggerCall('logger.warning(f"pool exhausted, {waiting} waiting")')!;
    expect(p.template).toBe('pool exhausted, {waiting} waiting');
    expect(p.holes).toEqual(['waiting']);
    expect(p.level).toBe('warn');
  });

  it('reads a JavaScript template literal', () => {
    const p = fromLoggerCall('logger.error(`retry ${attempt} of ${max} failed`)')!;
    expect(p.template).toBe('retry {attempt} of {max} failed');
    expect(p.holes).toEqual(['attempt', 'max']);
  });
});

describe('matching a line', () => {
  it('finds the value the {} stood for', () => {
    const hit = match('log.info("checking bcbl api for request:{}", reqId)',
      'checking bcbl api for request:A-4470')!;
    expect(hit.fields).toEqual({ reqId: 'A-4470' });
  });

  it('matches the same logger whatever the value is', () => {
    const p = compilePattern(fromLoggerCall('log.info("order {} accepted", orderId)')!);
    expect(matchPattern(p, 'order A-4470 accepted')!.fields).toEqual({ orderId: 'A-4470' });
    expect(matchPattern(p, 'order ZZ-9 accepted')!.fields).toEqual({ orderId: 'ZZ-9' });
  });

  it('says no to a line from a different logger', () => {
    const p = compilePattern(fromLoggerCall('log.info("order {} accepted", orderId)')!);
    expect(matchPattern(p, 'order A-4470 rejected')).toBeUndefined();
  });

  /*
    A hole that could match nothing turns `{a} for {b}` into a pattern that
    fires on any line with the literal parts touching — which is the classic way
    a "pattern" feature ends up highlighting the whole log.
  */
  it('will not let a hole match nothing', () => {
    const p = compilePattern(fromLoggerCall('log.info("order {} accepted", orderId)')!);
    expect(matchPattern(p, 'order  accepted')).toBeUndefined();
  });

  it('takes as little as it can per hole', () => {
    const p = compilePattern(fromLoggerCall('log.info("{} for {}", a, b)')!);
    expect(matchPattern(p, 'x for y for z')!.fields).toEqual({ a: 'x', b: 'y for z' });
  });

  it('treats the message as literal, regex characters and all', () => {
    const p = compilePattern(fromLoggerCall('log.info("rate (per-second) {} [ok]", rate)')!);
    expect(matchPattern(p, 'rate (per-second) 42 [ok]')!.fields).toEqual({ rate: '42' });
    expect(matchPattern(p, 'rate Xper-secondY 42 Zok')).toBeUndefined();
  });

  it('reports where it sits, so a line can be highlighted', () => {
    const p = compilePattern(fromLoggerCall('log.info("order {} accepted", orderId)')!);
    const hit = matchPattern(p, 'order A-4470 accepted')!;
    expect(hit.start).toBe(0);
    expect(hit.end).toBe('order A-4470 accepted'.length);
  });

  it('finds the shape inside a line that carries more around it', () => {
    const p = compilePattern(fromLoggerCall('log.info("order {} accepted", orderId)')!);
    const hit = matchPattern(p, '[main] c.d.OrderService - order A-4470 accepted')!;
    expect(hit.fields).toEqual({ orderId: 'A-4470' });
    expect(hit.start).toBeGreaterThan(0);
  });
});

describe('a pattern learned from a line', () => {
  it('turns the value-shaped tokens into holes', () => {
    const p = fromLogLine('order A-4470 accepted for customer C-118');
    expect(p.template).toBe('order {value1} accepted for customer {value2}');
    expect(p.source).toBe('line');
  });

  it('matches its own line back', () => {
    const line = 'read timed out after 30000ms';
    const hit = matchPattern(compilePattern(fromLogLine(line)), line)!;
    expect(hit).toBeDefined();
  });

  it('takes a uuid as one value rather than five', () => {
    const p = fromLogLine('trace 4f2c9b1e-77aa-4c31-9d0e-21b7c0f19b31 started');
    expect(p.holes).toHaveLength(1);
  });
});

describe('showing a template', () => {
  it('splits it into what is literal and what is a hole', () => {
    expect(templateParts('order {orderId} accepted')).toEqual([
      { text: 'order ', hole: false },
      { text: 'orderId', hole: true },
      { text: ' accepted', hole: false },
    ]);
  });

  it('handles a template that is only a hole', () => {
    expect(templateParts('{body}')).toEqual([{ text: 'body', hole: true }]);
  });
});

describe('a written regex', () => {
  it('takes its holes from the named groups, in order', () => {
    const p = fromRegex('cache (?<outcome>hit|miss) for key (?<key>\\S+) in (?<took>\\d+)ms');
    expect('error' in p).toBe(false);
    if ('error' in p) return;
    expect(p.holes).toEqual(['outcome', 'key', 'took']);
    expect(p.source).toBe('regex');
  });

  it('fills a hole by its name, not its position, past an unnamed group', () => {
    const p = fromRegex('(GET|POST) (?<path>\\S+)');
    if ('error' in p) throw new Error(p.error);
    const hit = matchPattern(compilePattern(p), 'POST /ledger/entries');
    expect(hit?.fields).toEqual({ path: '/ledger/entries' });
  });

  it('matches inside a longer line, as a template does', () => {
    const p = fromRegex('active=(?<active>\\d+)');
    if ('error' in p) throw new Error(p.error);
    expect(matchPattern(compilePattern(p), 'HikariPool-1 - active=10 idle=0')?.fields).toEqual({ active: '10' });
  });

  it('says what is wrong with one that does not compile, in the engine\'s words', () => {
    const p = fromRegex('(?<open');
    expect('error' in p && p.error.length > 0).toBe(true);
  });

  it('refuses an empty one rather than matching every line', () => {
    expect('error' in fromRegex('   ')).toBe(true);
  });

  it('matches nothing, rather than throwing, when a saved one no longer compiles', () => {
    const compiled = compilePattern({ template: '(', holes: [], source: 'regex', regex: '(' });
    expect(matchPattern(compiled, 'anything at all')).toBeUndefined();
  });
});
