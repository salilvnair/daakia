/**
 * A collection's name from its id, across every protocol's tree — what Group
 * tabs by collection calls a group. One lookup, for the tab bar and the
 * command palette both.
 */
import { useSidebarDataStore } from '../../store/sidebar-data-store';
import { findNodeById } from '../collections';

export function collectionName(id: string): string {
  const all = useSidebarDataStore.getState().collections as Record<string, Parameters<typeof findNodeById>[0] | undefined>;
  for (const tree of Object.values(all)) {
    const n = findNodeById(tree ?? [], id);
    if (n) return n.name;
  }
  return 'Collection';
}
