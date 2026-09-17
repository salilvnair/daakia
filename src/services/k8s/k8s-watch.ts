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
import { clusterTimeoutMs } from './k8s-timeouts';
import { podsTable } from './pods-table';
import { resolveWorkload } from './workload';

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
  /**
   * True when this came from a table row rather than from the pod's JSON.
   *
   * A row is what makes the grid appear at terminal speed, and it cannot carry
   * the uid, the owning workload, the images or the per-container detail. The
   * flag exists so nothing downstream reads a field a row never had as a field
   * the cluster said was empty. It is gone the moment the full snapshot lands.
   */
  partial?: boolean;
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

  /*
    Prefer a live reason, then the reason the last run ended, then the pod's.

    `Completed` and `Unknown` are both dropped, for the same reason: neither
    tells anybody anything, and both replace the phase on the card. A pod that
    is up reading `Unknown` looks like dk8s failed to work out its state — and
    `Unknown` is exactly what a kubelet reports for a container it lost track
    of across a node or runtime restart, so every pod on a machine that was
    rebooted wore it.
  */
  const uninformative = (r: string | undefined) =>
    !r || r === 'Completed' || r === 'Unknown';
  const reason =
    containers.find(c => c.reason)?.reason ??
    containers.find(c => !uninformative(c.lastReason))?.lastReason ??
    status.reason;

  const deleting = !!meta.deletionTimestamp;
  const phase = deleting ? 'Terminating' : (status.phase ?? 'Unknown');

  /* See workload.ts: the first owner is rarely the thing anybody calls it,
     and both of the generated middles carry a suffix that changes. */
  const workload = resolveWorkload(meta.ownerReferences?.[0]);

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
  /**
   * Read the namespace again, now, without disturbing the stream.
   *
   * What pressing Refresh does — the same `kubectl get pods` somebody would
   * run in a terminal. It exists because a watch can be alive and deaf (see
   * `RECONCILE_MS`), and because "is this list current?" is a question people
   * want answered on their own schedule rather than on a timer's.
   */
  refresh: () => void;
}

export interface WatchCallbacks {
  onSnapshot: (pods: PodSummary[]) => void;
  onEvent: (event: WatchEvent) => void;
  /** connected / reconnecting / stopped — the grid must never look silently stale. */
  onStatus: (status: 'connected' | 'reconnecting' | 'stopped', detail?: string) => void;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * How often the watch is checked against reality.
 *
 * ── The failure this exists for ──
 *
 * A `kubectl get --watch` can be alive and deaf. It reconnects internally when
 * the API server closes a watch normally, so the process staying up is not
 * evidence of anything — and when the connection breaks in a way TCP does not
 * notice (a laptop that slept, a Docker Desktop restart, a VPN that dropped
 * and came back) kubectl sits there receiving nothing, forever, while dk8s
 * reports "watching".
 *
 * Found exactly that way: a watch process five hours old, parented to the
 * running server, that had not delivered an event in hours. Pods created in
 * the namespace never appeared, and nothing on screen said why.
 *
 * Silence alone is not proof — a quiet namespace is quiet for hours at a time.
 * So this asks the cluster instead, with the cheap table call, and compares
 * what is really there against what the watch has delivered. The two agreeing
 * is the only evidence that a silent watch is healthy.
 */
const RECONCILE_MS = 60_000;

/**
 * Does the watch still describe the namespace?
 *
 * By name and only by name. Everything else about a pod changes every few
 * seconds — phase, restarts, readiness — and telling us about those is the
 * watch's whole job; comparing them would make this a second, slower watch.
 * The question here is narrower and has a yes-or-no answer: does the namespace
 * hold the pods the stream thinks it does. A pod that appeared or disappeared
 * without an event is proof the stream is deaf, and nothing else needs
 * checking to know it.
 */
export function watchAgrees(known: Set<string>, real: string[]): boolean {
  if (real.length !== known.size) return false;
  return real.every(name => known.has(name));
}

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
  /** What the watch believes is in the namespace, by pod name. */
  let known = new Set<string>();
  let reconcile: NodeJS.Timeout | undefined;
  let retryTimer: NodeJS.Timeout | undefined;

