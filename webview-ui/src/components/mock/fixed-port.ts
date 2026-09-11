/**
 * Choosing the port a mock server listens on.
 *
 * ── Why it is a setting and not just a box ──
 *
 * Almost nobody needs it. A mock server is something you point a client at,
 * and the extension finding a free port in its range is the right default —
 * it always works, and nothing collides. But the people who do need a fixed
 * port really need it: a client with a hard-coded base URL, a config file in
 * somebody else's repository, a docker-compose that maps 8080.
 *
 * So the box is behind a toggle that is off by default. With it off nothing
 * changes and there is no extra field on the create dialog; with it on, both
 * creating a server and opening one offer the port.
 */
import { useUiStateStore } from '../../store/ui-state-store';

/** The preference id. Absent means off, which is the default. */
export const FIXED_PORT_PREF = 'mock.fixedPort';

export function useFixedPortEnabled(): boolean {
  return useUiStateStore(s => s.prefs[FIXED_PORT_PREF]) === 'on';
}

export function setFixedPortEnabled(on: boolean): void {
  useUiStateStore.getState().setPref(FIXED_PORT_PREF, on ? 'on' : 'off');
}

/**
 * What to send as `requestedPort`, out of whatever is in the box.
 *
 * Mirrors `wantedPort` in `mock/mock-server-manager.ts`, and has to: the two
 * sides of the webview boundary do not share types, and the host is the one
 * that would bind `NaN` to a random port and report success. Rejecting it here
 * as well means the bad value never leaves the screen it was typed on.
 */
export function portToSend(text: string, enabled: boolean): number | undefined {
  if (!enabled) return undefined;
  const n = Number(text.trim());
  if (!text.trim() || !Number.isInteger(n)) return undefined;
  return n >= 1024 && n <= 65535 ? n : undefined;
}

/**
 * What is wrong with what is in the box, if anything.
 *
 * Empty is not wrong — it means "find me one", which is what the server does
 * with no request at all. Everything else that is not a port is said plainly
 * rather than silently ignored, because silently ignoring it is how somebody
 * ends up believing their server is on 80.
 */
export function portProblem(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return 'A port is a whole number.';
  if (n < 1024) return 'Ports below 1024 need administrator rights.';
  if (n > 65535) return 'The highest port is 65535.';
  return '';
}
