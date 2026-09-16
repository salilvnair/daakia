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
  clearPvCache, mountsOf, type PvLogConfig,
} from '../../../services/k8s/pv-logs';
import { type PvMatch } from '../../../services/k8s/pv-search';
import { searchPvInPod } from '../../../services/k8s/pv-search-in-pod';
import { fetchFromPod } from '../../../services/k8s/pv-in-pod';
import * as path from 'path';
import { promises as fs } from 'fs';
import {
  listContexts, checkReachable, listNamespaces, defaultNamespace, looksLikeProduction,
} from '../../../services/k8s/kube-context';
import { getSetting, setSetting, insertUiAudit } from '../../../storage/db';
import { onKubectl, recentKubectl, type KubectlEvent } from '../../../services/k8s/kubectl-audit';
import {
  setClusterTimeoutSeconds, clusterTimeoutSeconds, clampTimeoutSeconds,
} from '../../../services/k8s/k8s-timeouts';
import { watchPods, topPods, type WatchHandle } from '../../../services/k8s/k8s-watch';
import {
  exportPodLogs, exportVisibleLines, summariseExport,
  type ExportTarget, type ExportOptions,
} from '../../../services/k8s/k8s-logs';
import { ExportCancelled } from '../../../services/k8s/pv-stream';
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
import { handleJfrAnalyze } from './jfr-handler';
import { streamLogs, type LogStreamHandle } from '../../../services/k8s/k8s-log-stream';
import { run, kubectlBinary, resolveBinary } from '../../../services/k8s/kubectl';
import { clearAccessCache } from '../../../services/k8s/k8s-access';
import { probeCapabilities, classifyFromSpec, availableActions, execFailureKind } from '../../../services/k8s/pod-classify';
import {
  markFor, setMark, targetFromSpec, type MarkTarget,
} from '../../../services/k8s/runtime-marks';
import type { PodRuntime } from '../../../services/k8s/pod-classify';

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
   * How long to wait for a cluster call, in seconds.
   *
   * One ceiling for everything that talks to a cluster — see k8s-timeouts.
   * Undefined means the default, which is what every install has until
   * somebody has a cluster slow enough to care.
   */
  clusterTimeoutSeconds?: number;
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
/**
 * A refresh has to actually re-ask.
 *
 * `probeAccess` caches its answer for five minutes, which is right — seven
 * SelfSubjectAccessReviews per pod open is not free, and permissions rarely
 * change. It is wrong when the answer was taken against the wrong cluster, or
 * before somebody was granted the role they just asked for: a stale "denied"
 * then outlives every refresh in the panel, and the only thing that clears it
 * is restarting the editor. Which is what people did.
 *
 * So an explicit probe drops it. Not the periodic ones — only the ones a
 * person asked for.
 */
/**
 * Write every kubectl dk8s runs into the audit, and show it to the panel.
 *
 * Installed once, from wherever the handler is first used. Two destinations,
 * for two different questions: the audit row is the record you go back to
 * ("what did it actually pass?"), and the live message is what a loading state
 * uses to say what it is waiting on rather than spinning anonymously.
 *
 * The subscription lives here rather than in the recorder because reaching the
 * database from `services/k8s` would drag the VS Code API into every test that
 * touches a cluster call — see kubectl-audit.
 */
let auditInstalled = false;
let postForAudit: PostMessage | undefined;

export function installKubectlAudit(postMessage: PostMessage): void {
  postForAudit = postMessage;
  if (auditInstalled) return;
  auditInstalled = true;
  onKubectl((event: KubectlEvent) => {
    /*
      The webview hears about a call twice — when it is fired and when it comes
      back — because a screen waiting on one needs to name it while the wait is
      happening. The audit log wants one row, written when there is an outcome
      to write, so the announcement is posted and not stored.
    */
    const announcement = event.kind === 'run' && event.ms === undefined;
    if (!announcement) try {
      insertUiAudit({
        event_type: event.kind === 'stream' ? 'dk8s.kubectl.stream' : 'dk8s.kubectl',
        module: 'dk8s',
        button: event.what,
        action: event.command,
        metadata: JSON.stringify({
          context: event.context, namespace: event.namespace,
          ms: event.ms, exit: event.code, ok: event.ok,
          said: event.said, bytes: event.bytes,
          /* Recorded, so the audit stays complete — and marked, so a metrics
             poll every fifteen seconds per namespace does not bury the
             commands somebody actually ran. */
          source: event.source,
          /* The kind, so Settings → DK8S → Commands can group by it. */
          op: event.op,
        }),
      });
    } catch { /* auditing must never be why a cluster call fails */ }
    try {
      postForAudit?.({ type: 'dk8s:command', event });
    } catch { /* same */ }
  });
}

