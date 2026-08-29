/**
 * dk8s state.
 *
 * The host owns the truth — it is what runs kubectl — so this store holds what
 * the host last told us plus purely local UI state. Nothing here decides
 * anything about a cluster; it renders what came back.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';

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
}

export type LogStatus = 'idle' | 'streaming' | 'ended' | 'error';

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

export type DetailTab = 'logs' | 'describe' | 'yaml' | 'doctor';

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

interface K8sState {
  stage: Dk8sStage;
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
  selectMode: boolean;
  /** Pod uids ticked for export. */
  selected: string[];
  exportOpen: boolean;
  exportState?: ExportState;

  /** The pod whose detail panel is open, if any. */
  detail?: PodSummary;
  detailTab: DetailTab;
  logs: LogLine[];
  logStatus: LogStatus;
  logDetail?: string;
  /** Lines discarded because the pod outran the reader. */
  logDropped: number;
  logFilter: string;
  logLevels: LogLevel[];
  logFollow: boolean;
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
  shellNotice?: { reason: string; suggestion: string; suggestionLabel?: string };

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
  setLogFilter: (v: string) => void;
  toggleLogLevel: (level: LogLevel) => void;
  setLogFollow: (v: boolean) => void;
  setLogWrap: (v: boolean) => void;
  setLogPrevious: (v: boolean) => void;
  setLogContainer: (c?: string) => void;
  reloadLogs: () => void;
  setLogSelection: (sel?: LogSelection) => void;
  openShell: () => void;
  dismissShellNotice: () => void;
  toggleSelectMode: () => void;
  togglePodSelected: (uid: string) => void;
  selectAllVisible: (uids: string[]) => void;
  clearSelection: () => void;
  openExport: () => void;
  closeExport: () => void;
  exportLogs: (options: ExportOptions) => void;
  apply: (msg: Record<string, unknown>) => void;
}

