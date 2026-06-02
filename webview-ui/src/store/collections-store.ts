import { create } from 'zustand';

export interface CollectionPropsCache {
  headers: { key: string; value: string; enabled: boolean }[];
  authType: string;
  authData: Record<string, string>;
  variables: { key: string; value: string; enabled: boolean }[];
  preRequestScript: string;
  postResponseScript: string;
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
