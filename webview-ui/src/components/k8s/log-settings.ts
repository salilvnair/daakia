/**
 * How many lines every log control offers, and which one it starts on.
 *
 * ── Why this is a setting and not a constant ──
 *
 * Four dropdowns in dk8s ask "how many lines", and all four had their ladders
 * written into the JSX beside them: the log tail offered 100 to 5,000, the
 * search offered a context of at most ±5, the archive scan offered 1,000 to
 * 100,000. Every one of those numbers is a guess about somebody else's logs. A
 * service that writes four lines a request and one that writes four hundred
 * are both normal, and no ladder is right for both.
 *
 * So the ladder itself is configurable. A control renders the numbers it is
 * given, in order, and nothing in a component decides what a sensible amount
 * of log is.
 *
 * ── The shape of a stored ladder ──
 *
 * A comma-separated list of numbers, because that is what somebody types. It
 * is parsed defensively in one place: a blank, a stray word, a negative, or a
 * list of one absurd number all fall back to the built-in ladder rather than
 * leaving a dropdown with nothing in it — an empty `<select>` is a control
 * that cannot be used at all, which is worse than a ladder somebody dislikes.
 */

export const LOG_TAIL_LADDER_KEY = 'dk8s.logs.tailLadder';
export const LOG_TAIL_DEFAULT_KEY = 'dk8s.logs.tailDefault';
export const LOG_CONTEXT_LADDER_KEY = 'dk8s.logs.contextLadder';
export const LOG_CONTEXT_DEFAULT_KEY = 'dk8s.logs.contextDefault';
export const LOG_ARCHIVE_LADDER_KEY = 'dk8s.logs.archiveLadder';

/**
 * The built-in ladders — what these controls offered before anybody could
 * change them, so nothing moves for somebody who never opens the setting.
 *
 * The context ladder is the one exception: it stopped at ±5, and ±5 does not
 * answer "what happened around this logger", which is the question people are
 * asking when they turn it on at all. It reaches further now.
 */
export const DEFAULT_TAIL_LADDER = [100, 200, 500, 1000, 5000];
export const DEFAULT_CONTEXT_LADDER = [0, 1, 2, 5, 10, 25, 50, 100];
export const DEFAULT_ARCHIVE_LADDER = [1000, 5000, 20000, 100000];

export const DEFAULT_TAIL = 200;
export const DEFAULT_CONTEXT = 2;

/** Nothing above this: a single fetch has to stay something a panel can hold. */
export const MAX_LINES = 500_000;

/**
 * A stored ladder, or the built-in one.
 *
 * Sorted and de-duplicated, because a dropdown whose numbers jump around reads
 * as broken even when every entry is one somebody typed on purpose.
 */
export function ladder(stored: string | undefined, fallback: readonly number[]): number[] {
  const parsed = [...new Set(
    (stored ?? '')
      .split(/[,\s]+/)
      .map(s => s.trim())
      /* `Number('')` is 0, so a blank box would produce a ladder of one rung
         reading "0 lines" rather than falling back to the built-in one. */
      .filter(Boolean)
      .map(Number)
      .filter(n => Number.isFinite(n) && n >= 0 && n <= MAX_LINES)
      .map(n => Math.round(n)),
  )].sort((a, b) => a - b);
  return parsed.length ? parsed : [...fallback];
}

/** A ladder as it is written back into the box. */
export function ladderText(values: readonly number[]): string {
  return values.join(', ');
}

/**
 * Which rung a control starts on.
 *
 * It has to be ON the ladder: a default of 200 against a ladder that no longer
 * contains 200 gives a `<select>` with nothing selected, which renders as the
 * first option while the state says something else — the control then lies
 * about what the next fetch will do.
 */
export function defaultOf(
  stored: string | undefined, rungs: readonly number[], fallback: number,
): number {
  /* Blank has to be read as "nothing stored" BEFORE it reaches `Number`, which
     turns it into 0 — and 0 is a real rung on the context ladder, so a store
     that had never been written would resolve to "no surrounding lines". */
  const raw = (stored ?? '').trim();
  const n = raw === '' ? NaN : Number(raw);
  if (Number.isFinite(n) && rungs.includes(Math.round(n))) return Math.round(n);
  if (rungs.includes(fallback)) return fallback;
  /* Neither is available, so take the rung nearest the one we wanted rather
     than the smallest — a silent drop to "0 lines" looks like a broken fetch. */
  return rungs.reduce(
    (best, r) => (Math.abs(r - fallback) < Math.abs(best - fallback) ? r : best),
    rungs[0] ?? fallback,
  );
}

/** Snap a value onto the ladder, for state stored before the ladder changed. */
export function onLadder(value: number, rungs: readonly number[], fallback: number): number {
  return rungs.includes(value) ? value : defaultOf(undefined, rungs, fallback);
}

export interface LogLineSettings {
  tailLadder: number[];
  tailDefault: number;
  contextLadder: number[];
  contextDefault: number;
  archiveLadder: number[];
}

export function logLineSettings(prefs: Record<string, string>): LogLineSettings {
  const tailLadder = ladder(prefs[LOG_TAIL_LADDER_KEY], DEFAULT_TAIL_LADDER);
  const contextLadder = ladder(prefs[LOG_CONTEXT_LADDER_KEY], DEFAULT_CONTEXT_LADDER);
  return {
    tailLadder,
    tailDefault: defaultOf(prefs[LOG_TAIL_DEFAULT_KEY], tailLadder, DEFAULT_TAIL),
    contextLadder,
    contextDefault: defaultOf(prefs[LOG_CONTEXT_DEFAULT_KEY], contextLadder, DEFAULT_CONTEXT),
    archiveLadder: ladder(prefs[LOG_ARCHIVE_LADDER_KEY], DEFAULT_ARCHIVE_LADDER),
  };
}

/** `±2 lines around`, and the two readings that are not a number of lines. */
export function contextLabel(n: number): string {
  if (n === 0) return 'no surrounding lines';
  return `±${n.toLocaleString()} line${n === 1 ? '' : 's'} around`;
}

export function tailLabel(n: number): string {
  return `${n.toLocaleString()} line${n === 1 ? '' : 's'}`;
}

/**
 * Read every line the pod still holds, however many that is.
 *
 * `kubectl logs --tail=-1` is kubectl's own way of saying "all of it", so the
 * sentinel is the flag: it travels to `searchArgs` and is interpolated
 * straight in, with nothing along the way needing to know it is special.
 *
 * Only the SEARCH offers it. A search keeps matching lines and discards the
 * rest as they stream past, so the cost is bandwidth and time; the log VIEW
 * would have to hold every line it read, and "show me a million lines" is not
 * a thing to offer behind an innocent dropdown.
 */
export const ALL_LINES = -1;

/**
 * How far back a search reads, said in words.
 *
 * "last 5,000" is a bound and reads like one. Everything is not a bound, and
 * calling it "last -1" or "last 999,999" would be pretending it is.
 */
export function searchDepthLabel(n: number): string {
  return n === ALL_LINES ? 'everything the pod holds' : `last ${n.toLocaleString()}`;
}

/**
 * Whether a depth is going to read the whole log.
 *
 * The screen says so before the search runs. A pod with a week of output
 * behind it is a large transfer, and across a VPN the difference between
 * "last 5,000" and everything is the difference between a search and a wait.
 */
export function readsEverything(n: number): boolean {
  return n === ALL_LINES;
}
