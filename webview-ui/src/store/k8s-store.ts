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
import type { MarkTarget } from '../components/k8s/mark-runtime';

/** What somebody said a pod's runtime is. Mirrors services/k8s/runtime-marks. */
export interface RuntimeMark {
  runtime: string;
  at: number;
  scope: 'workload' | 'pod';
  label: string;
}

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
  /**
   * The line kubectl said when it would not answer.
   *
   * Listing every possible cause is true and useless: a credential helper that
   * timed out and an expired token need different things done, and the cluster
   * already named which.
   */
  detail?: string;
}

/** One kubectl invocation, as the host reported it. Mirrors kubectl-audit. */
export interface KubectlCommand {
  /** Same id for the call's start and its completion — see kubectl-audit. */
  id: string;
  command: string;
  what: string;
  context?: string;
  namespace?: string;
  kind: 'run' | 'stream';
  ms?: number;
  ok?: boolean;
  code?: number | null;
  said?: string;
  bytes?: number;
  at: number;
}

/** Replace the row with this id, or append it. Capped at what a card can use. */
export function mergeCommand(
  commands: KubectlCommand[], event: KubectlCommand,
): KubectlCommand[] {
  const at = commands.findIndex(c => c.id === event.id);
  if (at === -1) return [...commands, event].slice(-40);
  const next = commands.slice();
  /* Keep the moment it STARTED. The completion carries its own `at`, and
     taking that one would make every finished command look instantaneous. */
  next[at] = { ...event, at: commands[at].at };
  return next;
}

export const ALL_ACCESS: Access = {
  logs: true, exec: true, get: true, events: true,
  portForward: true, delete: true, patch: true, probed: false,
};

/**
 * What stops being true the moment you point at a different cluster.
 *
 * A namespace belongs to the cluster it was chosen in. Carrying it across a
 * context switch is not a convenience — it is a wrong answer that looks like a
 * right one: the breadcrumb says the new cluster and the old namespace, the
 * watch asks the new cluster for pods in a namespace it may not have, and the
 * permission probe asks "can I read logs in `payments`?" of a cluster where
 * `payments` is somebody else's. That is how a padlock and "ask an
 * administrator for get on pods/log" appeared on a cluster where the account
 * was an admin.
 *
 * Everything downstream of the namespace goes with it: the pods on screen, what
 * they were using, what the last cluster said you could do, and the offers the
 * picker had cached.
 *
 * And the screen goes back to the namespace picker. Clearing the namespace
 * without saying so leaves the pod grid on screen with nothing to watch, which
 * reads as an empty cluster rather than as a question — changing cluster is a
 * decision that has to be finished, and choosing where to look is the rest of
 * it.
 */
function leavingCluster() {
  /*
    Tell the host to let go of the old cluster.

    Clearing `targets` here only changed what this store believes. The host
    keeps a watch process and a metrics interval per target, and it is only
    ever asked to reconcile them when a watch is *started* — `watchPods` with
    an empty list returns without stopping anything. So the previous cluster
    kept being polled the whole time somebody stood on the picker choosing the
    next one: `top pods --no-headers` against a namespace nobody was looking
    at, once every interval, which is what put another cluster's command under
    "slow-lab did not answer".
  */
  postMsg({ type: 'dk8s:stopWatch' });

  return {
    stage: 'pick-namespace' as const,
    namespace: undefined,
    pods: [],
    usage: {},
    usageHistory: {},
    targets: [],
    offers: [],
    offersLoaded: false,
    namespaces: [],
    namespacesForbidden: false,
    detail: undefined,
    logs: [],
    watchStatus: 'idle' as const,
    /* Not "denied" and not "allowed": unknown until the new cluster answers. */
    access: ALL_ACCESS,
    reachable: undefined,
    /*
      The command feed deliberately survives. It is the record of what dk8s ran
      for the cluster being left, which is usually the reason somebody is
      leaving it, and Settings -> DK8S -> Commands is not the only place that
      should be readable from.

      What must not survive is a loader on the NEXT screen quoting it, and that
      is fixed where it belongs -- `running-command-pick.ts` shows a command
      only for the cluster on screen and only while it is current.
    */
  };
}

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
  /**
   * A path somebody set by hand, when there is one.
   *
   * The setup screen leads with it: an explicit path that does not work is the
   * likeliest reason to be looking at an install list on a machine that
   * already has kubectl, and until it is said the list is advice for a problem
   * you do not have.
   */
  override?: string;
  /** Set through `DAAKIA_KUBECTL`, which the UI cannot clear. */
  overrideFromEnv?: boolean;
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
  /**
   * True while this pod is only what a table row could say.
   *
   * The grid paints from `kubectl get pods -o wide` first, because that is
   * what comes back in the time a terminal takes; the full JSON follows and
   * clears the flag. Until it does there is no uid, no owning workload, no
   * image and no per-container detail — absent because they were never asked
   * for, not because the cluster said there were none.
   */
  partial?: boolean;
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
   * Everything else a structured format carried — MDC, in practice.
   *
   * Same rule as the three above: from a configured format or absent. The host
   * bounds the count and the value length, so a view may treat this as small
   * without checking.
   */
  fields?: Record<string, string>;
  /**
   * The message with the parsed fields taken out, when a format found them.
   *
   * What a row shows. `text` stays the raw line, because Copy, Export and Ask
   * AI all mean the line as the pod wrote it — a JSON log is only unreadable
   * on screen, not on the clipboard.
   */
  message?: string;

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

