/**
 * dev-bridge.ts — connects the browser-preview webview to local-server/ over
 * WebSocket, standing in for the real VS Code extension host's postMessage
 * channel when running outside VS Code (npm run dev:webview / Vite preview).
 *
 * Only used when neither `window.__DAAKIA_VSCODE_API__` nor a real
 * `acquireVsCodeApi()` is present — see vscode.ts. If local-server isn't
 * running, this degrades to the same "nothing happens" behavior the app
 * already had before this bridge existed (messages queue forever, never
 * sent) — it does not block rendering or throw.
 */
import type { VsCodeApi } from './vscode';

const LOCAL_SERVER_WS_URL = `ws://localhost:${(import.meta as any).env?.VITE_LOCAL_SERVER_PORT || 7890}`;
const MAX_BACKOFF_MS = 10000;

export function createLocalServerBridge(): VsCodeApi {
  let ws: WebSocket | null = null;
  let queue: unknown[] = [];
  let state: unknown = {};
  let backoff = 1000;
  let hasConnectedOnce = false;
  let warnedNotRunning = false;

  function connect() {
    try {
      ws = new WebSocket(LOCAL_SERVER_WS_URL);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      hasConnectedOnce = true;
      backoff = 1000;
      console.log(`[dev-bridge] connected to local-server at ${LOCAL_SERVER_WS_URL} — real backend active`);
      const pending = queue;
      queue = [];
      pending.forEach((msg) => ws?.send(JSON.stringify(msg)));
    };

    ws.onmessage = (event) => {
      let msg: unknown;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      // Mirrors how a real VS Code webview receives extension->webview
      // messages — every listener in the app already does
      // window.addEventListener('message', e => ...) for this reason.
      window.postMessage(msg, '*');
    };

    ws.onclose = () => {
      if (hasConnectedOnce) console.warn('[dev-bridge] local-server connection lost, reconnecting…');
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose fires right after — avoid double-logging here.
    };
  }

  function scheduleReconnect() {
    if (!hasConnectedOnce && !warnedNotRunning) {
      warnedNotRunning = true;
      console.log(
        `[dev-bridge] local-server not reachable at ${LOCAL_SERVER_WS_URL} — postMessage calls will queue with no effect ` +
        'until it starts. Run `npm run local-server` for a real backend (SQLite, mock servers, request execution).',
      );
    }
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  }

  connect();

  return {
    postMessage: (msg) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      } else {
        queue.push(msg);
      }
    },
    getState: () => state,
    setState: (s) => {
      state = s;
    },
  };
}
