/**
 * Screen 07 — the roadmap.
 *
 * Start date to target date on one scale, with today marked. The question it
 * answers is the one a status call opens with: what was meant to land this
 * week, and what has already slipped.
 *
 * **A bar past today is hatched red**, not merely late-coloured. Overdue is the
 * only thing on this screen anybody is looking for, and a solid red bar reads
 * as a category — the hatch reads as a warning, which is what it is.
 *
 * **07A — drag to reschedule, and see the date before you drop.** Dragging the
 * body moves both ends; dragging an end moves one. Either way the tooltip says
 * the date it would write, because a gesture that snaps to a grid and then
 * writes something you never read is how a roadmap ends up quietly wrong.
 *
 * **07B — lanes, and who is overloaded.** The rows group by whatever dimension
 * you pick, so "everything of mine, in order" is one click. The lane heading
 * counts, because a lane with nine bars in one fortnight is the thing this view
 * is for.
 *
 * **07C — dependencies, and the dates that contradict them.** GitHub's own
 * sub-issues are the dependency graph it actually has, so those are what is
 * drawn: a line from parent to child, and a **red** one where the child is due
 * after the parent it is supposed to unblock. That contradiction is invisible
 * on github.com and obvious here.
 *
 * **07D — milestones as bands.** A release date is a vertical line everything
 * else is read against; a milestone with issues past it is one nobody has
 * re-dated.
 *
 * **07E — what the dates used to say.** GitHub keeps no history of a Project
 * field, so this shows what *dkgh has watched happen* — and says so. A partial
 * record that admits it is partial beats an invented one.
 *
 * **An issue with no dates is not on the chart.** It is counted underneath,
 * with a way to see which — a row with no bar is a row that teaches nobody
 * anything, and there are usually more of them than of the ones with dates.
 */
import { useMemo, useRef, useState } from 'react';
import { chipOf } from './GhCards';
import { Ico } from './GhIcons';
import { GhNote } from './GhShell';
import {
  absentBecause, slipDays, type ProjectBoard, type ProjectField, type Slip,
} from './project-store';
import type { BoardIssue, ProposedDimension } from './board-types';

const DAY = 86_400_000;

/** How wide the window is, in days, for each of the three scales. */
const SPAN = { week: 21, month: 90, quarter: 270 } as const;
export type Scale = keyof typeof SPAN;

export interface Reschedule {
  issue: BoardIssue;
  field: ProjectField;
  date: string;
}

