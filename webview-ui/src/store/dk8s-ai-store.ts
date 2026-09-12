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

/**
 * One follow-up on an answer.
 *
 * Kept on the answer rather than in a flat list because a follow-up is only
 * meaningful beside the evidence that started the thread — "and the restarts?"
 * is a different question against a heap histogram than against a log, and a
 * panel of loose questions could not tell you which one it meant.
 */
export interface Dk8sTurn {
  question: string;
  text: string;
  streaming: boolean;
  error?: string;
}

export interface Dk8sAnswer {
  id: string;
  title: string;
  promptKey: string;
  /** The evidence sent, so the answer can be read against what produced it. */
  evidence: string;
  /**
   * What the host stripped out on the way, when it stripped anything.
   *
   * Present only when something was removed, so its absence is not a claim
   * that the log was clean — it is the absence of a claim.
   */
  redactionNote?: string;
  podName?: string;
  text: string;
  streaming: boolean;
  error?: string;
  startedAt: number;
  /** Follow-up questions on this thread, oldest first. */
  turns: Dk8sTurn[];
}

interface Dk8sAiState {
  open: boolean;
  answers: Dk8sAnswer[];
  /** The answer currently being streamed, if any. */
  activeId?: string;
  /**
   * Which turn of it the stream belongs to.
   *
   * Absent means the answer's own body. Present means a follow-up, and the
   * chunks go there instead — without this a follow-up appended itself to the
   * first answer, which is the same bug as a reply overwriting the message it
   * was replying to.
   */
  activeTurn?: number;

  ask: (req: AskRequest) => void;
  /** Ask again on an existing thread, carrying what was already said. */
  followUp: (answerId: string, question: string, historyTurns: number) => void;
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
        turns: [],
      }, ...s.answers].slice(0, 20),
      activeTurn: undefined,
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

  /**
   * A follow-up on a thread that already has an answer.
   *
   * The evidence is NOT re-sent — the host has it, and a heap histogram or a
   * two-hundred-line log would double the cost of every turn to say something
   * the model was already told. What goes instead is the conversation: the
   * last few question/answer pairs, capped by the setting, so a question that
   * only makes sense as a reply has something to be a reply to.
   */
  followUp: (answerId, question, historyTurns) => {
    const answer = get().answers.find(a => a.id === answerId);
    if (!answer || !question.trim()) return;

    const turnIndex = answer.turns.length;
    set(s => ({
      open: true,
      activeId: answerId,
      activeTurn: turnIndex,
      answers: s.answers.map(a => a.id === answerId
        ? { ...a, turns: [...a.turns, { question, text: '', streaming: true }] }
        : a),
    }));

    /*
      Oldest first, and the opening answer counts as the first pair.

      Trimmed from the FRONT, so what survives is the most recent exchange
      rather than the beginning of a conversation that has moved on. The
      opening answer is kept as the first pair regardless of the cap, because
      it is the one that names the evidence — drop it and the model is reading
      replies to a question nobody restated.
    */
    const prior = [
      { q: answer.title, a: answer.text },
      ...answer.turns.map(t => ({ q: t.question, a: t.text })),
    ].filter(p => p.a);
    const history = prior.length > historyTurns
      ? [prior[0], ...prior.slice(-(historyTurns - 1))]
      : prior;

    logUiEvent('dk8s.ai_followup', {
      promptKey: answer.promptKey,
      title: answer.title,
      question,
      historyPairs: history.length,
      pod: answer.podName,
    });

    postMsg({
      type: 'dk8s:ask',
      promptKey: answer.promptKey,
      // The evidence line the host echoes back is per-request, so it is sent
      // again as a label only; the body stays where it was.
      evidence: '',
      evidenceLabel: 'FOLLOW-UP',
      podContext: { pod: answer.podName },
      question,
      history,
    });
  },

  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false }),
  clear: () => set({ answers: [], activeId: undefined }),

  cancel: () => {
    postMsg({ type: 'ai:cancel', tabId: DK8S_AI_TAB });
    set(s => ({
      activeId: undefined,
      activeTurn: undefined,
      answers: s.answers.map(a => a.id === s.activeId
        ? (s.activeTurn === undefined
          ? { ...a, streaming: false }
          : { ...a, turns: a.turns.map((t, i) => i === s.activeTurn ? { ...t, streaming: false } : t) })
        : a),
    }));
  },

  apply: (msg) => {
    // Every dk8s question shares one tabId, so anything on a different tab
    // belongs to the main AI chat and must not be spliced in here.
    if (msg.tabId !== DK8S_AI_TAB) return;
    const activeId = get().activeId;
    if (!activeId) return;

    const turn = get().activeTurn;
    /*
      One patcher, two destinations.

      A follow-up's chunks belong to its own turn; the answer's belong to the
      answer. Routing that here rather than at each call site is what keeps
      `ai:chunk` from having to know which kind of thing it is appending to.
    */
    const patch = (fn: (a: Dk8sAnswer) => Dk8sAnswer) =>
      set(s => ({ answers: s.answers.map(a => a.id === activeId ? fn(a) : a) }));

    const patchTarget = (fn: (t: { text: string; streaming: boolean; error?: string }) =>
      { text: string; streaming: boolean; error?: string }) => patch(a => {
      if (turn === undefined) {
        const next = fn({ text: a.text, streaming: a.streaming, error: a.error });
        return { ...a, ...next };
      }
      return {
        ...a,
        turns: a.turns.map((t, i) => i === turn ? { ...t, ...fn(t) } : t),
      };
    });

    switch (msg.type) {
      // What the host actually sent, which is not always what was handed to
      // `ask` — a connection snapshot is summarised on the way out.
      case 'dk8s:aiEvidence':
        patch(a => ({
          ...a,
          evidence: String(msg.evidence ?? a.evidence),
          // What the host removed on the way out, so "show what was sent" is
          // literally true and the person can see the difference.
          redactionNote: msg.redactionNote as string | undefined,
        }));
        break;

      case 'ai:chunk':
        patchTarget(t => ({ ...t, text: t.text + String(msg.delta ?? '') }));
        break;

      case 'ai:complete':
        patchTarget(t => ({
          ...t,
          streaming: false,
          // Non-streaming providers send the whole body on complete rather than
          // as chunks; without this fallback their answers arrive empty.
          text: t.text || String((msg.message as { content?: string } | undefined)?.content ?? ''),
        }));
        set({ activeId: undefined, activeTurn: undefined });
        break;

      case 'ai:error':
        patchTarget(t => ({ ...t, streaming: false, error: String(msg.message ?? 'The request failed.') }));
        set({ activeId: undefined, activeTurn: undefined });
        break;

      case 'ai:cancelled':
        patchTarget(t => ({ ...t, streaming: false }));
        set({ activeId: undefined, activeTurn: undefined });
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
