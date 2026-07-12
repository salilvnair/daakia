/**
 * Wiki capture orchestrator — extension-host side of the E-wiki-capture-plumbing
 * pipeline. Sends `wiki:capture:run` into the real, running webview (via
 * MainPanel.postMessage), and resolves once CaptureBridge.tsx replies with
 * `wiki:capture:result`/`wiki:capture:error` (routed through
 * MainPanel.onCaptureMessage — see MainPanel.ts).
 *
 * Not a test itself (doesn't match *.test.js, so Mocha's suite glob skips it) —
 * a reusable helper imported by capture scripts/tests.
 *
 * IMPORTANT: does not statically `import { MainPanel } from '../../panel/main/MainPanel'`
 * — that resolves to a separate tsc-compiled module instance from the one running
 * inside the real, activated dist/extension.js, so its `currentPanel`/
 * `onCaptureMessage` statics would never reflect real state. Callers must pass in
 * the REAL MainPanel class reference, obtained via
 * `vscode.extensions.getExtension('salilvnair.daakia').exports.MainPanel`.
 */

export interface CaptureDirective {
  action: 'click' | 'clickText' | 'type' | 'wait' | 'setPref' | 'waitForMessage' | 'addTab' | 'updateActiveTab' | 'setActiveTabSubtab' | 'openMockServerTab' | 'addMockServer' | 'openSettingsTab' | 'closeAllTabs' | 'seedSidebarData' | 'seedEnvironments' | 'seedDevTools' | 'closeDevTools' | 'triggerDkSuggest' | 'assertNoDkTypeError';
  selector?: string;
  text?: string;
  ms?: number;
  prefKey?: string;
  prefValue?: string;
  messageType?: string;
  timeoutMs?: number;
  /** addTab/updateActiveTab — passed through verbatim as a Partial<RequestTab> on the webview side. */
  patch?: Record<string, unknown>;
  /** setActiveTabSubtab */
  subtab?: string;
  /** addMockServer — passed through verbatim as a MockServer on the webview side. */
  server?: Record<string, unknown>;
  /** seedSidebarData — passed through verbatim to useSidebarDataStore on the webview side. */
  protocol?: string;
  collections?: Record<string, unknown>[];
  history?: Record<string, unknown>[];
  /** seedEnvironments */
  environments?: Record<string, unknown>[];
  activeEnvId?: string | null;
  /** seedDevTools */
  logs?: Record<string, unknown>[];
  networkEntries?: Record<string, unknown>[];
  devToolsTab?: string;
}

interface CaptureMessage { type: string; id: string; html?: string; error?: string }

/** Minimal shape of the real MainPanel class, as obtained from the extension's exports. */
export interface MainPanelLike {
  currentPanel: { postMessage: (msg: unknown) => void } | undefined;
  onCaptureMessage: ((msg: CaptureMessage) => void) | undefined;
}

let _seq = 0;

export function runCapture(MainPanel: MainPanelLike, directives: CaptureDirective[], timeoutMs = 20_000): Promise<string> {
  const id = `capture-${Date.now()}-${_seq++}`;
  const panel = MainPanel.currentPanel;
  if (!panel) return Promise.reject(new Error('MainPanel.currentPanel is not open — call MainPanel.createOrShow() first'));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      MainPanel.onCaptureMessage = undefined;
      reject(new Error(`capture '${id}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    MainPanel.onCaptureMessage = (msg) => {
      if (msg.id !== id) return;
      clearTimeout(timer);
      MainPanel.onCaptureMessage = undefined;
      if (msg.type === 'wiki:capture:error') reject(new Error(msg.error ?? 'capture failed'));
      else resolve(msg.html ?? '');
    };

    panel.postMessage({ type: 'wiki:capture:run', id, directives });
  });
}
