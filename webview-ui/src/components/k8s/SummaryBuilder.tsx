/**
 * Telling a pattern how to summarise itself.
 *
 * Three questions, in the order somebody thinks of them: what makes a row,
 * what to measure, what to count the values of. Each offers only the holes
 * that can answer it — the measure list holds the holes that were a number on
 * every line seen, so `path` is never offered as something to take a maximum
 * of.
 *
 * The one mistake worth preventing is grouping by a value that is different
 * every time: `took` as a grouping gives one row per line, which is the log
 * back again with extra steps. It is not forbidden — somebody may know
 * something the buffer does not show — but it is named as what it is, with the
 * count that proves it.
 */
import { useMemo } from 'react';
import { useK8sStore } from '../../store/k8s-store';
import { setSummary, type CataloguePattern } from '../../store/dk8s-logger-store';
import { numericHoles, holeSpread, type SummarySpec } from './determinants';
import { ACCENT } from './tone';

export function SummaryBuilder({ pattern, onClose }: {
  pattern: CataloguePattern;
  onClose: () => void;
}) {
  const logs = useK8sStore(s => s.logs);
  const spec: SummarySpec = pattern.summary ?? { groupBy: [] };

  const numeric = useMemo(() => numericHoles(logs, pattern), [logs, pattern]);
  const spread = useMemo(() => holeSpread(logs, pattern), [logs, pattern]);

  const set = (next: Partial<SummarySpec>) =>
    setSummary(pattern.id, { ...spec, ...next });

  const toggleGroup = (hole: string) => {
    const groupBy = spec.groupBy.includes(hole)
      ? spec.groupBy.filter(h => h !== hole)
      : [...spec.groupBy, hole];
    set({ groupBy });
  };

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 rounded-lg mt-1"
         style={{ background: 'var(--color-panel)', border: '1px solid var(--color-surface-border)' }}>

      <div className="flex items-center gap-2">
        <span className="text-[11.5px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          Summarise this one
        </span>
        <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
          it then answers every window without being asked
        </span>
        <span className="flex-1" />
        <button type="button" onClick={onClose}
                className="px-2 py-0.5 rounded cursor-pointer border-none bg-transparent text-[11px]"
                style={{ color: 'var(--color-text-muted)' }}>
          done
        </button>
      </div>

      {pattern.holes.length === 0 ? (
        <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
          This pattern has no holes, so there is nothing to group by — it can be counted by marking it,
          but not summarised.
        </span>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] w-[74px] shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
              A row per
            </span>
            {pattern.holes.map(hole => {
              const on = spec.groupBy.includes(hole);
              const values = spread[hole];
              const scattered = values !== undefined && values > 20;
              return (
                <button
                  key={hole}
                  type="button"
                  onClick={() => toggleGroup(hole)}
                  title={values === undefined
                    ? 'Nothing in this buffer has filled it yet'
                    : `${values} different value${values === 1 ? '' : 's'} in this buffer`}
                  className="px-2 py-0.5 rounded-full cursor-pointer text-[11px] font-mono"
                  style={on
                    ? { background: `color-mix(in srgb, ${ACCENT} 18%, transparent)`, color: ACCENT, border: `1px solid ${ACCENT}` }
                    : {
                      background: 'transparent',
                      color: scattered ? 'var(--color-warning)' : 'var(--color-text-secondary)',
                      border: '1px solid var(--color-surface-border)',
                    }}
                >
                  {hole}{values !== undefined && <span style={{ opacity: 0.7 }}> · {values}</span>}
                </button>
              );
            })}
          </div>

          {spec.groupBy.some(h => (spread[h] ?? 0) > 20) && (
            <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
              One of those is different on nearly every line, so the summary will have a row per line —
              which is the log again, not a summary of it.
            </span>
          )}

          <div className="flex items-center gap-2">
            <label htmlFor={`m-${pattern.id}`} className="text-[11px] w-[74px] shrink-0"
                   style={{ color: 'var(--color-text-secondary)' }}>
              Worst
            </label>
            <select
              id={`m-${pattern.id}`}
              value={spec.measure ?? ''}
              onChange={e => set({ measure: e.target.value || undefined })}
              className="px-2 py-0.5 rounded text-[11px]"
              style={{
                background: 'var(--color-input-bg, var(--color-surface))',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-surface-border)',
              }}
            >
              <option value="">nothing</option>
              {numeric.map(hole => <option key={hole} value={hole}>{hole}</option>)}
            </select>
            {numeric.length === 0 && (
              <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                no hole here has held a number on every line
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor={`x-${pattern.id}`} className="text-[11px] w-[74px] shrink-0"
                   style={{ color: 'var(--color-text-secondary)' }}>
              Count each
            </label>
            <select
              id={`x-${pattern.id}`}
              value={spec.mix ?? ''}
              onChange={e => set({ mix: e.target.value || undefined })}
              className="px-2 py-0.5 rounded text-[11px]"
              style={{
                background: 'var(--color-input-bg, var(--color-surface))',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-surface-border)',
              }}
            >
              <option value="">nothing</option>
              {pattern.holes.filter(h => (spread[h] ?? 0) <= 20).map(hole => (
                <option key={hole} value={hole}>{hole}</option>
              ))}
            </select>
            <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
              a status, an outcome — something with a handful of values
            </span>
          </div>

          {spec.groupBy.length > 0 && (
            <button
              type="button"
              onClick={() => { setSummary(pattern.id, undefined); onClose(); }}
              className="self-start px-2 py-0.5 rounded cursor-pointer border-none bg-transparent text-[11px]"
              style={{ color: 'var(--color-error)' }}
            >
              stop summarising it
            </button>
          )}
        </>
      )}
    </div>
  );
}
