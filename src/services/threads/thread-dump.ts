/**
 * One entry point for a thread dump, whatever runtime produced it.
 *
 * Callers have a file and a question — what are these threads doing — and
 * should not have to know which runtime wrote it before they can ask. The
 * alternative is every call site sniffing the text and picking a parser, which
 * is how the Python path came to be detected in exactly one handler, purely so
 * it could apologise for not being supported.
 *
 * Dispatch is on CONTENT, never on the file extension or the artifact name.
 * A `py-spy dump` and a `jstack` both land in a `.txt`, dk8s names both
 * `…__threaddump__…`, and an imported file has whatever name someone gave it.
 */
import { parseThreadDump, type ThreadDump } from './jstack-parser';
import { isPySpyDump, parsePySpyDump } from './pyspy-parser';

/** Which runtime a dump came from, for the UI to label honestly. */
export type DumpRuntime = 'jvm' | 'python';

export interface AnyThreadDump extends ThreadDump {
  runtime: DumpRuntime;
}

export function parseAnyThreadDump(text: string): AnyThreadDump {
  if (isPySpyDump(text)) {
    return { ...parsePySpyDump(text), runtime: 'python' };
  }
  return { ...parseThreadDump(text), runtime: 'jvm' };
}
