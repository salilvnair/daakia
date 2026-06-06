/**
 * AI Keys Store — tracks which providers have API keys stored in the extension host.
 * Never stores actual key values in the webview — only boolean "has key" status.
 * Key save/delete operations go directly to the extension host via postMessage.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';

interface AiKeysState {
  /** Map of providerId → true if key is stored, false otherwise */
  keyStatus: Record<string, boolean>;

  /** Update status from extension host response */
  setKeyStatus: (status: Record<string, boolean>) => void;

  /** Save a new API key for a provider (sends to extension host) */
  saveKey: (providerId: string, token: string) => void;

  /** Delete API key for a provider */
  deleteKey: (providerId: string) => void;

  /** Request a refresh of key status from extension host */
  loadKeys: () => void;

  /** Check whether a specific provider has a stored key */
  hasKey: (providerId: string) => boolean;
}

export const useAiKeysStore = create<AiKeysState>((set, get) => ({
  keyStatus: {},

  setKeyStatus: (status) => set({ keyStatus: status }),

  saveKey: (providerId, token) => {
    postMsg({ type: 'aiKeys:save', providerId, token });
  },

  deleteKey: (providerId) => {
    postMsg({ type: 'aiKeys:delete', providerId });
  },

  loadKeys: () => {
    postMsg({ type: 'aiKeys:load' });
  },

  hasKey: (providerId) => !!get().keyStatus[providerId],
}));
