import * as vscode from 'vscode';

export class WelcomeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'daakia.welcome';

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._getHtml();

    // Only open main panel on explicit user interaction (click the sidebar button)
    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.command === 'openPanel') {
        vscode.commands.executeCommand('daakia.openPanel');
      }
    });
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: var(--vscode-font-family);
      background: transparent;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 10px 16px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-primary {
      background: #6366f1;
      color: #fff;
    }
    .subtitle {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <button class="btn btn-primary" id="openBtn">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6,14.71 C3.11,13.85 1,11.17 1,8 C1,4.14 4.14,1 8,1 C11.86,1 15,4.14 15,8 C15,8.34 14.98,8.67 14.93,8.99 C14.82,7.95 14.24,7.06 13.4,6.53 C12.76,4.15 10.58,2.4 8,2.4 C4.91,2.4 2.4,4.91 2.4,8 C2.4,10.57 4.13,12.73 6.48,13.39 C6.18,13.73 6,14.11 6,14.54 L6,14.71 Z M13.43,6.64 C12.99,4.9 11.74,3.48 10.1,2.81 L10.1,3.1 C10.1,3.87 9.47,4.5 8.7,4.5 L7.3,4.5 L7.3,5.9 C7.3,6.29 6.99,6.6 6.6,6.6 L5.2,6.6 L5.2,8 L8.5,8 C8.34,8.38 8.25,8.81 8.25,9.25 C8.25,10.33 8.77,11.28 9.58,11.87 C8.78,12.06 7.96,12.35 7.3,12.74 L7.3,12.2 C6.53,12.2 5.9,11.57 5.9,10.8 L5.9,10.1 L2.55,6.75 C2.46,7.15 2.4,7.56 2.4,8 C2.4,4.91 4.91,2.4 8,2.4 C10.62,2.4 12.82,4.2 13.43,6.64 Z M11.5,11.5 C12.74,11.5 13.75,10.49 13.75,9.25 C13.75,8.01 12.74,7 11.5,7 C10.26,7 9.25,8.01 9.25,9.25 C9.25,10.49 10.26,11.5 11.5,11.5 Z M11.5,12.63 C10,12.63 7,13.38 7,14.88 L7,16 L16,16 L16,14.88 C16,13.38 13,12.63 11.5,12.63 Z"/>
    </svg>
    Open Daakia Panel
  </button>
  <p class="subtitle">Quick Access — API Client</p>
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
