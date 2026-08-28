/**
 * Squarified treemap layout (Bruls, Huizing, van Wijk).
 *
 * Pure geometry, kept out of the view so it can be unit tested: the failure
 * mode of a treemap bug is rectangles whose areas no longer match their values,
 * which looks plausible on screen and silently misleads. Slice-and-dice was
 * rejected because it produces slivers too thin to read or click.
 */
export interface Tile {
  x: number; y: number; w: number; h: number;
  label: string; group: string; value: number; instances?: number;
}

/**
 * Squarified treemap (Bruls, Huizing, van Wijk). Lays children into the shorter
 * edge of the remaining rectangle while the aspect ratio keeps improving.
 */
export function squarify(
  items: { name: string; value: number; instances?: number }[],
  x: number, y: number, w: number, h: number,
  group: string, out: Tile[],
) {
  const total = items.reduce((t, i) => t + i.value, 0);
  if (total <= 0 || w <= 0 || h <= 0) return;

  let rest = items.slice();
  let rx = x, ry = y, rw = w, rh = h;
  let remaining = total;

  while (rest.length) {
    const horizontal = rw >= rh;
    const side = horizontal ? rh : rw;
    const scale = (horizontal ? rw : rh) / remaining;

    // Grow the row while the worst aspect ratio improves.
    const row: typeof rest = [];
    let rowSum = 0;
    let best = Infinity;
    while (rest.length) {
      const next = rest[0];
      const sum = rowSum + next.value;
      const thickness = sum * scale;
      const worst = Math.max(
        ...[...row, next].map(i => {
          const len = (i.value / sum) * side;
          return Math.max(thickness / (len || 1e-9), (len || 1e-9) / (thickness || 1e-9));
        }),
      );
      if (row.length && worst > best) break;
      row.push(rest.shift()!);
      rowSum = sum;
      best = worst;
    }

    const thickness = rowSum * scale;
    let offset = 0;
    for (const item of row) {
      const len = (item.value / rowSum) * side;
      out.push(horizontal
        ? { x: rx, y: ry + offset, w: thickness, h: len, label: item.name, group, value: item.value, instances: item.instances }
        : { x: rx + offset, y: ry, w: len, h: thickness, label: item.name, group, value: item.value, instances: item.instances });
      offset += len;
    }

    if (horizontal) { rx += thickness; rw -= thickness; }
    else { ry += thickness; rh -= thickness; }
    remaining -= rowSum;
  }
}

