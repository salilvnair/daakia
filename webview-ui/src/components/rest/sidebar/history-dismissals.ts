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
