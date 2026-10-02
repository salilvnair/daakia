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
 * Marks are kept here too, and so they are yours rather than the workspace's:
 * a mark is what one person is looking for in one run, and somebody else's
 * three highlighted patterns on your log would be noise you did not ask for.
 * The loggers and patterns are the shareable part, and Export catalogue is
 * how they travel.
 *
 * ── Scoped by workload, not by pod ──
 *
 * A pattern belongs to the application, and pod names change on every rollout.
 * A catalogue keyed on a pod would be empty the morning after it was written —
 * the same reasoning that puts a star on a workload rather than a pod.
 *
 * ── Every write is one write ──
 *
 * A project read offers four hundred loggers and a scan four hundred
 * patterns. Writing them one at a time parsed and re-serialised the whole
 * catalogue four hundred times and sent the host four hundred prefs; `update`
 * reads once, changes everything, and writes once.
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

/**
 * Where a logger was learned from — the "WHERE FROM" rail.
 *
 *   config   a logback file or an application-<profile>.yaml in a project
 *   code     a class with a logger in it, found in a project's source
 *   pod      the pod's own logback file, or its Actuator
 *   hand     pasted as a list, or typed one at a time
 *
 * "Seen in logs" is not stored: it is whatever the buffer says today, and a
 * stored copy of it would be a claim about a log nobody is looking at.
 */
export type LoggerSource = 'config' | 'code' | 'pod' | 'hand';

export interface CatalogueLogger {
  id: string;
  /** As the log writes it: `com.acme.orders.OrderService`, `workers.settlement`. */
  name: string;
  /** Upper-cased, as configured. Absent when nothing said. */
  level?: string;
  source: LoggerSource;
  /** The file or endpoint it was read from, shown under WHERE IT CAME FROM. */
  origin?: string;
  scope: string;
  added: number;
}

/**
 * A question somebody asked the log and wanted to ask again — "Save as a
 * check". The window is kept as its length, not its clock times: a check is
 * "what went wrong in the last ten minutes", asked on a later day.
 */
export interface SavedCheck {
  id: string;
  scope: string;
  question: string;
  window: string;
  added: number;
}

/**
 * A project folder the catalogue was read from, so "Rescan when the project
 * changes" has something to rescan and the same choices to rescan it with.
 */
export interface ProjectLink {
  scope: string;
  folder: string;
  fingerprint: string;
  rescan: boolean;
  profile: string;
  skipLibrary: boolean;
  patterns: boolean;
}

export interface Catalogue {
  patterns: CataloguePattern[];
  loggers: CatalogueLogger[];
  checks: SavedCheck[];
  projects: ProjectLink[];
}

const EMPTY: Catalogue = { patterns: [], loggers: [], checks: [], projects: [] };

export function parseCatalogue(raw: string | undefined): Catalogue {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw) as Partial<Catalogue>;
    if (!v || !Array.isArray(v.patterns)) return EMPTY;
    /* Anything half-written under this key is somebody's catalogue in a state
       nobody can use. An empty one is a better answer than a crash on load,
       and the next write replaces it. The three newer lists are optional:
       a catalogue written before loggers existed is still a catalogue. */
    return {
      patterns: v.patterns.filter(isPattern),
      loggers: Array.isArray(v.loggers) ? v.loggers.filter(isLogger) : [],
      checks: Array.isArray(v.checks) ? v.checks.filter(c => !!c && typeof c.question === 'string') : [],
      projects: Array.isArray(v.projects) ? v.projects.filter(p => !!p && typeof p.folder === 'string') : [],
    };
  } catch {
    return EMPTY;
  }
}

function isPattern(p: unknown): p is CataloguePattern {
  const c = p as CataloguePattern;
  return !!c && typeof c.id === 'string' && typeof c.template === 'string'
    && Array.isArray(c.holes) && typeof c.scope === 'string';
}

function isLogger(l: unknown): l is CatalogueLogger {
  const c = l as CatalogueLogger;
  return !!c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.scope === 'string';
}

function write(next: Catalogue): void {
  useUiStateStore.getState().setPref(PREF, JSON.stringify(next));
}

