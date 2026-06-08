/**
 * DaakiaAiPanel — Full-screen Daakia AI chat panel rendered as a dedicated tab.
 *
 * Features:
 * - Colorful hero banner with "Daakia Assistant" branding
 * - Daakia-only system prompt (no off-topic questions)
 * - MdViewer-powered response rendering (markdown, code blocks, tables)
 * - ConvEngineChat fullscreen mode (no URL bar, no request config)
 * - AI Conversation Context (4.5.4): auto-injects current tab state into system prompt
 *
 * E6.71 — Daakia AI dedicated tab
 * E6.72 — Hero banner, Daakia-only persona, MdViewer renderer
 */
import { useCallback, useMemo, useEffect, useState } from 'react';
import { ConvEngineChat } from '@salilvnair/convengine-chat';
import { useTabsStore, DAAKIA_ASSISTANT_SYSTEM_PROMPT, type ResponseData } from '../../store/tabs-store';
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { useEnvStore, GLOBAL_ENV_ID } from '../../store/env-store';
import { GeneralAssistantIcon, SparkleIcon, CloseCircleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { AiPendingActions, parseDaakiaActions, type DaakiaAction } from './AiPendingActions';

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

// ─── Context helpers ──────────────────────────────────────────────────────────

/** Build a system prompt context block from a request tab */
function buildContextBlock(
  method: string,
  url: string,
  response: ResponseData | null,
  envName: string | null,
  envVarCount: number,
): string {
  if (!url) return '';

  const lines: string[] = [
    '## Current API Context (auto-injected)',
    'The user is actively working with this request in their editor:',
    `- Method: ${method}`,
    `- URL: ${url}`,
  ];

  if (response) {
    const statusLine = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
    const timeStr = response.time ? ` (${response.time}ms)` : '';
    lines.push(`- Last Response: ${statusLine}${timeStr}`);
  } else {
    lines.push('- Last Response: None yet');
  }

  if (envName && envName !== 'Global') {
    lines.push(`- Active Environment: ${envName}${envVarCount > 0 ? ` (${envVarCount} variables)` : ''}`);
  }

  lines.push('', 'When the user asks about "this request", "my API", "the response", etc., refer to the context above.');
  return lines.join('\n');
}

/** Compact context indicator shown below the hero banner */
function AiContextBar({
  method,
  url,
  response,
  envName,
  onDismiss,
}: {
  method: string;
  url: string;
  response: ResponseData | null;
  envName: string | null;
  onDismiss: () => void;
}) {
  const statusColor = response
    ? response.status < 300 ? 'var(--color-success)'
    : response.status < 400 ? 'var(--color-warning)'
    : 'var(--color-error)'
    : 'var(--color-text-muted)';

  const truncatedUrl = url.length > 45 ? url.slice(0, 42) + '…' : url;

  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1 text-[10.5px] border-b overflow-hidden"
      style={{
        borderColor: 'var(--color-surface-border)',
        backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 6%, var(--color-panel))',
      }}
    >
      <span className="flex-shrink-0 opacity-60" style={{ color: 'var(--color-protocol-ai)' }}>
        Context:
      </span>
      <span className="font-mono font-bold flex-shrink-0" style={{ color: 'var(--color-protocol-ai)', fontSize: '10px' }}>
        {method}
      </span>
      <span className="truncate flex-1 font-mono" style={{ color: 'var(--color-text-secondary)', fontSize: '10px' }}>
        {truncatedUrl}
      </span>
      {response && (
        <span className="flex-shrink-0 font-semibold" style={{ color: statusColor, fontSize: '10px' }}>
          {response.status}
        </span>
      )}
      {envName && envName !== 'Global' && (
        <span className="flex-shrink-0 px-1.5 py-px rounded text-[9px]" style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 15%, transparent)', color: 'var(--color-protocol-ai)' }}>
          {envName}
        </span>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="flex-shrink-0 cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
        style={{ color: 'var(--color-text-muted)' }}
        title="Dismiss context"
      >
        <CloseCircleIcon size={11} />
      </button>
    </div>
  );
}

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

  // ── AI Conversation Context (4.5.4) ──────────────────────────────────────
  // Find the most recent non-AI tab that has a URL (provides "current context")
  const allTabs = useTabsStore(s => s.tabs);
  const contextTab = useMemo(() => {
    return allTabs
      .filter(t => t.type !== 'daakia-ai' && t.url && t.url.trim().length > 0)
      .slice(-1)[0] ?? null;
  }, [allTabs]);

  const environments = useEnvStore(s => s.environments);
  const activeEnvId = useEnvStore(s => s.activeEnvId);

  // Resolve env for the context tab (fall back to global active env)
  const contextEnv = useMemo(() => {
    const envId = contextTab?.envId ?? activeEnvId;
    if (!envId || envId === GLOBAL_ENV_ID) {
      return environments.find(e => e.isGlobal) ?? null;
    }
    return environments.find(e => e.id === envId) ?? null;
  }, [contextTab, environments, activeEnvId]);

  // Whether context bar is shown (user can dismiss it)
  const [contextDismissed, setContextDismissed] = useState(false);
  const showContextBar = !contextDismissed && !!contextTab?.url;

  // Guard: re-inject system prompts if the tab was loaded from persisted state
  // without them (tabs-store rehydration doesn't re-run openDaakiaAiTab logic).
  // Also inject context block as second system prompt.
  useEffect(() => {
    if (!activeTab || activeTab.type !== 'daakia-ai') return;

    const basePrompt = DAAKIA_ASSISTANT_SYSTEM_PROMPT;
    const contextBlock = showContextBar && contextTab
      ? buildContextBlock(
          contextTab.method,
          contextTab.url,
          contextTab.response,
          contextEnv?.name ?? null,
          contextEnv?.variables?.length ?? 0,
        )
      : '';

    const newPrompts = contextBlock
      ? [basePrompt, contextBlock]
      : [basePrompt];

    const currentPrompts = activeTab.aiSystemPrompts ?? [];
    const needsUpdate =
      currentPrompts.length !== newPrompts.length ||
      currentPrompts[0] !== newPrompts[0] ||
      currentPrompts[1] !== newPrompts[1];

    if (needsUpdate) {
      updateTab(activeTab.id, { aiSystemPrompts: newPrompts });
    }
  }, [activeTab?.id, showContextBar, contextTab?.url, contextTab?.response?.status, contextEnv?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI Suggestion Chips (4.5.5) ──────────────────────────────────────────
  const [showChips, setShowChips] = useState(false);

  // ── AI Actions from Chat (4.5.6) ─────────────────────────────────────────
  const [pendingActions, setPendingActions] = useState<DaakiaAction[]>([]);

  const handleMessage = useCallback((_text: string) => {
    // Hide chips + clear pending actions while waiting for next AI response
    setShowChips(false);
    setPendingActions([]);
  }, []);

  const handleResponse = useCallback((text: string) => {
    // Parse action commands embedded in the AI response
    const actions = parseDaakiaActions(text);
    if (actions.length > 0) {
      setPendingActions(actions);
    }
    // Show action chips after each AI response
    setShowChips(true);
  }, []);

  const handleDismissAction = useCallback((index: number) => {
    setPendingActions(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleDismissAllActions = useCallback(() => {
    setPendingActions([]);
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

  // Quick-action chips shown after each AI response
  const handleChipAction = useCallback((action: string) => {
    setShowChips(false);
    if (!contextTab) return;
    switch (action) {
      case 'run':
        postMsg({
          type: 'executeRequest',
          tabId: contextTab.id,
          method: contextTab.method,
          url: contextTab.url,
          headers: contextTab.headers,
          bodyMode: contextTab.bodyMode,
          bodyRaw: contextTab.bodyRaw,
          bodyFormData: contextTab.bodyFormData,
          bodyUrlEncoded: contextTab.bodyUrlEncoded,
          authType: contextTab.authType,
          authData: contextTab.authData,
          envId: contextTab.envId,
          protocol: contextTab.protocol,
        });
        break;
      case 'save':
        postMsg({ type: 'openSaveAs', tabId: contextTab.id });
        break;
      case 'copy-url':
        navigator.clipboard.writeText(contextTab.url).catch(() => {});
        break;
      case 'switch-tab':
        useTabsStore.getState().setActiveTab(contextTab.id);
        break;
    }
  }, [contextTab]);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ minHeight: 0 }}>
      {/* Colorful hero banner */}
      <DaakiaAiHero />

      {/* Context bar — shows current tab context when a non-AI tab is active */}
      {showContextBar && contextTab && (
        <AiContextBar
          method={contextTab.method}
          url={contextTab.url}
          response={contextTab.response}
          envName={contextEnv?.name ?? null}
          onDismiss={() => setContextDismissed(true)}
        />
      )}

      {/* Pending AI actions — applied directly to the context tab or environment */}
      {pendingActions.length > 0 && (
        <AiPendingActions
          actions={pendingActions}
          contextTab={contextTab}
          onDismiss={handleDismissAction}
          onDismissAll={handleDismissAllActions}
        />
      )}

      {/* Full-screen chat — fills remaining height */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <ConvEngineChat
          mode="fullscreen"
          config={chatConfig}
          theme={chatTheme}
        />

        {/* Suggestion chips — float above the composer after each response */}
        {showChips && (
          <div
            className="absolute bottom-[72px] left-0 right-0 flex items-center gap-1.5 px-3 py-1.5 flex-wrap pointer-events-none"
            style={{ zIndex: 10 }}
          >
            {contextTab?.url && (
              <>
                <button
                  type="button"
                  onClick={() => handleChipAction('run')}
                  className="pointer-events-auto h-[24px] px-2.5 text-[10.5px] font-medium rounded-full border cursor-pointer hover:opacity-90 transition-opacity whitespace-nowrap"
                  style={{ borderColor: 'var(--color-protocol-ai)', color: 'var(--color-protocol-ai)', backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 10%, var(--color-panel))' }}
                >
                  ▶ Run request
                </button>
                <button
                  type="button"
                  onClick={() => handleChipAction('save')}
                  className="pointer-events-auto h-[24px] px-2.5 text-[10.5px] font-medium rounded-full border cursor-pointer hover:opacity-90 transition-opacity whitespace-nowrap"
                  style={{ borderColor: 'var(--color-protocol-ai)', color: 'var(--color-protocol-ai)', backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 10%, var(--color-panel))' }}
                >
                  💾 Save to collection
                </button>
                <button
                  type="button"
                  onClick={() => handleChipAction('copy-url')}
                  className="pointer-events-auto h-[24px] px-2.5 text-[10.5px] font-medium rounded-full border cursor-pointer hover:opacity-90 transition-opacity whitespace-nowrap"
                  style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-panel)' }}
                >
                  📋 Copy URL
                </button>
                <button
                  type="button"
                  onClick={() => handleChipAction('switch-tab')}
                  className="pointer-events-auto h-[24px] px-2.5 text-[10.5px] font-medium rounded-full border cursor-pointer hover:opacity-90 transition-opacity whitespace-nowrap"
                  style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-panel)' }}
                >
                  🔍 Switch to tab
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setShowChips(false)}
              className="pointer-events-auto h-[24px] w-[24px] flex items-center justify-center rounded-full border cursor-pointer hover:opacity-70 transition-opacity ml-auto"
              style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-panel)' }}
              title="Dismiss"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
