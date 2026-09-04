/**
 * Read against dumps a real `py-spy` produced, not hand-written ones.
 *
 * `threads.txt` is a four-thread process with the GIL visibly held by one of
 * them; `asyncio-blocked.txt` is an event loop stopped inside `time.sleep`,
 * taken from `AsyncioLoad.py` beside it. Both came off `py-spy dump` against a
 * running interpreter, so the format is the tool's rather than my memory of it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isPySpyDump, parsePySpyDump, frameMethod } from './pyspy-parser';
import { parseAnyThreadDump } from './thread-dump';
import { findStackShapes } from './thread-shapes';

const fixture = (n: string) =>
  readFileSync(join(__dirname, '../../../test/fixtures/pyspy', n), 'utf8');

const THREADS = fixture('threads.txt');
const ASYNCIO = fixture('asyncio-blocked.txt');

describe('isPySpyDump', () => {
  it('recognises a py-spy dump by its content', () => {
    expect(isPySpyDump(THREADS)).toBe(true);
    expect(isPySpyDump(ASYNCIO)).toBe(true);
  });

  it('does not claim a jstack dump', () => {
    const jstack = readFileSync(
      join(__dirname, '../../../test/fixtures/threads/contended.txt'), 'utf8');
    expect(isPySpyDump(jstack)).toBe(false);
  });

  it('recognises a dump with no version line', () => {
    // A process that died between attach and read writes no `Python v…`, but
    // its frames still name .py files and no jstack frame ever does.
    expect(isPySpyDump('Thread 7 (idle):\n    main (app.py:3)\n')).toBe(true);
  });
});

describe('parsePySpyDump', () => {
  const dump = parsePySpyDump(THREADS);

  it('reads every thread with its name and id', () => {
    expect(dump.threads).toHaveLength(5);
    expect(dump.threads.map(t => t.name)).toEqual([
      'MainThread', 'cruncher-0', 'cruncher-1', 'idler-0', 'idler-1',
    ]);
    expect(dump.threads[1].tid).toBe('52');
  });

  it('maps active to RUNNABLE and idle to WAITING', () => {
    expect(dump.threads[1].state).toBe('RUNNABLE');
    expect(dump.threads[2].state).toBe('WAITING');
  });

  it('keeps the raw state, because the GIL is in it', () => {
    /*
      `active+gil` is the one line in a Python dump that explains why the other
      threads are not running. Flattening it to RUNNABLE would throw away the
      only answer the dump contains.
    */
    expect(dump.threads[1].status).toBe('active+gil');
    expect(dump.threads[2].status).toBe('idle');
  });

  it('reads frames innermost first, with file and line', () => {
    const t = dump.threads[1];
    expect(t.frames[0]).toMatchObject({ method: 'th.spin', file: 'th.py', line: 5 });
    expect(t.frames[1].method).toBe('threading.run');
  });

  it('marks stdlib frames so the views can grey them', () => {
    const t = dump.threads[1];
    expect(t.frames[0].jdk).toBe(false);        // th.spin — the application
    expect(t.frames[1].jdk).toBe(true);         // threading.run — stdlib
  });

  it('reports the interpreter version', () => {
    expect(dump.jvm).toBe('Python 3.11.16');
  });

  it('claims no deadlocks, because a Python dump has no monitor graph', () => {
    expect(dump.reportedDeadlocks).toEqual([]);
  });
});

describe('frameMethod', () => {
  it('builds a dotted name the shared vocabulary can match', () => {
    expect(frameMethod('spin', 'th.py')).toBe('th.spin');
    expect(frameMethod('_run_once', 'asyncio/base_events.py'))
      .toBe('asyncio.base_events._run_once');
  });
});

describe('parseAnyThreadDump', () => {
  it('routes on content, not on the file name', () => {
    expect(parseAnyThreadDump(THREADS).runtime).toBe('python');
    const jstack = readFileSync(
      join(__dirname, '../../../test/fixtures/threads/contended.txt'), 'utf8');
    expect(parseAnyThreadDump(jstack).runtime).toBe('jvm');
  });

  it('produces threads the JVM rules can read', () => {
    // The whole point of the shared shape: rules built for jstack run on this
    // without knowing Python exists.
    const d = parseAnyThreadDump(THREADS);
    expect(() => findStackShapes(d.threads)).not.toThrow();
  });
});

describe('the asyncio event-loop rule', () => {
  it('finds a loop stopped inside a task', () => {
    const d = parseAnyThreadDump(ASYNCIO);
    const found = findStackShapes(d.threads);
    const rule = found.find(f => f.ruleId === 'asyncio.blocked-event-loop');

    expect(rule).toBeDefined();
    expect(rule!.severity).toBe('critical');
    /*
      The line is the finding. AsyncioLoad.py:29 is the `time.sleep(0.05)`
      inside `price_lookup` — planted deliberately, and asserted against the
      source file rather than against whatever this rule happened to emit.
    */
    expect(rule!.detail).toContain('AsyncioLoad.price_lookup');
    expect(rule!.detail).toContain('AsyncioLoad.py:29');
  });

  it('does not fire on threads that merely block', () => {
    /*
      `threads.txt` has three idle threads, two of them inside `time.sleep`.
      That is a perfectly ordinary Python process, and a rule that called it a
      stalled event loop would fire on almost every dump ever taken.
    */
    const d = parseAnyThreadDump(THREADS);
    const found = findStackShapes(d.threads);
    expect(found.find(f => f.ruleId === 'asyncio.blocked-event-loop')).toBeUndefined();
  });

  it('does not fire on a loop waiting in the selector', () => {
    /*
      The healthy case, and the one that decides whether this rule is usable:
      an idle loop parked in `selectors.select` is what a working service looks
      like at almost every instant. Firing here would make the rule noise.
    */
    const healthy = [
      'Process 1: python -u /src/app.py',
      'Python v3.11.16 (/usr/local/bin/python3.11)',
      '',
      'Thread 1 (idle): "MainThread"',
      '    select (selectors.py:468)',
      '    _run_once (asyncio/base_events.py:1936)',
      '    run_forever (asyncio/base_events.py:608)',
      '    run (asyncio/runners.py:190)',
      '    <module> (app.py:61)',
    ].join('\n');

    const d = parseAnyThreadDump(healthy);
    expect(d.threads[0].state).toBe('WAITING');       // idle, same as the stalled one
    const found = findStackShapes(d.threads);
    expect(found.find(f => f.ruleId === 'asyncio.blocked-event-loop')).toBeUndefined();
  });
});
