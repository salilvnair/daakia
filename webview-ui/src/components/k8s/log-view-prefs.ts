/**
 * The two reading modes a log view opens in, remembered.
 *
 * ── Why they are preferences and not state ──
 *
 * Wrapping long lines and folding stack traces are not decisions about a
 * particular pod — they are how somebody reads logs. Held as component state
 * they were re-decided on every mount: turn wrapping off to line up a column
 * of ids, open a different pod, and it is back on. Turn it off again.
 *
 * So they default on, because that is right for most lines most of the time,
 * and the moment somebody says otherwise that is the answer until they say
 * something else.
 *
 * ── Why `!== 'off'` rather than `=== 'on'` ──
 *
 * The default has to survive an empty preference store — a first run, a
 * cleared workspace, a pref that has not loaded yet. Reading for the negative
 * makes "nothing recorded" mean on, which is the default; reading for the
 * positive would make every cold start open unwrapped and unfolded until the
 * prefs arrived, which is a flicker on a screen full of text.
 */
import { useUiStateStore } from '../../store/ui-state-store';

export const LOG_WRAP_PREF = 'dk8s.logs.wrap';
export const LOG_FOLD_PREF = 'dk8s.logs.fold';

/** On unless it has been turned off. */
export function prefOn(prefs: Record<string, string>, key: string): boolean {
  return prefs[key] !== 'off';
}

/** Read the current value outside React — for stores opening a new pane. */
export function logModeDefault(key: string): boolean {
  return prefOn(useUiStateStore.getState().prefs, key);
}

export function useLogWrapDefault(): boolean {
  return useUiStateStore(s => prefOn(s.prefs, LOG_WRAP_PREF));
}

export function useLogFoldDefault(): boolean {
  return useUiStateStore(s => prefOn(s.prefs, LOG_FOLD_PREF));
}

/** Record a mode the reader just chose. */
export function rememberLogMode(key: string, on: boolean): void {
  useUiStateStore.getState().setPref(key, on ? 'on' : 'off');
}
