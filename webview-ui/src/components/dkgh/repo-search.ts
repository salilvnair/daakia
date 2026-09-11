/**
 * Searching your repositories, without leaving the screen you are on.
 *
 * ── The flicker this exists to remove ──
 *
 * The picker used to call `onSearch()` from its `onChange`, on the **second
 * character typed**. That swapped the whole panel for a different screen —
 * which unmounts the input you are typing in, mounts a second one somewhere
 * else and moves focus to it, mid-word. Every search began with a jump.
 *
 * The listing itself was never the problem: it is debounced and, since the
 * per-owner cache, answers in well under a second. What was wrong was that
 * seeing any result at all cost a navigation.
 *
 * So the search lives here, both screens use it, and the picker shows its
 * results in place. The full screen is still there — it has the owner facets,
 * the archived toggle and the command disclosure — but it is reached by
 * pressing "See all", which is a decision somebody makes rather than something
 * that happens to them on the second keystroke.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { postMsg } from '../../vscode';
import type { RepoSummary } from './types';

/** Below this the search is not run: one letter matches everything. */
export const MIN_QUERY = 2;

/**
 * How long a pause counts as "stopped typing".
 *
 * Each search is a repository listing plus a pair of counts per row, so firing
 * one per character would spend a hundred API calls answering a word nobody
 * has finished typing.
 */
export const DEBOUNCE_MS = 400;

export interface RepoSearch {
  /** `null` until a search has run — which is not the same as "no matches". */
  results: RepoSummary[] | null;
  searching: boolean;
  error: string;
  /** How many the host matched before any cap, for "showing 10 of 34". */
  matched: number;
  /** The exact `gh` calls it made, for the disclosure. */
  commands: string[];
  /** The owners actually present in the results, most rows first. */
  owners: [string, number][];
}

export function useRepoSearch(query: string, archived = false): RepoSearch {
  const [results, setResults] = useState<RepoSummary[] | null>(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [commands, setCommands] = useState<string[]>([]);
  const [matched, setMatched] = useState(0);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'dkgh:searchRepos:loading') { setSearching(true); return; }
      if (msg.type !== 'dkgh:searchRepos:result') return;
      setSearching(false);
      setResults((msg.repos as RepoSummary[]) ?? []);
      setError((msg.error as string) ?? '');
      setCommands((msg.commands as string[]) ?? []);
      setMatched((msg.matched as number) ?? 0);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const q = query.trim();
    if (timer.current) window.clearTimeout(timer.current);
    if (q.length < MIN_QUERY) { setResults(null); setError(''); setSearching(false); return; }
    timer.current = window.setTimeout(
      () => postMsg({ type: 'dkgh:searchRepos', query: q, includeArchived: archived }),
      DEBOUNCE_MS,
    );
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [query, archived]);

  /*
    The org facets are the owners actually in the results, not a directory of
    every organisation the account belongs to.

    Reading the membership list is another call, and it would offer facets that
    filter to nothing — an org you belong to with no repository matching the
    term is a chip that empties the table. The owners present are exactly the
    ones that can narrow it.
  */
  const owners = useMemo<[string, number][]>(() => {
    const seen = new Map<string, number>();
    for (const r of results ?? []) {
      const o = r.nameWithOwner.split('/')[0];
      seen.set(o, (seen.get(o) ?? 0) + 1);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [results]);

  return { results, searching, error, matched, commands, owners };
}

/**
 * What the picker shows inline, and whether there is more behind it.
 *
 * A handful, because this list sits under a search box on a screen that also
 * has Pinned and Recent below it — a full listing there would push everything
 * else off the screen, which is the problem the separate screen was invented
 * to solve and not one worth recreating.
 */
export const INLINE_LIMIT = 6;

export function inlineSlice<T>(rows: T[] | null, limit = INLINE_LIMIT): {
  shown: T[];
  more: number;
} {
  const all = rows ?? [];
  return { shown: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}
