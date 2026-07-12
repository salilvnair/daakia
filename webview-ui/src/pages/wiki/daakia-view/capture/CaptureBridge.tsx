/**
 * CaptureBridge — headless, always-mounted, passive until it receives a
 * `wiki:capture:run` message. Wiki capture automation driver: runs a small
 * sequence of real DOM actions (click, type, setPref, wait, waitForMessage)
 * against the already-rendered app, then captures `document.getElementById(
 * 'root').outerHTML` — the exact same technique as CopyRootHtmlButton's manual
 * 🧢 capture, just triggered programmatically by an e2e test/orchestrator
 * instead of a human click, so we can drive and capture every wiki screen
 * headlessly via @vscode/test-electron.
 *
 * Actions use real DOM methods (`.click()`, native value setter + `dispatchEvent`)
 * rather than synthetic coordinates, so React's event delegation picks them up
 * correctly — same principle as testing-library's fireEvent.
 *
 * To disable: comment out the import + <CaptureBridge /> in AppSidebar.tsx
 * (mirrors CopyRootHtmlButton's own disable instructions).
 */
import { useEffect } from 'react';
import { useUiStateStore } from '../../../../store/ui-state-store';
import { useTabsStore, type RequestTab } from '../../../../store/tabs-store';
import { useMockStore } from '../../../../store/mock-store';
import { useSidebarDataStore, type CollectionTreeNode, type HistoryEntry } from '../../../../store/sidebar-data-store';
import { useEnvStore, type Environment } from '../../../../store/env-store';
import { useDevToolsStore, type ConsoleLogEntry, type NetworkEntry, type DevToolsTab } from '../../../../store/devtools-store';
import type { MockServer } from '../../../../components/mock/mock-types';
import { getVsCodeApi } from '../../../../vscode';

export interface CaptureDirective {
  action: 'click' | 'clickText' | 'type' | 'wait' | 'setPref' | 'waitForMessage' | 'addTab' | 'updateActiveTab' | 'setActiveTabSubtab' | 'openMockServerTab' | 'addMockServer' | 'openSettingsTab' | 'closeAllTabs' | 'seedSidebarData' | 'seedEnvironments' | 'seedDevTools' | 'closeDevTools' | 'triggerDkSuggest' | 'assertNoDkTypeError';
  selector?: string;       // CSS selector — click, type
  text?: string;           // type
  ms?: number;             // wait
  prefKey?: string;        // setPref
  prefValue?: string;      // setPref
  messageType?: string;    // waitForMessage
  timeoutMs?: number;      // waitForMessage
  patch?: Partial<RequestTab>; // addTab, updateActiveTab — full control over tab content
  // (params/headers/body/auth/response/etc.) without fighting individual dynamic
  // row selectors. Resolves against whatever tab is active AT RUN TIME, so the
  // orchestrator never needs to know the generated tab id ahead of time.
  subtab?: string;         // setActiveTabSubtab — e.g. 'params' | 'headers' | 'body' | 'auth' | 'scripts' | 'variables'
  server?: MockServer;     // addMockServer — full control, selects it as active afterward
  // seedSidebarData — populate the Collections/History sidebar panels (empty by
  // default in a fresh capture session) with example data before opening them.
  protocol?: string;
  collections?: CollectionTreeNode[];
  history?: HistoryEntry[];
  // seedEnvironments
  environments?: Environment[];
  activeEnvId?: string | null;
  // seedDevTools
  logs?: Array<Omit<ConsoleLogEntry, 'id'>>;
  networkEntries?: Array<Omit<NetworkEntry, 'id'>>;
  devToolsTab?: DevToolsTab;
}

function setReactControlledValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// React re-renders (e.g. right after an addTab directive mounts a new tab bar)
// aren't always committed by the time the next directive runs — poll briefly
// rather than failing on the first miss.
async function waitForSelector<T extends HTMLElement>(selector: string, timeoutMs = 3000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = document.querySelector<T>(selector);
    if (el) return el;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`selector not found within ${timeoutMs}ms: ${selector}`);
}

