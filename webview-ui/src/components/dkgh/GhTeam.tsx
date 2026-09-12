/**
 * Who is carrying what.
 *
 * The board answers "what is the state of this repository". This answers the
 * question a lead actually asks at a standup — who has what, and what has
 * nobody — and it is a screen rather than a filter because the shape of that
 * answer is a list of people.
 *
 * People down the left with a count and a load bar, that person's issues on the
 * right. Unassigned is a row like any other, at the bottom, because it is the
 * pile to clear and the one a "group by assignee" would bury.
 *
 * ── Why a sheet and not a page ──
 *
 * Opening an issue here does not leave. `SheetView` slides it in off the right
 * and you throw it back out — so reading six issues in a row costs six flicks
 * rather than six round trips through a board that re-sorts itself each time
 * you come back. The lane you were on, the person you were reading about and
 * the scroll position are all still there because nothing ever unmounted.
 */
import { useMemo, useState } from 'react';
import { SheetView } from '@salilvnair/dui';
import { Ico } from './GhIcons';
import { GhAvatar } from './GhAvatar';
import { GhIssue } from './GhIssue';
import { avClass, chipOf, prClass } from './GhCards';
import { Dk, GhNote } from './GhShell';
import { sinceIso } from './format';
import { NOBODY, laneOf, laneToShow, lanesOf, loadPercent } from './team-model';
import type { BoardIssue, ProposedDimension } from './board-types';
import type { ProjectBoard, ProjectField } from './project-store';
import type { RepoMeta } from './types';

export function GhTeam({
  repo, issues, dimensions, meta, project, me, end, writingProject,
  onWriteProject, onWrote, onReference,
}: {
  repo: string;
  issues: BoardIssue[];
  dimensions: ProposedDimension[];
  meta?: RepoMeta;
  project?: ProjectBoard | null;
  me?: string;
  end?: ProjectField;
  writingProject?: string;
  onWriteProject?: (field: ProjectField, value: string, optionId?: string) => void;
  onWrote: () => void;
  onReference: (seed: string) => void;
}) {
  const [picked, setPicked] = useState<string | undefined>();
  /** The issue in the sheet, by number — so a refresh cannot leave a stale copy. */
  const [open, setOpen] = useState<number | undefined>();

  const lanes = useMemo(() => lanesOf(issues), [issues]);
  const who = laneToShow(lanes, picked);
  const lane = laneOf(lanes, who);
  const showing = open === undefined ? undefined : issues.find(i => i.number === open);

  if (lanes.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: 14 }}>
        <GhNote title="Nobody has anything" icon="person">
          There are no issues on this board to share out. Whatever the filters above are
          doing, they are doing it to everything.
        </GhNote>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
      {/* The people */}
      <div className="ghteam-rail">
        <div className="paneh"><Ico name="person" />Assignees</div>
        {lanes.map(l => (
          <button
            key={l.who}
            type="button"
            className={`ghteam-row${l.who === who ? ' on' : ''}`}
            onClick={() => { setPicked(l.who); setOpen(undefined); }}
          >
            {l.who === NOBODY
              ? <span className="av av-none"><Ico name="person" /></span>
              : <GhAvatar who={l.who} className={avClass(l.who)} />}
            <span className="ghteam-t">
              <b>{l.label}</b>
              {/* The bar is against the busiest lane, not the total — see
                  `loadPercent`. Five people with four each read as level. */}
              <span className="ghteam-bar">
                <i style={{ width: `${loadPercent(l, lanes)}%` }} />
              </span>
            </span>
            <span className="ghteam-n">{l.issues.length}</span>
          </button>
        ))}
      </div>

      {/* What that person has */}
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
        <div className="paneh" style={{ position: 'sticky', top: 0, zIndex: 2 }}>
          <Ico name="issue" />
          {lane?.label ?? 'Nobody'}
          <span className="sp" style={{ flex: 1 }} />
          <span className="sub">
            {lane?.issues.length ?? 0} issue{lane?.issues.length === 1 ? '' : 's'}
          </span>
        </div>

        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 46 }}>#</th>
              <th>Title</th>
              <th style={{ width: 120 }}>Status</th>
              <th style={{ width: 110 }}>Priority</th>
              <th style={{ width: 72 }}>Age</th>
            </tr>
          </thead>
          <tbody>
            {(lane?.issues ?? []).map(i => (
              <tr key={i.number}
                  className={open === i.number ? 'on' : undefined}
                  onClick={() => setOpen(i.number)}
                  style={{ cursor: 'pointer' }}>
                <td className="num">{i.number}</td>
                <td><b>{i.title}</b></td>
                <td><Dim value={i.dimensions.status} field="Status" dimensions={dimensions} /></td>
                <td><Dim value={i.dimensions.priority} field="Priority" dimensions={dimensions} /></td>
                <td className="num">{sinceIso(i.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {(lane?.issues.length ?? 0) === 0 && (
          <div className="sub" style={{ padding: 14 }}>Nothing on this one.</div>
        )}
      </div>

      {/*
        The issue itself, off the right edge.

        `GhIssue` unchanged — the same screen the board opens, in a sheet
        instead of in place of the board. `onBack` is what the × and the drag
        both end at, so the three ways out agree.
      */}
      <SheetView
        open={!!showing}
        onClose={() => setOpen(undefined)}
        edge="right"
        size="min(980px, 82vw)"
        className="ghsheet"
      >
        {/*
          `Dk`, not `className="dkgh"` on the panel.

          The sheet portals to `document.body`, so it needs the palette — but
          `.dkgh` is the tab's *root* rule and carries `flex: 1 1 0%` with it.
          On the panel that beat `SheetView`'s own `flex: none` (same
          specificity, dkgh's stylesheet loads second) and the sheet filled the
          window. `Dk` is `display: contents`: the palette, none of the layout.
        */}
        {showing && (
          <Dk>
          <GhIssue
            repo={repo}
            issue={showing}
            dimensions={dimensions}
            closed={issues.filter(i => i.state === 'CLOSED')}
            all={issues}
            end={end}
            meta={meta}
            project={project}
            me={me}
            writingProject={writingProject}
            onWriteProject={onWriteProject}
            onOpen={n => setOpen(n)}
            onBack={() => setOpen(undefined)}
            onReference={seed => { setOpen(undefined); onReference(seed); }}
            onWrote={onWrote}
          />
          </Dk>
        )}
      </SheetView>
    </div>
  );
}

/** One dimension's value in the board's own colour for it. */
function Dim({ value, field, dimensions }: {
  value?: string;
  field: string;
  dimensions: ProposedDimension[];
}) {
  if (!value) return <span style={{ color: 'var(--dk-faint)' }}>—</span>;
  const declared = dimensions.find(d => d.dimension.toLowerCase() === field.toLowerCase())?.options;
  if (/priority/i.test(field)) {
    return <span className={prClass(value, declared)}><b />{value}</span>;
  }
  const { className, style } = chipOf(value, declared);
  return <span className={className} style={style}>{value}</span>;
}
