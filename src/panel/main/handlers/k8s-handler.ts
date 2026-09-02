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
import { connEvidence } from '../../../services/k8s/conn-summary';
import { probeAccess, forbiddenReason } from '../../../services/k8s/k8s-access';
import {
  probePv, clearPvCache, mountsOf, type PvLogConfig,
} from '../../../services/k8s/pv-logs';
import { searchPvForPod, type PvMatch } from '../../../services/k8s/pv-search';
import {
  listContexts, checkReachable, listNamespaces, defaultNamespace, looksLikeProduction,
} from '../../../services/k8s/kube-context';
import { getSetting, setSetting } from '../../../storage/db';
import { watchPods, topPods, type WatchHandle } from '../../../services/k8s/k8s-watch';
import {
  exportPodLogs, exportVisibleLines, summariseExport,
  type ExportTarget, type ExportOptions,
} from '../../../services/k8s/k8s-logs';
import * as vscode from 'vscode';
import * as os from 'os';
import { join, basename } from 'path';
// `recursive: true` at every call site: plain mkdir throws EEXIST on a
// directory that is already there, which is every call after the first.
import { mkdir as mkdirp } from 'fs/promises';
import {
  collectArtifact, listArtifacts, analyzerFor,
  type ArtifactKind, type CollectTarget,
} from '../../../services/k8s/k8s-artifacts';
import { readMemoryProfile, assessHeapDumpSafety } from '../../../services/k8s/k8s-memory';
import {
  searchLogs, DEFAULT_SEARCH,
  type SearchHandle, type SearchTarget, type SearchOptions,
} from '../../../services/k8s/k8s-log-search';
import {
  chooseFormat, validatePattern, compileFormat,
  type LogFormat, type PodContext,
} from '../../../services/k8s/log-format';
import { BUILTIN_FORMATS } from '../../../services/k8s/log-format-builtins';
import {
  exportSearchResults, type SearchExportOptions,
} from '../../../services/k8s/k8s-search-export';
import { dk8sPrompt, dk8sUserPrompt } from '../../chat/dk8s-prompt-resolve';
import { renderDk8sUserPrompt } from '../../chat/dk8s-prompts';
import { redact, describeRedactions } from '../../../services/k8s/redact';
import { detectFormat, detectPattern } from '../../../services/k8s/log-format-detect';
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
  /** Line numbers in the log view. Undefined means on. */
  logLineNumbers?: boolean;
  /** User-defined log formats. Built-ins are not stored, only overridden. */
  logFormats?: LogFormat[];
  /** Archived logs on a mounted volume. See services/k8s/pv-logs.ts. */
  pvLogs?: PvLogConfig;
  /** Built-in ids the user has switched off. */
  disabledFormats?: string[];
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
    // View preferences ride along with the probe rather than needing their own
    // round trip — the panel needs them before it renders anything.
    guardHeapDump: saved.guardHeapDump !== false,
    logLineNumbers: saved.logLineNumbers !== false,
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

