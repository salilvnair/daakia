/**
 * Reading a log's own timestamps as instants.
 *
 * A line like `2026-08-30 06:32:25` names no zone, so turning it into an
 * instant means assuming one — and the assumption used to be the reader's.
 * A pod writing UTC, read by someone on CST, put every archived line five
 * hours from where it belonged: a search for "the last hour" returned nothing
 * while the log plainly held matching lines, and a window over a past day
 * returned the wrong day's. Nothing on screen could show the mistake, because
 * both the line and the window looked correct on their own.
 *
 * The zone the log is written in is a property of the log, so it is configured
 * once beside the mounts rather than asked for at every search.
 */

/** RFC3339 or a bare `2026-08-30 06:32:25` at the head of a line. */
export const LOG_TS = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)(Z|[+-]\d{2}:?\d{2})?/;

/** The parts of `date` as they read in `timeZone`. */
function partsIn(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const got: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') got[p.type] = Number(p.value);
  }
  return {
    year: got.year, month: got.month, day: got.day,
    // `hour12: false` renders midnight as 24 in some runtimes.
    hour: got.hour === 24 ? 0 : got.hour,
    minute: got.minute, second: got.second,
  };
}

/** How far `timeZone` sits from UTC at `date`, in milliseconds. */
export function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * A zoneless `YYYY-MM-DDTHH:mm:ss` reading, as an instant in `timeZone`.
 *
 * Resolved twice, because the offset itself depends on the instant: near a
 * daylight-saving change the first guess can land on the wrong side of the
 * transition, and re-deriving the offset at the corrected instant settles it.
 */
export function zonedToUtcMs(naive: string, timeZone: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:[.,](\d+))?/.exec(naive);
  if (!m) return NaN;
  const [y, mo, d, h, mi, sec] = m.slice(1, 7).map(v => Number(v ?? 0));
  const frac = m[7] ? Number(`0.${m[7]}`) * 1000 : 0;
  const wall = Date.UTC(y, mo - 1, d, h, mi, sec || 0, Math.floor(frac));
  let ms = wall - zoneOffsetMs(new Date(wall), timeZone);
  ms = wall - zoneOffsetMs(new Date(ms), timeZone);
  return ms;
}

/**
 * The instant at the head of a log line, or `undefined` if it has none.
 *
 * A timestamp carrying its own offset is already unambiguous and is taken as
 * written — the configured zone only ever fills in what the log left out.
 */
export function parseLogTime(line: string, timeZone = 'UTC'): number | undefined {
  const m = LOG_TS.exec(line);
  if (!m) return undefined;
  const [, stamp, offset] = m;
  const t = offset
    ? Date.parse(`${stamp.replace(' ', 'T')}${offset}`)
    : zonedToUtcMs(stamp, timeZone);
  return Number.isFinite(t) ? t : undefined;
}
