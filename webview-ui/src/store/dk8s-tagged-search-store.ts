/**
 * Searches that are not the dialog's.
 *
 * Follow re-reads the pods for one value around one instant; a Window reads
 * every line in forty minutes. Both are searches — the same host machinery,
 * the same per-pod parsing — but neither may replace the search the reader
 * came from. So each runs under a tag, the host echoes the tag on every
 * message it sends back, and this store keeps each tag's result apart. The
 * dialog's store ignores tagged messages; this one ignores untagged ones.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import type { PodGroup, PodSearchResult, SearchMatch } from './dk8s-search-store';

export interface TaggedTarget {
  context: string;
  namespace: string;
  pod: string;
  containers?: string[];
  workload?: string;
}

export interface TaggedSearch {
  running: boolean;
  /** Every pod that answered, hits or not — "0 on this pod" is part of the answer here. */
  groups: PodGroup[];
  progress: { done: number; total: number };
  summary?: { matched: number; scanned: number; stopped: boolean };
  /** When it was asked, so an answer can be told from the one before it. */
  startedAt: number;
}

export interface TaggedOptions {
  query: string;
  regex?: boolean;
  caseSensitive?: boolean;
  contextLines?: number;
  fromMs?: number;
  toMs?: number;
  everyLine?: boolean;
  maxMatchesPerPod?: number;
  maxMatchesTotal?: number;
  tailLines?: number;
}

interface State {
  byTag: Record<string, TaggedSearch>;
  run: (tag: string, targets: TaggedTarget[], options: TaggedOptions, opts?: { archive?: boolean }) => void;
  cancel: (tag: string) => void;
  drop: (tag: string) => void;
  apply: (msg: Record<string, unknown>) => void;
}

export const useTaggedSearchStore = create<State>((set, get) => {
  const patch = (tag: string, fn: (s: TaggedSearch) => Partial<TaggedSearch>) => set(st => {
    const cur = st.byTag[tag];
    if (!cur) return st;
    return { byTag: { ...st.byTag, [tag]: { ...cur, ...fn(cur) } } };
  });

  return {
    byTag: {},

    run: (tag, targets, options, opts = {}) => {
      set(st => ({
        byTag: {
          ...st.byTag,
          [tag]: { running: true, groups: [], progress: { done: 0, total: targets.length }, startedAt: Date.now() },
        },
      }));
      postMsg({
        type: 'dk8s:searchLogs', tag, targets,
        archive: opts.archive ?? false,
        options: {
          regex: false, caseSensitive: false, contextLines: 0,
          /* No tail: a window is bounded by its times, and a tail would cut
             off its start on a busy pod. */
          tailLines: -1, includePrevious: false,
          maxMatchesPerPod: 5000, maxMatchesTotal: 20000,
          ...options,
        },
      });
    },

    cancel: (tag) => {
      postMsg({ type: 'dk8s:cancelSearch', tag });
      patch(tag, () => ({ running: false }));
    },

    drop: (tag) => {
      if (get().byTag[tag]?.running) postMsg({ type: 'dk8s:cancelSearch', tag });
      set(st => {
        const { [tag]: _gone, ...rest } = st.byTag;
        return { byTag: rest };
      });
    },

    apply: (msg) => {
      const tag = msg.tag as string | undefined;
      if (!tag || !get().byTag[tag]) return;
      switch (msg.type) {
        case 'dk8s:searchProgress':
          patch(tag, () => ({ progress: { done: msg.done as number, total: msg.total as number } }));
          break;
        case 'dk8s:searchPod':
        case 'dk8s:searchArchivePod': {
          const result = msg.result as PodSearchResult;
          const matches = (msg.matches as SearchMatch[]) ?? [];
          const source = msg.type === 'dk8s:searchArchivePod' ? 'archive' as const : 'live' as const;
          patch(tag, s => ({ groups: [...s.groups, { result, matches, source }] }));
          break;
        }
        case 'dk8s:searchDone':
          patch(tag, () => ({
            running: false,
            summary: { matched: msg.matched as number, scanned: msg.scanned as number, stopped: !!msg.stopped },
          }));
          break;
        case 'dk8s:searchCancelled':
          patch(tag, () => ({ running: false }));
          break;
      }
    },
  };
});

/* Registered once, at import: a Follow or a Window may be open in a tab with no dk8s panel mounted. */
if (typeof window !== 'undefined') {
  window.addEventListener('message', (evt: MessageEvent) => {
    const msg = evt.data as Record<string, unknown> | undefined;
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
    if (msg.tag && msg.type.startsWith('dk8s:search')) useTaggedSearchStore.getState().apply(msg);
  });
}
