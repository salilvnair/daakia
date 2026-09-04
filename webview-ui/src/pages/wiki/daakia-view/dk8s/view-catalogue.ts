/**
 * Every view dk8s has, and the artifact each one needs.
 *
 * The problem this exists to solve is not documentation, it is discovery. Each
 * analyzer only shows its own tabs, so the GC table is invisible unless you
 * happen to open a `.jfr`, and the locks graph is invisible unless you open a
 * thread dump that happens to be contended. Nothing anywhere lists what the
 * tool can do — you have to already know that GC lives behind a recording
 * before you would think to collect one.
 *
 * JProfiler shows every viewer in one tree and greys out what the current
 * session cannot answer, and that list is how people learn what the tool has.
 * This is that list.
 *
 * It is DATA rather than prose so the page cannot drift from the product: a
 * test asserts these ids against the tab definitions the analyzers actually
 * render, so deleting a view or renaming a tab fails the build rather than
 * quietly leaving a wiki page describing something that no longer exists.
 */

export type ArtifactKind = 'recording' | 'heap' | 'threads' | 'logs' | 'mcp';

export interface CatalogueEntry {
  /** The tab id the analyzer uses, or the tool name for MCP. */
  id: string;
  /** What the tab is labelled in the product. */
  label: string;
  /** The question this view answers. Not what it displays — what it settles. */
  answers: string;
  needs: ArtifactKind;
  /** True when nothing else in dk8s can answer this question. */
  only?: boolean;
}

export const ARTIFACT_LABEL: Record<ArtifactKind, string> = {
  recording: 'Flight recording (.jfr)',
  heap: 'Heap dump (.hprof)',
  threads: 'Thread dump (jstack or py-spy)',
  logs: 'Logs',
  mcp: 'MCP — driven by an agent, not a click',
};

export const ARTIFACT_HOW: Record<ArtifactKind, string> = {
  recording: 'Doctor → Flight recording, or Artifacts → Analyze on a .jfr',
  heap: 'Doctor → Heap dump, or Artifacts → Analyze on a .hprof',
  threads: 'Doctor → Thread dump, or Artifacts → Analyze on a .txt',
  logs: 'Pod → Logs, or Artifacts → Analyze on an archived log',
  mcp: 'Point Copilot or Claude at the dk8s MCP server',
};