export const useK8sStore = create<K8sState>((set, get) => ({
  stage: 'probing',
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
  selectMode: false,
  selected: [],
  exportOpen: false,

  detailTab: 'logs',
  logs: [],
  logStatus: 'idle',
  logDropped: 0,
  logFilter: '',
  logLevels: [],
  logFollow: true,
  logWrap: false,
  logPrevious: false,
  describeBusy: false,
  actions: [],
  probeBusy: false,

  probe: () => {
    set({ busy: true });
    postMsg({ type: 'dk8s:probe' });
  },

  useContext: (name) => {
    set({ busy: true, context: name });
    postMsg({ type: 'dk8s:useContext', context: name });
  },

  setNamespace: (ns, pin) => {
    // Drop the old namespace's pods immediately. Leaving them on screen while
    // the new watch spins up shows pods that are not in the namespace the
    // breadcrumb now claims — briefly, and wrongly.
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

  openDetail: (pod) => {
    // Reset every per-pod field. Carrying the last pod's logs into this one's
    // panel for the moment before the first frame arrives is the kind of bug
    // that gets someone reading the wrong pod's stack trace.
    set({
      detail: pod, detailTab: 'logs',
      logs: [], logStatus: 'idle', logDetail: undefined, logDropped: 0,
      logFilter: '', logLevels: [], logFollow: true,
      logPrevious: false, logContainer: undefined, logSelection: undefined,
      describeText: undefined, yamlText: undefined, describeBusy: true,
      capabilities: undefined, runtime: undefined, actions: [], probeBusy: true,
      shellNotice: undefined,
    });
    const base = { context: pod.context, namespace: pod.namespace, pod: pod.name };
    postMsg({ type: 'dk8s:openLogs', ...base, tailLines: 2000 });
    postMsg({ type: 'dk8s:describe', ...base });
    postMsg({ type: 'dk8s:probePod', ...base });
  },

  closeDetail: () => {
    postMsg({ type: 'dk8s:closeLogs' });
    set({ detail: undefined, logs: [], logStatus: 'idle', logSelection: undefined });
  },

  setDetailTab: (detailTab) => set({ detailTab }),
  setLogFilter: (logFilter) => set({ logFilter }),

  toggleLogLevel: (level) => set(s => ({
    logLevels: s.logLevels.includes(level)
      ? s.logLevels.filter(l => l !== level)
      : [...s.logLevels, level],
  })),

  setLogFollow: (logFollow) => set({ logFollow }),
  setLogWrap: (logWrap) => set({ logWrap }),

  setLogPrevious: (logPrevious) => { set({ logPrevious }); get().reloadLogs(); },
  setLogContainer: (logContainer) => { set({ logContainer }); get().reloadLogs(); },

  reloadLogs: () => {
    const { detail, logPrevious, logContainer } = get();
    if (!detail) return;
    set({ logs: [], logDropped: 0, logStatus: 'idle', logDetail: undefined, logSelection: undefined });
    postMsg({
      type: 'dk8s:openLogs',
      context: detail.context, namespace: detail.namespace, pod: detail.name,
      previous: logPrevious, container: logContainer, tailLines: 2000,
    });
  },

  setLogSelection: (logSelection) => set({ logSelection }),

  openShell: () => {
    const { detail, logContainer } = get();
    if (!detail) return;
    set({ shellNotice: undefined });
    postMsg({
      type: 'dk8s:shell',
      context: detail.context, namespace: detail.namespace, pod: detail.name,
      container: logContainer,
    });
  },

  dismissShellNotice: () => set({ shellNotice: undefined }),

  toggleSelectMode: () => set(s => ({
    selectMode: !s.selectMode,
    // Leaving select mode drops the ticks: a hidden selection that survives is
    // how you end up exporting pods you forgot you had chosen.
    selected: s.selectMode ? [] : s.selected,
  })),

  togglePodSelected: (uid) => set(s => ({
    selected: s.selected.includes(uid) ? s.selected.filter(u => u !== uid) : [...s.selected, uid],
  })),

  selectAllVisible: (uids) => set(s => ({
    // Toggle: if everything visible is already ticked, this clears them.
    selected: uids.every(u => s.selected.includes(u))
      ? s.selected.filter(u => !uids.includes(u))
      : [...new Set([...s.selected, ...uids])],
  })),

  clearSelection: () => set({ selected: [] }),
  openExport: () => set({ exportOpen: true, exportState: undefined }),
  closeExport: () => set({ exportOpen: false }),

  exportLogs: (options) => {
    const { pods, selected } = get();
    const chosen = pods.filter(p => selected.includes(p.uid));
    if (!chosen.length) return;
    set({ exportState: { phase: 'running', done: 0, total: chosen.length } });
    postMsg({
      type: 'dk8s:exportLogs',
      options,
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
        set(s => {
          if (kind === 'DELETED') {
            return { pods: s.pods.filter(p => p.uid !== pod.uid) };
          }
          const i = s.pods.findIndex(p => p.uid === pod.uid);
          if (i < 0) return { pods: [...s.pods, pod] };
          const next = s.pods.slice();
          next[i] = pod;
          return { pods: next };
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

      case 'dk8s:described':
        if (msg.pod !== get().detail?.name) break;
        set({
          describeBusy: false,
          describeText: msg.describe as string,
          yamlText: msg.yaml as string,
        });
        break;

      case 'dk8s:podProbed':
        if (msg.pod !== get().detail?.name) break;
        set({
          probeBusy: false,
          capabilities: msg.capabilities as PodCapabilities,
          runtime: msg.runtime as { runtime: string; confidence: number; detectedFrom: string },
          actions: (msg.actions as PodAction[]) ?? [],
        });
        break;

      case 'dk8s:shellUnavailable':
        set({ shellNotice: {
          reason: msg.reason as string,
          suggestion: msg.suggestion as string,
          suggestionLabel: msg.suggestionLabel as string | undefined,
        } });
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
