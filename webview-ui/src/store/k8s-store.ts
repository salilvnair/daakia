/**
 * dk8s state.
 *
 * The host owns the truth — it is what runs kubectl — so this store holds what
 * the host last told us plus purely local UI state. Nothing here decides
 * anything about a cluster; it renders what came back.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import type { FieldFilter } from '../components/k8s/log-view';
import { logUiEvent } from './ui-audit-store';
import { useUiStateStore } from './ui-state-store';

/** Same shape as `rest.subtab.<id>` and friends — see setScopedPref. */
const DETAIL_TAB_PREF = 'dk8s.detailTab.';

/** Mirrors services/k8s/k8s-access.ts. */
export interface Access {
  logs: boolean;
  exec: boolean;
  get: boolean;
  events: boolean;
  portForward: boolean;
  delete: boolean;
  patch: boolean;
  /** False when the probe could not run — nothing was actually checked. */
  probed: boolean;
}

export const ALL_ACCESS: Access = {
  logs: true, exec: true, get: true, events: true,
  portForward: true, delete: true, patch: true, probed: false,
};

export interface KubeContext {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
  current: boolean;
}

export interface KubectlEnv {
  present: boolean;
  binary?: string;
  clientVersion?: string;
  platform: string;
  triedPaths?: string[];
  error?: string;
}

export interface Reachability {
  reachable: boolean;
  serverVersion?: string;
  error?: string;
}

export type Sensitivity = 'normal' | 'production';

/** One namespace in one cluster — the unit dk8s watches. */
export interface WatchTarget {
  context: string;
  namespace: string;
}

export const targetKey = (t: WatchTarget) => `${t.context}/${t.namespace}`;

/** Namespaces offered per cluster, for the multi-select screen. */
export interface NamespaceOffer {
  context: string;
  namespaces: string[];
  forbidden: boolean;
  fallback?: string;
  error?: string;
  pinned: string[];
}

export interface ContainerSummary {
  name: string;
  ready: boolean;
  restarts: number;
  image: string;
  reason?: string;
  lastReason?: string;
}

export interface PodSummary {
  name: string;
  namespace: string;
  /** Filled in on arrival — the API object does not carry it. */
  context?: string;
  uid: string;
  phase: string;
  reason?: string;
  ready: { current: number; total: number };
  restarts: number;
  lastRestartAt?: string;
  startedAt?: string;
  node?: string;
  containers: ContainerSummary[];
  workload?: { kind: string; name: string };
  image?: string;
  healthy: boolean;
  deleting: boolean;
}

export interface PodUsage {
  cpuMilli: number;
  memBytes: number;
}

/** Rolling memory samples per pod, so a card can draw a trend. */
export type UsageHistory = Record<string, number[]>;

export type WatchStatus = 'idle' | 'connected' | 'reconnecting' | 'stopped';

// ── Pod detail ──────────────────────────────────────────────────────────────

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'other';

export interface LogLine {
  seq: number;
  ts?: number;
  level: LogLevel;
  text: string;

  /**
   * Fields a configured FORMAT named on this line. Never guessed.
   *
   * These are parsed on the host and were previously dropped at this boundary,
   * which is why the log view had to guess at structure to offer a filter — and
   * why the Thread name menu ended up offering `na:na` and `app.jar:1.0.0`,
   * both of which are jar tags inside stack frames.
   *
   * Absent means absent: no format configured, or one is and this line did not
   * parse. A UI that offers "filter by thread" may only do so where a thread
   * was actually identified.
   */
  logger?: string;
  thread?: string;
  app?: string;

  /**
   * This line belongs to the event above it rather than being one itself.
   *
   * With a format configured this is exact — the format did not parse the
   * line, which is the whole definition of a continuation. Without one it is a
   * prefix heuristic, and `continuationGuessed` says so.
   */
  continuation?: boolean;
  continuationGuessed?: boolean;

  /** The line was longer than the cap; this is its head. */
  truncated?: boolean;
}

/**
 * `loading` is the gap between asking for logs and the first byte arriving.
 *
 * It exists because `idle` was doing two jobs — "nothing has been requested"
 * and "a request is in flight" — and the viewer rendered the same thing for
 * both: "No output yet.". So for the half-second round trip through kubectl,
 * every pod claimed to have produced no output, which is a statement of fact
 * about the pod made before anything had been read from it.
 */
export type LogStatus = 'idle' | 'loading' | 'streaming' | 'ended' | 'error';

export interface PodCapabilities {
  shell?: string;
  tar: boolean;
  python3: boolean;
  jcmd: boolean;
  jstack: boolean;
  jmap: boolean;
  jfr: boolean;
  targetPid?: string;
  unreachable?: string;
}

export interface PodAction {
  id: string;
  label: string;
  available: boolean;
  reason?: string;
  disruptive?: boolean;
  mutatesPod?: boolean;
}

export type DetailTab = 'overview' | 'logs' | 'terminal' | 'doctor' | 'explorer' | 'yaml' | 'describe';

export interface MemoryProfile {
  limitBytes?: number;
  requestBytes?: number;
  usageBytes?: number;
  maxHeapBytes?: number;
  initialHeapBytes?: number;
  usedHeapBytes?: number;
  /** True is the dangerous case: the dump file counts against the pod's memory. */
  dumpDirIsTmpfs?: boolean;
  dumpDirFreeBytes?: number;
  unknowns: string[];
}

export type SafetyVerdict = 'safe' | 'tight' | 'unsafe' | 'unknown';

export interface HeapDumpSafety {
  verdict: SafetyVerdict;
  headline: string;
  reasons: string[];
  estimatedCostBytes?: number;
  headroomBytes?: number;
  usedFraction?: number;
}

