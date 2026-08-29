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
import {
  exportPodLogs, summariseExport,
  type ExportTarget, type ExportOptions,
} from '../../../services/k8s/k8s-logs';
import * as vscode from 'vscode';
import * as os from 'os';
import { join } from 'path';
import { mkdir as mkdirp } from 'fs/promises';
import { collectArtifact, type ArtifactKind, type CollectTarget } from '../../../services/k8s/k8s-artifacts';
import { readMemoryProfile, assessHeapDumpSafety } from '../../../services/k8s/k8s-memory';
import {
  searchLogs, DEFAULT_SEARCH,
  type SearchHandle, type SearchTarget, type SearchOptions,
} from '../../../services/k8s/k8s-log-search';
import { dk8sPrompt } from '../../chat/dk8s-prompts';
import { handleAiSend } from './ai-handler';
import { handleHeapAnalyze, handleThreadsAnalyze, handleLogsAnalyze } from './heap-handler';
import { streamLogs, type LogStreamHandle } from '../../../services/k8s/k8s-log-stream';
import { run, kubectlBinary, resolveBinary } from '../../../services/k8s/kubectl';
import { probeCapabilities, classifyFromSpec, availableActions, execFailureKind } from '../../../services/k8s/pod-classify';

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
   * Refuse a heap dump the safety check judges likely to OOM-kill the pod.
   * Undefined means on — the guard has to protect people who have never opened
   * Settings, which is most of them.
   */
  guardHeapDump?: boolean;
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

/**
 * Whether to refuse a heap dump that looks likely to OOM-kill the pod.
 *
 * Default on. Someone who turns it off has explicitly said they accept the
 * risk; everyone else is protected by default, because the person most likely
 * to click this button is the one least likely to have thought about tmpfs.
 */
export function guardHeapDumpEnabled(): boolean {
  return state().guardHeapDump !== false;
}

export function handleDk8sSetGuardHeapDump(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const on = msg.on !== false;
  saveState({ guardHeapDump: on });
  postMessage({ type: 'dk8s:guardHeapDump', on });
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
  activeSearch?.cancel();
  activeSearch = undefined;
  logStream?.stop();
  logStream = undefined;
  closeAllTerminals();
}

/**
 * Export logs for a set of pods to a folder the user picks.
 *
 * The folder dialog opens BEFORE any kubectl runs. Fetching several hundred
 * megabytes and only then asking where to put it wastes the user's time and
 * the cluster's bandwidth if they cancel.
 */
export async function handleDk8sExportLogs(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const targets = (Array.isArray(msg.targets) ? msg.targets : []) as ExportTarget[];
  const options = msg.options as ExportOptions;
  if (!targets.length || !options) return;

  let destDir: string;
  try {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Export logs here',
      title: `Export ${targets.length} pod log${targets.length === 1 ? '' : 's'}`,
    });
    if (!picked?.length) {
      postMessage({ type: 'dk8s:exportCancelled' });
      return;
    }
    destDir = picked[0].fsPath;
  } catch (err) {
    postMessage({ type: 'dk8s:exportError', error: (err as Error).message });
    return;
  }

  postMessage({ type: 'dk8s:exportStarted', total: targets.length, destDir });

  try {
    const results = await exportPodLogs(targets, options, destDir, (done, total, pod) => {
      postMessage({ type: 'dk8s:exportProgress', done, total, pod });
    });
    postMessage({
      type: 'dk8s:exportDone',
      destDir,
      results,
      summary: summariseExport(results),
    });
  } catch (err) {
    postMessage({ type: 'dk8s:exportError', error: (err as Error).message });
  }
}

// ── Pod detail: logs, describe, shell ───────────────────────────────────────

/** One follow per tab. Opening a second pod replaces the first. */
let logStream: LogStreamHandle | undefined;

