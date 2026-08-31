import { describe, it, expect } from 'vitest';
import {
  buildMatcher, filterLines, densityBuckets, levelCounts,
  formatLogTime, selectionText, describeBucket,
  foldStackTraces, isStackFrame, compactCount, placeSelectionToolbar, grepTermFor,
  matchesFieldFilters, frameOrigin,
} from './log-view';
import type { LogLine } from '../../store/k8s-store';

const line = (seq: number, level: LogLine['level'], text: string, ts?: number): LogLine =>
  ({ seq, level, text, ts });

describe('buildMatcher', () => {
  it('is null for an empty query, so an empty box shows everything', () => {
    expect(buildMatcher('')).toBeNull();
    expect(buildMatcher('   ')).toBeNull();
  });

  it('matches substrings case-insensitively and reports every hit', () => {
    const m = buildMatcher('timeout')!;
    expect(m('Read TIMEOUT after timeout ms')).toEqual([[5, 12], [19, 26]]);
  });

  it('treats /.../ as a regex', () => {
    const m = buildMatcher('/pool-\\d+/')!;
    expect(m('thread pool-7 stalled')).toEqual([[7, 13]]);
    expect(m('thread pool-x stalled')).toBeNull();
  });

  it('falls back to substring on a half-typed regex rather than throwing', () => {
    // Typing "/[unclosed/" mid-search must narrow, not explode.
    const m = buildMatcher('/[unclosed/');
    expect(m).not.toBeNull();
    expect(m!('nothing here')).toBeNull();
  });

  it('does not hang on a zero-width regex match', () => {
    const m = buildMatcher('/x*/')!;
    // The guard is that this returns at all.
    expect(m('abc')).not.toBeUndefined();
  });
});

describe('filterLines', () => {
  const lines = [
    line(0, 'info', 'started'),
    line(1, 'error', 'connection refused'),
    line(2, 'warn', 'retrying connection'),
    line(3, 'debug', 'pool size 4'),
  ];

  it('returns everything when no level is chosen', () => {
    // An empty level list must mean "all", never "none" — the opposite would
    // show a blank viewer the moment a user deselected their last chip.
    expect(filterLines(lines, { query: '', levels: [] })).toHaveLength(4);
  });

  it('narrows by level', () => {
    const out = filterLines(lines, { query: '', levels: ['error', 'warn'] });
    expect(out.map(l => l.seq)).toEqual([1, 2]);
  });

  it('combines level and text, and carries hit ranges for highlighting', () => {
    const out = filterLines(lines, { query: 'connection', levels: ['error'] });
    expect(out).toHaveLength(1);
    expect(out[0].hits).toEqual([[0, 10]]);
  });
});

describe('densityBuckets', () => {
  it('is empty for an empty buffer', () => {
    expect(densityBuckets([], 40)).toEqual([]);
  });

  it('covers every line exactly once', () => {
    const lines = Array.from({ length: 250 }, (_, i) => line(i, 'info', `l${i}`));
    const buckets = densityBuckets(lines, 40);
    expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(250);
    expect(buckets[0].startIndex).toBe(0);
  });

  it('takes the worst level in the bucket, not the most common', () => {
    // 99 info lines and one error must still read as an error column, or the
    // ribbon hides exactly what it exists to surface.
    const lines = [
      ...Array.from({ length: 99 }, (_, i) => line(i, 'info', 'ok')),
      line(99, 'error', 'boom'),
    ];
    const [bucket] = densityBuckets(lines, 1);
    expect(bucket.worst).toBe('error');
    expect(bucket.errors).toBe(1);
  });

  it('drops to a flat strip when every bucket is the same size', () => {
    // The common case: fewer lines than the ribbon is pixels wide, so every
    // bucket holds one line. Full height for all of them would read as
    // "maximum density everywhere" — a solid wall that means nothing.
    const lines = Array.from({ length: 12 }, (_, i) => line(i, 'info', `l${i}`));
    const buckets = densityBuckets(lines, 400);
    expect(buckets).toHaveLength(12);
    expect(buckets.every(b => b.height === 0.45)).toBe(true);
  });

  it('gives a sparse bucket a visible floor', () => {
    const lines = [
      ...Array.from({ length: 100 }, (_, i) => line(i, 'info', 'busy')),
      line(100, 'info', 'lonely'),
    ];
    const buckets = densityBuckets(lines, 2);
    const smallest = buckets[buckets.length - 1];
    expect(smallest.count).toBeLessThan(buckets[0].count);
    // A single-line bucket must still be drawable, not a zero-height gap.
    expect(smallest.height).toBeGreaterThanOrEqual(0.12);
  });

  it('carries the time span when lines are timestamped', () => {
    const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
    const lines = [line(0, 'info', 'a', t0), line(1, 'info', 'b', t0 + 5000)];
    const [b] = densityBuckets(lines, 1);
    expect(b.fromTs).toBe(t0);
    expect(b.toTs).toBe(t0 + 5000);
  });
});

