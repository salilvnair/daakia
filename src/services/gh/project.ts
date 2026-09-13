/**
 * The linked Project — what screens 06 and 07 are made of.
 *
 * Status, Priority, Start date and Target date are not on an issue. They are
 * fields on a Projects v2 board that the issue is an *item* of, and none of
 * them is in the REST API — which is why every screen in this tab that wanted
 * them has said "needs the project scope" and shown a dash.
 *
 * **One GraphQL call for the whole board.** The alternative — a `gh project
 * item-list` plus a field list plus a lookup per issue — is three shapes that
 * can disagree with each other and N round trips to fill a column view. This
 * asks for the project, its fields with their option ids, and every open
 * issue's item with its values, in one query.
 *
 * **The option ids come back with the values.** A drag has to write
 * `--single-select-option-id`, and an id that was looked up separately is an id
 * that can be stale by the time the drag lands. They arrive together.
 *
 * **A repository with no project is not an error.** It is the ordinary case,
 * and `fetchProject` says so quietly — the columns view then offers the
 * dimensions the repository does have rather than an empty board.
 */
import { run } from './gh';

export interface ProjectOption { id: string; name: string }

export interface ProjectField {
  id: string;
  name: string;
  /** `SINGLE_SELECT`, `DATE`, `NUMBER`, `TEXT`, `ITERATION`, … */
  dataType: string;
  options?: ProjectOption[];
}

export interface ProjectItem {
  /** The item's node id, which is what a write addresses. */
  id: string;
  number: number;
  /** Field name → the value as text. Dates are ISO, selects are the option. */
  values: Record<string, string>;
  /** Field name → the option id, for the single-selects a drag writes. */
  optionIds: Record<string, string>;
  /**
   * When each single-select last moved, and who moved it — 06E.
   *
   * GitHub carries this on the value itself, which is what lets a card say
   * "mkulkarni moved this 40s ago" rather than "this changed somehow". It is
   * only on the current value: there is no history here, and 07E does not
   * pretend otherwise.
   */
  movedAt: Record<string, string>;
  movedBy: Record<string, string>;
  /** Sub-issues, and the issue this one is a sub-issue of — 07C. */
  tracks: { number: number; title: string; state?: string }[];
  trackedIn: { number: number; title: string }[];
}

export interface ProjectBoard {
  repo: string;
  id?: string;
  number?: number;
  title?: string;
  fields: ProjectField[];
  items: ProjectItem[];
  /**
   * Every project this repository links, with how many issues sit on each.
   *
   * A board is built from one of them, but the reader has to be able to see
   * that there are others and switch — a team with a delivery board and a bug
   * board was previously shown one at random and told nothing about the rest.
   */
  available?: { id: string; number?: number; title?: string; items: number }[];
  /**
   * Why there is nothing here.
   *
   * `none` — the repository has no project, which is ordinary.
   * `scope` — the credential cannot read projects, which is fixable and says how.
   * A string — gh's own words for anything else.
   */
  absent?: 'none' | 'scope' | string;
}

const QUERY = `
query($owner:String!,$name:String!){
  repository(owner:$owner,name:$name){
    projectsV2(first:20){ nodes {
      id number title
      fields(first:50){ nodes {
        ... on ProjectV2FieldCommon { id name dataType }
        ... on ProjectV2SingleSelectField { id name options { id name } }
      } }
    } }
    issues(first:100, states:[OPEN,CLOSED], orderBy:{field:UPDATED_AT,direction:DESC}){ nodes {
      number
      trackedIssues(first:20){ nodes { number title state } }
      trackedInIssues(first:5){ nodes { number title } }
      projectItems(first:20){ nodes {
        id
        project { id }
        fieldValues(first:30){ nodes {
          ... on ProjectV2ItemFieldSingleSelectValue {
            name optionId updatedAt creator { login }
            field { ... on ProjectV2FieldCommon { name } }
          }
          ... on ProjectV2ItemFieldDateValue {
            date field { ... on ProjectV2FieldCommon { name } }
          }
          ... on ProjectV2ItemFieldNumberValue {
            number field { ... on ProjectV2FieldCommon { name } }
          }
          ... on ProjectV2ItemFieldTextValue {
            text field { ... on ProjectV2FieldCommon { name } }
          }
          ... on ProjectV2ItemFieldIterationValue {
            title startDate field { ... on ProjectV2FieldCommon { name } }
          }
        } }
      } }
    } }
  }
}`;

interface RawValue {
  name?: string;
  optionId?: string;
  date?: string;
  number?: number;
  text?: string;
  title?: string;
  startDate?: string;
  updatedAt?: string;
  creator?: { login?: string };
  field?: { name?: string };
}

