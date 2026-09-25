/**
 * A scan that finds nothing is useless; a scan that finds everything shaped
 * like a method call is worse, because somebody has to read the list.
 */
import { describe, it, expect } from 'vitest';
import { scanText, callAt } from './logger-scan';

const java = (text: string) => scanText(text, 'src/main/java/Order.java', 'java');

describe('finding the calls', () => {
  it('finds an SLF4J call and says where it is', () => {
    const hits = java('class A {\n  void f() {\n    log.info("order {} accepted", id);\n  }\n}');
    expect(hits).toHaveLength(1);
    expect(hits[0].code).toBe('log.info("order {} accepted", id)');
    expect(hits[0].line).toBe(3);
    expect(hits[0].file).toBe('src/main/java/Order.java');
  });

  it('takes a call written over several lines', () => {
    // Which is how a call with three arguments is actually formatted.
    const hits = java('log.warn(\n  "pool {} of {} at {}",\n  active, max, waiting\n);');
    expect(hits).toHaveLength(1);
    expect(hits[0].code).toBe('log.warn( "pool {} of {} at {}", active, max, waiting )');
  });

  it('is not confused by a paren inside the message', () => {
    const hits = java('log.info("rate (per second) is {}", rate);');
    expect(hits[0].code).toBe('log.info("rate (per second) is {}", rate)');
  });

  it('is not confused by an escaped quote', () => {
    const hits = java('log.info("said \\"no\\" to {}", id);');
    expect(hits).toHaveLength(1);
  });

  it('finds several in one file', () => {
    const hits = java('log.info("a");\nlog.error("b", e);\nLOGGER.debug("c {}", x);');
    expect(hits.map(h => h.line)).toEqual([1, 2, 3]);
  });

  /*
    The whole reason the receiver has to look like a logger: `response.info(`
    and `metrics.error(` are method calls on things that are not loggers, and a
    catalogue full of them is one nobody reads.
  */
  it('leaves calls on things that are not loggers alone', () => {
    expect(java('response.info("nope");')).toHaveLength(0);
    expect(java('metrics.error("nope");')).toHaveLength(0);
    expect(java('this.trace("nope");')).toHaveLength(0);
  });

  it('takes the loggers people actually name', () => {
    for (const receiver of ['log', 'logger', 'LOG', 'LOGGER', 'auditLog', 'slf4jLogger']) {
      expect(java(`${receiver}.info("x");`), receiver).toHaveLength(1);
    }
  });

  it('takes a logger reached through a field', () => {
    const hits = java('this.log.info("order {} accepted", id);');
    expect(hits).toHaveLength(1);
  });

  it('leaves an unbalanced paren rather than running to the end of the file', () => {
    expect(java('log.info("never closed", id;\n')).toHaveLength(0);
  });
});

describe('the other languages', () => {
  it('reads Python', () => {
    const hits = scanText('logger.info("cache %s for %s", outcome, key)', 'app/cache.py', 'python');
    expect(hits[0].code).toBe('logger.info("cache %s for %s", outcome, key)');
  });

  it('reads an f-string call', () => {
    const hits = scanText('logging.warning(f"pool exhausted, {waiting} waiting")', 'app/pool.py', 'python');
    expect(hits).toHaveLength(1);
  });

  it('reads Node', () => {
    const hits = scanText('logger.error(`retry ${n} failed`);', 'src/retry.ts', 'node');
    expect(hits[0].code).toBe('logger.error(`retry ${n} failed`)');
  });

  it('reads a console call, which is what half of Node logs with', () => {
    expect(scanText('console.warn("slow: %d ms", ms);', 'src/x.js', 'node')).toHaveLength(1);
  });
});

describe('what is test source', () => {
  it('marks a path that says so', () => {
    for (const file of ['src/test/java/OrderTest.java', 'tests/test_pool.py', 'src/retry.spec.ts']) {
      expect(scanText('log.info("x");', file, 'java')[0].test, file).toBe(true);
    }
  });

  it('leaves application source unmarked', () => {
    expect(scanText('log.info("x");', 'src/main/java/Order.java', 'java')[0].test).toBe(false);
    // `latest/` contains "test" and is not a test directory.
    expect(scanText('log.info("x");', 'src/latest/Order.java', 'java')[0].test).toBe(false);
  });
});

describe('callAt', () => {
  it('returns the call from paren to paren', () => {
    expect(callAt('f(a, b)', 1)).toBe('(a, b)');
    expect(callAt('f(g(1), h(2))', 1)).toBe('(g(1), h(2))');
  });

  it('gives up on a paren that never closes', () => {
    expect(callAt('f(a, b', 1)).toBeUndefined();
  });
});
