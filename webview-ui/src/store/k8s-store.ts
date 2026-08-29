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

  probe: () => void;
  useContext: (name: string) => void;
  setNamespace: (ns: string) => void;
  setSensitivity: (level: Sensitivity) => void;
  setKubectlPath: (path: string) => void;
  openContextPicker: () => void;
  openNamespacePicker: () => void;
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

  probe: () => {
    set({ busy: true });
    postMsg({ type: 'dk8s:probe' });
  },

  useContext: (name) => {
    set({ busy: true, context: name });
    postMsg({ type: 'dk8s:useContext', context: name });
  },

  setNamespace: (ns) => {
    set({ namespace: ns, stage: 'ready' });
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
