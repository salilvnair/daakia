/**
 * The builder's half-written determinant, and the rules it is saved by.
 *
 * Kept out of the page so the rules can be read and tested without a screen:
 * which holes survive when the pattern changes under them, what a draft saves
 * as, and why Save says no. A determinant is still one catalogue pattern with
 * a `summary` — this is only the shape it has while somebody is typing it.
 */
import type { CataloguePattern } from '../../store/dk8s-logger-store';
import type { LoggerPattern } from '../k8s/logger-pattern';
import type { SummarySpec, SummaryShow } from '../k8s/determinants';

/** The three ways in, in the order the builder offers them. */
export type DraftMode = 'paste' | 'line' | 'regex';

export interface Draft {
  /** The catalogue pattern being edited. Absent: a new one. */
  id?: string;
  name: string;
  scope: string;
  mode: DraftMode;
  /** What is in each box, kept per mode so switching back loses nothing. */
  paste: string;
  regex: string;
  /** The line picked in the log, by seq, when there is one. */
  pickedSeq?: number;
  /** The pattern as it stands, from whichever box last produced one. */
  pattern?: LoggerPattern;
  /** Why the box in front of the reader did not produce a pattern. */
  error?: string;
  groupBy: string[];
  measure?: string;
  mix?: string;
  show: SummaryShow;
}

/**
 * A new draft. Counting on, worst on (it only shows once there is a measure),
 * first-seen and the strip off — the answer the board draws for a new one,
 * and the two that earn their room on most questions.
 */
export function emptyDraft(scope = '*'): Draft {
  return {
    name: '',
    scope,
    mode: 'paste',
    paste: '',
    regex: '',
    groupBy: [],
    show: { count: true, worst: true, seen: false, draw: false },
  };
}

/** A saved pattern, back in the builder. */
export function draftFrom(pattern: CataloguePattern): Draft {
  const spec = pattern.summary;
  /* Only the pattern's own fields: the mark, its colour and the summary are
     the catalogue's business, and are kept by `updatePattern` untouched. */
  const own: LoggerPattern = {
    template: pattern.template,
    holes: pattern.holes,
    logger: pattern.logger,
    level: pattern.level,
    source: pattern.source,
    regex: pattern.regex,
  };
  return {
    id: pattern.id,
    name: spec?.name ?? '',
    scope: pattern.scope,
    mode: pattern.regex !== undefined ? 'regex' : 'paste',
    paste: '',
    regex: pattern.regex ?? '',
    pattern: own,
    groupBy: spec?.groupBy ?? [],
    measure: spec?.measure,
    mix: spec?.mix,
    show: {
      count: spec?.show?.count ?? true,
      worst: spec?.show?.worst ?? true,
      seen: spec?.show?.seen ?? (spec ? true : false),
      draw: spec?.show?.draw ?? false,
    },
  };
}

/**
 * Put a new pattern under the draft, keeping what still makes sense.
 *
 * A grouping by `path` survives a re-paste that still has a `path` — the
 * reader fixed a typo in the literal text, not their question. A hole that is
 * gone is dropped from the grouping, the measure and the mix, rather than
 * saved as a column that can never fill.
 */
export function withPattern(draft: Draft, pattern: LoggerPattern | undefined, error?: string): Draft {
  const holes = new Set(pattern?.holes ?? []);
  return {
    ...draft,
    pattern,
    error,
    groupBy: draft.groupBy.filter(h => holes.has(h)),
    measure: draft.measure && holes.has(draft.measure) ? draft.measure : undefined,
    mix: draft.mix && holes.has(draft.mix) ? draft.mix : undefined,
  };
}

/** What the draft saves as. */
export function specOf(draft: Draft): SummarySpec {
  return {
    groupBy: draft.groupBy,
    measure: draft.measure,
    mix: draft.mix,
    name: draft.name.trim() || undefined,
    show: draft.show,
  };
}

/** The draft as a catalogue pattern, for the preview to run exactly as a window would. */
export function draftAsPattern(draft: Draft): CataloguePattern | undefined {
  if (!draft.pattern) return undefined;
  return { ...draft.pattern, id: draft.id ?? 'draft', scope: draft.scope, added: 0, summary: specOf(draft) };
}

/**
 * Whether Save can save, and if not, the one reason to fix first.
 *
 * In the order somebody meets them: no pattern, then a pattern with nothing in
 * it to group by, then nothing ticked. A determinant with an empty grouping is
 * one row for every line — `determinantsIn` would not even list it.
 */
export function saveBlocker(draft: Draft): string | undefined {
  if (!draft.pattern) return draft.error ?? 'Paste the call, pick a line, or write a regex first.';
  if (draft.pattern.holes.length === 0) {
    return 'This pattern has no holes, so there is nothing to group by. A regex needs a named group — (?<name>…).';
  }
  if (draft.groupBy.length === 0) return 'Tick at least one field to group by.';
  return undefined;
}
