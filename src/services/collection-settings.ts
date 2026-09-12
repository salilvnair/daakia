/**
 * The execution settings stored on a collection.
 *
 * Collection properties are a single opaque JSON blob in the `collections`
 * table, which is why adding a `settings` key needed no migration. It also
 * means the blob is whatever was last written there — including by an older
 * build, or by an import of someone else's collection — so this reads
 * defensively and never lets a malformed blob take a request down with it.
 */

import { getCollectionData } from '../storage/db';
import type { ExecutionSettings } from './execution-settings';

/**
 * Settings for one collection, or undefined when it has none.
 *
 * Undefined rather than `{}` on purpose: the resolver distinguishes "this
 * level does not exist" from "this level exists and overrides nothing", and
 * only the first is true for a collection that was never configured.
 */
export function collectionSettings(id: string | undefined): ExecutionSettings | undefined {
  if (!id) return undefined;
  try {
    const raw = getCollectionData(id);
    if (!raw) return undefined;
    const props = JSON.parse(raw) as { settings?: ExecutionSettings };
    const s = props?.settings;
    // A blob written before this feature has no `settings` at all, and one
    // written by a broken import may have a string or an array there.
    if (!s || typeof s !== 'object' || Array.isArray(s)) return undefined;
    return s;
  } catch {
    // A collection with an unreadable blob still has to be able to send
    // requests. Falling back to the global settings is the safe answer.
    return undefined;
  }
}
