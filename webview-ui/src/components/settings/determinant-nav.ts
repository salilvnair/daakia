/**
 * The way into Settings → DK8S → Determinants from anywhere else.
 *
 * The Window's "Edit determinants in Settings", the Summary panel's empty
 * state and a determinant's own Edit link all land on the same page, and the
 * last one lands on the builder with that determinant already in it. One
 * function, so none of them has to know the section id or how Settings
 * remembers where it was.
 */
import { create } from 'zustand';
import { useTabsStore } from '../../store/tabs-store';

/** The section id in `SettingsPanel`'s nav. */
export const DETERMINANTS_SECTION = 'dk8s-determinants';

interface FocusState {
  /** A determinant to open in the builder, consumed by the page once read. */
  focusId?: string;
  setFocus: (id: string | undefined) => void;
}

export const useDeterminantFocus = create<FocusState>(set => ({
  focusId: undefined,
  setFocus: (focusId) => set({ focusId }),
}));

/**
 * Open Settings on the Determinants page.
 *
 * @param id  A determinant to open in the builder — a catalogue pattern id, or
 *            a teammate's `team:…` id, which opens read-only with its copy
 *            button. Omitted, the page opens on the list.
 */
export function openDeterminantSettings(id?: string): void {
  useDeterminantFocus.getState().setFocus(id);
  useTabsStore.getState().openSettingsTab(DETERMINANTS_SECTION);
}
