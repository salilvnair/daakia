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
  /** The context the pickers default to, and the one namespaces are listed from. */
  context?: string;
  namespace?: string;
  /** Clusters the user ticked. Empty means "just `context`". */
  contexts?: string[];
  /** Everything currently being watched, as (context, namespace) pairs. */
  targets?: WatchTarget[];
  /** context name -> sensitivity, set by the user and never inferred silently. */
  sensitivity?: Record<string, 'normal' | 'production'>;
  kubectlPath?: string;
  /**
   * context name -> namespaces the user pinned by hand.
   *
   * Listing namespaces is a cluster-scoped read many clusters refuse, so on
   * those the only way in is to type the name. Remembering what was typed is
   * the difference between that being a workaround and being the normal way
   * to use the tool. Pins are useful even when listing works: a cluster with
   * 200 namespaces is a list you scroll, not a list you read.
   */
  pinnedNamespaces?: Record<string, string[]>;
}

export interface WatchTarget {
  context: string;
  namespace: string;
}

/** Stable key for a target, used for watch bookkeeping and pod identity. */
export function targetKey(t: WatchTarget): string {
  return `${t.context}/${t.namespace}`;
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
    pinned: chosen ? pinnedFor(chosen) : [],
    selectedContexts: saved.contexts ?? (chosen ? [chosen] : []),
    targets: saved.targets ?? (chosen && namespace ? [{ context: chosen, namespace }] : []),
    // A context the user has not classified yet needs the one-time prompt.
    needsSensitivity: chosen ? !(saved.sensitivity ?? {})[chosen] : false,
    sensitivityGuess: chosen
      ? looksLikeProduction(chosen, list.contexts.find(c => c.name === chosen)?.cluster ?? '')
      : false,
  });
}

/**
 * Select one or more clusters.
 *
 * Reachability is checked per context and reported per context, because "one
 * of your four clusters is behind a VPN you have not connected" is a specific
 * and fixable thing to be told, and a single combined failure is not.
 */
export async function handleDk8sUseContexts(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const contexts = (Array.isArray(msg.contexts) ? msg.contexts : [])
    .map(c => String(c)).filter(Boolean);
  if (!contexts.length) return;

  saveState({ contexts, context: contexts[0] });

  const results = await Promise.all(contexts.map(async (context) => ({
    context,
    reachable: await checkReachable(context),
  })));

  postMessage({ type: 'dk8s:contextsSet', contexts, results });

  // List namespaces for every reachable cluster, so the next screen can offer
  // all of them at once rather than one cluster at a time.
  await handleDk8sNamespacesFor(
    results.filter(r => r.reachable.reachable).map(r => r.context),
    postMessage,
  );
}

/** Namespaces for several contexts, each tagged with where it came from. */
async function handleDk8sNamespacesFor(
  contexts: string[],
  postMessage: PostMessage,
): Promise<void> {
  const pins = state().pinnedNamespaces ?? {};
  const per = await Promise.all(contexts.map(async (context) => ({
    context,
    ...(await listNamespaces(context)),
    pinned: pins[context] ?? [],
  })));
  postMessage({ type: 'dk8s:namespacesMulti', perContext: per });
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
  postMessage({
    type: 'dk8s:namespaces', context, ...result,
    pinned: pinnedFor(context),
  });
}

function pinnedFor(context: string): string[] {
  return (state().pinnedNamespaces ?? {})[context] ?? [];
}

/** Pin a hand-entered namespace so it is one click away next time. */
export function handleDk8sPinNamespace(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const context = String(msg.context ?? state().context ?? '');
  const namespace = String(msg.namespace ?? '').trim();
  if (!context || !namespace) return;

  const all = { ...(state().pinnedNamespaces ?? {}) };
  const current = all[context] ?? [];
  // Sorted and de-duplicated, so the list does not depend on entry order.
  if (!current.includes(namespace)) {
    all[context] = [...current, namespace].sort((a, b) => a.localeCompare(b));
    saveState({ pinnedNamespaces: all });
  }
  postMessage({ type: 'dk8s:pinnedNamespaces', context, pinned: all[context] ?? current });
}

export function handleDk8sUnpinNamespace(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const context = String(msg.context ?? state().context ?? '');
  const namespace = String(msg.namespace ?? '').trim();
  if (!context || !namespace) return;

  const all = { ...(state().pinnedNamespaces ?? {}) };
  all[context] = (all[context] ?? []).filter(n => n !== namespace);
  saveState({ pinnedNamespaces: all });
  postMessage({ type: 'dk8s:pinnedNamespaces', context, pinned: all[context] });
}

/** Commit a multi-cluster, multi-namespace selection and start watching it. */
export function handleDk8sSetTargets(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const targets = (Array.isArray(msg.targets) ? msg.targets : [])
    .filter((t: WatchTarget) => t?.context && t?.namespace);
  if (!targets.length) return;

  // Keep the single-value fields in step, so the breadcrumb and the namespace
  // list still have something sensible to default to.
  saveState({
    targets,
    context: targets[0].context,
    namespace: targets[0].namespace,
  });
  postMessage({ type: 'dk8s:targetsSet', targets });
  handleDk8sWatchPods({ targets }, postMessage);
}

