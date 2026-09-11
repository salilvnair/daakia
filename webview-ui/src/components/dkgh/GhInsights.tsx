/**
 * Screen 16 — Insights.
 *
 * Four charts, each answering a question somebody asks out loud in a status
 * call. Not a dashboard to admire: the numbers come from the issues the board
 * already read, so the chart and the list are looking at the same thing and
 * cannot disagree.
 *
 * **16A — every bar is a filter you have not applied yet.** Clicking one takes
 * you back to the board with that filter on, which is the move somebody makes
 * ten seconds after seeing a bar they did not expect. A chart you cannot act on
 * is a picture.
 *
 * **16E is on the screen, not in a footnote.** What these numbers cannot tell
 * you is written under them: they are the issues that were read, in the window
 * chosen, and neither of those is "everything that happened".
 */
import { useMemo, useState } from 'react';
import { Ico } from './GhIcons';
import { colourOf } from './field-colour';
import {
  ages, byAssignee, compare, headline, stacked, weekly, type StackedRow,
} from './insights-model';
import { GhCompare } from './GhCompare';
import { GhNewChart, GhNewChartTile, GhOwnChart } from './GhOwnCharts';
import { loadCharts, saveCharts, type PinnedChart } from './charts-model';
import type { BoardIssue, ProposedDimension } from './board-types';

const TONE = {
  good: 'var(--dk-green)',
  warn: 'var(--dk-amber)',
  bad: 'var(--dk-red)',
} as const;