interface RawAnswer {
  data?: {
    repository?: {
      projectsV2?: { nodes?: { id?: string; number?: number; title?: string;
        fields?: { nodes?: (ProjectField | Record<string, never>)[] } }[] };
      issues?: { nodes?: {
        number?: number;
        trackedIssues?: { nodes?: { number?: number; title?: string; state?: string }[] };
        trackedInIssues?: { nodes?: { number?: number; title?: string }[] };
        projectItems?: { nodes?: {
          id?: string;
          project?: { id?: string };
          fieldValues?: { nodes?: RawValue[] };
        }[] };
      }[] };
    };
  };
}

/** One field value, as a string a board can group and sort by. */
function textOf(v: RawValue): string | undefined {
  if (v.name !== undefined) return v.name;
  if (v.date !== undefined) return v.date;
  if (v.text !== undefined) return v.text;
  if (v.title !== undefined) return v.title;
  if (v.number !== undefined) return String(v.number);
  return undefined;
}

export async function fetchProject(
  repo: string,
  /** Which linked project to build from. Defaults to the most populated one. */
  preferProjectId?: string,
): Promise<ProjectBoard> {
  const [owner, name] = repo.split('/');
  const empty: ProjectBoard = { repo, fields: [], items: [] };
  if (!owner || !name) return { ...empty, absent: 'none' };

  const r = await run(
    ['api', 'graphql', '-f', `query=${QUERY}`, '-F', `owner=${owner}`, '-F', `name=${name}`],
    { timeoutMs: 45_000 },
  );

  if (!r.ok) {
    const said = (r.stderr || r.failure || '').trim();
    /*
      The scope is the one failure worth its own state. gh says
      "your token has not been granted the required scopes", and the screen
      that gets `scope` back can offer the one command that fixes it rather
      than showing somebody a GraphQL error.
    */
    if (/scope|INSUFFICIENT_SCOPES|read:project/i.test(said)) {
      return { ...empty, absent: 'scope' };
    }
    return { ...empty, absent: said || 'gh could not read the project.' };
  }

  let raw: RawAnswer;
  try {
    raw = JSON.parse(r.stdout) as RawAnswer;
  } catch {
    return { ...empty, absent: 'gh returned something that is not JSON.' };
  }

  /*
    A repository can link several projects, and taking the first was wrong.

    `projectsV2(first:1)` asked for one and this read `nodes[0]`, so a team
    with a delivery board and a bug board saw whichever GitHub happened to
    return first and no indication the other existed. Issues living only on
    the second one had no Status, no dates, and no row on the roadmap — they
    were simply absent, which is the worst way for data to be wrong.

    All of them are fetched now. `preferProjectId` picks, and without one the
    choice is the project the most issues actually sit on — a board somebody
    made once and abandoned should not outrank the one they use daily.
  */
  const all = (raw.data?.repository?.projectsV2?.nodes ?? []).filter(p => !!p?.id);
  if (all.length === 0) return { ...empty, absent: 'none' };

  const issueNodes = raw.data?.repository?.issues?.nodes ?? [];
  const population = new Map<string, number>();
  for (const issue of issueNodes) {
    for (const item of issue.projectItems?.nodes ?? []) {
      const id = item.project?.id;
      if (id) population.set(id, (population.get(id) ?? 0) + 1);
    }
  }

  const preferred = preferProjectId
    ? all.find(p => p.id === preferProjectId)
    : undefined;
  const busiest = [...all].sort((a, b) =>
    (population.get(b.id ?? '') ?? 0) - (population.get(a.id ?? '') ?? 0))[0];
  const project = preferred ?? busiest;
  if (!project?.id) return { ...empty, absent: 'none' };

  /* Every project the repository links, so the UI can offer the choice rather
     than silently making it. */
  const available = all.map(p => ({
    id: p.id ?? '',
    number: p.number,
    title: p.title,
    items: population.get(p.id ?? '') ?? 0,
  }));

  const fields = (project.fields?.nodes ?? [])
    .filter((f): f is ProjectField => !!(f as ProjectField)?.name)
    .map(f => ({ id: f.id, name: f.name, dataType: f.dataType, options: f.options }));

  const items: ProjectItem[] = [];
  for (const issue of issueNodes) {
    if (typeof issue.number !== 'number') continue;
    /* An issue can sit on several projects. This screen is about the one the
       repository links, so the others are not read into the board. */
    const item = (issue.projectItems?.nodes ?? []).find(i => i.project?.id === project.id);
    if (!item?.id) continue;

    const values: Record<string, string> = {};
    const optionIds: Record<string, string> = {};
    const movedAt: Record<string, string> = {};
    const movedBy: Record<string, string> = {};
    for (const v of item.fieldValues?.nodes ?? []) {
      const field = v.field?.name;
      if (!field) continue;
      const text = textOf(v);
      if (text !== undefined) values[field] = text;
      if (v.optionId) optionIds[field] = v.optionId;
      if (v.updatedAt) movedAt[field] = v.updatedAt;
      if (v.creator?.login) movedBy[field] = v.creator.login;
      /* An iteration's start is the date a roadmap can place it on. */
      if (v.startDate) values[`${field} start`] = v.startDate;
    }
    items.push({
      id: item.id,
      number: issue.number,
      values,
      optionIds,
      movedAt,
      movedBy,
      tracks: (issue.trackedIssues?.nodes ?? [])
        .filter(t => typeof t.number === 'number')
        .map(t => ({ number: t.number!, title: t.title ?? '', state: t.state })),
      trackedIn: (issue.trackedInIssues?.nodes ?? [])
        .filter(t => typeof t.number === 'number')
        .map(t => ({ number: t.number!, title: t.title ?? '' })),
    });
  }

  return {
    repo, id: project.id, number: project.number, title: project.title,
    fields, items, available,
  };
}

