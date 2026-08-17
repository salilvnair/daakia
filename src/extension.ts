import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { initDb, closeDb, getSqliteStatus, getCollectionTree, getDbPath } from './storage/db';
import { MainPanel } from './panel/main/MainPanel';
import { initMockServerManager, stopAllMockServers } from './mock/mock-server-manager';
import { importPostmanCollection } from './services/postman-importer';
import { importOpenAPISpec, isOpenAPISpec } from './services/openapi-importer';
import { importHarFile, isHarFile } from './services/har-importer';
import { importBrunoCollection } from './services/bruno-importer';
import { importDaakiaCollection } from './services/daakia-importer';
import { importThunderClientCollection, isThunderClientCollection } from './services/thunder-importer';
import { importHttpieCollection, isHttpieFile } from './services/httpie-importer';
import { WelcomeViewProvider } from './panel/sidebar/WelcomeViewProvider';
import { createDaakiaChatHandler } from './panel/chat/chat-handler';
import { initSecretStore } from './services/secret-store';
import { exportCollectionsToWorkspace, importCollectionsFromWorkspace, initGitSyncWatcher } from './services/git-sync';
import { tryAutoUnlockFromKeychain } from './services/vault';
import { purgeExpiredTrash } from './services/bin';

export async function activate(context: vscode.ExtensionContext) {
  console.log('[daakia] Activating...');

  // Initialize OS keychain secret store (macOS Keychain / Windows Credential Manager / libsecret)
  initSecretStore(context.secrets);

  // Initialize SQLite (async — sql.js WASM) — non-blocking
  // Auto-open panel once DB is ready
  const dbReady = initDb(context.extensionPath).then(() => {
    const dbStatus = getSqliteStatus();
    if (!dbStatus.ok) {
      console.warn('[daakia] SQLite unavailable:', dbStatus.error);
    } else {
      console.log('[daakia] SQLite ready.');
    }
    // Silently unlock the vault if a passphrase is already in the OS keychain — no prompt needed.
    void tryAutoUnlockFromKeychain();
    // Purge bin entries past their 30-day retention — no background timer, so activation is the
    // one reliable point to sweep (also covers long-idle installs that weren't opened in a while).
    purgeExpiredTrash();
    // Auto-open the main panel on startup
    MainPanel.createOrShow(context.extensionUri);
  });

  // Initialize Mock Server Manager
  initMockServerManager(context.extensionPath);

  // ─── @daakia Chat Participant ───
  const chatHandler = createDaakiaChatHandler({ extensionUri: context.extensionUri });
  const participant = vscode.chat.createChatParticipant('daakia.copilot', chatHandler);
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'daakia-icon.png');
  participant.followupProvider = {
    provideFollowups(result: vscode.ChatResult): vscode.ChatFollowup[] {
      const meta = result.metadata as Record<string, unknown>;
      const followups = meta?.daakia_followups;
      return Array.isArray(followups) ? followups : [];
    },
  };
  context.subscriptions.push(participant);

  // ─── Sidebar view — register WelcomeViewProvider for daakia.welcome ───
  const welcomeProvider = new WelcomeViewProvider(context.extensionUri, dbReady);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(WelcomeViewProvider.viewType, welcomeProvider)
  );

  // ─── Status bar item (right side, next to Copilot) ───
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(daakia-icon) Daakia';
  statusBarItem.tooltip = 'Daakia — Open API Client';
  statusBarItem.command = 'daakia.openPanel';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ─── Commands ───
  context.subscriptions.push(
    vscode.commands.registerCommand('daakia.openPanel', () => {
      MainPanel.createOrShow(context.extensionUri);
    })
  );

  // ─── Git-native collection sync ───
  context.subscriptions.push(
    vscode.commands.registerCommand('daakia.exportCollectionsToWorkspace', () => {
      const n = exportCollectionsToWorkspace();
      vscode.window.showInformationMessage(
        n > 0 ? `Daakia: exported collections to ${n} file(s) — commit them to share with your team.`
              : 'Daakia: nothing to export (no collections, or no workspace folder open).');
    }),
    vscode.commands.registerCommand('daakia.importCollectionsFromWorkspace', () => {
      const n = importCollectionsFromWorkspace();
      vscode.window.showInformationMessage(
        n > 0 ? `Daakia: imported ${n} request(s) from workspace collection files.`
              : 'Daakia: no .daakia.json collection files found in the sync folder.');
    }),
  );
  initGitSyncWatcher(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('daakia.start', () => {
      MainPanel.createOrShow(context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('daakia.newRequest', () => {
      MainPanel.createOrShow(context.extensionUri);
      if (MainPanel.currentPanel) {
        MainPanel.currentPanel.postMessage({ type: 'newRequest' });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('daakia.sendRequest', () => {
      if (MainPanel.currentPanel) {
        MainPanel.currentPanel.postMessage({ type: 'sendRequest' });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('daakia.saveRequest', () => {
      if (MainPanel.currentPanel) {
        MainPanel.currentPanel.postMessage({ type: 'saveRequest' });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('daakia.closeTab', () => {
      if (MainPanel.currentPanel) {
        MainPanel.currentPanel.postMessage({ type: 'closeTab' });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('daakia.focusUrl', () => {
      if (MainPanel.currentPanel) {
        MainPanel.currentPanel.postMessage({ type: 'focusUrl' });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('daakia.openCommandPalette', () => {
      if (MainPanel.currentPanel) {
        MainPanel.currentPanel.postMessage({ type: 'openCommandPalette' });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('daakia.importCollection', async () => {
      const uri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
          'API Files': ['json', 'yaml', 'yml', 'har'],
        },
        title: 'Import Collection (Postman/OpenAPI/Swagger/HAR)',
      });
      if (uri?.[0]) {
        try {
          const content = fs.readFileSync(uri[0].fsPath, 'utf-8');
          // Auto-detect format
          const result = isHarFile(content)
            ? importHarFile(content)
            : isOpenAPISpec(content)
              ? importOpenAPISpec(content)
              : isThunderClientCollection(content)
                ? importThunderClientCollection(content)
                : isHttpieFile(content)
                  ? importHttpieCollection(content)
                  : importPostmanCollection(content);
          MainPanel.createOrShow(context.extensionUri);
          if (result.success) {
            // Postman/OpenAPI/HAR/Thunder/HTTPie collections are always REST-shaped —
            // tag the broadcast so only the REST sidebar panel (matching what actually
            // changed in the DB) absorbs it, instead of whichever protocol tab happens
            // to be active right now.
            MainPanel.currentPanel?.postMessage({ type: 'collectionsData', protocol: 'rest', collections: getCollectionTree('rest') });
            MainPanel.currentPanel?.postMessage({ type: 'toast', toastType: 'success', message: `Imported "${result.collectionName}" (${result.requestCount} requests)` });
          } else {
            MainPanel.currentPanel?.postMessage({ type: 'toast', toastType: 'error', message: `Import failed: ${result.error}` });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to read file';
          void vscode.window.showErrorMessage(`Import failed: ${msg}`);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('daakia.importBrunoCollection', async () => {
      const uri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFiles: false,
        canSelectFolders: true,
        title: 'Import Bruno Collection — Select Source Folder',
        openLabel: 'Import From Here',
      });
      if (uri?.[0]) {
        try {
          const result = importBrunoCollection(uri[0].fsPath);
          MainPanel.createOrShow(context.extensionUri);
          if (result.success) {
            // Bruno collections are always REST-shaped — same reasoning as the
            // Postman/OpenAPI/HAR/Thunder/HTTPie import above.
            MainPanel.currentPanel?.postMessage({ type: 'collectionsData', protocol: 'rest', collections: getCollectionTree('rest') });
            MainPanel.currentPanel?.postMessage({ type: 'toast', toastType: 'success', message: `Imported "${result.collectionName}" (${result.requestCount} requests)` });
          } else {
            MainPanel.currentPanel?.postMessage({ type: 'toast', toastType: 'error', message: `Bruno import failed: ${result.error}` });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to read Bruno folder';
          void vscode.window.showErrorMessage(`Bruno import failed: ${msg}`);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('daakia.importDaakiaCollection', async () => {
      const uri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'Daakia JSON': ['json'] },
        title: 'Import Collection (Daakia JSON)',
      });
      if (uri?.[0]) {
        try {
          const content = fs.readFileSync(uri[0].fsPath, 'utf-8');
          const result = importDaakiaCollection(content);
          MainPanel.createOrShow(context.extensionUri);
          if (result.success) {
            // A single Daakia JSON file can carry roots from several protocols at
            // once — refresh only the ones actually touched by this import.
            for (const protocol of result.protocols) {
              MainPanel.currentPanel?.postMessage({ type: 'collectionsData', protocol, collections: getCollectionTree(protocol) });
            }
            MainPanel.currentPanel?.postMessage({ type: 'toast', toastType: 'success', message: `Imported "${result.collectionName}" (${result.requestCount} requests)` });
          } else {
            MainPanel.currentPanel?.postMessage({ type: 'toast', toastType: 'error', message: `Import failed: ${result.error}` });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to read file';
          void vscode.window.showErrorMessage(`Import failed: ${msg}`);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('daakia.rebuildSqlite', async () => {
      try {
        closeDb();
        await initDb(context.extensionPath);

        const dbStatus = getSqliteStatus();
        if (!dbStatus.ok) {
          void vscode.window.showErrorMessage(`Daakia SQLite rebuild failed: ${dbStatus.error ?? 'Unknown error'}`);
        } else {
          void vscode.window.showInformationMessage('Daakia SQLite rebuilt successfully.');
        }

        MainPanel.currentPanel?.refreshInitialState();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Daakia SQLite rebuild failed: ${message}`);
        MainPanel.currentPanel?.refreshInitialState();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('daakia.changeDbLocation', async () => {
      const selection = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Use this folder',
        title: 'Daakia: Change Database Location',
      });
      const folder = selection?.[0];
      if (!folder) return;

      const oldDbPath = getDbPath();
      const newDbPath = path.join(folder.fsPath, 'daakia.db');
      if (newDbPath === oldDbPath) return;

      try {
        fs.mkdirSync(path.dirname(newDbPath), { recursive: true });
        if (fs.existsSync(oldDbPath)) {
          fs.copyFileSync(oldDbPath, newDbPath);
        }

        await vscode.workspace.getConfiguration('daakia').update('dbPath', newDbPath, vscode.ConfigurationTarget.Global);

        closeDb();
        await initDb(context.extensionPath);

        const dbStatus = getSqliteStatus();
        if (!dbStatus.ok) {
          void vscode.window.showErrorMessage(`Daakia database move failed: ${dbStatus.error ?? 'Unknown error'}`);
        } else {
          void vscode.window.showInformationMessage(`Daakia database moved to ${newDbPath}`);
        }

        MainPanel.currentPanel?.refreshInitialState();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Daakia database move failed: ${message}`);
      }
    })
  );

  console.log('[daakia] Activated successfully.');

  // Test-support API surface (E-wiki-capture-plumbing) — lets @vscode/test-electron
  // tests/orchestrators reach the REAL, activated extension's MainPanel singleton.
  // A test file's own `import { MainPanel } from './panel/main/MainPanel'` resolves
  // to a SEPARATE tsc-compiled module instance from the one running inside this
  // esbuild-bundled dist/extension.js (same reason storage/db.ts and
  // mock-server-manager.ts needed their own init calls in earlier e2e tests) — so
  // `MainPanel.currentPanel` set by the real activation is invisible to a test's
  // own import. Exporting the real class reference here is the standard VS Code
  // pattern for this (`vscode.extensions.getExtension(id).exports`). Not used by
  // any production code path.
  return { MainPanel };
}

export function deactivate() {
  stopAllMockServers();
  closeDb();
}
