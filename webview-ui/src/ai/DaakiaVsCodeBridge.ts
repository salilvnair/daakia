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
    // Accumulate streaming tokens for the final response
    const text = msg.text as string ?? '';
    if (text) pending.accumulated += text;
  }

  if (msg.type === 'ai:complete') {
    pendingRequests.delete(tabId);

    // Use accumulated streaming text if available, otherwise use message.content
    const msgObj = msg.message as Record<string, unknown> | undefined;
    const content = pending.accumulated || (msgObj?.content as string) || '';

    // Store assistant response in tab history for next request context
    const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
    if (tab) {
      const lastMsg = (tab.aiConversation ?? []).at(-1);
      const assistantMsg = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content,
        timestamp: Date.now(),
      };
      useTabsStore.getState().updateTab(tabId, {
        aiConversation: [...(tab.aiConversation ?? []), assistantMsg],
        aiStreaming: false,
        loading: false,
      });
    }

    pending.resolve({ payload: { value: content } });
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
      useTabsStore.getState().updateTab(tabId, { aiConversation: [] });
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

      // Store user message in history
      const userMsg = {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: message,
        timestamp: Date.now(),
      };
      const currentHistory = tab.aiConversation ?? [];
      useTabsStore.getState().updateTab(tabId, {
        aiConversation: [...currentHistory, userMsg],
      });

      // Send to extension via Daakia protocol
      getVsCodeApi().postMessage({
        type: 'ai:send',
        tabId,
        provider: tab.aiProvider ?? 'openai',
        model: tab.aiModel ?? '',
        baseUrl: tab.url ?? '',
        systemPrompts: tab.aiSystemPrompts ?? [],
        userPrompt: message,
        conversation: currentHistory,  // history BEFORE the current message
        tools: tab.aiTools ?? [],
        settings: tab.aiSettings ?? {},
        mcpServerConfigs: tab.mcpServerConfigs ?? [],
        authType: tab.authType,
        authData: tab.authData,
        envId: tab.envId,
      });
    });
  };

  // Replace EventSource with Daakia-aware fake
  (window as unknown as Record<string, unknown>).EventSource = DaakiaEventSource;
}
