/**
 * Package filtering for the heap views.
 *
 * Taken from JProfiler's MCP, which puts a `packageFilter` on every heap view
 * it exposes. It is the one thing in their heap API we did not have, and it is
 * worth having for a plain reason: every Java heap is topped by `byte[]`,
 * `char[]`, `String` and `HashMap$Node`, and none of those are yours. Being
 * able to say "only com.zapper" turns a class list you skim into one you read.
 *
 * Prefix matching, at package boundaries — see `matchesPackages`.
 */

/**
 * Split what the user typed into prefixes.
 *
 * Comma-separated to match JProfiler, but whitespace and newlines work too,
 * because people paste package lists out of stack traces and build files.
 * Empty entries are dropped rather than becoming a prefix that matches
 * everything.
 */
export function parsePackageFilter(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/[,\s]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Strip a class name down to the type a package prefix should be compared to.
 *
 * The heap holds array types in JVM descriptor form, so an array of your class
 * arrives as `[Lcom.zapper.Order;` and a nested array as `[[Lcom.zapper.Order;`.
 * Comparing a prefix against that raw string fails, which would hide exactly
 * the arrays a leak hunt cares about — the backing store of a growing
 * collection is an array of the accumulating type.
 *
 * Primitive arrays (`[B`, `[[I`) have no package and reduce to an empty string,
 * so they never match a package filter. That is correct: `byte[]` belongs to no
 * package, and a filter is a request to stop seeing it.
 */
export function baseTypeOf(className: string): string {
  let s = className;
  while (s.startsWith('[')) s = s.slice(1);
  // `Lcom.zapper.Order;` — the object-array element type.
  if (s.startsWith('L') && s.endsWith(';')) return s.slice(1, -1);
  // A primitive array element: B, C, D, F, I, J, S, Z.
  if (s.length === 1 && 'BCDFIJSZ'.includes(s)) return '';
  return s;
}

/**
 * Does this class fall under one of the prefixes?
 *
 * Matching is on a package boundary, not a bare `startsWith`: a filter of
 * `com.zapper` must not pull in `com.zapperx.Thing`, which is a different
 * organisation's code that happens to share seven letters. So a prefix matches
 * when the name equals it, or continues with `.` or `$` — the latter because
 * `com.zapper.Order$Item` is an inner class of something the filter asked for.
 *
 * An empty prefix list matches everything, so an empty box is not a filter that
 * hides the entire heap.
 */
/**
 * The JVM descriptor for a name someone can actually read.
 *
 * `byte[]` is what the UI shows and `[B` is what the heap calls it, and until
 * now only the second one could be typed or stored. Narrowing to a class put
 * the raw descriptor into the filter box — so the breadcrumb read `class [B`
 * and the box read `[B`, which is the engine's spelling leaking into the one
 * place a person is expected to type.
 *
 * Accepting both means the friendly form can be the stored filter, and the
 * display and the value stay the same string. Anything without a trailing
 * `[]` is returned unchanged: a plain class name is already its own filter.
 */
export function toDescriptor(name: string): string {
  let s = name.trim();
  let depth = 0;
  while (s.endsWith('[]')) { s = s.slice(0, -2); depth++; }
  if (depth === 0) return name;

  const prim: Record<string, string> = {
    byte: 'B', char: 'C', double: 'D', float: 'F',
    int: 'I', long: 'J', short: 'S', boolean: 'Z',
  };
  const el = prim[s] ? prim[s] : `L${s};`;
  return '['.repeat(depth) + el;
}

export function matchesPackages(className: string, prefixes: string[]): boolean {
  if (prefixes.length === 0) return true;

  /*
    An exact name matches itself, whatever shape it is.

    Checked before `baseTypeOf`, which returns nothing for a primitive array —
    correct for package filtering, since `byte[]` has no package, but it also
    meant no filter could ever select one. Narrowing the object set to the
    `[B` row, which is the biggest row in most heaps, silently produced an
    empty list.
  */
  if (prefixes.includes(className)) return true;
  // ...and the same name written the way a person reads it.
  if (prefixes.some(p => toDescriptor(p) === className)) return true;

  const name = baseTypeOf(className);
  if (!name) return false;

  for (const p of prefixes) {
    if (!name.startsWith(p)) continue;
    if (name.length === p.length) return true;
    const next = name[p.length];
    if (next === '.' || next === '$') return true;
  }
  return false;
}

/** Keep the rows whose class falls under the filter. */
export function filterByPackages<T>(
  rows: T[],
  prefixes: string[],
  nameOf: (row: T) => string,
): T[] {
  if (prefixes.length === 0) return rows;
  return rows.filter(r => matchesPackages(nameOf(r), prefixes));
}