/**
 * A stretch of log the user has highlighted, held so the AI panel can act on
 * it after the browser selection is gone — clicking "Ask AI" collapses the
 * selection, so reading it at click time gets nothing.
 */
export interface LogSelection {
  text: string;
  firstSeq: number;
  lastSeq: number;
  lineCount: number;
}

/**
 * How many lines to hold.
 *
 * A pod at a few hundred lines a second fills this in minutes, and every line
 * is a React key and a DOM candidate. Past roughly this point the tab starts
 * to stutter regardless of virtualisation, so the buffer is bounded and the
 * drop is shown rather than hidden.
 */
export const LOG_BUFFER_MAX = 20_000;

export type LogRange =
  | { kind: 'all' }
  | { kind: 'since'; seconds: number }
  | { kind: 'between'; fromIso: string; toIso: string };

export type LogSlice =
  | { kind: 'all' }
  | { kind: 'head'; lines: number }
  | { kind: 'tail'; lines: number };

export interface ExportOptions {
  range: LogRange;
  slice: LogSlice;
  includePrevious: boolean;
  keepTimestamps: boolean;
}

export interface ExportResult {
  pod: string; namespace: string;
  file?: string; bytes?: number; lines?: number;
  empty?: boolean; error?: string; includedPrevious?: boolean;
}

export interface ExportState {
  phase: 'running' | 'done' | 'error' | 'cancelled';
  done: number;
  total: number;
  pod?: string;
  destDir?: string;
  summary?: string;
  results?: ExportResult[];
  error?: string;
}

/** How many usage samples to keep. At 15s each, ~10 minutes of trend. */
const USAGE_SAMPLES = 40;

/** Where the first-run flow currently is. `ready` means the tab can show pods. */
export type Dk8sStage =
  | 'probing'
  | 'no-kubectl'
  | 'no-contexts'
  | 'pick-context'
  | 'unreachable'
  | 'ask-sensitivity'
  | 'pick-namespace'
  | 'ready';

/**
 * Which half of dk8s is on screen.
 *
 * In the store rather than in the panel because opening an artifact has to
 * switch to `analyze`, and that happens from the artifact store — a collected
 * dump should land on its analyzer without you navigating there yourself.
 */
export type Dk8sView = 'pods' | 'artifacts';

interface K8sState {
  stage: Dk8sStage;
  panel: Dk8sView;
  setPanel: (v: Dk8sView) => void;
  env?: KubectlEnv;
  platform: string;

  contexts: KubeContext[];
  contextError?: string;
  context?: string;
  reachable?: Reachability;

  namespaces: string[];
  /** True when the cluster refused a cluster-scoped list — offer a text field. */
  namespacesForbidden: boolean;
  namespaceFallback?: string;
  namespaceError?: string;
  namespace?: string;
  /** Namespaces the user pinned for this context, sorted. */
  pinned: string[];

  /** Clusters ticked on the first screen. */
  selectedContexts: string[];
  /** Reachability per cluster, so one VPN-gated cluster is named. */
  contextResults: { context: string; reachable: Reachability }[];
  /** Namespaces on offer, per cluster. */
  offers: NamespaceOffer[];
  /** Everything being watched. */
  targets: WatchTarget[];
  /**
   * What the namespace picker currently has ticked, before it is committed.
   *
   * In the store rather than the picker's own state because two controls
   * commit it — the picker's Watch button and the one in the breadcrumb — and
   * a button outside the picker cannot reach a useState inside it.
   */
  pendingTargets: WatchTarget[];
  /** Set when more namespaces were ticked than dk8s will watch at once. */
  capped?: { requested: number; watching: number; max: number };

  sensitivity: Record<string, Sensitivity>;
  sensitivityGuess: boolean;

  busy: boolean;

  pods: PodSummary[];
  usage: Record<string, PodUsage>;
  usageHistory: UsageHistory;
  metricsAvailable: boolean;
  watchStatus: WatchStatus;
  watchDetail?: string;
  filter: string;
  view: 'cards' | 'table';
  selectedPod?: string;

  /** Bulk-select mode for export. Off until the user asks for it. */
  /**
   * Whether the pod list is showing starred pods or all of them.
   *
   * In the store rather than in the grid because Search Everywhere's picker
   * has to agree with it: offering every pod while the list in the background
   * shows four is a picker for a different screen. Not persisted — opening
   * dk8s starts on starred, every time.
   */
  /**
   * When the watch last said anything, as epoch ms.
   *
   * "watching" reports that the stream is up, which on a quiet namespace looks
   * identical to a stream that has heard nothing for an hour. The age of the
   * last event is the difference between "nothing is happening" and "I am not
   * being told what is happening".
   */
  lastEventAt?: number;
  podScope: 'fav' | 'all';
  setPodScope: (v: 'fav' | 'all') => void;
  selectMode: boolean;
  /** Pod uids ticked for export. */
  selected: string[];
  exportOpen: boolean;
  exportState?: ExportState;