// Finds the smallest (most specific) element whose exact trimmed text content
// matches `text`, for rows with no stable CSS selector (e.g. mock server list
// items — plain onClick divs keyed only by a runtime id).
async function waitForText(text: string, timeoutMs = 3000): Promise<HTMLElement> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter(
      el => el.children.length === 0 && el.textContent?.trim() === text,
    );
    if (candidates.length > 0) {
      // Walk up to the nearest element with a click handler-ish ancestor (cursor-pointer
      // is the convention used throughout this codebase for clickable divs).
      let el: HTMLElement | null = candidates[0];
      for (let i = 0; i < 5 && el; i++) {
        if (el.className && String(el.className).includes('cursor-pointer')) return el;
        el = el.parentElement;
      }
      return candidates[0];
    }
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`no element with text "${text}" found within ${timeoutMs}ms`);
}

function waitForMessage(messageType: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error(`waitForMessage('${messageType}') timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const handler = (e: MessageEvent) => {
      if (e.data?.type === messageType) {
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve();
      }
    };
    window.addEventListener('message', handler);
  });
}

async function runDirective(d: CaptureDirective): Promise<void> {
  switch (d.action) {
    case 'click': {
      const el = await waitForSelector(d.selector!);
      el.click();
      return;
    }
    case 'clickText': {
      const el = await waitForText(d.text!);
      el.click();
      return;
    }
    case 'type': {
      const el = await waitForSelector<HTMLInputElement | HTMLTextAreaElement>(d.selector!);
      el.focus();
      setReactControlledValue(el, d.text ?? '');
      return;
    }
    case 'wait': {
      await new Promise(r => setTimeout(r, d.ms ?? 300));
      return;
    }
    case 'setPref': {
      useUiStateStore.getState().setPref(d.prefKey!, d.prefValue ?? '');
      return;
    }
    case 'waitForMessage': {
      await waitForMessage(d.messageType!, d.timeoutMs ?? 10_000);
      return;
    }
    case 'addTab': {
      useTabsStore.getState().addTab(d.patch);
      return;
    }
    case 'updateActiveTab': {
      const id = useTabsStore.getState().activeTabId;
      if (id && d.patch) useTabsStore.getState().updateTab(id, d.patch);
      return;
    }
    case 'setActiveTabSubtab': {
      const id = useTabsStore.getState().activeTabId;
      if (id) useUiStateStore.getState().setPref(`rest.subtab.${id}`, d.subtab ?? 'params');
      return;
    }
    case 'openMockServerTab': {
      useTabsStore.getState().openMockServerTab();
      return;
    }
    case 'addMockServer': {
      if (!d.server) return;
      useMockStore.getState().addServer(d.server);
      useUiStateStore.getState().setPref('mock.activeServerId', d.server.id);
      return;
    }
    case 'openSettingsTab': {
      useTabsStore.getState().openSettingsTab();
      return;
    }
    case 'closeAllTabs': {
      useTabsStore.getState().closeAllTabs();
      return;
    }
    case 'seedSidebarData': {
      if (!d.protocol) return;
      useSidebarDataStore.getState().setCollections(d.protocol, d.collections ?? []);
      useSidebarDataStore.getState().setHistory(d.protocol, d.history ?? []);
      return;
    }
    case 'seedEnvironments': {
      useEnvStore.getState().hydrateEnvironments(d.environments ?? [], d.activeEnvId ?? null);
      return;
    }
    case 'seedDevTools': {
      const store = useDevToolsStore.getState();
      // Logs/network entries persist across the whole webview session (like
      // sidebar data) — clear first so unrelated entries from earlier in this
      // same capture run (or real app activity, e.g. the Settings Audit
      // Trail logger in App.tsx) don't leak into what should be a clean,
      // deliberately-seeded example screen.
      store.clearLogs();
      store.clearNetwork();
      store.open();
      if (d.devToolsTab) store.setActiveTab(d.devToolsTab);
      if (d.logs?.length) store.addLogs(d.logs);
      for (const entry of d.networkEntries ?? []) store.addNetworkEntry(entry);
      return;
    }
    case 'closeDevTools': {
      useDevToolsStore.getState().close();
      return;
    }
    case 'triggerDkSuggest': {
      // Real end-to-end proof that dk IntelliSense actually fires — not just
      // that registerDkLanguageSupport() got called. Uses the real Monaco
      // editor/model instance stashed by ScriptsEditor.tsx (test-only hook),
      // sets its content to "dk.", and asks Monaco's own suggest command to
      // open its real widget — the exact same command the editor itself
      // fires when a user types. Whatever ends up in the DOM here is what
      // the capture will snapshot, so a passing/failing assertion on the
      // resulting HTML is a genuine proof, not a code-reading inference.
      const editor = (window as any).__scriptsEditorRef;
      if (!editor) throw new Error('Scripts editor not mounted — run a setActiveTabSubtab: "scripts" directive first');
      editor.setValue('dk.');
      const model = editor.getModel();
      const lastLine = model.getLineCount();
      editor.setPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) });
      editor.focus();
      editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
      return;
    }
    case 'assertNoDkTypeError': {
      // Direct proof that addExtraLib(DK_TYPE_DEFS) actually suppressed the
      // "Cannot find name 'dk'" diagnostic the user's screenshot showed (the
      // red squiggle) — reads Monaco's own real marker list for the live
      // model, the same data VS Code's Problems panel / squiggles come from.
      const editor = (window as any).__scriptsEditorRef;
      const monaco = (window as any).__monacoRef;
      if (!editor || !monaco) throw new Error('Scripts editor not mounted — run a setActiveTabSubtab: "scripts" directive first');
      editor.setValue('dk.env.get("x");');
      await new Promise(r => setTimeout(r, 500)); // let the TS/JS language service re-diagnose
      const model = editor.getModel();
      const markers = monaco.editor.getModelMarkers({ resource: model.uri });
      const dkError = markers.find((m: any) => /cannot find name ['"]dk['"]/i.test(m.message ?? ''));
      if (dkError) throw new Error(`Monaco still reports "${dkError.message}" — dk type declaration is NOT suppressing the error`);
      return;
    }
  }
}

export function CaptureBridge() {
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type !== 'wiki:capture:run') return;
      const { id, directives } = msg as { id: string; directives: CaptureDirective[] };
      getVsCodeApi().postMessage({ type: 'wiki:capture:ack', id });
      try {
        for (const d of directives ?? []) {
          await runDirective(d);
        }
        // Let React commit before capturing. Deliberately NOT requestAnimationFrame —
        // rAF callbacks can be throttled or never fire when the webview panel isn't
        // the visible/focused one (e.g. during headless-ish @vscode/test-electron
        // runs), which silently hung this whole pipeline after the ack.
        await new Promise(r => setTimeout(r, 50));
        const root = document.getElementById('root');
        // Monaco (the engine behind DUI's EditorView) tokenizes into plain
        // `.mtk*` classes and injects the actual per-theme colors as a
        // separate <style class="monaco-colors"> in document.head — entirely
        // outside #root, so a bare outerHTML capture reproduces the token
        // markup but renders it colorless. Prepend that stylesheet (a plain
        // <style> tag applies wherever it's parsed, including inside a
        // dangerouslySetInnerHTML'd div) so every captured editor screen
        // keeps its real syntax highlighting in the wiki.
        const monacoStyles = Array.from(document.head.querySelectorAll('style'))
          .filter(el => (el.className && String(el.className).includes('monaco')) || (el.id && el.id.includes('monaco')))
          .map(el => el.outerHTML)
          .join('');
        const html = monacoStyles + (root?.outerHTML ?? '');
        getVsCodeApi().postMessage({ type: 'wiki:capture:result', id, html });
      } catch (err) {
        getVsCodeApi().postMessage({ type: 'wiki:capture:error', id, error: err instanceof Error ? err.message : String(err) });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return null;
}