export function GhInsights({
  repo, issues, dimensions, weeks, onWeeks, onFilter, views, currentView, rowsForView, who,
}: {
  /** What the board is showing. The charts follow the filters, deliberately. */
  issues: BoardIssue[];
  repo: string;
  dimensions: ProposedDimension[];
  weeks: number;
  onWeeks: (weeks: number) => void;
  /** 16A — a bar is a filter. */
  onFilter: (field: string, value: string) => void;
  /** 16D — the saved views a pinned chart can be a chart *of*. */
  views: string[];
  currentView: string;
  /** The rows one of those views holds, or nothing if it has been renamed away. */
  rowsForView: (name: string) => BoardIssue[] | undefined;
  who?: string;
}) {
  /* 16D. Per repository, in the browser's own storage — the same place the
     saved views live, because a chart is one of them charted. */
  const [charts, setCharts] = useState<PinnedChart[]>(() => loadCharts(repo));
  const [making, setMaking] = useState(false);
  const pin = (c: PinnedChart) => {
    const next = [...charts, c];
    setCharts(next);
    saveCharts(repo, next);
    setMaking(false);
  };
  const unpin = (id: string) => {
    const next = charts.filter(c => c.id !== id);
    setCharts(next);
    saveCharts(repo, next);
  };
  const open = useMemo(() => issues.filter(i => i.state === 'OPEN'), [issues]);

  const series = useMemo(() => weekly(issues, weeks), [issues, weeks]);

  /*
    The first two dimensions this repository declares, or GitHub's own when it
    declares none. A chart of a field that does not exist here would be four
    empty rows with a confident heading.
  */
  const primary = dimensions[0]?.dimension;
  const secondary = dimensions[1]?.dimension;

  const where = useMemo(() => (primary
    ? stacked(open, i => i.dimensions[primary] || `No ${primary}`,
      secondary ? i => i.dimensions[secondary] || 'unset' : undefined)
    : stacked(open, i => i.labels[0]?.name ?? 'no label')
  ), [open, primary, secondary]);

  /* 16B — this window against the one before it. Off by default: a comparison
     is a second question, and the four charts answer the first one. */
  const [comparing, setComparing] = useState(false);
  const versus = useMemo(
    () => compare(issues, weeks, primary
      ? i => i.dimensions[primary] || `No ${primary}`
      : i => i.labels[0]?.name ?? 'no label'),
    [issues, weeks, primary],
  );

  const buckets = useMemo(() => ages(open), [open]);
  const people = useMemo(() => byAssignee(
    open,
    primary ? i => i.dimensions[primary] || 'unset' : i => (i.state === 'OPEN' ? 'open' : 'closed'),
  ), [open, primary]);

  const splitOptions = secondary
    ? dimensions.find(d => d.dimension === secondary)?.options ?? []
    : [];
  const tallest = Math.max(1, ...buckets.map(b => b.count));

  return (
    <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
      <div className="chiprow" style={{ borderBottom: '1px solid var(--dk-border)' }}>
        <span className="lead">{headline(open)}</span>
        <span className="sp" />
        {[4, 12, 26].map(w => (
          <button key={w} type="button" className={`pill${weeks === w ? ' on' : ''}`}
                  onClick={() => onWeeks(w)}>
            {w} weeks
          </button>
        ))}
        <button type="button" className={`pill${comparing ? ' on' : ''}`}
                onClick={() => setComparing(c => !c)}>
          Compare
        </button>
        <button type="button" className="pill" onClick={() => setMaking(true)}>
          <Ico name="plus" />New chart
        </button>
      </div>

      {comparing && <GhCompare versus={versus} weeks={weeks} />}

      <div className="charts">
        {/* 1 — the backlog, over time */}
        <div className="chartc">
          <div className="ct">Open issues over time</div>
          <div className="cs">
            {series.closedKnown
              ? 'Opened against closed, weekly. The gap is the backlog.'
              : 'Opened weekly. No close dates are loaded, so there is no closing line — '
                + 'show closed issues on the board and it appears.'}
          </div>
          <Lines series={series} />
        </div>

        {/* 2 — where they are */}
        <div className="chartc">
          <div className="ct">Where the {primary ? 'issues' : 'labels'} are</div>
          <div className="cs">
            {primary
              ? `Open issues by ${primary}${secondary ? `, split by ${secondary}` : ''}.`
              : 'Open issues by their first label — this repository declares no dimensions.'}
          </div>
          <Bars
            rows={where}
            colour={key => colourOf(key, splitOptions)}
            onPick={label => primary && onFilter(primary, label)}
          />
          {secondary && splitOptions.length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap',
                          fontSize: 11, color: 'var(--dk-faint)' }}>
              {splitOptions.slice(0, 5).map(o => (
                <span key={o}>
                  <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                              marginRight: 4, background: colourOf(o, splitOptions) }} />
                  {o}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 3 — how long they sit */}
        <div className="chartc">
          <div className="ct">How long they sit</div>
          <div className="cs">Age of open issues. Anything past a week is the amber band.</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 96,
                        marginTop: 4 }}>
            {buckets.map(b => (
              <button
                key={b.label}
                type="button"
                title={`${b.count} issue${b.count === 1 ? '' : 's'} ${b.label} old`}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 4, background: 'none', border: 'none', padding: 0,
                  cursor: b.count ? 'pointer' : 'default',
                }}
                onClick={() => b.count && onFilter('age', b.label)}
              >
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11.4,
                               color: 'var(--dk-text)' }}>
                  {b.count || ''}
                </span>
                <span style={{
                  width: '100%',
                  height: `${Math.max(2, (b.count / tallest) * 62)}px`,
                  borderRadius: 3,
                  background: b.count ? TONE[b.tone] : 'var(--dk-raised)',
                }} />
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10.8,
                               color: 'var(--dk-faint)' }}>
                  {b.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 4 — who is carrying what */}
        <div className="chartc">
          <div className="ct">Who is carrying what</div>
          <div className="cs">
            Open issues per assignee. <b>Unassigned is first on purpose</b> — it is the row a
            lead needs, and sorting it in among the names by count is the polite way to hide it.
          </div>
          <Bars
            rows={people}
            colour={key => colourOf(key, splitOptions)}
            onPick={label => onFilter('assignee', label === 'unassigned' ? 'none' : label)}
          />
        </div>

        {/* 16D — among the built-in four, marked but not segregated. */}
        {charts.map(c => (
          <GhOwnChart
            key={c.id}
            chart={c}
            rows={c.view ? rowsForView(c.view) ?? [] : issues}
            options={dimensions.find(d => d.dimension === (c.splitBy ?? c.groupBy))?.options}
            missing={!!c.view && rowsForView(c.view) === undefined}
            onFilter={onFilter}
            onRemove={() => unpin(c.id)}
          />
        ))}
        <GhNewChartTile onClick={() => setMaking(true)} />
      </div>

      {charts.length > 0 && (
        <div className="note" style={{ maxWidth: 'none', margin: 0, borderRadius: 0,
                                       borderLeft: 0, borderRight: 0, borderBottom: 0 }}>
          <Ico name="filter" />
          <div>
            <b>A pinned chart carries its view with it.</b> Editing that view changes the
            chart, and clicking a bar opens the view&rsquo;s issues. A chart is a saved
            question, not a saved picture.
          </div>
        </div>
      )}

      {making && (
        <GhNewChart
          repo={repo}
          views={views}
          currentView={currentView}
          dimensions={dimensions}
          who={who}
          onCancel={() => setMaking(false)}
          onPin={pin}
        />
      )}

      {/* 16E, on the screen rather than in a footnote */}
      <div className="note" style={{ margin: '0 19px 20px' }}>
        <Ico name="warn" />
        <div>
          <b>What these cannot tell you.</b> They count the issues that were read — this
          repository&rsquo;s first {issues.length}, with whatever filters are on — over the last{' '}
          {weeks} weeks. They do not know about work that was never filed, and an issue closed
          without being opened here is not in the weekly line. Every bar is clickable: that is
          the honest way to check one, by looking at the rows behind it.
        </div>
      </div>
    </div>
  );
}

