import * as vscode from 'vscode';
import * as fs from 'fs';
import { initDb, closeDb, getSqliteStatus, getCollectionTree } from './storage/db';
import { MainPanel } from './panel/main/MainPanel';
import { initMockServerManager, stopAllMockServers } from './mock/mock-server-manager';
import { importPostmanCollection } from './services/postman-importer';
import { importOpenAPISpec, isOpenAPISpec } from './services/openapi-importer';
import { importHarFile, isHarFile } from './services/har-importer';
import { importBrunoCollection } from './services/bruno-importer';
import { WelcomeViewProvider } from './panel/sidebar/WelcomeViewProvider';
import { createDaakiaChatHandler } from './panel/chat/chat-handler';
import { initSecretStore } from './services/secret-store';

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
              : importPostmanCollection(content);
          MainPanel.createOrShow(context.extensionUri);
          if (result.success) {
            MainPanel.currentPanel?.postMessage({ type: 'collectionsData', collections: getCollectionTree() });
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
        title: 'Import Bruno Collection (select folder)',
      });
      if (uri?.[0]) {
        try {
          const result = importBrunoCollection(uri[0].fsPath);
          MainPanel.createOrShow(context.extensionUri);
          if (result.success) {
            MainPanel.currentPanel?.postMessage({ type: 'collectionsData', collections: getCollectionTree() });
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

  console.log('[daakia] Activated successfully.');
}

export function deactivate() {
  stopAllMockServers();
  closeDb();
}
