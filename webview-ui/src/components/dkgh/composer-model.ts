/**
 * The composer's half that is not a component — screens 10 and 10A to 10E.
 *
 * The composer opens with **one box**. Not eleven fields with one of them
 * focused: one box, because that is the shape of what the person actually has
 * in their head when they arrive. Everything here exists to turn that box, plus
 * whatever they filled in beside it, into a body the repository's own template
 * would have produced — so an issue filed from dkgh and one filed from the
 * browser look the same to whoever reads them next.
 *
 * Three things worth knowing:
 *
 * - **The body is assembled from the template, not from a shape dkgh invented.**
 *   Each field becomes `### Label` and its answer underneath, in the order the
 *   form declared them, which is exactly what GitHub's own form renderer emits
 *   and therefore exactly what `issue-body.ts` reads back out. The board can
 *   group by Module tomorrow because the composer wrote the heading today.
 * - **Which template applies is proposed, never assumed.** A bug report and an
 *   enhancement ask for entirely different things, and picking wrong costs you
 *   the answers.
 * - **A field's destination is stated.** Nine controls write to four different
 *   places, and which is which is not guessable. "Why did my priority not save"
 *   has exactly one honest answer, and no amount of UI polish substitutes for
 *   saying it.
 */
import type { BoardIssue, FormField, IssueForm } from './board-types';

export type { FormField, IssueForm };

/** What the composer holds while somebody is writing. */
export interface Draft {
  repo: string;
  title: string;
  /** The one box. Whatever they typed, before any template is applied. */
  description: string;
  /** Answers keyed by field label — the heading it will be written under. */
  answers: Record<string, string>;
  /** Which template is in force, by file. */
  templateFile?: string;
  labels: string[];
  assignees: string[];
  milestone?: string;
  /** Image URLs pasted in. Held here, and nowhere else — see `draftNote`. */
  evidence: string[];
  savedAt: number;
}

export function emptyDraft(repo: string): Draft {
  return {
    repo,
    title: '',
    description: '',
    answers: {},
    labels: [],
    assignees: [],
    evidence: [],
    savedAt: 0,
  };
}

// ── 10A — which template applies ────────────────────────────────────────────

export interface TemplateProposal {
  form: IssueForm;
  /** Why this one, or what it would have asked instead. */
  because: string;
  score: number;
}

/**
 * Rank the repository's templates against what has been written so far.
 *
 * Word matching, deliberately, and not a model. The plan's rule holds here as
 * much as on the board: this is a *proposal a person confirms*, and something
 * that can come out differently on a reload is not something to build a default
 * on. The words are the template's own name and description, so a repository
 * that renames a form changes the proposal without dkgh changing.
 */
