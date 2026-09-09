/**
 * Screen 09C — generate a chart, from the view you are looking at.
 *
 * It charts **this view** — the rows already filtered on screen — so the
 * numbers match what you just read rather than being a second query that might
 * disagree. Change the filters and the chart follows.
 *
 * Group by and split by are the only two questions that matter, and both offer
 * the same dimensions the board groups by. So anything you can see on a board
 * you can chart, **including Module and Environment, which GitHub cannot chart
 * at all**.
 *
 * Colours come from the field map, so a chart of Priority looks like the
 * board's Priority — see `field-colour.ts` for the rule and `index.css` for the
 * palette and its validation.
 *
 * Form: a horizontal bar, because the question is magnitude across a handful of
 * named categories and the names are words rather than dates. Stacked when a
 * split is on, with a 2px surface gap between segments so adjacent colours never
 * touch — the palette's light steps sit under 3:1 against the surface, and the
 * relief for that is the visible labels and the table beneath, both of which are
 * here.
 */
import { useMemo, useState } from 'react';
import { ButtonView, ModalView, TogglePillView, BadgeChipView } from '@salilvnair/dui';
import { ChartBarIcon } from '../../icons';
import { cap, valueOf, type BoardIssue, type ProposedDimension } from './board-types';
import { colourOf } from './field-colour';
import { ACCENT } from './types';

type Measure = 'count' | 'days';