/** The last few commands, for a panel that opened after they ran. */
export function handleDk8sCommands(postMessage: PostMessage): void {
  postMessage({ type: 'dk8s:commands', events: recentKubectl() });
}

export async function handleDk8sProbe(postMessage: PostMessage): Promise<void> {
  installKubectlAudit(postMessage);
  const saved = state();
  if (saved.kubectlPath) setKubectlPath(saved.kubectlPath);
  /* Applied before anything is asked of a cluster: every bound below derives
     from it, and so does the screen's own backstop. */
  setClusterTimeoutSeconds(saved.clusterTimeoutSeconds);

  /* See the note above: a refresh that returns the cached answer is not one. */
  clearAccessCache();

  const env = await probeEnvironment();
  if (!env.present) {
    postMessage({
      type: 'dk8s:env', env, contexts: [], platform: process.platform,
      clusterTimeoutSeconds: clusterTimeoutSeconds(),
    });
    return;
  }

  const list = await listContexts();
  // Prefer what the user chose here before falling back to the kubeconfig's
  // current-context: dk8s never changes the global default, so the two can
  // legitimately differ and ours wins inside the tab.
  /*
    What the reader picked beats what kubectl happens to be pointing at.

    This used to fall straight from `saved.context` to `list.current`, skipping
    the multi-select entirely — so somebody whose selection was kind-dk8s-lab
    had every single-context operation run against kubectl's current-context
    instead. Reachability was checked on the wrong cluster, came back refused,
    and the tab reported that you could not get pods on a cluster you could
    read perfectly well from k9s in the next window.

    kubectl's own current-context is the LAST resort now, not the second. It
    describes what somebody's shell is doing, which has nothing to do with
    what they asked this tab for.
  */
  const valid = (c?: string) => !!c && list.contexts.some(x => x.name === c);
  const selection = (saved.contexts ?? []).find(valid);
  const chosen = valid(saved.context) ? saved.context
    : selection ?? (valid(list.current) ? list.current : list.contexts[0]?.name);

  /*
    A saved selection is a memory, not a fact.

    Contexts come and go from a kubeconfig — a kind cluster is deleted, Docker
    Desktop's Kubernetes is switched off, a colleague's context is removed after
    an engagement ends. What was selected then is not necessarily selectable
    now, and handing a stale name to the namespace query produces the one
    failure nobody can act on: `context "docker-desktop" does not exist`,
    repeated on every refresh, for a cluster the reader may not even remember
    adding.

    `chosen` above already checks itself against the kubeconfig. The multi-select
    path did not, which is the whole bug — so it is filtered the same way here,
    and what was dropped is reported rather than silently forgotten.
  */
  const known = new Set(list.contexts.map(c => c.name));
  const savedContexts = saved.contexts ?? (chosen ? [chosen] : []);
  const liveContexts = savedContexts.filter(c => known.has(c));
  const droppedContexts = savedContexts.filter(c => !known.has(c));

  const savedTargets = saved.targets ?? (chosen && saved.namespace
    ? [{ context: chosen, namespace: saved.namespace }]
    : []);
  const liveTargets = savedTargets.filter(t => known.has(t.context));

  /* Persist the pruning, so a context that has gone is gone for good rather
     than coming back the next time the panel opens. */
  if (droppedContexts.length) {
    saveState({
      contexts: liveContexts,
      targets: liveTargets,
      context: liveContexts.includes(saved.context ?? '') ? saved.context : liveContexts[0],
    });
  }

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
    /* So a screen can derive its own backstop from the same number rather than
       inventing one that fires before the call it is timing. */
    clusterTimeoutSeconds: clusterTimeoutSeconds(),
    contexts: list.contexts,
    contextError: list.error,
    context: chosen,
    namespace,
    reachable,
    sensitivity: saved.sensitivity ?? {},
    pinned: chosen ? pinnedFor(chosen) : [],
    selectedContexts: liveContexts.length || !chosen ? liveContexts : [chosen],
    targets: liveTargets.length || !(chosen && namespace)
      ? liveTargets
      : [{ context: chosen, namespace }],
    /* Named once, so somebody who deleted a cluster on purpose is told rather
       than left wondering where a name they no longer recognise came from. */
    droppedContexts,
    // A context the user has not classified yet needs the one-time prompt.
    /*
      Nothing is asked up front any more.

      This drove a full-screen prompt between the reader and their pods, to set
      a marker whose entire effect is a small chip in the breadcrumb — dk8s runs
      no delete, no scale, no rollout, no patch, and there is no type-the-name
      confirmation for it to gate. A guess is offered as the badge instead, and
      the breadcrumb is where it gets corrected, which is what the prompt itself
      told people to do.
    */
    needsSensitivity: false,
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

/**
 * Namespaces for several contexts, each tagged with where it came from.
 *
 * This is also the only moment a saved namespace can be checked. A context can
 * be validated against the kubeconfig for free, but a namespace only exists as
 * far as the cluster is concerned — so a target saved months ago, for a
 * namespace since deleted, survives every probe until somebody actually asks
 * the cluster. Which is here.
 */
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

  /*
    Prune saved targets against what the cluster just said — and ONLY against a
    cluster that actually answered.

    The distinction is the whole point. A cluster that is unreachable has told
    us nothing about its namespaces, and dropping a target because a VPN was
    down would quietly discard a watch somebody set up deliberately. An answer
    that does not contain the namespace is different: that is the cluster
    saying it is gone.
  */
  const answered = per.filter(r => !r.error && r.namespaces.length > 0);
  if (answered.length) {
    const saved = state().targets ?? [];
    const live = saved.filter(t => {
      const said = answered.find(r => r.context === t.context);
      if (!said) return true;                       // it did not answer; keep it
      return said.namespaces.includes(t.namespace)
        || (pins[t.context] ?? []).includes(t.namespace);  // pinned on purpose
    });
    const gone = saved.filter(t => !live.includes(t));
    if (gone.length) {
      saveState({ targets: live });
      /* Named, not swallowed — a watch disappearing without explanation is
         indistinguishable from dk8s losing it. */
      postMessage({ type: 'dk8s:targetsPruned', gone, targets: live });
    }
  }

  postMessage({ type: 'dk8s:namespacesMulti', perContext: per });
}

