/**
 * Screen 11F — what the model proposed, every field of it, as rows.
 *
 * The generate panel used to show only the fields the model had answered, as
 * plain text you could tick or untick. Two things were wrong with that. The
 * fields it *could not* answer were nowhere on the list once their question had
 * gone by, so "show me everything it came back with" had no screen; and a value
 * you disagreed with could only be taken whole or dropped whole — there was no
 * way to fix one word of it without going and finding the field in the sidebar,
 * which is a different screen with a different layout.
 *
 * So the review is over the *template's* fields, not the model's answers: every
 * field the form declares gets a row, in the order it declared them, whatever
 * the model did or did not say about it. What varies is the row's state, and
 * that is what this file works out.
 *
 * Kept out of the component because it is the part worth testing. Which row is
 * "edited" rather than "taken" decides whether the screen says a value is the
 * model's or yours, and that claim is the whole point of the panel.
 */
import type { FormField } from './board-types';

export interface Proposal {
  title?: string;
  answers?: Record<string, string>;
  unanswered?: { label: string; why: string }[];
  notes?: string;
}

/**
 * - `taken`   — the draft holds exactly what the model proposed.
 * - `edited`  — the draft holds something else, and the model had proposed
 *               something: a value the reader changed, which the row says so
 *               it can offer the original back.
 * - `yours`   — the draft holds a value the model never proposed. Typed before
 *               generating, usually, and not the model's to claim credit for.
 * - `offered` — proposed, not in the draft. One click away.
 * - `open`    — the model said it could not answer this one, and gave a reason.
 * - `blank`   — nothing proposed, nothing written, no reason given.
 */
export type RowState = 'taken' | 'edited' | 'yours' | 'offered' | 'open' | 'blank';

export interface ReviewRow {
  label: string;
  required: boolean;
  /** The template's own values, if it is a dropdown. Empty means free text. */
  options: string[];
  /** The form field's type — `textarea` wants a taller editor than `input`. */
  type: string;
  /** What the model said, if it said anything. */
  proposed?: string;
  /**
   * What will be written to the issue if it is filed now — **verbatim**, not
   * tidied.
   *
   * The row binds an editor to this, and a value that comes back trimmed is a
   * value React puts back the moment somebody presses the space bar: they type
   * "one two", the store holds "one ", the row hands back "one", and the space
   * they just typed is undone before the next letter arrives. The comparisons
   * below trim; what the reader is editing does not.
   */
  value: string;
  /** Why the model left it alone, for `open` rows. */
  why?: string;
  state: RowState;
}

const clean = (s: string | undefined) => (typeof s === 'string' ? s.trim() : '');

/**
 * Every field of the template, with what became of it.
 *
 * Fields the form declares as `markdown` are the template's own prose — a
 * heading and a paragraph telling the reporter what to write — and have no
 * answer to review. A row for one is a row that can never be filled in.
 */
export function reviewRows(
  fields: FormField[],
  proposal: Proposal | null,
  answers: Record<string, string>,
): ReviewRow[] {
  const said = proposal?.answers ?? {};
  const open = proposal?.unanswered ?? [];

  return fields
    .filter(f => f.label && f.type !== 'markdown')
    .map(f => {
      const proposed = clean(said[f.label]) || undefined;
      const value = typeof answers[f.label] === 'string' ? answers[f.label] : '';
      const written = clean(value);
      const why = open.find(u => u.label === f.label)?.why;

      const state: RowState =
        written && proposed && written === proposed ? 'taken'
          : written && proposed ? 'edited'
            : written ? 'yours'
              : proposed ? 'offered'
                : why ? 'open'
                  : 'blank';

      return {
        label: f.label,
        required: f.required,
        options: f.options,
        type: f.type,
        proposed,
        value,
        why,
        state,
      };
    });
}

/** The rows that still have a proposal sitting unused. */
export function untaken(rows: ReviewRow[]): ReviewRow[] {
  return rows.filter(r => r.state === 'offered');
}

/**
 * Take every proposal that has not been taken, as one patch.
 *
 * Row by row is right when you are disagreeing with one of them and wrong when
 * you agree with all eight, which is the common case — the model read the
 * template and mostly got it right.
 *
 * Rows the reader has already edited are left alone. Overwriting somebody's own
 * words with the model's, under a button labelled "take all", is the one thing
 * this screen must never do.
 */
export function takeAll(
  rows: ReviewRow[],
  answers: Record<string, string>,
): Record<string, string> {
  const next = { ...answers };
  for (const r of untaken(rows)) next[r.label] = r.proposed!;
  return next;
}

/** How many of the template's fields will be written, and out of how many. */
export function filledCount(rows: ReviewRow[]): { filled: number; total: number } {
  return { filled: rows.filter(r => clean(r.value)).length, total: rows.length };
}

/** Required fields with nothing in them — what would file a half-empty issue. */
export function missingRequired(rows: ReviewRow[]): ReviewRow[] {
  return rows.filter(r => r.required && !clean(r.value));
}

/**
 * What became of the title.
 *
 * Separate from the fields because it is not one: GitHub owns the title, no
 * template declares it, and it is the one thing that is always there to
 * compare. `yours` is a title typed before generating that the model then
 * agreed with or had nothing to say about — either way it is not a decision
 * to re-offer.
 */
export type TitleState = 'none' | 'offered' | 'taken' | 'differs' | 'yours';

export function titleState(proposed: string | undefined, title: string): TitleState {
  const p = clean(proposed);
  const t = clean(title);
  if (!p) return t ? 'yours' : 'none';
  if (!t) return 'offered';
  return p === t ? 'taken' : 'differs';
}
