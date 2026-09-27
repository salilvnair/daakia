/**
 * What Daakia AI has done so far on the answer it is writing — one step per
 * tool call, for the steps card under the "thinking" line.
 *
 * Every dk8s step shows here, not only a search: a kubectl command it ran and
 * why, a search of the pods' logs, a look in the Daakia manual. Each is started
 * by its own host message and finished by its result (a manual lookup has no
 * result message, so the next step or the answer finishes it). The list is
 * started fresh when a request begins (`ai:resolved`) and closed when the
 * answer is complete.
 */
import { create } from 'zustand';

export type Dk8sStepKind = 'kubectl' | 'search' | 'docs';

export interface Dk8sStep {
  id: string;
  kind: Dk8sStepKind;
  state: 'running' | 'done' | 'failed';
  startedAt: number;
  ms?: number;
  /** kubectl: the command, as run. */
  command?: string;
  /** The model's own reason for the step — its thinking, shown as it gave it. */
  why?: string;
  /** search: what was searched for, and where. */
  query?: string;
  pods?: number;
  /** docs: what was looked up. */
  topic?: string;
  /** A one-line outcome once it is done. */
  outcome?: string;
}

interface StepsOfTab {
  steps: Dk8sStep[];
  startedAt: number;
  done: boolean;
}

interface State {
  byTab: Record<string, StepsOfTab>;
  apply: (msg: Record<string, unknown>) => void;
}

const finishRunning = (steps: Dk8sStep[], now: number): Dk8sStep[] =>
  steps.map(s => (s.state === 'running' ? { ...s, state: 'done', ms: now - s.startedAt } : s));

function outcomeOfKubectl(result: unknown): { outcome: string; failed: boolean } {
  const r = (result ?? {}) as { ok?: boolean; code?: number | null; output?: string; refused?: string; proposal?: boolean; elapsedMs?: number };
  if (r.refused) return { outcome: r.proposal ? 'left for you to run' : 'not run', failed: !r.proposal };
  if (r.ok === false) return { outcome: r.code != null ? `exited ${r.code}` : 'failed', failed: true };
  const lines = (r.output ?? '').split('\n').filter(Boolean).length;
  return { outcome: lines ? `${lines.toLocaleString()} line${lines === 1 ? '' : 's'} back` : 'no output', failed: false };
}

export const useDk8sAiSteps = create<State>((setAll, get) => ({
  byTab: {},
  apply: (msg) => {
    const tabId = String(msg.tabId ?? '');
    if (!tabId) return;
    const now = Date.now();
    const cur = get().byTab[tabId];
    const put = (next: StepsOfTab | undefined) => setAll(s => {
      const { [tabId]: _old, ...rest } = s.byTab;
      return { byTab: next ? { ...rest, [tabId]: next } : rest };
    });
    const base = (): StepsOfTab => (cur && !cur.done ? cur : { steps: [], startedAt: now, done: false });
    /* A new step closes any manual lookup still open — it has no result
       message of its own, so the next step is when it finished. */
    const add = (step: Dk8sStep) => {
      const b = base();
      const steps = b.steps
        .filter(x => x.id !== step.id)
        .map(x => (x.kind === 'docs' && x.state === 'running' ? { ...x, state: 'done' as const, ms: now - x.startedAt } : x));
      put({ ...b, steps: [...steps, step] });
    };
    const update = (id: string, patch: Partial<Dk8sStep>) => {
      if (!cur) return;
      put({ ...cur, steps: cur.steps.map(s => (s.id === id ? { ...s, ...patch } : s)) });
    };
    const idOf = (fallback: string) => String(msg.toolCallId ?? fallback);

    switch (msg.type) {
      case 'ai:resolved':
        /* A request is starting: a fresh list. */
        put({ steps: [], startedAt: now, done: false });
        return;
      case 'ai:docsLookup':
        add({ id: idOf(`docs-${now}`), kind: 'docs', state: 'running', startedAt: now, topic: String(msg.query ?? '') });
        return;
      case 'ai:kubectlRunStarted':
        add({
          id: idOf(`kubectl-${now}`), kind: 'kubectl', state: 'running', startedAt: now,
          command: String(msg.command ?? ''), why: msg.why ? String(msg.why) : undefined,
        });
        return;
      case 'ai:kubectlRunResult': {
        const id = idOf('');
        const step = cur?.steps.find(s => s.id === id) ?? [...(cur?.steps ?? [])].reverse().find(s => s.kind === 'kubectl' && s.state === 'running');
        if (!step) return;
        const { outcome, failed } = outcomeOfKubectl(msg.result);
        update(step.id, { state: failed ? 'failed' : 'done', ms: now - step.startedAt, outcome });
        return;
      }
      case 'ai:dk8sSearchStarted':
        add({
          id: idOf(`search-${now}`), kind: 'search', state: 'running', startedAt: now,
          query: String(msg.query ?? ''), pods: Number(msg.pods ?? 0),
          why: msg.why ? String(msg.why) : undefined,
        });
        return;
      case 'ai:dk8sSearchResult': {
        const id = idOf('');
        const step = cur?.steps.find(s => s.id === id) ?? [...(cur?.steps ?? [])].reverse().find(s => s.kind === 'search' && s.state === 'running');
        if (!step) return;
        const groups = ((msg.result as { groups?: { failures?: number }[] })?.groups) ?? [];
        const failures = groups.reduce((n, g) => n + (g.failures ?? 0), 0);
        update(step.id, {
          state: 'done', ms: now - step.startedAt,
          outcome: groups.length
            ? `${groups.length} thread${groups.length === 1 ? '' : 's'}${failures ? `, ${failures} failure${failures === 1 ? '' : 's'}` : ''}`
            : 'nothing matched',
        });
        return;
      }
      case 'ai:complete':
      case 'ai:error':
      case 'ai:cancelled':
        if (cur) put({ ...cur, steps: finishRunning(cur.steps, now), done: true });
        return;
    }
  },
}));