export interface ProjectEdit {
  /** The project item, which is what `--id` addresses. */
  itemId: string;
  /** The issue, for the confirm screen to name. */
  number: number;
  field: ProjectField;
  /** The option to set, for a single-select. */
  option?: ProjectOption;
  /** The date to set, ISO, for a date field. `''` clears it. */
  date?: string;
}

export interface ProjectPlan {
  projectId: string;
  steps: { number: number; does: string; argv: string[]; display: string }[];
  refusal?: string;
}

/**
 * What a drag would run, unrun.
 *
 * Ids rather than names throughout: `--field "Status" --value "In Progress"`
 * reads better and breaks the moment somebody renames a column, and this is a
 * command built from a board that was read seconds ago. The ids came back with
 * the values; using them is what makes the write address the thing that was
 * actually dragged.
 */
/**
 * Taking a card off the board, or out of the Project.
 *
 * Two different things and the difference matters. **Archive** hides the item
 * from the board's views and keeps it on the Project, which is what you want
 * for something finished. **Remove** takes it off the Project entirely. Neither
 * closes or deletes the issue — the issue is a thing in the repository, and the
 * item is only its card.
 *
 * Both need the `project` scope. `read:project`, which is what dkgh asks for on
 * connect, answers these with a 403 — so the menu offering them says so before
 * they are pressed. See `GhIssueMenu`.
 */
export function planProjectItem(
  projectId: string, itemId: string, number: number, what: 'archive' | 'remove',
): ProjectPlan {
  const argv = what === 'archive'
    ? ['project', 'item-archive', '--id', itemId, '--project-id', projectId]
    : ['project', 'item-delete', '--id', itemId, '--project-id', projectId];
  return {
    projectId,
    steps: [{
      number,
      does: what === 'archive'
        ? `Archives #${number}'s card — off the board, still on the Project, still an issue`
        : `Removes #${number} from the Project — still an issue in the repository`,
      argv,
      display: `gh ${argv.join(' ')}`,
    }],
  };
}

export function planProjectEdit(projectId: string, edits: ProjectEdit[]): ProjectPlan {
  const steps: ProjectPlan['steps'] = [];

  for (const edit of edits) {
    const base = [
      'project', 'item-edit',
      '--id', edit.itemId,
      '--project-id', projectId,
      '--field-id', edit.field.id,
    ];

    if (edit.option) {
      const argv = [...base, '--single-select-option-id', edit.option.id];
      steps.push({
        number: edit.number,
        does: `Sets ${edit.field.name} to ${edit.option.name} on #${edit.number}`,
        argv,
        display: `gh ${argv.join(' ')}`,
      });
      continue;
    }

    if (edit.date !== undefined) {
      /* An empty date is a real request — "this has no target any more" — and
         gh spells it `--clear` rather than an empty `--date`. */
      const argv = edit.date
        ? [...base, '--date', edit.date]
        : [...base, '--clear'];
      steps.push({
        number: edit.number,
        does: edit.date
          ? `Sets ${edit.field.name} to ${edit.date} on #${edit.number}`
          : `Clears ${edit.field.name} on #${edit.number}`,
        argv,
        display: `gh ${argv.join(' ')}`,
      });
    }
  }

  return {
    projectId,
    steps,
    refusal: steps.length === 0 ? 'That would change nothing.' : undefined,
  };
}

export interface ProjectOutcome { number: number; ok: boolean; error?: string }

/**
 * Run it.
 *
 * One call per change, and a failure is reported rather than retried: the
 * board it came from is one somebody else may also be dragging on, and a silent
 * retry against that is how two people's changes end up in the wrong order.
 */
export async function applyProjectEdit(plan: ProjectPlan): Promise<ProjectOutcome[]> {
  const out: ProjectOutcome[] = [];
  for (const step of plan.steps) {
    const r = await run(step.argv, { timeoutMs: 45_000 });
    out.push({
      number: step.number,
      ok: r.ok,
      error: r.ok ? undefined : (r.stderr || r.failure || `gh exited with ${r.code}`).trim(),
    });
  }
  return out;
}
