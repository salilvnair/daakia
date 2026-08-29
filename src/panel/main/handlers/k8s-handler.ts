/**
 * dk8s handler — the extension-host side of the Kubernetes tab.
 *
 * Every message is a question about a cluster; none of them mutate one. The
 * only write dk8s ever performs is the detach-before-dump flow, which is not
 * part of M1.
 *
 * Selections are persisted through the settings store rather than webview
 * localStorage, because the host is what runs kubectl and it needs to know the
 * context without asking the UI for it on every call.
 */
import { probeEnvironment, setKubectlPath } from '../../../services/k8s/kubectl';
import {
  listContexts, checkReachable, listNamespaces, defaultNamespace, looksLikeProduction,
} from '../../../services/k8s/kube-context';
import { getSetting, setSetting } from '../../../storage/db';
import { watchPods, topPods, type WatchHandle } from '../../../services/k8s/k8s-watch';

type PostMessage = (msg: unknown) => void;

/** Persisted across sessions so the tab reopens where the user left it. */
export interface Dk8sState {
  context?: string;
  namespace?: string;
  /** context name -> sensitivity, set by the user and never inferred silently. */
  sensitivity?: Record<string, 'normal' | 'production'>;
  kubectlPath?: string;
}

function state(): Dk8sState {
  return getSetting<Dk8sState>('dk8s') ?? {};
}

function saveState(patch: Partial<Dk8sState>): Dk8sState {
  const next = { ...state(), ...patch };
  setSetting('dk8s', next);
  return next;
}

/**
 * Probe the environment: is kubectl here, is a context selected, does the
 * cluster answer. Everything the first-run screen needs in one round trip, so
 * the UI never has to render a half-known state.
 */
export async function handleDk8sProbe(postMessage: PostMessage): Promise<void> {
  const saved = state();
  if (saved.kubectlPath) setKubectlPath(saved.kubectlPath);

  const env = await probeEnvironment();
  if (!env.present) {
    postMessage({ type: 'dk8s:env', env, contexts: [], platform: process.platform });
    return;
  }

  const list = await listContexts();
  // Prefer what the user chose here before falling back to the kubeconfig's
  // current-context: dk8s never changes the global default, so the two can
  // legitimately differ and ours wins inside the tab.
  const chosen = saved.context && list.contexts.some(c => c.name === saved.context)
    ? saved.context
    : list.current;

  let reachable;
  let namespace = saved.namespace;
  if (chosen) {
    reachable = await checkReachable(chosen);
    if (!namespace) namespace = await defaultNamespace(chosen);
  }

  postMessage({
    type: 'dk8s:env',
    env,
    platform: process.platform,
    contexts: list.contexts,
    contextError: list.error,
    context: chosen,
    namespace,
    reachable,
    sensitivity: saved.sensitivity ?? {},
    // A context the user has not classified yet needs the one-time prompt.
    needsSensitivity: chosen ? !(saved.sensitivity ?? {})[chosen] : false,
    sensitivityGuess: chosen
      ? looksLikeProduction(chosen, list.contexts.find(c => c.name === chosen)?.cluster ?? '')
      : false,
  });
}

/** Select a context for this tab. Does NOT touch the global kubeconfig. */
export async function handleDk8sUseContext(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const context = String(msg.context ?? '');
  if (!context) return;

  const reachable = await checkReachable(context);
  const namespace = reachable.reachable ? await defaultNamespace(context) : undefined;
  saveState({ context, namespace });

  postMessage({ type: 'dk8s:contextSet', context, namespace, reachable });

  if (reachable.reachable) {
    await handleDk8sNamespaces({ context }, postMessage);
  }
}

export async function handleDk8sNamespaces(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const context = String(msg.context ?? state().context ?? '');
  if (!context) return;
  const result = await listNamespaces(context);
  postMessage({ type: 'dk8s:namespaces', context, ...result });
}

export function handleDk8sSetNamespace(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const namespace = String(msg.namespace ?? '');
  if (!namespace) return;
  saveState({ namespace });
  postMessage({ type: 'dk8s:namespaceSet', namespace });
  // The old namespace's watch is now pointing at the wrong place; move it.
  handleDk8sWatchPods({ namespace }, postMessage);
}

/** Record the user's answer to "is this production?". Never inferred. */
export function handleDk8sSetSensitivity(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const context = String(msg.context ?? '');
  const level = msg.level === 'production' ? 'production' : 'normal';
  if (!context) return;
  const sensitivity = { ...(state().sensitivity ?? {}), [context]: level } as Record<string, 'normal' | 'production'>;
  saveState({ sensitivity });
  postMessage({ type: 'dk8s:sensitivitySet', context, level });
}

