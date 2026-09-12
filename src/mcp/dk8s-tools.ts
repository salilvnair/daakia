/**
 * dk8s, as tools an agent can call.
 *
 * The profiler lives in the window that holds the source. A model working on
 * this code can already read the repository; these tools let it read the
 * cluster the code is running on, and the recordings taken off it, in the same
 * conversation — so "why is checkout slow" and "here is the method" are the
 * same question rather than two tools and a copy-paste.
 *
 * ── What is deliberately NOT here ──
 *
 * Nothing that collects. No heap dump, no flight recording, no exec.
 *
 * Those are the actions dk8s makes a person confirm, and the confirmation is
 * the feature: a heap dump triggers a full GC and writes a file the size of
 * the live set, which can OOM-kill the pod it was taken from. A model deciding
 * on its own that a dump would be informative is exactly the situation the
 * confirmation exists to prevent, and "the agent did it" is not a thing anyone
 * can explain to whoever was paged.
 *
 * So: reading and analysis. Every tool here is a `kubectl get`/`logs`, or a
 * parse of a file that already exists. A model that wants a dump has to ask
 * for one out loud, and a person has to press the button.
 */
import { readFileSync } from 'fs';
import { run } from '../services/k8s/kubectl';
import { JfrChunk } from '../services/jfr/jfr-chunk';
import { readCpuSamples, hotSpots, sampleCount, idleCount } from '../services/jfr/jfr-cpu';
import { readTelemetry } from '../services/jfr/jfr-telemetry';
import { readWaits, readGc } from '../services/jfr/jfr-waits';
import { readAllocation } from '../services/jfr/jfr-allocation';
import { openSource } from './open-source';

export const DK8S_TOOLS = [
  {
    name: 'dk8s_pods',
    description: [
      'List pods in a Kubernetes namespace, with status, restart counts and age.',
      'Read-only. Use this to find the pod a question is about before reading its logs.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', description: 'kubectl context. Omit for the current one.' },
        namespace: { type: 'string', description: 'Namespace to list.' },
        problemsOnly: {
          type: 'boolean',
          description: 'Only pods that are not Running/Ready, or have restarted.',
        },
      },
      required: ['namespace'],
    },
  },
  {
    name: 'dk8s_logs',
    description: [
      'Read a pod\'s recent log lines. Read-only.',
      'Use `grep` to filter server-side over a larger window than you could read.',
      'For a crashlooping pod, `previous: true` reads the container before the current one,',
      'which is where the cause usually is.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string' },
        namespace: { type: 'string' },
        pod: { type: 'string' },
        container: { type: 'string' },
        tail: { type: 'number', description: 'Lines to read. Default 200, max 5000.' },
        sinceSeconds: { type: 'number' },
        previous: { type: 'boolean', description: 'The container before this one.' },
        grep: { type: 'string', description: 'Case-insensitive substring to keep.' },
      },
      required: ['namespace', 'pod'],
    },
  },
  {
    name: 'dk8s_describe_pod',
    description: 'Describe one pod — events, conditions, container states. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string' },
        namespace: { type: 'string' },
        pod: { type: 'string' },
      },
      required: ['namespace', 'pod'],
    },
  },
  {
    name: 'dk8s_analyze_recording',
    description: [
      'Analyze a JDK Flight Recording (.jfr) that already exists on disk.',
      'Returns CPU hot spots with self and total sample counts, lock contention with the',
      'method and the thread that held the lock, allocation sites with the line that',
      'allocated, GC pauses, and telemetry summaries.',
      'This is the only artifact that can name the line which allocated an object —',
      'a heap dump cannot, because jcmd and jmap write serial 0 for every object.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the .jfr file.' },
        view: {
          type: 'string',
          enum: ['summary', 'cpu', 'blocking', 'allocation', 'telemetry'],
          description: 'Which part to return. `summary` first — it says which of the others is worth asking for.',
        },
        limit: { type: 'number', description: 'Rows to return. Default 15.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'dk8s_open_source',
    description: [
      'Resolve a class or a stack frame to a file and a line in this workspace.',
      'Accepts `com.acme.Order`, `com.acme.Order.submit`, `Order.submit:42` and the',
      'parenthesised stack form. Where only a method is given, it finds the declaration.',
      'Use this after a hot spot, an allocation site or a lock finding to get from a',
      'name to the line you can actually change.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Class name, or a frame from any dk8s view.' },
        workspace: { type: 'string', description: 'Absolute path to search. Defaults to the working directory.' },
      },
      required: ['symbol'],
    },
  },
];

type Args = Record<string, unknown>;

const str = (a: Args, k: string): string | undefined =>
  (typeof a[k] === 'string' && a[k] ? String(a[k]) : undefined);
const numOf = (a: Args, k: string): number | undefined =>
  (typeof a[k] === 'number' ? (a[k] as number) : undefined);

/** Context and namespace, in the order every kubectl call wants them. */
function scope(a: Args): string[] {
  const ctx = str(a, 'context');
  const ns = str(a, 'namespace');
  return [...(ctx ? ['--context', ctx] : []), ...(ns ? ['-n', ns] : [])];
}