/** The two lines, drawn at the mock's own size. */
function Lines({ series }: { series: ReturnType<typeof weekly> }) {
  const { points, closedKnown } = series;
  const top = Math.max(4, ...points.map(p => Math.max(p.open, p.opened, p.closed)));
  const step = points.length > 1 ? 264 / (points.length - 1) : 0;
  const x = (i: number) => 26 + i * step;
  const y = (v: number) => 78 - (v / top) * 72;

  const line = (pick: (p: typeof points[0]) => number) =>
    points.map((p, i) => `${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(' ');

  const last = points[points.length - 1];

  return (
    <svg viewBox="0 0 300 96" role="img"
         aria-label={`Open issues ended at ${last?.open ?? 0} over ${points.length} weeks`}>
      <line x1="26" y1="6" x2="26" y2="78" stroke="var(--dk-border)" strokeWidth="1" />
      <line x1="26" y1="78" x2="294" y2="78" stroke="var(--dk-border)" strokeWidth="1" />
      <text x="20" y="12" fill="var(--dk-faint)" fontSize="7" textAnchor="end"
            fontFamily="monospace">{top}</text>
      <text x="20" y="80" fill="var(--dk-faint)" fontSize="7" textAnchor="end"
            fontFamily="monospace">0</text>

      <polyline points={line(p => p.open)} fill="none" stroke="var(--dk-red)" strokeWidth="2"
                strokeLinejoin="round" />
      {closedKnown && (
        <polyline points={line(p => p.closed)} fill="none" stroke="var(--dk-green)"
                  strokeWidth="2" strokeLinejoin="round" />
      )}
      {last && (
        <>
          <circle cx={x(points.length - 1)} cy={y(last.open)} r="2.6" fill="var(--dk-red)" />
          <text x="290" y={Math.max(10, y(last.open) - 5)} fill="var(--dk-red)" fontSize="7"
                textAnchor="end" fontFamily="monospace">
            open {last.open}
          </text>
        </>
      )}
      {points[0] && (
        <text x="26" y="90" fill="var(--dk-faint)" fontSize="7" fontFamily="monospace">
          {points[0].week.slice(5)}
        </text>
      )}
      {last && (
        <text x="290" y="90" fill="var(--dk-faint)" fontSize="7" textAnchor="end"
              fontFamily="monospace">
          {last.week.slice(5)}
        </text>
      )}
    </svg>
  );
}

/** A stack per row, at the mock's own proportions. Each row is a filter. */
function Bars({ rows, colour, onPick }: {
  rows: StackedRow[];
  colour: (key: string) => string;
  onPick: (label: string) => void;
}) {
  const top = Math.max(1, ...rows.map(r => r.total));
  if (rows.length === 0) {
    return <div className="sub">Nothing to count here yet.</div>;
  }
  return (
    <div style={{ marginTop: 4 }}>
      {rows.slice(0, 8).map(r => (
        <button
          key={r.label}
          type="button"
          className="barrow"
          style={{ width: '100%', background: 'none', border: 'none', padding: 0,
                   cursor: 'pointer', textAlign: 'left' }}
          title={`Show the ${r.total} in ${r.label}`}
          onClick={() => onPick(r.label)}
        >
          <span className="bl">{r.label}</span>
          <span className="bt" style={{ width: `${(r.total / top) * 100}%`, flex: 'none' }}>
            {r.parts.map(p => (
              <i
                key={p.key || 'none'}
                title={`${p.key || 'unset'}: ${p.count}`}
                style={{ width: `${(p.count / r.total) * 100}%`, background: colour(p.key) }}
              />
            ))}
          </span>
          <span className="bv">{r.total}</span>
        </button>
      ))}
    </div>
  );
}
