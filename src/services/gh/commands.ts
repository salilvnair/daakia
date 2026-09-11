/**
 * Every `gh` command dkgh will ever run.
 *
 * dkgh shells out to a tool holding your GitHub credential. That deserves a
 * list of exactly what it invokes, in full, rather than a paragraph of
 * reassurance — so screen 02E renders this table.
 *
 * It lives here rather than in the webview for one reason: it has to be true.
 * A hand-written list in a component drifts the first time somebody adds a call
 * and forgets, and a disclosure that is quietly wrong is worse than none. This
 * sits beside the code that runs, and `commands.test.ts` asserts that every
 * `run([...])` in this directory is covered by a row.
 *
 * ── What is deliberately not on this list ──
 *
 * `gh auth token`. There is no code path in dkgh that reads a credential; the
 * whole justification for shelling out rather than calling the API directly is
 * that the token stays in the OS keychain where gh put it.
 */

export type CommandKind = 'read' | 'write';

export interface GhCommandRow {
  /** The invocation, with placeholders where arguments go. */
  command: string;
  /** When it runs, in the reader's terms rather than the code's. */
  when: string;
  kind: CommandKind;
  /**
   * The screen that must be on screen first, for a write.
   *
   * Every write is preceded by a screen showing the exact command. There is no
   * row here that can happen without having been read first — that is the rule
   * the composer's review step, the bulk bar and the labels push all exist to
   * keep.
   */
  confirmedBy?: string;
  /** True when the command exists in the code today rather than in the plan. */
  live: boolean;
}

