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
 * **06C — lanes answer the other half.** Columns say *what state*; lanes say
 * *whose*, or *which module*. Together they answer the question a standup
 * actually opens with, which is neither of those on its own.
 *
 * **06D — the columns are arrangeable.** A Status field usually has more values
 * than anyone wants on screen at once, in an order somebody chose for a
 * different purpose. Hiding one does not hide its issues: they fall into the
 * lane for everything not shown, because a card that vanishes from a board is
 * how work gets forgotten.
 *
 * **06E — the board can disagree with GitHub**, and when it does it says so
 * rather than resolving it. A conflict is only a conflict on a card you also
 * changed; everything else just updates, because somebody else closing an issue
 * is news rather than a decision you have to make.
 */
import { useMemo, useRef, useState } from 'react';
import { Ico } from './GhIcons';
import { avClass, chipOf, prClass } from './GhCards';
import { GhNote } from './GhShell';
import {
  absentBecause, type Elsewhere, type ProjectBoard, type ProjectField,
} from './project-store';
import { sinceIso } from './format';
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
  issues, project, field, colourBy, laneBy, hidden, dimensions, wip,
  onOpen, onMove, pending, elsewhere, onKeepMine, onTakeTheirs,
}: {
  issues: BoardIssue[];
  project: ProjectBoard | null;
  /** The single-select the columns are, or undefined while there is none. */
  field?: ProjectField;
  /** The dimension the card edge is coloured by. */
  colourBy?: string;
  /** 06C — the dimension the lanes are, or nothing for one lane. */
  laneBy?: string;
  /** 06D — column values the reader has put away. */
  hidden: string[];
  dimensions: ProposedDimension[];
  /** 06B — how many a column is comfortable with. 0 is no limit. */
  wip: number;
  onOpen: (issue: BoardIssue) => void;
  /** 06A — the drop. The card has already moved; this writes it. */
  onMove: (move: Move) => void;
  /** Issues with a write in flight, so a card can say it is not settled. */
  pending: Map<number, string>;
  /** 06E — what moved on GitHub since this session last looked. */
  elsewhere: Elsewhere[];
  onKeepMine: (change: Elsewhere) => void;
  onTakeTheirs: () => void;
}) {
  const [dragging, setDragging] = useState<BoardIssue | undefined>();
  const [over, setOver] = useState<string | undefined>();
  const drag = useRef<BoardIssue | undefined>(undefined);

  const away = useMemo(() => new Set(hidden), [hidden]);

  const columns = useMemo(() => {
    if (!field) return [];
    const names = (field.options ?? []).map(o => o.name);
    /* A value the project no longer declares still has issues on it, and they
       are not nothing — an extra column is more honest than hiding them. */
    const extra = [...new Set(issues
      .map(i => i.dimensions[field.name.toLowerCase()])
      .filter((v): v is string => !!v && !names.includes(v)))];
    return [...names, ...extra, 'No ' + field.name.toLowerCase()]
      .filter(c => !away.has(c));
  }, [field, issues, away]);

  /*
    06C — the lanes.

    One unnamed lane when nothing is chosen, so the markup is the same either
    way and a board without lanes is not a different component.
  */
  const lanes = useMemo(() => {
    if (!laneBy) return [{ name: '', issues }];
    const known = dimensions.find(d => d.dimension === laneBy)?.options ?? [];
    const groups = new Map<string, BoardIssue[]>();
    for (const issue of issues) {
      const key = issue.dimensions[laneBy] || `No ${laneBy}`;
      groups.set(key, [...(groups.get(key) ?? []), issue]);
    }
    const order = [...known, ...[...groups.keys()].filter(k => !known.includes(k))];
    return order.filter(k => groups.has(k)).map(name => ({ name, issues: groups.get(name)! }));
  }, [issues, laneBy, dimensions]);

  const at = (rows: BoardIssue[], column: string) => {
    if (!field) return [];
    const key = field.name.toLowerCase();
    if (column.startsWith('No ')) {
      /* 06D — a hidden column's issues land here rather than vanishing. A
         card that disappears off a board is how work gets forgotten. */
      return rows.filter(i => !i.dimensions[key] || away.has(i.dimensions[key]));
    }
    return rows.filter(i => i.dimensions[key] === column);
  };

  /** 06E — the change on this card, if there is one. */
  const changed = useMemo(
    () => new Map(elsewhere.map(e => [e.number, e])),
    [elsewhere],
  );

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

      {/* 06E — what somebody else did while you were looking */}
      {elsewhere.length > 0 && (
        <div className="chiprow" style={{
          background: 'color-mix(in srgb, var(--dk-amber) 9%, transparent)',
        }}>
          <span className="lead" style={{ color: 'var(--dk-amber)' }}>Changed elsewhere</span>
          <span style={{ fontSize: 12.6, color: 'var(--dk-text)' }}>
            <b>
              {elsewhere.length} card{elsewhere.length === 1 ? '' : 's'} moved on GitHub since
              you last looked.
            </b>{' '}
            {elsewhere.some(e => e.mine)
              ? `${elsewhere.filter(e => e.mine).length} of them ${
                elsewhere.filter(e => e.mine).length === 1 ? 'is one' : 'are ones'} you touched.`
              : 'None is one you touched.'}
          </span>
          <span className="sp" />
          <button type="button" className="btn go" onClick={onTakeTheirs}>
            <Ico name="refresh" />Take theirs
          </button>
        </div>
      )}

      {lanes.map(lane => (
      <div key={lane.name || 'all'}>
      {lane.name && (
        <div className="fh" style={{ padding: '10px 19px 0' }}>
          {lane.name}
          <span className="n">{lane.issues.length}</span>
        </div>
      )}
      <div
        className="kan"
        style={{
          gridTemplateColumns: `repeat(${Math.min(6, columns.length)}, minmax(0, 1fr))`,
          paddingTop: lane.name ? 8 : undefined,
          paddingBottom: lane.name ? 10 : undefined,
        }}
        onDragEnd={() => { drag.current = undefined; setDragging(undefined); setOver(undefined); }}
      >
        {columns.map(column => {
          const cards = at(lane.issues, column);
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
                  moved={changed.get(issue.number)}
                  onOpen={onOpen}
                  onKeepMine={onKeepMine}
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
      </div>
      ))}
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

function Card({
  issue, colourBy, dimensions, pending, moved, onOpen, onKeepMine, onDragStart,
}: {
  issue: BoardIssue;
  colourBy?: string;
  dimensions: ProposedDimension[];
  pending?: string;
  /** 06E — what moved on this card, on GitHub, since this session looked. */
  moved?: Elsewhere;
  onOpen: (issue: BoardIssue) => void;
  onKeepMine: (change: Elsewhere) => void;
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
        /* A card somebody else moved is amber whether or not it is a conflict;
           the difference is that a conflict offers a choice. */
        borderColor: moved
          ? 'color-mix(in srgb, var(--dk-amber) 55%, transparent)'
          : urgent
            ? 'color-mix(in srgb, var(--dk-red) 42%, transparent)'
            : undefined,
        background: moved
          ? 'color-mix(in srgb, var(--dk-amber) 8%, transparent)'
          : undefined,
      }}
      onDragStart={onDragStart}
      onClick={() => onOpen(issue)}
    >
      <div className="t">{issue.title}</div>

      {/* 06E — said on the card, by name, because that is where it matters */}
      {moved && (
        <>
          <div className="f" style={{ color: 'var(--dk-amber)' }}>
            <Ico name="warn" />
            {moved.by ? `${moved.by} moved this` : 'This moved'} to {moved.now}
            {moved.at ? `, ${sinceIso(moved.at)}` : ''}
          </div>
          {moved.mine && (
            <div className="f">
              <button
                type="button"
                className="btn"
                style={{ padding: '2px 7px', fontSize: 11.4 }}
                title={`Put it back to ${moved.was}`}
                onClick={e => { e.stopPropagation(); onKeepMine(moved); }}
              >
                Keep mine
              </button>
              <span className="sub">theirs is showing</span>
            </div>
          )}
        </>
      )}

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
export function GhColumnControls({
  fields, field, onField, colourBy, options, onColour, laneBy, onLane,
  hidden, onHidden, wip, onWip,
}: {
  fields: ProjectField[];
  field?: ProjectField;
  onField: (name: string) => void;
  colourBy?: string;
  options: ProposedDimension[];
  onColour: (dimension: string) => void;
  /** 06C. */
  laneBy?: string;
  onLane: (dimension: string) => void;
  /** 06D. */
  hidden: string[];
  onHidden: (hidden: string[]) => void;
  wip: number;
  onWip: (n: number) => void;
}) {
  const [arranging, setArranging] = useState(false);
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
      {options.length > 0 && (
        <select className="pill" value={laneBy ?? ''} onChange={e => onLane(e.target.value)}>
          <option value="">Lanes: none</option>
          {options.map(o => (
            <option key={o.dimension} value={o.dimension}>Lanes: {o.heading}</option>
          ))}
        </select>
      )}
      {/* 06D — arranging the columns */}
      {field && (
        <span style={{ position: 'relative' }}>
          <button type="button" className={`pill${hidden.length ? ' on' : ''}`}
                  onClick={() => setArranging(a => !a)}>
            <Ico name="board" />
            {hidden.length ? `${hidden.length} hidden` : 'Arrange'}
          </button>
          {arranging && (
            <>
              <span className="fixed inset-0" style={{ zIndex: 20 }}
                    onClick={() => setArranging(false)} />
              <div
                className="opt"
                style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 21,
                         width: 230, gap: 2, padding: 5,
                         boxShadow: '0 10px 28px rgba(0,0,0,.45)' }}
              >
                <div className="fl">Columns on this board</div>
                {(field.options ?? []).map(o => {
                  const on = !hidden.includes(o.name);
                  return (
                    <div
                      key={o.id}
                      className={`fct${on ? ' on' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onHidden(on
                        ? [...hidden, o.name]
                        : hidden.filter(h => h !== o.name))}
                    >
                      <span className="bx">{on && <Ico name="check" />}</span>
                      {o.name}
                    </div>
                  );
                })}
                <div className="fct" style={{ display: 'block', cursor: 'default',
                                              color: 'var(--dk-faint)', lineHeight: 1.5 }}>
                  Hiding a column does not hide its issues — they fall into the last one, so
                  nothing drops off the board.
                </div>
              </div>
            </>
          )}
        </span>
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
