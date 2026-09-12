/**
 * A live view of the pods in one namespace.
 *
 * Polling every few seconds is the obvious approach and it is wrong twice over:
 * it misses states that appear and vanish between polls (a pod that restarts
 * twice in ten seconds looks untouched), and it costs a full list every time.
 * `--watch` streams a delta per change instead.
 *
 * The thing that matters most here is not the happy path. A watch dies quietly:
 * idle timeouts, token expiry, an API server rolling. When it does, the grid
 * keeps rendering the last thing it saw and looks perfectly healthy while being
 * completely stale — the worst failure a live view can have. So every exit is
 * reported, and the caller shows connection state rather than a silent list.
 */
import type { ChildProcess } from 'child_process';
import { run, spawnKubectl, createJsonObjectSplitter } from './kubectl';

export interface ContainerSummary {
  name: string;
  ready: boolean;
  restarts: number;
  image: string;
  /** Waiting/terminated reason — CrashLoopBackOff, OOMKilled, and so on. */
  reason?: string;
  /** Why the PREVIOUS run ended. This is where OOMKilled usually shows up. */
  lastReason?: string;
}

export interface PodSummary {
  name: string;
  namespace: string;
  uid: string;
  phase: string;
  /** The reason people actually look at, not the phase. */
  reason?: string;
  ready: { current: number; total: number };
  restarts: number;
  /**
   * When the most recent restart happened.
   *
   * A restart count on its own is close to useless — a long-lived pod
   * accumulates restarts from incidents nobody remembers. "3 restarts, most
   * recently 4 minutes ago" is the sentence that makes you look.
   */
  lastRestartAt?: string;
  startedAt?: string;
  node?: string;
  containers: ContainerSummary[];
  workload?: { kind: string; name: string };
  image?: string;
  /** True when the pod is Ready and nothing is waiting or terminating. */
  healthy: boolean;
  deleting: boolean;
}

export type WatchEventType = 'ADDED' | 'MODIFIED' | 'DELETED';

export interface WatchEvent {
  type: WatchEventType;
  pod: PodSummary;
}

type RawPod = Record<string, any>;

/** Map the API object down to what the grid needs. */
export function toPodSummary(raw: RawPod): PodSummary {
  const meta = raw.metadata ?? {};
  const status = raw.status ?? {};
  const spec = raw.spec ?? {};
  const statuses: RawPod[] = status.containerStatuses ?? [];

  const containers: ContainerSummary[] = statuses.map(c => ({
    name: c.name,
    ready: !!c.ready,
    restarts: c.restartCount ?? 0,
    image: c.image ?? '',
    reason: c.state?.waiting?.reason ?? c.state?.terminated?.reason,
    lastReason: c.lastState?.terminated?.reason,
  }));

  // The most recent restart across all containers.
  let lastRestartAt: string | undefined;
  for (const c of statuses) {
    const at = c.lastState?.terminated?.finishedAt;
    if (at && (!lastRestartAt || at > lastRestartAt)) lastRestartAt = at;
  }

  const restarts = containers.reduce((n, c) => n + c.restarts, 0);
  const readyCount = containers.filter(c => c.ready).length;
  const total = containers.length || (spec.containers?.length ?? 1);

  // Prefer a live reason, then the reason the last run ended, then the pod's.
  const reason =
    containers.find(c => c.reason)?.reason ??
    containers.find(c => c.lastReason && c.lastReason !== 'Completed')?.lastReason ??
    status.reason;

  const deleting = !!meta.deletionTimestamp;
  const phase = deleting ? 'Terminating' : (status.phase ?? 'Unknown');

  const owner = meta.ownerReferences?.[0];
  const workload = owner
    ? {
        kind: owner.kind === 'ReplicaSet' ? 'Deployment' : owner.kind,
        name: owner.kind === 'ReplicaSet'
          ? String(owner.name).replace(/-[a-z0-9]{6,10}$/, '')
          : owner.name,
      }
    : undefined;

  return {
    name: meta.name ?? '?',
    namespace: meta.namespace ?? '',
    uid: meta.uid ?? meta.name ?? '?',
    phase,
    reason,
    ready: { current: readyCount, total },
    restarts,
    lastRestartAt,
    startedAt: status.startTime,
    node: spec.nodeName,
    containers,
    workload,
    image: spec.containers?.[0]?.image,
    healthy: !deleting && phase === 'Running' && readyCount === total && !reason,
    deleting,
  };
}

export interface WatchHandle {
  stop: () => void;
}

