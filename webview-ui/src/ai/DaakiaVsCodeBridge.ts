/**
 * DaakiaVsCodeBridge — bridges ConvEngineChat's HTTP/SSE transport
 * to Daakia's VS Code postMessage protocol.
 *
 * ConvEngineChat expects:
 *   POST /api/v1/conversation/message → JSON response { payload: { value: string } }
 *   EventSource /api/v1/conversation/stream/{conversationId} → SSE events
 *
 * Daakia uses:
 *   sendAiRequest({ stage, screen, tabId, ... }) → sends request to extension
 *   window.message({ type: 'ai:chunk', tabId, text }) → streaming token
 *   window.message({ type: 'ai:complete', tabId, message }) → final response
 *   window.message({ type: 'ai:error', tabId, message }) → error
 *
 * The bridge intercepts fetch and EventSource globally, routing ConvEngine calls
 * through the Daakia protocol. The conversationId in ConvEngine = tabId in Daakia.
 */

import { useK8sStore } from '../store/k8s-store';
import { useAiPromptTemplatesStore } from '../store/prompt-template';
import { useUiStateStore } from '../store/ui-state-store';
import { DK8S_CHAT_SYSTEM, fillDk8sSystem, dk8sChatOn, dk8sScoped, DK8S_EXCLUDED_PREF } from '../components/ai/dk8s-chat-prompts';
import { useDk8sAiProgress } from '../store/dk8s-ai-progress-store';
import { useDk8sAiSteps } from '../store/dk8s-ai-steps-store';
import { displayEnvelope, forModel, noticeEnvelope } from '../components/ai/ai-display';
import { currentId, useAiChatSessions } from '../store/ai-chat-sessions-store';
import { getVsCodeApi } from '../vscode';
import { useTabsStore } from '../store/tabs-store';
import { useAiProvidersStore } from '../store/ai-providers-store';
import { useAiConversationStore } from '../store/ai-conversation-store';
import { sendAiRequest } from '../services/ai/ai-client';

const CE_MESSAGE_PATH = '/api/v1/conversation/message';
const CE_STREAM_PATH = '/api/v1/conversation/stream/';

// ─── Fake EventSource ───────────────────────────────────────────────────────

type EventHandler = (e: MessageEvent) => void;

class DaakiaEventSource {
  private _listeners: Record<string, EventHandler[]> = {};
  private _msgHandler: (evt: MessageEvent) => void;
  private _closed = false;

  onopen: (() => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  constructor(url: string) {
    // Extract tabId from: /api/v1/conversation/stream/{tabId}
    // Resolve stable 'daakia-ai-panel' alias → actual daakia-ai tab UUID
    let tabId = url.split('/').pop() ?? '';
    if (tabId === 'daakia-ai-panel') {
      const daakiaAiTab = useTabsStore.getState().tabs.find(t => t.type === 'daakia-ai');
      if (daakiaAiTab) tabId = daakiaAiTab.id;
    }

    this._msgHandler = (evt: MessageEvent) => {
      if (this._closed) return;
      const msg = evt.data as Record<string, unknown>;
      if (!msg || typeof msg !== 'object') return;

      // ai:chunk → fire VERBOSE stage (shows "Thinking..." progress indicator)
      if (msg.type === 'ai:chunk' && msg.tabId === tabId) {
        const fakeEvt = new MessageEvent('VERBOSE', {
          data: JSON.stringify({ verbose: { text: 'Thinking…' } }),
        });
        (this._listeners['VERBOSE'] ?? []).forEach(fn => fn(fakeEvt));
      }

      /*
        A dk8s search in progress is said in plain words first — what is being
        searched and where — and then what it found, while the answer is
        written. The card replaces both when the answer arrives.
      */
      /* A look in the manual — quick, but said, so the pause has a reason. */
      if (msg.tabId === tabId && msg.type === 'ai:docsLookup') {
        const fakeEvt = new MessageEvent('VERBOSE', { data: JSON.stringify({ verbose: { text: 'Looking in the Daakia manual…' } }) });
        (this._listeners['VERBOSE'] ?? []).forEach(fn => fn(fakeEvt));
      }

      /* A kubectl run, said in words while it runs — what it is running and why. */
      if (msg.tabId === tabId && (msg.type === 'ai:kubectlRunStarted' || msg.type === 'ai:kubectlRunResult')) {
        /* Short: the command and the reason are in the steps card under this
           line, in a box that wraps — not one long monospaced sentence. */
        const text = msg.type === 'ai:kubectlRunStarted'
          ? 'Running a command…'
          : 'Reading what came back…';
        const fakeEvt = new MessageEvent('VERBOSE', { data: JSON.stringify({ verbose: { text } }) });
        (this._listeners['VERBOSE'] ?? []).forEach(fn => fn(fakeEvt));
      }

      if (msg.tabId === tabId && (msg.type === 'ai:dk8sSearchStarted' || msg.type === 'ai:dk8sSearchResult')) {
        const text = msg.type === 'ai:dk8sSearchStarted'
          ? `Searching the logs of ${msg.pods} pod${msg.pods === 1 ? '' : 's'}…`
          : describeFound(msg.result as { groups?: { failures?: number }[]; scanned?: { pods?: number } });
        const fakeEvt = new MessageEvent('VERBOSE', { data: JSON.stringify({ verbose: { text } }) });
        (this._listeners['VERBOSE'] ?? []).forEach(fn => fn(fakeEvt));
      }

      // ai:complete or ai:error → fire ENGINE_RETURN (clears progress)
      if ((msg.type === 'ai:complete' || msg.type === 'ai:error') && msg.tabId === tabId) {
        const fakeEvt = new MessageEvent('ENGINE_RETURN', {
          data: JSON.stringify({}),
        });
        (this._listeners['ENGINE_RETURN'] ?? []).forEach(fn => fn(fakeEvt));
      }
    };

    window.addEventListener('message', this._msgHandler);
    setTimeout(() => this.onopen?.(), 0);
  }

  addEventListener(type: string, fn: EventHandler) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }

  removeEventListener(type: string, fn: EventHandler) {
    if (this._listeners[type]) {
      this._listeners[type] = this._listeners[type].filter(l => l !== fn);
    }
  }

  close() {
    this._closed = true;
    window.removeEventListener('message', this._msgHandler);
  }
}

function describeFound(result: { groups?: { failures?: number }[]; scanned?: { pods?: number } } | undefined): string {
  const groups = result?.groups ?? [];
  if (!groups.length) return `Nothing matched in ${result?.scanned?.pods ?? 0} pods — saying so…`;
  const failures = groups.reduce((n, g) => n + (g.failures ?? 0), 0);
  return `Found ${groups.length} thread${groups.length === 1 ? '' : 's'}`
    + (failures ? `, ${failures} failure${failures === 1 ? '' : 's'}` : '')
    + ' — writing the answer…';
}

// ─── Pending request registry ────────────────────────────────────────────────

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  accumulated: string;
  tabId: string;
  /** What was asked — offered again when the answer is stopped or fails. */
  message: string;
  /** The Daakia AI tab answers a failure in the thread, with a Retry, rather than as a thrown error. */
  inThread: boolean;
  /** Fires when nothing has been heard for this request in QUIET_LIMIT_MS. */
  watchdog?: ReturnType<typeof setTimeout>;
}

const pendingRequests = new Map<string, PendingRequest>();

/*
  How long an answer may go without a word from the host before it is given up.

  The host sends something for every step — a chunk, a tool call, a search
  phase — so silence this long means the request is gone, not slow: the host
  restarted under it, or the message was lost. Without this the thinking row
  spun forever, and the only way out was a new chat. Three minutes is past the
  longest thinking-model round seen (about a minute) plus a full dk8s search.
*/
const QUIET_LIMIT_MS = 180_000;

function armWatchdog(tabId: string): void {
  const pending = pendingRequests.get(tabId);
  if (!pending) return;
  if (pending.watchdog) clearTimeout(pending.watchdog);
  pending.watchdog = setTimeout(() => {
    if (pendingRequests.get(tabId) !== pending) return;
    /* Through the same message every other failure takes, so the thread,
       the progress box and the audit all close it the usual way — and the
       thread offers the question again. */
    window.postMessage({
      type: 'ai:error', tabId,
      message: 'No reply from Daakia for three minutes — the request was lost (Daakia may have restarted).',
    }, '*');
  }, QUIET_LIMIT_MS);
}

// ─── Global message listener ─────────────────────────────────────────────────