function read(): Catalogue {
  return parseCatalogue(useUiStateStore.getState().prefs[PREF]);
}

/** Read once, change, write once. */
function update(fn: (c: Catalogue) => Catalogue): void {
  write(fn(read()));
}

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** The whole catalogue, rebuilt only when the stored string changes. */
export function useCatalogue(): Catalogue {
  const raw = useUiStateStore(s => s.prefs[PREF]);
  return useMemo(() => parseCatalogue(raw), [raw]);
}

const inScope = (itemScope: string, scope: string) => itemScope === scope || itemScope === '*';

/**
 * The patterns that apply to one workload.
 *
 * `*` means every workload: a pattern for a library everyone runs — Hikari's
 * pool line, Spring's startup banner — is the same pattern on every pod, and
 * making somebody add it per workload is how a catalogue stops being kept.
 */
export function patternsFor(catalogue: Pick<Catalogue, 'patterns'>, scope: string): CataloguePattern[] {
  return catalogue.patterns
    .filter(p => inScope(p.scope, scope))
    .sort((a, b) => b.added - a.added);
}

export function usePatternsFor(scope: string): CataloguePattern[] {
  const catalogue = useCatalogue();
  return useMemo(() => patternsFor(catalogue, scope), [catalogue, scope]);
}

export function loggersFor(catalogue: Catalogue, scope: string): CatalogueLogger[] {
  return catalogue.loggers.filter(l => inScope(l.scope, scope));
}

export function useLoggersFor(scope: string): CatalogueLogger[] {
  const catalogue = useCatalogue();
  return useMemo(() => loggersFor(catalogue, scope), [catalogue, scope]);
}

export function useChecksFor(scope: string): SavedCheck[] {
  const catalogue = useCatalogue();
  return useMemo(() => catalogue.checks.filter(c => inScope(c.scope, scope)), [catalogue, scope]);
}

export function projectFor(catalogue: Catalogue, scope: string): ProjectLink | undefined {
  return catalogue.projects.find(p => p.scope === scope);
}

/** Marked patterns only — what the Logs tab highlights. */
export function markedIn(patterns: CataloguePattern[]): CataloguePattern[] {
  return patterns.filter(p => p.marked);
}

/**
 * The same template twice is the same pattern. People paste a call they
 * already have — from a second copy of the source, or after scanning a repo
 * that contains a logger they added by hand — and a catalogue that answers
 * with a duplicate row is a catalogue that grows until nobody reads it.
 */
function withPatterns(c: Catalogue, patterns: LoggerPattern[], scope: string, mark: boolean): {
  next: Catalogue; added: CataloguePattern[];
} {
  const list = [...c.patterns];
  const added: CataloguePattern[] = [];
  for (const pattern of patterns) {
    if (list.some(p => p.template === pattern.template && p.scope === scope)) continue;
    const entry: CataloguePattern = { ...pattern, id: newId('p'), scope, added: Date.now() };
    list.push(entry);
    added.push(entry);
  }
  let next = { ...c, patterns: list };
  if (mark) for (const a of added) next = marking(next, a.id, true);
  return { next, added };
}

export function addPattern(pattern: LoggerPattern, scope: string): CataloguePattern {
  const c = read();
  const existing = c.patterns.find(p => p.template === pattern.template && p.scope === scope);
  if (existing) return existing;
  const { next, added } = withPatterns(c, [pattern], scope, false);
  logUiEvent('dk8s.pattern_add', { source: pattern.source, holes: pattern.holes.length });
  write(next);
  return added[0];
}

/** Many at once, in one write. `mark` marks every one that was new. */
export function addPatterns(patterns: LoggerPattern[], scope: string, mark = false): number {
  const { next, added } = withPatterns(read(), patterns, scope, mark);
  if (added.length) {
    logUiEvent('dk8s.pattern_add', { source: patterns[0]?.source, count: added.length, marked: mark });
    write(next);
  }
  return added.length;
}

export function removePattern(id: string): void {
  update(c => ({ ...c, patterns: c.patterns.filter(p => p.id !== id) }));
}

