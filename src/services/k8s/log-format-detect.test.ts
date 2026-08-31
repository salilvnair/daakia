/**
 * The detector, tested against shapes real applications emit.
 *
 * Every sample below is a layout somebody actually ships: Spring Boot's
 * default, Logback's, log4j's common pattern, java.util.logging, syslog. The
 * point of the detector is that it works on a log nobody has configured, so a
 * test built from invented lines would prove nothing.
 *
 * The declining cases matter as much as the detecting ones. A detector that
 * always answers is a guesser.
 */
import { describe, it, expect } from 'vitest';
import { detectPatternOfLine, detectPattern, detectFormat, UNKNOWN } from './log-format-detect';
import { compileFormat } from './log-format';

/** Detect from a sample, then actually parse the sample with the result. */
function roundTrip(lines: string[]) {
  const format = detectFormat(lines);
  if (!format) return undefined;
  const compiled = compileFormat(format);
  return { format, parsed: lines.map(l => compiled.parse(l)) };
}

const SPRING = [
  '2026-08-31T13:20:00.100Z  INFO 1 --- [zp-backend] [           main] com.zapper.zp.Boot                       : Starting ZpBackendApplication',
  '2026-08-31T13:20:00.200Z  INFO 1 --- [zp-backend] [           main] c.z.RepositoryConfigurationDelegate      : Bootstrapping Spring Data JPA',
  '2026-08-31T13:20:01.300Z  WARN 1 --- [zp-backend] [   dk8s-traffic] o.h.engine.jdbc.spi.SqlExceptionHelper   : SQL Error: 0, SQLState: 08001',
  '2026-08-31T13:20:01.400Z ERROR 1 --- [zp-backend] [   dk8s-traffic] o.h.engine.jdbc.spi.SqlExceptionHelper   : The connection attempt failed.',
];

const LOGBACK = [
  '2026-08-31 13:20:00.100 [main] INFO  com.acme.Boot - starting up',
  '2026-08-31 13:20:00.200 [main] DEBUG com.acme.Config - loaded 12 properties',
  '2026-08-31 13:20:01.300 [worker-1] WARN  com.acme.Pool - pool exhausted',
  '2026-08-31 13:20:01.400 [worker-1] ERROR com.acme.Ledger - post failed',
];

const LOG4J_AFTER = [
  '2026-08-31 13:20:00,100 INFO  [main] com.acme.Boot - starting up',
  '2026-08-31 13:20:00,200 DEBUG [main] com.acme.Config - loaded properties',
  '2026-08-31 13:20:01,300 WARN  [worker-1] com.acme.Pool - pool exhausted',
];

const LEVEL_FIRST = [
  'INFO 2026-08-31 13:20:00 starting up',
  'WARN 2026-08-31 13:20:01 pool exhausted',
  'ERROR 2026-08-31 13:20:02 post failed',
];

const DATE_ONLY = [
  '2026-08-31 13:20:00 starting up',
  '2026-08-31 13:20:01 pool exhausted',
  '2026-08-31 13:20:02 post failed',
];

