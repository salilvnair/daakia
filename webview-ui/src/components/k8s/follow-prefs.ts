/**
 * What the Fields settings page decides for Follow, read wherever Follow runs.
 *
 * Three things, each a ui-state pref:
 *
 *   - the order Follow tries fields in when a LINE is followed rather than a
 *     field — traceId first, because one request through every service is the
 *     strongest thread there is, and the thread name last, because a pod reuses
 *     it all day;
 *   - how many lines a value may spread over before Follow asks first — a
 *     `downstream` shared by every call to a service is a filter over the whole
 *     log, and it should be a decision rather than a surprise;
 *   - the follows somebody saved, to come back to.
 */
import { useMemo } from 'react';
import { useUiStateStore } from '../../store/ui-state-store';
import { useCatalogue } from '../../store/dk8s-logger-store';
import { useTeamDk8sSources, teamPrefValues } from '../../store/dk8s-team-store';
import { parseCustomFields, readersOf, CUSTOM_FIELDS_PREF, type FieldReader, type CustomField } from './field-readers';
import type { Condition } from './follow';

export const CORRELATE_PREF = 'dk8s.follow.correlateBy';
export const ASK_ABOVE_PREF = 'dk8s.follow.askAbove';
export const VIEWS_PREF = 'dk8s.follow.views';

export const ASK_ABOVE_OPTIONS = [200, 500, 2000] as const;
export const ASK_ABOVE_DEFAULT = 500;

export interface CorrelateKey { key: string; on: boolean; note: string }

export const CORRELATE_DEFAULT: CorrelateKey[] = [
  { key: 'traceId', on: true, note: 'one request through every service' },
  { key: 'requestDataId', on: true, note: 'your own id, set in a filter' },
  { key: 'thread', on: true, note: 'last resort — a name a pod reuses all day' },
];

export function correlateOrder(raw: string | undefined): CorrelateKey[] {
  if (!raw) return CORRELATE_DEFAULT;
  try {
    const v = JSON.parse(raw) as CorrelateKey[];
    return Array.isArray(v) && v.every(k => typeof k.key === 'string') ? v : CORRELATE_DEFAULT;
  } catch {
    return CORRELATE_DEFAULT;
  }
}

export function askAbove(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : ASK_ABOVE_DEFAULT;
}

/**
 * Which field to follow when a whole line is followed.
 *
 * The first key in the order that is switched on and that the line actually
 * carries. None — a line with no id and no thread — is `undefined`, and the
 * caller says so rather than following the message text.
 */
export function correlateFor(
  line: { thread?: string; fields?: Record<string, string> },
  order: CorrelateKey[],
  valueOf: (key: string) => string | undefined,
): { field: string; value: string } | undefined {
  for (const k of order) {
    if (!k.on) continue;
    const v = valueOf(k.key);
    if (v) return { field: k.key, value: v };
  }
  return undefined;
}

/** A follow somebody kept: the conditions, the pods, and the instant it was around. */
export interface SavedFollow {
  id: string;
  name: string;
  conds: Condition[];
  anchor: { pod: string; ts?: number; text: string };
  width: number;
  oneTimeline: boolean;
  onlyPod: boolean;
  /** The search it was followed out of, so reopening it knows the pods. */
  query: string;
  pods: { pod: string; namespace: string; context: string; containers: string[] }[];
  saved: number;
}

export function parseViews(raw: string | undefined): SavedFollow[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as SavedFollow[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveView(view: SavedFollow): void {
  const st = useUiStateStore.getState();
  const views = parseViews(st.prefs[VIEWS_PREF]).filter(v => v.id !== view.id);
  st.setPref(VIEWS_PREF, JSON.stringify([view, ...views].slice(0, 30)));
}

export function removeView(id: string): void {
  const st = useUiStateStore.getState();
  st.setPref(VIEWS_PREF, JSON.stringify(parseViews(st.prefs[VIEWS_PREF]).filter(v => v.id !== id)));
}

/** The custom fields you named, as stored. */
export function useCustomFields(): CustomField[] {
  const raw = useUiStateStore(s => s.prefs[CUSTOM_FIELDS_PREF]);
  return useMemo(() => parseCustomFields(raw), [raw]);
}

/**
 * Yours and your teammates': a field somebody named in a shared workspace
 * reads their lines on your machine too. Theirs are read-only here, and take
 * an id that cannot collide with one of yours.
 */
export function useAllCustomFields(): { mine: CustomField[]; team: (CustomField & { owner: string })[] } {
  const mine = useCustomFields();
  const sources = useTeamDk8sSources();
  const team = useMemo(() => teamPrefValues(sources, CUSTOM_FIELDS_PREF).flatMap(({ source, value }) =>
    parseCustomFields(value).map(f => ({ ...f, id: `team:${source.workspaceId}:${f.id}`, owner: source.ownerName }))),
  [sources]);
  return { mine, team };
}

/**
 * Every reader beyond the format: all catalogued patterns and the custom fields.
 *
 * The whole catalogue rather than one workload's: a search spans pods of
 * several workloads, and a pattern scoped to one of them is still the truth
 * about that logger's lines wherever they turn up.
 */
export function useFieldReaders(): FieldReader[] {
  const catalogue = useCatalogue();
  const { mine, team } = useAllCustomFields();
  return useMemo(() => readersOf(catalogue.patterns, [...mine, ...team]), [catalogue, mine, team]);
}

export function useFollowPrefs(): { order: CorrelateKey[]; askAbove: number; views: SavedFollow[] } {
  const prefs = useUiStateStore(s => s.prefs);
  return useMemo(() => ({
    order: correlateOrder(prefs[CORRELATE_PREF]),
    askAbove: askAbove(prefs[ASK_ABOVE_PREF]),
    views: parseViews(prefs[VIEWS_PREF]),
  }), [prefs]);
}