export function handleDk8sLogsOpen(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const context = String(msg.context ?? state().context ?? '');
  const namespace = String(msg.namespace ?? '');
  const pod = String(msg.pod ?? '');
  if (!context || !namespace || !pod) return;

  logStream?.stop();
  logStream = streamLogs(context, namespace, pod, {
    // Follow only when asked. The default is a snapshot of the tail.
    follow: !!msg.follow,
    container: msg.container as string | undefined,
    previous: !!msg.previous,
    tailLines: (msg.tailLines as number) ?? 200,
    direction: msg.direction === 'first' ? 'first' : 'last',
    sinceSeconds: msg.sinceSeconds as number | undefined,
  }, {
    onLines: (lines) => postMessage({ type: 'dk8s:logLines', pod, lines }),
    onStatus: (status, detail) => postMessage({ type: 'dk8s:logStatus', pod, status, detail }),
    onDropped: (count) => postMessage({ type: 'dk8s:logDropped', pod, count }),
  });
}

export function handleDk8sLogsClose(): void {
  logStream?.stop();
  logStream = undefined;
}

/** describe + YAML in one round trip: the detail panel shows both. */
export async function handleDk8sDescribe(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const context = String(msg.context ?? state().context ?? '');
  const namespace = String(msg.namespace ?? '');
  const pod = String(msg.pod ?? '');
  if (!context || !namespace || !pod) return;

  const [described, yaml] = await Promise.all([
    run(['--context', context, '-n', namespace, 'describe', 'pod', pod], { timeoutMs: 30_000 }),
    run(['--context', context, '-n', namespace, 'get', 'pod', pod, '-o', 'yaml'], { timeoutMs: 30_000 }),
  ]);

  postMessage({
    type: 'dk8s:described', pod,
    describe: described.ok ? described.stdout : (described.stderr || described.failure),
    yaml: yaml.ok ? yaml.stdout : (yaml.stderr || yaml.failure),
    ok: described.ok && yaml.ok,
  });
}

/**
 * A shell in the pod, in a real VS Code terminal.
 *
 * Not xterm.js in the panel: getting a PTY inside a webview needs a native
 * module, and without one bash prints no prompt, vim hangs and Ctrl-C does
 * nothing. VS Code already has PTYs, so this is both simpler and strictly
 * more capable — the terminal the user already knows, with their font,
 * scrollback and copy-paste.
 */
export async function handleDk8sShell(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const context = String(msg.context ?? state().context ?? '');
  const namespace = String(msg.namespace ?? '');
  const pod = String(msg.pod ?? '');
  const container = msg.container as string | undefined;
  if (!context || !namespace || !pod) return;

  // Distroless images have no bash, and many have no sh either. `exec -- bash`
  // on one fails with an OCI error that reads like a permissions problem and
  // sends people down entirely the wrong path, so probe first.
  let shell: string | undefined;
  let lastError = '';
  for (const candidate of ['bash', 'sh', 'ash']) {
    const r = await run([
      '--context', context, '-n', namespace, 'exec', pod,
      ...(container ? ['-c', container] : []),
      '--', 'which', candidate,
    ], { timeoutMs: 15_000 });
    if (r.ok && r.stdout.trim()) { shell = candidate; break; }
    if (r.stderr) lastError = r.stderr;
  }

  if (!shell) {
    // "No shell" and "this container is not running" both fail exec, and
    // conflating them is a confident wrong answer: telling someone to attach a
    // debug container to a CrashLoopBackOff pod sends them down a path that
    // cannot work, when the real answer is to read the previous run's log.
    // Only the executable-lookup phrasing actually means the shell is absent.
    const shellAbsent = execFailureKind(lastError) === 'missing-binary';

    postMessage({
      type: 'dk8s:shellUnavailable', pod,
      reason: shellAbsent
        ? 'No shell in this container — it looks distroless.'
        : 'This container is not running, so there is nothing to open a shell in.',
      suggestion: shellAbsent
        ? `kubectl --context ${context} -n ${namespace} debug -it ${pod} --image=busybox${container ? ` --target=${container}` : ''}`
        : `kubectl --context ${context} -n ${namespace} logs ${pod} --previous`,
      // For a pod that is down, the log from the run before the last restart
      // is where the failure is — so point straight at it.
      suggestionLabel: shellAbsent
        ? 'Attach a debug container with a shell in it instead:'
        : 'Read the previous run’s log instead — that is where the failure is:',
    });
    return;
  }

  await resolveBinary();
  const term = vscode.window.createTerminal({
    name: `⎈ ${pod}`,
    iconPath: new vscode.ThemeIcon('server-environment'),
    // shellPath + shellArgs, never a command string: VS Code execs the binary
    // directly, so a pod named `a; rm -rf ~` is an argument, not syntax.
    shellPath: kubectlBinary() ?? 'kubectl',
    shellArgs: [
      '--context', context, '-n', namespace,
      'exec', '-it', pod,
      ...(container ? ['-c', container] : []),
      '--', shell,
    ],
  });
  term.show();
  trackTerminal(pod, term);
  postMessage({ type: 'dk8s:shellOpened', pod, shell });
}

