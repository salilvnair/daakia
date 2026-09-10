/**
 * What one issue is attached to — screen 14D.
 *
 * Sub-issues, blocked-by, and every place somebody referenced this issue live
 * in three different corners of GitHub's UI: a progress bar under the title, a
 * panel in the sidebar, and grey rows scattered through a timeline that also
 * contains forty label changes. They answer one question — *what else is
 * involved* — so they arrive here as one shape and the screen draws them as one
 * panel.
 *
 * **All of it is real GitHub data.** `blockedBy`, `blocking`, `subIssues`,
 * `subIssuesSummary` and `parent` are fields on `Issue` in the v4 schema; the
 * references come from `timelineItems` filtered to cross-references. None of it
 * is inferred from body text, which matters because a relationship dkgh guessed
 * at and a relationship somebody recorded are different claims — 14D keeps them
 * visually apart and this is the half that is fact.
 *
 * **One call.** The alternative is a REST timeline page plus a sub-issue list
 * plus a dependency list, which is three round trips and three shapes that can
 * disagree about the same issue.
 *
 * The blocker's own ETA is deliberately *not* fetched here. It lives on the
 * Project, which `project.ts` already reads for the whole board, and asking a
 * second time would let the two disagree — the screen joins them.
 */
import { run } from './gh';

/** An issue on the other end of a relationship. */
export interface Related {
  number: number;
  title: string;
  /** `OPEN` or `CLOSED`, as GitHub spells it. */
  state: string;
  /** First assignee's login, for the avatar on a sub-issue row. */
  assignee?: string;
}

/** Somewhere this issue was referenced from. */
export interface Mention {
  number: number;
  title: string;
  state: string;
  /** Who made the link. */
  actor?: string;
  at?: string;
  /** True when the referring thing is a pull request rather than an issue. */
  pr?: boolean;
}

export interface Relations {
  repo: string;
  number: number;
  blockedBy: Related[];
  blocking: Related[];
  subIssues: Related[];
  /** GitHub's own count, which can exceed what `subIssues` returned. */
  done: number;
  total: number;
  parent?: Related;
  mentions: Mention[];
  /**
   * Why there is nothing here.
   *
   * `scope` — the credential cannot read the repository.
   * A string — gh's own words for anything else.
   *
   * An issue with no relationships at all is not an error and leaves this
   * unset: the panel then draws nothing, which is the ordinary case.
   */
  absent?: 'scope' | string;
}

const QUERY = `
query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){
    issue(number:$number){
      number
      subIssuesSummary { total completed }
      parent { number title state }
      subIssues(first:50){ nodes {
        number title state assignees(first:1){ nodes { login } }
      } }
      blockedBy(first:20){ nodes {
        number title state assignees(first:1){ nodes { login } }
      } }
      blocking(first:20){ nodes {
        number title state assignees(first:1){ nodes { login } }
      } }
      timelineItems(first:50, itemTypes:[CROSS_REFERENCED_EVENT]){ nodes {
        ... on CrossReferencedEvent {
          createdAt
          actor { login }
          source {
            ... on Issue { number title state }
            ... on PullRequest { number title state }
          }
        }
      } }
    }
  }
}`.trim();

interface RawIssue {
  number?: number;
  title?: string;
  state?: string;
  assignees?: { nodes?: { login?: string }[] };
}

interface RawAnswer {
  data?: {
    repository?: {
      issue?: {
        subIssuesSummary?: { total?: number; completed?: number };
        parent?: RawIssue | null;
        subIssues?: { nodes?: RawIssue[] };
        blockedBy?: { nodes?: RawIssue[] };
        blocking?: { nodes?: RawIssue[] };
        timelineItems?: {
          nodes?: {
            createdAt?: string;
            actor?: { login?: string } | null;
            source?: RawIssue | null;
          }[];
        };
      } | null;
    } | null;
  };
}

/** A node with no number is a reference to something the credential cannot see. */
export function related(raw: RawIssue | null | undefined): Related | undefined {
  if (!raw || typeof raw.number !== 'number') return undefined;
  return {
    number: raw.number,
    title: raw.title ?? '',
    state: raw.state ?? 'OPEN',
    assignee: raw.assignees?.nodes?.[0]?.login,
  };
}

function list(nodes: RawIssue[] | undefined): Related[] {
  return (nodes ?? []).map(related).filter((x): x is Related => !!x);
}

/**
 * Fold the cross-reference events into one row per referring issue.
 *
 * GitHub emits an event every time the reference is re-stated — an edit, a new
 * comment naming the same issue — so an active thread produces the same row
 * four times. The earliest is kept, because "rmenon linked this from #41" is
 * about when the link was made.
 */
export function mentionsOf(
  nodes: { createdAt?: string; actor?: { login?: string } | null; source?: RawIssue | null }[]
  | undefined,
  self: number,
): Mention[] {
  const byNumber = new Map<number, Mention>();
  for (const n of nodes ?? []) {
    const src = n.source;
    if (!src || typeof src.number !== 'number') continue;
    if (src.number === self) continue;
    const at = n.createdAt;
    const seen = byNumber.get(src.number);
    if (seen && (!at || !seen.at || seen.at <= at)) continue;
    byNumber.set(src.number, {
      number: src.number,
      title: src.title ?? '',
      state: src.state ?? 'OPEN',
      actor: n.actor?.login,
      at,
      /* A PR's state is MERGED/CLOSED/OPEN; an issue's is only OPEN/CLOSED. */
      pr: src.state === 'MERGED',
    });
  }
  return [...byNumber.values()].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

export async function fetchRelations(repo: string, number: number): Promise<Relations> {
  const [owner, name] = repo.split('/');
  const empty: Relations = {
    repo, number, blockedBy: [], blocking: [], subIssues: [], done: 0, total: 0, mentions: [],
  };
  if (!owner || !name || !Number.isFinite(number)) return { ...empty, absent: 'No issue.' };

  const r = await run(
    ['api', 'graphql', '-f', `query=${QUERY}`,
      '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `number=${number}`],
    { timeoutMs: 30_000 },
  );

  if (!r.ok) {
    const said = (r.stderr || r.failure || '').trim();
    if (/scope|INSUFFICIENT_SCOPES/i.test(said)) return { ...empty, absent: 'scope' };
    return { ...empty, absent: said || 'gh could not read this issue.' };
  }

  let raw: RawAnswer;
  try {
    raw = JSON.parse(r.stdout) as RawAnswer;
  } catch {
    return { ...empty, absent: 'gh returned something that is not JSON.' };
  }

  const issue = raw.data?.repository?.issue;
  if (!issue) return { ...empty, absent: 'That issue is not there any more.' };

  const subIssues = list(issue.subIssues?.nodes);
  /*
    The summary is authoritative and the list is a page.

    An issue with sixty sub-issues returns fifty of them here, and counting the
    page would quietly report "2 of 50 done" on something that is 2 of 60.
  */
  const total = issue.subIssuesSummary?.total ?? subIssues.length;
  const done = issue.subIssuesSummary?.completed
    ?? subIssues.filter(s => s.state === 'CLOSED').length;

  return {
    repo,
    number,
    blockedBy: list(issue.blockedBy?.nodes),
    blocking: list(issue.blocking?.nodes),
    subIssues,
    done,
    total,
    parent: related(issue.parent),
    mentions: mentionsOf(issue.timelineItems?.nodes, number),
  };
}
