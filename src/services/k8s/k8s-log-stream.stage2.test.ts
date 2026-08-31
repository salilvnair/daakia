/**
 * Stage 1 and 2 of the log-view plan.
 *
 * The change under test is that a configured format decides what an event is.
 * A line that parses is an event; a line that does not is a continuation of
 * the event above it. That replaces a list of prefixes — `at `, `Caused by:`,
 * a leading tab — which was a guess with a long tail of misses, several of
 * which are pinned below.
 *
 * In its own file rather than appended to k8s-log-stream.test.ts because it
 * shares a fixture format across several describes, and threading that through
 * the existing file's scopes would have made both harder to read.
 */
import { describe, it, expect } from 'vitest';
import {
  levelOf, parseLine, stripAnsi, MAX_LINE_LENGTH,
} from './k8s-log-stream';

type FormatArg = Parameters<typeof parseLine>[3];

/** Recognises `<ISO> <LEVEL> <logger> : <msg>` and nothing else. */
const spaceFormat = {
  format: { id: 't', name: 'test', kind: 'pattern' },
  hasLevel: true,
  parse: (text: string) => {
    const m = /^(\S+Z)\s+(ERROR|WARN|INFO|DEBUG)\s+(\S+)\s+:\s+(.*)$/.exec(text);
    if (!m) return null;
    return {
      ts: Date.parse(m[1]!), level: m[2]!.toLowerCase(),
      logger: m[3], message: m[4],
    };
  },
} as unknown as FormatArg;

// ── Stage 1 ─────────────────────────────────────────────────────────────────

describe('stripAnsi', () => {
  /*
    A container with `spring.output.ansi.enabled=always` — common, because the
    JVM sees a TTY — writes the level wrapped in SGR codes. Those bytes sit
    between the fields, so every position a format depends on shifts and the
    line stops parsing.
  */
  const coloured = '2026-08-30T21:27:32.023Z \u001b[32mINFO\u001b[m com.example.Boot : started';

  it('removes the escapes a logger emits', () => {
    expect(stripAnsi(coloured))
      .toBe('2026-08-30T21:27:32.023Z INFO com.example.Boot : started');
  });

  it('leaves an ordinary line untouched', () => {
    const plain = '2026-08-30 INFO nothing to strip';
    expect(stripAnsi(plain)).toBe(plain);
  });

  it('lets a coloured line reach its level again', () => {
    // Unstripped, `levelOf` saw `[32mINFO` and the word boundary never matched.
    expect(parseLine(coloured, 1, false).level).toBe('info');
  });

  it('lets a coloured line parse against a format instead of being a continuation', () => {
    const l = parseLine(coloured, 1, false, spaceFormat);
    expect(l.continuation).toBe(false);
    expect(l.level).toBe('info');
  });
});

describe('line length cap', () => {
  it('truncates a line past the cap and says so', () => {
    const huge = `2026-08-30T21:27:32.023Z INFO payload ${'x'.repeat(MAX_LINE_LENGTH + 5000)}`;
    const l = parseLine(huge, 1, false);
    expect(l.text.length).toBe(MAX_LINE_LENGTH);
    expect(l.truncated).toBe(true);
  });

  it('leaves an ordinary line alone and does not mark it', () => {
    expect(parseLine('2026-08-30T21:27:32.023Z INFO short', 1, false).truncated)
      .toBeUndefined();
  });
});

describe('levelOf — the full vocabulary', () => {
  /*
    A java.util.logging application says SEVERE, CONFIG, FINE, FINER, FINEST.
    Most of those used to classify as `other`, so the whole log rendered plain.
    Nothing about it was unusual; it just spoke a dialect nobody had taught
    this function.
  */
  it.each([
    ['SEVERE', 'error'], ['FATAL', 'error'], ['CRITICAL', 'error'],
    ['EMERGENCY', 'error'], ['ALERT', 'error'], ['PANIC', 'error'],
    ['WARNING', 'warn'],
    ['NOTICE', 'info'], ['CONFIG', 'info'], ['INFORMATIONAL', 'info'],
    ['FINE', 'debug'], ['FINER', 'debug'], ['FINEST', 'debug'], ['VERBOSE', 'debug'],
  ])('reads %s as %s', (token, level) => {
    expect(levelOf(`2026-01-01 ${token} boot - message`)).toBe(level);
  });
});

// ── Stage 2 ─────────────────────────────────────────────────────────────────