/**
 * Make a context the kubeconfig default — the one thing dk8s does to your
 * kubeconfig, and only ever because you asked for it from the menu.
 *
 * It changes nothing about dk8s, which names the context on every command and
 * would behave identically either way. It is here because the rest of your
 * tools do not: a bare `kubectl get pods` in a terminal, a Helm invocation, a
 * script somebody wrote years ago. Setting it from the cluster you are already
 * looking at saves switching windows to run one command.
 */
export async function handleDk8sSetDefaultContext(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const context = String(msg.context ?? '').trim();
  if (!context) return;

  const r = await run(['config', 'use-context', context], { timeoutMs: 10_000 });
  postMessage({
    type: 'dk8s:defaultContextSet',
    context,
    ok: r.ok,
    error: r.ok ? undefined : (r.stderr || r.failure || '').trim(),
  });
  /* The picker draws a badge on whichever context is current, so it has to be
     told — nothing else would make that badge move. */
  if (r.ok) await handleDk8sProbe(postMessage);
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

  /*
    Metrics wait for the pod list, and do not race it.

    `top pods` is a second kubectl process against the same cluster, and it was
    fired the instant a watch started — so the slowest moment dk8s has, the one
    where somebody is staring at an empty grid, was also the moment it opened a
    competing connection. On a link where the pod list is already the
    bottleneck that is bandwidth taken from the only call anybody is waiting
    on, to fill a column that means nothing until the rows exist.

    Nothing is lost by waiting: usage is drawn per pod, and there are no pods
    until the snapshot lands.
  */
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

  let metricsStarted = false;
  const startMetrics = () => {
    if (metricsStarted) return;
    metricsStarted = true;
    void poll();
    live.metricsTimer = setInterval(poll, METRICS_INTERVAL_MS);
  };

  live.handle = watchPods(context, namespace, {
    onSnapshot: (pods) => {
      live.pods = pods;
      postMessage({ type: 'dk8s:podSnapshot', context, namespace, pods });
      startMetrics();
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
  stopLogStreams();
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

  /*
    One export at a time, with a handle on it.

    A second one started over the top of the first would write the same files
    from two places, and there would be no way to say which of them Cancel
    meant.
  */
  exportCancel?.();
  const token = { cancelled: false };
  exportCancel = () => { token.cancelled = true; };

  try {
    // The archive travels with the options, same as the match export: a whole
    // log that stops at what kubectl still holds is not the whole log.
    const results = await exportPodLogs(
      targets,
      { ...options, pv: pvConfig(), cancelled: () => token.cancelled },
      destDir,
      (done, total, pod) => {
        postMessage({ type: 'dk8s:exportProgress', done, total, pod });
      },
      /*
        Bytes, for the archived half — the one that takes minutes. The pod
        count is the wrong unit when a single volume *is* the export.
      */
      p => postMessage({
        type: 'dk8s:exportBytes',
        pod: p.pod, file: p.file,
        bytes: p.bytes, totalBytes: p.totalBytes,
        index: p.index, count: p.count,
      }),
    );
    postMessage({
      type: 'dk8s:exportDone',
      destDir,
      results,
      summary: summariseExport(results),
    });
  } catch (err) {
    if (err instanceof ExportCancelled) {
      postMessage({ type: 'dk8s:exportCancelled' });
    } else {
      postMessage({ type: 'dk8s:exportError', error: (err as Error).message });
    }
  } finally {
    exportCancel = undefined;
  }
}

/** Set while an export is running, so Cancel has something to pull. */
let exportCancel: (() => void) | undefined;

/**
 * Stop an export that is under way.
 *
 * The partial file is removed rather than left behind — see `pv-stream`. A
 * half-written log is worse than none: it is named like a log, it opens like
 * one, and the half that is missing is the end.
 */
export function handleDk8sCancelExport(postMessage: PostMessage): void {
  if (!exportCancel) { postMessage({ type: 'dk8s:exportCancelled' }); return; }
  exportCancel();
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

/**
 * The log streams that are open, keyed by the pod each belongs to.
 *
 * It used to be one handle: opening a pod stopped whatever was streaming and
 * took its place, which is right for a detail view that shows one pod and
 * impossible for a split that shows two. Following two replicas of the same
 * app to see which of them is the one failing is the whole point of a split,
 * and one handle could never do it.
 *
 * Keyed by cluster, namespace and pod together. Two namespaces can hold a pod
 * of the same name, and on a key that was only the name the second one's lines
 * would arrive under the first one's pane.
 */
const logStreams = new Map<string, LogStreamHandle>();

function streamKey(context: string, namespace: string, pod: string): string {
  return `${context}/${namespace}/${pod}`;
}

/** Stop one stream, or every one of them. */
function stopLogStreams(key?: string): void {
  if (key) {
    logStreams.get(key)?.stop();
    logStreams.delete(key);
    return;
  }
  for (const h of logStreams.values()) h.stop();
  logStreams.clear();
}

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
  sample: string[],
  pinnedId?: string,
): Promise<{ format?: LogFormat; via: string }> {
  const available = allFormats();
  const pinned = pinnedId ? available.find(f => f.id === pinnedId) : undefined;
  if (pinned) return { format: pinned, via: 'pinned' };

  /*
    What the pod is, for matching a format by image or label.

    One call, and it no longer holds the log up: the stream starts at the same
    moment and this is awaited only when the sample is ready. It used to run
    first, in front of a second `kubectl logs` that fetched the very window the
    stream was about to fetch again — three round trips, in series, before a
    single line could appear.
  */
  let ctx: PodContext = { namespace, pod };
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
  return pickFormat(ctx, sample);
}

/**
 * Which format fits, given what the pod is and what it printed.
 *
 * The sample is the log's own first lines, handed over by the stream that is
 * already reading them. It used to come from a `kubectl logs --tail=200` of
 * its own, immediately before the stream ran the same query again — the same
 * window across the network twice, one after the other.
 *
 * Two hundred lines because a CrashLoopBackOff container dies inside a stack
 * trace: its last twenty-five lines are twenty-five frames, and a smaller
 * sample sees no events at all.
 */
function pickFormat(
  ctx: PodContext,
  sample: string[],
): { format?: LogFormat; via: string } {
  const chosen = chooseFormat({
    pinned: undefined, saved: state().logFormats ?? [],
    builtins: BUILTIN_FORMATS, ctx, sample,
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

  const pinnedId = msg.formatId as string | undefined;
  const pinned = pinnedId ? allFormats().find(f => f.id === pinnedId) : undefined;

  /* A pinned format needs nothing worked out, so it is named before a line
     arrives. Everything else is decided from the log's own first lines, by the
     stream that is already reading them. */
  if (pinned) {
    postMessage({
      type: 'dk8s:logFormat', pod,
      formatId: pinned.id, formatName: pinned.name, via: 'pinned',
    });
  }

  let via = 'pinned';

  /*
    A pane keeps the others running; the detail view does not.

    Opening a pod from the grid means "show me this pod", and leaving the
    previous one streaming would keep a kubectl process alive for a pod nobody
    is looking at. Opening one INTO a split means "and this one as well".
  */
  const key = streamKey(context, namespace, pod);
  if (msg.alongside) stopLogStreams(key); else stopLogStreams();

  logStreams.set(key, streamLogs(context, namespace, pod, {
    format: pinned,
    /*
      Worked out from the stream's own first lines.

      This used to be a `kubectl logs --tail=200` run to completion before the
      stream was opened — the same window fetched twice, in series, so nothing
      reached the screen until both had crossed the network. Across a VPN that
      was most of "why does opening a log take so long".
    */
    resolveFormat: pinned ? undefined : async (sample) => {
      const picked = await resolveFormatFor(context, namespace, pod, sample, pinnedId);
      via = picked.via;
      return picked.format;
    },
    // Follow only when asked. The default is a snapshot of the tail.
    follow: !!msg.follow,
    container: msg.container as string | undefined,
    previous: !!msg.previous,
    tailLines: (msg.tailLines as number) ?? 200,
    direction: msg.direction === 'first' ? 'first' : 'last',
    sinceSeconds: msg.sinceSeconds as number | undefined,
    /* A window with two fixed ends. The start is pushed to the server as
       `--since-time`; the end is filtered in the stream, because kubectl has
       no `--until-time`. */
    fromIso: msg.fromIso as string | undefined,
    toMs: msg.toMs as number | undefined,
  }, {
    // Named on screen, so it is always clear which format is running and how
    // it was picked — a wrong format is much easier to spot than to debug.
    onFormat: (format) => postMessage({
      type: 'dk8s:logFormat', pod,
      formatId: format?.id, formatName: format?.name, via,
    }),
    /* Namespace and cluster travel with every line. With two panes open the
       pod name alone is not an address — two namespaces can hold a pod called
       the same thing, and its lines would land in the other one's pane. */
    onLines: (lines) => postMessage({ type: 'dk8s:logLines', pod, namespace, context, lines }),
    onStatus: (status, detail) => postMessage({
      type: 'dk8s:logStatus', pod, namespace, context, status, detail,
    }),
    onDropped: (count) => postMessage({
      type: 'dk8s:logDropped', pod, namespace, context, count,
    }),
  }));
}

/**
 * Close one pod's stream, or all of them.
 *
 * A pane closing takes its own stream with it and leaves the others running;
 * the detail view, which owns the whole screen, closes everything.
 */
export function handleDk8sLogsClose(msg: Record<string, unknown> = {}): void {
  const pod = String(msg.pod ?? '');
  if (!pod) { stopLogStreams(); return; }
  stopLogStreams(streamKey(
    String(msg.context ?? state().context ?? ''),
    String(msg.namespace ?? ''),
    pod,
  ));
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
  try {
    await openShell(msg, postMessage);
  } catch (err) {
    /*
      A floor under the whole thing.

      The dispatcher called this without awaiting it and without a catch, so
      anything thrown in here — kubectl missing from the path, a terminal that
      would not open — became an unhandled rejection and the click did nothing.
      A failure the reader can see beats one only the console saw.
    */
    postMessage({
      type: 'dk8s:shellUnavailable',
      pod: String(msg.pod ?? '(unknown)'),
      reason: err instanceof Error ? err.message : String(err),
      suggestion: `kubectl -n ${String(msg.namespace ?? '<ns>')} exec -it `
        + `${String(msg.pod ?? '<pod>')} -- sh`,
      suggestionLabel: 'Run it yourself to see the raw error:',
    });
  }
}

/**
 * Which shell a container has, once anybody has found out.
 *
 * Opening a terminal used to cost up to three sequential `exec … which`
 * round trips before the PTY started — one per candidate, each a full
 * connection upgrade and container attach. On an image with only `sh` that
 * is two, and the first of them has to FAIL first, which is the slow kind.
 * `kubectl exec -it pod -- sh` in a normal terminal does none of that, which
 * is the whole of why this felt slow next to it.
 *
 * The capability probe already answers this when a pod is opened, so the
 * answer is kept and the terminal asks nobody. A container's shell does not
 * change while it is running; a restart replaces the pod and the entry is
 * keyed by pod name, so a new one probes again.
 */
const shellCache = new Map<string, string>();

function shellKey(context: string, namespace: string, pod: string, container?: string): string {
  return `${context}/${namespace}/${pod}/${container ?? ''}`;
}

export function rememberShell(
  context: string, namespace: string, pod: string, container: string | undefined,
  shell: string | null,
): void {
  if (shell) shellCache.set(shellKey(context, namespace, pod, container), shell);
}

/** Only for tests and for a pod that has just been replaced. */
export function clearShellCache(): void {
  shellCache.clear();
}

async function openShell(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const context = String(msg.context ?? state().context ?? '');
  const namespace = String(msg.namespace ?? '');
  const pod = String(msg.pod ?? '');
  const container = msg.container as string | undefined;
  /*
    A bare `return` here was a click that did nothing, silently.

    Every other outcome of this handler posts something back — a terminal, or
    a notice explaining why there is not one. This path posted nothing, so a
    request arriving before the context resolved looked exactly like a dead
    button, and there is no reading of "nothing happened" a user can act on.
  */
  if (!context || !namespace || !pod) {
    postMessage({
      type: 'dk8s:shellUnavailable',
      pod: pod || '(unknown)',
      reason: 'dk8s does not know which cluster or namespace this pod is in yet.',
      suggestion: 'Reopen the pod from the grid, which carries the context with it.',
      suggestionLabel: 'If it keeps happening:',
    });
    return;
  }

  // Distroless images have no bash, and many have no sh either. `exec -- bash`
  // on one fails with an OCI error that reads like a permissions problem and
  // sends people down entirely the wrong path, so probe first.
  let shell: string | undefined = shellCache.get(shellKey(context, namespace, pod, container));
  let lastError = '';
  /* Nothing to ask when the capability probe already found out — see
     shellCache. Otherwise: bash first, because it makes the better terminal,
     and stop at the first one that answers. */
  for (const candidate of shell ? [] : ['bash', 'sh', 'ash']) {
    const r = await run([
      '--context', context, '-n', namespace, 'exec', pod,
      ...(container ? ['-c', container] : []),
      '--', 'which', candidate,
    ], { timeoutMs: 15_000 });
    if (r.ok && r.stdout.trim()) {
      shell = candidate;
      rememberShell(context, namespace, pod, container, shell);
      break;
    }
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
/**
 * Record that somebody knows what this is.
 *
 * The pod is re-probed afterwards rather than the answer being patched in
 * place: a runtime decides which actions are offered, and those come from a
 * capability probe against the real container. Marking a pod Java has to
 * produce the same screen as dk8s having recognised it — not a Java label over
 * an action list built for an unknown.
 */
export async function handleDk8sMarkRuntime(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const target = msg.target as MarkTarget | undefined;
  const scope = msg.scope === 'pod' ? 'pod' as const : 'workload' as const;
  if (!target?.context || !target?.namespace || !target?.pod) return;

  const runtime = msg.runtime as PodRuntime | undefined;
  setMark(target, scope, runtime);

  await handleDk8sProbePod({
    context: target.context, namespace: target.namespace, pod: target.pod,
    container: msg.container,
  }, postMessage);
}

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
  let markTarget: MarkTarget | undefined;
  try {
    const parsed = JSON.parse(spec.stdout);
    runtime = classifyFromSpec(parsed);
    markTarget = targetFromSpec(context, namespace, parsed);
  } catch { /* fall through with unknown */ }

  /*
    What somebody said beats what dk8s worked out.

    A guess is good and not complete — a distroless image, a wrapper script or
    a company base image nobody outside the company has heard of all come back
    unknown, and an unknown pod is offered nothing but its logs. Marking one
    is the way out that does not require write access to the cluster.
  */
  const mark = markTarget ? markFor(markTarget) : undefined;
  if (mark) runtime = { runtime: mark.runtime, confidence: 1, detectedFrom: 'user' };

  const caps = await probeCapabilities(context, namespace, pod, container);
  /* The terminal asks nobody when this already found out — see shellCache. */
  rememberShell(context, namespace, pod, container, caps.shell);

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
    /* So the screen can say what it is marked as, and offer to change it. */
    mark, markTarget,
  });
}

/**
 * How long to wait for a cluster, in seconds.
 *
 * Stored, applied at once, and echoed back — the panel derives its own "I have
 * heard nothing" backstop from it, and a UI that guessed its own number is the
 * bug this setting exists to retire.
 */
export async function handleDk8sSetClusterTimeout(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const seconds = clampTimeoutSeconds(Number(msg.seconds));
  setClusterTimeoutSeconds(seconds);
  saveState({ clusterTimeoutSeconds: seconds });
  postMessage({ type: 'dk8s:clusterTimeout', seconds });
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

  /*
    A follow-up carries no evidence, and that is not the same as nothing.

    The first question sends the artifact; the ones after it send a question
    and the conversation so far, because the model has already been shown the
    log. Rejecting an empty body here — which is what happened — made every
    follow-up fail with "Nothing selected to ask about" on a thread that
    plainly had something to ask about.
  */
  const history = Array.isArray(msg.history)
    ? msg.history as { q?: string; a?: string }[]
    : [];

  if (!evidence.trim() && !history.length) {
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
    /*
      The thread so far, as the turns it actually was.

      Flattening it into the user prompt would work and would be wrong: a
      model reads its own previous answers differently from text quoted at it,
      and a follow-up like "and the restarts?" needs the last answer to be an
      ANSWER rather than a paragraph inside the new question.
    */
    conversation: history.length
      ? history.flatMap(h => [
        { role: 'user' as const, content: String(h.q ?? '') },
        { role: 'assistant' as const, content: String(h.a ?? '') },
      ]).filter(m => m.content)
      : (msg.conversation ?? []),
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
      : kind === 'jfr' ? 'cpu'
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
    case 'cpu':
      handleJfrAnalyze({ path: file }, postMessage);
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
 * One pod at a time and sequential. It used to be that way because this was
 * local disk and four multi-gigabyte reads at once are slower than four in a
 * row; it stays that way because each pod now costs an exec into a container,
 * and a fan-out of those against a namespace is a burst the API server sees as
 * one client misbehaving. Progress is reported per pod so the dialog keeps
 * moving either way.
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
  /*
    Everywhere this looked, whether or not anything was in it.

    An archive search that finds nothing and one that looked in the wrong place
    are the same empty list on screen, and the paths are what tell them apart.
    Collected across the pods and reported once at the end, because they are
    the same paths for every pod nearly every time and a line per pod saying so
    would bury the results.
  */
  const roots = new Set<string>();

  for (const t of targets) {
    if (signal.cancelled) break;
    postMessage({ type: 'dk8s:searchProgress', done, total: targets.length, pod: t.pod, archive: true });
    let out: { result: unknown; matches: PvMatch[] };
    try {
      // The context travels with the ref: it is what `{env}` resolves from,
      // and without it a prod pod would read every environment's claim.
      out = await searchPvInPod(
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
    const r = out.result as {
      matched: number; scanned: number; files: unknown[]; roots?: string[];
    };
    for (const root of r.roots ?? []) roots.add(root);
    matched += r.matched;
    scanned += r.scanned;
    done++;
    /*
      Only pods with something to say. A row per pod that simply has no
      archive is noise in a list that already carries the live half — but a
      pod whose archive could not be READ has something to say, and hiding
      that row turned "no grep in this image" into "no matches".
    */
    if (r.matched > 0 || r.files.length > 0 || (out.result as { error?: string }).error) {
      postMessage({ type: 'dk8s:searchArchivePod', result: out.result, matches: out.matches });
    }
  }

  postMessage({
    type: 'dk8s:searchDone',
    pods: live.pods,
    matched,
    scanned,
    stopped: live.stopped || signal.cancelled,
    archiveRoots: [...roots],
  });
}

/**
 * The saved volume configuration, for the settings page opening.
 *
 * It used to walk the configured paths as well and report what was under
 * them. That walk ran `fs` on this machine, so a path inside a container came
 * back resolved against a drive letter — the answer to a question nobody
 * asked. The paths are in-pod paths now, and the only thing that can read one
 * is a pod: see `handleDk8sPvList`.
 */
export function handleDk8sLoadPv(
  _msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  postMessage({ type: 'dk8s:pvConfig', config: pvConfig() ?? null });
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
/**
 * Open an archived log at the line that matched.
 *
 * The file is inside a container, so it is fetched out of the pod and written
 * where the editor can open it. Handing the in-pod path straight to
 * `Uri.file` was right only when the volume was mounted here: on Windows it
 * resolved `/prodapp-prod-pvc/prodapp.log` against a drive letter and failed
 * on a path nobody typed.
 *
 * Read-only, and named after the pod it came from. This is a copy of
 * somebody else's file taken at a moment in time; an editor that let you save
 * over it would be offering to write somewhere it cannot reach.
 */
export async function handleDk8sOpenLogFile(msg: Record<string, unknown>): Promise<void> {
  const file = String(msg.file ?? '');
  if (!file) return;
  const line = Math.max(0, Number(msg.line ?? 1) - 1);

  const pod = String(msg.pod ?? '');
  const namespace = String(msg.namespace ?? '');
  const context = String(msg.context ?? state().context ?? '');

  try {
    let uri: vscode.Uri;

    if (pod && namespace && context) {
      const got = await fetchFromPod({ context, namespace, pod }, file);
      if (got.error) {
        vscode.window.showErrorMessage(`Could not open ${file}: ${got.error}`);
        return;
      }
      /* Somewhere the editor can open and the user can throw away. The pod is
         in the name because two pods can hold files of the same name and a
         tab called `prodapp.log` would not say which one this is. */
      const dir = path.join(os.tmpdir(), 'dk8s-archive');
      await fs.mkdir(dir, { recursive: true });
      const local = path.join(dir, `${pod}-${path.basename(got.path)}`);
      await fs.writeFile(local, got.text, 'utf8');
      uri = vscode.Uri.file(local);

      if (got.truncated) {
        vscode.window.showWarningMessage(
          `${path.basename(got.path)} is larger than dk8s fetches, so this is the end of it`
          + `${got.droppedLines ? ` — about ${got.droppedLines.toLocaleString()} earlier lines are not here` : ''}.`
          + ' Line numbers will not match the file in the pod.',
        );
      }
    } else {
      /* No pod on the message: an older result, or an archive genuinely on
         this machine. The original behaviour, which is right for that. */
      uri = vscode.Uri.file(file);
    }

    const doc = await vscode.workspace.openTextDocument(uri);
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