function bytes(v: number): string {
  if (v < 1024) return `${Math.round(v)} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  return `${(v / 1024 ** 3).toFixed(2)} GB`;
}

function ms(v: number): string {
  return v < 1000 ? `${v.toFixed(0)} ms` : `${(v / 1000).toFixed(1)} s`;
}

// ── Cluster ─────────────────────────────────────────────────────────────────

interface RawPod {
  metadata?: { name?: string };
  status?: {
    phase?: string;
    containerStatuses?: { ready?: boolean; restartCount?: number }[];
  };
}

export async function handleDk8sPods(a: Args): Promise<string> {
  const res = await run([...scope(a), 'get', 'pods', '-o', 'json'], { timeoutMs: 30_000 });
  if (!res.ok) return `kubectl failed: ${res.stderr.trim() || res.failure}`;

  const items: RawPod[] = JSON.parse(res.stdout).items ?? [];
  const rows = items.map(p => {
    const cs = p.status?.containerStatuses ?? [];
    const ready = cs.filter(c => c.ready).length;
    const restarts = cs.reduce((n, c) => n + (c.restartCount ?? 0), 0);
    return {
      name: p.metadata?.name ?? '?',
      phase: p.status?.phase ?? '?',
      ready: `${ready}/${cs.length}`,
      restarts,
      healthy: p.status?.phase === 'Running' && ready === cs.length && restarts === 0,
    };
  });

  const shown = a.problemsOnly ? rows.filter(r => !r.healthy) : rows;
  if (!shown.length) {
    return a.problemsOnly
      ? `All ${rows.length} pods are Running, ready, and have not restarted.`
      : 'No pods in that namespace.';
  }
  return [
    `${shown.length} of ${rows.length} pods:`,
    ...shown.map(r => `  ${r.name}  ${r.phase}  ready ${r.ready}  restarts ${r.restarts}`),
  ].join('\n');
}

export async function handleDk8sLogs(a: Args): Promise<string> {
  const pod = str(a, 'pod');
  if (!pod) return 'A pod name is required.';
  // Capped rather than trusted: an agent asking for a million lines gets a
  // useful answer instead of a timeout.
  const tail = Math.min(numOf(a, 'tail') ?? 200, 5000);
  const since = numOf(a, 'sinceSeconds');

  const res = await run([
    ...scope(a), 'logs', pod,
    ...(str(a, 'container') ? ['-c', String(a.container)] : []),
    ...(a.previous ? ['--previous'] : []),
    '--timestamps',
    ...(since ? [`--since=${since}s`] : []),
    `--tail=${tail}`,
  ], { timeoutMs: 60_000, maxBuffer: 32 * 1024 * 1024 });

  if (!res.ok) return `kubectl failed: ${res.stderr.trim() || res.failure}`;

  const grep = str(a, 'grep');
  let lines = res.stdout.split('\n').filter(Boolean);
  const scanned = lines.length;
  if (grep) {
    const needle = grep.toLowerCase();
    lines = lines.filter(l => l.toLowerCase().includes(needle));
  }
  if (!lines.length) {
    return grep
      ? `No line in the last ${scanned} matched "${grep}".`
      : 'That container has produced no log output.';
  }
  // Said plainly, so a model does not conclude the log ends here.
  const head = grep
    ? `${lines.length} of ${scanned} lines matched "${grep}":`
    : `Last ${lines.length} lines:`;
  return [head, ...lines].join('\n');
}

export async function handleDk8sDescribe(a: Args): Promise<string> {
  const pod = str(a, 'pod');
  if (!pod) return 'A pod name is required.';
  const res = await run([...scope(a), 'describe', 'pod', pod], { timeoutMs: 30_000 });
  return res.ok ? res.stdout : `kubectl failed: ${res.stderr.trim() || res.failure}`;
}

// ── Recordings ──────────────────────────────────────────────────────────────

export async function handleDk8sRecording(a: Args): Promise<string> {
  const file = str(a, 'path');
  if (!file) return 'A path to a .jfr file is required.';
  const view = str(a, 'view') ?? 'summary';
  const limit = Math.min(numOf(a, 'limit') ?? 15, 60);

  let chunks: JfrChunk[];
  try {
    chunks = JfrChunk.parseAll(readFileSync(file));
  } catch (e) {
    return `Could not read that recording: ${(e as Error).message}`;
  }
  if (!chunks.length) return 'That file contains no recording chunks.';

  const samples = readCpuSamples(chunks);
  const running = sampleCount(samples);
  const waiting = idleCount(samples);
  const wallMs = chunks.reduce((s, c) => s + Number(c.header.durationNanos / 1_000_000n), 0);

  if (view === 'cpu') {
    const rows = hotSpots(samples).slice(0, limit);
    if (!rows.length) return `No CPU samples caught running code in ${ms(wallMs)}. The application was not CPU-bound — ask for the blocking view.`;
    return [
      `CPU hot spots, from ${running} samples of running code over ${ms(wallMs)}.`,
      'self = the CPU was in this method; total = it was somewhere underneath.',
      ...rows.map(h =>
        `  ${h.selfPercent.toFixed(1)}% self  ${h.totalPercent.toFixed(1)}% total  `
        + `${h.method}${h.line >= 0 ? `:${h.line}` : ''}`),
    ].join('\n');
  }

  if (view === 'blocking') {
    const w = readWaits(chunks, { minMs: 1 });
    if (!w.sites.length) return 'Nothing blocked for long enough to be recorded.';
    return [
      `${ms(w.totalMs)} of thread time spent waiting across ${w.count} events, `
      + `over ${ms(w.wallMs)} of recording — about `
      + `${(w.totalMs / Math.max(1, w.wallMs)).toFixed(1)} threads blocked at any moment.`,
      ...w.sites.slice(0, limit).map(s =>
        `  ${ms(s.totalMs)}  ${s.kind}  ${s.target} at ${s.site}  (x${s.count}, longest ${ms(s.maxMs)})`
        + (s.blockedBy.length ? `  held by ${s.blockedBy.slice(0, 3).map(b => b.name).join(', ')}` : '')),
    ].join('\n');
  }

  if (view === 'allocation') {
    const al = readAllocation(chunks);
    if (!al.sites.length) return 'This recording carries no allocation samples.';
    return [
      `${bytes(al.totalBytes)} allocated, estimated from ${al.samples} samples.`,
      'These are the lines that allocated — a heap dump cannot give you this.',
      ...al.sites.slice(0, limit).map(s =>
        `  ${bytes(s.bytes)}  ${s.objectClass}  at ${s.site}  (x${s.samples})`),
    ].join('\n');
  }

  if (view === 'telemetry') {
    const t = readTelemetry(chunks);
    if (!t.series.length) return 'This recording carries no telemetry events.';
    return [
      `Telemetry over ${ms(wallMs)}:`,
      ...t.series.map(s => {
        const vs = s.points.map(p => p.v);
        const avg = vs.reduce((x, y) => x + y, 0) / vs.length;
        return `  ${s.group}/${s.label}  avg ${avg.toFixed(1)}  max ${Math.max(...vs).toFixed(1)}  ${s.unit}`;
      }),
    ].join('\n');
  }

  /*
    The summary exists to stop a model guessing which view to ask for.

    A recording of a blocked application has almost no CPU samples, so asking
    for hot spots first returns nothing and reads as "no problem here". Naming
    the shape up front points at the view that holds the answer.
  */
  const w = readWaits(chunks, { minMs: 1 });
  const al = readAllocation(chunks);
  const gc = readGc(chunks);
  const blockedThreads = w.totalMs / Math.max(1, wallMs);

  const shape = blockedThreads > 1
    ? 'This application spent its time BLOCKED, not running — start with the blocking view.'
    : running > 0
      ? 'This application was running code — start with the cpu view.'
      : 'Almost nothing ran and almost nothing blocked. The application was idle.';

  return [
    `Recording: ${ms(wallMs)}, ${chunks.length} chunk(s).`,
    shape,
    '',
    `CPU        ${running} samples of running code, ${waiting} more in a wait syscall`,
    `Blocking   ${ms(w.totalMs)} across ${w.count} events (~${blockedThreads.toFixed(1)} threads blocked at any moment)`,
    w.sites[0]
      ? `           worst: ${w.sites[0].target} at ${w.sites[0].site}` : '',
    `Allocation ${bytes(al.totalBytes)} from ${al.samples} samples`,
    al.sites[0] ? `           worst: ${al.sites[0].objectClass} at ${al.sites[0].site}` : '',
    `GC         ${gc.count} collections, ${ms(gc.totalPauseMs)} paused (${gc.pausePercent.toFixed(2)}% of the recording)`,
  ].filter(Boolean).join('\n');
}

export async function handleDk8sOpenSource(a: Args): Promise<string> {
  const symbol = str(a, 'symbol');
  if (!symbol) return 'A symbol is required — a class name or a stack frame.';
  const root = str(a, 'workspace') ?? process.cwd();

  const { hits, note } = openSource(root, symbol);
  if (!hits.length) return note ?? `Could not resolve ${symbol}.`;

  return [
    ...hits.map(h => `${h.relative}${h.line ? `:${h.line}` : ''}`
      + (h.preview ? `\n    ${h.preview}` : '')),
    ...(note ? ['', note] : []),
  ].join('\n');
}

/** Dispatch, or `undefined` when the name is not one of ours. */
export function dk8sTool(name: string): ((a: Args) => Promise<string>) | undefined {
  switch (name) {
    case 'dk8s_pods': return handleDk8sPods;
    case 'dk8s_logs': return handleDk8sLogs;
    case 'dk8s_describe_pod': return handleDk8sDescribe;
    case 'dk8s_analyze_recording': return handleDk8sRecording;
    case 'dk8s_open_source': return handleDk8sOpenSource;
    default: return undefined;
  }
}
