import { create } from 'zustand';

interface DbStatusState {
  dbPath: string;
  sqliteOk: boolean;
  sqliteError?: string;
  setDbStatus: (patch: Partial<Pick<DbStatusState, 'dbPath' | 'sqliteOk' | 'sqliteError'>>) => void;
}

/** Populated once from the 'init' message (see use-extension-messages.ts) —
 * read anywhere in the app that needs to show where the SQLite file lives
 * (e.g. Settings > General) without prop-drilling from App.tsx. */
export const useDbStatusStore = create<DbStatusState>((set) => ({
  dbPath: '',
  sqliteOk: true,
  sqliteError: undefined,
  setDbStatus: (patch) => set(patch),
}));