function handleExtensionMessage(evt: MessageEvent) {
  const msg = evt.data as Record<string, unknown>;
  if (!msg || typeof msg !== 'object') return;

  const tabId = msg.tabId as string;
  if (!tabId) return;

  const pending = pendingRequests.get(tabId);
  if (!pending) return;
  /* Any word about this request resets the clock. */
  if (typeof msg.type === 'string' && msg.type.startsWith('ai:')) armWatchdog(tabId);

  if (msg.type === 'ai:chunk') {
    // Accumulate streaming tokens — executor sends 'delta', bridge also accepts 'text' as fallback
    const text = (msg.delta as string) || (msg.text as string) || '';
    if (text) pending.accumulated += text;
  }

  if (msg.type === 'ai:complete') {
    if (pending.watchdog) clearTimeout(pending.watchdog);
    pendingRequests.delete(tabId);

    // Use accumulated streaming text if available, otherwise use message.content
    const msgObj = msg.message as Record<string, unknown> | undefined;
    const content = pending.accumulated || (msgObj?.content as string) || '';

    // For daakia-ai tabs, conversation is managed by useAiConversationStore (global, persisted).
    // App.tsx's ai:complete handler also fires and calls finalizeAssistantMessage — skip here to avoid double.
    // For other tab types, App.tsx handles it too. Bridge just resolves the pending fetch promise.

    // Wrap plain text in a JSON envelope so ConvEngineChat's tryParseJsonObject
    // succeeds → payload = { type: 'text', rawText: content }.
    // DaakiaMdRendererComponent reads payload.rawText to feed MdViewer.
    /* An answer that ran a dk8s search carries the search's own result, so the
       card can draw the lines themselves rather than trust the prose. */
    const wrapped = displayEnvelope(content, msg.dk8s as unknown[] | undefined);
    pending.resolve({ payload: { value: wrapped } });
  }

  if (msg.type === 'ai:error') {
    if (pending.watchdog) clearTimeout(pending.watchdog);
    pendingRequests.delete(tabId);
    useTabsStore.getState().updateTab(tabId, { aiStreaming: false, loading: false });
    const errorMsg = msg.message as string ?? 'AI request failed';
    if (pending.inThread) pending.resolve({ payload: { value: noticeEnvelope(errorMsg, 'error', pending.message) } });
    else pending.reject(new Error(errorMsg));
  }

  /* Stopped from the composer: the thread says so, and offers the question again. */
  if (msg.type === 'ai:cancelled') {
    if (pending.watchdog) clearTimeout(pending.watchdog);
    pendingRequests.delete(tabId);
    useTabsStore.getState().updateTab(tabId, { aiStreaming: false, loading: false });
    if (pending.inThread) pending.resolve({ payload: { value: noticeEnvelope('Stopped before it answered.', 'stopped', pending.message) } });
    else pending.reject(new Error('Stopped.'));
  }
}

/**
 * The dk8s system prompt for this message and the pods it may search — or
 * nothing when dk8s is off or nothing is on screen.
 *
 * The pods travel with the message: they are the ones the user is looking
 * at, and the host searching its own idea of "watched" is how the prompt and
 * the tool came apart — after a host restart the prompt described nine pods
 * and the tool was not offered, so the model described a search instead of
 * running one.
 */
function dk8sChatContext(tabId: string): { prompt: string; targets: Dk8sTarget[] } | undefined {
  if (!dk8sChatOn(currentId(tabId))) return undefined;
  const k8s = useK8sStore.getState();
  /* The pods on screen, less the ones the picker in the pill leaves out. */
  const shown = dk8sScoped(k8s.pods
    .filter(p => (!k8s.context || p.context === k8s.context) && (!k8s.namespace || p.namespace === k8s.namespace)),
  useUiStateStore.getState().prefs[DK8S_EXCLUDED_PREF]);
  if (!shown.length) return undefined;
  const template = useAiPromptTemplatesStore.getState().templates['dk8s.chat.system'] || DK8S_CHAT_SYSTEM;
  return {
    prompt: fillDk8sSystem(template, {
      context: k8s.context, namespace: k8s.namespace, pods: shown.map(p => p.name),
      archive: useUiStateStore.getState().prefs['ai.dk8s.archive'] !== 'off',
    }),
    targets: shown.map(p => ({
      context: p.context ?? k8s.context ?? '', namespace: p.namespace, pod: p.name,
      containers: p.containers?.map(c => c.name).filter(Boolean),
      workload: p.workload?.name,
    })),
  };
}

interface Dk8sTarget { context: string; namespace: string; pod: string; containers?: string[]; workload?: string }

// ─── Bridge installation ─────────────────────────────────────────────────────

let installed = false;

