import * as vscode from 'vscode';

export class WelcomeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'daakia.welcome';

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _dbReady: Promise<void>,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._getHtml();

    // Open main panel when sidebar first becomes visible — do NOT auto-close sidebar
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._dbReady.then(() => {
          vscode.commands.executeCommand('daakia.openPanel');
          // Note: sidebar stays open to show the quick-reference wiki
        });
      }
    });

    // Handle button clicks from the sidebar webview
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

    /* ── Open button ── */
    .open-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: calc(100% - 16px);
      margin: 10px 8px 0;
      padding: 9px 16px;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      background: #6366f1;
      color: #fff;
      transition: opacity 0.15s;
      flex-shrink: 0;
    }
    .open-btn:hover { opacity: 0.85; }

    /* ── Wiki scroll area ── */
    .wiki {
      flex: 1;
      overflow-y: auto;
      padding: 10px 8px 20px;
    }
    .wiki::-webkit-scrollbar { width: 4px; }
    .wiki::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 2px; }

    /* ── Section ── */
    .section {
      margin-bottom: 14px;
    }
    .section-title {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 5px;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
    }

    /* ── Feature row ── */
    .feat-row {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      padding: 4px 0;
    }
    .feat-emoji { font-size: 12px; flex-shrink: 0; width: 16px; }
    .feat-body { flex: 1; }
    .feat-title { font-size: 11px; font-weight: 600; color: var(--vscode-foreground); }
    .feat-desc { font-size: 10px; color: var(--vscode-descriptionForeground); line-height: 1.3; margin-top: 1px; }

    /* ── Shortcut row ── */
    .shortcut-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 3px 0;
    }
    .shortcut-label { font-size: 11px; color: var(--vscode-foreground); }
    .kbd {
      display: inline-flex;
      align-items: center;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 10px;
      font-family: monospace;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.15);
    }

    /* ── Badge row ── */
    .badge-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      border: 1px solid;
    }

    /* ── Tip box ── */
    .tip-box {
      padding: 7px 9px;
      border-radius: 6px;
      background: rgba(99,102,241,0.08);
      border: 1px solid rgba(99,102,241,0.22);
      font-size: 10px;
      color: #a5b4fc;
      line-height: 1.45;
      margin-bottom: 6px;
    }
    .tip-box strong { display: block; margin-bottom: 2px; font-weight: 600; }

    /* ── See more link ── */
    .see-more {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      padding: 6px 0;
      border-top: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.06));
      margin-top: 8px;
      cursor: pointer;
    }
    .see-more span { color: #818cf8; text-decoration: underline; cursor: pointer; }
  </style>
</head>
<body>
  <button class="open-btn" id="openBtn">
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6,14.71C3.11,13.85 1,11.17 1,8C1,4.14 4.14,1 8,1C11.86,1 15,4.14 15,8C15,8.34 14.98,8.67 14.93,8.99C14.82,7.95 14.24,7.06 13.4,6.53C12.76,4.15 10.58,2.4 8,2.4C4.91,2.4 2.4,4.91 2.4,8C2.4,10.57 4.13,12.73 6.48,13.39C6.18,13.73 6,14.11 6,14.54Z"/>
    </svg>
    Open Daakia Panel
  </button>

  <div class="wiki">
    <!-- Quick Start -->
    <div class="section">
      <div class="section-title">⚡ Quick Start</div>
      <div class="tip-box">
        <strong>Send your first request</strong>
        Type a URL → set method → click <strong>Send</strong> (or Ctrl+Enter)
      </div>
      <div class="shortcut-row"><span class="shortcut-label">Send request</span><span class="kbd">Ctrl+Enter</span></div>
      <div class="shortcut-row"><span class="shortcut-label">New tab</span><span class="kbd">Ctrl+T</span></div>
      <div class="shortcut-row"><span class="shortcut-label">Save request</span><span class="kbd">Ctrl+S</span></div>
      <div class="shortcut-row"><span class="shortcut-label">Command Palette</span><span class="kbd">Ctrl+Shift+P</span></div>
    </div>

    <!-- REST API -->
    <div class="section">
      <div class="section-title">📡 REST API</div>
      <div class="feat-row"><span class="feat-emoji">🔗</span><div class="feat-body"><div class="feat-title">Params & Headers</div><div class="feat-desc">Key-Value tables with enable/disable, badge counts, AI suggestions</div></div></div>
      <div class="feat-row"><span class="feat-emoji">📦</span><div class="feat-body"><div class="feat-title">Body</div><div class="feat-desc">JSON, XML, Form-data, URL-encoded, Binary, GraphQL modes</div></div></div>
      <div class="feat-row"><span class="feat-emoji">⏱️</span><div class="feat-body"><div class="feat-title">Timeline</div><div class="feat-desc">DNS, TCP, TLS, TTFB breakdown with visual bars</div></div></div>
      <div class="feat-row"><span class="feat-emoji">🍪</span><div class="feat-body"><div class="feat-title">Cookie Jar</div><div class="feat-desc">Auto-capture and replay per domain</div></div></div>
    </div>

    <!-- Protocols -->
    <div class="section">
      <div class="section-title">🔌 Protocols</div>
      <div class="badge-row">
        <span class="badge" style="color:#6366f1;border-color:rgba(99,102,241,0.3);background:rgba(99,102,241,0.1)">REST</span>
        <span class="badge" style="color:#c084fc;border-color:rgba(192,132,252,0.3);background:rgba(192,132,252,0.1)">GraphQL</span>
        <span class="badge" style="color:#22c55e;border-color:rgba(34,197,94,0.3);background:rgba(34,197,94,0.1)">WebSocket</span>
        <span class="badge" style="color:#06b6d4;border-color:rgba(6,182,212,0.3);background:rgba(6,182,212,0.1)">gRPC</span>
        <span class="badge" style="color:#f97316;border-color:rgba(249,115,22,0.3);background:rgba(249,115,22,0.1)">SOAP</span>
        <span class="badge" style="color:#eab308;border-color:rgba(234,179,8,0.3);background:rgba(234,179,8,0.1)">Mock</span>
        <span class="badge" style="color:#a855f7;border-color:rgba(168,85,247,0.3);background:rgba(168,85,247,0.1)">AI</span>
      </div>
    </div>

    <!-- Collections -->
    <div class="section">
      <div class="section-title">📁 Collections</div>
      <div class="feat-row"><span class="feat-emoji">📂</span><div class="feat-body"><div class="feat-title">Organize requests</div><div class="feat-desc">Nested folders, drag-to-reorder, right-click menu</div></div></div>
      <div class="feat-row"><span class="feat-emoji">📥</span><div class="feat-body"><div class="feat-title">Import</div><div class="feat-desc">Postman v2.1, OpenAPI 3.0, HAR, Bruno</div></div></div>
      <div class="feat-row"><span class="feat-emoji">▶️</span><div class="feat-body"><div class="feat-title">Collection Runner</div><div class="feat-desc">Run all requests sequentially with delay and stop-on-error</div></div></div>
    </div>

    <!-- AI -->
    <div class="section">
      <div class="section-title">🤖 AI Assistant</div>
      <div class="feat-row"><span class="feat-emoji">✦</span><div class="feat-body"><div class="feat-title">Daakia AI Panel</div><div class="feat-desc">Click ✦ in left rail for full AI chat with 8 specialized agents</div></div></div>
      <div class="feat-row"><span class="feat-emoji">@</span><div class="feat-body"><div class="feat-title">@daakia in VS Code Chat</div><div class="feat-desc">/request /mock /test /curl /explain slash commands</div></div></div>
      <div class="feat-row"><span class="feat-emoji">🔍</span><div class="feat-body"><div class="feat-title">Inline AI</div><div class="feat-desc">Ask AI why (errors), Explain response, Follow-up suggestions, Header hints</div></div></div>
    </div>

    <!-- Mock Server -->
    <div class="section">
      <div class="section-title">🎭 Mock Server</div>
      <div class="feat-row"><span class="feat-emoji">⚡</span><div class="feat-body"><div class="feat-title">Local servers</div><div class="feat-desc">REST, GraphQL, WebSocket, SSE, Socket.IO, MQTT, gRPC, SOAP</div></div></div>
      <div class="feat-row"><span class="feat-emoji">🤖</span><div class="feat-body"><div class="feat-title">AI Generate</div><div class="feat-desc">Generate mock content from server description automatically</div></div></div>
    </div>

    <div class="see-more" id="wikiLink">
      Full feature docs → <span>Settings → Daakia Wiki</span>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('openBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'openPanel' });
    });
    document.getElementById('wikiLink').addEventListener('click', () => {
      vscode.postMessage({ command: 'openPanel' });
    });
  </script>
</body>
</html>`;
  }
}