  /**
   * List the namespace and hand the result to the grid.
   *
   * Shared by the watch's own start and by Refresh, so a manual re-read is
   * the same read — one code path means the two cannot come to different
   * answers about the same namespace.
   */
  const relist = async (paintFast = true): Promise<boolean> => {
    if (stopped) return false;

    /*
      Two lists, sent together, and the cheap one paints first.

      `get pods -o json` asks for every pod in full — roughly 10 KB each, where
      the row a terminal prints is 62 bytes. That is why the same namespace
      comes back in a second or two in PowerShell and left this grid empty for
      half a minute across a VPN: not a slower cluster, a payload two orders of
      magnitude larger.

      The JSON is still needed — the workload badge, the container states, the
      images and the uid only exist there. It just does not have to be what the
      reader waits on. The table is served by the API server's own Table
      endpoint, comes back in the time the terminal takes, and fills the grid;
      the JSON replaces it when it lands.

      In parallel, not in sequence: the table is a few hundred bytes and adds
      no measurable delay to the JSON, so the full answer is no later than it
      was before and the first one is far earlier.
    */
    /* On a fast link the JSON can win the race, and a table landing after it
       would replace a full snapshot with a partial one — the grid would lose
       its badges and images a moment after drawing them. */
    let full = false;

    /*
      The table is for the FIRST paint, and only for that.

      On a refresh the grid already holds full rows, and a partial snapshot
      landing in front of the JSON replaces them with rows that have no
      workload badge and no image — which come back a moment later. That is
      not a head start, it is a flicker: the reader watches the screen get
      worse and then recover, for no gain, because there was never an empty
      grid to fill.
    */
    const fast = paintFast
      ? podsTable(context, namespace).then((table) => {
        if (stopped || full || !table.pods.length) return;
        cb.onSnapshot(table.pods);
      }).catch(() => { /* the JSON below is the real answer; this was a head start */ })
      : Promise.resolve();

    const listed = await run(
      ['--context', context, '-n', namespace, 'get', 'pods', '-o', 'json'],
      { timeoutMs: clusterTimeoutMs() },
    );
    void fast;
    if (stopped) return false;

    if (!listed.ok) {
      cb.onStatus('reconnecting', firstLine(listed.stderr) || listed.failure);
      return false;
    }

    try {
      const items: RawPod[] = JSON.parse(listed.stdout).items ?? [];
      full = true;
      const summaries = items.map(toPodSummary);
      /* What the watch is now accountable for. Every reconcile compares the
         cluster against this. */
      known = new Set(summaries.map(p => p.name));
      cb.onSnapshot(summaries);
    } catch (err) {
      cb.onStatus('reconnecting', `could not parse pod list: ${(err as Error).message}`);
      return false;
    }
    return true;
  };

  const start = async () => {
    if (stopped) return;
    if (!(await relist())) { schedule(); return; }
    if (stopped) return;

    /*
      `--watch-only`, because the list above already happened.

      Without it `kubectl get --watch` replays the entire current state as
      ADDED events before it starts watching — the same objects, in full, that
      the call directly above just fetched. Every pod list was therefore paid
      for twice on every watch start and every reconnect.

      It is not a rounding error. `get pods -o json` is roughly 10 KB per pod
      against 62 bytes for the row `kubectl get pods` prints, so a namespace of
      a hundred and fifty pods was moving about 3 MB where 1.5 MB would do —
      and across a VPN that is the difference between a pod list and a
      stopwatch. Measured on a four-pod namespace: 23,372 bytes replayed by
      `--watch`, 0 by `--watch-only`.
    */
    child = await spawnKubectl([
      '--context', context, '-n', namespace,
      'get', 'pods', '-o', 'json', '--watch-only', '--output-watch-events',
    ]);
    if (stopped) { child.kill(); return; }

    cb.onStatus('connected');
    backoff = 1_000;
    startReconcile();

    const feed = createJsonObjectSplitter((value) => {
      const evt = value as { type?: string; object?: RawPod };
      // --output-watch-events wraps each object as {type, object}. Without the
      // flag kubectl emits the bare object, so handle both rather than
      // depending on a flag that is not in every kubectl.
      const type = (evt?.type ?? 'MODIFIED') as WatchEventType;
      const raw = evt?.object ?? (value as RawPod);
      if (!raw?.metadata) return;
      const pod = toPodSummary(raw);
      if (type === 'DELETED') known.delete(pod.name); else known.add(pod.name);
      cb.onEvent({ type, pod });
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

  /*
    Ask the cluster what is really there, and restart a watch that disagrees.

    The comparison is by name and only by name. Everything else about a pod
    changes constantly — phase, restarts, readiness — and the watch is supposed
    to be the thing that tells us about those; the question here is narrower
    and answerable: does the namespace hold the pods the watch thinks it does.
    A pod appearing or disappearing without an event is proof the stream is
    deaf, and nothing else needs to be compared to know it.

    It costs a table call a minute — a few hundred bytes — which is what makes
    it affordable to run forever. Before the pod list was served by the Table
    endpoint this check would itself have been a download.
  */
  const startReconcile = () => {
    if (reconcile) clearInterval(reconcile);
    reconcile = setInterval(() => void (async () => {
      if (stopped || !child) return;
      const table = await podsTable(context, namespace);
      if (stopped || table.error) return;

      if (watchAgrees(known, table.pods.map(p => p.name))) return;

      /* Say so rather than quietly healing. A watch that went deaf is worth
         a line in the status, because the reader was looking at a stale grid
         until this moment and has no other way to know that. */
      cb.onStatus('reconnecting', 'the watch missed a change — re-reading');
      child?.kill();
    })(), RECONCILE_MS);
  };

  const schedule = () => {
    if (stopped) return;
    retryTimer = setTimeout(start, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  };

  void start();

  return {
    /*
      A re-read on demand, leaving the stream where it is.

      Not a restart: the watch may be perfectly healthy and somebody may simply
      want to know the list is current — and tearing down a working stream to
      answer that would drop every pod on screen for a second. The reconcile
      below is what deals with a stream that has actually gone deaf.
    */
    refresh: () => { void relist(false); },
    stop: () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      /* The reconcile outlives the child otherwise, and would keep asking the
         cluster about a namespace nobody is watching. */
      if (reconcile) clearInterval(reconcile);
      reconcile = undefined;
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
    /* Metrics are a nicety: bounded by the same setting, never longer.
       Marked as a poll — nobody pressed anything to make this run, and it
       runs again every fifteen seconds for as long as the namespace is
       watched. */
    { timeoutMs: Math.min(15_000, clusterTimeoutMs()), background: true },
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