describe('describeBucket', () => {
  it('names errors and warnings when there are any', () => {
    const lines = [line(0, 'error', 'x'), line(1, 'warn', 'y'), line(2, 'info', 'z')];
    const [b] = densityBuckets(lines, 1);
    const text = describeBucket(b);
    expect(text).toContain('3 lines');
    expect(text).toContain('1 error');
    expect(text).toContain('1 warning');
  });
});

describe('levelCounts', () => {
  it('counts every level, including the ones at zero', () => {
    const counts = levelCounts([line(0, 'error', 'a'), line(1, 'error', 'b'), line(2, 'info', 'c')]);
    expect(counts).toEqual({ error: 2, warn: 0, info: 1, debug: 0, other: 0 });
  });
});

describe('formatLogTime', () => {
  it('is empty when there is no timestamp', () => {
    expect(formatLogTime(undefined)).toBe('');
  });

  it('renders milliseconds, since log timing is usually sub-second', () => {
    const d = new Date(2026, 0, 1, 14, 32, 7, 412);
    expect(formatLogTime(d.getTime())).toBe('14:32:07.412');
  });
});

describe('selectionText', () => {
  const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
  const lines = [
    line(0, 'info', 'before'),
    line(1, 'error', 'boom', t0),
    line(2, 'error', '  at Foo.bar', t0 + 400),
    line(3, 'info', 'after'),
  ];

  it('takes the inclusive seq range', () => {
    const out = selectionText(lines, 1, 2).split('\n');
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('boom');
    expect(out[1]).toContain('at Foo.bar');
  });

  it('restores timestamps the DOM does not carry', () => {
    // "these two lines are 400ms apart" is frequently the whole diagnosis, so
    // the AI must get the times even though the rendered gutter is separate.
    const out = selectionText(lines, 1, 2);
    expect(out).toContain('2026-01-01T12:00:00.000Z');
    expect(out).toContain('2026-01-01T12:00:00.400Z');
  });

  it('leaves untimestamped lines bare', () => {
    expect(selectionText(lines, 0, 0)).toBe('before');
  });
});

