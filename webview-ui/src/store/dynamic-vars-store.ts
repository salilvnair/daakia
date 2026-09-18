import { create } from 'zustand';

/**
 * The `{{$dynamic}}` names, as the host describes them.
 *
 * They are resolved on the host — their implementations use node crypto — so
 * the webview cannot enumerate them by importing anything. The host sends the
 * registry's own metadata once, on ready. The alternative was a second
 * hand-written list over here, which would describe whatever the registry
 * looked like on the day somebody last remembered to update it.
 */
export interface DynamicVar {
  name: string;
  description: string;
  category: string;
  example?: string;
}

interface DynamicVarsState {
  variables: DynamicVar[];
  setVariables: (variables: DynamicVar[]) => void;
}

export const useDynamicVarsStore = create<DynamicVarsState>(set => ({
  variables: [],
  setVariables: variables => set({ variables }),
}));
