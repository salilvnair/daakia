/**
 * Turning the treemap's grouped data into one ranked list.
 *
 * Small enough to inline, except for one thing that is easy to get wrong in a
 * way nothing would report: the rollup rows.
 */

export interface BarRow {
  className: string;
  group: string;
  bytes: number;
  instances?: number;
}

/**
 * A rollup row, not a class.
 *
 * The treemap query folds the tail of each package into `… 196 more` so the
 * chart has a bounded number of tiles. As a TILE that is fine — it is one
 * region of a package's area, and it is labelled. Flattened into a list it
 * reads as a class named "… 196 more", and clicking it would narrow the object
 * set to a class name that matches nothing, leaving an empty view with no
 * indication that the click was meaningless.
 */
export function isRollup(className: string): boolean {
  return className.startsWith('… ');
}

/** Every class across every package, largest first. */
export function toBarRows(
  groups: { name: string; children: { name: string; bytes: number; instances: number }[] }[],
): BarRow[] {
  return groups
    .flatMap(g => g.children.map(c => ({
      className: c.name, group: g.name, bytes: c.bytes, instances: c.instances,
    })))
    .sort((a, b) => b.bytes - a.bytes);
}
