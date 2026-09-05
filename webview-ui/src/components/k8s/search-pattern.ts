/**
 * The longest plain run in a pattern, for highlighting.
 *
 * A search pattern is a glob or a regex; a highlight needs literal text. This
 * takes the longest stretch with no metacharacter in it, which for `*invoice*`
 * is `invoice`, for `inv[0-9]+\.pdf` is `inv`, and for a bare word is the
 * word. Longest rather than first because the informative part of a pattern is
 * usually its longest literal — `.*application` should mark `application`,
 * not nothing.
 */
export function literalOf(pattern: string): string {
  const runs = pattern.split(/[*?\[\]().+^$|{}\\]+/).filter(Boolean);
  return runs.reduce((best, r) => (r.length > best.length ? r : best), '');
}