export interface NewLogger {
  name: string;
  level?: string;
  source: LoggerSource;
  origin?: string;
}

/**
 * Add loggers, and say how many were new.
 *
 * A logger already in the catalogue is left as it is — except that a level
 * the new source knows and the old one did not is taken, because "INFO" is
 * strictly more than nothing and nobody chose the nothing.
 */
export function addLoggers(entries: NewLogger[], scope: string): { added: number; existing: number } {
  let added = 0;
  let existing = 0;
  update(c => {
    const list = [...c.loggers];
    for (const e of entries) {
      const name = e.name.trim();
      if (!name) continue;
      const at = list.findIndex(l => l.name === name && inScope(l.scope, scope));
      if (at >= 0) {
        existing++;
        if (!list[at].level && e.level) list[at] = { ...list[at], level: e.level };
        continue;
      }
      list.push({ id: newId('l'), name, level: e.level, source: e.source, origin: e.origin, scope, added: Date.now() });
      added++;
    }
    return { ...c, loggers: list };
  });
  if (added) logUiEvent('dk8s.logger_add', { source: entries[0]?.source, count: added });
  return { added, existing };
}

export function removeLogger(id: string): void {
  update(c => ({ ...c, loggers: c.loggers.filter(l => l.id !== id) }));
}

/**
 * Mark or unmark, and give a mark a colour nothing else in scope is using.
 *
 * Colours are assigned rather than chosen: the reader marked a pattern to find
 * it, not to decide what shade it is, and two marks in the same colour are the
 * one thing that makes a highlighted log unreadable.
 */
function marking(c: Catalogue, id: string, on: boolean): Catalogue {
  const patterns = c.patterns.map(p => {
    if (p.id !== id) return p;
    if (!on) return p.marked ? { ...p, marked: false, color: undefined } : p;
    if (p.marked) return p;
    const taken = new Set(c.patterns.filter(o => o.marked && o.scope === p.scope).map(o => o.color ?? 0));
    let color = 0;
    while (taken.has(color) && color < MARK_COLORS.length - 1) color++;
    return { ...p, marked: true, color };
  });
  return { ...c, patterns };
}

export function toggleMark(id: string): void {
  update(c => {
    const p = c.patterns.find(x => x.id === id);
    return p ? marking(c, id, !p.marked) : c;
  });
}

/**
 * "Watch this logger" — every pattern it has, marked or unmarked together.
 *
 * A logger is watched by what it says: marks are what the Logs tab draws, so
 * watching a logger is marking its patterns, and unwatching unmarks the same
 * ones rather than leaving half a logger lit.
 */
export function setMarks(ids: string[], on: boolean): void {
  update(c => ids.reduce((acc, id) => marking(acc, id, on), c));
}

/** Give a pattern a summary, or take it away with `undefined`. */
export function setSummary(
  id: string, summary: import('../components/k8s/determinants').SummarySpec | undefined,
): void {
  update(c => ({ ...c, patterns: c.patterns.map(p => (p.id === id ? { ...p, summary } : p)) }));
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
  update(c => ({
    ...c,
    patterns: c.patterns.map(p => (p.id === id ? { ...p, ...patch, id: p.id, added: p.added } : p)),
  }));
}

export function clearMarks(scope: string): void {
  update(c => ({
    ...c,
    patterns: c.patterns.map(p =>
      inScope(p.scope, scope) ? { ...p, marked: false, color: undefined } : p),
  }));
}

export function saveCheck(scope: string, question: string, window: string): void {
  const q = question.trim();
  if (!q) return;
  update(c => (c.checks.some(k => k.scope === scope && k.question === q && k.window === window)
    ? c
    : { ...c, checks: [...c.checks, { id: newId('c'), scope, question: q, window, added: Date.now() }] }));
  logUiEvent('dk8s.ask_log_save_check', { window });
}

export function removeCheck(id: string): void {
  update(c => ({ ...c, checks: c.checks.filter(k => k.id !== id) }));
}

export function rememberProject(link: ProjectLink): void {
  update(c => ({ ...c, projects: [...c.projects.filter(p => p.scope !== link.scope), link] }));
}
