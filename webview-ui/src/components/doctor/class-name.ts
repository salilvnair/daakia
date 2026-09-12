/**
 * JVM type descriptors, made readable.
 *
 * A heap dump names types the way the class file does: `[B` for a byte array,
 * `[Ljava.lang.Object;` for an object array, `$` between an outer class and
 * its nested one. That is exactly right as an identifier and unreadable as a
 * label — a histogram whose top row says `[B` has told the reader nothing,
 * and the row under it saying `[Ljava.util.concurrent.ConcurrentHashMap$Node;`
 * is worse, because the part that matters is buried in the middle of it.
 *
 * Decoding happens HERE, in the view, not in the engine. The rule pack matches
 * on the raw form — `container.oversized-backing-arrays` looks for
 * `^\[L(java\.lang\.Object|…);$` — and the evidence pack sends the canonical
 * name to the model. Prettifying at the source would quietly break the first
 * and change what the second means. So the engine keeps the truth and the
 * screen gets the translation.
 */

/** The eight primitive descriptors, as the JVM spec numbers them. */
const PRIMITIVES: Record<string, string> = {
  B: 'byte', C: 'char', D: 'double', F: 'float',
  I: 'int', J: 'long', S: 'short', Z: 'boolean',
};

export interface DecodedClass {
  /** `java.util.concurrent` — dimmed, because it repeats down the whole list. */
  packageName: string;
  /** `ConcurrentHashMap.Node[]` — the part worth reading, arrays included. */
  simpleName: string;
  /** How many `[` were on the front. 0 for a plain type. */
  arrayDepth: number;
  /** A primitive array like `[B`. It has no package and no source to open. */
  primitive: boolean;
  /** What the engine calls it. Kept so a click can still query by identity. */
  raw: string;
}

export function decodeClassName(raw: string): DecodedClass {
  let s = raw;
  let arrayDepth = 0;
  while (s.startsWith('[')) { s = s.slice(1); arrayDepth++; }

  const suffix = '[]'.repeat(arrayDepth);

  // `[B`, `[[I` — a primitive array. The element letter is the whole name.
  if (arrayDepth > 0 && s.length === 1 && PRIMITIVES[s]) {
    return {
      packageName: '',
      simpleName: `${PRIMITIVES[s]}${suffix}`,
      arrayDepth,
      primitive: true,
      raw,
    };
  }

  // `[Ljava.lang.Object;` — an object array. Unwrap to the element type.
  if (arrayDepth > 0 && s.startsWith('L') && s.endsWith(';')) {
    s = s.slice(1, -1);
  }

  const lastDot = s.lastIndexOf('.');
  const packageName = lastDot === -1 ? '' : s.slice(0, lastDot);
  // `Map$Entry` is one type spelled with a `$`. A reader thinks of it as
  // `Map.Entry`, and the dollar is a detail of how the compiler names files.
  const simple = (lastDot === -1 ? s : s.slice(lastDot + 1)).replace(/\$/g, '.');

  return {
    packageName,
    simpleName: `${simple}${suffix}`,
    arrayDepth,
    primitive: false,
    raw,
  };
}

/**
 * The whole name on one line, for a tooltip or a copy.
 *
 * Not for the table — there the package is dimmed and the simple name is not,
 * and that needs two elements rather than one string.
 */
export function fullClassName(raw: string): string {
  const d = decodeClassName(raw);
  return d.packageName ? `${d.packageName}.${d.simpleName}` : d.simpleName;
}