export const CATALOGUE: CatalogueEntry[] = [
  // ── Flight recording ──────────────────────────────────────────────────────
  {
    id: 'telemetry', label: 'Telemetry', needs: 'recording',
    answers: 'CPU, heap, threads, classes, GC pause and allocation rate over the whole recording — the timeline every other view is read against.',
  },
  {
    id: 'hotspots', label: 'Hot spots', needs: 'recording',
    answers: 'Which methods the CPU was actually inside, with the stacks that got there. Idle syscall frames are excluded and counted, so a parked pool does not read as 88% busy.',
  },
  {
    id: 'calltree', label: 'Call tree', needs: 'recording',
    answers: 'The same samples kept as PATHS rather than flattened. A utility called from six places is six rows here and one row in Hot spots, and only one of those says which caller is responsible.',
  },
  {
    id: 'callgraph', label: 'Call graph', needs: 'recording',
    answers: 'One node per method with every caller and callee attached. The question a tree answers badly, because the callers of a shared method are scattered across branches that never meet.',
  },
  {
    id: 'blocking', label: 'Blocking', needs: 'recording',
    answers: 'Where threads went when they were not running, totalled per lock and per site. The answer for an application that spends its life waiting, which produces almost no CPU samples.',
  },
  {
    id: 'allocation', label: 'Allocation', needs: 'recording',
    answers: 'Which line made the garbage. A heap dump can say what is leaking; only a recording carries the allocation stack.',
    only: true,
  },
  {
    id: 'threads', label: 'Thread history', needs: 'recording',
    answers: 'Whether threads blocked TOGETHER. Lanes on a shared clock separate "queueing on one lock" from "just busy", which need opposite fixes and which a single dump cannot tell apart.',
    only: true,
  },
  {
    id: 'classes', label: 'Classes', needs: 'recording',
    answers: 'Instances per class across the recording’s censuses — which class is not coming back down. A heap dump cannot answer this: one photograph has no direction. Needs jdk.ObjectCount, which is off even at settings=profile.',
  },
  {
    id: 'gc', label: 'GC', needs: 'recording',
    answers: 'Every collection with its cause, the heap either side and the phases inside the pause. A full GC that takes 1.2s and frees 2 MB is a whole diagnosis in one row.',
  },
  {
    id: 'probes', label: 'Probes', needs: 'recording',
    answers: 'What the process talked to — sockets and files grouped by endpoint, with bytes and the slowest call. A four-second read on postgres:5432 answers most of what a JDBC probe would.',
  },

  {
    id: 'events', label: 'Events', needs: 'recording',
    answers: 'Every event type the JVM wrote, with the raw rows behind any of them. The other tabs read nine types and summarise; this is the rest, uninterpreted — and the honest answer to whether a given event is supported.',
  },

  // ── Heap dump ─────────────────────────────────────────────────────────────
  {
    id: 'verdict', label: 'Verdict', needs: 'heap',
    answers: 'The leak stated as a sentence, with what is accumulating, what holds it, and where it lives in your code. Thirteen framework-aware rules.',
  },
  {
    id: 'histogram', label: 'Histogram', needs: 'heap',
    answers: 'Every class by instance count, shallow size and retained size, searchable and narrowable.',
  },
  {
    id: 'treemap', label: 'Treemap', needs: 'heap',
    answers: 'The heap by package as ranked bars, a treemap or a sunburst. Bars are the default because area cannot show a heap that is 98% one class.',
  },
  {
    id: 'graph', label: 'Retention', needs: 'heap',
    answers: 'The dominator tree: who would free what. Click a node for what it keeps alive by class, which is the question the tree exists to answer.',
  },
  {
    id: 'growth', label: 'Growth', needs: 'heap',
    answers: 'What changed between two dumps. JProfiler needs a live agent attached for this; two files on disk are enough here.',
    only: true,
  },
  {
    id: 'explain', label: 'Explain', needs: 'heap',
    answers: 'The dump handed to AI as redacted evidence — class names and sizes, never object contents.',
  },

  // ── Thread dump ───────────────────────────────────────────────────────────
  {
    id: 'findings', label: 'Findings', needs: 'threads',
    answers: 'Ranked rules over the whole dump: pool starvation, a transaction held across a network call, a blocking call on an event loop — each naming a file and a line where it can.',
  },
  {
    id: 'locks', label: 'Locks', needs: 'threads',
    answers: 'Who holds the monitor and who is queued behind it. Only appears when something is actually contended — a healthy dump has no graph to draw.',
    only: true,
  },
  {
    id: 'states', label: 'Thread states', needs: 'threads',
    answers: 'The state ribbon and the pools: how many runnable, waiting, blocked, and whether the pool is busy or merely full.',
  },
  {
    id: 'merged', label: 'Merged stacks', needs: 'threads',
    answers: 'Every stack collapsed into a flame graph, so ten threads parked in the same place read as one plateau rather than ten rows.',
  },

  // ── Logs ──────────────────────────────────────────────────────────────────
  {
    id: 'volume', label: 'Volume over time', needs: 'logs',
    answers: 'Line rate with errors in red — where the incident starts, before reading a single line.',
  },
  {
    id: 'exceptions', label: 'Exceptions', needs: 'logs',
    answers: 'Stack traces grouped by type and message, counted, so one exception thrown 4,000 times is one row.',
  },
  {
    id: 'shapes', label: 'Message shapes', needs: 'logs',
    answers: 'Log lines clustered by template, which turns a million lines into the dozen distinct things the service says.',
  },

  // ── MCP ───────────────────────────────────────────────────────────────────
  {
    id: 'dk8s_pods', label: 'dk8s_pods', needs: 'mcp',
    answers: 'List pods with status and restarts.',
  },
  {
    id: 'dk8s_logs', label: 'dk8s_logs', needs: 'mcp',
    answers: 'Read a pod log, with the same windowing the panel uses.',
  },
  {
    id: 'dk8s_describe_pod', label: 'dk8s_describe_pod', needs: 'mcp',
    answers: 'Events, conditions and container state for one pod.',
  },
  {
    id: 'dk8s_analyze_recording', label: 'dk8s_analyze_recording', needs: 'mcp',
    answers: 'Hot spots, allocation and waits out of a .jfr already on disk.',
  },
  {
    id: 'dk8s_open_source', label: 'dk8s_open_source', needs: 'mcp',
    answers: 'A class or a stack frame resolved to a file and a line in this workspace. The tool a profiler outside the editor structurally cannot have.',
    only: true,
  },
];

export function byArtifact(kind: ArtifactKind): CatalogueEntry[] {
  return CATALOGUE.filter(e => e.needs === kind);
}

export const ARTIFACT_ORDER: ArtifactKind[] = ['recording', 'heap', 'threads', 'logs', 'mcp'];
