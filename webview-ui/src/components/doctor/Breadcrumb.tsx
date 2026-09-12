/**
 * The steps that produced the current object set.
 *
 * This is the whole navigation model for the heap views, which is why it sits
 * above them rather than inside one. Every step is a decision someone made,
 * every step is clickable, and the set size sits at the end because a count is
 * what tells you whether the last decision was the right one.
 *
 * Rendered even when nothing has been narrowed. A breadcrumb that appears on
 * the first click is a control nobody knows exists until they have already
 * done the thing it would have helped with.
 */
import type { ObjectSet } from './object-set';
import { isNarrowed } from './object-set';

export function Breadcrumb({ set, onBack, count, bytes }: {
  set: ObjectSet;
  onBack: (index: number) => void;
  /** Objects in the current set, when the view knows. */
  count?: number;
  /** Bytes, when the view knows. */
  bytes?: string;
}) {
  const narrowed = isNarrowed(set);
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 flex-wrap text-[11px]"
         style={{
           background: 'var(--color-surface)',
           borderBottom: '1px solid var(--color-surface-border)',
         }}>
      {set.map((step, i) => {
        const last = i === set.length - 1;
        return (
          <span key={`${step.kind}:${step.filter}:${i}`} className="flex items-center gap-1.5">
            {i > 0 && <span style={{ color: 'var(--color-text-muted)' }}>›</span>}
            {last ? (
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                {step.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onBack(i)}
                style={{
                  font: 'inherit', background: 'transparent', border: 'none', padding: 0,
                  cursor: 'pointer', color: 'var(--color-dk8s)',
                }}
              >
                {step.label}
              </button>
            )}
          </span>
        );
      })}

      <span className="flex-1" />

      {(count !== undefined || bytes) && (
        <span className="tabular-nums" style={{ color: 'var(--color-dk8s)' }}>
          {count !== undefined && `${count.toLocaleString()} classes`}
          {count !== undefined && bytes && ' · '}
          {bytes}
        </span>
      )}

      {narrowed && (
        <button
          type="button"
          onClick={() => onBack(0)}
          style={{
            font: 'inherit', fontSize: 10.5, marginLeft: 8,
            background: 'transparent', border: 'none', padding: 0,
            cursor: 'pointer', color: 'var(--color-text-muted)',
          }}
        >
          reset
        </button>
      )}
    </div>
  );
}
