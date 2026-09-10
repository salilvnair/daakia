/**
 * Screen 13's half that is not a component — the review before a create.
 *
 * Nothing reaches GitHub without that screen. This is somebody's real
 * repository and a surprise write to it is unforgivable, so the exact sequence
 * is printed above the button that runs it.
 *
 * Three things live here:
 *
 * - **Provenance** (13A). Which parts of the body somebody wrote, which are the
 *   template's own headings, and which a model composed. Marking the last of
 *   those is what makes reviewing this screen a ten-second job rather than a
 *   re-read of everything. Nothing is model-written yet — that arrives with
 *   screen 11 — and the panel says so rather than implying the body was
 *   checked for something that cannot be there.
 * - **Duplicates** (13C). Candidates come from the loaded board, not a fresh
 *   search. **The explanation is the feature, not the score**: "92% similar" is
 *   unfalsifiable, and "rmenon said the same sentence two days ago" is checkable
 *   in one click. So this returns the reasons and never a percentage.
 * - **Retry** (13D). Which steps failed, and which of them are worth trying
 *   again — never the create, because a second one files a second copy of an
 *   issue that already exists.
 */
import type { BoardIssue } from './board-types';

// ── 13A — where each part of the body came from ─────────────────────────────

export type Provenance = 'you' | 'template' | 'model' | 'claim';

export interface BodyPart {
  /** The heading this block sits under, or `''` for a bodyless repository. */
  heading: string;
  text: string;
  provenance: Provenance;
  /** Why it is marked, for the panel beside the body. */
  note?: string;
}

/**
 * Split an assembled body into its blocks, and say where each came from.
 *
 * The headings are the template's; the answers are the reader's. A block the
 * model composed carries `model`, and one that repeats something unverified
 * carries `claim` — quoted as a claim and attributed, never recorded as a
 * finding, so whoever picks the issue up knows which part came from a person
 * and which part is a guess nobody has checked.
 */
export function readProvenance(
  body: string,
  /** Field labels a model composed rather than quoted. Empty until screen 11. */
  composed: string[] = [],
): BodyPart[] {
  const parts: BodyPart[] = [];
  const composedSet = new Set(composed.map(c => c.toLowerCase()));

  const blocks = body.split(/\n(?=### )/);
  for (const block of blocks) {
    const m = block.match(/^### (.+?)\n+([\s\S]*)$/);
    const heading = m ? m[1].trim() : '';
    const text = (m ? m[2] : block).trim();
    if (!heading && !text) continue;

    const provenance: Provenance =
      composedSet.has(heading.toLowerCase()) ? 'model'
      : text === '_No response_' ? 'template'
      : 'you';

    parts.push({
      heading,
      text,
      provenance,
      note: provenance === 'model'
        ? 'Composed from your answer rather than quoted.'
        : provenance === 'template'
          ? 'You left this one empty; the heading is the template’s.'
          : undefined,
    });
  }
  return parts;
}

/** What the panel beside the body has to say about it. */
export function provenanceSummary(parts: BodyPart[]): string {
  const composed = parts.filter(p => p.provenance === 'model').length;
  if (composed === 0) {
    return 'Every word here is yours or a heading from the template. Nothing was '
      + 'generated — the AI step is screen 11, and it is not built yet.';
  }
  return `${composed} block${composed === 1 ? '' : 's'} composed rather than quoted, `
    + 'highlighted so you read them once. Everything else is verbatim from you.';
}

// ── 13C — you may be about to file this twice ───────────────────────────────

export interface DuplicateCandidate {
  issue: BoardIssue;
  strength: 'strong' | 'weak';
  /** Why, in checkable terms. Never a percentage. */
  reasons: string[];
}

/** Words too common to mean anything when two issues share them. */
const NOISE = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'when', 'not', 'but',
  'issue', 'bug', 'error', 'page', 'user', 'after', 'does', 'have', 'been',
  'should', 'would', 'there', 'their', 'which', 'about', 'into', 'only',
]);

function significant(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter(w => !NOISE.has(w)),
  );
}

/**
 * Issues already on the board that describe something close to this.
 *
 * Same dimension values, overlapping significant words in the title and the
 * first line of the body. Ranked by how much they agree on, and every reason is
 * something the reader can check in one click.
 *
 * It never sees the whole repository — only what the board has loaded, which is
 * stated on the screen rather than implied. A weak match says why it is weak.
 */
export function findDuplicates(
  draft: { title: string; description: string; answers: Record<string, string> },
  issues: BoardIssue[],
  /** Which answers are dimension values, so "same module" can be said. */
  dimensions: string[],
): DuplicateCandidate[] {
  const mine = significant(`${draft.title} ${draft.description}`);
  if (mine.size === 0) return [];

  const myDims = new Map(
    dimensions
      .map(d => [d, findAnswer(draft.answers, d)] as const)
      .filter((pair): pair is [string, string] => !!pair[1]),
  );

  const scored = issues.map(issue => {
    const theirs = significant(`${issue.title} ${issue.bodyFirstLine ?? ''}`);
    const shared = [...mine].filter(w => theirs.has(w));

    const reasons: string[] = [];
    let score = shared.length;

    for (const [dim, value] of myDims) {
      if ((issue.dimensions[dim] ?? '').toLowerCase() === value.toLowerCase()) {
        reasons.push(`Same ${dim} — ${issue.dimensions[dim]}`);
        score += 2;
      }
    }
    if (shared.length > 0) {
      reasons.push(`Both mention ${shared.slice(0, 4).map(w => `“${w}”`).join(', ')}`);
    }
    if (issue.state === 'CLOSED') {
      reasons.push('That one is closed, so it may be the fix rather than the same bug');
      score -= 2;
    }
    if (issue.quietDays <= 3 && issue.commentCount > 0) {
      reasons.push(`Somebody commented on it ${issue.quietDays} day${issue.quietDays === 1 ? '' : 's'} ago`);
      score += 1;
    }

    return { issue, score, reasons };
  });

  return scored
    .filter(c => c.score >= 3 && c.reasons.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ issue, score, reasons }) => ({
      issue,
      strength: score >= 6 ? 'strong' as const : 'weak' as const,
      reasons,
    }));
}

/** A dimension's answer, whichever label the template gave the field. */
function findAnswer(answers: Record<string, string>, dimension: string): string | undefined {
  for (const [label, value] of Object.entries(answers)) {
    if (label.toLowerCase().includes(dimension.toLowerCase()) && value.trim()) return value;
  }
  return undefined;
}

// ── 13D — what to retry ─────────────────────────────────────────────────────

export interface StepOutcome {
  kind: 'create' | 'labels' | 'assignees' | 'milestone' | 'project';
  does: string;
  command: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/**
 * The steps a retry should cover.
 *
 * Failures only, and never the create. Re-running step one against an issue
 * that already exists files a second copy, which is the specific bug this
 * screen exists to prevent — and the reason a blanket "try again" is not
 * offered.
 */
export function retryable(outcomes: StepOutcome[]): StepOutcome['kind'][] {
  return outcomes
    .filter(o => !o.ok && !o.skipped && o.kind !== 'create')
    .map(o => o.kind);
}

/** Whether anything actually reached GitHub, for which of the two 13D screens. */
export function created(outcomes: StepOutcome[]): boolean {
  return outcomes.some(o => o.kind === 'create' && o.ok);
}
