/**
 * A JVM type descriptor, as a person would write it.
 *
 * `[B` is what the class file calls a byte array, and it is what a heap dump
 * and a flight recording both hand back. It is also the single least readable
 * thing either view can put in front of someone: a leak headline reading
 * "accumulating 237 × [B" has told the reader nothing at all.
 *
 * Kept apart from `displayClassName`, which only swaps slashes for dots and
 * must keep doing exactly that. The names it returns are the ones the object
 * set and the package filter match against — `[B` is the row's identity, and
 * rewriting it there would break narrowing to that row. So this is for PROSE:
 * a sentence a human reads, never a key anything is looked up by.
 */

const PRIMITIVES: Record<string, string> = {
  B: 'byte', C: 'char', D: 'double', F: 'float',
  I: 'int', J: 'long', S: 'short', Z: 'boolean',
};

export function readableClassName(raw: string): string {
  let dims = 0;
  let s = raw;
  while (s.startsWith('[')) { dims++; s = s.slice(1); }

  if (dims && s.length === 1 && PRIMITIVES[s]) s = PRIMITIVES[s];
  else if (s.startsWith('L') && s.endsWith(';')) s = s.slice(1, -1);

  return s.replace(/\//g, '.') + '[]'.repeat(dims);
}