export function installDaakiaBridges() {
  if (installed) return;
  installed = true;

  // Listen for responses from the extension
  window.addEventListener('message', handleExtensionMessage);
  /* The dk8s progress box follows the search whether or not a stream is open. */
  window.addEventListener('message', (evt: MessageEvent) => {
    const msg = evt.data as Record<string, unknown> | undefined;
    if (msg && typeof msg.type === 'string' && (msg.type.startsWith('ai:dk8sSearch')
        || msg.type === 'ai:complete' || msg.type === 'ai:error' || msg.type === 'ai:cancelled')) {
      useDk8sAiProgress.getState().apply(msg);
    }
    /* Every step an answer takes — commands, searches, the manual — for the steps card. */
    if (msg && typeof msg.type === 'string' && (msg.type.startsWith('ai:dk8sSearch')
        || msg.type.startsWith('ai:kubectlRun') || msg.type === 'ai:docsLookup' || msg.type === 'ai:resolved'
        || msg.type === 'ai:complete' || msg.type === 'ai:error' || msg.type === 'ai:cancelled')) {
      useDk8sAiSteps.getState().apply(msg);
    }
  });

  // Intercept fetch for ConvEngine API calls
  const originalFetch = window.fetch.bind(window);
  (window as unknown as Record<string, unknown>).fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.href
        : (input as Request).url;

    // Only intercept ConvEngine message endpoint
    if (!url.includes(CE_MESSAGE_PATH)) {
      return originalFetch(input, init);
    }

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse((init?.body as string) ?? '{}');
    } catch {
      // malformed body — fall through to original fetch
      return originalFetch(input, init);
    }

    // Resolve stable 'daakia-ai-panel' alias → actual daakia-ai tab UUID
    let tabId = (body.conversationId as string) ?? '';
    if (tabId === 'daakia-ai-panel') {
      const daakiaAiTab = useTabsStore.getState().tabs.find(t => t.type === 'daakia-ai');
      if (daakiaAiTab) tabId = daakiaAiTab.id;
    }
    const message = (body.message as string) ?? '';
    const reset = (body.reset as boolean) ?? false;

    if (!tabId) return originalFetch(input, init);

    // Clear history on new chat
    if (reset) {
      const resetTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
      if (resetTab?.type === 'daakia-ai') {
        useAiConversationStore.getState().clearMessages(tabId);
      } else {
        useTabsStore.getState().updateTab(tabId, { aiConversation: [] });
      }
    }

    return new Promise<Response>((resolve, reject) => {
      const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
      if (!tab) {
        reject(new Error(`Daakia tab not found: ${tabId}`));
        return;
      }

      // Register pending request
      pendingRequests.set(tabId, {
        resolve: (data) => {
          resolve(
            new Response(JSON.stringify(data), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        },
        reject,
        accumulated: '',
        tabId,
        message,
        inThread: tab.type === 'daakia-ai',
      });
      armWatchdog(tabId);

      // Mark tab streaming
      useTabsStore.getState().updateTab(tabId, {
        aiStreaming: true,
        loading: true,
      });

      // Store user message and read conversation history
      const userMsg = {
        id: crypto.randomUUID() as string,
        role: 'user' as const,
        content: message,
        timestamp: Date.now(),
      };
      let currentHistory: import('../store/tabs-store').AiMessage[];
      if (tab.type === 'daakia-ai') {
        // Global persisted conversation store for Daakia AI tab
        /* Each Daakia AI tab its own thread: the history is this tab's, and the question is saved with it. */
        currentHistory = useAiConversationStore.getState().messagesOf(tabId);
        useAiConversationStore.getState().addUserMessage(tabId, userMsg);
        useAiConversationStore.getState().setStreaming(tabId, true);
        useAiChatSessions.getState().save(tabId);
      } else {
        currentHistory = tab.aiConversation ?? [];
        useTabsStore.getState().updateTab(tabId, {
          aiConversation: [...currentHistory, userMsg],
        });
      }

      // Resolve active AI provider from store — fall back to first enabled provider.
      // Never use tab.authType/authData (those are REST request auth, not LLM credentials).
      // Never use tab.url as baseUrl (that's the REST endpoint URL).
      // The extension always injects the real LLM credentials from OS keychain.
      const providerStore = useAiProvidersStore.getState();
      // Use tab's explicit provider if user manually set it, otherwise fall back to store default
      const resolvedProvider = tab.aiProvider || providerStore.defaultProviderId || providerStore.providers.find(p => p.enabled)?.id || 'openai';
      const resolvedModel = tab.aiModel
        || providerStore.defaultModelId
        || providerStore.providers.find(p => p.id === resolvedProvider)?.models.find(m => m.enabled)?.id
        || '';

      // Send through the one AI client, so this call is named and audited like
      // every other. No authType/authData — the extension injects the real LLM
      // credentials from the OS keychain, and baseUrl is resolved there too.
      /* With dk8s on and pods watched, the model is told where it is looking
         and when (and when not) to search — the Prompt Library's
         `dk8s.chat.system`, filled with the context, namespace and pods. */
      const dk8s = dk8sChatContext(tabId);
      sendAiRequest({
        tabId,
        stage: 'ai.chat',
        screen: 'Daakia AI',
        dk8s: !!dk8s,
        dk8sTargets: dk8s?.targets,
        provider: resolvedProvider,
        model: resolvedModel,
        systemPrompts: [...(tab.aiSystemPrompts ?? []), ...(dk8s ? [dk8s.prompt] : [])],
        userPrompt: message,
        conversation: forModel(currentHistory),  // history BEFORE the current message, without what only the screen needs
        tools: tab.aiTools ?? [],
        settings: tab.aiSettings ?? {},
        mcpServerConfigs: tab.mcpServerConfigs ?? [],
        context: { envId: tab.envId },
      });
    });
  };

  // Replace EventSource with Daakia-aware fake
  (window as unknown as Record<string, unknown>).EventSource = DaakiaEventSource;
}
