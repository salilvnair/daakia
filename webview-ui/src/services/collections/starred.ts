/**
 * Starred requests — the four you run all day, at the top of their folder.
 *
 * ── Why not a column ──
 *
 * A star is a per-person view preference, not a property of the request: two
 * people sharing a collection through git sync should not fight over whose
 * favourites are committed. So it lives in the same UI-state prefs that hold
 * panel heights and sub-tab choices — persisted to SQLite, never exported,
 * never synced.
 *
 * ── Why ordering rather than a separate section ──
 *
 * A "Starred" list at the top duplicates rows: the same request appears twice
 * and renaming or deleting it has to be handled in both places. Floating it
 * within its own folder keeps one row per request and still puts it where the
 * eye lands first.
 */
import { useMemo } from 'react';
import { useUiStateStore } from '../../store/ui-state-store';
import type { CollectionTreeNode } from './tree-helpers';

const KEY = 'collections.starred';
/** Stars are cheap to add and easy to forget; a cap keeps the pref bounded. */
const MAX_STARRED = 200;

function parse(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    // A malformed pref is not worth a crash on the sidebar's first render.
    return [];
  }
}

/** The starred ids, live — re-renders when the pref hydrates or changes. */
export function useStarredIds(): Set<string> {
  const raw = useUiStateStore(s => s.prefs[KEY]);
  return useMemo(() => new Set(parse(raw)), [raw]);
}

export function isStarred(id: string): boolean {
  return parse(useUiStateStore.getState().prefs[KEY]).includes(id);
}

/** Star an unstarred request, or unstar a starred one. */
export function toggleStar(id: string): void {
  const current = parse(useUiStateStore.getState().prefs[KEY]);
  const next = current.includes(id)
    ? current.filter(x => x !== id)
    // Newest first, so the cap drops the oldest star rather than refusing a
    // new one — a silent "no" on a click is worse than quietly forgetting.
    : [id, ...current].slice(0, MAX_STARRED);
  useUiStateStore.getState().setPref(KEY, JSON.stringify(next));
}

/**
 * Float starred requests to the top of every folder that holds one.
 *
 * Order is otherwise untouched — this runs after whichever sort the panel is
 * in, so "Folders first, A to Z" still holds among the starred and among the
 * rest. Nothing is written back: `sort_order` in storage is unchanged, the
 * same way the alphabetical view mode leaves it alone.
 */
export function starFirst(nodes: CollectionTreeNode[], starred: Set<string>): CollectionTreeNode[] {
  if (starred.size === 0) return nodes;
  return nodes.map(node => ({
    ...node,
    children: starFirst(node.children, starred),
    requests: [
      ...node.requests.filter(r => starred.has(r.id)),
      ...node.requests.filter(r => !starred.has(r.id)),
    ],
  }));
}
