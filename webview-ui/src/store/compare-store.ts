/**
 * The diff view, opened from anywhere.
 *
 * Right-clicking a response body and choosing "Compare with clipboard" has to
 * reach a modal that lives at the app root, from a context menu that lives
 * somewhere else entirely. A tiny store is the seam — the menu fills it, App
 * renders it.
 */
import { create } from 'zustand';

interface CompareState {
  open: boolean;
  /** The side seeded from the page. */
  a: string;
  labelA: string;
  /** The side seeded from the clipboard. */
  b: string;
  labelB: string;
  /** Put the cursor in the right pane, for a clipboard we could not read. */
  focusB: boolean;

  openCompare: (payload: { a: string; labelA: string; b: string; labelB?: string; focusB?: boolean }) => void;
  close: () => void;
}

export const useCompareStore = create<CompareState>((set) => ({
  open: false,
  a: '',
  labelA: '',
  b: '',
  labelB: '',
  focusB: false,

  openCompare: ({ a, labelA, b, labelB, focusB }) =>
    set({ open: true, a, labelA, b, labelB: labelB ?? 'Clipboard content', focusB: focusB ?? false }),

  close: () => set({ open: false }),
}));
