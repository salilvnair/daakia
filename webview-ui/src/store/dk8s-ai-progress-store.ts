/**
 * Where a Daakia AI dk8s search is while it runs — for the progress box.
 *
 * The chat library shows one line of text while it waits, which is enough to
 * say what is being searched but not where it has got to. The host reports
 * each half (live logs, then the archive) as it starts and finishes; this
 * keeps the latest, and the box under the "thinking" line draws it.
 */
import { create } from 'zustand';

export interface Dk8sPhaseState {
  state: 'running' | 'done';
  hits: number;
  ms: number;
}

export interface Dk8sAiProgress {
  tabId: string;
  query: string;
  around: number;
  pods: number;
  namespaces: string[];
  archive: boolean;
  live?: Dk8sPhaseState;
  archivePhase?: Dk8sPhaseState;
  /** Set when the result is back and the model is writing the answer. */
  found?: { threads: number; failures: number };
}

interface State {
  progress?: Dk8sAiProgress;
  apply: (msg: Record<string, unknown>) => void;
}

export const useDk8sAiProgress = create<State>((set, get) => ({
  progress: undefined,
  apply: (msg) => {
    const tabId = String(msg.tabId ?? '');
    const cur = get().progress;
    switch (msg.type) {
      case 'ai:dk8sSearchStarted':
        set({ progress: {
          tabId, query: String(msg.query ?? ''), around: Number(msg.around ?? 20),
          pods: Number(msg.pods ?? 0), archive: !!msg.archive,
          namespaces: Array.isArray(msg.namespaces) ? (msg.namespaces as string[]) : [],
        } });
        return;
      case 'ai:dk8sSearchPhase': {
        if (!cur || cur.tabId !== tabId) return;
        const phase: Dk8sPhaseState = { state: msg.state === 'done' ? 'done' : 'running', hits: Number(msg.hits ?? 0), ms: Number(msg.ms ?? 0) };
        set({ progress: msg.phase === 'archive' ? { ...cur, archivePhase: phase } : { ...cur, live: phase } });
        return;
      }
      case 'ai:dk8sSearchResult': {
        if (!cur || cur.tabId !== tabId) return;
        const groups = ((msg.result as { groups?: { failures?: number }[] })?.groups) ?? [];
        set({ progress: { ...cur, found: { threads: groups.length, failures: groups.reduce((n, g) => n + (g.failures ?? 0), 0) } } });
        return;
      }
      case 'ai:complete':
      case 'ai:error':
      case 'ai:cancelled':
        if (cur && cur.tabId === tabId) set({ progress: undefined });
        return;
    }
  },
}));
