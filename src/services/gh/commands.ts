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
  { command: 'gh search repos <q> --json ...', when: 'searching, for public repositories',
    kind: 'read', live: true },
  { command: 'gh issue list --repo <r> --json ...', when: 'every board refresh',
    kind: 'read', live: true },
  { command: 'gh issue view <n> --repo <r> --json body,comments',
    when: 'holding Space over a card, for the peek', kind: 'read', live: true },
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
  { command: 'gh api /repos/{o}/{r}/labels', when: 'on the Labels tab',
    kind: 'read', live: false },
  { command: 'gh project field-list', when: 'on connect, if read:project is granted',
    kind: 'read', live: false },
  { command: 'gh search issues <q> --repo <r> --match ...',
    when: 'only when you widen the search to comments, or past the loaded page',
    kind: 'read', live: true },

  // ── Writes ───────────────────────────────────────────────────────────────
  { command: 'gh issue create --repo <r> --title ... --body-file -',
    when: 'the Create button on the composer', kind: 'write',
    confirmedBy: 'the review step', live: true },
  { command: 'gh issue edit', when: 'a cell edit, or a bulk action', kind: 'write',
    confirmedBy: 'the confirm bar', live: false },
  { command: 'gh issue close / reopen', when: 'closing an issue, or a bulk action',
    kind: 'write', confirmedBy: 'the confirm bar', live: false },
  { command: 'gh issue comment', when: 'writing a comment', kind: 'write',
    confirmedBy: 'the comment box itself', live: false },
  { command: 'gh api --method PUT .../contents/.dkgh/evidence/...',
    when: 'pasting a screenshot', kind: 'write', confirmedBy: 'the upload preview', live: false },
  { command: 'gh project item-edit', when: 'a drag on the columns board, a date on the roadmap',
    kind: 'write', confirmedBy: 'the drag receipt', live: false },
  { command: 'gh api --method PATCH .../labels/{name}', when: 'Push on the Labels tab',
    kind: 'write', confirmedBy: 'the push preview', live: false },
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