describe('foldStackTraces', () => {
  const err = (seq: number, text: string) => line(seq, 'error', text);
  const trace = [
    err(0, 'ERROR c.d.o.LedgerClient read timed out after 30000ms'),
    err(1, '\tat java.net.SocketInputStream.socketRead0(Native Method)'),
    err(2, '\tat java.net.SocketInputStream.read(SocketInputStream.java:150)'),
    err(3, '\tat com.example.Client.call(Client.java:42)'),
    line(4, 'info', 'INFO retrying'),
  ];

  it('folds the frames under the message that heads them', () => {
    const rows = foldStackTraces(trace, true);
    expect(rows).toHaveLength(2);
    expect(rows[0].line.seq).toBe(0);
    expect(rows[0].folded).toHaveLength(3);
    expect(rows[1].line.seq).toBe(4);
  });

  /*
    The host's verdict wins over the text heuristic.

    `isStackFrame` only knows Java. A Python traceback, a Go panic and a block
    of wrapped SQL are all continuations it calls events, so they stayed
    unfolded and pushed the message that caused them off the screen. When a
    format is configured the host marks them, and the fold follows that.
  */
  it('folds a continuation the text heuristic would not recognise', () => {
    const cont = (seq: number, text: string) =>
      ({ ...line(seq, 'error', text), continuation: true });
    const rows = foldStackTraces([
      line(0, 'error', 'ERROR worker failed'),
      cont(1, 'Traceback (most recent call last):'),
      cont(2, '  File "/app/main.py", line 12, in run'),
      cont(3, 'ValueError: bad input'),
      line(4, 'info', 'INFO retrying'),
    ], true);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.folded).toHaveLength(3);
  });

  it('does not fold a line the host called an event, whatever its text', () => {
    // An application that legitimately logs a line starting "  at " as its own
    // event. The format parsed it, so it is an event and stays one.
    const rows = foldStackTraces([
      line(0, 'error', 'ERROR boom'),
      { ...line(1, 'info', '	at the gate, waiting'), continuation: false },
    ], true);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.folded).toBeUndefined();
  });

  it('keeps every line when folding is off', () => {
    expect(foldStackTraces(trace, false)).toHaveLength(5);
  });

  it('keeps "Caused by" visible rather than folding it away', () => {
    // The root cause is the useful half of a trace; folding it defeats the
    // entire point of opening the log.
    const lines = [
      err(0, 'ERROR boom'),
      err(1, '\tat com.example.A.a(A.java:1)'),
      err(2, 'Caused by: java.net.SocketTimeoutException: Read timed out'),
      err(3, '\tat com.example.B.b(B.java:2)'),
    ];
    const rows = foldStackTraces(lines, true);
    expect(rows).toHaveLength(2);
    expect(rows[1].line.text).toContain('Caused by');
  });

  it('does not lose a run of frames whose header was filtered out', () => {
    const rows = foldStackTraces([
      err(0, '\tat com.example.A.a(A.java:1)'),
      err(1, '\tat com.example.B.b(B.java:2)'),
    ], true);
    expect(rows).toHaveLength(1);
    expect(rows[0].folded).toHaveLength(1);
  });

  it('does not fold plain indented text under an info line', () => {
    const rows = foldStackTraces([
      line(0, 'info', 'INFO config:'),
      line(1, 'info', '  key = value'),
    ], true);
    expect(rows).toHaveLength(2);
  });

  it('recognises the omitted-frames marker as a frame', () => {
    expect(isStackFrame('\t... 20 common frames omitted')).toBe(true);
    expect(isStackFrame('   ... 35 more')).toBe(true);
    expect(isStackFrame('INFO started')).toBe(false);
  });
});

describe('compactCount', () => {
  it('keeps small numbers exact and abbreviates large ones', () => {
    expect(compactCount(142)).toBe('142');
    expect(compactCount(1200)).toBe('1.2k');
    expect(compactCount(18_400)).toBe('18k');
  });
});

describe('placeSelectionToolbar', () => {
  const host = { top: 0, bottom: 600, left: 0, height: 600, width: 1000 };
  const toolbar = { width: 430, height: 58 };

  it('sits below the selection when there is room', () => {
    // Above was the first version's behaviour and it covered the very lines
    // that had just been highlighted.
    const p = placeSelectionToolbar(
      { top: 100, bottom: 160, left: 40, height: 60, width: 500 }, host, toolbar);
    expect(p.top).toBe(170);
  });

  it('never overlaps the selection', () => {
    const sel = { top: 100, bottom: 160, left: 40, height: 60, width: 500 };
    const p = placeSelectionToolbar(sel, host, toolbar);
    const overlaps = !(p.top + toolbar.height <= sel.top - host.top || p.top >= sel.bottom - host.top);
    expect(overlaps).toBe(false);
  });

  it('flips above when the selection is near the bottom', () => {
    const p = placeSelectionToolbar(
      { top: 520, bottom: 570, left: 40, height: 50, width: 500 }, host, toolbar);
    expect(p.top).toBe(520 - 58 - 10);
  });

  it('keeps the strip clear of the density ribbon on the right', () => {
    // Without the gutter the strip slides under the ribbon, which is the one
    // place it must not go — the ribbon is how you navigate away from here.
    const p = placeSelectionToolbar(
      { top: 100, bottom: 160, left: 940, height: 60, width: 40 }, host, toolbar, 38);
    expect(p.left + toolbar.width + 38).toBeLessThanOrEqual(host.width);
  });

  it('does not go off the left edge', () => {
    const p = placeSelectionToolbar(
      { top: 100, bottom: 160, left: -50, height: 60, width: 500 }, host, toolbar);
    expect(p.left).toBeGreaterThanOrEqual(8);
  });

  it('prefers below rather than covering text when neither side fits', () => {
    const tiny = { top: 0, bottom: 80, left: 0, height: 80, width: 1000 };
    const p = placeSelectionToolbar(
      { top: 10, bottom: 70, left: 0, height: 60, width: 500 }, tiny, toolbar);
    expect(p.top).toBeGreaterThanOrEqual(4);
  });
});

