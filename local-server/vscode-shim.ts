/**
 * Minimal 'vscode' module shim — lets local-server/ import the REAL extension-host
 * handler modules (src/panel/main/handlers/*, src/storage/db.ts) unmodified, outside
 * a real VS Code process. Covers only the small API surface those modules actually
 * call (confirmed via grep — see local-server/README.md). Not a general-purpose
 * vscode mock; do not grow this beyond what a real handler needs.
 *
 * Wired in at bundle time by local-server/build.js aliasing `from 'vscode'` to this
 * file — never imported directly by app code.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── workspace.getConfiguration ────────────────────────────────────────────────
// Real settings live in the app's own SQLite `app_settings` table (getSetting/
// setSetting in storage/db.ts) — handlers only fall back to vscode's workspace
// config for a couple of legacy/optional overrides. Always returning the
// caller's default here means "no override set", which is the correct behavior.
function getConfiguration(_section?: string) {
  return {
    get<T>(_key: string, defaultValue?: T): T | undefined {
      return defaultValue;
    },
  };
}

// ─── window.show*Dialog / show*Message ─────────────────────────────────────────
// No real UI process to show a native dialog in. showSaveDialog auto-approves
// into local-server/downloads/ instead of silently no-op'ing, so "Send &
// Download" and similar flows still produce a real, inspectable file.
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

async function showSaveDialog(opts?: { defaultUri?: { fsPath: string } }) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  const name = opts?.defaultUri?.fsPath ? path.basename(opts.defaultUri.fsPath) : `download-${Date.now()}`;
  const fsPath = path.join(DOWNLOADS_DIR, name);
  console.log(`[vscode-shim] showSaveDialog auto-approved -> ${fsPath}`);
  return { fsPath };
}

async function showOpenDialog(opts?: { canSelectFolders?: boolean }) {
  // Folder picks auto-approve to a temp directory so flows that end in "choose
  // where to save" can actually be exercised in the browser harness. File
  // picks still cancel — there is nothing sensible to invent for those.
  if (opts?.canSelectFolders) {
    const dir = path.join(os.tmpdir(), 'daakia-local-server-out');
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[vscode-shim] showOpenDialog auto-approved folder -> ${dir}`);
    return [{ fsPath: dir }];
  }
  console.log('[vscode-shim] showOpenDialog has no real UI here — returning undefined (cancelled)');
  return undefined;
}

async function showInputBox(_opts?: unknown) {
  console.log('[vscode-shim] showInputBox has no real UI here — returning undefined (cancelled)');
  return undefined;
}

async function showWarningMessage(message: string, ..._choices: string[]) {
  console.log(`[vscode-shim] showWarningMessage (auto-dismissed, no auto-trust): ${message}`);
  return undefined;
}

async function showErrorMessage(message: string) {
  console.error(`[vscode-shim] showErrorMessage: ${message}`);
  return undefined;
}

async function showInformationMessage(message: string) {
  console.log(`[vscode-shim] showInformationMessage: ${message}`);
  return undefined;
}

// ─── Uri ────────────────────────────────────────────────────────────────────────
const Uri = {
  file(fsPath: string) {
    return { fsPath, scheme: 'file', toString: () => `file://${fsPath}` };
  },
};

// ─── env ──────────────────────────────────────────────────────────────────────
const env = {
  clipboard: {
    async writeText(text: string) {
      console.log(`[vscode-shim] clipboard.writeText (no real clipboard here): ${text.slice(0, 80)}${text.length > 80 ? '...' : ''}`);
    },
  },
};

// ─── Language Model API (vscode.lm) ────────────────────────────────────────────
// There's no real VS Code process here, so there's no real Copilot connection —
// always report zero available models. src/ai/copilot-executor.ts already treats
// an empty selectChatModels() result as "not signed into Copilot," which is the
// accurate statement for local-server, not a hack.
const lm = {
  async selectChatModels(_filter?: unknown) {
    return [] as unknown[];
  },
};

class LanguageModelChatMessage {
  role: 'user' | 'assistant';
  content: string;
  constructor(role: 'user' | 'assistant', content: string) {
    this.role = role;
    this.content = content;
  }
  static Assistant(content: string) { return new LanguageModelChatMessage('assistant', content); }
  static User(content: string) { return new LanguageModelChatMessage('user', content); }
}

class LanguageModelError extends Error {
  code: string;
  constructor(message: string, code = '500') {
    super(message);
    this.code = code;
  }
}

class CancellationTokenSource {
  token: { isCancellationRequested: boolean; onCancellationRequested: (listener: () => void) => { dispose(): void } };
  private _cancelled = false;
  private _listeners: Array<() => void> = [];

  constructor() {
    const self = this;
    this.token = {
      get isCancellationRequested() { return self._cancelled; },
      onCancellationRequested(listener: () => void) {
        self._listeners.push(listener);
        return { dispose() { /* no-op */ } };
      },
    };
  }

  cancel() {
    if (this._cancelled) return;
    this._cancelled = true;
    this._listeners.forEach((l) => l());
  }

  dispose() {
    this._listeners = [];
  }
}

// ─── ExtensionContext-adjacent (unused today, present for future handlers) ────
export const window = {
  showSaveDialog,
  showOpenDialog,
  showInputBox,
  showWarningMessage,
  showErrorMessage,
  showInformationMessage,
};

export const workspace = {
  getConfiguration,
};

export { Uri, env, lm, LanguageModelChatMessage, LanguageModelError, CancellationTokenSource };

// Default export too — some call sites may do `import * as vscode from 'vscode'`
// (named-namespace import), which esbuild resolves against these named exports
// directly, not this default. Kept for completeness/defensive compatibility.
export default { window, workspace, Uri, env, lm, LanguageModelChatMessage, LanguageModelError, CancellationTokenSource };
