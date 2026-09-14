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

/**
 * What each surface does when nobody has said.
 *
 * dk8s stays: watching a cluster is something people reach for mid-task, from
 * wherever they are, and it has been on that rail since 3.0. dkgh does not:
 * it is a board you go to deliberately, and an issue tracker is the surface
 * most installs will never open at all. A new install gets the API client with
 * one extra icon rather than three, and Settings → DKGH → General puts it back.
 */
const DEFAULT_SHOWN: Record<ToolbarSurface, boolean> = {
  dk8s: true,
  dkgh: false,
};

/** The pref key for one surface. Exported so a test can name the same string. */
export function toolbarPrefKey(surface: ToolbarSurface): string {
  return `toolbar.show.${surface}`;
}

/**
 * Whether a surface shows, given whatever is stored.
 *
 * Only an explicit `yes` or `no` is an answer. Everything else — unset, empty,
 * a value written by some future version — falls back to the surface's own
 * default, because `prefs` arrives from the database a moment after the first
 * render and "not loaded yet" must not read as a decision: an icon that blinks
 * out and back on every launch is worse than one in the wrong state.
 */
export function showsOnToolbar(
  stored: string | undefined,
  surface: ToolbarSurface,
): boolean {
  if (stored === 'yes') return true;
  if (stored === 'no') return false;
  return DEFAULT_SHOWN[surface];
}

/** The toggle, for the rail to read and the settings page to write. */
export function useShowOnToolbar(surface: ToolbarSurface): [boolean, (on: boolean) => void] {
  const [value, setValue] = usePersistedPref<'yes' | 'no' | ''>(
    /* No fallback of its own: `showsOnToolbar` owns the default, so there is
       one place that decides and one place to change it. */
    toolbarPrefKey(surface), '', ['yes', 'no'],
  );
  return [showsOnToolbar(value, surface), (on: boolean) => setValue(on ? 'yes' : 'no')];
}
