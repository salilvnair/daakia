/**
 * How often a monitor runs.
 *
 * Intervals used to be whole minutes, which made "every 30 seconds" impossible
 * and "every 2 hours" a number nobody wants to read as `120`. So the stored
 * value is seconds, and the UI is a value plus a unit.
 *
 * The presets stay, because five clicks cover almost every real monitor and a
 * dropdown for the common case is friction. Custom is for the rest.
 */

export type IntervalUnit = 's' | 'm' | 'h';

export const UNIT_SECONDS: Record<IntervalUnit, number> = { s: 1, m: 60, h: 3600 };

export const UNIT_LABEL: Record<IntervalUnit, string> = {
  s: 'seconds',
  m: 'minutes',
  h: 'hours',
};

/**
 * The shortest interval that can be saved.
 *
 * Not a technical limit — a courtesy one, and the same number the host
 * enforces. A monitor points at somebody's real service, and a one-second poll
 * left running over a weekend is 600,000 requests nobody asked for.
 */
export const MIN_INTERVAL_SECONDS = 10;

/** A day. Beyond this it is not a monitor, it is a reminder. */
export const MAX_INTERVAL_SECONDS = 86_400;

export const INTERVAL_PRESETS: { label: string; seconds: number }[] = [
  { label: '30s', seconds: 30 },
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '1h', seconds: 3600 },
];

/** Reads back as the shortest thing that is still exact: 90s stays 90s, 120s becomes 2m. */
export function formatInterval(seconds: number): string {
  if (seconds <= 0) return '—';
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

/** Splits a stored value into the pair the custom control edits. */
export function toValueUnit(seconds: number): { value: number; unit: IntervalUnit } {
  if (seconds > 0 && seconds % 3600 === 0) return { value: seconds / 3600, unit: 'h' };
  if (seconds > 0 && seconds % 60 === 0) return { value: seconds / 60, unit: 'm' };
  return { value: seconds, unit: 's' };
}

export interface IntervalCheck {
  seconds: number;
  /** Null when the pair is usable. */
  error: string | null;
}

/**
 * Validates the custom pair.
 *
 * Returns the error rather than throwing or silently clamping: a value quietly
 * rounded up to the minimum is a monitor running at a rate its owner did not
 * choose and cannot see.
 */
export function checkInterval(value: number, unit: IntervalUnit): IntervalCheck {
  if (!Number.isFinite(value) || value <= 0) {
    return { seconds: 0, error: 'Enter how often to check.' };
  }
  if (!Number.isInteger(value)) {
    return { seconds: 0, error: 'Whole numbers only.' };
  }
  const seconds = value * UNIT_SECONDS[unit];
  if (seconds < MIN_INTERVAL_SECONDS) {
    return { seconds, error: `Ten seconds is the shortest interval — this is somebody's real service.` };
  }
  if (seconds > MAX_INTERVAL_SECONDS) {
    return { seconds, error: 'A day is the longest interval. Beyond that it is a reminder, not a monitor.' };
  }
  return { seconds, error: null };
}

/**
 * Rules saved before intervals had a unit carried `intervalMinutes`.
 *
 * Migrated on read rather than in a one-off pass: this lives in localStorage,
 * where there is no migration step to hang a rewrite on, and a rule written by
 * an older build can arrive at any time.
 */
export function readIntervalSeconds(rule: { intervalSeconds?: number; intervalMinutes?: number }): number {
  if (typeof rule.intervalSeconds === 'number' && rule.intervalSeconds > 0) return rule.intervalSeconds;
  if (typeof rule.intervalMinutes === 'number' && rule.intervalMinutes > 0) return rule.intervalMinutes * 60;
  return 300;
}
