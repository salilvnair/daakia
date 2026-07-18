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
import { installSMRestWorkflow } from '../../../../components/mock/samples/sm-rest-workflows';
import { useSMWorkspaceStore, useSMTabsStore } from '@salilvnair/state-machine';
import { getVsCodeApi } from '../../../../vscode';

export interface CaptureDirective {
  action: 'click' | 'clickText' | 'type' | 'wait' | 'setPref' | 'waitForMessage' | 'addTab' | 'updateActiveTab' | 'setActiveTabSubtab' | 'setResponseSubtab' | 'seedRealtimeState' | 'openMockServerTab' | 'addMockServer' | 'openSettingsTab' | 'closeAllTabs' | 'seedSidebarData' | 'seedEnvironments' | 'seedDevTools' | 'closeDevTools' | 'triggerDkSuggest' | 'assertNoDkTypeError' | 'closeModals' | 'seedAiAudit' | 'key' | 'openStateMachineTab' | 'seedStateMachineWorkflow';
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
  /** setActiveTabSubtab — pref-key prefix; defaults to 'rest' for backward compat (e.g. 'ws' writes ws.subtab.<id>). */
  subtabProtocol?: string;
  /** setResponseSubtab — response-panel sub-tab (grpc/soap/rest). Uses per-protocol pref key. */
  responseProtocol?: 'rest' | 'grpc' | 'soap';
  /** clickText — 0-based index into matching elements; -1 = last match; default 0. */
  nthMatch?: number;
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
  // seedRealtimeState — pushes into the WS/SSE/SocketIO/MQTT panel's own
  // module-level message cache via a test-only window hook each panel exposes
  // (__wsCaptureSeed / __sseCaptureSeed / __sioCaptureSeed / __mqttCaptureSeed),
  // since that state lives outside useTabsStore and can't be seeded via `patch`.
  realtimeProtocol?: 'ws' | 'sse' | 'sio' | 'mqtt';
  realtimeMessages?: Record<string, unknown>[];
  realtimeConnState?: 'disconnected' | 'connecting' | 'connected';
  realtimeSocketId?: string;
  // seedAiAudit — pushes into AiAuditPanel's own local entries state via a
  // test-only window hook (__aiAuditCaptureSeed), same pattern as
  // seedRealtimeState, since real audit entries only exist after a real AI
  // call and a fresh e2e session's DB has none.
  aiAuditEntries?: Record<string, unknown>[];
  // key — dispatches a real keydown at window level so app-level shortcut
  // handlers (registerShortcut/keyboard-registry.ts) fire exactly as they
  // would for a real user keypress (e.g. Ctrl/Cmd+K for the command palette).
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  // openStateMachineTab — opens (or focuses) Daakia's own State Machine
  // canvas tab, optionally linked to a mock server.
  serverId?: string;
  // seedStateMachineWorkflow — installs one of the built-in sample workflows
  // (sm-rest-workflows.ts) into the state-machine library's own
  // useSMWorkspaceStore, then opens it as a workflow tab (useSMTabsStore) so
  // CenterPane's activeTabId-keyed effect loads its real nodes/edges onto
  // the canvas — mirrors exactly what WorkflowsPanel.tsx's own "Open" click
  // does. Both stores live inside @salilvnair/state-machine, entirely
  // outside useTabsStore/useMockStore, so there's no other way to seed them.
  sampleId?: string;
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
      // Support nthMatch (default 0 = first, -1 = last) for repeated labels
      // (e.g. gRPC has "Metadata" in both the request AND response tab strips).
      const nth = d.nthMatch ?? 0;
      const start = Date.now();
      const timeoutMs = 3000;
      let target: HTMLElement | null = null;
      while (Date.now() - start < timeoutMs) {
        const candidates = Array.from(document.querySelectorAll<HTMLElement>('body *'))
          .filter(el => el.children.length === 0 && el.textContent?.trim() === d.text);
        if (candidates.length > (nth < 0 ? 0 : nth)) {
          const raw = nth < 0 ? candidates[candidates.length + nth] : candidates[nth];
          let walk: HTMLElement | null = raw;
          for (let i = 0; i < 5 && walk; i++) {
            if (walk.tagName === 'BUTTON') { target = walk; break; }
            if (walk.className && String(walk.className).includes('cursor-pointer')) { target = walk; break; }
            walk = walk.parentElement;
          }
          target = target ?? raw;
          break;
        }
        await new Promise(r => setTimeout(r, 50));
      }
      if (!target) throw new Error(`clickText: no match ${nth} for "${d.text}"`);
      target.click();
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
      const prefix = d.subtabProtocol ?? 'rest';
      if (id) useUiStateStore.getState().setPref(`${prefix}.subtab.${id}`, d.subtab ?? 'params');
      return;
    }
    case 'seedRealtimeState': {
      const hookName = { ws: '__wsCaptureSeed', sse: '__sseCaptureSeed', sio: '__sioCaptureSeed', mqtt: '__mqttCaptureSeed' }[d.realtimeProtocol!];
      const fn = hookName ? (window as any)[hookName] : undefined;
      if (!fn) throw new Error(`seedRealtimeState: ${hookName} not mounted yet — the target panel must be open first`);
      fn(d.realtimeMessages ?? [], d.realtimeConnState ?? 'connected', d.realtimeSocketId);
      return;
    }
    case 'setResponseSubtab': {
      // Response-panel sub-tab uses a per-protocol pref key
      // (e.g. `grpc.response.subtab.<id>`, `soap.response.subtab.<id>`).
      const id = useTabsStore.getState().activeTabId;
      const proto = d.responseProtocol ?? 'grpc';
      if (id) useUiStateStore.getState().setPref(`${proto}.response.subtab.${id}`, d.subtab ?? 'body');
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
    case 'closeModals': {
      // ModalView (dui2) listens for a real document-level Escape keydown and
      // calls its own onClose — dispatching one closes WHICHEVER modal is
      // currently open, generically, regardless of which screen/test left it
      // mounted. Modals can stack (ModalView's _mountLayer), so fire a few
      // with waits in between rather than assuming a single layer.
      for (let i = 0; i < 3; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
      }
      return;
    }
    case 'seedAiAudit': {
      const fn = (window as any).__aiAuditCaptureSeed;
      if (!fn) throw new Error('seedAiAudit: __aiAuditCaptureSeed not mounted yet — open the AI Audit settings section first');
      fn(d.aiAuditEntries ?? []);
      return;
    }
    case 'key': {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: d.key ?? '',
        ctrlKey: d.ctrlKey ?? false,
        metaKey: d.metaKey ?? false,
        shiftKey: d.shiftKey ?? false,
        altKey: d.altKey ?? false,
        bubbles: true,
      }));
      return;
    }
    case 'openStateMachineTab': {
      useTabsStore.getState().openStateMachineTab(d.serverId);
      return;
    }
    case 'seedStateMachineWorkflow': {
      const machine = installSMRestWorkflow(d.sampleId!);
      if (!machine) throw new Error(`seedStateMachineWorkflow: unknown sampleId "${d.sampleId}"`);
      useSMTabsStore.getState().openWorkflowTab(machine.id, machine.name, machine.color);
      useSMWorkspaceStore.getState().setActiveMachine(machine.id);
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
        // DUI's ModalView (GenerateCodeModal, ImportCurlModal, every other
        // popup) renders via createPortal(..., document.body) — a SIBLING of
        // #root, not a descendant — so a bare #root capture silently drops
        // any modal that's open at capture time. Append every extra direct
        // child of <body> (i.e. anything that isn't #root itself) so open
        // modals are captured too. These portals use `position: fixed;
        // inset: 0`, which — once injected into CaptureCard's `transform:
        // scale(...)` frame — is correctly re-contained to that frame's
        // design box (a CSS transform establishes a new containing block for
        // fixed-position descendants), so the modal renders at the right
        // size relative to the rest of the capture.
        const portalHtml = Array.from(document.body.children)
          .filter(el => el.id !== 'root')
          .map(el => el.outerHTML)
          .join('');
        const html = monacoStyles + (root?.outerHTML ?? '') + portalHtml;
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