export function handleDk8sSetLogLineNumbers(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const on = msg.on !== false;
  saveState({ logLineNumbers: on });
  postMessage({ type: 'dk8s:logLineNumbers', on });
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

  // "On screen" hands us the rendered lines rather than a range to fetch.
  const onScreen = Array.isArray(msg.visibleLines)
    ? (msg.visibleLines as string[])
    : undefined;

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

  if (onScreen) {
    try {
      const t = targets[0];
      const result = await exportVisibleLines(t.pod, t.namespace, onScreen, destDir);
      postMessage({
        type: 'dk8s:exportDone', destDir,
        summary: `${result.lines?.toLocaleString()} lines written`,
        results: [result],
      });
    } catch (err) {
      postMessage({ type: 'dk8s:exportError', error: (err as Error).message });
    }
    return;
  }

  try {
    // The archive travels with the options, same as the match export: a whole
    // log that stops at what kubectl still holds is not the whole log.
    const results = await exportPodLogs(
      targets, { ...options, pv: pvConfig() }, destDir, (done, total, pod) => {
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

/**
 * Export a search's hits to disk.
 *
 * Deliberately a different path from `dk8s:exportLogs`: that one writes whole
 * pod logs by time range, this one writes only the lines that matched and
 * their surroundings. They share the folder picker and the progress messages
 * because to the person watching they are the same act — "put this on my
 * disk" — but what gets written is not the same thing, and folding them into
 * one handler with a mode flag would make both harder to read.
 */
export async function handleDk8sExportSearch(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const targets = (Array.isArray(msg.targets) ? msg.targets : []) as SearchTarget[];
  const options = msg.options as SearchExportOptions | undefined;
  if (!targets.length || !options?.query?.trim()) return;

  let destDir: string;
  try {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Export results here',
      title: `Export search results from ${targets.length} pod${targets.length === 1 ? '' : 's'}`,
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
    // A timestamp per export, not per file, so one run's files sort together
    // and a second run does not overwrite the first.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    /*
      The archive travels with the options.

      Exporting used to run its own live-only search, so a result list showing
      11,500 hits across a live half and an archived half wrote a file holding
      the 5,000 live ones — and said nothing about the rest. The exporter can
      only look at the volume if it is handed the configuration for it.
    */
    const results = await exportSearchResults(
      targets, { ...options, pv: pvConfig() }, destDir, stamp,
      (done: number, total: number, pod: string) =>
        postMessage({ type: 'dk8s:exportProgress', done, total, pod }));
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

/**
 * Work out which log format applies to a pod.
 *
 * Done ONCE here, when the stream opens — never per line — which is what makes
 * a global list with match rules affordable. The probe reads a short sample
 * first so a pod nobody has configured still gets coloured levels: eight
 * formats over twenty lines is about a tenth of a millisecond, paid once.
 */
async function resolveFormatFor(
  context: string,
  namespace: string,
  pod: string,
  pinnedId?: string,
): Promise<{ format?: LogFormat; via: string }> {
  const available = allFormats();
  const pinned = pinnedId ? available.find(f => f.id === pinnedId) : undefined;

  let ctx: PodContext = { namespace, pod };
  let sample: string[] = [];

  // Only pay for the pod spec and the sample when they can change the answer.
  if (!pinned) {
    const spec = await run(
      ['--context', context, '-n', namespace, 'get', 'pod', pod, '-o', 'json'],
      { timeoutMs: 15_000 },
    );
    if (spec.ok) {
      try {
        const parsed = JSON.parse(spec.stdout);
        ctx = {
          namespace, pod,
          image: parsed.spec?.containers?.[0]?.image,
          labels: parsed.metadata?.labels ?? {},
        };
      } catch { /* match on name and namespace alone */ }
    }

    /*
      A window, not a handful of lines.

      This was `--tail=25`, which is fine for a healthy pod and useless for a
      broken one: a CrashLoopBackOff container dies inside a stack trace, so
      its last 25 lines are 25 frames and the probe sees no events at all. 200
      is enough to reach past a Hibernate trace to the events above it, and it
      is one call paid once per stream.
    */
    const head = await run(
      ['--context', context, '-n', namespace, 'logs', pod, '--tail=200'],
      { timeoutMs: 20_000, maxBuffer: 4 * 1024 * 1024 },
    );
    if (head.ok) sample = head.stdout.split('\n').filter(l => l.trim());
  }

  const chosen = chooseFormat({
    pinned, saved: state().logFormats ?? [], builtins: BUILTIN_FORMATS, ctx, sample,
  });
  if (chosen.format) return { format: chosen.format, via: chosen.via };

  /*
    Nothing known fits, so work one out from the log itself.

    Last, deliberately. A builtin that probes well is a NAMED format the person
    can find in Settings, read and edit; a detected one is correct but
    anonymous, so the known answer is preferred where there is one. This is for
    the case the detector was written for — a log no builtin covers, which is
    precisely where dk8s used to give up and render a grey wall with no levels,
    no fields and every stack frame counted as its own event.

    `detectFormat` declines unless one shape holds more than two thirds of the
    sample, so getting nothing back here is a real answer rather than a failure.
  */
  const detected = sample.length ? detectFormat(sample) : undefined;
  if (detected) return { format: detected, via: 'detected' };

  return { format: undefined, via: chosen.via };
}

export async function handleDk8sLogsOpen(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const context = String(msg.context ?? state().context ?? '');
  const namespace = String(msg.namespace ?? '');
  const pod = String(msg.pod ?? '');
  if (!context || !namespace || !pod) return;

  const { format, via } = await resolveFormatFor(
    context, namespace, pod, msg.formatId as string | undefined,
  );
  // Named on screen, so it is always clear which format is running and how it
  // was picked — a wrong format is much easier to spot than to debug.
  postMessage({
    type: 'dk8s:logFormat', pod,
    formatId: format?.id, formatName: format?.name, via,
  });

  logStream?.stop();
  logStream = streamLogs(context, namespace, pod, {
    format,
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
/**
 * What this account may do in this namespace.
 *
 * Asked when a pod is opened, so the detail tabs can disable what will not
 * work and say what to ask an administrator for, rather than offering
 * everything and letting the wrong ones fail with a raw 403.
 */
export async function handleDk8sProbeAccess(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const context = String(msg.context ?? state().context ?? '');
  const namespace = String(msg.namespace ?? '');
  if (!context || !namespace) return;
  postMessage({
    type: 'dk8s:access',
    context,
    namespace,
    access: await probeAccess(context, namespace),
  });
}

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

  // A wall of `Error from server (Forbidden): ... cannot get resource "pods"
  // in API group ""` is not something to put in front of someone. Say what
  // happened, and leave the raw text available underneath.
  const explain = (r: typeof described) =>
    forbiddenReason(r.stderr || r.failure || '') ?? (r.stderr || r.failure);

  postMessage({
    type: 'dk8s:described', pod,
    describe: described.ok ? described.stdout : explain(described),
    yaml: yaml.ok ? yaml.stdout : explain(yaml),
    ok: described.ok && yaml.ok,
    denied: !described.ok && !!forbiddenReason(described.stderr || ''),
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


// ── Log formats ─────────────────────────────────────────────────────────────

/**
 * Everything available to match against, user formats first.
 *
 * Order is the resolution order, so a user format always beats a built-in of
 * the same shape — otherwise there would be no way to correct one.
 */
function allFormats(): LogFormat[] {
  const disabled = new Set(state().disabledFormats ?? []);
  const user = state().logFormats ?? [];
  return [
    ...user,
    ...BUILTIN_FORMATS.map(f => ({ ...f, enabled: !disabled.has(f.id) })),
  ];
}

export function handleDk8sGetFormats(postMessage: PostMessage): void {
  postMessage({
    type: 'dk8s:formats',
    formats: state().logFormats ?? [],
    builtins: BUILTIN_FORMATS,
    disabled: state().disabledFormats ?? [],
  });
}

export function handleDk8sSaveFormat(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const format = msg.format as LogFormat;
  if (!format?.id || !format.name) return;

  // A pattern that can backtrack catastrophically must never reach a live
  // stream — one such format against a busy pod would hang the extension host.
  if (format.kind === 'pattern') {
    const problem = validatePattern(format.pattern ?? '');
    if (problem) {
      postMessage({ type: 'dk8s:formatError', id: format.id, error: problem });
      return;
    }
  }

  const existing = state().logFormats ?? [];
  const at = existing.findIndex(f => f.id === format.id);
  const next = at === -1
    ? [...existing, format]
    : existing.map(f => (f.id === format.id ? format : f));

  saveState({ logFormats: next });
  handleDk8sGetFormats(postMessage);
}

export function handleDk8sDeleteFormat(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const id = String(msg.id ?? '');
  if (!id) return;

  const builtin = BUILTIN_FORMATS.some(f => f.id === id);
  if (builtin) {
    // Built-ins are disabled rather than removed, so they can come back
    // without the user having to retype one.
    const disabled = new Set(state().disabledFormats ?? []);
    if (msg.enabled === false) disabled.add(id); else disabled.delete(id);
    saveState({ disabledFormats: [...disabled] });
  } else {
    saveState({ logFormats: (state().logFormats ?? []).filter(f => f.id !== id) });
  }
  handleDk8sGetFormats(postMessage);
}

/**
 * Try a format against real lines before it is saved.
 *
 * Writing a pattern blind and finding out on a live pod is miserable, so the
 * editor shows exactly what each line becomes.
 */
export function handleDk8sTestFormat(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const format = msg.format as LogFormat;
  const lines = (msg.lines as string[]) ?? [];
  if (!format) return;

  if (format.kind === 'pattern') {
    const problem = validatePattern(format.pattern ?? '');
    if (problem) {
      postMessage({ type: 'dk8s:formatTested', error: problem, results: [] });
      return;
    }
  }

  const compiled = compileFormat(format);
  const results = lines.slice(0, 50).map(line => {
    const parsed = compiled.parse(line);
    return {
      line,
      matched: !!parsed,
      level: parsed?.level,
      logger: parsed?.logger,
      message: parsed?.message,
      ts: parsed?.ts,
    };
  });
  postMessage({ type: 'dk8s:formatTested', results });
}

/**
 * Ask the model to describe a format from sample lines.
 *
 * Its answer is a PROPOSAL, not a saved format: it lands in the editor with
 * the preview already running against the same lines, so the reader sees what
 * it actually does before deciding. A detector that saved silently would be a
 * confident source of mislabelled logs.
 */
export async function handleDk8sDetectFormat(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const lines = (msg.lines as string[]) ?? [];
  if (!lines.length) {
    postMessage({ type: 'dk8s:formatDetected', error: 'No sample lines to look at.' });
    return;
  }

  /*
    Try to work it out first, and only ask a model if that fails.

    The deterministic detector is better than the model on every axis that
    matters here: it gives the same answer twice, it needs no provider
    configured, it costs no round trip, and it can be tested. It also abstains
    honestly — when a log has two shapes or one it cannot express, it says so
    rather than producing a plausible pattern that matches two lines in five.

    That abstention is exactly where a guess beats nothing, so the model keeps
    the case it is actually good at.
  */
  const worked = detectPattern(lines);
  if (worked) {
    postMessage({
      type: 'dk8s:formatDetected',
      pattern: worked.pattern,
      via: 'rules',
      confidence: worked.confidence,
      note: `Worked out from ${worked.votes} sample lines`
        + ` — ${Math.round(worked.confidence * 100)}% of them match this shape.`,
    });
    return;
  }

  const system = dk8sPrompt('dk8s.format.detect');
  if (!system) return;

  await handleAiSend({
    tabId: DK8S_FORMAT_TAB,
    systemPrompts: [system],
    userPrompt: lines.slice(0, 25).join('\n'),
    conversation: [],
    stage: 'dk8s.format.detect',
  }, postMessage);
}

/** Its own tab id, so the answer never lands in the pod AI panel. */
export const DK8S_FORMAT_TAB = 'dk8s-format-detect';

/** Sample lines from a pod, so the editor and the detector have real input. */
export async function handleDk8sSampleLines(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const context = String(msg.context ?? state().context ?? '');
  const namespace = String(msg.namespace ?? '');
  const pod = String(msg.pod ?? '');
  if (!context || !namespace || !pod) return;

  const res = await run([
    '--context', context, '-n', namespace, 'logs', pod, '--tail=40',
  ], { timeoutMs: 30_000, maxBuffer: 4 * 1024 * 1024 });

  const lines = res.stdout.split('\n').map(l => l.trim()).filter(Boolean).slice(-25);
  postMessage({ type: 'dk8s:sampleLines', pod, lines, error: res.ok ? undefined : res.stderr });
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

  let evidence = String(msg.evidence ?? '');

  /*
    A connection snapshot needs reading before it is worth sending.

    On its own it is a table of sockets. For a quiet pod that is two lines —
    a header and one LISTEN row — which gives a model nothing to reason from,
    and for a busy one it is hundreds of rows whose meaning is in the counts,
    not in any single line. summariseConnections turns it into the shape that
    actually diagnoses something: what is established and to whom, what is
    stuck in CLOSE_WAIT because the application never closed it, and — the
    case that prompted this — the fact that nothing is connected at all.

    Done here rather than in the webview so there is one implementation, and
    one that is under test.
  */
  if (msg.evidenceKind === 'conns') {
    evidence = connEvidence(evidence);
  }

  if (!evidence.trim()) {
    postMessage({ type: 'dk8s:aiError', error: 'Nothing selected to ask about.' });
    return;
  }

  /*
    ── Secrets come out here, and only here ──

    Every dk8s AI call arrives at this handler — every prompt key, every
    surface, the log view and the analyzers alike — which is what makes this
    the one place worth putting it. A redaction step in the log view would
    protect the log view and nothing else, and the next surface to send
    evidence would silently not have it.

    Above the `aiEvidence` post below on purpose: "show what was sent" has to
    show what was actually sent, so the panel is given the redacted text rather
    than the original.
  */
  const cleaned = redact(evidence);
  evidence = cleaned.text;
  const redactionNote = describeRedactions(cleaned.found);

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

  // "Show what was sent" has to mean it. The webview holds the raw artifact,
  // which is no longer what leaves the machine once the host enriches it.
  postMessage({
    type: 'dk8s:aiEvidence', tabId: DK8S_AI_TAB, evidence,
    // So the panel can say what left and what did not.
    redacted: cleaned.total || undefined,
    redactionNote,
  });

  /*
    The user turn comes from a template now, not from concatenation here.

    Same output for the same inputs, but it is a template the Prompt Library
    can show and edit — which it has to be, because the library lists these
    prompts, and an entry you can edit that nothing reads is worse than one
    that was never listed at all.
  */
  const userPrompt = renderDk8sUserPrompt(dk8sUserPrompt(key) ?? '', {
    podContext: contextLines,
    label,
    evidence,
    question,
    pod: ctx.pod as string | undefined,
    namespace: ctx.namespace as string | undefined,
    phase: ctx.phase as string | undefined,
    restarts: ctx.restarts === undefined ? '' : String(ctx.restarts),
    reason: ctx.reason as string | undefined,
    runtime: ctx.runtime as string | undefined,
    image: ctx.image as string | undefined,
    age: ctx.age as string | undefined,
  });

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
  // produced it. An explicit analyzer wins, for imported files that have no
  // collection kind to infer from.
  const analyzer = (msg.analyzer as string | undefined)
    ?? (kind === 'heapdump' ? 'heap'
      : kind === 'threaddump' || kind === 'threaddump-sigquit' || kind === 'stackdump' ? 'threads'
      : 'logs');

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

/** Everything dk8s has collected, plus anything imported alongside it. */
export async function handleDk8sListArtifacts(postMessage: PostMessage): Promise<void> {
  const dir = artifactDir();
  postMessage({
    type: 'dk8s:artifacts',
    dir,
    artifacts: await listArtifacts(dir),
  });
}

/**
 * Bring in a dump dk8s did not collect.
 *
 * Heap dumps get emailed around and copied off production by people who have
 * never opened this extension, so an analyzer that can only read its own
 * output would be useless for half the dumps anyone actually has.
 */
export async function handleDk8sImportArtifact(postMessage: PostMessage): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: true,
    title: 'Open a dump',
    openLabel: 'Add',
    filters: {
      'Dumps and logs': ['hprof', 'txt', 'log', 'tdump', 'jstack', 'jfr'],
      'All files': ['*'],
    },
  });
  if (!picked?.length) return;

  const { copyFile } = await import('fs/promises');
  const dir = artifactDir();
  await mkdirp(dir, { recursive: true });

  for (const uri of picked) {
    const name = basename(uri.fsPath);
    try {
      // Copied rather than referenced: a dump analysed from someone's
      // Downloads folder stops existing the moment they tidy up, and the list
      // would then be full of entries that open nothing.
      await copyFile(uri.fsPath, join(dir, name));
    } catch (err) {
      postMessage({ type: 'dk8s:artifactError', error: (err as Error).message });
    }
  }
  await handleDk8sListArtifacts(postMessage);
}

export async function handleDk8sDeleteArtifact(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const file = String(msg.file ?? '');
  if (!file) return;
  // Only ever inside the artifact folder — a delete driven by a message must
  // not be able to reach the rest of the filesystem.
  if (!file.startsWith(artifactDir())) {
    postMessage({ type: 'dk8s:artifactError', error: 'That file is not in the dk8s artifact folder.' });
    return;
  }
  const { unlink } = await import('fs/promises');
  try {
    await unlink(file);
    /*
      And the parsed index beside it.

      The sidecar is hidden from the list, so leaving it behind would leave
      several megabytes on disk that nothing shows and nothing will ever
      collect — invisible for the same reason it is now unreachable. It is
      keyed on the dump's path, so it is worthless once the dump is gone.
    */
    await unlink(`${file}.dkheap`).catch(() => { /* there may not be one */ });
  } catch (err) {
    postMessage({ type: 'dk8s:artifactError', error: (err as Error).message });
  }
  await handleDk8sListArtifacts(postMessage);
}

/** Open a stored artifact in whichever analyzer understands it. */
export async function handleDk8sOpenArtifact(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
  extensionRoot: string,
): Promise<void> {
  const file = String(msg.file ?? '');
  if (!file) return;
  await handleDk8sAnalyze({ file, analyzer: analyzerFor(file) }, postMessage, extensionRoot);
}

/** Reveal the artifact folder in the OS file manager. */
export async function handleDk8sRevealArtifacts(): Promise<void> {
  const dir = artifactDir();
  await mkdirp(dir, { recursive: true });
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
  pvCancel.cancelled = true;
  pvCancel = { cancelled: false };
  const signal = pvCancel;

  const targets = (msg.targets as SearchTarget[]) ?? [];
  const opts: SearchOptions = {
    ...DEFAULT_SEARCH,
    ...(msg.options as Partial<SearchOptions> ?? {}),
  };

  if (!targets.length || !opts.query.trim()) {
    postMessage({ type: 'dk8s:searchDone', pods: 0, matched: 0, scanned: 0, stopped: false });
    return;
  }

  /*
    The archive is searched alongside the live logs, not instead of them.

    `kubectl logs` reaches the current container and the one before it, and
    nothing else. A pod that has restarted three hundred times has lost the
    restart that mattered, and that is exactly the search someone is running.
    So when a volume is configured, every target is looked for there too and
    the hits are merged into the same result list, each one labelled with
    where it came from.

    Archives are searched after the live pods rather than at the same time:
    the live answer is the common one and it arrives in milliseconds, while a
    volume can be tens of gigabytes. Nobody should wait on the slow half to
    see the fast half.
  */
  const pv = pvConfig();
  /*
    Asked through `mountsOf`, not through `pv.root`.

    `root` is the deprecated single-mount field, kept only so an old config
    still loads. Every config the settings screen writes uses `mounts`, so
    gating on `root` meant the archive pass never ran for anyone who had
    configured archives through the UI — the feature was dead for its own
    supported shape, and silently: the live half returned, the archive half
    was skipped, and nothing said so.
  */
  const searchArchive = !!pv?.enabled && mountsOf(pv).length > 0;

  postMessage({
    type: 'dk8s:searchStarted',
    total: targets.length,
    query: opts.query,
    archive: searchArchive,
  });

  activeSearch = searchLogs(targets, opts, {
    onPodDone: (result, matches) => {
      postMessage({ type: 'dk8s:searchPod', result, matches });
    },
    onProgress: (done, total, pod) => {
      postMessage({ type: 'dk8s:searchProgress', done, total, pod });
    },
    onFinished: (summary) => {
      activeSearch = undefined;
      if (!searchArchive || signal.cancelled) {
        postMessage({ type: 'dk8s:searchDone', ...summary });
        return;
      }
      void searchArchives(pv!, targets, opts, summary, signal, postMessage);
    },
  });
}

/** Cancels an archive pass, which is not an activeSearch handle. */
let pvCancel = { cancelled: false };

function pvConfig(): PvLogConfig | undefined {
  return state().pvLogs;
}

/**
 * The archive half of a search.
 *
 * One pod at a time and sequential: this is local disk, and reading four
 * multi-gigabyte files at once is slower than reading them in turn, not
 * faster. Progress is reported per pod so the dialog keeps moving.
 */
async function searchArchives(
  cfg: PvLogConfig,
  targets: SearchTarget[],
  opts: SearchOptions,
  live: { pods: number; matched: number; scanned: number; stopped: boolean },
  signal: { cancelled: boolean },
  postMessage: PostMessage,
): Promise<void> {
  let matched = live.matched;
  let scanned = live.scanned;
  let done = 0;

  for (const t of targets) {
    if (signal.cancelled) break;
    postMessage({ type: 'dk8s:searchProgress', done, total: targets.length, pod: t.pod, archive: true });
    let out: { result: unknown; matches: PvMatch[] };
    try {
      // The context travels with the ref: it is what `{env}` resolves from,
      // and without it a prod pod would read every environment's claim.
      out = await searchPvForPod(
        cfg,
        { namespace: t.namespace, pod: t.pod, context: t.context, workload: t.workload },
        opts, signal,
      );
    } catch (e) {
      postMessage({
        type: 'dk8s:searchArchivePod',
        result: {
          pod: t.pod, namespace: t.namespace, scanned: 0, matched: 0, capped: false,
          elapsedMs: 0, files: [], error: e instanceof Error ? e.message : String(e),
        },
        matches: [],
      });
      done++;
      continue;
    }
    const r = out.result as { matched: number; scanned: number; files: unknown[] };
    matched += r.matched;
    scanned += r.scanned;
    done++;
    // Only pods with something to show: a row per pod that has no archive is
    // noise in a result list that already has the live half in it.
    if (r.matched > 0 || r.files.length > 0) {
      postMessage({ type: 'dk8s:searchArchivePod', result: out.result, matches: out.matches });
    }
  }

  postMessage({
    type: 'dk8s:searchDone',
    pods: live.pods,
    matched,
    scanned,
    stopped: live.stopped || signal.cancelled,
  });
}

/** Whether a volume is configured, and what it can see — for the settings page. */
export async function handleDk8sProbePv(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const draft = msg.config as PvLogConfig | undefined;
  const cfg = draft ?? pvConfig();

  // A probe with no draft is the settings page opening, so it also needs what
  // is stored — otherwise the page would render empty over a real config.
  if (!draft) postMessage({ type: 'dk8s:pvConfig', config: cfg ?? null });

  if (!cfg) {
    postMessage({
      type: 'dk8s:pvProbe',
      probe: { ok: false, root: '', topLevel: [], fileCount: 0, totalBytes: 0, sample: [] },
    });
    return;
  }
  // A probe is the user asking "is this right now?", so it never answers from
  // a cache built before they changed the path.
  clearPvCache();
  postMessage({ type: 'dk8s:pvProbe', probe: await probePv(cfg) });
}

/** Save the volume configuration and hand back what it now sees. */
export async function handleDk8sSavePv(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const cfg = msg.config as PvLogConfig;
  saveState({ pvLogs: cfg });
  clearPvCache();
  postMessage({ type: 'dk8s:pvConfig', config: cfg });
  // Same reason as above: a config with mounts and no legacy root would save
  // without ever reporting whether the path it named actually exists.
  if (cfg && mountsOf(cfg).length > 0) {
    postMessage({ type: 'dk8s:pvProbe', probe: await probePv(cfg) });
  }
}

export function handleDk8sCancelSearch(postMessage: PostMessage): void {
  activeSearch?.cancel();
  pvCancel.cancelled = true;
  activeSearch = undefined;
  postMessage({ type: 'dk8s:searchCancelled' });
}

/**
 * Open an archived log file in the editor, at the line that matched.
 *
 * The pod behind an archived hit has usually been replaced — that is why the
 * log is on the volume at all — so there is no live log to jump to. The file
 * is opened read-only in a normal editor tab, where the search, folding and
 * navigation people already know all work.
 */
export async function handleDk8sOpenLogFile(msg: Record<string, unknown>): Promise<void> {
  const file = String(msg.file ?? '');
  if (!file) return;
  const line = Math.max(0, Number(msg.line ?? 1) - 1);
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    const at = new vscode.Position(Math.min(line, doc.lineCount - 1), 0);
    editor.selection = new vscode.Selection(at, at);
    editor.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenter);
  } catch (e) {
    vscode.window.showErrorMessage(
      `Could not open ${file}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
