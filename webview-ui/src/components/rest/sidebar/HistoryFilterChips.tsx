/**
 * What the filter is currently doing, in words, with an X on each part.
 *
 * ── Why chips as well as the panel ──
 *
 * The panel is where you build a filter; the chips are where you read one. A
 * short list with four things switched on inside a closed popup is a list that
 * looks broken — the chips are what stop somebody reopening the panel to find
 * out why they cannot see yesterday's request.
 *
 * Each chip takes its own part back off. That is the interaction people
 * actually want: not "clear everything and start again", but "drop the status
 * one and keep the rest".
 *
 * The three colours are the ones the condition rows use — field, operator,
 * value — so a chip and the row that produced it look like the same sentence.
 */
import { CloseIcon } from '../../../icons';
import {
  chipsOf, dropCondition, dropField, isEmpty,
  type FilterState,
} from '../../../services/history-filter/filter-model';

export function HistoryFilterChips({ state, onChange }: {
  state: FilterState;
  onChange: (next: FilterState) => void;
}) {
  const chips = chipsOf(state);
  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5"
         style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
      {chips.map(chip => (
        <span
          key={chip.kind === 'term' ? `t:${chip.field}` : `c:${chip.id}`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
          style={{
            background: 'var(--color-surface-hover)',
            border: `1px solid ${chip.negated ? 'color-mix(in srgb, var(--color-error) 40%, transparent)' : 'var(--color-surface-border)'}`,
          }}
        >
          <span style={{ color: chip.negated ? 'var(--color-error)' : 'var(--color-filter-field)', fontWeight: 600 }}>
            {chip.key}
          </span>
          <span style={{ color: 'var(--color-filter-op)' }}>{chip.op}</span>
          {!!chip.value && (
            <span className="font-mono truncate" style={{ color: 'var(--color-filter-value)', maxWidth: 120 }}>
              {chip.value}
            </span>
          )}
          <button
            type="button"
            title="Take this one off"
            className="border-none bg-transparent cursor-pointer p-0 flex"
            style={{ color: 'var(--color-text-muted)' }}
            onClick={() => onChange(chip.kind === 'term'
              ? dropField(state, chip.field)
              : dropCondition(state, chip.id))}
          >
            <CloseIcon size={9} color="currentColor" />
          </button>
        </span>
      ))}
      {!isEmpty(state) && chips.length > 1 && (
        <button
          type="button"
          className="text-[10px] px-1 border-none bg-transparent cursor-pointer"
          style={{ color: 'var(--color-text-muted)' }}
          onClick={() => onChange({ terms: [], conditions: [], text: state.text })}
        >
          clear all
        </button>
      )}
    </div>
  );
}
