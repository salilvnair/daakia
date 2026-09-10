/**
 * Screen 16D — your own charts, pinned.
 *
 * The four built-in charts are our guess at what a team wants. The chart a
 * particular team actually looks at every day is one we did not think of, and
 * this is where they make it.
 *
 * **A pinned chart carries its view with it**, so changing that view changes
 * the chart and clicking a bar opens that view's issues. It is a saved
 * question, not a saved picture — see `charts-model`.
 *
 * **It sits among the built-in ones, marked but not segregated.** The accent
 * border and the "yours" chip say whose it is; a separate tab would say the
 * four we guessed matter more.
 */
import { useState } from 'react';
import { ModalView } from '@salilvnair/dui';
import { Ico } from './GhIcons';
import { Dk, GhNote } from './GhShell';
import { colourOf } from './field-colour';
import { ACCENT } from './types';
import {
  barsFor, chartFields, provenance, suggestedTitle,
  type Measure, type PinnedChart,
} from './charts-model';
import type { BoardIssue, ProposedDimension } from './board-types';

/** One pinned chart, drawn among the built-ins. */
export function GhOwnChart({ chart, rows, options, missing, onFilter, onRemove }: {
  chart: PinnedChart;
  rows: BoardIssue[];
  /** The declared values of the field being drawn, so colours stay put. */
  options?: string[];
  /** Set when the view this chart was built on is gone. */
  missing?: boolean;
  onFilter: (field: string, value: string) => void;
  onRemove: () => void;
}) {
  const bars = barsFor(chart, rows);
  const tallest = Math.max(1, ...bars.map(b => b.value));

  return (
    <div className="chartc"
         style={{ borderColor: 'color-mix(in srgb, var(--dk-gh) 45%, transparent)' }}>
      <div className="ct" style={{ display: 'flex', alignItems: 'center', gap: 8.4 }}>
        {chart.title}
        <span className="chip c-gh">yours</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" style={{ padding: '1.2px 7.2px' }}
                title="Unpin this chart" onClick={onRemove}>
          <Ico name="x" />
        </button>
      </div>
      <div className="cs">{provenance(chart)}</div>

      {missing ? (
        <div className="cs" style={{ margin: 0, color: 'var(--dk-amber)' }}>
          The view “{chart.view}” is not here any more, so this chart has nothing to draw.
          It is kept rather than deleted &mdash; a renamed view is usually a renamed view.
        </div>
      ) : bars.length === 0 ? (
        <div className="cs" style={{ margin: 0 }}>Nothing matches right now.</div>
      ) : (
        <div style={{ marginTop: 7.2 }}>
          {bars.slice(0, 8).map(b => (
            <button
              key={b.label}
              type="button"
              className="barrow"
              style={{ width: '100%' }}
              title={`Show the ${chart.groupBy} “${b.label}”`}
              onClick={() => onFilter(chart.groupBy, b.label)}
            >
              <span className="bl">{b.label}</span>
              <span className="bt">
                {b.parts.length > 0
                  ? b.parts.map(p => (
                    <i key={p.key}
                       style={{ width: `${(p.value / tallest) * 100}%`,
                                background: colourOf(p.key, options) }} />
                  ))
                  : <i style={{ width: `${(b.value / tallest) * 100}%`,
                                background: colourOf(b.label, options) }} />}
              </span>
              <span className="bv">{b.value}{chart.measure === 'days' ? 'd' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The dashed tile at the end of the grid. */
export function GhNewChartTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="chartc"
      style={{ borderStyle: 'dashed', display: 'grid', placeItems: 'center',
               minHeight: 132, width: '100%', cursor: 'pointer' }}
      onClick={onClick}
    >
      <div style={{ textAlign: 'center' }}>
        <Ico name="plus" style={{ width: 21.6, height: 21.6, color: 'var(--dk-faint)' }} />
        <div style={{ fontSize: 12.6, color: 'var(--dk-muted)', marginTop: 6 }}>
          Chart any view
        </div>
        <div style={{ fontSize: 11.4, color: 'var(--dk-faint)' }}>
          group by, split by, count or days
        </div>
      </div>
    </button>
  );
}

export function GhNewChart({ repo, views, currentView, dimensions, who, onCancel, onPin }: {
  repo: string;
  /** The saved views, by name — a chart is one of them, charted. */
  views: string[];
  currentView: string;
  dimensions: ProposedDimension[];
  who?: string;
  onCancel: () => void;
  onPin: (chart: PinnedChart) => void;
}) {
  const fields = chartFields(dimensions);
  const [view, setView] = useState(currentView);
  const [groupBy, setGroupBy] = useState(fields[0] ?? 'state');
  const [splitBy, setSplitBy] = useState('');
  const [measure, setMeasure] = useState<Measure>('count');
  const [title, setTitle] = useState('');

  const suggested = suggestedTitle(groupBy, splitBy || undefined, measure);

  return (
    <ModalView
      open
      onClose={onCancel}
      size="md"
      headerGradient
      headerColor={ACCENT}
      headerIcon={<Ico name="chart" />}
      title="New chart"
      subtitle={repo}
      footerLeft={<Dk><span className="sub">pinned among the built-in four</span></Dk>}
      footerRight={
        <Dk>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            <button
              type="button"
              className="btn go"
              onClick={() => onPin({
                id: `c${Date.now().toString(36)}`,
                title: title.trim() || suggested,
                view,
                groupBy,
                splitBy: splitBy || undefined,
                measure,
                pinnedBy: who,
                at: Date.now(),
              })}
            >
              Pin it
            </button>
          </span>
        </Dk>
      }
    >
      <Dk>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13.2 }}>
          <div className="fieldrow">
            <span className="fl">Of the view</span>
            <select className="inp" value={view} onChange={e => setView(e.target.value)}>
              <option value="">the whole board</option>
              {views.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <div style={{ fontSize: 11.4, color: 'var(--dk-faint)' }}>
              The chart follows the view. Change what the view filters and this changes with
              it &mdash; that is the point of it being a chart of a question.
            </div>
          </div>

          <div className="fieldrow">
            <span className="fl">One bar per</span>
            <select className="inp" value={groupBy} onChange={e => setGroupBy(e.target.value)}>
              {fields.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div className="fieldrow">
            <span className="fl">Split each bar by</span>
            <select className="inp" value={splitBy} onChange={e => setSplitBy(e.target.value)}>
              <option value="">nothing</option>
              {fields.filter(f => f !== groupBy).map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <div className="fieldrow">
            <span className="fl">Measuring</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className={`btn${measure === 'count' ? ' go' : ''}`}
                      style={{ padding: '4.8px 12px' }} onClick={() => setMeasure('count')}>
                How many
              </button>
              <button type="button" className={`btn${measure === 'days' ? ' go' : ''}`}
                      style={{ padding: '4.8px 12px' }} onClick={() => setMeasure('days')}>
                Days open
              </button>
            </div>
            {measure === 'days' && (
              <div style={{ fontSize: 11.4, color: 'var(--dk-faint)' }}>
                The median, not the mean &mdash; one two-year-old issue should not move a
                number a team reads every morning.
              </div>
            )}
          </div>

          <div className="fieldrow">
            <span className="fl">Called</span>
            <input className="inp" value={title} placeholder={suggested}
                   onChange={e => setTitle(e.target.value)} aria-label="Chart name" />
          </div>

          <GhNote icon="filter" style={{ margin: 0, maxWidth: 'none' }}>
            <b>A pinned chart carries its view with it.</b> Clicking a bar opens that
            view&rsquo;s issues, and editing the view changes the chart. A chart is a saved
            question, not a saved picture.
          </GhNote>
        </div>
      </Dk>
    </ModalView>
  );
}