export type DetailTab = 'overview' | 'logs' | 'terminal' | 'doctor' | 'explorer' | 'yaml' | 'describe' | 'access';

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
  archive?: boolean;
  /**
   * Files on the volume the template walked past.
   *
   * Named rather than dropped: a `*.log` template beside `app.log.1.gz` takes
   * the newest half of a rotation and leaves the oldest, which is the half
   * people go to the volume for.
   */
  missed?: string[];
  missedCount?: number;
  missedBytes?: number;
}

export interface ExportState {
  phase: 'running' | 'done' | 'error' | 'cancelled';
  /** Pods finished, and how many there are. */
  done: number;
  total: number;
  pod?: string;
  destDir?: string;
  summary?: string;
  results?: ExportResult[];
  error?: string;
  /**
   * Bytes, while an archived volume is being written.
   *
   * A pod count says nothing when one pod's volume is the whole export — it
   * reads "0 of 1" for as long as it takes, which is the same picture as a
   * hang. These are set only while the archived half is running.
   */
  bytes?: number;
  totalBytes?: number;
  /** The archived file being read, and where it is in the set. */
  file?: string;
  fileIndex?: number;
  fileCount?: number;
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
  /**
   * Whether the namespace listing itself has come back.
   *
   * Separate from `contextResults`, which answers a different question: that
   * one says the cluster is REACHABLE, and it arrives a round trip before the
   * namespaces do. The picker read it as "we have heard everything" and, in
   * the two or three seconds between the two messages, told the reader that no
   * namespaces were returned — while the call that would return them was still
   * running.
   */
  offersLoaded: boolean;
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

  /**
   * The kubectl commands dk8s has run, newest last.
   *
   * Held so a wait can say what it is waiting on. A spinner that names the
   * command it is blocked on is the difference between "this is slow" and
   * "this is broken", and it is the same line the audit records — so what a
   * loading state claims and what actually ran cannot drift apart.
   */
  commands: KubectlCommand[];

