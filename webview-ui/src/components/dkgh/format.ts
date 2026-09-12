/**
 * The clock, in one place.
 *
 * The host sends ISO strings and epoch millis and never a rendered duration,
 * because "2h ago" is only true at the moment it is written and a webview that
 * stays open all afternoon would show it for hours. Formatting here means the
 * number is computed at render, which is the only time it is right.
 */

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** "just now", "4m ago", "2h ago", "6d ago", "2y ago". */
export function since(at: number | undefined): string {
  if (!at) return 'never';
  const ms = Math.max(0, Date.now() - at);
  if (ms < MIN) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
  const days = Math.floor(ms / DAY);
  if (days < 31) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** The same, from an ISO string — what gh returns for `pushedAt`. */
export function sinceIso(iso: string | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '—' : since(t);
}

/** "in 11 minutes", for a rate limit that resets. Rounded up: a reset that
    says "in 0 minutes" and is not ready yet is worse than one that waits. */
export function until(at: number | undefined): string {
  if (!at) return 'shortly';
  const ms = at - Date.now();
  if (ms <= 0) return 'now';
  if (ms < MIN) return 'in under a minute';
  const mins = Math.ceil(ms / MIN);
  if (mins < 60) return `in ${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.ceil(mins / 60);
  return `in ${hours} hour${hours === 1 ? '' : 's'}`;
}

/** "14:32" — the wall clock, for a limit that lifts at a particular time. */
export function atClock(at: number | undefined): string {
  if (!at) return '';
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** "3 forms", "no forms" — the fact that decides what the board can group by. */
export function formsLabel(templates: number | undefined): string {
  if (templates === undefined) return 'forms unknown';
  return templates === 0 ? 'no forms' : `${templates} form${templates === 1 ? '' : 's'}`;
}