describe('grepTermFor', () => {
  it('greps the fragment that was highlighted, not its line', () => {
    // The bug this replaces: selecting a port put the entire log line into the
    // filter, which matched that one line and nothing else.
    expect(grepTermFor('5432')).toBe('5432');
  });

  it('keeps inner whitespace but trims the edges', () => {
    expect(grepTermFor('  connection refused  ')).toBe('connection refused');
  });

  it('is null for a selection of only whitespace', () => {
    expect(grepTermFor('   ')).toBeNull();
    expect(grepTermFor('')).toBeNull();
  });

  it('takes the first real line of a multi-line selection', () => {
    // No single line can contain a newline, so searching the whole thing would
    // reliably match nothing.
    expect(grepTermFor('\n\n  SocketTimeoutException\n  at Foo.bar\n'))
      .toBe('SocketTimeoutException');
  });

  it('caps a very long selection', () => {
    const term = grepTermFor('x'.repeat(500))!;
    expect(term.length).toBe(120);
  });
});

/*
  Field filters, which replace putting `[main]` in the search box.

  That was a substring match over the whole line: it also matched any message
  mentioning `[main]`, and it could not express "everything except this noisy
  thread" at all.
*/
describe('matchesFieldFilters', () => {
  const ev = (thread?: string, logger?: string) => ({ thread, logger, app: undefined });

  it('keeps everything when there are no filters', () => {
    expect(matchesFieldFilters(ev('main'), [])).toBe(true);
  });

  it('includes only the chosen value', () => {
    const f = [{ field: 'thread' as const, value: 'main', mode: 'include' as const }];
    expect(matchesFieldFilters(ev('main'), f)).toBe(true);
    expect(matchesFieldFilters(ev('worker-1'), f)).toBe(false);
  });

  it('excludes the chosen value and keeps the rest', () => {
    const f = [{ field: 'thread' as const, value: 'main', mode: 'exclude' as const }];
    expect(matchesFieldFilters(ev('main'), f)).toBe(false);
    expect(matchesFieldFilters(ev('worker-1'), f)).toBe(true);
  });

  it('ORs two includes on the same field', () => {
    const f = [
      { field: 'thread' as const, value: 'main', mode: 'include' as const },
      { field: 'thread' as const, value: 'worker-1', mode: 'include' as const },
    ];
    expect(matchesFieldFilters(ev('main'), f)).toBe(true);
    expect(matchesFieldFilters(ev('worker-1'), f)).toBe(true);
    expect(matchesFieldFilters(ev('worker-2'), f)).toBe(false);
  });

  it('ANDs includes across different fields', () => {
    const f = [
      { field: 'thread' as const, value: 'main', mode: 'include' as const },
      { field: 'logger' as const, value: 'com.acme.Boot', mode: 'include' as const },
    ];
    expect(matchesFieldFilters(ev('main', 'com.acme.Boot'), f)).toBe(true);
    expect(matchesFieldFilters(ev('main', 'com.acme.Db'), f)).toBe(false);
  });

  it('lets an exclude beat an include', () => {
    // "Hide this" is the stronger statement — a line matching both is one
    // somebody has explicitly asked not to see.
    const f = [
      { field: 'thread' as const, value: 'main', mode: 'include' as const },
      { field: 'thread' as const, value: 'main', mode: 'exclude' as const },
    ];
    expect(matchesFieldFilters(ev('main'), f)).toBe(false);
  });

  it('matches a wildcard', () => {
    const f = [{ field: 'thread' as const, value: 'pool-*', mode: 'include' as const }];
    expect(matchesFieldFilters(ev('pool-2-thread-1'), f)).toBe(true);
    expect(matchesFieldFilters(ev('main'), f)).toBe(false);
  });

  it('does not let a wildcard value smuggle in a regex', () => {
    // `.` and `+` are literal; only `*` is special.
    const f = [{ field: 'logger' as const, value: 'com.acme.Boot', mode: 'include' as const }];
    expect(matchesFieldFilters(ev(undefined, 'comXacmeXBoot'), f)).toBe(false);
  });

  it('drops a line that has no value for an included field', () => {
    const f = [{ field: 'thread' as const, value: 'main', mode: 'include' as const }];
    expect(matchesFieldFilters(ev(undefined, 'com.acme.Boot'), f)).toBe(false);
  });

  it('keeps a line that has no value for an EXCLUDED field', () => {
    // An exclude says "not this one", not "only lines that have this field".
    const f = [{ field: 'thread' as const, value: 'main', mode: 'exclude' as const }];
    expect(matchesFieldFilters(ev(undefined, 'com.acme.Boot'), f)).toBe(true);
  });
});