  /**
   * How long the host waits for a cluster call, in seconds.
   *
   * Mirrors `services/k8s/k8s-timeouts.ts`, and every screen that wants to say
   * "I have heard nothing" derives its wait from this rather than picking a
   * number. A screen that picked its own picked 25 seconds for a call bounded
   * at 30, and announced that the cluster had not answered five seconds before
   * the call it was waiting on had finished.
   */
  clusterTimeoutSeconds: number;
  setClusterTimeout: (seconds: number) => void;

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
  /**
   * When the pod list was last actually read from the cluster.
   *
   * Not the same as `lastEventAt`, which is when something last CHANGED. A
   * namespace where nothing has happened for an hour has an hour-old event
   * time and a list that may have been re-read a minute ago — and "how old is
   * what I am looking at" is the question, so it needs its own answer.
   */
  lastListedAt?: number;
  /**
   * True between pressing Refresh and the list coming back.
   *
   * Only the indicator's own text changes. A loader over the grid would blank
   * rows that are already correct for the second it takes — the reader asked
   * whether the list is current, not to have it taken away while that is
   * established.
   */
  refreshing?: boolean;
  /** Ask for the pod list again, and stop saying so whatever comes back. */
  refreshPods: () => void;
  podScope: 'fav' | 'all';
  /**
   * What the pod grid is filtered to, published so the panel's context menu
   * can offer it.
   *
   * The right-click lands on a div the grid owns, but every dk8s menu is built
   * in one place — so the grid says what it can offer rather than rendering a
   * menu of its own beside the others.
   */
  gridFilter?: {
    kind: 'all' | 'pods' | 'runs';
    setKind: (k: 'all' | 'pods' | 'runs') => void;
    counts: { all: number; pods: number; runs: number };
  };
  setGridFilter: (f: K8sState['gridFilter']) => void;
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
  logDirection: 'last' | 'first' | 'between';
  /** Range pushed down to kubectl. */
  logSince: 'all' | 'restart' | '15m' | '1h' | '6h';
  /**
   * The two ends of a `between` window, as the reader's own clock reads them.
   *
   * `YYYY-MM-DDTHH:mm`, no zone — this is the time on the screen of the person
   * choosing it, which their device already knows. The zone that has to be
   * stated is the one the LOG is written in, and that belongs to the log.
   */
  logFrom: string;
  logTo: string;
  setLogWindow: (from: string, to: string) => void;
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
  /**
   * What somebody marked this as, if they did.
   *
   * Separate from `runtime` on purpose: `runtime` is the answer in force and
   * already carries the mark when there is one, but the screen also has to say
   * whether it was told or worked it out, and offer to change it.
   */
  runtimeMark?: RuntimeMark;
  /** What a mark would be attached to — resolved on the host from the spec. */
  markTarget?: MarkTarget;
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
  setLogDirection: (d: 'last' | 'first' | 'between') => void;
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
  openVsCodeShell: () => void;
  /**
   * Open the Terminal tab with the shell starting in `path`.
   *
   * Consumed once by PodTerminal when it opens the session, then cleared —
   * it describes one opening rather than a property of the pod, and leaving
   * it set would send you back to that directory every time the tab remounts.
   */
  openShellIn: (path: string) => void;
  terminalCwd?: string;
  clearTerminalCwd: () => void;
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
  /**
   * Write lines that belong to no single pod — a search result.
   *
   * `exportLogs` derives its targets from what is selected in the grid or open
   * in the detail, which is exactly right for a pod's log and exactly wrong
   * for a result spanning twelve of them. This takes the name to write under
   * and the lines to write, and asks nothing of the rest of the store.
   */
  exportLines: (name: string, namespace: string, lines: string[]) => void;
  apply: (msg: Record<string, unknown>) => void;
}

