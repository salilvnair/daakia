/**
 * local-server — standalone dev-only backend for the webview-ui Vite preview.
 *
 * Real SQLite (sql.js), real mock HTTP/GraphQL/WS/etc. servers, real
 * collections/environments/history persistence — the SAME code the actual
 * VS Code extension host runs (src/panel/main/handlers/*, src/mock/*,
 * src/storage/db.ts), unmodified. Only difference from the real extension:
 * a `vscode` shim (./vscode-shim.ts) stands in for the handful of VS Code
 * UI APIs (native file dialogs, workspace config) those modules touch — see
 * README.md.
 *
 * NOT bundled into the shipped .vsix — see .vscodeignore. This exists purely
 * so the browser-preview Vite dev server has a real backend instead of a
 * no-op postMessage mock, so UI changes AND backend/mock-server changes can
 * both be exercised and verified without a full @vscode/test-electron run.
 *
 * Usage: npm run local-server   (see package.json)
 * Then open the webview-ui Vite dev server as usual — vscode.ts auto-detects
 * this server via WS handshake and routes all postMessage traffic through it.
 */
import * as http from 'http';
import * as path from 'path';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, type WebSocket } from 'ws';
import { initDb, getDbPath } from '../src/storage/db';
import { initMockServerManager } from '../src/mock/mock-server-manager';
import { routeMessage, sendInitialState, type PostMessage } from './router';

const PORT = Number(process.env.LOCAL_SERVER_PORT) || 7890;
// The real extension passes `context.extensionPath` (the repo root when run
// from source) — dist/sql-wasm.wasm and dist/ already exist there from a
// normal `npm run build:ext`. The bundled output lives at
// local-server/dist/server.js, so __dirname at runtime is local-server/dist —
// two levels up reaches the repo root, not one.
const EXTENSION_PATH = path.resolve(__dirname, '..', '..');

async function main() {
  await initDb(EXTENSION_PATH);
  initMockServerManager(EXTENSION_PATH);

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true, dbPath: getDbPath() });
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws: WebSocket) => {
    console.log('[local-server] webview connected');
    const post: PostMessage = (msg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };

    // Mirrors the real webview's own 'ready' handshake on mount.
    sendInitialState(post);

    ws.on('message', (raw) => {
      let msg: { type: string; [key: string]: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        console.warn('[local-server] received non-JSON message, ignoring');
        return;
      }
      routeMessage(msg, post).catch((err) => {
        console.error(`[local-server] error handling "${msg.type}":`, err);
        post({ type: 'toast', toastType: 'error', message: `local-server: ${err instanceof Error ? err.message : String(err)}` });
      });
    });

    ws.on('close', () => console.log('[local-server] webview disconnected'));
  });

  httpServer.listen(PORT, () => {
    console.log(`[local-server] listening on http://localhost:${PORT} (ws + health check)`);
    console.log(`[local-server] db: ${getDbPath()}`);
  });
}

main().catch((err) => {
  console.error('[local-server] fatal startup error:', err);
  process.exit(1);
});
