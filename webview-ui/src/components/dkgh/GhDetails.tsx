/**
 * The issue page's right rail, which edits.
 *
 * It used to be nine read-only rows: you could see that an issue had no
 * assignee and no Status, and the only way to change either was github.com.
 * The composer's pane a click away is fully editable and looks identical,
 * which is the worst possible pairing — the same thing twice, one of which
 * silently does nothing.
 *
 * So this is the composer's pane, on an issue that already exists.
 *
 * ── Two write paths, because GitHub has two ──
 *
 * Labels, assignees and the milestone are fields on the issue: they go through
 * the board's own plan-and-confirm flow, which builds the exact `gh issue edit`
 * and shows it before running anything. Status, Priority and the rest are
 * fields on a **Projects v2 item**, not on the issue at all, and they are
 * written by `gh project item-edit` addressed by node id — the same call the
 * columns board's drag makes.
 *
 * The reader is not asked to care which is which. What they see is the
 * difference that is real: a Project field writes immediately, the way a drag
 * does, and an issue field shows the command first because it is a batchable
 * write with a confirm screen already built for it.
 *
 * ── Nothing is proposed twice ──
 *
 * Each pick stages one change and shuts the panel. A pane that let somebody
 * tick four labels and then forget to confirm is a pane whose state disagrees
 * with the repository, and the confirm strip is at the foot of the page where
 * a half-made change is easy to miss.
 *
 * ── It looks like github.com because it is the same interaction ──
 *
 * A gear on the heading, a panel under it with a filter box and checkboxes, a
 * click elsewhere to dismiss. Everybody using this tab already knows that from
 * the site. See `GhPicker`.
 */
import { avClass, chipOf, prClass } from './GhCards';
import { Ico } from './GhIcons';
import { GhAvatar } from './GhAvatar';
import { GhPicker, type Choice } from './GhPicker';
import type { EditFlow } from './edit-flow';
import type { ProjectBoard, ProjectField } from './project-store';
import type { BoardIssue, ProposedDimension } from './board-types';
import type { RepoMeta } from './types';