/**
 * Terminals dk8s opened, so they can be closed when the context changes.
 * A shell left pointing at a cluster you navigated away from an hour ago is a
 * genuinely dangerous thing to leave lying around.
 */
const podTerminals = new Map<string, vscode.Terminal>();

function trackTerminal(pod: string, term: vscode.Terminal): void {
  podTerminals.get(pod)?.dispose();
  podTerminals.set(pod, term);
  const sub = vscode.window.onDidCloseTerminal((t) => {
    if (t === term) { podTerminals.delete(pod); sub.dispose(); }
  });
}

function closeAllTerminals(): void {
  for (const t of podTerminals.values()) t.dispose();
  podTerminals.clear();
}

/** What this pod can actually support — drives which actions are offered. */
export async function handleDk8sProbePod(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const context = String(msg.context ?? state().context ?? '');
  const namespace = String(msg.namespace ?? '');
  const pod = String(msg.pod ?? '');
  const container = msg.container as string | undefined;
  if (!context || !namespace || !pod) return;

  const spec = await run(['--context', context, '-n', namespace, 'get', 'pod', pod, '-o', 'json'], { timeoutMs: 20_000 });
  let runtime: ReturnType<typeof classifyFromSpec> = { runtime: 'unknown', confidence: 0, detectedFrom: 'image' };
  try {
    runtime = classifyFromSpec(JSON.parse(spec.stdout));
  } catch { /* fall through with unknown */ }

  const caps = await probeCapabilities(context, namespace, pod, container);

  // The capabilities answer "can this pod do a heap dump"; the memory profile
  // answers "should it". Both are needed before the button is drawn, because
  // an offered-then-refused action is worse than one that was never offered.
  const memory = caps.unreachable
    ? undefined
    : await readMemoryProfile(context, namespace, pod, {
        container, jcmd: caps.jcmd, targetPid: caps.targetPid,
      });

  // The verdict is about a heap dump, so it only exists where a heap dump does.
  // A Python pod was being told its heap dump would OOM-kill it, complete with
  // an empty -Xmx and "jcmd unavailable" — advice about an action that is not
  // on the screen. The memory FIGURES are still useful everywhere; the
  // judgement is not.
  const actions = availableActions(runtime.runtime, caps);
  const heapDumpOffered = actions.some(a => a.id === 'heapdump');
  const safety = memory && heapDumpOffered ? assessHeapDumpSafety(memory) : undefined;

  postMessage({
    type: 'dk8s:podProbed', pod,
    runtime, capabilities: caps, actions,
    memory, safety,
  });
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

// ── Ask AI ──────────────────────────────────────────────────────────────────

/**
 * Send a piece of evidence to the model.
 *
 * The prompt text lives on the host, not in the webview, so there is exactly
 * one copy of it and it can be changed without rebuilding the UI bundle. The
 * webview names a key; anything it does not name is refused rather than passed
 * through, so a bug in the panel cannot turn into an arbitrary system prompt.
 */
export async function handleDk8sAsk(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const key = String(msg.promptKey ?? '');
  const system = dk8sPrompt(key);
  if (!system) {
    postMessage({ type: 'dk8s:aiError', error: `Unknown prompt: ${key}` });
    return;
  }

  const evidence = String(msg.evidence ?? '');
  if (!evidence.trim()) {
    postMessage({ type: 'dk8s:aiError', error: 'Nothing selected to ask about.' });
    return;
  }

  // The context block is what turns "explain this stack trace" into "explain
  // this stack trace from a pod that has restarted 14 times" — which is often
  // the whole answer.
  const ctx = (msg.podContext ?? {}) as Record<string, unknown>;
  const contextLines = [
    ctx.pod && `pod: ${ctx.pod}`,
    ctx.namespace && `namespace: ${ctx.namespace}`,
    ctx.phase && `phase: ${ctx.phase}`,
    ctx.restarts !== undefined && `restarts: ${ctx.restarts}`,
    ctx.reason && `reason: ${ctx.reason}`,
    ctx.runtime && `runtime: ${ctx.runtime}`,
    ctx.image && `image: ${ctx.image}`,
    ctx.age && `age: ${ctx.age}`,
  ].filter(Boolean).join('\n');

  const label = String(msg.evidenceLabel ?? 'EVIDENCE');
  const question = String(msg.question ?? '').trim();

  const userPrompt = [
    contextLines && `━━━ POD ━━━\n${contextLines}`,
    `━━━ ${label} ━━━\n${evidence}`,
    question && `━━━ THE DEVELOPER ASKS ━━━\n${question}`,
  ].filter(Boolean).join('\n\n');

  await handleAiSend({
    // A fixed tabId: the dk8s panel is the only consumer of this stream, and a
    // per-request id would leave the panel unable to match chunks to its request.
    tabId: DK8S_AI_TAB,
    systemPrompts: [system],
    userPrompt,
    conversation: msg.conversation ?? [],
    stage: key,
    provider: msg.provider,
    model: msg.model,
  }, postMessage);
}

/** The tabId every dk8s AI request uses. */
export const DK8S_AI_TAB = 'dk8s-ai';

// ── Doctor actions ──────────────────────────────────────────────────────────

/**
 * Where artifacts go.
 *
 * A stable folder under the extension's storage rather than a save dialog per
 * dump: during an incident you take four of these in a row, and being asked
 * where to put each one is friction at exactly the wrong moment. The folder is
 * shown in the UI and openable in one click.
 */
function artifactDir(): string {
  return join(dk8sStorageRoot(), 'artifacts');
}

let storageRoot = '';

/** Called once at activation — the extension owns the path, not this module. */
export function setDk8sStorageRoot(root: string): void {
  storageRoot = root;
}

function dk8sStorageRoot(): string {
  return storageRoot || join(os.tmpdir(), 'daakia-dk8s');
}

export async function handleDk8sCollect(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const kind = String(msg.kind ?? '') as ArtifactKind;
  const context = String(msg.context ?? state().context ?? '');
  const namespace = String(msg.namespace ?? '');
  const pod = String(msg.pod ?? '');
  if (!kind || !context || !namespace || !pod) return;

  const target: CollectTarget = {
    context, namespace, pod,
    container: msg.container as string | undefined,
    targetPid: msg.targetPid as string | undefined,
  };

  // Enforce the guard HERE, not only in the panel. A webview bug, a stale
  // bundle, or a message crafted by anything else must not be able to fire a
  // heap dump the safety check just refused — the whole point is that the pod
  // survives, and a check that only lives in the UI is decoration.
  if (kind === 'heapdump' && guardHeapDumpEnabled() && !msg.overrideSafety) {
    const caps = await probeCapabilities(context, namespace, pod, target.container);
    const profile = await readMemoryProfile(context, namespace, pod, {
      container: target.container, jcmd: caps.jcmd, targetPid: caps.targetPid,
    });
    const safety = assessHeapDumpSafety(profile);
    if (safety.verdict === 'unsafe') {
      postMessage({
        type: 'dk8s:collectDone', pod, destDir: artifactDir(),
        result: {
          kind, ok: false,
          error: `Refused: ${safety.headline} `
            + 'Turn off the heap-dump guard in Settings if you want to take it anyway.',
        },
        safety,
      });
      return;
    }
  }

  const destDir = artifactDir();
  postMessage({ type: 'dk8s:collectStarted', pod, kind });

  try {
    const result = await collectArtifact(target, {
      kind,
      destDir,
      useJstack: !!msg.useJstack,
      useJmap: !!msg.useJmap,
      seconds: (msg.seconds as number) ?? 30,
      allowInstall: !!msg.allowInstall,
    }, (progress) => {
      postMessage({ type: 'dk8s:collectProgress', pod, kind, ...progress });
    });

    postMessage({ type: 'dk8s:collectDone', pod, result, destDir });
  } catch (err) {
    postMessage({
      type: 'dk8s:collectDone', pod, destDir,
      result: { kind, ok: false, error: (err as Error).message },
    });
  }
}

/**
 * Hand an artifact to the analyzer that understands it.
 *
 * This is the join dk8s exists to make: the Doctor tab's heap and thread
 * analyzers already work, they just had no way to reach a cluster. Collecting
 * a dump and then making the user find it in a folder and re-open it by hand
 * would waste the entire point — so the file goes straight into the analyzer
 * and the webview is told to bring that tab forward.
 */
export async function handleDk8sAnalyze(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
  extensionRoot: string,
): Promise<void> {
  const file = String(msg.file ?? '');
  const kind = String(msg.kind ?? '');
  if (!file) return;

  // A histogram is not a heap dump — it is text, and the heap analyzer would
  // reject it. Route by what the file actually IS, not by which button
  // produced it.
  const analyzer =
    kind === 'heapdump' ? 'heap'
    : kind === 'threaddump' || kind === 'threaddump-sigquit' || kind === 'stackdump' ? 'threads'
    : 'logs';

  // Tell the webview first, so the Doctor tab is already on screen when the
  // analyzer's own progress messages start arriving.
  postMessage({ type: 'dk8s:handoff', analyzer, file, kind });

  switch (analyzer) {
    case 'heap':
      handleHeapAnalyze({ path: file }, postMessage, extensionRoot);
      break;
    case 'threads':
      handleThreadsAnalyze({ path: file }, postMessage, extensionRoot);
      break;
    default:
      handleLogsAnalyze({ path: file }, postMessage, extensionRoot);
      break;
  }
}

/** Reveal the artifact folder in the OS file manager. */
export async function handleDk8sRevealArtifacts(): Promise<void> {
  const dir = artifactDir();
  await mkdirp(dir);
  await vscode.env.openExternal(vscode.Uri.file(dir));
}

// ── Multi-pod log search ────────────────────────────────────────────────────

/** One search at a time. Starting a second cancels the first. */
let activeSearch: SearchHandle | undefined;

/**
 * Search several pods' logs at once.
 *
 * Everything expensive stays here. The logs are matched as they stream off
 * kubectl and discarded line by line; only the hits — capped — are posted to
 * the webview. Sending whole logs across the bridge and filtering them there
 * is the version of this feature that locks the tab.
 */
export function handleDk8sSearchLogs(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  activeSearch?.cancel();

  const targets = (msg.targets as SearchTarget[]) ?? [];
  const opts: SearchOptions = {
    ...DEFAULT_SEARCH,
    ...(msg.options as Partial<SearchOptions> ?? {}),
  };

  if (!targets.length || !opts.query.trim()) {
    postMessage({ type: 'dk8s:searchDone', pods: 0, matched: 0, scanned: 0, stopped: false });
    return;
  }

  postMessage({ type: 'dk8s:searchStarted', total: targets.length, query: opts.query });

  activeSearch = searchLogs(targets, opts, {
    onPodDone: (result, matches) => {
      postMessage({ type: 'dk8s:searchPod', result, matches });
    },
    onProgress: (done, total, pod) => {
      postMessage({ type: 'dk8s:searchProgress', done, total, pod });
    },
    onFinished: (summary) => {
      activeSearch = undefined;
      postMessage({ type: 'dk8s:searchDone', ...summary });
    },
  });
}

export function handleDk8sCancelSearch(postMessage: PostMessage): void {
  activeSearch?.cancel();
  activeSearch = undefined;
  postMessage({ type: 'dk8s:searchCancelled' });
}
