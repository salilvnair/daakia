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
import { BadgeChipView, ButtonView } from '@salilvnair/dui';
import { CheckIcon, CloseIcon } from '../../icons';
import { costOf, dropField, explain, type FilterState, type MatchContext } from './filter-model';
import type { BoardIssue } from './board-types';
import { ACCENT } from './types';

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

  return (
    <div className="flex flex-col gap-2 overflow-y-auto flex-shrink-0"
         style={{
           width: 268,
           borderLeft: '1px solid var(--color-surface-border)',
           padding: '10px 10px 14px',
           background: 'var(--color-panel)',
         }}>

      <div className="flex items-center gap-2">
        <span className="text-[10px]" style={{ color: 'var(--color-text-primary)' }}>
          <b>{shown.length} of {all.length}</b> shown
        </span>
        <span className="flex-1" />
        <ButtonView size="sm" variant="ghost" accentColor="var(--color-text-muted)"
                    onClick={onClose}>
          Close
        </ButtonView>
      </div>

      {excluded.length === 0 ? (
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          Nothing is being excluded — every issue the board holds is on screen.
        </span>
      ) : (
        <>
          <span className="text-[9px] font-bold uppercase tracking-[.09em]"
                style={{ color: 'var(--color-text-muted)' }}>
            {excluded.length} excluded — pick one to see why
          </span>
          <div className="flex flex-col rounded-lg border overflow-hidden"
               style={{ borderColor: 'var(--color-surface-border)', maxHeight: 132, overflowY: 'auto' }}>
            {excluded.slice(0, 40).map((i, at) => (
              <button
                key={i.number}
                type="button"
                onClick={() => setPicked(i.number)}
                className="flex items-center gap-1.5 px-2 py-1 text-left cursor-pointer"
                style={{
                  background: i.number === picked
                    ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'transparent',
                  border: 'none',
                  borderTop: at === 0 ? 'none'
                    : '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
                }}
              >
                <span className="text-[10px] font-mono" style={{ color: ACCENT }}>#{i.number}</span>
                <span className="text-[10px] truncate"
                      style={{ color: 'var(--color-text-secondary)' }}>
                  {i.title}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {issue && (
        <div className="flex flex-col gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[.09em]"
                style={{ color: 'var(--color-text-muted)' }}>
            Why #{issue.number} is not in this list
          </span>
          <div className="flex flex-col rounded-lg border overflow-hidden"
               style={{ borderColor: 'var(--color-surface-border)' }}>
            {verdicts.map((v, at) => (
              <div key={`${v.term.field}-${at}`}
                   className="flex items-start gap-1.5 px-2 py-1"
                   style={{
                     borderTop: at === 0 ? 'none'
                       : '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
                   }}>
                <span style={{ color: v.passes ? 'var(--color-success)' : 'var(--color-error)',
                               marginTop: 2, flexShrink: 0 }}>
                  {v.passes ? <CheckIcon size={9} /> : <CloseIcon size={9} />}
                </span>
                <span className="text-[10px]" style={{ lineHeight: 1.5 }}>
                  <b style={{ color: 'var(--color-text-primary)' }}>{v.key}</b>
                  <span style={{ color: 'var(--color-text-muted)' }}> — {v.actual}</span>
                  {!v.passes && (
                    <span style={{ color: 'var(--color-error)' }}> — excluded here</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          {verdicts.some(v => !v.passes) && (
            <ButtonView size="sm" accentColor={ACCENT}
                        onClick={() => {
                          const failing = verdicts.find(v => !v.passes)!;
                          onChange(dropField(state, failing.term.field));
                        }}>
              Drop the {verdicts.find(v => !v.passes)!.key} filter
            </ButtonView>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[9px] font-bold uppercase tracking-[.09em]"
              style={{ color: 'var(--color-text-muted)' }}>
          What each filter costs
        </span>
        <div className="flex flex-col rounded-lg border overflow-hidden"
             style={{ borderColor: 'var(--color-surface-border)' }}>
          {costs.map((c, at) => (
            <div key={`${c.term.field}-${at}`}
                 className="flex items-center gap-1.5 px-2 py-1"
                 style={{
                   borderTop: at === 0 ? 'none'
                     : '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
                 }}>
              <span className="text-[10px] flex-1 truncate"
                    style={{ color: 'var(--color-text-secondary)' }}>
                {c.label}
              </span>
              <BadgeChipView
                tone={c.removes === 0 ? 'var(--color-text-muted)' : 'var(--color-warning)'}
                size="xs"
              >
                {c.removes}
              </BadgeChipView>
            </div>
          ))}
        </div>
        {costs.length > 1 && worst && (
          <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
            {worst.removes > 0
              ? <><b style={{ color: 'var(--color-text-primary)' }}>{worst.label}</b> is doing
                  most of the work — it alone removes {worst.removes}.</>
              : 'None of these is removing anything the others had not already taken.'}
            {costs.some(c => c.removes === 0) && (
              <> The ones at zero could be dropped without changing the answer.</>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