export function GhChart({ open, title, issues, dimensions, onClose }: {
  open: boolean;
  /** Which view this is charting, said on the chart itself. */
  title: string;
  issues: BoardIssue[];
  dimensions: ProposedDimension[];
  onClose: () => void;
}) {
  const groupable = useMemo(() => [
    ...dimensions.map(d => ({ id: d.dimension, label: cap(d.dimension) })),
    { id: 'assignee', label: 'Assignee' },
    { id: 'milestone', label: 'Milestone' },
  ], [dimensions]);

  const [groupBy, setGroupBy] = useState(groupable[0]?.id ?? 'assignee');
  const [splitBy, setSplitBy] = useState<string>('');
  const [measure, setMeasure] = useState<Measure>('count');
  const [showValues, setShowValues] = useState(true);
  const [sortBySize, setSortBySize] = useState(true);

  const optionsOf = (field: string) =>
    dimensions.find(d => d.dimension === field)?.options;

  const data = useMemo(() => {
    const rows = new Map<string, Map<string, number>>();
    const splits = new Set<string>();

    for (const i of issues) {
      const g = valueOf(i, groupBy) || `No ${groupBy}`;
      const s = splitBy ? (valueOf(i, splitBy) || `No ${splitBy}`) : '';
      const amount = measure === 'count' ? 1 : i.ageDays;
      const row = rows.get(g) ?? new Map<string, number>();
      row.set(s, (row.get(s) ?? 0) + amount);
      rows.set(g, row);
      splits.add(s);
    }

    const out = [...rows.entries()].map(([label, parts]) => ({
      label,
      parts: [...parts.entries()],
      total: [...parts.values()].reduce((a, b) => a + b, 0),
    }));

    /*
      Sorted by size by default, and alphabetically when that is turned off.
      A chart whose bars are in insertion order is a chart whose order means
      "whatever gh returned first", which is not a fact about anything.
    */
    out.sort(sortBySize
      ? (a, b) => b.total - a.total || a.label.localeCompare(b.label)
      : (a, b) => a.label.localeCompare(b.label));

    /* Splits in the order the form declared them, so a stacked bar reads
       Urgent → Low rather than alphabetically. */
    const declared = optionsOf(splitBy) ?? [];
    const order = [...splits].sort((a, b) => {
      const ai = declared.findIndex(o => o.toLowerCase() === a.toLowerCase());
      const bi = declared.findIndex(o => o.toLowerCase() === b.toLowerCase());
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b);
    });

    return { rows: out, splits: order, max: Math.max(1, ...out.map(r => r.total)) };
  }, [issues, groupBy, splitBy, measure, sortBySize, dimensions]);

  /* With no split there is one series, so it takes the tab's own accent — a
     categorical hue for a single series would imply an identity it has not
     got. */
  const colourFor = (split: string) =>
    (splitBy ? colourOf(split, optionsOf(splitBy)) : ACCENT);

  return (
    <ModalView
      open={open}
      onClose={onClose}
      size="lg"
      headerGradient
      headerColor={ACCENT}
      headerIcon={<ChartBarIcon size={14} />}
      title="Chart"
      subtitle={`from view: ${title}`}
      footerLeft={
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          Charting <b>{issues.length} issue{issues.length === 1 ? '' : 's'}</b> — the view&rsquo;s
          own rows. Change the filters and the chart follows.
        </span>
      }
      footerRight={
        <ButtonView size="sm" accentColor="var(--color-text-muted)" onClick={onClose}>
          Close
        </ButtonView>
      }
    >
      <div className="flex gap-3" style={{ minHeight: 260 }}>

        {/* The two questions that matter */}
        <div className="flex flex-col gap-2.5 flex-shrink-0" style={{ width: 168 }}>
          <Picker label="Group by" value={groupBy} options={groupable} onChange={setGroupBy} />
          <Picker label="Split by" value={splitBy}
                  options={[{ id: '', label: 'Nothing' }, ...groupable.filter(g => g.id !== groupBy)]}
                  onChange={setSplitBy} />
          <div className="flex flex-col gap-1">
            <Head>Measure</Head>
            <div className="flex gap-1 flex-wrap">
              <TogglePillView accentColor={ACCENT} active={measure === 'count'}
                              onClick={() => setMeasure('count')}>
                Count
              </TogglePillView>
              <TogglePillView accentColor={ACCENT} active={measure === 'days'}
                              onClick={() => setMeasure('days')}>
                Sum of days open
              </TogglePillView>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Head>Options</Head>
            <div className="flex gap-1 flex-wrap">
              <TogglePillView accentColor={ACCENT} active={showValues}
                              onClick={() => setShowValues(v => !v)}>
                Show values
              </TogglePillView>
              <TogglePillView accentColor={ACCENT} active={sortBySize}
                              onClick={() => setSortBySize(v => !v)}>
                Sort by size
              </TogglePillView>
            </div>
          </div>
        </div>

        {/* The chart */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div>
            <div className="text-[11.5px]" style={{ color: 'var(--color-text-primary)' }}>
              {measure === 'count' ? 'Issues' : 'Days open'} by {groupBy}
              {splitBy ? `, split by ${splitBy}` : ''}
            </div>
            <div className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
              {title} · {issues.length} issue{issues.length === 1 ? '' : 's'}
            </div>
          </div>

          {data.rows.length === 0 ? (
            <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
              Nothing to chart — this view is empty.
            </span>
          ) : (
            <div className="flex flex-col gap-1.5">
              {data.rows.map(row => (
                <div key={row.label} className="flex items-center gap-2">
                  <span className="text-[10px] truncate text-right flex-shrink-0"
                        style={{ width: 96, color: 'var(--color-text-secondary)' }}
                        title={row.label}>
                    {row.label}
                  </span>
                  <span className="flex-1 flex items-center"
                        style={{ height: 16, gap: 2 }}
                        title={`${row.label}: ${row.total}`}>
                    {row.parts.map(([split, amount]) => (
                      <span
                        key={split || 'all'}
                        title={`${split || row.label}: ${amount}`}
                        style={{
                          /* Percentage of the row, of the row's share of the
                             widest — so the bars are comparable and the
                             segments inside one add to it. */
                          width: `${(amount / data.max) * 100}%`,
                          height: '100%',
                          background: colourFor(split),
                          borderRadius: 3,
                          minWidth: 3,
                        }}
                      />
                    ))}
                    {showValues && (
                      <span className="text-[9.5px] font-mono flex-shrink-0"
                            style={{ color: 'var(--color-text-muted)', paddingLeft: 4 }}>
                        {row.total}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/*
            A legend whenever there is more than one series — identity never
            rests on colour alone, which is also the relief the light palette's
            contrast warning requires.
          */}
          {splitBy && data.splits.length > 1 && (
            <div className="flex gap-2 flex-wrap pt-1">
              {data.splits.map(s => (
                <span key={s || 'none'} className="flex items-center gap-1 text-[9.5px]"
                      style={{ color: 'var(--color-text-muted)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2,
                                 background: colourFor(s), flexShrink: 0 }} />
                  {s || `No ${splitBy}`}
                </span>
              ))}
            </div>
          )}

          <div className="text-[9.5px] pt-1" style={{ color: 'var(--color-text-muted)' }}>
            Colours come from the field map, so a chart of {splitBy || groupBy} looks like the
            board&rsquo;s {splitBy || groupBy}.
          </div>

          {/* The table view, so every number is readable without the colours */}
          <details className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            <summary className="cursor-pointer">The same numbers as a table</summary>
            <div className="flex flex-col gap-0.5 pt-1">
              {data.rows.map(r => (
                <span key={r.label} className="flex gap-2">
                  <span style={{ width: 110 }}>{r.label}</span>
                  <span style={{ color: 'var(--color-text-primary)' }}>{r.total}</span>
                  {splitBy && (
                    <span>
                      ({r.parts.map(([s, n]) => `${s || 'none'} ${n}`).join(', ')})
                    </span>
                  )}
                </span>
              ))}
            </div>
          </details>

          <span className="flex items-center gap-1.5 pt-1">
            <BadgeChipView tone="var(--color-text-muted)" size="xs">
              Add to Insights comes with screen 16
            </BadgeChipView>
          </span>
        </div>
      </div>
    </ModalView>
  );
}

function Head({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-bold uppercase tracking-[.09em]"
          style={{ color: 'var(--color-text-muted)' }}>
      {children}
    </span>
  );
}

function Picker({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Head>{label}</Head>
      <div className="flex flex-col">
        {options.map(o => (
          <button
            key={o.id || 'none'}
            type="button"
            onClick={() => onChange(o.id)}
            className="text-left px-1.5 py-[3px] rounded text-[10.5px] cursor-pointer"
            style={{
              background: value === o.id
                ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'transparent',
              border: 'none',
              color: value === o.id ? ACCENT : 'var(--color-text-secondary)',
              fontWeight: value === o.id ? 600 : 400,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
