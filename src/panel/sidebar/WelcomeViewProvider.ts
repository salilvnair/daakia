import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MainPanel } from '../main/MainPanel';

export class WelcomeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'daakia.welcome';

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _dbReady: Promise<void>,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    const distUri = vscode.Uri.joinPath(this._extensionUri, 'webview', 'dist');

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [distUri],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview, distUri);

    // Open main panel when sidebar first becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._dbReady.then(() => {
          vscode.commands.executeCommand('daakia.openPanel');
        });
      }
    });

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.command === 'openPanel') {
        vscode.commands.executeCommand('daakia.openPanel');
      } else if (msg.command === 'openWiki') {
        vscode.commands.executeCommand('daakia.openPanel').then(() => {
          setTimeout(() => {
            MainPanel.currentPanel?.postMessage({ type: 'navigate', panel: 'settings', section: 'wiki' });
          }, 300);
        });
      }
    });
  }

  private _getHtml(webview: vscode.Webview, distUri: vscode.Uri): string {
    const sidebarHtmlPath = path.join(distUri.fsPath, 'sidebar.html');

    if (fs.existsSync(sidebarHtmlPath)) {
      let html = fs.readFileSync(sidebarHtmlPath, 'utf-8');
      const baseUri = webview.asWebviewUri(distUri).toString();
      // Rewrite relative asset paths to webview URIs
      html = html.replace(/(href|src)="\.?\/?(?!https?:\/\/)/g, `$1="${baseUri}/`);
      html = html.replace(
        '<head>',
        `<head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline' blob:; font-src ${webview.cspSource} data:;">`
      );
      return html;
    }

    // Fallback: inline HTML shown before first build
    return this._getFallbackHtml();
  }

  private _getFallbackHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: 12px;
      background: transparent;
      color: var(--vscode-foreground);
      display: flex;
      flex-direction: column;
      gap: 0;
      height: 100vh;
      overflow: hidden;
    }
    .open-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: calc(100% - 16px);
      margin: 10px 8px 0;
      padding: 9px 16px;
      border: none;
      border-radius: 7px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      background: #6366f1;
      color: #fff;
      transition: opacity 0.15s;
      flex-shrink: 0;
      font-family: inherit;
    }
    .open-btn:hover { opacity: 0.85; }
    .body { flex: 1; overflow-y: auto; padding: 12px 8px 20px; display: flex; align-items: center; justify-content: center; }
    .note { font-size: 11px; color: var(--vscode-descriptionForeground); text-align: center; line-height: 1.5; }
    code { background: rgba(99,102,241,0.12); padding: 1px 5px; border-radius: 3px; font-size: 10px; }
  </style>
</head>
<body>
  <button class="open-btn" id="openBtn">Open Daakia Panel</button>
  <div class="body">
    <div class="note">
      Sidebar not built yet.<br>
      Run <code>npm run build:webview</code> to enable the full wiki.
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('openBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'openPanel' });
    });
  </script>
</body>
</html>`;
  }
}
