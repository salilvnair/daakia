/**
 * App-level modals that anything can open.
 *
 * Cross-collection search is opened from the command palette, a keyboard
 * shortcut and (later) a sidebar button, none of which own the component —
 * so the flag lives here rather than in whichever panel happens to render it.
 * Deliberately not persisted: a modal open when the window closed should not
 * be open when it opens again.
 */
import { create } from 'zustand';

interface ModalState {
  searchCollectionsOpen: boolean;
  openSearchCollections: () => void;
  closeSearchCollections: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  searchCollectionsOpen: false,
  openSearchCollections: () => set({ searchCollectionsOpen: true }),
  closeSearchCollections: () => set({ searchCollectionsOpen: false }),
}));
