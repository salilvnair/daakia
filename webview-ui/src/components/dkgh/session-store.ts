/**
 * What survives the credential dying under you.
 *
 * Tokens expire, SSO sessions lapse, admins revoke. It never happens on the
 * sign-in screen — it happens on the third card of a triage session, and the
 * board has to fail in a way that does not lose what you were doing.
 *
 * So this store is deliberately not a copy of the board. It holds the things
 * that exist only in this window and would be gone forever: a draft nobody has
 * filed, a selection somebody spent a minute building, a write that was in
 * flight. The issues themselves live in GitHub and come back on their own.
 *
 * ── The rule about the queued write ──
 *
 * It is never replayed automatically. Minutes have passed and somebody else may
 * have moved that card; replaying a stale intention silently is exactly how a
 * status board ends up wrong. It is offered, with what it would do, and the
 * reader decides.
 */
import { create } from 'zustand';

/** One thing being held, as the recovery screen lists it. */
export interface HeldItem {
  id: string;
  /** What it is, in the reader's terms. */
  label: string;
  /**
   * `kept` survived and needs nothing. `dropped` did not — and saying so is the
   * point: a recovery screen that lists only the good news is not a report.
   */
  fate: 'kept' | 'dropped';
  /** For a dropped write, what it would have done if offered again. */
  replay?: { label: string; request: unknown };
}

interface SessionState {
  /** Set the moment any gh call comes back with the credential gone. */
  signedOut: boolean;
  /** gh's own words, for the screen. */
  detail?: string;
  /** When it happened, so the stale board can state its own age. */
  at?: number;
  held: HeldItem[];

  /** Called from the runner's signal. Idempotent — several calls may fail at once. */
  sessionEnded: (detail: string, at: number) => void;
  /** Anything worth carrying across the gap registers itself here. */
  hold: (item: HeldItem) => void;
  release: (id: string) => void;
  /** After signing back in. Clears the flag; the held list is cleared by the screen. */
  resumed: () => void;
}

export const useGhSession = create<SessionState>((set) => ({
  signedOut: false,
  held: [],

  sessionEnded: (detail, at) => set(s => (
    /* Several calls can fail together — the first one owns the message, so the
       screen does not flicker between three ways of saying the same thing. */
    s.signedOut ? s : { ...s, signedOut: true, detail, at }
  )),

  hold: (item) => set(s => ({
    ...s,
    held: [...s.held.filter(h => h.id !== item.id), item],
  })),

  release: (id) => set(s => ({ ...s, held: s.held.filter(h => h.id !== id) })),

  resumed: () => set(s => ({ ...s, signedOut: false, detail: undefined })),
}));

/**
 * Wire the store to the host's signal.
 *
 * Called once from the panel. Separate from the store so the store stays a
 * plain object a test can drive without a message bus.
 */
export function listenForSignOut(): () => void {
  const handler = (evt: MessageEvent) => {
    const msg = evt.data as Record<string, unknown>;
    if (msg?.type !== 'dkgh:signedOut') return;
    useGhSession.getState().sessionEnded(
      (msg.detail as string) ?? '',
      (msg.at as number) ?? Date.now(),
    );
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