describe('filterLines — field filters and continuations', () => {
  const event = (seq: number, thread: string, text: string) =>
    ({ ...line(seq, 'error', text), thread, continuation: false });
  const frame = (seq: number, text: string) =>
    ({ ...line(seq, 'error', text), continuation: true });

  /*
    The trap this avoids: judging a stack frame on its own strips every trace
    out from under the errors that produced them. The filter looks like it
    worked and the evidence is gone.
  */
  it('keeps a kept event’s stack trace with it', () => {
    const lines = [
      event(0, 'main', 'ERROR boom'),
      frame(1, '\tat com.acme.Foo.run(Foo.java:1)'),
      frame(2, '\tat com.acme.Bar.go(Bar.java:2)'),
      event(3, 'worker-1', 'ERROR other'),
      frame(4, '\tat com.acme.Baz.go(Baz.java:3)'),
    ];
    const out = filterLines(lines, {
      query: '', levels: [],
      fields: [{ field: 'thread', value: 'main', mode: 'include' }],
    });
    expect(out.map(l => l.seq)).toEqual([0, 1, 2]);
  });

  it('drops a filtered-out event’s trace with it', () => {
    const lines = [
      event(0, 'worker-1', 'ERROR other'),
      frame(1, '\tat com.acme.Baz.go(Baz.java:3)'),
      event(2, 'main', 'ERROR boom'),
    ];
    const out = filterLines(lines, {
      query: '', levels: [],
      fields: [{ field: 'thread', value: 'main', mode: 'include' }],
    });
    expect(out.map(l => l.seq)).toEqual([2]);
  });

  it('behaves exactly as before when there are no field filters', () => {
    const lines = [event(0, 'main', 'ERROR boom'), frame(1, '\tat com.acme.Foo.run(Foo.java:1)')];
    expect(filterLines(lines, { query: '', levels: [] }).map(l => l.seq)).toEqual([0, 1]);
  });
});

describe('filterLines — lines before the first event', () => {
  /*
    The banner and the JVM's startup notice are printed before any logger is
    configured, so they belong to no event. Under a field filter they match
    nothing and have to go — they were being kept because the "is the current
    event kept" flag started out true.
  */
  const banner = (seq: number, text: string) =>
    ({ ...line(seq, 'other', text), continuation: true });
  const event = (seq: number, thread: string, text: string) =>
    ({ ...line(seq, 'info', text), thread, continuation: false });

  const lines = [
    banner(0, 'Picked up JAVA_TOOL_OPTIONS: -Xmx192m'),
    banner(1, ' :: Spring Boot ::   (v3.4.1)'),
    event(2, 'main', 'INFO started'),
    event(3, 'worker-1', 'INFO handled'),
  ];

  it('drops pre-event noise when a field filter is on', () => {
    const out = filterLines(lines, {
      query: '', levels: [],
      fields: [{ field: 'thread', value: 'main', mode: 'include' }],
    });
    expect(out.map(l => l.seq)).toEqual([2]);
  });

  it('keeps pre-event noise when no field filter is on', () => {
    expect(filterLines(lines, { query: '', levels: [] }).map(l => l.seq))
      .toEqual([0, 1, 2, 3]);
  });

  it('drops an excluded event’s trace along with it', () => {
    const withTrace = [
      event(0, 'main', 'ERROR boom'),
      { ...line(1, 'error', '\tat com.acme.Foo.run(Foo.java:1)'), continuation: true },
      event(2, 'worker-1', 'INFO fine'),
    ];
    const out = filterLines(withTrace, {
      query: '', levels: [],
      fields: [{ field: 'thread', value: 'main', mode: 'exclude' }],
    });
    expect(out.map(l => l.seq)).toEqual([2]);
  });
});

