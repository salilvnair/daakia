/**
 * Screen 04E — nothing to show, five different ways.
 *
 * An empty board has five causes and they need five different sentences. One
 * generic "No results" makes a rate limit look like a clean sprint.
 *
 * Each one names the cause and offers the next move. Two are worth the care:
 *
 * - **No issue matches** says *which* filter is costing you the results and
 *   offers to drop that one, because the usual reason a board is empty is a
 *   filter somebody forgot was on.
 * - **Rate limited** keeps showing the stale board and says how stale, rather
 *   than blanking a screen somebody was reading. Auto-refresh stops, and the
 *   button says the time it will work again rather than inviting a retry that
 *   is guaranteed to fail.
 *
 * The fifth, the first read, is not here: it is a skeleton of the board's own
 * shape, because the shape of what is coming is itself information and a board
 * that appears fully formed after a blank pause feels slower than one that
 * fills in.
 */
import {
  GhEmpty, GhLede, GhActions, GhPrimary, GhButton, GhOption, GhOptions,
} from './GhShell';
import { atClock, until, since } from './format';

/** One thing narrowing the board, and what dropping it would give back. */
export interface ActiveFilter {
  key: string;
  /** How it reads on screen: `search "orders"`, `quiet for 14 days`. */
  label: string;
  /** How many issues would show if this one alone were dropped. */
  wouldShow: number;
  drop: () => void;
}

export function GhBoardEmpty({
  repo, total, closedRecently, filters, rateLimit, staleAt, error,
  onClearAll, onShowClosed, onRetry,
}: {
  repo: string;
  /** How many issues the board holds before any filter. */
  total: number;
  closedRecently?: number;
  filters: ActiveFilter[];
  rateLimit?: { remaining: number; limit: number; resetAt: number };
  /** When the board on screen was read, for the rate-limited case. */
  staleAt?: number;
  /** A read that failed for some other reason — gh's own words. */
  error?: string;
  onClearAll: () => void;
  onShowClosed?: () => void;
  onRetry: () => void;
}) {
  /*
    Rate limiting first, because it is the only one of these that is true
    regardless of what else is on screen — and the only one where the board
    below is worth keeping.
  */
  if (rateLimit) {
    return (
      <GhEmpty icon="warn" title="GitHub is rate-limiting us">
        <GhLede>
          {rateLimit.remaining} of {rateLimit.limit} requests left. The limit resets at{' '}
          {atClock(rateLimit.resetAt)}, {until(rateLimit.resetAt)}. Auto-refresh has stopped
          {staleAt ? `; the board is from ${since(staleAt)}.` : '.'}
        </GhLede>
        <GhActions>
          <GhPrimary icon="refresh" onClick={onRetry}>
            Retry at {atClock(rateLimit.resetAt)}
          </GhPrimary>
        </GhActions>
      </GhEmpty>
    );
  }

  /*
    A credential that went away mid-session. The tab's own recovery screen sits
    above the board and keeps it visible; this is the board's half of that —
    said here too, because a reader looking at an empty list needs to know the
    repository is fine.
  */
  if (error && /auth|credential|token|login|401/i.test(error)) {
    return (
      <GhEmpty icon="lock" title="gh is signed out">
        <GhLede>
          Your credential expired or was revoked. Nothing is wrong with the repository.
        </GhLede>
        <GhOptions>
          <GhOption pick title="Sign in again" command="gh auth login" />
        </GhOptions>
      </GhEmpty>
    );
  }

  if (error) {
    return (
      <GhEmpty icon="warn" title={`gh could not read ${repo}`}>
        {/* gh's own words. It usually names the field or the permission, which
            is the whole difference between a fixable error and a mystery. */}
        <GhLede>{error}</GhLede>
        <GhActions>
          <GhPrimary icon="refresh" onClick={onRetry}>Try again</GhPrimary>
        </GhActions>
      </GhEmpty>
    );
  }

  /*
    Something is filtering, and the board would not be empty without it.

    The one worth naming is the filter whose removal gives back the most, and
    naming it is the difference between "no results" and "you have a search on
    from ten minutes ago".
  */
  if (filters.length > 0) {
    const best = [...filters].sort((a, b) => b.wouldShow - a.wouldShow)[0];
    return (
      <GhEmpty icon="filter" title="No issue matches these filters">
        <GhLede>
          {filters.length} filter{filters.length === 1 ? ' is' : 's are'} on.
          {best.wouldShow > 0
            ? ` Dropping ${best.label} would show ${best.wouldShow}.`
            : ` ${repo} has ${total} issue${total === 1 ? '' : 's'} altogether.`}
        </GhLede>
        <GhActions>
          {best.wouldShow > 0 && (
            <GhPrimary onClick={best.drop}>Drop {best.label}</GhPrimary>
          )}
          {filters.length > 1 && <GhButton onClick={onClearAll}>Clear all</GhButton>}
        </GhActions>
      </GhEmpty>
    );
  }

  /* Nothing filtered, nothing there. A clean sprint, and it should look like
     one rather than like a failure. */
  return (
    <GhEmpty icon="closed" title="Nothing is open">
      <GhLede>
        Every issue in {repo} is closed.
        {closedRecently !== undefined && closedRecently > 0
          ? ` ${closedRecently} ${closedRecently === 1 ? 'was' : 'were'} closed in the last 90 days.`
          : closedRecently === 0
            ? ' Nothing has been closed in the last 90 days either — this repository is quiet.'
            : ''}
      </GhLede>
      {onShowClosed && (
        <GhActions>
          <GhPrimary icon="closed" onClick={onShowClosed}>Show closed</GhPrimary>
        </GhActions>
      )}
    </GhEmpty>
  );
}