export function GhRoadmap({
  issues, project, start, end, scale, colourBy, laneBy, dimensions, milestones, slips,
  onOpen, onReschedule, pending,
}: {
  issues: BoardIssue[];
  project: ProjectBoard | null;
  /** The date field a bar begins at. */
  start?: ProjectField;
  /** The date field it ends at. */
  end?: ProjectField;
  scale: Scale;
  colourBy?: string;
  /** 07B — the dimension the rows group by, or nothing for one list. */
  laneBy?: string;
  dimensions: ProposedDimension[];
  /** 07D — the repository's own milestones, for the bands. */
  milestones: { title: string; dueOn?: string }[];
  /** 07E — the date changes dkgh has watched happen. */
  slips: Slip[];
  onOpen: (issue: BoardIssue) => void;
  /** 07A — the drop. One field, one date. */
  onReschedule: (change: Reschedule) => void;
  pending: Map<number, string>;
}) {
  const [drag, setDrag] = useState<
    { number: number; edge: 'start' | 'end' | 'both'; days: number } | undefined
  >();
  const track = useRef<HTMLDivElement>(null);

  const today = Date.now();
  const from = useMemo(
    () => startOfDay(today - SPAN[scale] * DAY * 0.35),
    [today, scale],
  );
  const days = SPAN[scale];
  const to = from + days * DAY;

  /* Only what can be placed. The rest is counted below rather than drawn as a
     row with nothing in it. */
  const placed = useMemo(() => issues
    .map(issue => {
      const a = start ? parse(issue.dimensions[start.name.toLowerCase()]) : undefined;
      const b = end ? parse(issue.dimensions[end.name.toLowerCase()]) : undefined;
      if (a === undefined && b === undefined) return undefined;
      /* One end is enough to place something: an issue with only a target is
         still a thing due on a date, and hiding it would hide the ones most
         worth seeing. */
      const left = a ?? (b as number) - 3 * DAY;
      const right = b ?? (a as number) + 3 * DAY;
      return { issue, left, right: Math.max(right, left + DAY) };
    })
    .filter((r): r is { issue: BoardIssue; left: number; right: number } => !!r)
    .filter(r => r.right >= from && r.left <= to)
    .sort((x, y) => x.left - y.left), [issues, start, end, from, to]);

  const missing = issues.length - placed.length;

  /* 07B — one unnamed lane when nothing is chosen, so the markup is the same
     either way. */
  const lanes = useMemo(() => {
    if (!laneBy) return [{ name: '', rows: placed }];
    const known = dimensions.find(d => d.dimension === laneBy)?.options ?? [];
    const groups = new Map<string, typeof placed>();
    for (const row of placed) {
      const key = row.issue.dimensions[laneBy] || `No ${laneBy}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const order = [...known, ...[...groups.keys()].filter(k => !known.includes(k))];
    return order.filter(k => groups.has(k)).map(name => ({ name, rows: groups.get(name)! }));
  }, [placed, laneBy, dimensions]);

  /*
    07C — the dependencies GitHub actually has.

    Sub-issues, not an invented "blocked by" field: a parent that ends before a
    child it is waiting on is a contradiction somebody should look at, and it
    is invisible on github.com.
  */
  const ends = useMemo(
    () => new Map(placed.map(r => [r.issue.number, r.right])),
    [placed],
  );
  const links = useMemo(() => {
    const out: { from: number; to: number; late: boolean }[] = [];
    for (const item of project?.items ?? []) {
      const parentEnd = ends.get(item.number);
      if (parentEnd === undefined) continue;
      for (const child of item.tracks) {
        const childEnd = ends.get(child.number);
        if (childEnd === undefined) continue;
        out.push({ from: item.number, to: child.number, late: childEnd > parentEnd });
      }
    }
    return out;
  }, [project, ends]);
  const lateLinks = links.filter(l => l.late);

  /* 07D — the milestones inside the window, as lines to read against. */
  const bands = useMemo(() => milestones
    .map(m => ({ title: m.title, at: m.dueOn ? Date.parse(m.dueOn) : NaN }))
    .filter(m => Number.isFinite(m.at) && m.at >= from && m.at <= to), [milestones, from, to]);

  /* 07E — what this app has watched move, newest first. */
  const watched = useMemo(() => [...slips].reverse().slice(0, 8), [slips]);

  if (!start && !end) {
    return (
      <div style={{ padding: '16px 19px' }}>
        <GhNote title="No dates to place anything on" tone="warn" style={{ maxWidth: 'none',
                                                                           margin: 0 }}>
          {absentBecause(project)
            || 'The linked Project declares no date field, so there is nothing to build a '
              + 'timeline from. A Start date and a Target date on the Project are what fill '
              + 'this in.'}
        </GhNote>
      </div>
    );
  }

  const at = (ms: number) => ((ms - from) / (to - from)) * 100;

  /** Where a pointer is, in days from the window's start. */
  const dayAt = (clientX: number): number => {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    return Math.round(((clientX - box.left) / box.width) * days);
  };

  return (
    <div className="tl">
      <div className="tl-months">
        <span style={{ padding: '5px 12px', fontSize: 11.4, letterSpacing: '.09em',
                       textTransform: 'uppercase', color: 'var(--dk-faint)' }}>
          {new Date(from).getUTCFullYear()}
        </span>
        <div className="tl-scale">
          {months(from, to).map(m => (
            <span key={m.label} style={{ gridColumn: `span ${m.span}` }}>{m.label}</span>
          ))}
        </div>
      </div>

      <div className="tl-rows" ref={track}>
        {lanes.map(lane => (
        <div key={lane.name || 'all'}>
        {lane.name && (
          <div className="fh" style={{ padding: '10px 14px 4px' }}>
            {lane.name}
            <span className="n">{lane.rows.length}</span>
          </div>
        )}
        {lane.rows.map(({ issue, left, right }) => {
          const shift = drag?.number === issue.number ? drag.days * DAY : 0;
          const a = left + (drag?.edge === 'end' ? 0 : shift);
          const b = right + (drag?.edge === 'start' ? 0 : shift);
          const late = b < today && issue.state === 'OPEN';
          const colour = colourBy ? issue.dimensions[colourBy] : undefined;
          const chip = colour
            ? chipOf(colour, dimensions.find(d => d.dimension === colourBy)?.options)
            : undefined;

          return (
            <div className="tl-row" key={issue.number}>
              <div className="lbl" onClick={() => onOpen(issue)} style={{ cursor: 'pointer' }}>
                <span className="n">#{issue.number}</span>
                <span className="t">{issue.title}</span>
                {pending.get(issue.number) && <span className="chip c-stale">writing</span>}
              </div>
              <div className="tl-track">
                <div className="grid">
                  {Array.from({ length: 12 }).map((_, i) => <i key={i} />)}
                </div>
                {at(today) >= 0 && at(today) <= 100 && (
                  <span className="today" style={{ left: `${at(today)}%` }} />
                )}
                {/* 07D — a release date is a line everything is read against */}
                {bands.map(band => (
                  <span
                    key={band.title}
                    title={`${band.title} — ${iso(band.at)}`}
                    style={{
                      position: 'absolute', top: 0, bottom: 0, width: 1,
                      left: `${at(band.at)}%`,
                      background: 'color-mix(in srgb, var(--dk-blue) 55%, transparent)',
                    }}
                  />
                ))}
                <div
                  className={`bar${late ? ' over' : ''}`}
                  title={`${iso(a)} → ${iso(b)}`}
                  style={{
                    left: `${at(a)}%`,
                    width: `${Math.max(1.5, at(b) - at(a))}%`,
                    background: late ? undefined : chip?.style?.color ?? 'var(--dk-blue)',
                    cursor: 'grab',
                  }}
                  onPointerDown={e => {
                    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const edge = e.clientX - box.left < 8 ? 'start'
                      : box.right - e.clientX < 8 ? 'end'
                      : 'both';
                    const at0 = dayAt(e.clientX);
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    setDrag({ number: issue.number, edge, days: 0 });
                    (e.currentTarget as HTMLElement).dataset.from = String(at0);
                  }}
                  onPointerMove={e => {
                    if (drag?.number !== issue.number) return;
                    const at0 = Number((e.currentTarget as HTMLElement).dataset.from ?? 0);
                    setDrag({ ...drag, days: dayAt(e.clientX) - at0 });
                  }}
                  onPointerUp={e => {
                    if (drag?.number !== issue.number) { setDrag(undefined); return; }
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                    const moved = drag.days;
                    setDrag(undefined);
                    if (moved === 0) { onOpen(issue); return; }
                    /*
                      One field per drop. `gh project item-edit` takes one value
                      per invocation for a real issue, so a both-ends move that
                      pretended to be atomic would be two writes wearing one
                      gesture. The end is the one people mean.
                    */
                    if (drag.edge !== 'start' && end) {
                      onReschedule({ issue, field: end, date: iso(right + moved * DAY) });
                    } else if (start) {
                      onReschedule({ issue, field: start, date: iso(left + moved * DAY) });
                    }
                  }}
                >
                  {drag?.number === issue.number ? iso(drag.edge === 'start' ? a : b) : issue.title}
                </div>
                {/* 07C — a mark where this bar's children end after it does */}
                {links.filter(l => l.from === issue.number && l.late).map(l => (
                  <span
                    key={l.to}
                    title={`#${l.to} is due after #${l.from}, which is waiting on it`}
                    style={{
                      position: 'absolute', top: 4, left: `calc(${at(b)}% + 3px)`,
                      fontSize: 11.4, color: 'var(--dk-red)', fontFamily: 'var(--mono)',
                    }}
                  >
                    →#{l.to}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        </div>
        ))}

        {placed.length === 0 && (
          <div className="sub" style={{ padding: '14px 19px' }}>
            Nothing in this window has a date on it. Widen the scale, or set a{' '}
            {end?.name ?? start?.name} on the Project.
          </div>
        )}
      </div>

      {/* 07C — said once, under the chart, with the pairs */}
      {lateLinks.length > 0 && (
        <div className="note" style={{ maxWidth: 'none', margin: '12px 19px 0' }}>
          <Ico name="warn" style={{ color: 'var(--dk-red)' }} />
          <div>
            <b>
              {lateLinks.length} sub-issue{lateLinks.length === 1 ? '' : 's'} due after the
              issue waiting on {lateLinks.length === 1 ? 'it' : 'them'}.
            </b>{' '}
            {lateLinks.slice(0, 4).map(l => (
              <code key={`${l.from}-${l.to}`} style={{ marginRight: 6 }}>
                #{l.to} → #{l.from}
              </code>
            ))}
            {' '}These are GitHub&rsquo;s own sub-issues; the contradiction is not visible on
            github.com, which is the only reason to draw a roadmap rather than read a list.
          </div>
        </div>
      )}

      {/* 07E — what dkgh has watched, and what it cannot know */}
      {watched.length > 0 && (
        <div style={{ padding: '12px 19px 0' }}>
          <div className="fl" style={{ marginBottom: 6 }}>What the dates used to say</div>
          <div className="opt" style={{ gap: 2, padding: 4 }}>
            {watched.map(slip => {
              const days = slipDays(slip);
              return (
                <div key={`${slip.number}-${slip.at}-${slip.field}`} className="fct"
                     style={{ cursor: 'default' }}>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--dk-gh)' }}>
                    #{slip.number}
                  </span>
                  <span>{slip.field}</span>
                  <span className="sub">
                    {slip.from || 'unset'} → {slip.to || 'unset'}
                  </span>
                  <span className="n" style={{
                    color: days > 0 ? 'var(--dk-red)' : days < 0 ? 'var(--dk-green)' : undefined,
                  }}>
                    {days > 0 ? `+${days}d` : days < 0 ? `${days}d` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="sub" style={{ marginTop: 6 }}>
            GitHub keeps no history of a Project field, so this is what <b>dkgh has watched
            happen</b> while it was pointed at this repository — not the full story, and it
            says so rather than inventing the rest.
          </div>
        </div>
      )}

      {missing > 0 && (
        <div className="sub" style={{ padding: '10px 19px 0' }}>
          {missing} issue{missing === 1 ? '' : 's'} {missing === 1 ? 'has' : 'have'} no{' '}
          {[start?.name, end?.name].filter(Boolean).join(' or ')} and{' '}
          {missing === 1 ? 'is' : 'are'} not on the chart. A row with no bar teaches nobody
          anything, and there are usually more of them than of the ones with dates.
        </div>
      )}
    </div>
  );
}

/** The month bands across the top, sized by how much of the window each takes. */
function months(from: number, to: number): { label: string; span: number }[] {
  const out: { label: string; span: number }[] = [];
  const total = (to - from) / DAY;
  let at = from;
  while (at < to) {
    const d = new Date(at);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    const end = Math.min(next, to);
    const share = ((end - at) / DAY / total) * 12;
    out.push({
      label: d.toLocaleString(undefined, { month: 'long', timeZone: 'UTC' }),
      span: Math.max(1, Math.round(share)),
    });
    at = end;
  }
  /* The grid is twelve columns; rounding has to add up to twelve or the last
     band runs off the end. */
  const sum = out.reduce((a, b) => a + b.span, 0);
  if (out.length && sum !== 12) out[out.length - 1].span += 12 - sum;
  return out.filter(m => m.span > 0);
}

function parse(value?: string): number | undefined {
  if (!value) return undefined;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : undefined;
}

function startOfDay(at: number): number {
  const d = new Date(at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function iso(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}
