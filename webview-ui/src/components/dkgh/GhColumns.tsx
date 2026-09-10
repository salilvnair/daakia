/**
 * Screen 06 — the column board.
 *
 * The stand-up view. Columns come from the linked Project's Status field, so
 * dragging a card here moves it on GitHub — this is not a private board that
 * quietly disagrees with the real one.
 *
 * **Two dimensions at once**, which is the trick: columns are status, colour is
 * whatever else the repository tracks. The urgent red-edged card sitting in
 * Blocked with nobody's name on it is visible from across the room, which is
 * the whole reason to look at a board rather than a list.
 *
 * **06A — the card moves first and the write follows.** A board that waits for
 * a round trip before moving anything feels broken; one that moves and never
 * checks is lying. So the card lands, the command runs, and a failure puts it
 * back where it was with the reason attached.
 *
 * **06B — a WIP limit is a fact, not a rule.** Nothing is prevented. The header
 * counts and the bar goes red, because the useful thing a limit does is make an
 * overloaded column obvious in a stand-up, not stop somebody working.
 *
 * **06E — the board can disagree with GitHub**, and when it does it says so
 * rather than resolving it. Auto-refresh pauses while a card is in the air, so
 * a refresh landing mid-drag cannot silently undo the drop.
 */
import { useMemo, useRef, useState } from 'react';
import { Ico } from './GhIcons';
import { avClass, chipOf, prClass } from './GhCards';
import { GhNote } from './GhShell';
import { absentBecause, type ProjectBoard, type ProjectField } from './project-store';
import type { BoardIssue, ProposedDimension } from './board-types';

/** The mock's five column tints, matched by what the column is called. */
const TINT: [RegExp, string][] = [
  [/progress|doing|active/i, 'k-prog'],
  [/review|qa|verify/i, 'k-review'],
  [/block|hold|wait/i, 'k-block'],
  [/done|closed|ship/i, 'k-done'],
];

function tintFor(name: string): string {
  return TINT.find(([re]) => re.test(name))?.[1] ?? '';
}

export interface Move {
  issue: BoardIssue;
  from: string;
  to: string;
}