describe('filterLines — an exclude is not a membership test', () => {
  const banner = (seq: number) =>
    ({ ...line(seq, 'other', 'Picked up JAVA_TOOL_OPTIONS'), continuation: true });
  const event = (seq: number, logger: string) =>
    ({ ...line(seq, 'info', `INFO from ${logger}`), logger, continuation: false });

  const lines = [banner(0), event(1, 'com.acme.Noisy'), event(2, 'com.acme.Quiet')];

  /*
    "Hide this logger" says nothing about the startup banner, which has no
    logger at all. Dropping it threw away eight lines of boot output every
    time somebody muted one class.
  */
  it('keeps pre-event lines under an exclude', () => {
    const out = filterLines(lines, {
      query: '', levels: [],
      fields: [{ field: 'logger', value: 'com.acme.Noisy', mode: 'exclude' }],
    });
    expect(out.map(l => l.seq)).toEqual([0, 2]);
  });

  it('drops pre-event lines under an include', () => {
    // "Show me this logger" cannot be satisfied by a line that has none.
    const out = filterLines(lines, {
      query: '', levels: [],
      fields: [{ field: 'logger', value: 'com.acme.Noisy', mode: 'include' }],
    });
    expect(out.map(l => l.seq)).toEqual([1]);
  });

  it('drops them when an include and an exclude are both on', () => {
    const out = filterLines(lines, {
      query: '', levels: [],
      fields: [
        { field: 'logger', value: 'com.acme.Quiet', mode: 'include' },
        { field: 'logger', value: 'com.acme.Noisy', mode: 'exclude' },
      ],
    });
    expect(out.map(l => l.seq)).toEqual([2]);
  });
});

/*
  Where a frame came from.

  The first version read the jar tag and called anything unversioned "yours".
  Against the real fixture that claimed thirteen frames were the application's
  — and all thirteen were JDK classes tagged `~[na:na]` or Spring's own
  launcher tagged `~[app.jar]`. The tag says which archive a class was loaded
  from, which is not the same question.
*/
describe('frameOrigin', () => {
  it.each([
    ['the JDK', '	at java.base/java.net.Socket.connect(Socket.java:751) ~[na:na]'],
    ['Spring', '	at org.springframework.orm.jpa.Foo.bar(Foo.java:390) ~[spring-orm-6.2.1.jar!/:6.2.1]'],
    ['Spring’s launcher', '	at org.springframework.boot.loader.launch.JarLauncher.main(JarLauncher.java:58) ~[app.jar:1.0.0]'],
    ['Hibernate', '	at org.hibernate.boot.model.relational.Database.<init>(Database.java:45) ~[hibernate-core-6.6.4.Final.jar!/:6.6.4.Final]'],
    ['Hikari', '	at com.zaxxer.hikari.HikariDataSource.getConnection(HikariDataSource.java:1) ~[HikariCP-5.1.0.jar!/:na]'],
  ])('knows a %s frame is not yours', (_what, line) => {
    expect(frameOrigin(line)).toBe('library');
  });

  /*
    The correction. These were all called `app` by the jar-tag rule, and the
    only thing they have in common is the archive they were loaded from.
  */
  it('does not call a JDK frame yours because its jar has no version', () => {
    expect(frameOrigin('	at java.base/java.lang.reflect.Method.invoke(Method.java:580) ~[na:na]'))
      .toBe('library');
  });

  it('says unknown for a package it cannot place', () => {
    // There is no way to tell your `com.acme` from a vendor's `com.acme`.
    expect(frameOrigin('	at com.acme.Thing.go(Thing.java:9) ~[app.jar:1.0.0]')).toBe('unknown');
  });

  it('answers properly once the home packages are known', () => {
    const line = '	at com.acme.Thing.go(Thing.java:9) ~[app.jar:1.0.0]';
    expect(frameOrigin(line, ['com.acme'])).toBe('app');
    expect(frameOrigin('	at com.vendor.Lib.run(Lib.java:1)', ['com.acme'])).toBe('library');
  });

  it('keeps the runtime out of your packages even if you claim them', () => {
    // `java.` is never yours, and a stated prefix that overlaps it is a typo.
    expect(frameOrigin('	at java.base/java.net.Socket.connect(Socket.java:751)', ['com.acme']))
      .toBe('library');
  });

  it('says unknown for a line that is not a frame', () => {
    expect(frameOrigin('2026-08-31 INFO started')).toBe('unknown');
  });
});
