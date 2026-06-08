/**
 * DaakiaAiPanel — Full-screen Daakia AI chat panel rendered as a dedicated tab.
 *
 * Features:
 * - Colorful hero banner with "Daakia Assistant" branding
 * - Daakia-only system prompt (no off-topic questions)
 * - MdViewer-powered response rendering (markdown, code blocks, tables)
 * - ConvEngineChat fullscreen mode (no URL bar, no request config)
 *
 * E6.71 — Daakia AI dedicated tab
 * E6.72 — Hero banner, Daakia-only persona, MdViewer renderer
 */
import { useCallback, useMemo, useEffect } from 'react';
import { ConvEngineChat } from '@salilvnair/convengine-chat';
import { useTabsStore, DAAKIA_ASSISTANT_SYSTEM_PROMPT } from '../../store/tabs-store';
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { GeneralAssistantIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';

// ─── Suggestion chips ─────────────────────────────────────────────────────────

const SUGGESTION_CHIPS = [
  { chipText: '📡 Build a request',   chatText: '/request GET all users from https://jsonplaceholder.typicode.com/users' },
  { chipText: '🔧 Create a mock',     chatText: '/mock Create a mock POST /api/users that returns a created user' },
  { chipText: '🧪 Generate tests',    chatText: '/test Write assertions for a 200 response with a users array' },
  { chipText: '🔄 Convert to cURL',   chatText: '/curl curl -X POST https://api.example.com/data -H "Content-Type: application/json" -d \'{"name":"test"}\'' },
  { chipText: '🔐 GraphQL query',     chatText: '/graphql Write a GraphQL query to get all users with their id, name, and email' },
  { chipText: '📄 SOAP envelope',     chatText: '/soap Generate a SOAP 1.1 envelope for a GetUserById operation with userId parameter' },
  { chipText: '🛡️ Security scan',    chatText: '/security Scan this request for security issues: GET http://api.example.com/users?apiKey=sk-abc123' },
  { chipText: '📋 Document endpoint', chatText: '/docs Document the POST /api/users endpoint that creates a new user with name and email' },
];

// ─── MdViewer renderer provider ───────────────────────────────────────────────

/**
 * Custom ConvEngineChat renderer that uses Daakia's MdViewer component.
 * This replaces the default <pre>-based plain-text renderer with rich markdown:
 * headings, code blocks with syntax highlighting and copy buttons, tables,
 * blockquotes, bold/italic, and lists.
 */
/**
 * Renderer component — receives the parsed payload from ConvEngineChat.
 * The bridge always wraps AI text as { type: "text", rawText: "..." } JSON so
 * ConvEngineChat's tryParseJsonObject sets payload = { type, rawText }.
 * We read payload.rawText here, mirroring the DMCR Copilot renderer pattern.
 */
function DaakiaMdRendererComponent({ payload }: { payload: unknown }) {
  const text = (payload as { rawText?: string } | null)?.rawText ?? '';
  // Wrap in compact class to reduce paragraph/heading spacing in chat bubble context
  return (
    <div className="daakia-chat-md">
      <MdViewer content={text} />
    </div>
  );
}

const DAAKIA_RENDERER_PROVIDERS = [
  {
    key: 'daakia-md',
    priority: 150,          // beats the built-in DefaultRenderer (priority 0)
    // Only match our { type: "text", rawText } envelope — let DefaultRenderer
    // handle any other structured payloads (e.g. errors, verbose blocks).
    match: ({ effectiveType, payload }: { effectiveType: string; payload: unknown }) =>
      effectiveType === 'text' && typeof (payload as { rawText?: string } | null)?.rawText === 'string',
    Component: DaakiaMdRendererComponent,
    hideBubble: false,
  },
];

// ─── Hero banner ──────────────────────────────────────────────────────────────

function DaakiaAiHero() {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b"
      style={{
        borderColor: 'var(--color-surface-border)',
        background: `linear-gradient(135deg,
          color-mix(in srgb, var(--color-protocol-ai) 18%, var(--color-panel)) 0%,
          color-mix(in srgb, var(--color-protocol-ai) 6%, var(--color-panel)) 60%,
          var(--color-panel) 100%)`,
      }}
    >
      {/* Left: icon + title + tagline */}
      <div className="flex items-center gap-3">
        {/* Glow badge */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'var(--color-protocol-ai)',
            boxShadow: '0 0 18px color-mix(in srgb, var(--color-protocol-ai) 50%, transparent)',
          }}
        >
          <GeneralAssistantIcon size={18} className="text-white" />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold leading-tight" style={{ color: 'var(--color-text-primary)' }}>
              Daakia Assistant
            </h2>
            <span
              className="text-[9px] font-medium px-1.5 py-px rounded-full leading-none"
              style={{
                background: 'color-mix(in srgb, var(--color-protocol-ai) 20%, transparent)',
                color: 'var(--color-protocol-ai)',
                border: '1px solid color-mix(in srgb, var(--color-protocol-ai) 35%, transparent)',
              }}
            >
              AI
            </span>
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            REST · GraphQL · SOAP · gRPC · Mock · cURL · Test Scripts
          </p>
        </div>
      </div>

      {/* Right: sparkle accent */}
      <div className="flex items-center gap-1 opacity-40">
        <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)' }} />
        <SparkleIcon size={8} style={{ color: 'var(--color-protocol-ai)' }} />
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

