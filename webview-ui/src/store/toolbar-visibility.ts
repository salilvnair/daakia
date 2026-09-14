/**
 * Which of the two big surfaces sit on the toolbar.
 *
 * dk8s and dkgh are whole products inside an API client, and plenty of people
 * installed Daakia to send a request. Two icons they will never press, at the
 * bottom of a rail they use constantly, is clutter they did not ask for — so
 * each can be taken off, from its own General page in Settings.
 *
 * Taken off the rail, not turned off: the tab still exists, the command palette
 * still opens it, and a tab already open stays open. This hides a shortcut; it
 * does not remove a feature, and a switch that quietly did the second thing
 * while saying the first would be the worse kind of setting.
 *
 * Stored in `prefs`, which is already persisted to SQLite and hydrated on
 * launch, so it survives a reload without a store of its own.
 */
import { usePersistedPref } from './ui-state-store';

export type ToolbarSurface = 'dk8s' | 'dkgh';

/** The pref key for one surface. Exported so a test can name the same string. */
export function toolbarPrefKey(surface: ToolbarSurface): string {
  return `toolbar.show.${surface}`;
}

/**
 * Whether a surface shows, given whatever is stored.
 *
 * Anything other than a stored `no` shows it: an unset pref is the state every
 * existing install is in, and `prefs` arrives from the database a moment after
 * the first render, so "unknown" has to mean "shown" or every launch would
 * blink the icons out and back.
 */
export function showsOnToolbar(stored: string | undefined): boolean {
  return stored !== 'no';
}

/** The toggle, for the rail to read and the settings page to write. */
export function useShowOnToolbar(surface: ToolbarSurface): [boolean, (on: boolean) => void] {
  const [value, setValue] = usePersistedPref<'yes' | 'no'>(
    toolbarPrefKey(surface), 'yes', ['yes', 'no'],
  );
  return [showsOnToolbar(value), (on: boolean) => setValue(on ? 'yes' : 'no')];
}
