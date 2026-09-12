/**
 * HeapGrowthView — what changed between two dumps.
 *
 * This is how leaks are actually found: not by staring at one heap, but by
 * taking two and asking what grew. MAT's comparison barely supports it, which
 * is why it gets a first-class view here.
 *
 * Bars are signed and share one scale, so a class that shrank reads as clearly
 * as one that grew — a leak hunt often turns on something that *didn't* get
 * released. Deltas are per-class shallow bytes, which sum exactly to the change
 * in live heap, so the list accounts for the whole difference.
 */
import { useEffect, useState } from 'react';
import { ButtonView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { heapQuery, bytes } from './heap-query';
import { ClassSourceLink } from './ClassSourceLink';

const ACCENT = 'var(--color-doctor)';

interface GrowthRow {
  className: string;
  beforeBytes: number; afterBytes: number; deltaBytes: number;
  beforeInstances: number; afterInstances: number; deltaInstances: number;
}

interface Growth {
  baselineName: string; currentName: string;
  baselineBytes: number; currentBytes: number;
  baselineObjects: number; currentObjects: number;
  rows: GrowthRow[];
  truncatedRows: number;
}

export function HeapGrowthView({ hasBaseline, baselineName, packageFilter }: { hasBaseline: boolean; baselineName: string | null; packageFilter?: string }) {
  const [growth, setGrowth] = useState<Growth | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasBaseline) { setGrowth(null); return; }
    let live = true;
    setLoading(true);
    heapQuery<Growth>({ type: 'growth', packageFilter })
      .then(g => { if (live) { setGrowth(g); setError(''); } })
      .catch(e => { if (live) { setError(e.message); setGrowth(null); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [hasBaseline, packageFilter]);

  // ── Nothing to compare against yet ──
  if (!hasBaseline) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
        <p className="text-[13px] text-[var(--color-text-primary)] m-0">Compare two dumps</p>
        <p className="text-[12px] text-[var(--color-text-muted)] m-0 max-w-[460px] leading-relaxed">
          Mark this dump as the baseline, then open a later one. The comparison attributes every byte
          of the change to the classes responsible — which is how a leak is usually found, rather than
          by reading one heap in isolation.
        </p>
        <ButtonView
          variant="primary" size="sm"
          style={{ backgroundColor: ACCENT, borderColor: ACCENT, marginTop: 4 }}
          onClick={() => postMsg({ type: 'heap:setBaseline' })}
        >
          Use this dump as baseline
        </ButtonView>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
        <p className="text-[12px] text-[var(--color-text-muted)] m-0 max-w-[460px]">{error}</p>
        <p className="text-[11.5px] text-[var(--color-text-muted)] m-0">
          Baseline: <span className="font-mono">{baselineName}</span> — now open a second dump to compare.
        </p>
        <ButtonView variant="secondary" size="sm" onClick={() => postMsg({ type: 'heap:open' })}>
          Open the second dump
        </ButtonView>
      </div>
    );
  }

  if (loading || !growth) {
    return <p className="text-[12px] text-[var(--color-text-muted)] px-4 py-4 m-0">Comparing…</p>;
  }

  const totalDelta = growth.currentBytes - growth.baselineBytes;
  const maxAbs = Math.max(...growth.rows.map(r => Math.abs(r.deltaBytes)), 1);
  const grew = totalDelta >= 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Summary */}
      <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap flex-shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="text-[11.5px] font-mono text-[var(--color-text-secondary)]">
          {growth.baselineName} <span className="text-[var(--color-text-muted)]">{bytes(growth.baselineBytes)}</span>
        </span>
        <span className="text-[var(--color-text-muted)]">→</span>
        <span className="text-[11.5px] font-mono text-[var(--color-text-secondary)]">
          {growth.currentName} <span className="text-[var(--color-text-muted)]">{bytes(growth.currentBytes)}</span>
        </span>
        <span className="text-[15px] font-semibold tabular-nums"
              style={{ color: grew ? 'var(--color-error)' : 'var(--color-success)' }}>
          {grew ? '+' : '−'}{bytes(Math.abs(totalDelta))}
        </span>
        <span className="text-[11.5px] text-[var(--color-text-muted)] tabular-nums">
          {grew ? '+' : ''}{(growth.currentObjects - growth.baselineObjects).toLocaleString()} objects
        </span>
        <div className="flex-1" />
        <ButtonView variant="secondary" size="sm" onClick={() => postMsg({ type: 'heap:setBaseline' })}>
          Rebase on this dump
        </ButtonView>
      </div>

      {/* Waterfall */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {growth.rows.map(r => {
          const up = r.deltaBytes >= 0;
          const frac = Math.abs(r.deltaBytes) / maxAbs;
          return (
            <div key={r.className}
                 className="flex items-center gap-3 px-4 py-1 text-[11.5px] font-mono"
                 style={{ minHeight: 26 }}>
              {/* Signed bar, centred so growth and release read differently at a glance */}
              <div className="flex items-center flex-shrink-0" style={{ width: 130 }}>
                <div className="flex justify-end" style={{ width: 65 }}>
                  {!up && <div style={{ width: `${frac * 100}%`, height: 8, background: 'var(--color-success)', borderRadius: '2px 0 0 2px' }} />}
                </div>
                <div style={{ width: 1, height: 12, background: 'var(--color-surface-border)' }} />
                <div style={{ width: 65 }}>
                  {up && <div style={{ width: `${frac * 100}%`, height: 8, background: 'var(--color-error)', borderRadius: '0 2px 2px 0' }} />}
                </div>
              </div>
              <span className="text-right tabular-nums flex-shrink-0"
                    style={{ width: 84, color: up ? 'var(--color-error)' : 'var(--color-success)' }}>
                {up ? '+' : '−'}{bytes(Math.abs(r.deltaBytes))}
              </span>
              <span className="text-right tabular-nums text-[var(--color-text-muted)] flex-shrink-0" style={{ width: 78 }}
                    title={`${r.beforeInstances.toLocaleString()} → ${r.afterInstances.toLocaleString()} instances`}>
                {r.deltaInstances >= 0 ? '+' : ''}{r.deltaInstances.toLocaleString()}
              </span>
              <ClassSourceLink className={r.className} />
            </div>
          );
        })}
        {growth.truncatedRows > 0 && (
          <p className="text-[11px] text-[var(--color-text-muted)] px-4 py-2 m-0">
            {growth.truncatedRows.toLocaleString()} smaller changes not shown.
          </p>
        )}
      </div>
    </div>
  );
}
