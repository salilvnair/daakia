/**
 * "Give me a pod name and tell me what is actually there."
 *
 * ── The question this answers ──
 *
 * Configuring an archive path means writing a path that lives inside somebody
 * else's container. Get one character wrong and the result is not an error —
 * it is an empty search, which looks exactly like a pod that has no archived
 * logs. The old Check could not help: it stat'd the path on THIS machine, so
 * a path inside the cluster came back as `C:\prodapp-prod-pvc\… not found`,
 * naming a drive letter nobody typed about a machine that was never involved.
 *
 * This asks the pod. It reports what the pod says it mounts, and then what is
 * really under the paths you configured — read through `kubectl exec`, which
 * is the only place those paths exist.
 *
 * Every answer carries the command that produced it. A check you cannot
 * reproduce by hand is a check you have to take on faith, and the whole point
 * of this box is to stop taking paths on faith.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';

export interface CheckedMount {
  path: string;
  name: string;
  container: string;
  kind: string;
  claim?: string;
  readOnly?: boolean;
  likelyLogs: boolean;
}

export interface CheckedFile {
  rel: string;
  bytes: number;
  mtime?: number;
}

/** A pod the check can be run against — never a finished CronJob run. */
export interface PickablePod {
  name: string;
  app: string;
  phase: string;
}

export interface CheckedPath {
  root: string;
  files: CheckedFile[];
  error?: string;
  capped?: boolean;
  command?: string;
  /** Still waiting on the pod. */
  busy?: boolean;
}

interface PodCheckState {
  /** The chosen target. Narrowed context → namespace → pod, in that order. */
  pod: string;
  namespace: string;
  context: string;
  setTarget: (t: Partial<Pick<PodCheckState, 'pod' | 'namespace' | 'context'>>) => void;

  /*
    What there is to choose from.

    Typed by hand, a pod name is a guess that fails as an empty result rather
    than an error — the same failure mode as a mistyped path, and this box
    exists to end that one. So the cluster is asked what is actually there and
    the answer is the menu.
  */
  namespaces: string[];
  pods: PickablePod[];
  loadingPicker: boolean;
  pickerError?: string;
  /** Ask for the namespaces in a context, and the pods in one of them. */
  loadPicker: (context: string, namespace?: string) => void;

  busy: boolean;
  /** Which pod the current answers are about, so a stale reply is ignored. */
  checked?: string;
  mounts?: CheckedMount[];
  mountsCommand?: string;
  mountsError?: string;
  /** Keyed by the path asked about. */
  paths: Record<string, CheckedPath>;

  check: (roots: string[]) => void;
  clear: () => void;
  apply: (msg: Record<string, unknown>) => void;
}

export const usePodCheckStore = create<PodCheckState>((set, get) => ({
  pod: '',
  namespace: '',
  context: '',
  busy: false,
  paths: {},
  namespaces: [],
  pods: [],
  loadingPicker: false,

  /*
    Choosing wider throws away what was chosen narrower.

    A pod name is only meaningful inside the namespace it was picked from, so
    leaving it on screen after the namespace changes shows a target that does
    not exist — and the check would then fail on it, blaming the pod.

    A value given in the same call always wins over that clearing. Opening on
    a known pod means naming all three at once, and a cascade that wiped two
    of them would make the common case the one that does not work.
  */
  setTarget: (t) => set(s => {
    const context = t.context ?? s.context;
    const contextMoved = context !== s.context;

    const namespace = t.namespace ?? (contextMoved ? '' : s.namespace);
    const namespaceMoved = namespace !== s.namespace;

    const pod = t.pod ?? (contextMoved || namespaceMoved ? '' : s.pod);

    return {
      context, namespace, pod,
      ...(contextMoved ? { namespaces: [], pods: [] } : {}),
      ...(namespaceMoved ? { pods: [] } : {}),
    };
  }),

  loadPicker: (context, namespace) => {
    if (!context) return;
    set({ loadingPicker: true, pickerError: undefined });
    postMsg({ type: 'dk8s:podPicker', context, namespace: namespace ?? '' });
  },

  clear: () => set({
    busy: false, checked: undefined, mounts: undefined,
    mountsCommand: undefined, mountsError: undefined, paths: {},
  }),

  /**
   * Ask the pod what it mounts, and what is under each configured root.
   *
   * Both at once rather than mounts-then-paths: the configured roots are worth
   * checking whether or not the pod reports a matching mount, because a path
   * can be right and unmounted, or mounted and empty, and those are different
   * answers.
   */
  check: (roots) => {
    const { pod, namespace, context } = get();
    if (!pod.trim() || !namespace.trim()) return;

    const target = { context: context.trim(), namespace: namespace.trim(), pod: pod.trim() };
    set({
      busy: true,
      checked: target.pod,
      mounts: undefined,
      mountsError: undefined,
      paths: Object.fromEntries(roots.map(r => [r, { root: r, files: [], busy: true }])),
    });

    postMsg({ type: 'dk8s:podMounts', ...target });
    for (const root of roots) postMsg({ type: 'dk8s:pvList', ...target, root });
  },

  apply: (msg) => {
    switch (msg.type) {
      case 'dk8s:podMounts': {
        /* A reply for a pod somebody has already moved on from is not news. */
        if (msg.pod !== get().checked) break;
        set({
          busy: false,
          mounts: (msg.mounts as CheckedMount[]) ?? [],
          mountsCommand: msg.command as string | undefined,
          mountsError: msg.error as string | undefined,
        });
        break;
      }

      case 'dk8s:pvListed': {
        if (msg.pod !== get().checked) break;
        const root = String(msg.root ?? '');
        set(s => ({
          paths: {
            ...s.paths,
            [root]: {
              root,
              files: (msg.files as CheckedFile[]) ?? [],
              error: msg.error as string | undefined,
              capped: !!msg.capped,
              command: (msg.commands as string[] | undefined)?.[0],
              busy: false,
            },
          },
        }));
        break;
      }

      case 'dk8s:podPicker': {
        /* A reply for a context or namespace already moved on from would
           populate the menus with somewhere else's names. */
        const { context, namespace } = get();
        if (msg.context !== context) break;
        const forThisNamespace = (msg.namespace ?? '') === namespace;
        set({
          loadingPicker: false,
          namespaces: (msg.namespaces as string[]) ?? [],
          ...(forThisNamespace ? { pods: (msg.pods as PickablePod[]) ?? [] } : {}),
          pickerError: (msg.namespacesError as string | undefined)
            ?? (forThisNamespace ? (msg.podsError as string | undefined) : undefined),
        });
        break;
      }

      default:
        break;
    }
  },
}));
