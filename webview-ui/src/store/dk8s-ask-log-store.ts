/**
 * Ask the log — the questions asked, and the answers streaming back.
 *
 * A store rather than component state, for the same reason the side panel's
 * AI has one: an answer takes seconds, and a tester who flips to the Logs tab
 * to look at a line while it arrives must come back to the answer, not to an
 * empty box and a stream that landed nowhere.
 *
 * It listens on its own stream id (`dk8s-ask-log`, fixed on the host), so the
 * side panel's questions and these never splice into each other.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { logUiEvent } from './ui-audit-store';
import type { LogLine } from './k8s-store';
import { parseAnswer, type AskAnswer, type Evidence } from '../components/k8s/ask-log';

/** Fixed on the host too — see `DK8S_ASK_LOG_TAB` in loggers-handler.ts. */
export const ASK_LOG_TAB = 'dk8s-ask-log';

export interface AskRun {
  id: string;
  question: string;
  /** What was read, as the question put it — "last 100 lines", "since 09:30". */
  window: string;
  from?: number;
  to?: number;
  pod?: string;
  scope: string;
  /** What was numbered and sent — the only lines a citation can name. */
  numbered: Map<number, LogLine>;
  total: number;
  sent: number;
  loggersTouched: string[];
  loggersKnown: number;
  startedAt: number;
  finishedAt?: number;
  text: string;
  streaming: boolean;
  error?: string;
  redactionNote?: string;
  answer?: AskAnswer;
  verdict?: 'right' | 'wrong';
}

export interface AskRequest {
  question: string;
  window: string;
  from?: number;
  to?: number;
  scope: string;
  evidence: Evidence;
  windowBlock: string;
  catalogue: string;
  loggersKnown: number;
  podContext: Record<string, unknown>;
}

interface AskLogState {
  runs: AskRun[];
  activeId?: string;
  ask: (req: AskRequest) => void;
  cancel: () => void;
  setVerdict: (id: string, verdict: 'right' | 'wrong') => void;
  apply: (msg: Record<string, unknown>) => void;
}

export const useDk8sAskLogStore = create<AskLogState>((set, get) => ({
  runs: [],

  ask: (req) => {
    if (get().activeId) get().cancel();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const run: AskRun = {
      id, question: req.question, window: req.window, from: req.from, to: req.to,
      pod: req.podContext.pod as string | undefined, scope: req.scope,
      numbered: req.evidence.numbered, total: req.evidence.total, sent: req.evidence.sent,
      loggersTouched: req.evidence.loggers, loggersKnown: req.loggersKnown,
      startedAt: Date.now(), text: '', streaming: true,
    };
    set(s => ({ activeId: id, runs: [run, ...s.runs].slice(0, 10) }));

    /* Recorded because the lines leave the machine — their count and the
       window, not the lines themselves. */
    logUiEvent('dk8s.ask_log', {
      question: req.question, window: req.window, lines: req.evidence.total, sent: req.evidence.sent,
      chars: req.evidence.text.length, ...req.podContext,
    });

    postMsg({
      type: 'dk8s:askLog',
      question: req.question,
      evidence: req.evidence.text,
      window: req.windowBlock,
      catalogue: req.catalogue,
      podContext: req.podContext,
    });
  },

  cancel: () => {
    postMsg({ type: 'ai:cancel', tabId: ASK_LOG_TAB });
    set(s => ({
      activeId: undefined,
      runs: s.runs.map(r => (r.id === s.activeId ? { ...r, streaming: false, finishedAt: Date.now() } : r)),
    }));
  },

  setVerdict: (id, verdict) => {
    const run = get().runs.find(r => r.id === id);
    set(s => ({ runs: s.runs.map(r => (r.id === id ? { ...r, verdict } : r)) }));
    logUiEvent('dk8s.ask_log_verdict', { verdict, question: run?.question, window: run?.window });
  },

  apply: (msg) => {
    if (msg.tabId !== ASK_LOG_TAB) return;
    const activeId = get().activeId;
    if (!activeId) return;
    const patch = (fn: (r: AskRun) => AskRun) =>
      set(s => ({ runs: s.runs.map(r => (r.id === activeId ? fn(r) : r)) }));

    switch (msg.type) {
      case 'dk8s:askLogEvidence':
        patch(r => ({ ...r, redactionNote: msg.redactionNote as string | undefined }));
        break;
      case 'ai:chunk':
        patch(r => ({ ...r, text: r.text + String(msg.delta ?? '') }));
        break;
      case 'ai:complete':
        patch(r => {
          /* Non-streaming providers send the whole body on complete. */
          const text = r.text || String((msg.message as { content?: string } | undefined)?.content ?? '');
          return { ...r, text, streaming: false, finishedAt: Date.now(), answer: parseAnswer(text, r.numbered) };
        });
        set({ activeId: undefined });
        break;
      case 'ai:error':
      case 'dk8s:askLogError':
        patch(r => ({ ...r, streaming: false, finishedAt: Date.now(), error: String(msg.message ?? msg.error ?? 'The request failed.') }));
        set({ activeId: undefined });
        break;
      case 'ai:cancelled':
        patch(r => ({ ...r, streaming: false, finishedAt: Date.now() }));
        set({ activeId: undefined });
        break;
    }
  },
}));