describe('detectPatternOfLine', () => {
  it('reads Spring Boot, with an application name', () => {
    expect(detectPatternOfLine(SPRING[0]!))
      .toBe('%{TIMESTAMP} %{LEVEL} %{NUM} --- %{DATA}[%{THREAD}] %{LOGGER} : %{MESSAGE}');
  });

  it('reads Spring Boot without an application name', () => {
    const line = '2026-08-31T13:20:00.100Z  INFO 1 --- [           main] com.acme.Boot : starting';
    expect(detectPatternOfLine(line))
      .toBe('%{TIMESTAMP} %{LEVEL} %{NUM} --- [%{THREAD}] %{LOGGER} : %{MESSAGE}');
  });

  it('reads a thread before the level', () => {
    expect(detectPatternOfLine(LOGBACK[0]!))
      .toBe('%{TIMESTAMP} [%{THREAD}] %{LEVEL} %{LOGGER} - %{MESSAGE}');
  });

  it('reads a thread after the level', () => {
    expect(detectPatternOfLine(LOG4J_AFTER[0]!))
      .toBe('%{TIMESTAMP} %{LEVEL} [%{THREAD}] %{LOGGER} - %{MESSAGE}');
  });

  it('reads a level that comes before the date', () => {
    expect(detectPatternOfLine(LEVEL_FIRST[0]!)).toBe('%{LEVEL} %{TIMESTAMP} %{MESSAGE}');
  });

  it('reads a date with nothing but a message after it', () => {
    expect(detectPatternOfLine(DATE_ONLY[0]!)).toBe('%{TIMESTAMP} %{MESSAGE}');
  });

  it('does not invent a logger out of the first word of a message', () => {
    // "starting" is not class-like, so it stays part of the message.
    expect(detectPatternOfLine('2026-08-31 13:20:00 INFO starting the pool'))
      .toBe('%{TIMESTAMP} %{LEVEL} %{MESSAGE}');
  });

  it('declines a line with a level but no date it can express', () => {
    expect(detectPatternOfLine('INFO something happened at teatime')).toBe(UNKNOWN);
  });

  it('offers nothing at all for prose', () => {
    expect(detectPatternOfLine('Picked up JAVA_TOOL_OPTIONS: -Xmx192m')).toBeUndefined();
  });

  it('declines when something unexpected sits between the fields', () => {
    // A word between the date and the level means this is not `date level`.
    expect(detectPatternOfLine('2026-08-31 13:20:00 pid=7 INFO up')).toBe(UNKNOWN);
  });
});

describe('detectPattern — the vote', () => {
  it.each([
    ['Spring Boot', SPRING],
    ['Logback', LOGBACK],
    ['log4j', LOG4J_AFTER],
    ['level first', LEVEL_FIRST],
    ['date only', DATE_ONLY],
  ])('agrees across a whole %s sample', (_name, sample) => {
    const found = detectPattern(sample);
    expect(found?.confidence).toBe(1);
  });

  /*
    A crashlooping pod's tail is all frames. They must not vote, or the answer
    is always "no format" for exactly the pods that need one.
  */
  it('ignores stack frames when voting', () => {
    const sample = [
      ...SPRING,
      '\tat org.hibernate.Foo.run(Foo.java:42) ~[app.jar:1.0.0]',
      '\tat org.springframework.Bar.go(Bar.java:9) ~[spring-core.jar:6.2.1]',
      'Caused by: java.net.ConnectException: Connection refused',
      '\t... 20 common frames omitted',
    ];
    expect(detectPattern(sample)?.confidence).toBe(1);
  });

  it('declines when the sample is two shapes in equal measure', () => {
    // Neither clears two thirds, and picking the larger half would be a coin
    // toss dressed up as an answer.
    expect(detectPattern([...LOGBACK, ...LOG4J_AFTER])).toBeUndefined();
  });

  it('accepts a clear majority with a few odd lines', () => {
    const found = detectPattern([...SPRING, ...SPRING, ...LOGBACK.slice(0, 1)]);
    expect(found).toBeDefined();
    expect(found!.confidence).toBeGreaterThan(2 / 3);
  });

  it('declines a sample too small to judge', () => {
    expect(detectPattern(SPRING.slice(0, 2))).toBeUndefined();
  });

  it('declines a log with no structure at all', () => {
    expect(detectPattern([
      'Picked up JAVA_TOOL_OPTIONS: -Xmx192m',
      'starting',
      'done',
      'exiting',
    ])).toBeUndefined();
  });

  it('declines rather than returning UNKNOWN as a pattern', () => {
    const shapeless = [
      'INFO something happened',
      'WARN something else happened',
      'ERROR a third thing',
      'DEBUG a fourth',
    ];
    expect(detectPattern(shapeless)).toBeUndefined();
  });
});