export function handleDk8sSetNamespace(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const namespace = String(msg.namespace ?? '');
  if (!namespace) return;
  saveState({ namespace });
  postMessage({ type: 'dk8s:namespaceSet', namespace });
  if (msg.pin) handleDk8sPinNamespace({ namespace }, postMessage);
  // The previous selection is now pointing at the wrong place; reconcile.
  handleDk8sWatchPods({ context: state().context, namespace }, postMessage);
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

// ── Live pod watches ────────────────────────────────────────────────────────
//
// One watch per (context, namespace) the user selected. Each is a kubectl child
// process, so the count is capped: someone who ticks every namespace in a large
// cluster would otherwise spawn fifty processes and be rate-limited by the API
// server rather than helped by the tool.

interface LiveWatch {
  handle: WatchHandle;
  /** Replayed to a webview that re-attaches after a reload. */
  pods: unknown[];
  status: 'connected' | 'reconnecting' | 'stopped';
  detail?: string;
  usage: unknown;
  usageAvailable: boolean;
  metricsTimer?: NodeJS.Timeout;
}

const watches = new Map<string, LiveWatch>();

const METRICS_INTERVAL_MS = 15_000;
/** Above this, the tool costs the cluster more than it gives the user. */
export const MAX_WATCH_TARGETS = 12;

function stopWatch(key: string): void {
  const w = watches.get(key);
  if (!w) return;
  w.handle.stop();
  if (w.metricsTimer) clearInterval(w.metricsTimer);
  watches.delete(key);
}

function stopAllWatches(): void {
  for (const key of [...watches.keys()]) stopWatch(key);
}

function startWatch(target: WatchTarget, postMessage: PostMessage): void {
  const key = targetKey(target);
  const { context, namespace } = target;

  const live: LiveWatch = {
    handle: undefined as unknown as WatchHandle,
    pods: [], status: 'reconnecting', usage: null, usageAvailable: false,
  };
  watches.set(key, live);

  live.handle = watchPods(context, namespace, {
    onSnapshot: (pods) => {
      live.pods = pods;
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
      live.status = status;
      live.detail = detail;
      postMessage({ type: 'dk8s:watchStatus', context, namespace, status, detail });
    },
  });

  // Metrics are polled rather than watched — there is no watch API for them.
  // Absent metrics-server is normal, so a null result hides the column instead
  // of reporting a failure the user cannot act on.
  const poll = async () => {
    const usage = await topPods(context, namespace);
    if (!watches.has(key)) return;    // target dropped while we were waiting
    live.usage = usage;
    live.usageAvailable = usage !== null;
    postMessage({ type: 'dk8s:podUsage', context, namespace, usage, available: usage !== null });
  };
  void poll();
  live.metricsTimer = setInterval(poll, METRICS_INTERVAL_MS);
}

/**
 * Reconcile the running watches against the requested targets.
 *
 * Targets already running are left alone and REPLAYED rather than restarted.
 * A webview reload does not restart the host, so the panel comes back asking
 * to watch namespaces the host is already watching; tearing those down and
 * starting again would drop every pod on screen for a second and cost the
 * cluster a fresh list per namespace for no reason.
 */
export function handleDk8sWatchPods(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const saved = state();
  let targets: WatchTarget[] = Array.isArray(msg.targets)
    ? (msg.targets as WatchTarget[]).filter(t => t?.context && t?.namespace)
    : [];

  if (!targets.length) {
    const context = String(msg.context ?? saved.context ?? '');
    const namespace = String(msg.namespace ?? saved.namespace ?? '');
    if (context && namespace) targets = [{ context, namespace }];
  }
  if (!targets.length) return;

  const capped = targets.slice(0, MAX_WATCH_TARGETS);
  if (capped.length < targets.length) {
    postMessage({
      type: 'dk8s:watchCapped',
      requested: targets.length, watching: capped.length, max: MAX_WATCH_TARGETS,
    });
  }
  saveState({ targets: capped });

  const wanted = new Set(capped.map(targetKey));
  for (const key of [...watches.keys()]) {
    if (!wanted.has(key)) stopWatch(key);
  }

  for (const target of capped) {
    const key = targetKey(target);
    const live = watches.get(key);
    if (live) {
      // Already watching — catch the new page up instead of restarting.
      postMessage({ type: 'dk8s:podSnapshot', context: target.context, namespace: target.namespace, pods: live.pods });
      postMessage({ type: 'dk8s:watchStatus', context: target.context, namespace: target.namespace, status: live.status, detail: live.detail });
      if (live.usageAvailable) {
        postMessage({ type: 'dk8s:podUsage', context: target.context, namespace: target.namespace, usage: live.usage, available: true });
      }
      continue;
    }
    startWatch(target, postMessage);
  }
}

export function handleDk8sStopWatch(): void {
  stopAllWatches();
}

/** Called when the panel goes away, so a watch cannot outlive its tab. */
export function disposeDk8s(): void {
  stopAllWatches();
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
