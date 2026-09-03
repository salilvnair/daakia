/**
 * Getting a readable label out of a resolved JFR value.
 *
 * There is no single shape for "the name of this thing". A class arrives as
 * `{name: {string: 'java/lang/Object'}}`, a GC cause as
 * `{cause: 'Allocation Failure'}`, a collector as `{name: 'DefNew'}`, a symbol
 * as `{string: …}` and a thread as `{javaName: …}`. Each is a different type
 * in the recording's own metadata, and each is perfectly regular — it is only
 * the union of them that needs a helper.
 *
 * Getting this wrong is quiet: the label comes out empty, the row still
 * renders, and an allocation profile shows sizes and stacks against a blank
 * column. Which is exactly what happened before this existed.
 */
import type { JfrValue } from './jfr-chunk';

/** The fields that carry a label, in the order they should be preferred. */
const LABEL_FIELDS = [
  'string', 'name', 'javaName', 'cause', 'description', 'osName',
  // `jdk.GCHeapSummary.when` is "Before GC" / "After GC" — the field that
  // pairs two summaries into one collection's before and after.
  'when',
];

/**
 * The label, unwrapping nested holders up to `depth`.
 *
 * Two levels covers every shape in the JDK's own event metadata; the bound is
 * there because a resolved value can be cyclic and this must not be the thing
 * that takes the extension host down.
 */
export function text(v: JfrValue | undefined, depth = 3): string {
  if (v === null || v === undefined || depth <= 0) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (Array.isArray(v)) return '';

  const o = v as Record<string, JfrValue>;
  for (const field of LABEL_FIELDS) {
    if (!(field in o)) continue;
    const got = text(o[field], depth - 1);
    if (got) return got;
  }
  return '';
}

/** The same, with JVM-internal slashes turned into the dots people write. */
export function dotted(v: JfrValue | undefined): string {
  return text(v).replace(/\//g, '.');
}
