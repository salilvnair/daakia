/**
 * Patterns lifted from real logback.xml and log4j2.xml files.
 *
 * The round-trip tests are the ones that matter: translating a pattern is only
 * useful if the result then parses the log that pattern produces, so each case
 * pairs the layout with a line the layout would emit.
 */
import { describe, it, expect } from 'vitest';
import { fromConversionPattern, isConversionPattern } from './logback-pattern';
import { compileFormat } from './log-format';

const parseWith = (pattern: string, line: string) =>
  compileFormat({ id: 't', name: 't', kind: 'pattern', pattern }).parse(line);

describe('isConversionPattern', () => {
  it.each([
    '%d{yyyy-MM-dd} %-5level %logger - %msg%n',
    '%d [%thread] %p %c{1} - %m%n',
    '%msg%n',
  ])('recognises %s as theirs', p => expect(isConversionPattern(p)).toBe(true));

  it.each([
    '%{TIMESTAMP} %{LEVEL} %{MESSAGE}',
    '%{TIMESTAMP} [%{THREAD}] %{LOGGER} : %{MESSAGE}',
  ])('leaves ours alone: %s', p => expect(isConversionPattern(p)).toBe(false));

  it('does not treat a plain string as a pattern', () => {
    expect(isConversionPattern('just some text')).toBe(false);
  });
});

describe('fromConversionPattern', () => {
  it('translates the Logback default', () => {
    expect(fromConversionPattern('%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n'))
      .toBe('%{TIMESTAMP} [%{THREAD}] %{LEVEL} %{LOGGER} - %{MESSAGE}');
  });

  it('translates log4j short aliases', () => {
    expect(fromConversionPattern('%d %p [%t] %c - %m%n'))
      .toBe('%{TIMESTAMP} %{LEVEL} [%{THREAD}] %{LOGGER} - %{MESSAGE}');
  });

  it('translates Spring Boot’s own file pattern', () => {
    expect(fromConversionPattern('%d{yyyy-MM-dd HH:mm:ss.SSS} %5p %pid --- [%15.15t] %-40.40logger{39} : %m%n'))
      .toBe('%{TIMESTAMP} %{LEVEL} %{NUM} --- [%{THREAD}] %{LOGGER} : %{MESSAGE}');
  });

  it('ignores width and precision modifiers', () => {
    expect(fromConversionPattern('%-5level %.30logger %20.30m'))
      .toBe('%{LEVEL} %{LOGGER} %{MESSAGE}');
  });

  it('drops the line break and the throwable', () => {
    // The stack trace arrives as continuation lines, so a pattern describing
    // it would be describing something this never sees.
    expect(fromConversionPattern('%level %msg%n%ex')).toBe('%{LEVEL} %{MESSAGE}');
  });

  it('unwraps a colour converter and keeps the fields inside it', () => {
    expect(fromConversionPattern('%highlight(%-5level) %msg%n'))
      .toBe('%{LEVEL} %{MESSAGE}');
  });

  it('unwraps a nested colour converter', () => {
    expect(fromConversionPattern('%green(%d{HH:mm:ss}) %highlight(%level) %m%n'))
      .toBe('%{TIMESTAMP} %{LEVEL} %{MESSAGE}');
  });

  it('keeps literal text between the fields', () => {
    expect(fromConversionPattern('%level | %logger | %msg%n'))
      .toBe('%{LEVEL} | %{LOGGER} | %{MESSAGE}');
  });

  it('passes an escaped percent through', () => {
    expect(fromConversionPattern('%level 100%% done %msg%n'))
      .toBe('%{LEVEL} 100% done %{MESSAGE}');
  });

  it('turns an unknown converter into DATA rather than failing', () => {
    // MDC and markers vary per application; anchoring around them still works.
    expect(fromConversionPattern('%d %X{requestId} %level %m%n'))
      .toBe('%{TIMESTAMP} %{DATA} %{LEVEL} %{MESSAGE}');
  });

  it('does not leave a trailing DATA that anchors nothing', () => {
    expect(fromConversionPattern('%d %level %marker')).toBe('%{TIMESTAMP} %{LEVEL}');
  });
});

/*
  The half that proves the translation is worth anything: the result has to
  parse the log the original pattern produces.
*/
describe('fromConversionPattern — round trip', () => {
  it('parses a Logback default line', () => {
    const p = fromConversionPattern('%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n');
    expect(parseWith(p, '2026-08-31 13:20:01.123 [main] INFO  com.acme.Boot - started in 4.2s'))
      .toMatchObject({
        level: 'info', thread: 'main', logger: 'com.acme.Boot',
        message: 'started in 4.2s',
      });
  });

  it('parses a log4j line with the thread after the level', () => {
    const p = fromConversionPattern('%d %p [%t] %c - %m%n');
    expect(parseWith(p, '2026-08-31 13:20:01,123 WARN [worker-1] com.acme.Pool - exhausted'))
      .toMatchObject({ level: 'warn', thread: 'worker-1', logger: 'com.acme.Pool' });
  });

  it('parses a Spring Boot file line', () => {
    const p = fromConversionPattern('%d{yyyy-MM-dd HH:mm:ss.SSS} %5p %pid --- [%15.15t] %-40.40logger{39} : %m%n');
    expect(parseWith(p, '2026-08-31 13:20:01.123  INFO 1 --- [           main] com.acme.Boot : up'))
      .toMatchObject({ level: 'info', thread: 'main', logger: 'com.acme.Boot' });
  });

  it('refuses a stack frame, so continuations still work', () => {
    // The whole continuation rule rests on an event pattern rejecting frames.
    const p = fromConversionPattern('%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n');
    expect(parseWith(p, '\tat com.acme.Foo.run(Foo.java:42) ~[app.jar:1.0.0]')).toBeNull();
  });
});
