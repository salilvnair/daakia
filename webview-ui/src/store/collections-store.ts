import { create } from 'zustand';

export interface CollectionPropsCache {
  headers: { key: string; value: string; enabled: boolean }[];
  authType: string;
  authData: Record<string, string>;
  variables: { key: string; value: string; enabled: boolean }[];
  preRequestScript: string;
  postResponseScript: string;
}

type KV = { key: string; value: string; enabled: boolean };

/** What the host says a folder gets from the folders above it. */
export interface InheritedProps {
  variables?: KV[];
  headers?: KV[];
  authType?: string;
  authData?: Record<string, string>;
}

function layer(base: KV[] | undefined, own: KV[], foldCase: boolean): KV[] {
  const name = (k: string) => (foldCase ? k.toLowerCase() : k);
  const ownKeys = new Set(own.filter(kv => kv.enabled && kv.key).map(kv => name(kv.key)));
  return [...(base ?? []).filter(kv => !ownKeys.has(name(kv.key))), ...own];
}

/**
 * A folder's own properties with what it inherits underneath — what a request
 * in it is sent with. Its own variables and headers win by key; its own auth
 * wins unless it is `none`. Scripts are its own only.
 */
export function withInherited(own: CollectionPropsCache, inherited: InheritedProps | undefined): CollectionPropsCache {
  if (!inherited) return own;
  const ownAuth = own.authType && own.authType !== 'none' && own.authType !== 'inherit';
  return {
    ...own,
    variables: layer(inherited.variables, own.variables, false),
    headers: layer(inherited.headers, own.headers, true),
    authType: ownAuth ? own.authType : (inherited.authType ?? 'none'),
    authData: ownAuth ? own.authData : (inherited.authData ?? {}),
  };
}

interface CollectionsState {
  /** Cache of collection properties by collection ID */
  propertiesCache: Record<string, CollectionPropsCache>;

  setProperties: (id: string, props: CollectionPropsCache) => void;
  getVariables: (collectionId: string | undefined) => { key: string; value: string }[];
}

export const useCollectionsStore = create<CollectionsState>((set, get) => ({
  propertiesCache: {},

  setProperties: (id, props) => {
    set(s => ({ propertiesCache: { ...s.propertiesCache, [id]: props } }));
  },

  getVariables: (collectionId) => {
    if (!collectionId) return [];
    const props = get().propertiesCache[collectionId];
    if (!props) return [];
    return props.variables
      .filter(v => v.enabled && v.key)
      .map(v => ({ key: v.key, value: v.value }));
  },
}));
