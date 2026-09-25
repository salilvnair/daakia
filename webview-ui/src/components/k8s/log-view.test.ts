import { describe, it, expect } from 'vitest';
import {
  buildMatcher, filterLines, densityBuckets, levelCounts,
  formatLogTime, selectionText, describeBucket,
  foldStackTraces, isStackFrame, compactCount, placeSelectionToolbar, grepTermFor,
  matchesFieldFilters, frameOrigin, displayText, ribbonBands,
  timeBuckets, timeRange, ribbonTicks, COMPACT_RIBBON_PX, sharedSpan,
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

  /*
    The chip read ERROR 35 over a screen holding one folded exception. A frame
    carries the level of the event it belongs to, and counting lines counted
    all 34 of them.
  */
  it('counts an exception once, however many frames it dragged in', () => {
    const trace: LogLine[] = [
      line(0, 'error', 'read timed out after 30000ms'),
      { ...line(1, 'error', '\tat java.net.SocketInputStream.socketRead0(Native Method)'), continuation: true },
      { ...line(2, 'error', '\tat com.acme.Ledger.call(Ledger.java:88)'), continuation: true },
      { ...line(3, 'error', '\t... 34 more'), continuation: true },
    ];
    expect(levelCounts(trace).error).toBe(1);
  });

  it('folds a frame the host said nothing about, on the text alone', () => {
    // No format configured: `continuation` is absent and the shape is all there is.
    const counts = levelCounts([
      line(0, 'error', 'boom'),
      line(1, 'error', '    at com.acme.Foo.run(Foo.java:1)'),
    ]);
    expect(counts.error).toBe(1);
  });

  it('leaves an event that merely starts with spaces alone', () => {
    // Indentation is not a stack frame; `at` has to be there.
    const counts = levelCounts([line(0, 'warn', '   waiting for the pool')]);
    expect(counts.warn).toBe(1);
  });
});

