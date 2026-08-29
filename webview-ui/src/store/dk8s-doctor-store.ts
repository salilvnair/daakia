/**
 * Artifact collection state, and the honest description of what each one costs.
 *
 * The cost metadata is the important part of this file. Every one of these
 * actions reaches into a container that is serving traffic, and the difference
 * between "prints the stack of every thread, microseconds" and "stops the world
 * and writes four gigabytes" is the difference between a routine check and an
 * outage. That difference has to be visible at the click, not in a doc.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';

export type ArtifactKind =
  | 'threaddump' | 'threaddump-sigquit' | 'histogram'
  | 'heapdump' | 'jfr' | 'stackdump' | 'conns';

export interface CollectResult {
  kind: ArtifactKind;
  ok: boolean;
  file?: string;
  bytes?: number;
  text?: string;
  error?: string;
  command?: string;
  elapsedMs?: number;
}

export interface CollectProgress {
  phase: 'probing' | 'running' | 'copying' | 'done';
  detail: string;
  fraction?: number;
}

export interface ArtifactMeta {
  label: string;
  what: string;
  cost: 'light' | 'moderate' | 'heavy';
  costLabel: string;
  /** Shown before a heavy action runs — states the cost, not "are you sure?". */
  warning: string;
  confirmLabel: string;
  /** Which prompt explains this artifact. */
  promptKey: string;
}

export const ARTIFACT_META: Record<string, ArtifactMeta> = {
  threaddump: {
    label: 'Thread dump',
    what: 'Every thread and what it is waiting on. The first thing to take when a service has gone quiet.',
    cost: 'light',
    costLabel: 'safe',
    warning: 'Pauses the JVM for a few milliseconds.',
    confirmLabel: 'Take it',
    promptKey: 'dk8s.threads.explain',
  },
  'threaddump-sigquit': {
    label: 'Thread dump via SIGQUIT',
    what: 'Signals the JVM to print a dump to its own stdout, which the log then captures. Works on JRE images that have no jcmd.',
    cost: 'light',
    costLabel: 'safe',
    warning: 'The dump is written into the pod’s log, so it will also appear in whatever ships those logs.',
    confirmLabel: 'Signal the JVM',
    promptKey: 'dk8s.threads.explain',
  },
  histogram: {
    label: 'Class histogram',
    what: 'How many of each class are on the heap, and how much they weigh. Usually enough to identify a leak without taking a full dump.',
    cost: 'moderate',
    costLabel: 'brief pause',
    warning: 'Walks the whole heap — a second or two of pause on a large one.',
    confirmLabel: 'Take it',
    promptKey: 'dk8s.heap.explain',
  },
  heapdump: {
    label: 'Heap dump',
    what: 'The entire heap, as a .hprof the analyzer can open. The complete answer, at the highest cost.',
    cost: 'heavy',
    costLabel: 'stops the JVM',
    warning: 'This stops the world for seconds, writes a file the size of the live heap into the '
      + 'container, then copies it out. On a pod behind a load balancer with a short health-check '
      + 'timeout, that can be long enough to be taken out of rotation. Try the class histogram first.',
    confirmLabel: 'Take the dump anyway',
    promptKey: 'dk8s.heap.explain',
  },
  jfr: {
    label: 'Flight recording',
    what: 'A profile over a window of time — allocation, locks, I/O. For "it is slow" rather than "it is stuck".',
    cost: 'moderate',
    costLabel: 'runs for 30s',
    warning: 'Records for 30 seconds with a small ongoing overhead, then copies the file out.',
    confirmLabel: 'Start recording',
    promptKey: 'dk8s.threads.explain',
  },
  stackdump: {
    label: 'Python stack dump',
    what: 'What every Python thread is executing, via py-spy.',
    cost: 'moderate',
    costLabel: 'installs py-spy',
    warning: 'py-spy is not in this image, so it will be pip-installed into the running container. '
      + 'That changes a live pod, and the change is lost on the next restart. Nothing else here '
      + 'modifies a container.',
    confirmLabel: 'Install and dump',
    promptKey: 'dk8s.threads.explain',
  },
  conns: {
    label: 'Connection snapshot',
    what: 'Open sockets and their states — what this pod is talking to, and what is stuck half-open.',
    cost: 'light',
    costLabel: 'safe',
    warning: 'Reads /proc. No effect on the process.',
    confirmLabel: 'Take it',
    promptKey: 'dk8s.log.askWhy',
  },
};

export interface CollectRequest {
  kind: ArtifactKind;
  context: string;
  namespace: string;
  pod: string;
  container?: string;
  targetPid?: string;
  useJstack?: boolean;
  useJmap?: boolean;
  allowInstall?: boolean;
  seconds?: number;
}

interface DoctorState {
  running?: { kind: ArtifactKind; pod: string; progress?: CollectProgress };
  results: CollectResult[];
  destDir?: string;
  /** Set when an artifact has been handed to a Doctor-tab analyzer. */
  handoff?: { analyzer: string; file: string; kind: string };

  collect: (req: CollectRequest) => void;
  analyze: (result: CollectResult) => void;
  reveal: () => void;
  clearHandoff: () => void;
  apply: (msg: Record<string, unknown>) => void;
}

export const useDk8sDoctorStore = create<DoctorState>((set) => ({
  results: [],

  collect: (req) => {
    // One at a time. Two heap dumps against the same JVM would each stop the
    // world while the other was copying, and the panel has no way to show two
    // progress bars honestly anyway.
    set({ running: { kind: req.kind, pod: req.pod } });
    postMsg({ type: 'dk8s:collect', ...req });
  },

  analyze: (result) => {
    postMsg({ type: 'dk8s:analyze', file: result.file, kind: result.kind });
  },

  reveal: () => postMsg({ type: 'dk8s:revealArtifacts' }),
  clearHandoff: () => set({ handoff: undefined }),

  apply: (msg) => {
    switch (msg.type) {
      case 'dk8s:collectStarted':
        set({ running: { kind: msg.kind as ArtifactKind, pod: msg.pod as string } });
        break;

      case 'dk8s:collectProgress':
        set(s => (s.running ? {
          running: {
            ...s.running,
            progress: {
              phase: msg.phase as CollectProgress['phase'],
              detail: msg.detail as string,
              fraction: msg.fraction as number | undefined,
            },
          },
        } : {}));
        break;

      case 'dk8s:collectDone':
        set(s => ({
          running: undefined,
          destDir: (msg.destDir as string) ?? s.destDir,
          // Newest first, and capped — during an incident people take a lot of
          // these, and an unbounded list of megabyte text blobs is a leak.
          results: [msg.result as CollectResult, ...s.results].slice(0, 12),
        }));
        break;

      case 'dk8s:handoff':
        set({
          handoff: {
            analyzer: msg.analyzer as string,
            file: msg.file as string,
            kind: msg.kind as string,
          },
        });
        break;
    }
  },
}));
