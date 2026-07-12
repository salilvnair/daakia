/** Script debugger lifecycle messages. Extracted verbatim from the App message handler. */
import { useDebugStore } from '../../store/debug-store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleDebuggerMessages(msg: any, ui: { setSplitPercent: (pct: number) => void; setFocusedPanel: (p: "request" | "response" | null) => void; setSidebarSection: (s: string) => void }): boolean {
  switch (msg.type as string) {
        // ─── Script Debugger Messages ────────────────────────────────────
        case 'scriptDebug:started': {
          const { tabId: debugTabId, phase: debugPhase } = msg;
          useDebugStore.getState().startDebug(debugTabId, debugPhase);
          // Auto-focus and enlarge request panel to show the script editor during debug
          ui.setSplitPercent(70);
          ui.setFocusedPanel('request');
          break;
        }
        case 'scriptDebug:paused': {
          const { line, variables, callStack } = msg;
          useDebugStore.getState().setPaused(line, variables, callStack);
          ui.setSidebarSection('debug');
          break;
        }
        case 'scriptDebug:resumed': {
          useDebugStore.getState().setResumed();
          break;
        }
        case 'scriptDebug:completed': {
          useDebugStore.getState().setCompleted();
          break;
        }
        case 'scriptDebug:error': {
          useDebugStore.getState().setError(msg.message || 'Debug session error');
          break;
        }
        case 'scriptDebug:log': {
          const entry = msg.entry as { level: string; args: unknown[]; timestamp: number };
          if (entry) {
            useDebugStore.getState().addLog({
              level: entry.level as any,
              args: entry.args,
              timestamp: entry.timestamp,
            });
          }
          break;
        }
        case 'scriptDebug:subRequest': {
          const entry = msg.entry as { method: string; url: string; status: number; statusText: string; duration: number; timestamp: number; requestHeaders?: Record<string, string>; requestBody?: string; responseHeaders?: Record<string, string>; responseBody?: string };
          if (entry) {
            useDebugStore.getState().addSubRequest({ ...entry, phase: (msg.phase as string) || '' });
          }
          break;
        }
    default:
      return false;
  }
  return true;
}