  /** The pod whose detail panel is open, if any. */
  detail?: PodSummary;
  detailTab: DetailTab;
  /**
   * Where the Explorer should open, when something already knows.
   *
   * A file search hit is a place, not just a pod — landing on the default
   * root and making somebody navigate back to the directory they just
   * searched is the whole value of the hit thrown away.
   */
  explorerPath?: string;
  /**
   * The row to flash on arrival, and the way back.
   *
   * Landing in a directory of forty files having asked for one of them still
   * leaves the eye to find it, so the file is named and briefly marked. The
   * return flag is the other half: someone who came from a search is midway
   * through reading it, and closing the Explorer should put them back there
   * rather than at the top of a list they have already scrolled.
   */
  explorerHighlight?: string;
  explorerCameFromSearch?: boolean;
  logs: LogLine[];
  logStatus: LogStatus;
  /**
   * When the current log request went out.
   *
   * The viewer needs it to tell "this pod is quiet" from "we asked half a
   * second ago". The stream reports `streaming` as soon as it opens, which is
   * before the tail has been delivered, so status alone cannot make that call.
   */
  logRequestedAt: number;
  logDetail?: string;
  /** Lines discarded because the pod outran the reader. */
  logDropped: number;
  logFilter: string;
  logLevels: LogLevel[];
  /**
   * Filters on fields a format named, as opposed to on the line's text.
   *
   * Separate from `logFilter` because they are different questions and were
   * being answered with the same control: putting `[main]` in the search box
   * matched any message mentioning it and could not say "everything except".
   */
  logFieldFilters: FieldFilter[];
  logFollow: boolean;
  /**
   * Whether the stream is open.
   *
   * Off by default. A pod doing hundreds of lines a second makes the view
   * unreadable, the density ribbon thrash, and text impossible to select —
   * so opening a log gets you a snapshot of the tail, and live is a button.
   */
  logLive: boolean;
  /** How many lines the snapshot asks for. */
  logTail: number;
  /** Which end of the log — the tail, or what the pod said on startup. */
  logDirection: 'last' | 'first';
  /** Range pushed down to kubectl. */
  logSince: 'all' | 'restart' | '15m' | '1h' | '6h';
  /** Per-pod Download, using the same options as the grid's bulk export. */
  logExportOpen: boolean;
  logWrap: boolean;
  logPrevious: boolean;
  logContainer?: string;
  logSelection?: LogSelection;
  describeText?: string;
  yamlText?: string;
  describeBusy: boolean;
  capabilities?: PodCapabilities;
  runtime?: { runtime: string; confidence: number; detectedFrom: string };
  actions: PodAction[];
  probeBusy: boolean;
  /**
   * A probe for a pod the context menu is open on, which is usually not the
   * pod that is open.
   *
   * Kept apart from `actions` deliberately. Those describe the pod on screen
   * and drive its Doctor tab; writing a menu's probe into them would swap the
   * buttons under a pod being looked at, for a pod merely right-clicked.
   */
  menuProbe?: {
    pod: string;
    busy: boolean;
    actions: PodAction[];
    safety?: HeapDumpSafety;
  };
  /**
   * A copy waiting on the text it will copy.
   *
   * `kubectl describe` is a round trip, so "Copy describe" cannot return a
   * value the way copying a name does. The request is remembered and the
   * clipboard written when the answer lands.
   */
  pendingCopy?: { pod: string; kind: 'describe' | 'yaml' };
  memory?: MemoryProfile;
  safety?: HeapDumpSafety;
  /**
   * The guard is on by default. Someone who has deliberately turned it off in
   * Settings has said they know what they are doing; everyone else gets caught
   * before they OOM-kill the pod they were trying to diagnose.
   */
  guardHeapDump: boolean;
  /** Line numbers down the left of the log view. On unless turned off. */
  logLineNumbers: boolean;
  /**
   * What this account may do in the open pod's namespace.
   *
   * Everything is allowed until the probe says otherwise, so a slow or
   * missing answer never hides a tab that would have worked.
   */
  access: Access;
  shellNotice?: { reason: string; suggestion: string; suggestionLabel?: string };
  /*
    A shell request is in flight.

    Opening one probes for bash, then sh, then ash — three execs, each of which
    can sit for its timeout on a pod that is not answering. Typically that is a
    second or two and occasionally it is much longer, and with no pending state
    the button was indistinguishable from a broken one for the whole of it.
  */
  shellPending?: boolean;

  probe: () => void;
  useContext: (name: string) => void;
  setNamespace: (ns: string, pin?: boolean) => void;
  useContexts: (names: string[]) => void;
  setTargets: (targets: WatchTarget[]) => void;
  setPendingTargets: (targets: WatchTarget[]) => void;
  commitPendingTargets: () => void;
  pinNamespace: (ns: string) => void;
  unpinNamespace: (ns: string) => void;
  setSensitivity: (level: Sensitivity) => void;
  setKubectlPath: (path: string) => void;
  openContextPicker: () => void;
  openNamespacePicker: () => void;
  startWatch: () => void;
  stopWatch: () => void;
  setFilter: (v: string) => void;
  setView: (v: 'cards' | 'table') => void;
  selectPod: (name?: string) => void;
  openDetail: (pod: PodSummary) => void;
  closeDetail: () => void;
  setDetailTab: (tab: DetailTab) => void;
  setExplorerPath: (path?: string) => void;
  openExplorerAt: (a: { path?: string; highlight?: string; fromSearch?: boolean }) => void;
  clearExplorerHighlight: () => void;
  setLogFilter: (v: string) => void;
  /** Add a field filter, or flip its mode if that field/value is already on. */
  addFieldFilter: (f: FieldFilter) => void;
  removeFieldFilter: (field: FieldFilter['field'], value: string) => void;
  clearFieldFilters: () => void;
  toggleLogLevel: (level: LogLevel) => void;
  setLogFollow: (v: boolean) => void;
  setLogLive: (v: boolean) => void;
  setLogTail: (n: number) => void;
  setLogDirection: (d: 'last' | 'first') => void;
  setLogSince: (v: 'all' | 'restart' | '15m' | '1h' | '6h') => void;
  fetchLogs: () => void;
  openLogExport: () => void;
  closeLogExport: () => void;
  setLogWrap: (v: boolean) => void;
  setLogPrevious: (v: boolean) => void;
  setLogContainer: (c?: string) => void;
  reloadLogs: () => void;
  setLogSelection: (sel?: LogSelection) => void;
  openShell: () => void;
  dismissShellNotice: () => void;
  setGuardHeapDump: (on: boolean) => void;
  setLogLineNumbers: (on: boolean) => void;
  toggleSelectMode: () => void;
  togglePodSelected: (uid: string) => void;
  beginSelection: (uid: string) => void;
  probePodForMenu: (pod: PodSummary) => void;
  closePodMenu: () => void;
  copyPodText: (pod: PodSummary, kind: 'describe' | 'yaml') => void;
  openShellFor: (pod: PodSummary) => void;
  selectAllVisible: (uids: string[]) => void;
  clearSelection: () => void;
  openExport: () => void;
  closeExport: () => void;
  exportLogs: (options: ExportOptions, visibleLines?: string[]) => void;
  apply: (msg: Record<string, unknown>) => void;
}

