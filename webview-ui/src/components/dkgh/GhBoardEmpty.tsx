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
import { ButtonView, EmptyStateView } from '@salilvnair/dui';
import {
  IssueOpenedIcon, FilterClearIcon, GaugeIcon, KeyIcon, CheckCircleIcon,
} from '../../icons';
import { GhCommand } from './GhShell';
import { atClock, until, since } from './format';
import { ACCENT } from './types';

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
      <EmptyStateView
        variant="medallion"
        accentColor="var(--color-warning)"
        icon={<GaugeIcon size={24} />}
        title="GitHub is rate-limiting us"
        message={
          `${rateLimit.remaining} of ${rateLimit.limit} requests left. The limit resets at `
          + `${atClock(rateLimit.resetAt)}, ${until(rateLimit.resetAt)}. Auto-refresh has stopped`
          + (staleAt ? `; the board is from ${since(staleAt)}.` : '.')
        }
        action={{ label: `Retry at ${atClock(rateLimit.resetAt)}`, onClick: onRetry }}
      />
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
      <div className="flex flex-col items-center gap-3 py-6">
        <EmptyStateView
          variant="medallion"
          accentColor="var(--color-error)"
          icon={<KeyIcon size={24} />}
          title="gh is signed out"
          message="Your credential expired or was revoked. Nothing is wrong with the repository."
        />
        <div style={{ width: 'min(420px, 90%)' }}>
          <GhCommand text="gh auth login" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyStateView
        variant="medallion"
        accentColor="var(--color-error)"
        icon={<IssueOpenedIcon size={24} />}
        title={`gh could not read ${repo}`}
        /* gh's own words. It usually names the field or the permission, which
           is the whole difference between a fixable error and a mystery. */
        message={error}
        action={{ label: 'Try again', onClick: onRetry }}
      />
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
      <div className="flex flex-col items-center gap-3 py-6">
        <EmptyStateView
          variant="medallion"
          accentColor={ACCENT}
          icon={<FilterClearIcon size={24} />}
          title="No issue matches these filters"
          message={
            `${filters.length} filter${filters.length === 1 ? ' is' : 's are'} on.`
            + (best.wouldShow > 0
              ? ` Dropping ${best.label} would show ${best.wouldShow}.`
              : ` ${repo} has ${total} issue${total === 1 ? '' : 's'} altogether.`)
          }
        />
        <div className="flex gap-2 flex-wrap justify-center">
          {best.wouldShow > 0 && (
            <ButtonView size="md" variant="primary" accentColor={ACCENT} onClick={best.drop}>
              Drop {best.label}
            </ButtonView>
          )}
          {filters.length > 1 && (
            <ButtonView size="md" accentColor="var(--color-text-muted)" onClick={onClearAll}>
              Clear all
            </ButtonView>
          )}
        </div>
      </div>
    );
  }

  /* Nothing filtered, nothing there. A clean sprint, and it should look like
     one rather than like a failure. */
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <EmptyStateView
        variant="medallion"
        accentColor="var(--color-success)"
        icon={<CheckCircleIcon size={24} />}
        title="Nothing is open"
        message={
          `Every issue in ${repo} is closed.`
          + (closedRecently !== undefined && closedRecently > 0
            ? ` ${closedRecently} ${closedRecently === 1 ? 'was' : 'were'} closed in the last 90 days.`
            : closedRecently === 0
              ? ' Nothing has been closed in the last 90 days either — this repository is quiet.'
              : '')
        }
        action={onShowClosed ? { label: 'Show closed', onClick: onShowClosed } : undefined}
      />
    </div>
  );
}
