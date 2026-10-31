/**
 * "Do not tell me about this one again."
 *
 * ── Why these live in the browser and not the database ──
 *
 * A dismissal is a statement about what you want to be shown, not a fact about
 * the data. Synced to a teammate through Git Sync it would be a decision made
 * on their behalf — and the one it would silence is the secret sweep, which is
 * precisely the card nobody should be able to switch off for somebody else.
 *
 * Each kind of card keeps its own list, so saying "that token is fine where it
 * is" never quiets a save suggestion, and clearing one is a thing that can be
 * offered separately.
 */

export type DismissKind = 'save' | 'secret' | 'failure';

const KEYS: Record<DismissKind, string> = {
  save: 'daakia.history.saveSuggestions.dismissed',
  secret: 'daakia.history.secretSweep.dismissed',
  failure: 'daakia.history.firstFailure.dismissed',
};

/**
 * Read one list.
 *
 * Storage that is blocked or full means the card asks again next time, which
 * is a better failure than a card that will not render.
 */
export function loadDismissed(kind: DismissKind): Set<string> {
  try {
    const raw = localStorage.getItem(KEYS[kind]);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

export function rememberDismissed(kind: DismissKind, keys: ReadonlySet<string>): void {
  try { localStorage.setItem(KEYS[kind], JSON.stringify([...keys])); } catch { /* as above */ }
}

// ── Snoozing the strip ──────────────────────────────────────────────────────

/**
 * "Not now" for the suggestions above History, rather than "never".
 *
 * The ✕ only knew "do not suggest this one again", which is the wrong answer to
 * "I am busy": it silences a suggestion for good to get it off the screen for
 * an afternoon. These hide the strip for a while instead — until Daakia opens
 * again, for the rest of today, or for a week.
 *
 * Secret-sweep findings still show while snoozed. A token sitting where it
 * should not is the one card nobody should lose by being tidy; each of those
 * keeps its own "Not a secret".
 */
export type InsightSnooze = 'session' | 'today' | 'week';

const SNOOZE_KEY = 'daakia.history.insights.snoozedUntil';
/* Until the webview — Daakia's panel — is opened again. Module state is exactly
   that long-lived. */
let snoozedThisSession = false;

/** When a snooze chosen at `now` ends; undefined for "until Daakia opens again". */
export function snoozeEnd(kind: InsightSnooze, now: number = Date.now()): number | undefined {
  if (kind === 'session') return undefined;
  if (kind === 'week') return now + 7 * 24 * 60 * 60 * 1000;
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  return end.getTime();
}

export function snoozeInsights(kind: InsightSnooze, now: number = Date.now()): void {
  const until = snoozeEnd(kind, now);
  if (until === undefined) { snoozedThisSession = true; return; }
  try { localStorage.setItem(SNOOZE_KEY, String(until)); } catch { /* storage blocked: this session only */ snoozedThisSession = true; }
}

export function insightsSnoozed(now: number = Date.now()): boolean {
  if (snoozedThisSession) return true;
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    return until > now;
  } catch {
    return false;
  }
}

/** For tests. */
export function _resetSnooze(): void {
  snoozedThisSession = false;
  try { localStorage.removeItem(SNOOZE_KEY); } catch { /* fine */ }
}
