/**
 * The catalogue: which loggers exist, what each can say, and which ones a
 * tester is watching for.
 *
 * ── What it is for ──
 *
 * A tester opening a pod's log can see what the application HAS said. They
 * cannot see what it CAN say — which loggers exist, which ones have never
 * fired, which line means the retry path was taken. That knowledge lives in
 * source they were not given, and the usual substitute is asking a developer
 * over chat. The catalogue is that answer written down once and kept.
 *
 * ── Where it is kept ──
 *
 * In `prefs`, the way starred workloads are: the host already debounces prefs
 * into SQLite and hydrates them on load, and a second persistence mechanism is
 * a second thing to keep working. Reading through `prefs` rather than into a
 * copy means hydration is not a case this file has to handle.
 *
 * ── Scoped by workload, not by pod ──
 *
 * A pattern belongs to the application, and pod names change on every rollout.
 * A catalogue keyed on a pod would be empty the morning after it was written —
 * the same reasoning that puts a star on a workload rather than a pod.
 */
import { useMemo } from 'react';
import { useUiStateStore } from './ui-state-store';
import { logUiEvent } from './ui-audit-store';
import type { LoggerPattern } from '../components/k8s/logger-pattern';

const PREF = 'dk8s.loggers';

/** How many marks there are, and therefore how many highlight colours. */
export const MARK_COLORS = [
  'var(--color-dk8s)',
  'var(--color-warning)',
  'var(--color-protocol-ai, #a78bfa)',
  'var(--color-success)',
  'var(--color-info, #3b82f6)',
] as const;

export interface CataloguePattern extends LoggerPattern {
  id: string;
  /** Workload this belongs to: `context/namespace/Kind/name`, or `*` for all. */
  scope: string;
  /** Marked patterns are highlighted in the Logs tab. */
  marked?: boolean;
  /** Which highlight colour, when marked. Index into `MARK_COLORS`. */
  color?: number;
  /** When it was added, so the newest is findable. */
  added: number;
  /**
   * How this pattern summarises a window, when it has been told to.
   *
   * A pattern with one of these is what the Summary panel calls a determinant:
   * the same pattern, counted and grouped rather than highlighted. Absent is
   * the normal case — most patterns are marks, not questions about a window.
   */
  summary?: import('../components/k8s/determinants').SummarySpec;
}

export interface Catalogue {
  patterns: CataloguePattern[];
}

const EMPTY: Catalogue = { patterns: [] };

export function parseCatalogue(raw: string | undefined): Catalogue {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw) as Catalogue;
    if (!v || !Array.isArray(v.patterns)) return EMPTY;
    /* Anything half-written under this key is somebody's catalogue in a state
       nobody can use. An empty one is a better answer than a crash on load,
       and the next write replaces it. */
    return { patterns: v.patterns.filter(isPattern) };
  } catch {
    return EMPTY;
  }
}

function isPattern(p: unknown): p is CataloguePattern {
  const c = p as CataloguePattern;
  return !!c && typeof c.id === 'string' && typeof c.template === 'string'
    && Array.isArray(c.holes) && typeof c.scope === 'string';
}

function write(next: Catalogue): void {
  useUiStateStore.getState().setPref(PREF, JSON.stringify(next));
}

function read(): Catalogue {
  return parseCatalogue(useUiStateStore.getState().prefs[PREF]);
}

/** The whole catalogue, rebuilt only when the stored string changes. */
export function useCatalogue(): Catalogue {
  const raw = useUiStateStore(s => s.prefs[PREF]);
  return useMemo(() => parseCatalogue(raw), [raw]);
}

/**
 * The patterns that apply to one workload.
 *
 * `*` means every workload: a pattern for a library everyone runs — Hikari's
 * pool line, Spring's startup banner — is the same pattern on every pod, and
 * making somebody add it per workload is how a catalogue stops being kept.
 */
export function patternsFor(catalogue: Catalogue, scope: string): CataloguePattern[] {
  return catalogue.patterns
    .filter(p => p.scope === scope || p.scope === '*')
    .sort((a, b) => b.added - a.added);
}

export function usePatternsFor(scope: string): CataloguePattern[] {
  const catalogue = useCatalogue();
  return useMemo(() => patternsFor(catalogue, scope), [catalogue, scope]);
}

/** Marked patterns only — what the Logs tab highlights. */
export function markedIn(patterns: CataloguePattern[]): CataloguePattern[] {
  return patterns.filter(p => p.marked);
}

export function addPattern(pattern: LoggerPattern, scope: string): CataloguePattern {
  const catalogue = read();
  const entry: CataloguePattern = {
    ...pattern,
    id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    scope,
    added: Date.now(),
  };
  /*
    The same template twice is the same pattern. People paste a call they
    already have — from a second copy of the source, or after scanning a repo
    that contains a logger they added by hand — and a catalogue that answers
    with a duplicate row is a catalogue that grows until nobody reads it.
  */
  const existing = catalogue.patterns.find(p => p.template === entry.template && p.scope === scope);
  if (existing) return existing;

  logUiEvent('dk8s.pattern_add', { source: pattern.source, holes: pattern.holes.length });
  write({ patterns: [...catalogue.patterns, entry] });
  return entry;
}

export function addPatterns(patterns: LoggerPattern[], scope: string): number {
  let added = 0;
  for (const p of patterns) {
    const before = read().patterns.length;
    addPattern(p, scope);
    if (read().patterns.length > before) added++;
  }
  return added;
}

export function removePattern(id: string): void {
  const catalogue = read();
  write({ patterns: catalogue.patterns.filter(p => p.id !== id) });
}

/**
 * Mark or unmark, and give a mark a colour nothing else in scope is using.
 *
 * Colours are assigned rather than chosen: the reader marked a pattern to find
 * it, not to decide what shade it is, and two marks in the same colour are the
 * one thing that makes a highlighted log unreadable.
 */
export function toggleMark(id: string): void {
  const catalogue = read();
  const patterns = catalogue.patterns.map(p => {
    if (p.id !== id) return p;
    if (p.marked) return { ...p, marked: false, color: undefined };
    const taken = new Set(catalogue.patterns.filter(o => o.marked && o.scope === p.scope)
      .map(o => o.color ?? 0));
    let color = 0;
    while (taken.has(color) && color < MARK_COLORS.length - 1) color++;
    return { ...p, marked: true, color };
  });
  write({ patterns });
}

/** Give a pattern a summary, or take it away with `undefined`. */
export function setSummary(
  id: string, summary: import('../components/k8s/determinants').SummarySpec | undefined,
): void {
  const catalogue = read();
  write({
    patterns: catalogue.patterns.map(p => (p.id === id ? { ...p, summary } : p)),
  });
}

/**
 * Change a pattern in place — its scope, or the pattern itself.
 *
 * What Settings → Determinants' Edit does: the question keeps its id, so the
 * mark it may also be and the windows that have it ticked are still pointing
 * at it afterwards. The id and the date it was added are not patchable.
 */
export function updatePattern(
  id: string, patch: Partial<Omit<CataloguePattern, 'id' | 'added'>>,
): void {
  const catalogue = read();
  write({
    patterns: catalogue.patterns.map(p => (p.id === id ? { ...p, ...patch, id: p.id, added: p.added } : p)),
  });
}

export function clearMarks(scope: string): void {
  const catalogue = read();
  write({
    patterns: catalogue.patterns.map(p =>
      (p.scope === scope || p.scope === '*') ? { ...p, marked: false, color: undefined } : p),
  });
}
