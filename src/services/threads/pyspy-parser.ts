/**
 * Reading a `py-spy dump`.
 *
 * dk8s has collected Python stacks since the artifacts work and could not read
 * one: the file was handed to the JVM thread parser, which found nothing and
 * told the reader their file should look like jstack output — when dk8s had
 * produced it.
 *
 * The whole design decision here is the output shape. This produces the SAME
 * `ThreadInfo` the JVM parser does, so every view already built — the thread
 * list, the state ribbon, the merged flame graph, the shape rules — works on a
 * Python process without knowing one exists. A parallel Python pipeline would
 * have meant reimplementing all of it, and the second implementation is always
 * the one that goes stale.
 *
 * What py-spy gives us, from a real dump:
 *
 *   Process 1: python -u /src/AsyncioLoad.py
 *   Python v3.11.16 (/usr/local/bin/python3.11)
 *
 *   Thread 52 (active+gil): "cruncher-0"
 *       spin (th.py:5)
 *       run (threading.py:982)
 *
 * Innermost frame first, which is the same order jstack prints and therefore
 * the order every rule already reasons in.
 */
import type { ThreadInfo, ThreadDump, StackFrame, ThreadState } from './jstack-parser';

/** `Thread 52 (active+gil): "cruncher-0"` — the name is optional. */
const THREAD_LINE = /^Thread\s+(\S+)\s*\(([^)]*)\)\s*:?\s*(?:"(.*)")?\s*$/;

/** `    spin (th.py:5)` — four spaces, a function, a file and a line. */
const FRAME_LINE = /^\s+(\S+)\s+\((.+?):(\d+)\)\s*$/;

/** `Process 1: python -u /src/app.py` */
const PROCESS_LINE = /^Process\s+(\d+):\s*(.*)$/;
const VERSION_LINE = /^Python\s+v(\S+)/;

/**
 * Is this a py-spy dump rather than a JVM one?
 *
 * Checked on content, not on the file name, because the name is whatever the
 * artifact was called and an imported file has no name we chose.
 */
export function isPySpyDump(text: string): boolean {
  const head = text.slice(0, 4000);
  if (/^Python\s+v\d/m.test(head)) return true;
  // A dump of a process that died between attach and read has no version line,
  // but its frames still name .py files, and no jstack frame ever does.
  return /^Thread\s+\S+\s*\(/m.test(head) && /\(\S+\.py:\d+\)/.test(head);
}

/**
 * The Python "state", as one of the JVM states the views already render.
 *
 * py-spy reports whether a thread is executing bytecode, not what it is
 * waiting for — there is no BLOCKED-on-a-monitor equivalent to read. So:
 *
 *   active  → RUNNABLE      it is running Python code
 *   idle    → WAITING       it is not, and py-spy cannot say why
 *
 * `idle` is the one worth being careful about. It does NOT mean the thread has
 * nothing to do: a thread inside `time.sleep`, a blocking socket read, or any
 * C call that releases the GIL reads as idle. Treating it as "nothing wrong"
 * is exactly the mistake the event-loop rule exists to catch, because a
 * stalled asyncio loop is reported idle.
 */
function stateOf(raw: string): { state: ThreadState; detail: string } {
  const active = /\bactive\b/.test(raw);
  return {
    state: active ? 'RUNNABLE' : 'WAITING',
    // Kept verbatim: `active+gil` says this thread holds the GIL, which is the
    // one thing in a Python dump that explains why the others are not running.
    detail: raw,
  };
}

/**
 * A frame's dotted name, built to look like the ones rules match against.
 *
 * `spin (th.py:5)` becomes `th.spin`; `_run_once (asyncio/base_events.py:1936)`
 * becomes `asyncio.base_events._run_once`. That shape is what lets one
 * vocabulary describe both runtimes — `^asyncio\.` reads exactly like
 * `^org\.springframework\.` and needs no Python-specific matching anywhere
 * else in the codebase.
 */
export function frameMethod(func: string, file: string): string {
  const mod = file
    .replace(/\.py$/, '')
    .replace(/^[./]+/, '')
    .replace(/\//g, '.');
  return mod ? `${mod}.${func}` : func;
}

/**
 * Standard library, or the interpreter itself.
 *
 * The `jdk` flag on a frame means "not the caller's code, at the runtime
 * level", and the views use it to grey a frame out. Python's stdlib is the
 * closest thing: `asyncio/`, `threading.py`, `socket.py`. Third-party packages
 * are handled by the shared library vocabulary instead, the same as Java's.
 */
const STDLIB = /^(asyncio|concurrent|collections|importlib|threading|socket|selectors|ssl|json|logging|http|urllib|queue|subprocess|multiprocessing|unittest|encodings|email|contextlib|functools|typing|abc|os|re|time)\b/;

export function parsePySpyDump(text: string): ThreadDump {
  const threads: ThreadInfo[] = [];
  let current: ThreadInfo | undefined;
  let jvm: string | undefined;
  let unparsed = 0;

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;

    const version = VERSION_LINE.exec(line);
    if (version) { jvm = `Python ${version[1]}`; continue; }

    const proc = PROCESS_LINE.exec(line);
    if (proc) { continue; }

    const head = THREAD_LINE.exec(line);
    if (head) {
      const [, tid, rawState, name] = head;
      const { state, detail } = stateOf(rawState);
      current = {
        name: name || `Thread ${tid}`,
        tid,
        // py-spy does not report daemon status. Saying `false` is a guess, and
        // the views only use it to count, so an honest zero beats a made-up
        // number.
        daemon: false,
        status: rawState,
        state,
        stateDetail: detail,
        frames: [],
        // py-spy reports no lock ownership; the field exists so the views can
        // read one shape for both runtimes.
        locked: [],
      };
      threads.push(current);
      continue;
    }

    const frame = FRAME_LINE.exec(line);
    if (frame && current) {
      const thread = current;
      const [, func, file, lineNo] = frame;
      const method = frameMethod(func, file);
      thread.frames.push({
        raw: line.trim(),
        method,
        file: file.split('/').pop(),
        line: Number(lineNo),
        jdk: STDLIB.test(method),
      });
      continue;
    }

    // Anything else — `--native` frames, `--locals` output, a truncated file.
    // Counted rather than dropped silently, so a dump we only half understand
    // says so.
    if (current) unparsed++;
  }

  return {
    threads, jvm, unparsedLines: unparsed,
    // A Python dump reports no deadlocks: there is no monitor graph to read.
    reportedDeadlocks: [],
  };
}
