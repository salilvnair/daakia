/**
 * What a folder gets from the folders above it.
 *
 * Collection properties are stored per folder, and every reader used to look
 * only at the folder a request sits in. So a collection with `{{baseUrl}}`
 * and an API key on its root, and its requests one level down in tag folders —
 * the shape every OpenAPI import produces — sent `{{baseUrl}}` unresolved and
 * no key at all. The root's settings applied to nothing.
 *
 * Now a folder sees the whole chain, root first and nearest last:
 *   - variables and headers merge by key, the nearer folder winning;
 *   - auth is the nearest folder's that is not `none`.
 * Scripts are not merged: each folder's script runs where it is set, and
 * running the root's again for every folder would run it twice.
 */
import { getCollectionBreadcrumb, getCollectionData } from '../storage/db';

export interface KV { key: string; value: string; enabled: boolean }

export interface InheritableProps {
  variables: KV[];
  headers: KV[];
  authType: string;
  authData: Record<string, unknown>;
}

const EMPTY: InheritableProps = { variables: [], headers: [], authType: 'none', authData: {} };

function readProps(id: string): Partial<InheritableProps> {
  try {
    const raw = getCollectionData(id);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Header names are case-insensitive; variable names are not. */
function mergeKV(base: KV[], over: KV[] | undefined, foldCase: boolean): KV[] {
  if (!Array.isArray(over) || over.length === 0) return base;
  const name = (k: string) => (foldCase ? k.toLowerCase() : k);
  const out = new Map<string, KV>();
  for (const kv of base) out.set(name(kv.key), kv);
  for (const kv of over) {
    if (!kv || typeof kv.key !== 'string' || !kv.key || kv.enabled === false) continue;
    out.set(name(kv.key), { key: kv.key, value: String(kv.value ?? ''), enabled: true });
  }
  return [...out.values()];
}

/** Fold a chain of folder properties, root first, into what the last one sees. */
export function mergeCollectionChain(chain: Partial<InheritableProps>[]): InheritableProps {
  let acc: InheritableProps = { ...EMPTY };
  for (const p of chain) {
    const nearerAuth = typeof p.authType === 'string' && p.authType !== 'none' && p.authType !== 'inherit';
    acc = {
      variables: mergeKV(acc.variables, p.variables, false),
      headers: mergeKV(acc.headers, p.headers, true),
      authType: nearerAuth ? (p.authType as string) : acc.authType,
      authData: nearerAuth ? { ...(p.authData ?? {}) } : acc.authData,
    };
  }
  return acc;
}

/** What `id` inherits from its ancestors — not its own settings. */
export function inheritedCollectionProps(id: string | undefined): InheritableProps {
  if (!id) return { ...EMPTY };
  const ancestors = getCollectionBreadcrumb(id).slice(0, -1);
  return mergeCollectionChain(ancestors.map(a => readProps(a.id)));
}

/** Every collection variable a request in `id` can see, as a key → value map. */
export function effectiveCollectionVars(id: string | undefined): Record<string, string> {
  if (!id) return {};
  const chain = getCollectionBreadcrumb(id).map(a => readProps(a.id));
  const vars: Record<string, string> = {};
  for (const v of mergeCollectionChain(chain).variables) vars[v.key] = v.value;
  return vars;
}
