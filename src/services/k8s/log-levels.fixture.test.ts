/**
 * Levels, against a real `kubectl logs` capture.
 *
 * Every earlier attempt at this was reasoned about one line at a time, and one
 * line at a time is exactly the wrong unit: a logging framework runs its
 * conversion pattern once per EVENT and dumps the throwable raw underneath.
 * Judging those trailing lines individually made a 72-line Hibernate trace red
 * when the application had logged it at WARN.
 *
 * So the fixture is the whole file, downloaded from the pod, and the
 * expectations are stated as line ranges against it. If the classifier and the
 * log disagree, the log wins.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseLine, type LogLevel, type LogLine } from './k8s-log-stream';

const FIXTURE = resolve(__dirname, '../../test/fixtures/logs/spring-jdbc-crashloop.log');

/** Parse the fixture the way the stream does, carrying context forward. */
function parseFixture(): LogLine[] {
  const raw = readFileSync(FIXTURE, 'utf8').split(/\r?\n/).filter(l => l.length > 0);
  const out: LogLine[] = [];
  let prev: { level: LogLevel; sawAppTimestamp: boolean } | undefined;

  for (let i = 0; i < raw.length; i++) {
    const line = parseLine(raw[i], i, true, undefined, undefined, prev);
    out.push(line);
    prev = {
      level: line.level,
      sawAppTimestamp: (prev?.sawAppTimestamp ?? false)
        || /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(line.text),
    };
  }
  return out;
}

const lines = parseFixture();

/** 1-based, to match what the file and an editor both show. */
const at = (n: number) => lines[n - 1];
const range = (from: number, to: number) => lines.slice(from - 1, to);

describe('levels on a real Spring Boot crashloop log', () => {
  it('reads the whole file', () => {
    expect(lines.length).toBe(153);
  });

  it('takes each event\'s stated level', () => {
    expect(at(23).level).toBe('warn');   // SQL Error: 0, SQLState: 08001
    expect(at(24).level).toBe('error');  // The connection attempt failed.
    expect(at(25).level).toBe('warn');   // HHH000342: Could not obtain connection
    expect(at(98).level).toBe('error');  // Failed to initialize JPA EMF
    expect(at(99).level).toBe('warn');   // Exception encountered during context init
    expect(at(103).level).toBe('error'); // Application run failed
  });

  /*
    The case that prompted all of this.

    Line 25 is a WARN. Lines 26 to 97 are its throwable: the header, forty-five
    frames, two `Caused by:` sections and two `... N common frames omitted`.
    Not one of them carries a level, and every one of them belongs to that
    warning.
  */
  it('gives the whole trace under a WARN the level WARN', () => {
    expect(at(26).text).toContain('JDBCConnectionException');
    expect(at(72).text).toContain('Caused by: org.postgresql.util.PSQLException');
    expect(at(89).text).toContain('Caused by: java.net.UnknownHostException');
    expect(at(88).text).toContain('40 common frames omitted');

    const trace = range(26, 97);
    expect(trace.length).toBe(72);
    const wrong = trace
      .map((l, i) => ({ line: 26 + i, level: l.level, text: l.text.slice(0, 60) }))
      .filter(l => l.level !== 'warn');
    expect(wrong).toEqual([]);
  });

  /*
    And the same rule the other way. Line 103 IS an ERROR, so its trace is red —
    which is the half that was accidentally right before.
  */
  it('gives the trace under an ERROR the level ERROR', () => {
    expect(at(104).text).toContain('BeanCreationException');
    const trace = range(104, 153);
    const wrong = trace
      .map((l, i) => ({ line: 104 + i, level: l.level }))
      .filter(l => l.level !== 'error');
    expect(wrong).toEqual([]);
  });

  /*
    A multi-line message that is not a stack trace at all. Spring's condition
    report logs an empty INFO event and puts the sentence on the next line, so
    it has no shape to recognise — only the missing timestamp marks it.
  */
  it('gives a wrapped message the level of the event that printed it', () => {
    expect(at(101).text).toMatch(/ConditionEvaluationReportLogger/);
    expect(at(101).level).toBe('info');

    expect(at(102).text).toContain('Error starting ApplicationContext');
    expect(at(102).level).toBe('info');
  });

  it('does not read the word Error in prose as a level', () => {
    // The line above begins with "Error" and is an INFO continuation. If this
    // ever returns `error` again, the keyword sniff has stopped being anchored.
    expect(at(102).level).not.toBe('error');
  });

  it('leaves the banner and startup lines alone', () => {
    expect(at(1).text).toContain('Picked up JAVA_TOOL_OPTIONS');
    expect(at(1).level).toBe('other');
    expect(at(9).level).toBe('info');
  });

  it('classifies no line as error that the application did not', () => {
    // Every ERROR in the file traces back to line 24, 98 or 103, or to a
    // continuation of one of them.
    const errorLines = lines
      .map((l, i) => ({ n: i + 1, level: l.level }))
      .filter(l => l.level === 'error')
      .map(l => l.n);

    // 24, 98, 103 and the trace under 103.
    const expected = [24, 98, 103, ...Array.from({ length: 50 }, (_, i) => 104 + i)];
    expect(errorLines).toEqual(expected);
  });
});