export function GhDetails({
  repo, issue, meta, project, dimensions, flow, writing, onWriteProject,
}: {
  repo: string;
  issue: BoardIssue;
  meta?: RepoMeta;
  project?: ProjectBoard | null;
  dimensions: ProposedDimension[];
  flow: EditFlow;
  /** What a Project write is claiming right now, while it is in flight. */
  writing?: string;
  onWriteProject?: (field: ProjectField, value: string, optionId?: string) => void;
}) {
  const item = project?.items.find(i => i.number === issue.number);
  /* Single-selects only. A date or a number is a Project field, but it is not
     a list somebody picks from, and the roadmap is where dates are moved. */
  const selects = (project?.fields ?? []).filter(f => f.dataType === 'SINGLE_SELECT');

  const labelChoices: Choice[] = (meta?.labels ?? []).map(l => ({
    value: l.name, note: l.description, swatch: `#${l.color}`,
  }));

  return (
    <>
      <GhPicker
        label="Assignees"
        title="Select assignees"
        filterLabel="Filter assignees"
        empty="dkgh cannot list who can be assigned here."
        choices={(meta?.assignees ?? []).map(a => ({ value: a, avatar: avClass(a) }))}
        chosen={issue.assignees}
        value={issue.assignees.length
          ? issue.assignees.map(a => (
            <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {/* Their picture when there is one, the coloured letter until
                  there is — see `GhAvatar`. */}
              <GhAvatar who={a} className={avClass(a)} />{a}
            </span>
          ))
          : undefined}
        onPick={who => {
          const on = issue.assignees.includes(who);
          flow.propose(
            {
              repo,
              numbers: [issue.number],
              ...(on ? { removeAssignees: [who] } : { addAssignees: [who] }),
            },
            { field: 'assignee', value: on ? '' : who },
          );
        }}
      />

      <GhPicker
        label="Labels"
        title="Apply labels to this issue"
        filterLabel="Filter labels"
        empty="This repository has no labels."
        choices={labelChoices}
        chosen={issue.labels.map(l => l.name)}
        value={issue.labels.length
          ? issue.labels.map(l => (
            <span key={l.name} className="lbldot">
              <b style={{ background: `#${l.color}` }} />{l.name}
            </span>
          ))
          : undefined}
        onPick={name => {
          const on = issue.labels.some(l => l.name === name);
          flow.propose(
            {
              repo,
              numbers: [issue.number],
              ...(on ? { removeLabels: [name] } : { addLabels: [name] }),
            },
            { field: 'label', value: on ? '' : name },
          );
        }}
      />

      {/*
        Which Project this issue is in.

        github.com names it — "Projects: Test Project" — and dkgh drew its
        fields without ever saying whose they were. On a repository with one
        Project that is merely odd; on an account with several it means the
        Status you are looking at belongs to a board you cannot identify.

        A row you read rather than a picker: adding an issue to a Project or
        taking it out is a different write from setting a field on it, and
        `gh project item-add` is not a call dkgh makes.
      */}
      {project?.title && (
        <div className="msec">
          <div className="mh">Projects</div>
          <div className="val set">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Ico name="board" />
              {project.number ? (
                <a
                  href={`https://github.com/${project.repo.split('/')[0]}/projects/${project.number}`}
                  target="_blank"
                  rel="noreferrer"
                  className="textlink"
                >
                  {project.title}
                </a>
              ) : project.title}
            </span>
            {!item && (
              <span className="sub" style={{ display: 'block', marginTop: 2 }}>
                This issue is not on it.
              </span>
            )}
          </div>
        </div>
      )}

      {/*
        The Project's own fields.

        Absent on a repository with no Project rather than drawn as empty rows
        that cannot be filled — the columns board already says why, once, at
        the top of itself.
      */}
      {selects.map(field => {
        const current = item?.values[field.name] ?? '';
        return (
          <GhPicker
            key={field.name}
            label={field.name}
            title={`Set ${field.name}`}
            filterLabel={`Filter ${field.name.toLowerCase()}`}
            empty="That field has no options."
            single
            choices={(field.options ?? []).map(o => ({ value: o.name }))}
            chosen={current ? [current] : []}
            value={writing === field.name
              ? <span className="sub">saving…</span>
              : current
                ? <Value field={field.name} value={current} dimensions={dimensions}
                         options={(field.options ?? []).map(o => o.name)} />
                : undefined}
            onPick={name => {
              if (!item || !onWriteProject) return;
              /* Picking the value it already has is not a write. */
              if (name === current) return;
              const option = (field.options ?? []).find(o => o.name === name);
              onWriteProject(field, name, option?.id);
            }}
          />
        );
      })}

      <GhPicker
        label="Milestone"
        title="Set milestone"
        filterLabel="Filter milestones"
        empty="This repository has no open milestones."
        single
        choices={(meta?.milestones ?? []).map(m => ({
          value: m.title, note: m.dueOn ? `due ${m.dueOn.slice(0, 10)}` : undefined,
        }))}
        chosen={issue.milestone ? [issue.milestone] : []}
        value={issue.milestone || undefined}
        onPick={title => {
          const on = issue.milestone === title;
          flow.propose(
            /* `''` clears it; `undefined` would leave it alone. */
            { repo, numbers: [issue.number], milestone: on ? '' : title },
            { field: 'milestone', value: on ? '' : title },
          );
        }}
      />
    </>
  );
}

/** A value in the board's own colour for it — the read-only `Dim`, reused. */
function Value({ field, value, dimensions, options }: {
  field: string;
  value: string;
  dimensions: ProposedDimension[];
  options?: string[];
}) {
  const declared = options ?? dimensions.find(d => d.dimension === field)?.options;
  if (/priority/i.test(field)) {
    return <span className={prClass(value, declared)}><b />{value}</span>;
  }
  const { className, style } = chipOf(value, declared);
  return <span className={className} style={style}>{value}</span>;
}