export function proposeTemplate(forms: IssueForm[], text: string): TemplateProposal[] {
  const words = text.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  const seen = new Set(words);

  return forms
    .map(form => {
      const hay = `${form.name} ${form.description ?? ''} ${form.labels.join(' ')}`.toLowerCase();
      let score = 0;
      for (const w of seen) if (hay.includes(w)) score += 1;
      /* A bug report is the commonest thing a tester files, so it breaks a tie
         rather than the alphabet doing it. */
      if (/\bbug\b|defect|problem/i.test(hay)) score += 0.5;
      return { form, score, because: asks(form) };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * What a template would ask for, in one phrase.
 *
 * "Asks for a team and a target release" is how somebody recognises they
 * actually wanted the tracking template — a name alone would not have told
 * them.
 */
export function asks(form: IssueForm): string {
  const named = form.fields
    .filter(f => f.type !== 'markdown')
    .map(f => f.label.toLowerCase());
  if (named.length === 0) return 'Asks for nothing beyond a title and a body.';
  const shown = named.slice(0, 4);
  const rest = named.length - shown.length;
  return `Asks for ${shown.join(', ')}${rest > 0 ? `, and ${rest} more` : ''}.`;
}

// ── The body ────────────────────────────────────────────────────────────────

/**
 * Assemble the issue body the way GitHub's own form renderer would.
 *
 * `### Label` then the answer, blank line between, in the template's declared
 * order. Unanswered fields are written as `_No response_`, which is what GitHub
 * writes — so a body from dkgh and a body from the browser parse identically
 * when the board reads them back.
 *
 * With no template the description is the body, unchanged. That is not a
 * degraded case; it is what most repositories look like.
 */
export function assembleBody(draft: Draft, form: IssueForm | undefined): string {
  if (!form) {
    const parts = [draft.description.trim()];
    if (draft.evidence.length) parts.push(evidenceBlock(draft.evidence));
    return parts.filter(Boolean).join('\n\n');
  }

  const blocks: string[] = [];
  for (const field of form.fields) {
    if (field.type === 'markdown') continue;
    const answer = (draft.answers[field.label] ?? '').trim();
    blocks.push(`### ${field.label}\n\n${answer || '_No response_'}`);
  }
  if (draft.evidence.length) blocks.push(evidenceBlock(draft.evidence));
  return blocks.join('\n\n');
}

function evidenceBlock(urls: string[]): string {
  return ['### Evidence', '', ...urls.map(u => `![screenshot](${u})`)].join('\n');
}

/**
 * Which fields the template requires and nobody has filled.
 *
 * Shown **amber, not red**. Saying so up front beats a validation error at the
 * end — and they are exactly what the AI step is about to fill in, so shouting
 * about them would be premature.
 */
export function missing(draft: Draft, form: IssueForm | undefined): FormField[] {
  if (!form) return [];
  return form.fields.filter(f =>
    f.required && f.type !== 'markdown' && !(draft.answers[f.label] ?? '').trim());
}

// ── 10C — where each control writes ─────────────────────────────────────────

export type Destination = 'issue' | 'body' | 'project' | 'nowhere';

export interface SidebarField {
  key: string;
  label: string;
  destination: Destination;
  /** What actually happens, in the reader's terms. */
  how: string;
  /** Set when this cannot work here, with the reason. */
  unavailable?: string;
}

export const DESTINATIONS: Record<Destination, { label: string; note: string }> = {
  issue: {
    label: 'The issue',
    note: 'Set by `gh issue create` at the moment it is filed.',
  },
  body: {
    label: 'The body',
    note: 'Written as a `### Heading` the board reads back out.',
  },
  project: {
    label: 'The Project',
    note: 'A Project field, set after creation — and only with the project scope.',
  },
  nowhere: {
    label: 'Nowhere yet',
    note: 'Not written anywhere. The control is here so the screen is honest about it.',
  },
};

/**
 * The nine controls, and which of four places each writes to.
 *
 * The table exists because "why did my priority not save" has exactly one
 * honest answer — it is a Project field, set after creation, and the Project
 * scope was not granted.
 */
export function sidebarFields(form: IssueForm | undefined, hasProject: boolean): SidebarField[] {
  const declared = new Map(
    (form?.fields ?? [])
      .filter(f => f.type !== 'markdown')
      .map(f => [f.label.toLowerCase(), f]),
  );

  const fromForm = (name: string): SidebarField | undefined => {
    const f = declared.get(name);
    if (!f) return undefined;
    return {
      key: f.label,
      label: f.label,
      destination: 'body',
      how: f.options.length
        ? `One of ${f.options.length} values the template declared.`
        : 'Free text under its own heading.',
    };
  };

  const project = (key: string, label: string): SidebarField => ({
    key,
    label,
    destination: 'project',
    how: 'Set on the Project after the issue exists.',
    unavailable: hasProject ? undefined
      : 'dkgh does not read or write Projects yet, so this is not offered.',
  });

  return [
    { key: 'assignees', label: 'Assignees', destination: 'issue',
      how: 'A `--assignee` flag on the create.' },
    { key: 'labels', label: 'Labels', destination: 'issue',
      how: 'A `--label` flag, plus whatever the template applies itself.' },
    { key: 'milestone', label: 'Milestone', destination: 'issue',
      how: 'A `--milestone` flag on the create.' },
    ...[...declared.values()].map(f => fromForm(f.label.toLowerCase())!)
      .filter(Boolean),
    project('priority', 'Priority'),
    project('dates', 'Start and target date'),
    { key: 'type', label: 'Issue type', destination: 'nowhere',
      how: 'GitHub’s own issue types need a gh newer than most people have.',
      unavailable: 'Not written — the board reads Type from the template instead.' },
  ];
}

// ── 10D — drafts ────────────────────────────────────────────────────────────

const DRAFT_KEY = 'dkgh.draft';

/**
 * You start writing, get pulled into a call, close the window.
 *
 * A composer that loses that is a composer people stop starting things in. One
 * draft per repository, in this browser, saved as you type.
 */
export function loadDraft(repo: string): Draft | undefined {
  try {
    const raw = window.localStorage.getItem(`${DRAFT_KEY}.${repo}`);
    if (!raw) return undefined;
    const draft = JSON.parse(raw) as Draft;
    return hasContent(draft) ? { ...emptyDraft(repo), ...draft } : undefined;
  } catch {
    return undefined;
  }
}

export function saveDraft(draft: Draft): void {
  try {
    if (!hasContent(draft)) { discardDraft(draft.repo); return; }
    window.localStorage.setItem(
      `${DRAFT_KEY}.${draft.repo}`,
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    );
  } catch {
    /* Storage off. The draft lasts as long as the tab. */
  }
}

export function discardDraft(repo: string): void {
  try {
    window.localStorage.removeItem(`${DRAFT_KEY}.${repo}`);
  } catch {
    /* Nothing to do, and nothing worth saying. */
  }
}

export function hasContent(draft: Draft): boolean {
  return !!(draft.title.trim() || draft.description.trim()
    || Object.values(draft.answers).some(v => v.trim())
    || draft.evidence.length);
}

/**
 * What a reader needs to know about a draft that has been sitting there.
 *
 * The mock's version of this screen says the evidence is already on GitHub,
 * because it assumes the two-stage write from screen 12 where images go to an
 * orphan branch before the issue exists. **dkgh does not upload anything until
 * the issue is filed**, so nothing is stranded and there is nothing to offer to
 * clean up — which is the better position, and worth saying rather than leaving
 * somebody to wonder.
 */
export function draftNote(draft: Draft): string {
  if (draft.evidence.length === 0) {
    return 'Kept in this browser, against this repository. Nothing has been sent to GitHub.';
  }
  return `Kept in this browser, with ${draft.evidence.length} `
    + `screenshot${draft.evidence.length === 1 ? '' : 's'}. Nothing is uploaded until the issue `
    + 'is filed, so discarding this leaves nothing behind on GitHub.';
}

// ── 10B — what `#` and `@` complete from ────────────────────────────────────

export interface Completion { insert: string; label: string; note?: string }

/**
 * `#` completes from the board dkgh already loaded, `@` from the collaborator
 * list it already read.
 *
 * Both are already in memory, so cross-referencing the issue you were just
 * looking at costs two keystrokes rather than a trip to a browser tab to find
 * its number.
 */
export function completionsFor(
  trigger: '#' | '@',
  term: string,
  issues: BoardIssue[],
  people: string[],
): Completion[] {
  const t = term.toLowerCase();
  if (trigger === '#') {
    return issues
      .filter(i => !t || String(i.number).startsWith(t) || i.title.toLowerCase().includes(t))
      .slice(0, 8)
      .map(i => ({ insert: `#${i.number}`, label: `#${i.number}`, note: i.title }));
  }
  return people
    .filter(p => !t || p.toLowerCase().includes(t))
    .slice(0, 8)
    .map(p => ({ insert: `@${p}`, label: `@${p}` }));
}
