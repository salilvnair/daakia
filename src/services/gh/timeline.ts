/**
 * What happened to an issue, in order — screen 14 and 14A.
 *
 * GitHub keeps this behind the timeline endpoint rather than in `gh issue
 * view`, so it is a second call and it is made only by the full issue page.
 * The board does not want it and the peek does not want it: a timeline is
 * forty rows on a three-week-old issue, and the peek is open for four seconds.
 *
 * **The events are translated here, not in the webview.** GitHub's payload is
 * a union of about thirty shapes with fields that mean different things
 * depending on `event` — `label.name` on one, `assignee.login` on another,
 * `project_card.column_name` on a third. Turning that into `{ kind, actor, at,
 * text }` in one place is the difference between a component that renders a
 * list and a component that knows GitHub's schema.
 *
 * **Unknown events are dropped, never rendered raw.** GitHub adds event types;
 * an unrecognised one rendered as its own JSON is worse than absent, and the
 * count says how many were left out so the list never silently lies about
 * being complete.
 */
import { run } from './gh';

/** The glyph the row gets, which is also what 14A filters on. */
export type TimelineKind =
  | 'label' | 'assign' | 'milestone' | 'project' | 'date' | 'state'
  | 'rename' | 'reference' | 'comment';

export interface TimelineEvent {
  kind: TimelineKind;
  /** Who did it. Absent for the handful GitHub attributes to nobody. */
  actor?: string;
  at?: string;
  /** What they did, already worded — "added bug, sso". */
  text: string;
  /** The value, where there is one worth showing apart from the sentence. */
  value?: string;
  /** A label's colour, so the row can carry the dot the board carries. */
  colour?: string;
}

export interface Timeline {
  repo: string;
  number: number;
  events: TimelineEvent[];
  /** Events GitHub sent that this file does not know how to word. */
  skipped: number;
  error?: string;
}

interface RawEvent {
  event?: string;
  created_at?: string;
  actor?: { login?: string };
  label?: { name?: string; color?: string };
  assignee?: { login?: string };
  assigner?: { login?: string };
  milestone?: { title?: string };
  project_card?: { column_name?: string; previous_column_name?: string };
  rename?: { from?: string; to?: string };
  state_reason?: string;
  source?: { issue?: { number?: number; title?: string } };
}

/**
 * One event, in a sentence.
 *
 * Returns `undefined` for anything not worth a row — which includes both the
 * event types nobody reads (`subscribed`, `mentioned`) and the ones this file
 * has not learned yet. The caller counts them either way.
 */
function word(raw: RawEvent): TimelineEvent | undefined {
  const actor = raw.actor?.login;
  const at = raw.created_at;
  const base = { actor, at };

  switch (raw.event) {
    case 'labeled':
      return { ...base, kind: 'label', text: 'added', value: raw.label?.name,
        colour: raw.label?.color };
    case 'unlabeled':
      return { ...base, kind: 'label', text: 'removed', value: raw.label?.name,
        colour: raw.label?.color };

    case 'assigned':
      /* GitHub sends the same payload for "assigned somebody" and "assigned
         themselves"; the second is the common one and reads badly as the
         first. */
      return { ...base, kind: 'assign',
        text: raw.assignee?.login === actor ? 'self-assigned this' : 'assigned',
        value: raw.assignee?.login === actor ? undefined : raw.assignee?.login };
    case 'unassigned':
      return { ...base, kind: 'assign', text: 'unassigned', value: raw.assignee?.login };

    case 'milestoned':
      return { ...base, kind: 'milestone', text: 'added this to', value: raw.milestone?.title };
    case 'demilestoned':
      return { ...base, kind: 'milestone', text: 'removed this from', value: raw.milestone?.title };

    case 'added_to_project':
      return { ...base, kind: 'project', text: 'added this to',
        value: raw.project_card?.column_name };
    case 'moved_columns_in_project':
      return { ...base, kind: 'project', text: 'moved this to',
        value: raw.project_card?.column_name };
    case 'removed_from_project':
      return { ...base, kind: 'project', text: 'removed this from the project' };

    /*
      Projects v2, which is the one every repository actually uses now.

      These are different events from the classic ones above, and they arrive
      with **no payload at all** — REST sends the type, the actor and the time,
      and nothing else. No project, no column, no value. GitHub's own issue page
      fills those in from GraphQL.

      So they are worded without the detail rather than left out. "moved this in
      a project" is less than github.com says and is true; counting them as
      events dkgh cannot word was worse, because two lines of real history
      turned into a sentence apologising for itself.

      Naming the project would mean a second call per issue to say something the
      right-hand rail is already showing.
    */
    case 'added_to_project_v2':
      return { ...base, kind: 'project', text: 'added this to a project' };
    case 'removed_from_project_v2':
      return { ...base, kind: 'project', text: 'removed this from a project' };
    case 'project_v2_item_status_changed':
      return { ...base, kind: 'project', text: 'moved this in a project' };
    case 'project_v2_item_reordered':
      return { ...base, kind: 'project', text: 'reordered this in a project' };

    case 'renamed':
      return { ...base, kind: 'rename', text: 'renamed this to', value: raw.rename?.to };

    case 'closed':
      return { ...base, kind: 'state',
        text: raw.state_reason === 'not_planned' ? 'closed this as not planned' : 'closed this' };
    case 'reopened':
      return { ...base, kind: 'state', text: 'reopened this' };

    case 'cross-referenced':
    case 'referenced':
      return { ...base, kind: 'reference', text: 'referenced this',
        value: raw.source?.issue?.number ? `#${raw.source.issue.number}` : undefined };

    default:
      return undefined;
  }
}

/**
 * The whole timeline, oldest first.
 *
 * Capped at 100 because the page reads it top to bottom and an issue with more
 * than that has a different problem. `--paginate` is deliberately not used: a
 * second page costs another round trip for rows nobody scrolls to.
 */
export async function fetchTimeline(repo: string, number: number): Promise<Timeline> {
  const empty = { repo, number, events: [], skipped: 0 };
  const r = await run(
    ['api', `/repos/${repo}/issues/${number}/timeline?per_page=100`],
    { timeoutMs: 30_000 },
  );
  if (!r.ok) {
    return { ...empty, error: (r.stderr || r.failure || 'gh could not read the timeline').trim() };
  }

  let raw: RawEvent[];
  try {
    raw = JSON.parse(r.stdout) as RawEvent[];
  } catch {
    return { ...empty, error: 'gh returned something that is not JSON.' };
  }
  if (!Array.isArray(raw)) return { ...empty, error: 'The timeline came back in an odd shape.' };

  const events: TimelineEvent[] = [];
  let skipped = 0;
  for (const one of raw) {
    /* Comments come back on this endpoint too, and they are already on the
       page from `gh issue view` — counting them as skipped would report a
       gap that is not one. */
    if (one.event === 'commented') continue;
    const said = word(one);
    if (said) events.push(said);
    else skipped += 1;
  }

  return { repo, number, events, skipped };
}
