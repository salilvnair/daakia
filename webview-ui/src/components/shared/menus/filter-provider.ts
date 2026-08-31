/**
 * Filters a surface can offer on its own content.
 *
 * The context menu already lets a surface opt into extra sections with
 * `data-selection-actions`, but Copy / Ask AI / Search are all things the menu
 * can do knowing nothing about the surface. "Filter by thread name" is not:
 * the values come from the lines currently on screen, and only the view that
 * holds them can produce that list.
 *
 * So the menu asks. A surface registers a provider while it is mounted, the
 * menu calls it when it opens over an element that opted in, and the menu
 * itself stays free of any knowledge about logs.
 *
 * One provider at a time, deliberately. Two log views are never both visible,
 * and a registry keyed by element would be machinery for a case that does not
 * exist — the mount/unmount pair below is enough, and the guard in
 * `clearFilterProvider` is what stops an unmounting view from clearing the
 * provider a newly mounted one has just set.
 */

export interface FilterGroup {
  /** `Thread name`, `Logger` — the submenu's own label. */
  label: string;
  /** Stable id, used to key the submenu. */
  id: string;
  /**
   * One line at the top of the submenu qualifying what the counts mean.
   *
   * It belongs here rather than on each option because it is the same
   * statement for all of them: putting "of 21 shown" beside fifteen values
   * repeated one fact fifteen times, and made the hint column wide enough to
   * push the values themselves out of view.
   */
  note?: string;
  options: {
    /** What the person reads. */
    label: string;
    /** Shown to the right — usually a count. */
    hint?: string;
    /** Applied when chosen. */
    apply: () => void;
  }[];
}

export interface FilterMenu {
  /** Groups of values, each becoming a submenu. */
  groups: FilterGroup[];
  /**
   * The current selection as a filter, when there is one.
   *
   * Double-clicking a word selects it, and "filter by the thing I just
   * double-clicked" is the fastest route to a narrowed log there is — so it
   * sits at the top rather than behind a group.
   */
  selection?: { label: string; apply: () => void };
  /** Present only when a filter is actually set, so it is never a no-op. */
  clear?: () => void;
}

type Provider = () => FilterMenu | null;

let provider: Provider | null = null;

export function setFilterProvider(fn: Provider): void {
  provider = fn;
}

/**
 * Unregister, but only if the caller is still the current provider.
 *
 * React can mount the next view before unmounting the last one, so an
 * unconditional clear in a cleanup function removes the provider that the
 * incoming view has already installed — and the menu then quietly offers no
 * filters at all.
 */
export function clearFilterProvider(fn: Provider): void {
  if (provider === fn) provider = null;
}

export function getFilterMenu(): FilterMenu | null {
  return provider?.() ?? null;
}
