/**
 * The one path every write on the board takes.
 *
 * A bulk assign from the selection bar and a single change in a table cell are
 * the same request with a different number of issues in it, so they are the
 * same flow: **propose, see the exact command, run it, read what happened per
 * issue.** One surface, one confirm, one place a mistake could hide — rather
 * than a careful confirm on the bulk path and a quiet write on the cell path,
 * which is how the quiet one ends up being the one that surprises somebody.
 *
 * The command is built by the host, unrun, by the same function that will run
 * it — see `services/gh/write.ts`. Nothing here composes an argv, so a screen
 * that displays one thing and runs another is not expressible.
 *
 * Nothing is retried. A write that fails comes back said plainly, because a
 * silent retry against a board somebody else is also editing is how a status
 * board ends up quietly wrong.
 */
import { useCallback, useEffect, useState } from 'react';
import { postMsg } from '../../vscode';

export interface EditRequest {
  repo: string;
  numbers: number[];
  addLabels?: string[];
  addAssignees?: string[];
  removeAssignees?: string[];
  /** `''` clears it. `undefined` leaves it alone — the two are different. */
  milestone?: string;
  state?: 'close' | 'reopen';
  closeReason?: 'completed' | 'not planned';
  /**
   * A comment to leave, on its own or alongside a close.
   *
   * Planned as its own call and ordered first — see `services/gh/write.ts`.
   */
  comment?: string;
  removeLabels?: string[];
  /**
   * Rewrite one comment that already exists, by its REST id.
   *
   * Mirrors `services/gh/write.ts`. The types are not shared across the
   * webview boundary, so a field added there has to be added here too or the
   * message is dropped silently on the way over.
   */
  editComment?: { id: number; body: string };
  /** Remove one comment that already exists. No undo, on GitHub or here. */
  deleteComment?: { id: number };
  /**
   * Rewrite the issue's own description.
   *
   * Not a comment: the opening post is a field on the issue, so the host plans
   * it as `gh issue edit --body-file -`. `''` clears it, which is a real
   * request — so only `undefined` means "leave it alone".
   */
  body?: string;
  /** Rename the issue — `gh issue edit --title`. Its own call. */
  title?: string;
}

/**
 * The REST id inside a comment's permalink.
 *
 * `https://github.com/o/r/issues/2#issuecomment-3456` -> `3456`. The host has
 * the same function for the same reason the request type is duplicated; this
 * one decides whether the menu offers Edit and Delete at all, so a comment
 * whose url we cannot read simply does not offer them.
 */
export function commentId(url: string | undefined): number | undefined {
  const m = /#issuecomment-(\d+)\s*$/.exec(url ?? '');
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

export interface PlannedCommand { number: number; display: string }
export interface EditPlan { commands: PlannedCommand[]; summary: string; empty?: boolean }
export interface Outcome { number: number; command: string; ok: boolean; error?: string }

export interface EditFlow {
  request?: EditRequest;
  plan?: EditPlan;
  running: boolean;
  outcomes?: Outcome[];
  /**
   * What each issue's cell should claim while a write against it is in flight.
   *
   * Keyed by issue and carrying the field it belongs to, because a board can
   * have an assignee change in flight on one row while a milestone change is in
   * flight on another, and a cell that showed the wrong one of those would be
   * confidently wrong rather than merely early.
   *
   * The cell shows the new value immediately and marks it pending. If the write
   * fails the old value comes back with the reason attached — rather than the
   * cell having quietly said something untrue for four minutes until the next
   * refresh corrected it.
   */
  optimistic: Map<number, { field: string; value: string }>;
  propose: (request: EditRequest, showsAs?: { field: string; value: string }) => void;
  apply: () => void;
  cancel: () => void;
  dismiss: () => void;
}

export function useEditFlow(repo: string, onApplied: () => void): EditFlow {
  const [request, setRequest] = useState<EditRequest | undefined>();
  const [plan, setPlan] = useState<EditPlan | undefined>();
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[] | undefined>();
  const [optimistic, setOptimistic] =
    useState<Map<number, { field: string; value: string }>>(new Map());

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'dkgh:planEdit:result') { setPlan(msg.plan as EditPlan); return; }
      if (msg.type === 'dkgh:applyEdit:running') { setRunning(true); return; }
      if (msg.type !== 'dkgh:applyEdit:result') return;
      setRunning(false);
      setOutcomes((msg.outcomes as Outcome[]) ?? []);
      /* The claim is dropped the moment the answer is known, whichever way it
         went. A board that keeps showing an optimistic value after a refresh
         has landed is a board disagreeing with itself. */
      setOptimistic(new Map());
      /* Re-read whatever happened — especially on a partial failure, which is
         the state where the screen and GitHub disagree and only a read settles
         it. */
      onApplied();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onApplied]);

  /* A repository change abandons anything in flight against the old one. */
  useEffect(() => {
    setRequest(undefined);
    setPlan(undefined);
    setOutcomes(undefined);
    setOptimistic(new Map());
  }, [repo]);

  const propose = useCallback((
    next: EditRequest,
    showsAs?: { field: string; value: string },
  ) => {
    setOutcomes(undefined);
    setPlan(undefined);
    setRequest(next);
    if (showsAs !== undefined) {
      setOptimistic(new Map(next.numbers.map(n => [n, showsAs])));
    }
    postMsg({ type: 'dkgh:planEdit', request: next });
  }, []);

  const apply = useCallback(() => {
    if (!request) return;
    postMsg({ type: 'dkgh:applyEdit', request });
  }, [request]);

  const cancel = useCallback(() => {
    setRequest(undefined);
    setPlan(undefined);
    setOptimistic(new Map());
  }, []);

  const dismiss = useCallback(() => {
    setOutcomes(undefined);
    setRequest(undefined);
    setPlan(undefined);
  }, []);

  return { request, plan, running, outcomes, optimistic, propose, apply, cancel, dismiss };
}
