/**
 * AI Collection Action Cache — generic cache-first store for AI actions scoped to a
 * collection/folder (Changelog, Dependency Graph, Compliance, SDK Gen, Doc Gen,
 * Security Audit, Compare Versions, Optimize Requests, Regression Detector/Guard,
 * Agent Workflow, etc).
 *
 * Key = `${actionId}:${targetId}` (targetId is usually the collection/folder node id).
 * Cache-first: reopening the same action for the same target shows the last result
 * immediately instead of re-running the AI call. Regenerate is always an explicit,
 * user-triggered action that overwrites the cache.
 */
import { create } from 'zustand';

export interface CachedAiActionResult {
  /** Arbitrary payload shape per action (string markdown/code, parsed JSON, etc) */
  payload: unknown;
  timestamp: number;
}

interface AiCollectionCacheStore {
  byKey: Record<string, CachedAiActionResult>;
  get: (key: string) => CachedAiActionResult | undefined;
  set: (key: string, payload: unknown) => void;
  clear: (key: string) => void;
}

export const useAiCollectionCacheStore = create<AiCollectionCacheStore>((set, get) => ({
  byKey: {},

  get: (key) => get().byKey[key],

  set: (key, payload) =>
    set(s => ({ byKey: { ...s.byKey, [key]: { payload, timestamp: Date.now() } } })),

  clear: (key) =>
    set(s => {
      const next = { ...s.byKey };
      delete next[key];
      return { byKey: next };
    }),
}));