export interface WatchCallbacks {
  onSnapshot: (pods: PodSummary[]) => void;
  onEvent: (event: WatchEvent) => void;
  /** connected / reconnecting / stopped — the grid must never look silently stale. */
  onStatus: (status: 'connected' | 'reconnecting' | 'stopped', detail?: string) => void;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * Watch one namespace until stopped.
 *
 * A snapshot goes first so the grid paints immediately, then deltas. On a
 * dropped stream it re-lists and re-watches with backoff, because a watch
 * resumed from a stale resourceVersion can be rejected outright — a fresh list
 * is cheap and always correct.
 */
export function watchPods(
  context: string,
  namespace: string,
  cb: WatchCallbacks,
): WatchHandle {
  let child: ChildProcess | undefined;
  let stopped = false;
  let backoff = 1_000;
  let retryTimer: NodeJS.Timeout | undefined;

  const start = async () => {
    if (stopped) return;

    // List first. Also proves we can read pods at all before opening a stream
    // that would otherwise fail silently in the background.
    const listed = await run(
      ['--context', context, '-n', namespace, 'get', 'pods', '-o', 'json'],
      { timeoutMs: 30_000 },
    );
    if (stopped) return;

    if (!listed.ok) {
      cb.onStatus('reconnecting', firstLine(listed.stderr) || listed.failure);
      schedule();
      return;
    }

    try {
      const items: RawPod[] = JSON.parse(listed.stdout).items ?? [];
      cb.onSnapshot(items.map(toPodSummary));
    } catch (err) {
      cb.onStatus('reconnecting', `could not parse pod list: ${(err as Error).message}`);
      schedule();
      return;
    }

    child = await spawnKubectl([
      '--context', context, '-n', namespace,
      'get', 'pods', '-o', 'json', '--watch', '--output-watch-events',
    ]);
    if (stopped) { child.kill(); return; }

    cb.onStatus('connected');
    backoff = 1_000;

    const feed = createJsonObjectSplitter((value) => {
      const evt = value as { type?: string; object?: RawPod };
      // --output-watch-events wraps each object as {type, object}. Without the
      // flag kubectl emits the bare object, so handle both rather than
      // depending on a flag that is not in every kubectl.
      const type = (evt?.type ?? 'MODIFIED') as WatchEventType;
      const raw = evt?.object ?? (value as RawPod);
      if (!raw?.metadata) return;
      cb.onEvent({ type, pod: toPodSummary(raw) });
    });

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', feed);

    let stderrTail = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (d: string) => { stderrTail = (stderrTail + d).slice(-500); });

    child.on('exit', (code) => {
      child = undefined;
      if (stopped) return;
      // A watch ending is normal and still must be visible: an unlabelled
      // quiet list is indistinguishable from a healthy one.
      cb.onStatus('reconnecting', firstLine(stderrTail) || `watch ended (exit ${code})`);
      schedule();
    });
    child.on('error', (err) => {
      child = undefined;
      if (stopped) return;
      cb.onStatus('reconnecting', err.message);
      schedule();
    });
  };

  const schedule = () => {
    if (stopped) return;
    retryTimer = setTimeout(start, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  };

  void start();

  return {
    stop: () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      child?.kill();
      child = undefined;
      cb.onStatus('stopped');
    },
  };
}

export interface PodUsage {
  name: string;
  cpuMilli: number;
  memBytes: number;
}

/**
 * Per-pod CPU and memory, when metrics-server is installed.
 *
 * Its absence is normal, not an error — the fixture cluster this was built
 * against has none — so a failure here returns null and the caller hides the
 * column rather than reporting a problem the user cannot fix.
 */
export async function topPods(context: string, namespace: string): Promise<PodUsage[] | null> {
  const res = await run(
    ['--context', context, '-n', namespace, 'top', 'pods', '--no-headers'],
    { timeoutMs: 15_000 },
  );
  if (!res.ok) return null;

  const out: PodUsage[] = [];
  for (const line of res.stdout.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [name, cpu, mem] = parts;
    out.push({ name, cpuMilli: parseCpu(cpu), memBytes: parseMem(mem) });
  }
  return out;
}

/** `250m` or `1` (whole cores). */
function parseCpu(v: string): number {
  if (v.endsWith('m')) return parseInt(v, 10) || 0;
  const cores = parseFloat(v);
  return Number.isFinite(cores) ? Math.round(cores * 1000) : 0;
}

/** `128Mi`, `1Gi`, `512Ki` — kubectl top uses binary units. */
function parseMem(v: string): number {
  const m = /^([\d.]+)\s*([KMGT]?i?)$/.exec(v.trim());
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2];
  const scale: Record<string, number> = {
    '': 1, Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4,
    K: 1000, M: 1000 ** 2, G: 1000 ** 3, T: 1000 ** 4,
  };
  return Math.round(n * (scale[unit] ?? 1));
}

function firstLine(s: string): string {
  return (s || '').split('\n').map(l => l.trim()).filter(Boolean)[0] ?? '';
}