/*
  The test that matters most: what the detector emits has to actually parse
  the log it was detected from. A pattern that wins the vote and then fails to
  compile, or compiles and matches nothing, is worse than no detection.
*/
describe('detectFormat — the result parses its own sample', () => {
  it.each([
    ['Spring Boot', SPRING],
    ['Logback', LOGBACK],
    ['log4j', LOG4J_AFTER],
    ['level first', LEVEL_FIRST],
    ['date only', DATE_ONLY],
  ])('parses every line of the %s sample it came from', (_name, sample) => {
    const out = roundTrip(sample);
    expect(out).toBeDefined();
    for (const p of out!.parsed) expect(p).not.toBeNull();
  });

  it('gets the level right on Spring Boot', () => {
    const out = roundTrip(SPRING)!;
    expect(out.parsed.map(p => p!.level)).toEqual(['info', 'info', 'warn', 'error']);
  });

  it('gets the thread and logger right on Spring Boot', () => {
    const out = roundTrip(SPRING)!;
    expect(out.parsed[2]).toMatchObject({
      thread: 'dk8s-traffic',
      logger: 'o.h.engine.jdbc.spi.SqlExceptionHelper',
    });
  });

  it('gets the thread and logger right on Logback', () => {
    const out = roundTrip(LOGBACK)!;
    expect(out.parsed[2]).toMatchObject({ thread: 'worker-1', logger: 'com.acme.Pool' });
  });

  it('gets the thread right when it follows the level', () => {
    const out = roundTrip(LOG4J_AFTER)!;
    expect(out.parsed[2]).toMatchObject({ thread: 'worker-1', logger: 'com.acme.Pool' });
  });

  /*
    A detected format has to REFUSE a stack frame, because the continuation
    rule is "the format did not parse it". A pattern loose enough to match a
    frame would silently turn every frame into its own event.
  */
  it.each([
    ['Spring Boot', SPRING],
    ['Logback', LOGBACK],
    ['log4j', LOG4J_AFTER],
  ])('refuses a stack frame after detecting %s', (_name, sample) => {
    const compiled = compileFormat(detectFormat(sample)!);
    expect(compiled.parse('\tat org.hibernate.Foo.run(Foo.java:42) ~[app.jar:1.0.0]')).toBeNull();
    expect(compiled.parse('Caused by: java.net.ConnectException: Connection refused')).toBeNull();
  });

  it('declares that it knows where the level is', () => {
    expect(compileFormat(detectFormat(SPRING)!).hasLevel).toBe(true);
  });

  it('does not claim a level position when the log has none', () => {
    expect(compileFormat(detectFormat(DATE_ONLY)!).hasLevel).toBe(false);
  });
});

describe('detectFormat — other date shapes', () => {
  /*
    These exist because the timestamp vocabulary was widened for the detector.
    Each is a layout that previously matched no format at all, so the whole log
    rendered level-less and unstructured.
  */
  it.each([
    ['java.util.logging', [
      '31-08-2026 13:20:00 INFO com.acme.Boot - up',
      '31-08-2026 13:20:01 FINE com.acme.Cfg - loaded',
      '31-08-2026 13:20:02 SEVERE com.acme.Db - failed',
    ]],
    ['syslog', [
      'Aug 31 13:20:00 INFO sshd - accepted publickey',
      'Aug 31 13:20:01 NOTICE sshd - session opened',
      'Aug 31 13:20:02 ERROR sshd - authentication failure',
    ]],
    ['compact', [
      '20260831 132000 INFO com.acme.Boot - up',
      '20260831 132001 WARN com.acme.Pool - slow',
      '20260831 132002 ERROR com.acme.Db - failed',
    ]],
  ])('detects and parses %s', (_name, sample) => {
    const out = roundTrip(sample as string[]);
    expect(out).toBeDefined();
    for (const p of out!.parsed) expect(p).not.toBeNull();
    expect(out!.parsed.map(p => p!.level)).not.toContain('other');
  });
});