export const useK8sStore = create<K8sState>((set, get) => ({
  stage: 'probing',
  // Not persisted: you come back to dk8s to look at pods, so that is where it
  // opens, whatever you were reading last time.
  panel: 'pods',
  setPanel: (panel) => set({ panel }),
  platform: 'unknown',
  contexts: [],
  namespaces: [],
  namespacesForbidden: false,
  pinned: [],
  selectedContexts: [],
  contextResults: [],
  offers: [],
  targets: [],
  pendingTargets: [],
  sensitivity: {},
  sensitivityGuess: false,
  busy: false,

  pods: [],
  usage: {},
  usageHistory: {},
  metricsAvailable: false,
  watchStatus: 'idle',
  filter: '',
  view: 'cards',
  podScope: 'fav',
  setPodScope: (podScope) => set({ podScope }),
  selectMode: false,
  selected: [],
  exportOpen: false,

  detailTab: 'logs',
  logs: [],
  logStatus: 'idle',
  logRequestedAt: 0,
  logDropped: 0,
  logFilter: '',
  logLevels: [],
  logFieldFilters: [],
  logFollow: true,
  logLive: false,
  logTail: 200,
  logDirection: 'last',
  logSince: 'all',
  logExportOpen: false,
  // Wrap on by default. A stack frame or a JSON payload running off the right
  // edge is the common case in a pod log, and horizontal scrolling to read it
  // is worse than a taller row. Anyone who wants columns can turn it off.
  logWrap: true,
  logPrevious: false,
  describeBusy: false,
  actions: [],
  probeBusy: false,
  guardHeapDump: true,
  logLineNumbers: true,
  access: ALL_ACCESS,

  probe: () => {
    set({ busy: true });
    postMsg({ type: 'dk8s:probe' });
  },

  useContext: (name) => {
    logUiEvent('dk8s.context_switch', { context: name, from: get().context });
    set({ busy: true, context: name });
    postMsg({ type: 'dk8s:useContext', context: name });
  },

  setNamespace: (ns, pin) => {
    // Drop the old namespace's pods immediately. Leaving them on screen while
    // the new watch spins up shows pods that are not in the namespace the
    // breadcrumb now claims — briefly, and wrongly.
    logUiEvent('dk8s.namespace_switch', {
      namespace: ns, pinned: !!pin, context: get().context, from: get().namespace,
    });
    set({ namespace: ns, stage: 'ready', pods: [], usage: {}, usageHistory: {}, watchStatus: 'idle' });
    postMsg({ type: 'dk8s:setNamespace', namespace: ns, pin: !!pin });
  },

  useContexts: (names) => {
    if (!names.length) return;
    set({ busy: true, selectedContexts: names, context: names[0] });
    postMsg({ type: 'dk8s:useContexts', contexts: names });
  },

  setPendingTargets: (pendingTargets) => set({ pendingTargets }),

  commitPendingTargets: () => {
    const { pendingTargets, setTargets } = get();
    if (pendingTargets.length) setTargets(pendingTargets);
  },

  setTargets: (targets) => {
    if (!targets.length) return;
    // Clear immediately: leaving the previous selection's pods on screen while
    // the new watches spin up shows pods from namespaces the breadcrumb no
    // longer claims.
    set({
      targets, stage: 'ready', pods: [], usage: {}, usageHistory: {},
      watchStatus: 'idle', capped: undefined,
      context: targets[0].context, namespace: targets[0].namespace,
    });
    postMsg({ type: 'dk8s:setTargets', targets });
  },

  pinNamespace: (ns) => {
    const ctx = get().context;
    if (!ctx || !ns.trim()) return;
    postMsg({ type: 'dk8s:pinNamespace', context: ctx, namespace: ns.trim() });
  },

  unpinNamespace: (ns) => {
    const ctx = get().context;
    if (!ctx) return;
    postMsg({ type: 'dk8s:unpinNamespace', context: ctx, namespace: ns });
  },

  setSensitivity: (level) => {
    const ctx = get().context;
    if (!ctx) return;
    set(s => ({
      sensitivity: { ...s.sensitivity, [ctx]: level },
      stage: s.namespace ? 'ready' : 'pick-namespace',
    }));
    postMsg({ type: 'dk8s:setSensitivity', context: ctx, level });
  },

  setKubectlPath: (path) => {
    logUiEvent('dk8s.kubectl_path', { path });
    set({ busy: true });
    postMsg({ type: 'dk8s:setKubectlPath', path });
  },

  startWatch: () => {
    const { targets, context, namespace } = get();
    if (targets.length) {
      postMsg({ type: 'dk8s:watchPods', targets });
      return;
    }
    if (!context || !namespace) return;
    postMsg({ type: 'dk8s:watchPods', context, namespace });
  },

  stopWatch: () => postMsg({ type: 'dk8s:stopWatch' }),

  setFilter: (filter) => set({ filter }),
  setView: (view) => set({ view }),
  selectPod: (selectedPod) => set({ selectedPod }),

  setExplorerPath: (explorerPath) => set({ explorerPath }),

  openExplorerAt: ({ path, highlight, fromSearch }) => set({
    explorerPath: path,
    explorerHighlight: highlight,
    explorerCameFromSearch: !!fromSearch,
  }),

  clearExplorerHighlight: () => set({ explorerHighlight: undefined }),

  openDetail: (pod) => {
    // Reset every per-pod field. Carrying the last pod's logs into this one's
    // panel for the moment before the first frame arrives is the kind of bug
    // that gets someone reading the wrong pod's stack trace.
    set({
      detail: pod,
      // Back to the tab you were reading on this pod.
      //
      // Every open reset to Logs, so going to Doctor, taking a dump, following
      // it into the analyzer and coming back put you on Logs with the Doctor
      // tab looking untouched. Stored the same way every other panel stores its
      // subtab — a `prefs` entry in the ui_state row — so it also survives a
      // reload, and keyed by namespace/name rather than uid so a value written
      // for a pod is still readable by eye in the database.
      detailTab: (useUiStateStore.getState()
        .prefs[`${DETAIL_TAB_PREF}${pod.namespace}/${pod.name}`] as DetailTab | undefined) ?? 'logs',
      logs: [], logStatus: 'loading', logDetail: undefined, logDropped: 0,
      logRequestedAt: Date.now(),
      logFilter: '', logLevels: [], logFieldFilters: [], logFollow: true, logLive: false,
      logDirection: 'last', logSince: 'all', logExportOpen: false,
      logPrevious: false, logContainer: undefined, logSelection: undefined,
      describeText: undefined, yamlText: undefined, describeBusy: true,
      capabilities: undefined, runtime: undefined, actions: [], probeBusy: true,
      memory: undefined, safety: undefined,
      shellNotice: undefined,
    });
    const base = { context: pod.context, namespace: pod.namespace, pod: pod.name };
    // Snapshot, not a stream. See logLive.
    postMsg({
      type: 'dk8s:openLogs', ...base,
      follow: false, direction: 'last', tailLines: get().logTail,
    });
    postMsg({ type: 'dk8s:describe', ...base });
    /*
      One event for opening a pod, carrying what makes it worth opening.

      The phase and restart count are in the metadata rather than left for
      whoever reads the log to go and look up, because by then the pod is
      almost certainly in a different state — a CrashLoopBackOff with 579
      restarts is why this row exists, and it is not recoverable after the fact.
    */
    logUiEvent('dk8s.pod_open', {
      ...base, workload: pod.workload ? `${pod.workload.kind}/${pod.workload.name}` : undefined,
      phase: pod.phase, reason: pod.reason, restarts: pod.restarts,
      ready: `${pod.ready.current}/${pod.ready.total}`, node: pod.node, image: pod.image,
    });
    logUiEvent('dk8s.describe', base);
    postMsg({ type: 'dk8s:probePod', ...base });
    // What this account may do here, so the tabs can disable what will not
    // work rather than offering it and failing with a raw 403.
    postMsg({ type: 'dk8s:probeAccess', context: pod.context, namespace: pod.namespace });
  },

  closeDetail: () => {
    postMsg({ type: 'dk8s:closeLogs' });
    set({ detail: undefined, logs: [], logStatus: 'idle', logSelection: undefined });
  },

  setDetailTab: (detailTab) => {
    const pod = get().detail;
    if (pod) {
      useUiStateStore.getState()
        .setScopedPref(DETAIL_TAB_PREF, `${pod.namespace}/${pod.name}`, detailTab);
    }
    set({ detailTab });
  },
  setLogFilter: (logFilter) => set({ logFilter }),

  /*
    Adding a filter that is already there flips it rather than duplicating it.

    Clicking `main` twice in the menu should not produce two identical chips,
    and the second click has an obvious meaning — the person is pointing at the
    same value again, and the only other thing to do with it is invert it.
  */
  addFieldFilter: (f) => set(s => {
    const existing = s.logFieldFilters.find(x => x.field === f.field && x.value === f.value);
    if (!existing) return { logFieldFilters: [...s.logFieldFilters, f] };
    return {
      logFieldFilters: s.logFieldFilters.map(x =>
        x === existing
          ? { ...x, mode: x.mode === 'include' ? 'exclude' as const : 'include' as const }
          : x),
    };
  }),

  removeFieldFilter: (field, value) => set(s => ({
    logFieldFilters: s.logFieldFilters.filter(x => !(x.field === field && x.value === value)),
  })),

  clearFieldFilters: () => set({ logFieldFilters: [] }),

  toggleLogLevel: (level) => set(s => ({
    logLevels: s.logLevels.includes(level)
      ? s.logLevels.filter(l => l !== level)
      : [...s.logLevels, level],
  })),

  setLogFollow: (logFollow) => set({ logFollow }),

  setLogLive: (logLive) => {
    set({ logLive });
    // Going live re-opens the stream with --follow; leaving live stops the
    // process outright rather than letting it run unread in the background.
    if (logLive) get().reloadLogs();
    else postMsg({ type: 'dk8s:closeLogs' });
  },

  // These only change what the NEXT fetch will ask for. Nothing reloads until
  // Fetch is pressed — a selector that refetches on change is exactly the
  // "it keeps refreshing" behaviour this view is supposed to avoid.
  setLogTail: (logTail) => set({ logTail }),
  setLogDirection: (logDirection) => set({ logDirection }),
  setLogSince: (logSince) => set({ logSince }),

  fetchLogs: () => get().reloadLogs(),

  openLogExport: () => set({ logExportOpen: true }),
  closeLogExport: () => set({ logExportOpen: false }),
  setLogWrap: (logWrap) => set({ logWrap }),

  setLogPrevious: (logPrevious) => { set({ logPrevious }); get().reloadLogs(); },
  setLogContainer: (logContainer) => { set({ logContainer }); get().reloadLogs(); },

  reloadLogs: () => {
    const { detail, logPrevious, logContainer, logLive, logTail, logDirection, logSince } = get();
    if (!detail) return;
    set({
      logs: [], logDropped: 0, logStatus: 'loading',
      logDetail: undefined, logSelection: undefined, logRequestedAt: Date.now(),
    });

    const SINCE: Record<string, number | undefined> = {
      all: undefined, '15m': 900, '1h': 3600, '6h': 21600,
      // "Since the last restart" is the most useful of these and the only one
      // that needs the pod's own history rather than a fixed window.
      restart: detail.lastRestartAt
        ? Math.max(1, Math.round((Date.now() - Date.parse(detail.lastRestartAt)) / 1000))
        : undefined,
    };

    postMsg({
      type: 'dk8s:openLogs',
      context: detail.context, namespace: detail.namespace, pod: detail.name,
      previous: logPrevious, container: logContainer,
      // Following always tails: a head slice cannot grow.
      follow: logLive,
      direction: logLive ? 'last' : logDirection,
      tailLines: logTail,
      sinceSeconds: SINCE[logSince],
    });
  },

  setLogSelection: (logSelection) => set({ logSelection }),

  openShell: () => {
    const { detail, logContainer } = get();
    if (!detail) return;
    set({ shellNotice: undefined, shellPending: true });
    // The most sensitive action in the tool, so the record is the fullest.
    logUiEvent('dk8s.shell', {
      context: detail.context, namespace: detail.namespace, pod: detail.name,
      container: logContainer ?? detail.containers[0]?.name,
      containers: detail.containers.map(c => c.name),
      image: detail.image, node: detail.node, phase: detail.phase,
    });
    postMsg({
      type: 'dk8s:shell',
      context: detail.context, namespace: detail.namespace, pod: detail.name,
      container: logContainer,
    });
  },

  dismissShellNotice: () => set({ shellNotice: undefined }),

  setLogLineNumbers: (logLineNumbers) => {
    set({ logLineNumbers });
    postMsg({ type: 'dk8s:setLogLineNumbers', on: logLineNumbers });
  },

  setGuardHeapDump: (guardHeapDump) => {
    set({ guardHeapDump });
    postMsg({ type: 'dk8s:setGuardHeapDump', on: guardHeapDump });
  },

  toggleSelectMode: () => set(s => ({
    selectMode: !s.selectMode,
    // Leaving select mode drops the ticks: a hidden selection that survives is
    // how you end up exporting pods you forgot you had chosen.
    selected: s.selectMode ? [] : s.selected,
  })),

  togglePodSelected: (uid) => set(s => ({
    selected: s.selected.includes(uid) ? s.selected.filter(u => u !== uid) : [...s.selected, uid],
  })),

  /*
    Enter selection mode already holding something.

    Turning the mode on and selecting nothing would answer a press-and-hold
    with an empty toolbar, leaving the pod you were holding to be clicked
    again. Additive rather than exclusive, so holding a second pod while
    already selecting adds to the set instead of restarting it.
  */
  beginSelection: (uid) => set(s => ({
    selectMode: true,
    selected: s.selected.includes(uid) ? s.selected : [...s.selected, uid],
  })),

  /*
    What this pod can actually be asked for, fetched when its menu opens.

    The alternative was to offer every diagnostic on every pod and let the
    ones that cannot work fail after being chosen — a menu that lies until
    clicked. A probe is one round trip, and it is what lets a heap dump on a
    pod with no headroom be greyed out with the numbers that grey it out.
  */
  probePodForMenu: (pod) => {
    set({ menuProbe: { pod: pod.name, busy: true, actions: [] } });
    postMsg({
      type: 'dk8s:probePod',
      context: pod.context, namespace: pod.namespace, pod: pod.name,
    });
  },

  closePodMenu: () => set({ menuProbe: undefined }),

  copyPodText: (pod, kind) => {
    set({ pendingCopy: { pod: pod.name, kind } });
    postMsg({
      type: 'dk8s:describe',
      context: pod.context, namespace: pod.namespace, pod: pod.name,
    });
  },

  openShellFor: (pod) => {
    set({ shellNotice: undefined });
    // The same record the detail view writes: this is the most sensitive
    // action in the tool wherever it is started from.
    logUiEvent('dk8s.shell', {
      context: pod.context, namespace: pod.namespace, pod: pod.name,
      container: pod.containers?.[0]?.name,
      containers: (pod.containers ?? []).map(c => c.name),
      image: pod.image, node: pod.node, phase: pod.phase,
      from: 'context-menu',
    });
    postMsg({
      type: 'dk8s:shell',
      context: pod.context, namespace: pod.namespace, pod: pod.name,
    });
  },

  selectAllVisible: (uids) => set(s => ({
    // Toggle: if everything visible is already ticked, this clears them.
    selected: uids.every(u => s.selected.includes(u))
      ? s.selected.filter(u => !uids.includes(u))
      : [...new Set([...s.selected, ...uids])],
  })),

  clearSelection: () => set({ selected: [] }),
  openExport: () => set({ exportOpen: true, exportState: undefined }),
  closeExport: () => set({ exportOpen: false }),

  exportLogs: (options, visibleLines) => {
    const { pods, selected, logExportOpen, detail } = get();
    // The Download button in the log view exports THIS pod, using the same
    // options dialog as the grid's bulk export — one set of choices to learn,
    // not two.
    const chosen = logExportOpen && detail
      ? [detail]
      : pods.filter(p => selected.includes(p.uid));
    if (!chosen.length) return;
    logUiEvent('dk8s.logs_export', {
      pods: chosen.map(p => p.name), podCount: chosen.length,
      namespaces: [...new Set(chosen.map(p => p.namespace))],
      context: chosen[0]?.context, options, onScreen: !!visibleLines,
    });
    set({ exportState: { phase: 'running', done: 0, total: chosen.length } });
    postMsg({
      type: 'dk8s:exportLogs',
      options,
      // Present only for an on-screen export, where the host writes these
      // rather than re-reading the pod.
      visibleLines,
      targets: chosen.map(p => ({
        context: p.context, namespace: p.namespace, pod: p.name,
        containers: p.containers.map(c => c.name),
      })),
    });
  },

  openContextPicker: () => set({ stage: 'pick-context' }),
  openNamespacePicker: () => {
    const { selectedContexts, context, targets } = get();
    const ctxs = selectedContexts.length ? selectedContexts : (context ? [context] : []);
    set({ stage: 'pick-namespace', pendingTargets: targets });
    if (ctxs.length) postMsg({ type: 'dk8s:useContexts', contexts: ctxs });
  },

  /** Fold a host message into state. One place, so the stage logic is readable. */
  apply: (msg) => {
    switch (msg.type) {
      case 'dk8s:env': {
        const env = msg.env as KubectlEnv;
        const contexts = (msg.contexts as KubeContext[]) ?? [];
        const context = msg.context as string | undefined;
        const reachable = msg.reachable as Reachability | undefined;
        const sensitivity = (msg.sensitivity as Record<string, Sensitivity>) ?? {};

        let stage: Dk8sStage;
        if (!env.present) stage = 'no-kubectl';
        else if (!contexts.length) stage = 'no-contexts';
        else if (!context) stage = 'pick-context';
        else if (reachable && !reachable.reachable) stage = 'unreachable';
        else if (msg.needsSensitivity) stage = 'ask-sensitivity';
        else if (!msg.namespace) stage = 'pick-namespace';
        else stage = 'ready';

        set({
          busy: false, stage, env,
          platform: (msg.platform as string) ?? 'unknown',
          contexts, context, reachable, sensitivity,
          contextError: msg.contextError as string | undefined,
          namespace: msg.namespace as string | undefined,
          sensitivityGuess: !!msg.sensitivityGuess,
          pinned: (msg.pinned as string[]) ?? [],
          selectedContexts: (msg.selectedContexts as string[]) ?? (context ? [context] : []),
          targets: (msg.targets as WatchTarget[]) ?? [],
          // View preferences ride along with the probe: the panel needs them
          // before it renders anything, so a separate round trip would show
          // one frame with the wrong setting.
          guardHeapDump: msg.guardHeapDump !== false,
          logLineNumbers: msg.logLineNumbers !== false,
        });
        break;
      }

      case 'dk8s:contextSet': {
        const reachable = msg.reachable as Reachability;
        const ctx = msg.context as string;
        const known = !!get().sensitivity[ctx];
        set({
          busy: false, context: ctx, reachable,
          namespace: msg.namespace as string | undefined,
          stage: !reachable.reachable ? 'unreachable'
            : !known ? 'ask-sensitivity'
            : 'pick-namespace',
        });
        break;
      }

      case 'dk8s:namespaces':
        set({
          busy: false,
          namespaces: (msg.namespaces as string[]) ?? [],
          namespacesForbidden: !!msg.forbidden,
          namespaceFallback: msg.fallback as string | undefined,
          namespaceError: msg.error as string | undefined,
          pinned: (msg.pinned as string[]) ?? [],
        });
        break;

      case 'dk8s:pinnedNamespaces':
        set({ pinned: (msg.pinned as string[]) ?? [] });
        break;

      case 'dk8s:namespaceSet':
        set({ namespace: msg.namespace as string, stage: 'ready' });
        break;

      case 'dk8s:podSnapshot': {
        // A snapshot replaces only ITS target's pods. With several namespaces
        // watched at once, replacing everything would make each snapshot wipe
        // the others as they arrive.
        const ctx = msg.context as string;
        const ns = msg.namespace as string;
        const incoming = ((msg.pods as PodSummary[]) ?? []).map(p => ({ ...p, context: ctx }));
        set(s => ({
          pods: [...s.pods.filter(p => !(p.context === ctx && p.namespace === ns)), ...incoming],
        }));
        break;
      }

      case 'dk8s:podEvent': {
        const pod = { ...(msg.pod as PodSummary), context: msg.context as string };
        const kind = msg.eventType as string;
        const at = Date.now();
        set(s => {
          if (kind === 'DELETED') {
            return { pods: s.pods.filter(p => p.uid !== pod.uid), lastEventAt: at };
          }
          const i = s.pods.findIndex(p => p.uid === pod.uid);
          if (i < 0) return { pods: [...s.pods, pod], lastEventAt: at };
          const next = s.pods.slice();
          next[i] = pod;
          return { pods: next, lastEventAt: at };
        });
        break;
      }

      case 'dk8s:watchStatus':
        // With several watches, the header shows the WORST state — one
        // reconnecting namespace matters more than three healthy ones.
        set(s => {
          const rank: Record<string, number> = { reconnecting: 0, idle: 1, stopped: 2, connected: 3 };
          const incoming = msg.status as WatchStatus;
          const worse = rank[incoming] < rank[s.watchStatus];
          return worse || incoming === 'connected'
            ? { watchStatus: incoming, watchDetail: msg.detail as string | undefined }
            : {};
        });
        break;

      case 'dk8s:contextsSet':
        set({
          busy: false,
          selectedContexts: (msg.contexts as string[]) ?? [],
          contextResults: (msg.results as { context: string; reachable: Reachability }[]) ?? [],
          stage: 'pick-namespace',
        });
        break;

      case 'dk8s:namespacesMulti':
        set({ busy: false, offers: (msg.perContext as NamespaceOffer[]) ?? [] });
        break;

      case 'dk8s:targetsSet':
        set({ targets: (msg.targets as WatchTarget[]) ?? [], stage: 'ready' });
        break;

      case 'dk8s:exportStarted':
        set(s => ({ exportState: { ...(s.exportState ?? { done: 0, total: 0 }), phase: 'running',
                                   total: msg.total as number, destDir: msg.destDir as string } }));
        break;

      case 'dk8s:exportProgress':
        set(s => ({ exportState: { ...(s.exportState ?? { phase: 'running', total: 0 }),
                                   phase: 'running',
                                   done: msg.done as number, total: msg.total as number,
                                   pod: msg.pod as string } }));
        break;

      case 'dk8s:exportDone':
        set(s => ({
          exportOpen: false,
          logExportOpen: false,
          selectMode: false,
          selected: [],
          exportState: {
            phase: 'done',
            done: s.exportState?.total ?? 0,
            total: s.exportState?.total ?? 0,
            destDir: msg.destDir as string,
            summary: msg.summary as string,
            results: msg.results as ExportResult[],
          },
        }));
        break;

      case 'dk8s:exportCancelled':
        set({ exportState: undefined });
        break;

      case 'dk8s:exportError':
        set(s => ({ exportState: { ...(s.exportState ?? { done: 0, total: 0 }),
                                   phase: 'error', error: msg.error as string } }));
        break;

      case 'dk8s:watchCapped':
        set({
          capped: {
            requested: msg.requested as number,
            watching: msg.watching as number,
            max: msg.max as number,
          },
        });
        break;

      case 'dk8s:podUsage': {
        const available = !!msg.available;
        if (!available) { set({ metricsAvailable: false }); break; }
        const rows = (msg.usage as { name: string; cpuMilli: number; memBytes: number }[]) ?? [];
        set(s => {
          const usage: Record<string, PodUsage> = {};
          const history = { ...s.usageHistory };
          for (const r of rows) {
            usage[r.name] = { cpuMilli: r.cpuMilli, memBytes: r.memBytes };
            const prev = history[r.name] ?? [];
            history[r.name] = [...prev, r.memBytes].slice(-USAGE_SAMPLES);
          }
          return { usage, usageHistory: history, metricsAvailable: true };
        });
        break;
      }

      case 'dk8s:logLines': {
        // Ignore frames from a pod that is no longer open: closing the panel
        // and opening another races the in-flight batch, and without this the
        // new pod's view briefly shows the old pod's lines.
        if (msg.pod !== get().detail?.name) break;
        const incoming = (msg.lines as LogLine[]) ?? [];
        if (!incoming.length) break;
        set(s => {
          const merged = s.logs.concat(incoming);
          const overflow = merged.length - LOG_BUFFER_MAX;
          return overflow > 0
            ? { logs: merged.slice(overflow), logDropped: s.logDropped + overflow }
            : { logs: merged };
        });
        break;
      }

      case 'dk8s:logStatus':
        if (msg.pod !== get().detail?.name) break;
        set({ logStatus: msg.status as LogStatus, logDetail: msg.detail as string | undefined });
        break;

      case 'dk8s:logDropped':
        if (msg.pod !== get().detail?.name) break;
        set(s => ({ logDropped: s.logDropped + (msg.count as number) }));
        break;

      case 'dk8s:described': {
        const want = get().pendingCopy;
        if (want && msg.pod === want.pod) {
          const text = (want.kind === 'yaml' ? msg.yaml : msg.describe) as string | undefined;
          if (text) void navigator.clipboard?.writeText(text);
          set({ pendingCopy: undefined });
        }
        if (msg.pod !== get().detail?.name) break;
        set({
          describeBusy: false,
          describeText: msg.describe as string,
          yamlText: msg.yaml as string,
        });
        break;
      }

      case 'dk8s:podProbed': {
        // A menu's probe and the open pod's probe come back on one message
        // type, so each is routed by the pod it names rather than by which
        // was asked for last.
        const menu = get().menuProbe;
        if (menu && msg.pod === menu.pod) {
          set({
            menuProbe: {
              ...menu,
              busy: false,
              actions: (msg.actions as PodAction[]) ?? [],
              safety: msg.safety as HeapDumpSafety | undefined,
            },
          });
        }
        if (msg.pod !== get().detail?.name) break;
        set({
          probeBusy: false,
          capabilities: msg.capabilities as PodCapabilities,
          runtime: msg.runtime as { runtime: string; confidence: number; detectedFrom: string },
          actions: (msg.actions as PodAction[]) ?? [],
          memory: msg.memory as MemoryProfile | undefined,
          safety: msg.safety as HeapDumpSafety | undefined,
        });
        break;
      }

      /*
        The terminal opened. Nothing to show — the terminal IS the feedback —
        but the pending state has to end, and nothing was listening for this
        at all, so a successful shell left the button spinning forever.
      */
      case 'dk8s:shellOpened':
        set({ shellPending: false });
        break;

      case 'dk8s:shellUnavailable':
        set({ shellPending: false, shellNotice: {
          reason: msg.reason as string,
          suggestion: msg.suggestion as string,
          suggestionLabel: msg.suggestionLabel as string | undefined,
        } });
        break;

      case 'dk8s:access':
        set({ access: msg.access as Access });
        break;

      case 'dk8s:logLineNumbers':
        set({ logLineNumbers: msg.on !== false });
        break;

      case 'dk8s:guardHeapDump':
        set({ guardHeapDump: msg.on !== false });
        break;

      case 'dk8s:sensitivitySet':
        set(s => ({
          sensitivity: { ...s.sensitivity, [msg.context as string]: msg.level as Sensitivity },
        }));
        break;
    }
  },
}));

/** True when the active context has been marked production by the user. */
export function isProductionContext(): boolean {
  const { context, sensitivity } = useK8sStore.getState();
  return !!context && sensitivity[context] === 'production';
}
