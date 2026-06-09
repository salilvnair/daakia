/**
 * AI Response Actions Store — per-tab persistence for AI response panel actions.
 *
 * Tracks draft input + generated result for each AI action so the user doesn't have
 * to retype when switching tabs. Cache-first: result is shown immediately on reopen;
 * explicit refresh is needed to re-generate.
 */
import { create } from 'zustand';

// ── Per-action state shapes ───────────────────────────────────────────────────

export interface AssertActionState {
  /** The plain-English assertion the user typed */
  input: string;
  /** The generated dk.* script code */
  result: string;
}

export interface SemanticActionState {
  /** The markdown validation result returned by AI */
  result: string;
}

export interface TransformActionState {
  /** The transformation instruction the user typed or picked from preset */
  instruction: string;
  /** The transformed response body returned by AI */
  result: string;
}

// ── Per-tab container ─────────────────────────────────────────────────────────

export interface TabAiResponseActions {
  assert?: AssertActionState;
  semantic?: SemanticActionState;
  transform?: TransformActionState;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface AiResponseActionsStore {
  byTab: Record<string, TabAiResponseActions>;

  /** Get all cached AI action state for a tab (returns empty object if none) */
  getTabActions: (tabId: string) => TabAiResponseActions;

  /** Patch assert state for a tab (merges, not replaces) */
  updateAssert: (tabId: string, patch: Partial<AssertActionState>) => void;

  /** Patch semantic state for a tab */
  updateSemantic: (tabId: string, patch: Partial<SemanticActionState>) => void;

  /** Patch transform state for a tab */
  updateTransform: (tabId: string, patch: Partial<TransformActionState>) => void;

  /** Clear all AI action state for a tab (e.g. after tab closes) */
  clearTabActions: (tabId: string) => void;
}

export const useAiResponseActionsStore = create<AiResponseActionsStore>((set, get) => ({
  byTab: {},

  getTabActions: (tabId) => get().byTab[tabId] ?? {},

  updateAssert: (tabId, patch) =>
    set(s => ({
      byTab: {
        ...s.byTab,
        [tabId]: {
          ...s.byTab[tabId],
          assert: {
            input: '',
            result: '',
            ...s.byTab[tabId]?.assert,
            ...patch,
          },
        },
      },
    })),

  updateSemantic: (tabId, patch) =>
    set(s => ({
      byTab: {
        ...s.byTab,
        [tabId]: {
          ...s.byTab[tabId],
          semantic: {
            result: '',
            ...s.byTab[tabId]?.semantic,
            ...patch,
          },
        },
      },
    })),

  updateTransform: (tabId, patch) =>
    set(s => ({
      byTab: {
        ...s.byTab,
        [tabId]: {
          ...s.byTab[tabId],
          transform: {
            instruction: '',
            result: '',
            ...s.byTab[tabId]?.transform,
            ...patch,
          },
        },
      },
    })),

  clearTabActions: (tabId) =>
    set(s => {
      const next = { ...s.byTab };
      delete next[tabId];
      return { byTab: next };
    }),
}));