/**
 * DaakiaAiPanel — standalone AI assistant tab, no request-config chrome.
 * The DaakiaVsCodeBridge (installed in App.tsx) intercepts all ConvEngine
 * HTTP/SSE calls and routes them through the Daakia extension protocol.
 *
 * System prompt is injected via tab.aiSystemPrompts (set in openDaakiaAiTab).
 * If the tab somehow lost its prompts (e.g. persisted state), we re-inject here.
 */
export function DaakiaAiPanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const defaultProviderId = useAiProvidersStore(s => s.defaultProviderId);
  const defaultModelId = useAiProvidersStore(s => s.defaultModelId);

  // Guard: re-inject system prompts if the tab was loaded from persisted state
  // without them (tabs-store rehydration doesn't re-run openDaakiaAiTab logic).
  useEffect(() => {
    if (!activeTab || activeTab.type !== 'daakia-ai') return;
    const hasPrompt = (activeTab.aiSystemPrompts ?? []).some(
      p => p.includes('Daakia Assistant'),
    );
    if (!hasPrompt) {
      updateTab(activeTab.id, { aiSystemPrompts: [DAAKIA_ASSISTANT_SYSTEM_PROMPT] });
    }
  }, [activeTab?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMessage = useCallback((_text: string) => {
    // handled by the bridge
  }, []);

  const handleResponse = useCallback((_text: string) => {
    // handled by the bridge
  }, []);

  // Use a stable conversationId so closing/reopening the Daakia AI tab preserves the
  // conversation. Only the "New Chat" button (showNewChat: true) should reset it.
  // Using per-tab IDs was wrong: each tab open created a fresh session.
  const conversationId = 'daakia-ai-panel';

  const chatConfig = useMemo(() => ({
    apiHost: '',
    conversationId,
    title: '',
    subtitle: '',
    placeholder: 'Ask anything about APIs, REST, GraphQL, mocks, cURL, tests…',
    showFeedback: false,
    showAudit: false,
    showNewChat: true,
    showLayoutPicker: false,
    showMaximize: false,
    showMinimize: false,
    showEngineStatus: false,
    showHeaderDot: false,
    defaultDark: true,
    composerShape: 'round' as const,
    landingChips: SUGGESTION_CHIPS,
    stream: { enabled: true, transport: 'sse' as const },
    renderers: DAAKIA_RENDERER_PROVIDERS,
    onMessage: handleMessage,
    onResponse: handleResponse,
  }), [conversationId, handleMessage, handleResponse]);

  const chatTheme = useMemo(() => ({
    'color-accent': 'var(--color-protocol-ai)',
    'bg-panel': 'var(--color-panel)',
    'bg-header': 'transparent',       // hide CE's own header — we have our own hero
    'border-color': 'var(--color-surface-border)',
    'shadow-panel': 'none',
    'bg-composer': 'var(--color-panel)',
    'bg-composer-surface': 'transparent',
    'text-primary': 'var(--color-text-primary)',
    'text-secondary': 'var(--color-text-muted)',
    'text-placeholder': 'var(--color-text-muted)',
    'bg-bubble-agent': 'color-mix(in srgb, var(--color-surface-border) 60%, var(--color-panel))',
    'text-bubble-agent': 'var(--color-text-primary)',
  }), []);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ minHeight: 0 }}>
      {/* Colorful hero banner */}
      <DaakiaAiHero />

      {/* Full-screen chat — fills remaining height */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ConvEngineChat
          mode="fullscreen"
          config={chatConfig}
          theme={chatTheme}
        />
      </div>
    </div>
  );
}
