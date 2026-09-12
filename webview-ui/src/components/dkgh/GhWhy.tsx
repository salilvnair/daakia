/**
 * Screen 08E — why is this here, and where did that one go.
 *
 * The moment a filter stack gets past three terms, somebody asks why an issue
 * they expected is missing. Answering that by unticking things one at a time is
 * the reason people stop trusting filters.
 *
 * Two halves, and both are needed:
 *
 * - **Every term against one issue**, ticked or crossed, with the actual value
 *   beside it. Not just the one that failed — knowing that #41 would *also*
 *   have been caught by the quiet filter is what stops you dropping the
 *   assignee filter and being surprised a second time.
 * - **What each filter costs.** Which of your four terms is doing the work and
 *   which is decoration. A term that removes nothing the others had not already
 *   taken is one you could drop without changing the answer, and that is worth
 *   knowing before you spend a minute on it.
 */
import { useState } from 'react';
import { Ico } from './GhIcons';
import { chipOf } from './GhCards';
import { GhClose } from './GhClose';
import { costOf, dropField, explain, type FilterState, type MatchContext } from './filter-model';
import type { BoardIssue } from './board-types';

export function GhWhy({ all, shown, state, onChange, ctx, onClose }: {
  /** Everything the board holds. */
  all: BoardIssue[];
  /** What survived the filter, so the excluded pile is the difference. */
  shown: BoardIssue[];
  state: FilterState;
  onChange: (next: FilterState) => void;
  ctx: MatchContext;
  onClose: () => void;
}) {
  const shownNumbers = new Set(shown.map(i => i.number));
  const excluded = all.filter(i => !shownNumbers.has(i.number));
  const [picked, setPicked] = useState<number | undefined>(excluded[0]?.number);

  const issue = all.find(i => i.number === picked);
  const verdicts = issue ? explain(issue, state, ctx) : [];
  const costs = costOf(all, state, ctx);
  const worst = costs.reduce((a, b) => (b.removes > a.removes ? b : a), costs[0]);

  /*
    A sheet across the foot of the board, not a column down its side.

    As a rail it was a 268px column of mostly nothing: on a board with two
    issues and one filter there are three short lines to say, and they sat at
    the top of a full-height panel with six hundred pixels of empty under them.
    The answer is short and it is about the rows, so it belongs under the rows
    — and it is only ever open for as long as it takes to read.

    It rises rather than appears, and it takes only the height it needs, up to
    a little under half the board.
  */
  return (
    <div className="whysheet">
      {/*
        ── The head ──

        The two numbers are the whole subject of this panel, so they are the
        first thing in it and they are big enough to read as a figure rather
        than as a label. What used to be here was "2 OF 2 SHOWN" set in 9px
        caps against the left edge, which is a footnote about the thing rather
        than the thing.

        The sentence under it changes with the answer. "Everything is on
        screen" and "4 are being held back" are different states and reading
        which one you are in should not require counting.
      */}
      <div className="why-head">
        <div className="why-stat" aria-hidden="true">
          <b>{shown.length}</b>
          <i>of {all.length}</i>
        </div>
        <div className="why-said">
          <h4>
            {excluded.length === 0
              ? 'Everything is on screen'
              : `${excluded.length} ${excluded.length === 1 ? 'issue is' : 'issues are'} being held back`}
          </h4>
          <p>
            {excluded.length === 0
              ? (costs.length === 0
                ? 'No filter, saved view or search term is taking anything out.'
                : 'Your filters are running, and between them they are removing nothing.')
              : 'Pick one to see which term caught it, and what each term is costing you.'}
          </p>
        </div>
        <GhClose onClick={onClose} title="Done reading" />
      </div>

      {/*
        ── The body ──

        Columns, because these are three answers to three questions and reading
        them stacked meant scrolling past the one you came for. They collapse
        on a narrow board; nothing is ever drawn empty — a heading with nothing
        under it is worse than no heading, which is what "What each filter
        costs" was with no filters set.
      */}
      {(excluded.length > 0 || costs.length > 0) && (
        <div className="why-cols">
          {excluded.length > 0 && (
            <section className="why-col">
              <div className="why-h">Held back<span className="n">{excluded.length}</span></div>
              <div className="why-list">
                {excluded.slice(0, 40).map(i => (
                  <button
                    key={i.number}
                    type="button"
                    className={`why-row${i.number === picked ? ' on' : ''}`}
                    onClick={() => setPicked(i.number)}
                  >
                    <span className="why-num">#{i.number}</span>
                    <span className="truncate">{i.title}</span>
                  </button>
                ))}
                {excluded.length > 40 && (
                  <div className="why-note">
                    and {excluded.length - 40} more — the first 40 are enough to see the pattern.
                  </div>
                )}
              </div>
            </section>
          )}

          {issue && (
            <section className="why-col">
              <div className="why-h">Why #{issue.number} is out</div>
              <div className="why-list">
                {verdicts.map((v, at) => (
                  <div key={`${v.term.field}-${at}`}
                       className={`why-row still${v.passes ? '' : ' bad'}`}>
                    <Ico name={v.passes ? 'check' : 'x'} />
                    <span className="why-t">
                      <b>{v.key}</b>
                      {/* What this issue actually has, as the chip it is
                          everywhere else — the row beside it is a tick or a
                          cross, and the value is the thing being judged. */}
                      <Val field={v.term.field}>{v.actual}</Val>
                    </span>
                  </div>
                ))}
              </div>
              {verdicts.some(v => !v.passes) && (
                <button
                  type="button"
                  className="btn"
                  style={{ margin: '8px 0 0' }}
                  onClick={() => {
                    const failing = verdicts.find(v => !v.passes)!;
                    onChange(dropField(state, failing.term.field));
                  }}
                >
                  <Ico name="x" />
                  Drop the {verdicts.find(v => !v.passes)!.key} filter
                </button>
              )}
            </section>
          )}

          {costs.length > 0 && (
            <section className="why-col">
              <div className="why-h">
                What each term costs
                <span className="n">removes</span>
              </div>
              <div className="why-list">
                {costs.map((c, at) => (
                  <div key={`${c.term.field}-${at}`} className="why-row still">
                    {/* The field muted, the value as a chip — three rows of
                        identical grey text with a number on the end is a list
                        you read twice to tell apart. */}
                    <span className="why-field">{c.key}</span>
                    {c.value && <Val field={c.term.field}>{c.value}</Val>}
                    <span className={`why-cost${c.removes === 0 ? ' idle' : ''}`}>
                      {c.removes}
                    </span>
                  </div>
                ))}
              </div>
              {costs.length > 1 && worst && (
                <div className="why-note">
                  {worst.removes > 0
                    ? <><b>{worst.key}</b>{' '}
                        {/* Coloured text, not a chip. A chip is a thing in a
                            list of things; dropped into a running sentence it
                            is a box with a border sitting on the line and the
                            sentence has to step around it. */}
                        <Tone field={worst.term.field}>{worst.value}</Tone>{' '}
                        is doing most of the work — it alone removes {worst.removes}.</>
                    : 'None of these is removing anything the others had not already taken.'}
                  {costs.some(c => c.removes === 0) && (
                    <> The ones at zero could be dropped without changing the answer.</>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One hue per kind of filter.
 *
 * `chipOf` colours a value against the options its dimension declared — which
 * is right on a board, where `Reporting` is one of four modules. A filter term
 * has no such list: `Open`, `Nobody` and `14 days` are answers to three
 * different questions, so `colourOf` fell through to its "I have no options"
 * grey and drew all three the same.
 *
 * The field is what tells these rows apart, so the field is what picks the
 * colour. Fixed rather than hashed, because there are eight of them and a hash
 * would put `state` and `assignee` on the same hue often enough to matter.
 */
const FIELD_HUE: Record<string, string> = {
  state: 'var(--dk-green)',
  assignee: 'var(--dk-blue)',
  author: 'var(--dk-cyan)',
  label: 'var(--dk-pink)',
  milestone: 'var(--dk-purple, #8957e5)',
  quiet: 'var(--dk-amber)',
  age: 'var(--dk-orange)',
  created: 'var(--dk-orange)',
  updated: 'var(--dk-orange)',
  has: 'var(--dk-ws)',
};

/** The colour a field's values are drawn in, here and in `Val`. */
function hueOf(field: string): string {
  return FIELD_HUE[field.toLowerCase()] ?? 'var(--dk-gh)';
}

/**
 * The same value, as coloured text rather than a chip.
 *
 * For prose. In the list a chip is right — it is one of several values in a
 * column and the box is what makes it scannable. In a sentence the same box is
 * an interruption: the line has to make room for a border and a background
 * that carry no meaning the colour is not already carrying.
 */
function Tone({ field, children }: { field: string; children: string }) {
  return <b style={{ color: hueOf(field), fontWeight: 600 }}>{children}</b>;
}

/**
 * A value, as a chip in its field's colour.
 *
 * `chipOf` first: it knows `UI`, `API`, `DEV` and `PROD` on sight and gives
 * them the classes the rest of the tab uses, so a module or an environment
 * looks the same here as it does on a card. Everything else takes the field's
 * hue.
 */
function Val({ field, children }: { field: string; children: string }) {
  const named = chipOf(children);
  if (named.className !== 'chip') return <span className={named.className}>{children}</span>;

  const hue = hueOf(field);
  return (
    <span
      className="chip"
      style={{
        color: hue,
        borderColor: `color-mix(in srgb, ${hue} 45%, transparent)`,
        background: `color-mix(in srgb, ${hue} 14%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}
