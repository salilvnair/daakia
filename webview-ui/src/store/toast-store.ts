import { create } from 'zustand';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastData {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  /** The body. With a `title`, the line under it; without one, the whole toast. */
  message: string;
  /** Short and bold — "Collection created". Optional: most toasts are one line. */
  title?: string;
  /**
   * Milliseconds before it leaves; 0 keeps it until dismissed.
   * Defaults: 4s, 6s for a warning, and an error stays.
   */
  duration?: number;
  /** The one thing you would do next — "Undo", "Open". Clicking it dismisses the toast. */
  action?: ToastAction;
  /** How many times the same toast fired while this one was up. */
  count?: number;
  /** Bumped when it fires again, so its timer starts over. */
  rev?: number;
}

/** At most this many at once; the oldest goes first. */
export const MAX_TOASTS = 5;

export function defaultDuration(type: ToastData['type']): number {
  if (type === 'error') return 0;
  if (type === 'warning') return 6000;
  return 4000;
}

interface ToastStore {
  toasts: ToastData[];
  addToast: (toast: Omit<ToastData, 'id' | 'count' | 'rev'>) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

let counter = 0;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  addToast: (toast) => {
    /*
      The same toast again counts instead of stacking: "Saved ×3", one card.
      Five "Request saved" toasts piled up said nothing the first did not.
    */
    const same = get().toasts.find(t => t.type === toast.type && t.message === toast.message && t.title === toast.title);
    if (same) {
      set(s => ({ toasts: s.toasts.map(t => (t.id === same.id ? { ...t, count: (t.count ?? 1) + 1, rev: (t.rev ?? 0) + 1, action: toast.action ?? t.action } : t)) }));
      return same.id;
    }
    const id = `toast-${++counter}-${Date.now()}`;
    set(s => ({ toasts: [...s.toasts, { ...toast, id, count: 1, rev: 0 }].slice(-MAX_TOASTS) }));
    return id;
  },
  dismissToast: (id) => {
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
  },
  clearToasts: () => set({ toasts: [] }),
}));
