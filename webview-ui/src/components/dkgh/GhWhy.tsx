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
      <div className="fh" style={{ padding: '0 14px 8px' }}>
        <b style={{ color: 'var(--dk-text)' }}>{shown.length} of {all.length}</b> shown
        <span className="sp" style={{ flex: 1 }} />
        <GhClose onClick={onClose} title="Done reading" />
      </div>

      {excluded.length === 0 ? (
        <div className="fct" style={{ display: 'block', lineHeight: 1.6 }}>
          Nothing is being excluded — every issue the board holds is on screen.
        </div>
      ) : (
        <div className="facet">
          <div className="fh">{excluded.length} excluded — pick one to see why</div>
          <div style={{ maxHeight: 132, overflowY: 'auto' }}>
            {excluded.slice(0, 40).map(i => (
              <div
                key={i.number}
                className={`fct${i.number === picked ? ' on' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => setPicked(i.number)}
              >
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--dk-gh)' }}>
                  #{i.number}
                </span>
                <span className="truncate">{i.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {issue && (
        <div className="facet">
          <div className="fh">Why #{issue.number} is not in this list</div>
          {verdicts.map((v, at) => (
            <div key={`${v.term.field}-${at}`} className="fct"
                 style={{ alignItems: 'flex-start', cursor: 'default' }}>
              <Ico name={v.passes ? 'check' : 'x'}
                   style={{ color: v.passes ? 'var(--dk-green)' : 'var(--dk-red)',
                            marginTop: 2, flexShrink: 0 }} />
              <span style={{ lineHeight: 1.5 }}>
                <b style={{ color: 'var(--dk-text)' }}>{v.key}</b>
                <span> — {v.actual}</span>
                {!v.passes && <span style={{ color: 'var(--dk-red)' }}> — excluded here</span>}
              </span>
            </div>
          ))}
          {verdicts.some(v => !v.passes) && (
            <div style={{ padding: '4px 14px 0' }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const failing = verdicts.find(v => !v.passes)!;
                  onChange(dropField(state, failing.term.field));
                }}
              >
                Drop the {verdicts.find(v => !v.passes)!.key} filter
              </button>
            </div>
          )}
        </div>
      )}

      <div className="facet">
        <div className="fh">What each filter costs</div>
        {costs.map((c, at) => (
          <div key={`${c.term.field}-${at}`} className="fct" style={{ cursor: 'default' }}>
            <span className="truncate">{c.label}</span>
            <span className="n" style={c.removes === 0 ? undefined
              : { color: 'var(--dk-amber)' }}>
              {c.removes}
            </span>
          </div>
        ))}
        {costs.length > 1 && worst && (
          <div className="fct" style={{ display: 'block', lineHeight: 1.55,
                                        color: 'var(--dk-faint)' }}>
            {worst.removes > 0
              ? <><b style={{ color: 'var(--dk-text)' }}>{worst.label}</b> is doing
                  most of the work — it alone removes {worst.removes}.</>
              : 'None of these is removing anything the others had not already taken.'}
            {costs.some(c => c.removes === 0) && (
              <> The ones at zero could be dropped without changing the answer.</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
