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
  /** What was typed, not what was found — so a failed check keeps the input. */
  pod: string;
  namespace: string;
  context: string;
  setTarget: (t: Partial<Pick<PodCheckState, 'pod' | 'namespace' | 'context'>>) => void;

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

  setTarget: (t) => set(t),

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

      default:
        break;
    }
  },
}));