export function GhColumns({
  issues, project, field, colourBy, dimensions, wip, onOpen, onMove, pending,
}: {
  issues: BoardIssue[];
  project: ProjectBoard | null;
  /** The single-select the columns are, or undefined while there is none. */
  field?: ProjectField;
  /** The dimension the card edge is coloured by. */
  colourBy?: string;
  dimensions: ProposedDimension[];
  /** 06B — how many a column is comfortable with. 0 is no limit. */
  wip: number;
  onOpen: (issue: BoardIssue) => void;
  /** 06A — the drop. The card has already moved; this writes it. */
  onMove: (move: Move) => void;
  /** Issues with a write in flight, so a card can say it is not settled. */
  pending: Map<number, string>;
}) {
  const [dragging, setDragging] = useState<BoardIssue | undefined>();
  const [over, setOver] = useState<string | undefined>();
  const drag = useRef<BoardIssue | undefined>(undefined);

  const columns = useMemo(() => {
    if (!field) return [];
    const names = (field.options ?? []).map(o => o.name);
    /* A value the project no longer declares still has issues on it, and they
       are not nothing — an extra column is more honest than hiding them. */
    const extra = [...new Set(issues
      .map(i => i.dimensions[field.name.toLowerCase()])
      .filter((v): v is string => !!v && !names.includes(v)))];
    return [...names, ...extra, 'No ' + field.name.toLowerCase()];
  }, [field, issues]);

  const at = (column: string) => {
    if (!field) return [];
    const key = field.name.toLowerCase();
    if (column.startsWith('No ')) return issues.filter(i => !i.dimensions[key]);
    return issues.filter(i => i.dimensions[key] === column);
  };

  if (!field) {
    return (
      <div style={{ padding: '16px 19px' }}>
        <GhNote title="No Status to arrange by" tone="warn" style={{ maxWidth: 'none',
                                                                     margin: 0 }}>
          {absentBecause(project)
            || 'The linked Project declares no single-select field, so there are no columns '
              + 'to make. Cards and Table show everything this repository does have.'}
        </GhNote>
      </div>
    );
  }

  return (
    <>
      {dragging && (
        <div className="chiprow">
          <span className="lead">Moving</span>
          <span style={{ fontSize: 12.6, color: 'var(--dk-text)' }}>
            <b>#{dragging.number}</b> out of{' '}
            <span className="st st-todo">
              <b />{dragging.dimensions[field.name.toLowerCase()] || `No ${field.name}`}
            </span>
          </span>
          <span className="sp" />
          <span className="sub">auto-refresh paused · drop to write, Esc to cancel</span>
        </div>
      )}

      <div
        className="kan"
        style={{ gridTemplateColumns: `repeat(${Math.min(6, columns.length)}, minmax(0, 1fr))` }}
        onDragEnd={() => { drag.current = undefined; setDragging(undefined); setOver(undefined); }}
      >
        {columns.map(column => {
          const cards = at(column);
          const full = wip > 0 && cards.length > wip;
          return (
            <div
              key={column}
              className={`kcol ${tintFor(column)}${over === column ? ' over' : ''}`}
              onDragOver={e => { e.preventDefault(); setOver(column); }}
              onDragLeave={() => setOver(o => (o === column ? undefined : o))}
              onDrop={e => {
                e.preventDefault();
                const issue = drag.current;
                drag.current = undefined;
                setDragging(undefined);
                setOver(undefined);
                if (!issue) return;
                const from = issue.dimensions[field.name.toLowerCase()] ?? '';
                if (from === column || column.startsWith('No ')) return;
                onMove({ issue, from, to: column });
              }}
            >
              <div className="kh">
                <span className={`st ${statusClass(column)}`}><b />{column}</span>
                <span className="n">
                  {cards.length}
                  {dragging && over === column ? ` → ${cards.length + 1}` : ''}
                </span>
              </div>

              {/* 06B — the limit is a fact on the wall, not a rule */}
              {wip > 0 && (
                <div className="wip">
                  <span className="track">
                    <i style={{
                      width: `${Math.min(100, (cards.length / wip) * 100)}%`,
                      background: full ? 'var(--dk-red)' : 'var(--dk-green)',
                    }} />
                  </span>
                  <span style={{ color: full ? 'var(--dk-red)' : undefined }}>
                    {cards.length}/{wip}
                  </span>
                </div>
              )}

              {cards.map(issue => (
                <Card
                  key={issue.number}
                  issue={issue}
                  colourBy={colourBy}
                  dimensions={dimensions}
                  pending={pending.get(issue.number)}
                  onOpen={onOpen}
                  onDragStart={() => { drag.current = issue; setDragging(issue); }}
                />
              ))}

              {over === column && dragging && <div className="slot" />}
              {cards.length === 0 && over !== column && (
                <div className="drop">drop here to set {field.name}</div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** The mock's own status colours, by what the column is called. */
function statusClass(name: string): string {
  if (/progress|doing|active/i.test(name)) return 'st-prog';
  if (/review|qa|verify/i.test(name)) return 'st-review';
  if (/block|hold|wait/i.test(name)) return 'st-block';
  if (/done|closed|ship/i.test(name)) return 'st-done';
  return 'st-todo';
}

function Card({ issue, colourBy, dimensions, pending, onOpen, onDragStart }: {
  issue: BoardIssue;
  colourBy?: string;
  dimensions: ProposedDimension[];
  pending?: string;
  onOpen: (issue: BoardIssue) => void;
  onDragStart: () => void;
}) {
  const colour = colourBy ? issue.dimensions[colourBy] : undefined;
  const options = dimensions.find(d => d.dimension === colourBy)?.options;
  const urgent = colour && options ? options.indexOf(colour) === 0 : false;
  const who = issue.assignees[0];

  return (
    <div
      className="kcard"
      draggable
      data-issue={issue.number}
      title={pending ? `Writing ${pending}…` : issue.title}
      style={{
        opacity: pending ? 0.6 : issue.state === 'CLOSED' ? 0.62 : 1,
        cursor: 'grab',
        borderColor: urgent
          ? 'color-mix(in srgb, var(--dk-red) 42%, transparent)'
          : undefined,
      }}
      onDragStart={onDragStart}
      onClick={() => onOpen(issue)}
    >
      <div className="t">{issue.title}</div>
      <div className="f">
        {colour && <Chip value={colour} field={colourBy!} dimensions={dimensions} />}
        <span className="sp" />
        {pending && <span className="chip c-stale">writing</span>}
        {!pending && issue.quietDays >= 14 && (
          <span className="chip c-stale">{issue.quietDays}d</span>
        )}
        {who
          ? <span className={avClass(who)} title={who}>{who[0].toUpperCase()}</span>
          : <span style={{ color: 'var(--dk-amber)', fontSize: 11.4 }}>unassigned</span>}
      </div>
    </div>
  );
}

function Chip({ value, field, dimensions }: {
  value: string;
  field: string;
  dimensions: ProposedDimension[];
}) {
  const options = dimensions.find(d => d.dimension === field)?.options;
  if (field === 'priority') {
    return <span className={prClass(value, options)} title={value}><b /></span>;
  }
  const { className, style } = chipOf(value, options);
  return <span className={className} style={style}>{value}</span>;
}

/** The bar under the columns, for the two things 06 lets you choose. */
export function GhColumnControls({ fields, field, onField, colourBy, options, onColour, wip, onWip }: {
  fields: ProjectField[];
  field?: ProjectField;
  onField: (name: string) => void;
  colourBy?: string;
  options: ProposedDimension[];
  onColour: (dimension: string) => void;
  wip: number;
  onWip: (n: number) => void;
}) {
  return (
    <>
      {fields.length > 1 && (
        <select className="pill" value={field?.name ?? ''}
                onChange={e => onField(e.target.value)}>
          {fields.map(f => <option key={f.id} value={f.name}>Columns: {f.name}</option>)}
        </select>
      )}
      {options.length > 0 && (
        <select className="pill" value={colourBy ?? ''} onChange={e => onColour(e.target.value)}>
          <option value="">Colour: nothing</option>
          {options.map(o => (
            <option key={o.dimension} value={o.dimension}>Colour: {o.heading}</option>
          ))}
        </select>
      )}
      <button
        type="button"
        className={`pill${wip > 0 ? ' on' : ''}`}
        title="A count on the wall, not a rule — nothing is prevented"
        onClick={() => onWip(wip > 0 ? 0 : 5)}
      >
        <Ico name="task" />{wip > 0 ? `WIP ${wip}` : 'WIP limit'}
      </button>
      {wip > 0 && (
        <span style={{ display: 'inline-flex', gap: 3 }}>
          {[3, 5, 8].map(n => (
            <button key={n} type="button" className={`pill${wip === n ? ' on' : ''}`}
                    style={{ padding: '2px 8px' }} onClick={() => onWip(n)}>
              {n}
            </button>
          ))}
        </span>
      )}
    </>
  );
}