describe('parseLine — the format decides what is an event', () => {
  const event = '2026-08-30T21:27:32.023Z ERROR com.example.Boot : failed';

  /*
    Every one of these was called an EVENT by the prefix heuristics: none
    starts with whitespace, `at `, or `Caused by:`. Under the format rule they
    are continuations because they do not parse — no list to maintain, and no
    language to special-case.
  */
  it.each([
    ['a throwable header', 'Exception in thread "main" java.lang.IllegalStateException: boom'],
    ['a Python traceback header', 'Traceback (most recent call last):'],
    ['a Go panic', 'goroutine 1 [running]:'],
    ['a line of multi-line JSON', '  "stack": ['],
    ['a Spring Boot banner line', ' :: Spring Boot ::                (v3.4.1)'],
    ['wrapped SQL', 'select * from orders where customer_id = ? and status in (?, ?)'],
  ])('treats %s as a continuation', (_what, line) => {
    const l = parseLine(line, 2, false, spaceFormat, undefined,
      { level: 'error', sawAppTimestamp: true });
    expect(l.continuation).toBe(true);
    expect(l.level).toBe('error');
  });

  /*
    False, not absent. The fold downstream reads `continuation ?? isStackFrame`,
    so an event left undefined here falls back to a text guess that a format
    has already overruled.
  */
  it('marks a parsing line as an event, not merely unmarked', () => {
    const l = parseLine(event, 1, false, spaceFormat);
    expect(l.continuation).toBe(false);
    expect(l.level).toBe('error');
  });

  it('leaves the verdict absent when no format was consulted', () => {
    // The heuristic failing to recognise a continuation is a weaker claim than
    // a format ruling the line an event, and the two must stay distinguishable.
    expect(parseLine('some line', 1, false).continuation).toBeUndefined();
  });

  it('marks a format-driven continuation as not guessed', () => {
    const l = parseLine('Traceback (most recent call last):', 2, false, spaceFormat,
      undefined, { level: 'warn', sawAppTimestamp: true });
    expect(l.continuation).toBe(true);
    expect(l.continuationGuessed).toBeUndefined();
  });

  it('marks a heuristic continuation as guessed', () => {
    // No format, so the prefix list is all there is — and the line says so.
    const l = parseLine('\tat com.example.Foo.run(Foo.java:1)', 2, false, undefined,
      undefined, { level: 'warn', sawAppTimestamp: true });
    expect(l.continuation).toBe(true);
    expect(l.continuationGuessed).toBe(true);
  });

  it('carries the fields the format named', () => {
    expect(parseLine(event, 1, false, spaceFormat).logger).toBe('com.example.Boot');
  });

  it('leaves fields absent on a continuation', () => {
    const l = parseLine('Traceback (most recent call last):', 2, false, spaceFormat,
      undefined, { level: 'error', sawAppTimestamp: true });
    expect(l.logger).toBeUndefined();
    expect(l.thread).toBeUndefined();
  });

  /*
    An orphan is left alone rather than guessed at. The no-format path calls a
    bare frame `error` on sight; under a format there is no reason to — the
    absence of an event above is information, not a licence to invent one.
  */
  it('leaves a continuation with no event above it unlevelled', () => {
    expect(parseLine('\tat com.example.Foo.run(Foo.java:1)', 1, false, spaceFormat).level)
      .toBe('other');
  });
});

describe('parseLine — level comes from the same parse', () => {
  /** Names a level position, but does not recognise CHATTER as a level. */
  const strict = {
    format: { id: 's', name: 'strict', kind: 'pattern' },
    hasLevel: true,
    parse: (text: string) => {
      const m = /^(\S+Z)\s+(\S+)\s+(.*)$/.exec(text);
      if (!m) return null;
      const known: Record<string, string> = { ERROR: 'error', INFO: 'info' };
      return { ts: Date.parse(m[1]!), level: known[m[2]!] ?? 'other', message: m[3] };
    },
  } as unknown as FormatArg;

  /*
    The line contains the word ERROR in its message. A format that named the
    level position and found `CHATTER` there has answered the question, and
    sniffing the rest of the line would be overruling it with a guess.
  */
  it('does not sniff when the format named a level and found none it knows', () => {
    const l = parseLine('2026-08-30T21:27:32.023Z CHATTER handled ERROR gracefully',
      1, false, strict);
    expect(l.level).toBe('other');
  });

  it('sniffs only when the format names no level at all', () => {
    const noLevel = {
      format: { id: 'n', name: 'no-level', kind: 'pattern' },
      hasLevel: false,
      parse: (text: string) => {
        const m = /^(\S+Z)\s+(.*)$/.exec(text);
        return m ? { ts: Date.parse(m[1]!), level: 'other', message: m[2] } : null;
      },
    } as unknown as FormatArg;

    expect(parseLine('2026-08-30T21:27:32.023Z ERROR something broke', 1, false, noLevel).level)
      .toBe('error');
  });
});
