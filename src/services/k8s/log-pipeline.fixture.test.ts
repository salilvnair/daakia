/**
 * The whole pipeline, measured against a real log.
 *
 * The fixture is the log that produced the bug: a Spring Boot pod failing to
 * reach Postgres, where Hibernate logs the failure at WARN and then dumps a
 * seventy-line stack trace under it. Every one of those frames used to come
 * back `error`, so the view said ERROR in red where the application had said
 * WARN in amber — and a stretch of the log had no level at all.
 *
 * This runs detection, compilation and parsing exactly as the stream does,
 * over all 153 lines, and asserts totals rather than samples. Totals are the
 * point: a spot check passes while ten lines in the middle are wrong.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseLine, hasAppTimestamp, type LogLevel } from './k8s-log-stream';
import { compileFormat, probeFormat, type CompiledFormat } from './log-format';
import { BUILTIN_FORMATS } from './log-format-builtins';
import { detectFormat } from './log-format-detect';

const RAW = readFileSync(
  join(__dirname, '../../test/fixtures/logs/spring-jdbc-crashloop.log'),
  'utf8',
).split('\n').filter(l => l.length > 0);

/** kubectl's `--timestamps` prefix, which the stream strips before parsing. */
const APP_LINES = RAW.map(l => l.replace(/^\S+Z /, ''));

/** Run the stream's own loop: parse each line, carrying `prev` forward. */
function runPipeline(format?: CompiledFormat) {
  let prev: { level: LogLevel; sawAppTimestamp: boolean } | undefined;
  return RAW.map((raw, i) => {
    const line = parseLine(raw, i, true, format, undefined, prev);
    prev = {
      level: line.level,
      sawAppTimestamp: (prev?.sawAppTimestamp ?? false) || hasAppTimestamp(line.text),
    };
    return line;
  });
}

describe('the real crashloop log', () => {
  it('has a format found for it without anything configured', () => {
    // A builtin probes it; if none did, the detector would. Either way the
    // pod is not left format-less, which is the state every defect below
    // grew out of.
    const probed = probeFormat(APP_LINES, BUILTIN_FORMATS);
    expect(probed?.format.id ?? detectFormat(APP_LINES)?.id).toBeTruthy();
  });

  const format = compileFormat(
    probeFormat(APP_LINES, BUILTIN_FORMATS)?.format ?? detectFormat(APP_LINES)!,
  );

  it('counts exactly the events the log contains, and no more', () => {
    /*
      22 events: 16 INFO, 3 WARN, 3 ERROR — counted independently with grep
      over the fixture. Everything else in the file is a continuation.

      This is the assertion that would have caught the original bug: with
      frames treated as events the count runs to 153.
    */
    const lines = runPipeline(format);
    const events = lines.filter(l => l.continuation === false);
    expect(events).toHaveLength(22);

    const byLevel = events.reduce<Record<string, number>>((acc, l) => {
      acc[l.level] = (acc[l.level] ?? 0) + 1;
      return acc;
    }, {});
    expect(byLevel).toEqual({ info: 16, warn: 3, error: 3 });
  });

  it('calls every other line a continuation', () => {
    const lines = runPipeline(format);
    expect(lines.filter(l => l.continuation === true)).toHaveLength(RAW.length - 22);
  });

  /*
    THE bug, in one assertion.

    Hibernate logs the JDBC failure at WARN and dumps its trace underneath.
    Those frames belong to the warning and must carry its level; painting them
    red says ERROR where the application said WARN.
  */
  it('keeps a WARN stack trace amber instead of turning it red', () => {
    const lines = runPipeline(format);

    const warnAt = lines.findIndex(l =>
      l.continuation === false && l.level === 'warn'
      && l.text.includes('JdbcEnvironmentInitiator'));
    expect(warnAt).toBeGreaterThan(-1);

    // Every line up to the next real event inherits the warning.
    const trace: typeof lines = [];
    for (let i = warnAt + 1; i < lines.length && lines[i]!.continuation; i++) {
      trace.push(lines[i]!);
    }
    expect(trace.length).toBeGreaterThan(30);
    expect(trace.every(l => l.level === 'warn')).toBe(true);
  });

  /*
    A stretch of the log rendering as unstyled plain text was the other half of
    the report. Once the first event has been seen, every line has a level —
    its own or the one it belongs to.

    Before the first event there is genuinely nothing to inherit. The JVM's
    `Picked up JAVA_TOOL_OPTIONS` line and the Spring banner are printed before
    any logger is configured, and giving them a colour would mean inventing
    one. `other` there is the honest answer, and it is deliberately different
    from the old behaviour of calling an orphan `error` on sight.
  */
  it('leaves no line unlevelled once the first event has been seen', () => {
    const lines = runPipeline(format);
    const firstEvent = lines.findIndex(l => l.continuation === false);
    expect(firstEvent).toBeGreaterThan(-1);
    expect(lines.slice(firstEvent).filter(l => l.level === 'other')).toHaveLength(0);
  });

  it('leaves the pre-boot noise unlevelled rather than guessing at it', () => {
    const lines = runPipeline(format);
    const firstEvent = lines.findIndex(l => l.continuation === false);
    const before = lines.slice(0, firstEvent);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every(l => l.level === 'other')).toBe(true);
  });

  it('names the thread and the logger on every event', () => {
    const lines = runPipeline(format).filter(l => l.continuation === false);
    expect(lines.every(l => !!l.thread)).toBe(true);
    expect(lines.every(l => !!l.logger)).toBe(true);
  });

  it('never puts a field on a continuation', () => {
    // A stack frame has no thread of its own — it belongs to the event above.
    const conts = runPipeline(format).filter(l => l.continuation);
    expect(conts.some(l => l.thread || l.logger)).toBe(false);
  });

  it('reads the banner and the boot noise as continuations, not events', () => {
    const lines = runPipeline(format);
    const banner = lines.find(l => l.text.includes(':: Spring Boot ::'));
    expect(banner?.continuation).toBe(true);
    const javaOpts = lines.find(l => l.text.includes('JAVA_TOOL_OPTIONS'));
    expect(javaOpts?.continuation).toBe(true);
  });

  /*
    Without a format the heuristics are all there is, and they are worse. Kept
    as a measurement of exactly how much worse, so the gap is a number rather
    than a claim — and so a regression that quietly stops resolving formats
    shows up as this figure appearing in the other test.
  */
  it('is measurably better than the no-format heuristics', () => {
    const guessed = runPipeline(undefined);
    const guessedEvents = guessed.filter(l => !l.continuation).length;
    const parsedEvents = runPipeline(format).filter(l => l.continuation === false).length;

    expect(parsedEvents).toBe(22);
    // The heuristics over-count: every unindented line they do not recognise
    // as a continuation becomes an event of its own.
    expect(guessedEvents).toBeGreaterThan(parsedEvents);
  });
});