describe('densityBuckets — errors in the tooltip', () => {
  it('counts events, so a folded trace is one error in the ribbon too', () => {
    const [bucket] = densityBuckets([
      line(0, 'error', 'read timed out'),
      { ...line(1, 'error', '\tat com.acme.Foo.run(Foo.java:1)'), continuation: true },
      { ...line(2, 'error', '\tat com.acme.Bar.go(Bar.java:2)'), continuation: true },
      line(3, 'info', 'carrying on'),
    ], 1);
    expect(bucket.errors).toBe(1);
    // The column is still as tall as the lines it holds: density is density.
    expect(bucket.count).toBe(4);
    // And the colour still says error, because one happened here.
    expect(bucket.worst).toBe('error');
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

/* ── What a row shows, once a format parses the line ──────────────────── */

describe('displayText', () => {
  const raw = '{"level":"ERROR","message":"settlement failed","tenant":"eu-west"}';

  it('shows the parsed message rather than the JSON that carried it', () => {
    expect(displayText({ text: raw, message: 'settlement failed' })).toBe('settlement failed');
  });

  it('falls back to the raw line when no format parsed one', () => {
    expect(displayText({ text: raw })).toBe(raw);
  });

  it('leaves the raw line alone — Copy and Export still mean what the pod wrote', () => {
    const line = { text: raw, message: 'settlement failed' };
    displayText(line);
    expect(line.text).toBe(raw);
  });
});

describe('filterLines highlights what is on screen', () => {
  const line = (over: Partial<LogLine> = {}): LogLine => ({
    seq: 1, level: 'error',
    text: '{"level":"ERROR","message":"settlement failed","tenant":"eu-west"}',
    message: 'settlement failed',
    ...over,
  } as LogLine);

  it('offsets point into the shown text, not the raw line', () => {
    const [m] = filterLines([line()], { query: 'settlement', levels: [] });
    expect(m.hits?.[0]).toEqual([0, 10]);
    // Which is where it is in the message, not in the JSON.
    expect('settlement failed'.slice(0, 10)).toBe('settlement');
  });

  it('still matches a value that only exists inside the raw JSON', () => {
    // Half of why anyone searches a structured log is to find a field value.
    const out = filterLines([line()], { query: 'eu-west', levels: [] });
    expect(out).toHaveLength(1);
  });

  it('keeps a row whose match is only in a key name, and highlights nothing there', () => {
    const out = filterLines([line()], { query: 'tenant', levels: [] });
    expect(out).toHaveLength(1);
    // The word is not in the message, so no range can point at it honestly.
    expect(out[0].hits?.every(([a, b]) =>
      'settlement failed'.slice(a, b).toLowerCase() !== 'tenant')).toBe(true);
  });
});

describe('keeping what is around a hit', () => {
  /* The question somebody actually has is never "which line says this" — it
     is "what happened around the moment it said it". */
  const lines = Array.from({ length: 10 }, (_, i) =>
    line(i, 'info', i === 4 ? 'boom CheckoutService failed' : `line ${i}`));

  it('is the hit alone when no context is asked for', () => {
    const out = filterLines(lines, { query: 'boom', levels: [] });
    expect(out.map(l => l.seq)).toEqual([4]);
  });

  it('keeps the lines either side', () => {
    const out = filterLines(lines, { query: 'boom', levels: [], contextLines: 2 });
    expect(out.map(l => l.seq)).toEqual([2, 3, 4, 5, 6]);
  });

  it('marks the neighbours as context so the hit is still findable', () => {
    const out = filterLines(lines, { query: 'boom', levels: [], contextLines: 1 });
    expect(out.filter(l => !l.context).map(l => l.seq)).toEqual([4]);
    expect(out.filter(l => l.context).map(l => l.seq)).toEqual([3, 5]);
  });

  it('does not run off either end', () => {
    const out = filterLines(
      [line(0, 'info', 'boom'), line(1, 'info', 'a')],
      { query: 'boom', levels: [], contextLines: 5 },
    );
    expect(out.map(l => l.seq)).toEqual([0, 1]);
  });

  it('shows an overlapping line once, not twice', () => {
    /* Two hits three apart with two lines of context share one. Emitting a
       window per hit would print it twice and put the log out of order. */
    const two = Array.from({ length: 8 }, (_, i) =>
      line(i, 'info', i === 2 || i === 5 ? 'boom' : `line ${i}`));
    const out = filterLines(two, { query: 'boom', levels: [], contextLines: 2 });
    expect(out.map(l => l.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(out.map(l => l.seq)).size).toBe(out.length);
  });

  it('stays in the order the pod wrote them', () => {
    const three = Array.from({ length: 12 }, (_, i) =>
      line(i, 'info', i === 1 || i === 9 ? 'boom' : `line ${i}`));
    const out = filterLines(three, { query: 'boom', levels: [], contextLines: 1 });
    expect(out.map(l => l.seq)).toEqual([0, 1, 2, 8, 9, 10]);
  });

  it('is nothing at all when nothing matched', () => {
    expect(filterLines(lines, { query: 'nothing', levels: [], contextLines: 3 })).toEqual([]);
  });

  it('does not invent context when there is no query', () => {
    const out = filterLines(lines, { query: '', levels: [], contextLines: 3 });
    expect(out).toHaveLength(lines.length);
    expect(out.every(l => !l.context)).toBe(true);
  });

  it('only considers lines the level filter kept', () => {
    /* Context must not smuggle back a line the reader excluded by level. */
    const mixed = [
      line(0, 'debug', 'debug noise'),
      line(1, 'error', 'boom'),
      line(2, 'debug', 'debug noise'),
      line(3, 'error', 'after'),
    ];
    const out = filterLines(mixed, { query: 'boom', levels: ['error'], contextLines: 2 });
    expect(out.map(l => l.seq)).toEqual([1, 3]);
  });
});

/*
  A ribbon in a small pane of a split was drawn to a scale no pane had: it asked
  for more bands than fitted, the track kept the height its bands demanded, and
  every measurement taken from it was of that taller box.
*/
describe('ribbonBands', () => {
  const fits = (h: number, min = 2, gap = 1) =>
    ribbonBands(h, min, gap) * min + (ribbonBands(h, min, gap) - 1) * gap;

  it('takes one band per ~7px when there is room', () => {
    expect(ribbonBands(700)).toBe(100);
  });

  it('never asks for more than the track can draw', () => {
    for (const h of [20, 44, 80, 150, 210, 400]) {
      expect(fits(h)).toBeLessThanOrEqual(h);
    }
  });

  it('still draws something in a pane too short for either rule', () => {
    // Four bands is a severity strip rather than a density plot, which is the
    // honest thing to show at this size — but an empty track says nothing.
    expect(ribbonBands(8)).toBe(4);
  });

  it('lets the fit ceiling win when the bands are chunky', () => {
    // 150px would take 21 bands by the readable rule; at 12px apiece only 11
    // of them fit, and the number the track can draw is the one that counts.
    expect(ribbonBands(150, 12, 1)).toBe(11);
  });
});

/*
  A split of three pods, each ribbon scaled to its own lines, drew a burst that
  hit all three at 14:02 at three different heights. On a shared clock the same
  height is the same instant in every pane.
*/
describe('timeBuckets — one clock for a split', () => {
  const t = (s: number) => Date.UTC(2026, 0, 1, 14, 2, s);
  const range = { from: t(0), to: t(40) };

  it('slices time, not lines', () => {
    const lines = [line(0, 'info', 'a', t(1)), line(1, 'info', 'b', t(2)), line(2, 'error', 'c', t(35))];
    const buckets = timeBuckets(lines, 4, range);
    expect(buckets.map(b => b.count)).toEqual([2, 0, 0, 1]);
    expect(buckets[3].worst).toBe('error');
  });

  it('draws an empty stretch as empty, because silence is the finding', () => {
    // "This pod said nothing while the others failed" only reads if the gap
    // is drawn at zero rather than given a sparse bucket's floor.
    const buckets = timeBuckets([line(0, 'info', 'a', t(1))], 4, range);
    expect(buckets.slice(1).every(b => b.height === 0)).toBe(true);
    expect(buckets[0].height).toBeGreaterThan(0);
  });

  it('puts the same instant at the same height in two panes', () => {
    const range2 = { from: t(0), to: t(40) };
    const a = timeBuckets([line(0, 'error', 'x', t(21))], 8, range2);
    const b = timeBuckets([line(0, 'info', 'q', t(3)), line(1, 'error', 'y', t(21))], 8, range2);
    expect(a.findIndex(x => x.errors)).toBe(b.findIndex(x => x.errors));
  });

  it('leaves out a line with no timestamp rather than guessing where it goes', () => {
    const buckets = timeBuckets([line(0, 'info', 'no time')], 4, range);
    expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(0);
  });

  it('keeps the first line of each slice for scroll-to', () => {
    const lines = [line(0, 'info', 'a', t(1)), line(1, 'info', 'b', t(30))];
    const buckets = timeBuckets(lines, 4, range);
    expect(buckets[0].startIndex).toBe(0);
    expect(buckets[3].startIndex).toBe(1);
  });

  it('counts events not frames here too', () => {
    const lines = [
      line(0, 'error', 'boom', t(1)),
      { ...line(1, 'error', '	at com.acme.X.y(X.java:1)', t(1)), continuation: true },
    ];
    expect(timeBuckets(lines, 2, range)[0].errors).toBe(1);
  });
});

describe('timeRange', () => {
  it('spans every log it is given', () => {
    const a = [line(0, 'info', 'a', 50), line(1, 'info', 'b', 90)];
    const b = [line(0, 'info', 'c', 10), line(1, 'info', 'd', 70)];
    expect(timeRange(a, b)).toEqual({ from: 10, to: 90 });
  });

  it('is undefined when nothing has a time', () => {
    expect(timeRange([line(0, 'info', 'x')])).toBeUndefined();
  });
});

describe('ribbonTicks — a ribbon too short for density', () => {
  it('is only errors and warnings', () => {
    const lines = [line(0, 'info', 'a'), line(1, 'error', 'b'), line(2, 'info', 'c'), line(3, 'warn', 'd')];
    const ticks = ribbonTicks(lines, 400);
    expect(ticks.map(t => t.level)).toEqual(['error', 'warn']);
  });

  it('merges ticks that would sit on one pixel, keeping the worse level and the count', () => {
    const lines = Array.from({ length: 200 }, (_, i) =>
      line(i, i === 100 ? 'error' : i === 101 ? 'warn' : 'info', `l${i}`));
    const ticks = ribbonTicks(lines, 60);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toMatchObject({ level: 'error', count: 2 });
  });

  it('does not tick a stack frame', () => {
    const lines = [
      line(0, 'error', 'boom'),
      { ...line(1, 'error', '	at com.acme.X.y(X.java:1)'), continuation: true },
    ];
    expect(ribbonTicks(lines, 400)).toHaveLength(1);
  });

  it('switches on below the threshold, not above it', () => {
    expect(COMPACT_RIBBON_PX).toBe(180);
  });
});

describe('ribbonTicks on a shared clock', () => {
  const t = (s: number) => Date.UTC(2026, 0, 1, 14, 2, s);
  const range = { from: t(0), to: t(100) };

  it('places a tick by its time, not its position in the buffer', () => {
    // One line in, but 75% of the way through the shared span.
    const lines = [line(0, 'error', 'boom', t(75)), line(1, 'info', 'ok', t(80))];
    expect(ribbonTicks(lines, 400, 4, range)[0].at).toBeCloseTo(0.75, 5);
    // Without the clock the same error sits at the top of its own buffer.
    expect(ribbonTicks(lines, 400)[0].at).toBe(0);
  });

  it('puts the same instant at the same height in two panes', () => {
    const a = ribbonTicks([line(0, 'error', 'x', t(40))], 400, 4, range);
    const b = ribbonTicks([line(0, 'info', 'q', t(1)), line(1, 'error', 'y', t(40))], 400, 4, range);
    expect(a[0].at).toBe(b[0].at);
  });

  it('leaves out an error with no time rather than guessing where it goes', () => {
    expect(ribbonTicks([line(0, 'error', 'no time')], 400, 4, range)).toEqual([]);
  });
});

/*
  The screenshot that found this: zp-backend-big-one filtered to errors, every
  row red, and a ribbon empty from top to bottom but for a sliver of red at the
  end. Its 5,000 lines covered 75 seconds; the pane beside it held an hour. On
  a clock spanning the UNION, 75 seconds of an hour is the last two percent.
*/
describe('sharedSpan — the time every pane can speak for', () => {
  const at = (h: number, m: number, s = 0) => Date.UTC(2026, 8, 24, h, m, s);
  const quietHour = [line(0, 'info', 'a', at(22, 57)), line(1, 'info', 'b', at(23, 52, 43))];
  const chatty75s = [line(0, 'error', 'x', at(23, 51, 29)), line(1, 'error', 'y', at(23, 52, 43))];

  it('is the overlap, not the union', () => {
    expect(sharedSpan([quietHour, chatty75s])).toEqual({ from: at(23, 51, 29), to: at(23, 52, 43) });
  });

  it('gives the busy pane its whole ribbon back', () => {
    const range = sharedSpan([quietHour, chatty75s])!;
    const buckets = timeBuckets(chatty75s, 10, range);
    // Its first and last lines sit at the two ends, not both in the last slice.
    expect(buckets[0].count).toBe(1);
    expect(buckets[9].count).toBe(1);
  });

  it('is undefined when the panes share no time at all', () => {
    const morning = [line(0, 'info', 'm', at(9, 0)), line(1, 'info', 'n', at(9, 5))];
    const evening = [line(0, 'info', 'e', at(21, 0)), line(1, 'info', 'f', at(21, 5))];
    expect(sharedSpan([morning, evening])).toBeUndefined();
  });

  it('is undefined for an overlap too short to draw', () => {
    const a = [line(0, 'info', 'a', 1000), line(1, 'info', 'b', 5000)];
    const b = [line(0, 'info', 'c', 4800), line(1, 'info', 'd', 9000)];
    expect(sharedSpan([a, b])).toBeUndefined();
  });

  it('ignores a pane with no timestamps, which has no place on any clock', () => {
    expect(sharedSpan([chatty75s, [line(0, 'info', 'plain')]]))
      .toEqual({ from: at(23, 51, 29), to: at(23, 52, 43) });
  });
});