/*
  The deadline behind `refreshing`, held out here so a second refresh replaces
  the first one's timer rather than racing it. Two overlapping waits would mean
  the older one clearing a flag the newer one had just set, and the word
  vanishing while the list was still on its way.
*/
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

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
  offersLoaded: false,
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
  setGridFilter: (gridFilter) => set({ gridFilter }),
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
  logFrom: '',
  logTo: '',
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
  /* What has been run, for the waits that name it. */
  commands: [],
  clusterTimeoutSeconds: 30,

  setClusterTimeout: (seconds) => {
    const clamped = Math.min(300, Math.max(5, Math.round(seconds) || 30));
    set({ clusterTimeoutSeconds: clamped });
    postMsg({ type: 'dk8s:setClusterTimeout', seconds: clamped });
  },

  probe: () => {
    set({ busy: true });
    postMsg({ type: 'dk8s:probe' });
  },

  useContext: (name) => {
    logUiEvent('dk8s.context_switch', { context: name, from: get().context });
    set({ busy: true, context: name, ...leavingCluster() });
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
    set({ busy: true, selectedContexts: names, context: names[0], ...leavingCluster() });
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
  setLogDirection: (logDirection) => set(s => {
    /*
      Choosing `between` with two empty boxes would send no window at all and
      quietly fetch the whole log — the opposite of what was asked for, and
      indistinguishable on screen from a window that happened to match
      everything. An hour back to now is a real window and an obvious one to
      edit.
    */
    if (logDirection !== 'between' || (s.logFrom && s.logTo)) return { logDirection };
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const now = new Date();
    return {
      logDirection,
      logFrom: s.logFrom || local(new Date(now.getTime() - 3600_000)),
      logTo: s.logTo || local(now),
    };
  }),
  setLogSince: (logSince) => set({ logSince }),
  setLogWindow: (logFrom, logTo) => set({ logFrom, logTo }),

  /*
    Refresh, with an end to it.

    The flag was cleared by the snapshot it was waiting for, which is right
    until no snapshot comes — a list that errors, a watch that is not running,
    a cluster that never answers. Then the word sat on screen forever claiming
    something was in flight that had already failed.

    So the wait has a deadline of its own. Whatever happens, the label stops
    lying; a real failure still says so through the watch status beside it.
  */
  refreshPods: () => {
    if (get().refreshing) return;
    set({ refreshing: true });
    postMsg({ type: 'dk8s:refreshPods' });
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      if (useK8sStore.getState().refreshing) useK8sStore.setState({ refreshing: false });
    }, Math.max(5, get().clusterTimeoutSeconds) * 1000);
  },

  fetchLogs: () => get().reloadLogs(),

  openLogExport: () => set({ logExportOpen: true }),
  closeLogExport: () => set({ logExportOpen: false }),
  setLogWrap: (logWrap) => set({ logWrap }),

  setLogPrevious: (logPrevious) => { set({ logPrevious }); get().reloadLogs(); },
  setLogContainer: (logContainer) => { set({ logContainer }); get().reloadLogs(); },

  reloadLogs: () => {
    const {
      detail, logPrevious, logContainer, logLive, logTail, logDirection, logSince,
      logFrom, logTo,
    } = get();
    if (!detail) return;
    set({
      logs: [], logDropped: 0, logStatus: 'loading',
      logDetail: undefined, logSelection: undefined, logRequestedAt: Date.now(),
    });

    /* `datetime-local` gives a zoneless local reading; the server wants
       RFC3339 and the local end wants epoch ms. `Date.parse` of a zoneless
       string uses the device's own zone, which is exactly what was meant. */
    const isoOf = (v: string): string | undefined => {
      const ms = Date.parse(v);
      return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
    };
    const msOf = (v: string): number | undefined => {
      const ms = Date.parse(v);
      return Number.isFinite(ms) ? ms : undefined;
    };

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
      /*
        `between` is not a direction the stream knows — it is a window. It
        reads as a third choice beside last and first because that is how
        somebody picks it, but what goes over the wire is a start, an end, and
        a tail from the end of that window.
      */
      direction: logLive || logDirection === 'between' ? 'last' : logDirection,
      tailLines: logTail,
      ...(logDirection === 'between' && !logLive
        ? { fromIso: isoOf(logFrom), toMs: msOf(logTo) }
        : { sinceSeconds: SINCE[logSince] }),
    });
  },

  setLogSelection: (logSelection) => set({ logSelection }),

  /*
    Opens the Terminal tab, not a VS Code terminal.

    dk8s has its own PTY now, in the panel, with the theme and scrollback the
    reader configured — so sending them out to a separate terminal window was
    handing them a worse version of a thing this tool already does. The VS Code
    route is still there, as a chip in the terminal's own footer, for anyone
    who wants their own shell integration.

    The audit record is unchanged and still written here: opening a shell is
    the most sensitive action in the tool, and where the shell is drawn does
    not change that.
  */
  openShell: () => {
    const { detail, logContainer } = get();
    if (!detail) return;
    set({ shellNotice: undefined, detailTab: 'terminal' });
    // The most sensitive action in the tool, so the record is the fullest.
    logUiEvent('dk8s.shell', {
      context: detail.context, namespace: detail.namespace, pod: detail.name,
      container: logContainer ?? detail.containers[0]?.name,
      containers: detail.containers.map(c => c.name),
      image: detail.image, node: detail.node, phase: detail.phase,
      into: 'panel',
    });
  },

  /** The VS Code terminal, kept for anyone who wants their own shell setup. */
  openVsCodeShell: () => {
    const { detail, logContainer } = get();
    if (!detail) return;
    set({ shellNotice: undefined, shellPending: true });
    logUiEvent('dk8s.shell', {
      context: detail.context, namespace: detail.namespace, pod: detail.name,
      container: logContainer ?? detail.containers[0]?.name,
      into: 'vscode',
    });
    postMsg({
      type: 'dk8s:shell',
      context: detail.context, namespace: detail.namespace, pod: detail.name,
      container: logContainer,
    });
  },

  openShellIn: (path) => {
    const { detail } = get();
    if (!detail) return;
    logUiEvent('dk8s.shell', {
      context: detail.context, namespace: detail.namespace, pod: detail.name,
      // The directory is part of the record: "opened a shell" and "opened a
      // shell in /var/lib/secrets" are not the same event to an auditor.
      cwd: path, into: 'panel', from: 'explorer',
    });
    set({ shellNotice: undefined, terminalCwd: path, detailTab: 'terminal' });
  },

  clearTerminalCwd: () => set({ terminalCwd: undefined }),

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

  /*
    From the pod list, the same thing: open the pod on its Terminal tab.

    `openDetail` resets the tab to whatever this pod was last read on, so the
    tab is set after it rather than before — the same ordering the context
    menu's other destinations use.
  */
  openShellFor: (pod) => {
    set({ shellNotice: undefined });
    get().openDetail(pod);
    set({ detailTab: 'terminal' });
    // The same record the detail view writes: this is the most sensitive
    // action in the tool wherever it is started from.
    logUiEvent('dk8s.shell', {
      context: pod.context, namespace: pod.namespace, pod: pod.name,
      container: pod.containers?.[0]?.name,
      containers: (pod.containers ?? []).map(c => c.name),
      image: pod.image, node: pod.node, phase: pod.phase,
      from: 'context-menu', into: 'panel',
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

  exportLines: (name, namespace, lines) => {
    logUiEvent('dk8s.results_export', { name, namespace, lines: lines.length });
    set({ exportState: { phase: 'running', done: 0, total: 1 } });
    postMsg({
      type: 'dk8s:exportLogs',
      options: {
        range: { kind: 'all' }, slice: { kind: 'all' },
        includePrevious: false, keepTimestamps: true,
      },
      /* Present, so the host writes these rather than re-reading a pod — there
         is no one pod behind them to re-read. */
      visibleLines: lines,
      /* One target, named for the search. `logFileName` replaces anything a
         filename cannot carry, so a query with spaces or slashes in it lands
         as `worker_process.log` rather than failing at the write. */
      targets: [{ context: '', namespace, pod: name, containers: [] }],
    });
  },

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
        /* Kept in the union so an explicit visit from the breadcrumb still
           works; nothing routes here on its own. */
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
          /* The host's ceiling, so a screen's own backstop derives from the
             same number rather than a guess. */
          clusterTimeoutSeconds: (msg.clusterTimeoutSeconds as number) ?? get().clusterTimeoutSeconds,
        });
        break;
      }

      case 'dk8s:contextSet': {
        const reachable = msg.reachable as Reachability;
        const ctx = msg.context as string;
        const known = !!get().sensitivity[ctx];
        const namespace = msg.namespace as string | undefined;
        set({
          busy: false, context: ctx, reachable,
          namespace,
          stage: !reachable.reachable ? 'unreachable'
            /* Nothing to watch yet. A cluster's default namespace is a
               reasonable proposal, not a choice somebody made — and after a
               switch there is deliberately no namespace at all, so the picker
               is the only honest screen. */
            : !namespace ? 'pick-namespace'
            /* Was: an unclassified context sent you to the prompt before you
               had seen a single pod. An unclassified context is now simply one
               that has not been corrected yet. */
            : !known ? 'ready'
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

      /* The host had nothing to re-read, so the wait ends here. */
      case 'dk8s:refreshDone':
        if (refreshTimer !== undefined) {
          clearTimeout(refreshTimer);
          refreshTimer = undefined;
        }
        set({ refreshing: false });
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
          lastListedAt: Date.now(),
          refreshing: false,
        }));
        if (refreshTimer !== undefined) {
          clearTimeout(refreshTimer);
          refreshTimer = undefined;
        }
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
          // A watch that drops mid-refresh has answered: nothing is coming.
          const stalled = s.refreshing && incoming !== 'connected' ? { refreshing: false } : {};
          return worse || incoming === 'connected'
            ? { watchStatus: incoming, watchDetail: msg.detail as string | undefined, ...stalled }
            : stalled;
        });
        break;

      case 'dk8s:contextsSet':
        set(s => ({
          busy: false,
          selectedContexts: (msg.contexts as string[]) ?? [],
          contextResults: (msg.results as { context: string; reachable: Reachability }[]) ?? [],
          /*
            A late answer must not undo a choice already made.

            The host allows 15 seconds per context, so with a dead cluster in
            the selection this reply can land well after the reader has ticked
            their namespaces and pressed Watch. It set the stage unconditionally
            — so the pod grid they were looking at was replaced by the namespace
            picker, fifteen seconds after they had finished with it, for no
            reason they could see.

            The results are still worth taking: they are what the picker will
            show the next time it is opened. The stage is not.
          */
          stage: s.stage === 'ready' ? s.stage : 'pick-namespace',
          /* The namespaces for these contexts have not been asked for yet, let
             alone answered. Clearing the previous cluster's offers as well:
             showing one cluster's namespaces under another cluster's name is
             worse than showing none. */
          offers: [],
          offersLoaded: false,
        }));
        break;

      case 'dk8s:namespacesMulti':
        set({
          busy: false,
          offers: (msg.perContext as NamespaceOffer[]) ?? [],
          offersLoaded: true,
        });
        break;

      case 'dk8s:targetsSet':
        set({ targets: (msg.targets as WatchTarget[]) ?? [], stage: 'ready' });
        break;

      case 'dk8s:exportStarted':
        set(s => ({ exportState: { ...(s.exportState ?? { done: 0, total: 0 }), phase: 'running',
                                   total: msg.total as number, destDir: msg.destDir as string } }));
        break;

      case 'dk8s:exportBytes':
        set(s => ({ exportState: { ...(s.exportState ?? { done: 0, total: 0 }),
                                   phase: 'running',
                                   pod: msg.pod as string,
                                   bytes: msg.bytes as number,
                                   totalBytes: msg.totalBytes as number,
                                   file: msg.file as string,
                                   fileIndex: msg.index as number,
                                   fileCount: msg.count as number } }));
        break;

      case 'dk8s:exportProgress':
        set(s => ({ exportState: { ...(s.exportState ?? { phase: 'running', total: 0 }),
                                   phase: 'running',
                                   done: msg.done as number, total: msg.total as number,
                                   pod: msg.pod as string } }));
        break;

      case 'dk8s:exportDone':
        /*
          The dialog stays open on the result.

          It used to close itself the instant the last byte landed, which meant
          the summary you had just waited minutes for — where the files went,
          and which pods gave nothing — appeared in a banner somewhere behind
          the dialog that was being torn away at the same moment. The one thing
          you need next is the path, and it was the thing hardest to catch.

          The selection is still cleared: that work is finished either way.
        */
        set(s => ({
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
          /* What somebody said this is, and what a menu would mark. */
          runtimeMark: msg.mark as RuntimeMark | undefined,
          markTarget: msg.markTarget as MarkTarget | undefined,
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

      /* One command, as it happens — see kubectl-audit on the host. Capped:
         this is a window on what is running, not a second audit log. */
      case 'dk8s:command':
        set(s => ({
          /*
            A call is reported when it is fired and again when it comes back,
            so the second report completes the first row rather than adding a
            second. Without this the feed would show every command twice — once
            with no duration and once with one.
          */
          commands: mergeCommand(s.commands, msg.event as KubectlCommand),
        }));
        break;

      case 'dk8s:clusterTimeout':
        set({ clusterTimeoutSeconds: msg.seconds as number });
        break;

      /* The backlog, for a panel that opened after the commands had run. */
      case 'dk8s:commands':
        set({ commands: ((msg.events as KubectlCommand[]) ?? []).slice(-40) });
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
