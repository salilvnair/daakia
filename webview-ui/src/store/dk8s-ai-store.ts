/**
 * The AI side of dk8s.
 *
 * Kept separate from the pod store because it has a different lifetime: an
 * answer stays worth reading after you have navigated to a different pod, and
 * folding it into the pod store would have thrown it away on every selection.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { logUiEvent } from './ui-audit-store';

/** Mirrors DK8S_LOG_ACTIONS on the host. Labels only — the prompts live there. */
export const DK8S_LOG_ACTIONS = [
  { key: 'dk8s.log.askWhy', label: 'Ask AI why', hint: 'What is happening here, and why' },
  { key: 'dk8s.log.explainError', label: 'Explain this error', hint: 'What the exception means and whether it matters' },
  { key: 'dk8s.log.summarise', label: 'Summarise', hint: 'A timeline of what this log shows' },
] as const;

export interface AskRequest {
  promptKey: string;
  title: string;
  evidence: string;
  evidenceLabel: string;
  /** Lets the host enrich the pack before it goes out — see handleDk8sAsk. */
  evidenceKind?: string;
  podContext: Record<string, unknown>;
  question?: string;
}

export interface Dk8sAnswer {
  id: string;
  title: string;
  promptKey: string;
  /** The evidence sent, so the answer can be read against what produced it. */
  evidence: string;
  podName?: string;
  text: string;
  streaming: boolean;
  error?: string;
  startedAt: number;
}

interface Dk8sAiState {
  open: boolean;
  answers: Dk8sAnswer[];
  /** The answer currently being streamed, if any. */
  activeId?: string;

  ask: (req: AskRequest) => void;
  openPanel: () => void;
  closePanel: () => void;
  clear: () => void;
  cancel: () => void;
  apply: (msg: Record<string, unknown>) => void;
}

/** Fixed on the host too — every dk8s question streams on this id. */
const DK8S_AI_TAB = 'dk8s-ai';

export const useDk8sAiStore = create<Dk8sAiState>((set, get) => ({
  open: false,
  answers: [],

  ask: (req) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set(s => ({
      open: true,
      activeId: id,
      // Newest first: the panel is read from the top, and an answer that
      // appears below the fold reads as nothing having happened.
      answers: [{
        id,
        title: req.title,
        promptKey: req.promptKey,
        evidence: req.evidence,
        podName: req.podContext.pod as string | undefined,
        text: '',
        streaming: true,
        startedAt: Date.now(),
      }, ...s.answers].slice(0, 20),
    }));

    /*
      Recorded because the evidence leaves the machine.

      The evidence itself is not in the metadata — a heap histogram or a
      thread dump would swamp the log — but its size and kind are, so the
      record answers "what was sent, and roughly how much of it" without
      becoming a second copy of the data.
    */
    logUiEvent('dk8s.ai_ask', {
      promptKey: req.promptKey,
      title: req.title,
      evidenceKind: req.evidenceKind,
      evidenceLabel: req.evidenceLabel,
      evidenceChars: req.evidence?.length ?? 0,
      question: req.question,
      ...req.podContext,
    });

    postMsg({
      type: 'dk8s:ask',
      promptKey: req.promptKey,
      evidence: req.evidence,
      evidenceLabel: req.evidenceLabel,
      evidenceKind: req.evidenceKind,
      podContext: req.podContext,
      question: req.question,
    });
  },

  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false }),
  clear: () => set({ answers: [], activeId: undefined }),

  cancel: () => {
    postMsg({ type: 'ai:cancel', tabId: DK8S_AI_TAB });
    set(s => ({
      activeId: undefined,
      answers: s.answers.map(a => a.id === s.activeId ? { ...a, streaming: false } : a),
    }));
  },

  apply: (msg) => {
    // Every dk8s question shares one tabId, so anything on a different tab
    // belongs to the main AI chat and must not be spliced in here.
    if (msg.tabId !== DK8S_AI_TAB) return;
    const activeId = get().activeId;
    if (!activeId) return;

    const patch = (fn: (a: Dk8sAnswer) => Dk8sAnswer) =>
      set(s => ({ answers: s.answers.map(a => a.id === activeId ? fn(a) : a) }));

    switch (msg.type) {
      // What the host actually sent, which is not always what was handed to
      // `ask` — a connection snapshot is summarised on the way out.
      case 'dk8s:aiEvidence':
        patch(a => ({ ...a, evidence: String(msg.evidence ?? a.evidence) }));
        break;

      case 'ai:chunk':
        patch(a => ({ ...a, text: a.text + String(msg.delta ?? '') }));
        break;

      case 'ai:complete':
        patch(a => ({
          ...a,
          streaming: false,
          // Non-streaming providers send the whole body on complete rather than
          // as chunks; without this fallback their answers arrive empty.
          text: a.text || String((msg.message as { content?: string } | undefined)?.content ?? ''),
        }));
        set({ activeId: undefined });
        break;

      case 'ai:error':
        patch(a => ({ ...a, streaming: false, error: String(msg.message ?? 'The request failed.') }));
        set({ activeId: undefined });
        break;

      case 'ai:cancelled':
        patch(a => ({ ...a, streaming: false }));
        set({ activeId: undefined });
        break;
    }
  },
}));

/** dk8s-specific failures, which never carry a tabId. */
export function applyDk8sAiError(msg: Record<string, unknown>): void {
  const { activeId } = useDk8sAiStore.getState();
  useDk8sAiStore.setState(s => ({
    activeId: undefined,
    answers: s.answers.map(a =>
      a.id === activeId ? { ...a, streaming: false, error: String(msg.error ?? 'Failed') } : a),
  }));
}