export const GH_COMMANDS: GhCommandRow[] = [
  // ── Reads ────────────────────────────────────────────────────────────────
  { command: 'gh --version', when: 'finding gh, and verifying a path you gave',
    kind: 'read', live: true },
  { command: 'gh auth status', when: 'on open, and after any 401',
    kind: 'read', live: true },
  { command: 'gh <subcommand> --help', when: 'on open, to ask what this gh can do',
    kind: 'read', live: true },
  { command: 'gh api /rate_limit', when: 'only when a call has already failed',
    kind: 'read', live: true },
  { command: 'gh repo view --json ...', when: "reading the open folder's git remote",
    kind: 'read', live: true },
  { command: 'gh repo list [owner] --json ...', when: 'searching for a repository',
    kind: 'read', live: true },
  { command: 'gh api user/orgs', when: 'before a repository search, to know which '
        + 'organisations to list — cached for five minutes',
    kind: 'read', live: true },
  { command: 'gh issue list --repo <r> --json ...', when: 'every board refresh',
    kind: 'read', live: true },
  { command: 'gh issue view <n> --repo <r> --json body,comments',
    when: 'holding Space over a card, for the peek', kind: 'read', live: true },
  { command: 'gh api /repos/{o}/{r}/issues/{n}/timeline',
    when: 'opening one issue in full — never on the board, and never for the peek',
    kind: 'read', live: true },
  { command: 'gh api /repos/{o}/{r}/contents/.github/ISSUE_TEMPLATE',
    when: 'on connect, to read the field map', kind: 'read', live: true },
  { command: 'gh label list --repo <r> --json ...',
    when: 'when the board opens, for the lists a write chooses from',
    kind: 'read', live: true },
  { command: 'gh api /repos/{o}/{r}/milestones', when: 'with the labels, for the same lists',
    kind: 'read', live: true },
  { command: 'gh api /repos/{o}/{r}/assignees', when: 'with the labels, for the same lists',
    kind: 'read', live: true },
  { command: 'gh api <asset url>',
    when: 'one screenshot at a time, when a card or a peek shows evidence — the '
        + 'webview may not fetch a remote image, and a private asset needs the credential',
    kind: 'read', live: true },
  { command: 'gh api /repos/{o}/{r}/git/ref/heads/{branch}',
    when: 'before the first screenshot upload, to see whether the evidence branch exists',
    kind: 'read', live: true },
  { command: 'gh api /repos/{o}/{r}/contents/.github/ISSUE_TEMPLATE/{file}',
    when: 'importing forms from another repository — a read of that repo, never a write',
    kind: 'read', live: true },
  { command: 'gh api /repos/{o}/{r}/labels', when: 'on the Labels tab',
    kind: 'read', live: true },
  { command: 'gh api graphql (repository → projectsV2, issues → projectItems)',
    when: 'on connect, if read:project is granted — the Status, Priority and dates the '
        + 'columns and roadmap views are made of, in one call',
    kind: 'read', live: true },
  { command: 'gh api /repos/{o}/{r}/issues?state=all&per_page=100&page=N',
    when: 'exporting a whole repository rather than the current view — the only issues '
        + 'endpoint that pages, walked one page at a time with a pause when the hourly '
        + 'budget drops under a tenth',
    kind: 'read', live: true },
  { command: 'gh api graphql (repository → issues → totalCount)',
    when: 'once before that walk, so the progress bar has a denominator that counts '
        + 'issues and not pull requests',
    kind: 'read', live: true },
  { command: 'gh api graphql (repository → issue → blockedBy, subIssues, timelineItems)',
    when: 'opening an issue — what it blocks, what blocks it, its sub-issues and every '
        + 'place it was referenced from, in one call',
    kind: 'read', live: true },
  { command: 'gh search issues <q> --repo <r> --match ...',
    when: 'only when you widen the search to comments, or past the loaded page',
    kind: 'read', live: true },

  // ── Writes ───────────────────────────────────────────────────────────────
  { command: 'gh issue create --repo <r> --title ... --body-file -',
    when: 'the Create button on the composer', kind: 'write',
    confirmedBy: 'the review step', live: true },
  { command: 'gh issue edit', when: 'a cell edit, or a bulk action', kind: 'write',
    confirmedBy: 'the confirm bar', live: true },
  { command: 'gh issue close / reopen', when: 'closing an issue, or a bulk action',
    kind: 'write', confirmedBy: 'the confirm bar', live: true },
  { command: 'gh issue comment <n> --repo <r> --body-file -',
    when: 'writing a comment, and alongside a close — the body goes in through stdin, '
        + 'never as an argument',
    kind: 'write', confirmedBy: 'the confirm bar', live: true },
  { command: 'gh api --method PUT /repos/{o}/{r}/contents/.dkgh/evidence/{name}',
    when: 'uploading a pasted screenshot — a commit on the dkgh-evidence branch, never on '
        + 'the default one',
    kind: 'write', confirmedBy: 'the upload preview', live: true },
  { command: 'gh api --method POST /repos/{o}/{r}/git/refs',
    when: 'the first screenshot on a repository, to make the evidence branch',
    kind: 'write', confirmedBy: 'the upload preview', live: true },
  { command: 'gh project item-edit --id ... --field-id ... --single-select-option-id ...',
    when: 'a drag on the columns board, a date on the roadmap',
    kind: 'write', confirmedBy: 'the drag receipt', live: true },
  { command: 'gh api --method PUT /repos/{o}/{r}/contents/.github/ISSUE_TEMPLATE/{file}',
    when: 'committing imported issue forms — a commit on the default branch, and the '
        + 'one action on the import screen that writes anything',
    kind: 'write', confirmedBy: 'the commit preview', live: true },
  { command: 'gh api --method PATCH /repos/{o}/{r}/labels/{name}',
    when: 'Push on the Labels tab — a rename reaches every issue carrying the label',
    kind: 'write', confirmedBy: 'the push preview', live: true },
  { command: 'gh api --method POST /repos/{o}/{r}/labels',
    when: 'Push, for a label created on the Labels tab',
    kind: 'write', confirmedBy: 'the push preview', live: true },
  { command: 'gh api --method DELETE /repos/{o}/{r}/labels/{name}',
    when: 'Push, for a label deleted on the Labels tab',
    kind: 'write', confirmedBy: 'the push preview', live: true },
];

/** What each scope buys, and what is lost without it. Screen 02A. */
export interface ScopeRow {
  scope: string;
  unlocks: string;
  without: string;
  /** `required` blocks everything; `on-demand` is asked for at the moment of use. */
  need: 'required' | 'recommended' | 'on-demand' | 'optional';
}

export const GH_SCOPES: ScopeRow[] = [
  { scope: 'repo', unlocks: 'Reading issues, and creating them',
    without: 'nothing works', need: 'required' },
  { scope: 'read:project', unlocks: 'Status, Priority, Start and ETA',
    without: 'the columns and roadmap show dashes', need: 'recommended' },
  { scope: 'project', unlocks: 'Dragging a card, editing a date',
    without: 'those are read-only', need: 'on-demand' },
  { scope: 'read:org', unlocks: 'Team names in the assignee facet',
    without: 'people, but not teams', need: 'optional' },
];
