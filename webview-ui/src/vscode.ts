/** VS Code webview API wrapper — safe to use in browser dev mode too */

export type VsCodeApi = {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

declare function acquireVsCodeApi(): VsCodeApi;

let _api: VsCodeApi | undefined;

export function getVsCodeApi(): VsCodeApi {
  if (!_api) {
    const w = window as unknown as Record<string, unknown>;
    if (w.__DAAKIA_VSCODE_API__) {
      _api = w.__DAAKIA_VSCODE_API__ as VsCodeApi;
    } else if (typeof acquireVsCodeApi !== 'undefined') {
      _api = acquireVsCodeApi();
    } else {
      _api = {
        postMessage: (msg) => console.log('[vscode mock postMessage]', msg),
        getState: () => ({}),
        setState: () => {},
      };
    }
  }
  return _api;
}

// ─── Settings Audit Interceptor ───────────────────────────────────────────────
// Intercepts outgoing postMsg calls for settings-related messages and logs them
// to the internal DevTools console — creating a god-level audit trail.

const SETTINGS_AUDIT_TYPES = new Set([
  'saveSettings',
  'saveAiProviders',
  'aiProviders:save',
  'aiKeys:save',
  'saveSetting',
  'saveEnvironments',
  'aiPromptTemplates:save',
  'saveAiFeatures',
]);

function auditToDevTools(msg: Record<string, unknown>) {
  // Dynamic import to avoid circular deps — devtools-store is only referenced at runtime
  try {
    // Access via zustand store directly — lazy to avoid circular import
    const storeModule = (window as any).__devtoolsStoreRef;
    if (storeModule?.getState) {
      const sensitive = new Set(['apiKey', 'password', 'secret', 'token', 'key']);
      const sanitize = (obj: unknown): unknown => {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(sanitize);
        return Object.fromEntries(
          Object.entries(obj as Record<string, unknown>).map(([k, v]) => {
            if (sensitive.has(k.toLowerCase()) || k.toLowerCase().includes('key') || k.toLowerCase().includes('secret')) {
              return [k, typeof v === 'string' && v.length > 0 ? `${v.slice(0, 4)}***` : v];
            }
            return [k, sanitize(v)];
          })
        );
      };
      storeModule.getState().addLog({
        level: 'info' as const,
        args: [
          `⚙️ [Settings Audit] ${msg.type}`,
          sanitize({ ...msg, type: undefined }),
          `at ${new Date().toISOString()}`,
        ].filter(Boolean),
        timestamp: Date.now(),
        requestName: 'Settings',
        scriptPhase: 'settings',
      });
    }
  } catch {
    // Never fail silently from audit — just skip
  }
}

export function postMsg(msg: unknown) {
  getVsCodeApi().postMessage(msg);

  // Audit settings changes to DevTools
  if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
    const typed = msg as Record<string, unknown>;
    if (SETTINGS_AUDIT_TYPES.has(typed.type as string)) {
      auditToDevTools(typed);
    }
  }
}
