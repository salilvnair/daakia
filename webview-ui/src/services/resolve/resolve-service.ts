import { useEnvStore } from '../../store/env-store';
import { useCollectionsStore } from '../../store/collections-store';
import type { RequestTab } from '../../store/tabs-store';

type KeyValueRow = { key: string; value: string; enabled: boolean };

/** Creates a context-bound resolver for a given tab */
export function createResolver(tab: RequestTab) {
  const resolveWithEnv = useEnvStore.getState().resolveWithEnv;
  const getCollectionVars = useCollectionsStore.getState().getVariables;

  const requestVars = tab.variables
    .filter(v => v.enabled && v.key)
    .map(v => ({ key: v.key, value: v.value }));
  const collectionVars = getCollectionVars(tab.collectionId);

  const layers: { key: string; value: string }[][] = [];
  if (requestVars.length > 0) layers.push(requestVars);
  if (collectionVars.length > 0) layers.push(collectionVars);

  const resolve = (input: string): string =>
    resolveWithEnv(input, tab.envId ?? null, layers.length > 0 ? layers : undefined);

  return resolve;
}

/** Resolve all key-value rows */
export function resolveKV(resolve: (s: string) => string, arr: KeyValueRow[]): KeyValueRow[] {
  return arr.map(item => ({ ...item, key: resolve(item.key), value: resolve(item.value) }));
}

/** Deep-resolve all string values in an object (for auth data, etc.) */
export function resolveObj(resolve: (s: string) => string, obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') result[k] = resolve(v);
    else if (v && typeof v === 'object' && !Array.isArray(v)) result[k] = resolveObj(resolve, v as Record<string, unknown>);
    else result[k] = v;
  }
  return result;
}
