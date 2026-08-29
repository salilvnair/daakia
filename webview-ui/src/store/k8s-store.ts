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

  probe: () => void;
  useContext: (name: string) => void;
  setNamespace: (ns: string) => void;
  setSensitivity: (level: Sensitivity) => void;
  setKubectlPath: (path: string) => void;
  openContextPicker: () => void;
  openNamespacePicker: () => void;
  startWatch: () => void;
  stopWatch: () => void;
  setFilter: (v: string) => void;
  setView: (v: 'cards' | 'table') => void;
  selectPod: (name?: string) => void;
  apply: (msg: Record<string, unknown>) => void;
}

export const useK8sStore = create<K8sState>((set, get) => ({
  stage: 'probing',
  platform: 'unknown',
  contexts: [],
  namespaces: [],
  namespacesForbidden: false,
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

  probe: () => {
    set({ busy: true });
    postMsg({ type: 'dk8s:probe' });
  },

  useContext: (name) => {
    set({ busy: true, context: name });
    postMsg({ type: 'dk8s:useContext', context: name });
  },

  setNamespace: (ns) => {
    // Drop the old namespace's pods immediately. Leaving them on screen while
    // the new watch spins up shows pods that are not in the namespace the
    // breadcrumb now claims — briefly, and wrongly.
    set({ namespace: ns, stage: 'ready', pods: [], usage: {}, usageHistory: {}, watchStatus: 'idle' });
    postMsg({ type: 'dk8s:setNamespace', namespace: ns });
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
    const { context, namespace } = get();
    if (!context || !namespace) return;
    postMsg({ type: 'dk8s:watchPods', context, namespace });
  },

  stopWatch: () => postMsg({ type: 'dk8s:stopWatch' }),

  setFilter: (filter) => set({ filter }),
  setView: (view) => set({ view }),
  selectPod: (selectedPod) => set({ selectedPod }),

  openContextPicker: () => set({ stage: 'pick-context' }),
  openNamespacePicker: () => {
    const ctx = get().context;
    set({ stage: 'pick-namespace' });
    if (ctx) postMsg({ type: 'dk8s:namespaces', context: ctx });
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
        });
        break;

      case 'dk8s:namespaceSet':
        set({ namespace: msg.namespace as string, stage: 'ready' });
        break;

      case 'dk8s:podSnapshot':
        set({ pods: (msg.pods as PodSummary[]) ?? [] });
        break;

      case 'dk8s:podEvent': {
        const pod = msg.pod as PodSummary;
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
        set({
          watchStatus: msg.status as WatchStatus,
          watchDetail: msg.detail as string | undefined,
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