// ── Live pod watch ──────────────────────────────────────────────────────────
//
// One watch and one metrics poller at a time. dk8s is a single tab holding a
// single namespace, so a second watch on the same namespace would double the
// load for nothing — and leaking the old one on every namespace switch is the
// easy bug to write here.

let activeWatch: WatchHandle | undefined;
let metricsTimer: NodeJS.Timeout | undefined;
let watchKey = '';

/**
 * The last thing the watch told us, kept so a reconnecting webview can be
 * caught up without restarting the stream.
 *
 * A webview reload does not restart the host, so the panel comes back and asks
 * to watch a namespace the host is ALREADY watching. Returning early there
 * looks like the right optimisation and leaves the new page empty forever,
 * because the snapshot it needed was delivered to the page that no longer
 * exists. Replaying is the fix.
 */
let lastSnapshot: unknown[] = [];
let lastStatus: 'connected' | 'reconnecting' | 'stopped' = 'stopped';
let lastStatusDetail: string | undefined;
let lastUsage: unknown = null;
let lastUsageAvailable = false;

const METRICS_INTERVAL_MS = 15_000;

function stopWatch(): void {
  activeWatch?.stop();
  activeWatch = undefined;
  if (metricsTimer) clearInterval(metricsTimer);
  metricsTimer = undefined;
  watchKey = '';
  lastSnapshot = [];
  lastStatus = 'stopped';
  lastStatusDetail = undefined;
  lastUsage = null;
  lastUsageAvailable = false;
}

export function handleDk8sWatchPods(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const saved = state();
  const context = String(msg.context ?? saved.context ?? '');
  const namespace = String(msg.namespace ?? saved.namespace ?? '');
  if (!context || !namespace) return;

  const key = `${context}/${namespace}`;
  if (key === watchKey && activeWatch) {
    // Already watching this exact namespace — almost always a webview reload.
    // Replay what we have instead of restarting the stream, so the fresh page
    // paints immediately and the cluster sees no extra load.
    postMessage({ type: 'dk8s:podSnapshot', context, namespace, pods: lastSnapshot });
    postMessage({ type: 'dk8s:watchStatus', context, namespace, status: lastStatus, detail: lastStatusDetail });
    if (lastUsageAvailable) {
      postMessage({ type: 'dk8s:podUsage', context, namespace, usage: lastUsage, available: true });
    }
    return;
  }
  stopWatch();
  watchKey = key;

  activeWatch = watchPods(context, namespace, {
    onSnapshot: (pods) => {
      lastSnapshot = pods;
      postMessage({ type: 'dk8s:podSnapshot', context, namespace, pods });
    },
    // Spread AFTER `type` would overwrite the message type with the watch
    // event's own ADDED/MODIFIED/DELETED and break routing entirely, so the
    // event kind travels under its own name.
    onEvent: (event) => postMessage({
      type: 'dk8s:podEvent', context, namespace,
      eventType: event.type, pod: event.pod,
    }),
    onStatus: (status, detail) => {
      lastStatus = status;
      lastStatusDetail = detail;
      postMessage({ type: 'dk8s:watchStatus', context, namespace, status, detail });
    },
  });

  // Metrics are polled rather than watched — there is no watch API for them.
  // Absent metrics-server is normal, so a null result hides the column instead
  // of reporting a failure the user cannot act on.
  const poll = async () => {
    const usage = await topPods(context, namespace);
    if (watchKey !== key) return;    // namespace changed while we were waiting
    lastUsage = usage;
    lastUsageAvailable = usage !== null;
    postMessage({ type: 'dk8s:podUsage', context, namespace, usage, available: usage !== null });
  };
  void poll();
  metricsTimer = setInterval(poll, METRICS_INTERVAL_MS);
}

export function handleDk8sStopWatch(): void {
  stopWatch();
}

/** Called when the panel goes away, so a watch cannot outlive its tab. */
export function disposeDk8s(): void {
  stopWatch();
}

/** Explicit kubectl path, for when it is installed somewhere unusual. */
export async function handleDk8sSetKubectlPath(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const path = String(msg.path ?? '').trim();
  setKubectlPath(path || undefined);
  saveState({ kubectlPath: path || undefined });
  await handleDk8sProbe(postMessage);
}
