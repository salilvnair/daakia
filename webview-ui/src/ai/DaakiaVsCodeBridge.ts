/**
 * DaakiaVsCodeBridge — bridges ConvEngineChat's HTTP/SSE transport
 * to Daakia's VS Code postMessage protocol.
 *
 * ConvEngineChat expects:
 *   POST /api/v1/conversation/message → JSON response { payload: { value: string } }
 *   EventSource /api/v1/conversation/stream/{conversationId} → SSE events
 *
 * Daakia uses:
 *   postMessage({ type: 'ai:send', tabId, ... }) → sends request to extension
 *   window.message({ type: 'ai:chunk', tabId, text }) → streaming token
 *   window.message({ type: 'ai:complete', tabId, message }) → final response
 *   window.message({ type: 'ai:error', tabId, message }) → error
 *
 * The bridge intercepts fetch and EventSource globally, routing ConvEngine calls
 * through the Daakia protocol. The conversationId in ConvEngine = tabId in Daakia.
 */

import { getVsCodeApi } from '../vscode';
import { useTabsStore } from '../store/tabs-store';
import { useAiProvidersStore } from '../store/ai-providers-store';
import { useAiConversationStore } from '../store/ai-conversation-store';

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
    const tabId = url.split('/').pop() ?? '';

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

// ─── Pending request registry ────────────────────────────────────────────────

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  accumulated: string;
  tabId: string;
}

const pendingRequests = new Map<string, PendingRequest>();

// ─── Global message listener ─────────────────────────────────────────────────

function handleExtensionMessage(evt: MessageEvent) {
  const msg = evt.data as Record<string, unknown>;
  if (!msg || typeof msg !== 'object') return;

  const tabId = msg.tabId as string;
  if (!tabId) return;

  const pending = pendingRequests.get(tabId);
  if (!pending) return;

  if (msg.type === 'ai:chunk') {
    // Accumulate streaming tokens — executor sends 'delta', bridge also accepts 'text' as fallback
    const text = (msg.delta as string) || (msg.text as string) || '';
    if (text) pending.accumulated += text;
  }

  if (msg.type === 'ai:complete') {
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
    const wrapped = JSON.stringify({ type: 'text', rawText: content });
    pending.resolve({ payload: { value: wrapped } });
  }

  if (msg.type === 'ai:error') {
    pendingRequests.delete(tabId);
    useTabsStore.getState().updateTab(tabId, { aiStreaming: false, loading: false });
    const errorMsg = msg.message as string ?? 'AI request failed';
    pending.reject(new Error(errorMsg));
  }
}

// ─── Bridge installation ─────────────────────────────────────────────────────

let installed = false;

export function installDaakiaBridges() {
  if (installed) return;
  installed = true;

  // Listen for responses from the extension
  window.addEventListener('message', handleExtensionMessage);

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

    const tabId = (body.conversationId as string) ?? '';
    const message = (body.message as string) ?? '';
    const reset = (body.reset as boolean) ?? false;

    if (!tabId) return originalFetch(input, init);

    // Clear history on new chat
    if (reset) {
      const resetTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
      if (resetTab?.type === 'daakia-ai') {
        useAiConversationStore.getState().clearMessages();
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
      });

      // Mark tab streaming
      useTabsStore.getState().updateTab(tabId, {
        aiStreaming: true,
        loading: true,
      });

      // Store user message and read conversation history
      const userMsg = {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: message,
        timestamp: Date.now(),
      };
      let currentHistory: typeof userMsg[];
      if (tab.type === 'daakia-ai') {
        // Global persisted conversation store for Daakia AI tab
        currentHistory = useAiConversationStore.getState().messages as typeof userMsg[];
        useAiConversationStore.getState().addUserMessage(userMsg);
        useAiConversationStore.getState().setStreaming(true);
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

      // Send to extension via Daakia protocol
      getVsCodeApi().postMessage({
        type: 'ai:send',
        tabId,
        provider: resolvedProvider,
        model: resolvedModel,
        baseUrl: '',           // extension resolves base URL from provider registry + user settings
        systemPrompts: tab.aiSystemPrompts ?? [],
        userPrompt: message,
        conversation: currentHistory,  // history BEFORE the current message
        tools: tab.aiTools ?? [],
        settings: tab.aiSettings ?? {},
        mcpServerConfigs: tab.mcpServerConfigs ?? [],
        // NO authType / authData — extension injects from OS keychain
        envId: tab.envId,
      });
    });
  };

  // Replace EventSource with Daakia-aware fake
  (window as unknown as Record<string, unknown>).EventSource = DaakiaEventSource;
}
