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
import { GeneralAssistantIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { AiPendingActions, parseDaakiaActions, type DaakiaAction } from './AiPendingActions';
import { AiConversationToCollectionModal } from './AiConversationToCollectionModal';
import { AiSessionExportModal } from './AiSessionExportModal';
import { AiOpenApiGeneratorModal } from './AiOpenApiGeneratorModal';
import { AiSecurityAuditModal } from './AiSecurityAuditModal';
import { AiPostmanTranslatorModal } from './AiPostmanTranslatorModal';
import { AiWebhookDebuggerModal } from './AiWebhookDebuggerModal';
import { AiRequestClusteringModal } from './AiRequestClusteringModal';
import { AiCrossProtocolOrchestratorModal } from './AiCrossProtocolOrchestratorModal';
import { AiChaosEngineeringModal } from './AiChaosEngineeringModal';
import { AiContractNegotiatorModal } from './AiContractNegotiatorModal';
import { AiLiveTrafficMirrorModal } from './AiLiveTrafficMirrorModal';
import { useAiFeaturesStore } from '../../store/ai-features-store';
import { useAiPromptTemplatesStore, AI_PROMPT_TEMPLATE_LABELS, type AiPromptTemplateKey } from '../../store/prompt-template';

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

/** Build a system prompt context block — protocol-aware */
function buildContextBlock(
  tab: { protocol: string; method: string; url: string; grpcMethod?: string; soapOperation?: string; soapService?: string; response: ResponseData | null },
  envName: string | null,
  envVarCount: number,
): string {
  if (!tab.url) return '';
  const { protocol, url, method } = tab;
  const proto = (protocol || 'rest').toLowerCase();

  const lines: string[] = [
    '## Current API Context (auto-injected)',
    'The user is actively working with this request in their editor:',
    `- Protocol: ${proto.toUpperCase()}`,
  ];

  if (proto === 'rest' || proto === 'soap') {
    lines.push(`- Method: ${method}`);
  }
  if (proto === 'grpc') {
    lines.push(`- Server: ${url}`);
    if (tab.grpcMethod) lines.push(`- RPC Method: ${tab.grpcMethod}`);
    else lines.push(`- Endpoint: ${url}`);
  } else if (proto === 'soap') {
    lines.push(`- Endpoint: ${url}`);
    if (tab.soapOperation) lines.push(`- Operation: ${tab.soapOperation}`);
    if (tab.soapService) lines.push(`- Service: ${tab.soapService}`);
  } else if (proto === 'graphql') {
    lines.push(`- Endpoint: ${url}`);
  } else if (proto === 'websocket' || proto === 'ws') {
    lines.push(`- WebSocket URL: ${url}`);
  } else if (proto === 'sse') {
    lines.push(`- SSE URL: ${url}`);
  } else if (proto === 'mqtt') {
    lines.push(`- Broker URL: ${url}`);
  } else if (proto === 'socketio') {
    lines.push(`- Socket.IO URL: ${url}`);
  } else {
    lines.push(`- URL: ${url}`);
  }

  if (tab.response) {
    const statusLine = `${tab.response.status}${tab.response.statusText ? ` ${tab.response.statusText}` : ''}`;
    const timeStr = tab.response.time ? ` (${tab.response.time}ms)` : '';
    lines.push(`- Last Response: ${statusLine}${timeStr}`);
  } else {
    lines.push('- Last Response: None yet');
  }

  if (envName && envName !== 'Global') {
    lines.push(`- Active Environment: ${envName}${envVarCount > 0 ? ` (${envVarCount} variables)` : ''}`);
  }

  lines.push('', 'When the user asks about "this request", "my API", "the endpoint", "the response", etc., refer to the context above.');
  return lines.join('\n');
}

/** Compact context indicator shown below the hero banner — protocol-aware */
function AiContextBar({
  tab,
  envName,
  tabId,
}: {
  tab: { protocol: string; method: string; url: string; grpcMethod?: string; soapOperation?: string; response: ResponseData | null };
  envName: string | null;
  tabId: string;
}) {
  const setActiveTab = useTabsStore(s => s.setActiveTab);
  const { protocol, method, url, grpcMethod, soapOperation, response } = tab;
  const proto = (protocol || 'rest').toLowerCase();

  const statusColor = response
    ? response.status < 300 ? 'var(--color-success)'
    : response.status < 400 ? 'var(--color-warning)'
    : 'var(--color-error)'
    : 'var(--color-text-muted)';

  const truncatedUrl = url.length > 38 ? url.slice(0, 35) + '…' : url;

  const protoBadge = proto === 'rest' ? method
    : proto === 'graphql' ? 'GQL'
    : proto === 'grpc' ? 'gRPC'
    : proto === 'soap' ? 'SOAP'
    : proto === 'websocket' || proto === 'ws' ? 'WS'
    : proto === 'sse' ? 'SSE'
    : proto === 'mqtt' ? 'MQTT'
    : proto === 'socketio' ? 'SIO'
    : proto.toUpperCase();

  const detail = proto === 'grpc' && grpcMethod
    ? grpcMethod.split('/').pop() ?? grpcMethod
    : proto === 'soap' && soapOperation
    ? soapOperation
    : null;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 border-b overflow-hidden flex-shrink-0"
      style={{
        borderColor: 'var(--color-surface-border)',
        backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 5%, var(--color-panel))',
      }}
    >
      {/* Context label */}
      <span className="flex-shrink-0 text-[9.5px] font-semibold uppercase tracking-wider opacity-50" style={{ color: 'var(--color-protocol-ai)' }}>
        Context
      </span>

      {/* Protocol badge + URL + optional detail */}
      <span className="font-mono font-bold flex-shrink-0 text-[10px]" style={{ color: 'var(--color-protocol-ai)' }}>
        {protoBadge}
      </span>
      <span className="truncate flex-1 font-mono text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
        {truncatedUrl}
      </span>
      {detail && (
        <span className="flex-shrink-0 text-[9px] px-1.5 py-px rounded font-mono" style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 10%, transparent)', color: 'var(--color-protocol-ai)' }}>
          {detail}
        </span>
      )}
      {response && (
        <span className="flex-shrink-0 font-semibold text-[10px] px-1.5 py-0.5 rounded" style={{ color: statusColor, backgroundColor: `color-mix(in srgb, ${statusColor} 12%, transparent)` }}>
          {response.status}
        </span>
      )}
      {envName && envName !== 'Global' && (
        <span className="flex-shrink-0 px-1.5 py-px rounded text-[9px]" style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 12%, transparent)', color: 'var(--color-protocol-ai)' }}>
          {envName}
        </span>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab(tabId)}
          title="Switch to this request tab"
          className="h-[18px] px-1.5 text-[9.5px] font-medium rounded cursor-pointer transition-all hover:opacity-80 border"
          style={{ color: 'var(--color-protocol-ai)', borderColor: 'color-mix(in srgb, var(--color-protocol-ai) 30%, transparent)', backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)' }}
        >
          → Tab
        </button>
        <button
          type="button"
          onClick={() => postMsg({ type: 'openSaveAs', tabId })}
          title="Save this request to a collection"
          className="h-[18px] px-1.5 text-[9.5px] font-medium rounded cursor-pointer transition-all hover:opacity-80 border"
          style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-surface-border)', backgroundColor: 'transparent' }}
        >
          💾 Save
        </button>
      </div>
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
  // Use the tab that was active when "Ask AI" was clicked (previousTabId),
  // NOT "last tab with a URL" which picks the wrong protocol when multiple tabs are open.
  const allTabs = useTabsStore(s => s.tabs);
  const previousTabId = useTabsStore(s => s.previousTabId);
  const contextTab = useMemo(() => {
    // Prefer the tab the user explicitly came from — no URL requirement.
    // A gRPC/SOAP/GQL tab with no URL yet should still be the context tab.
    // showContextBar and buildContextBlock handle the empty-URL case downstream.
    const prev = previousTabId ? allTabs.find(t => t.id === previousTabId) : null;
    if (prev && prev.type !== 'daakia-ai') return prev;
    // Fallback: last non-AI tab with a URL (when previousTabId is stale/missing)
    return allTabs.filter(t => t.type !== 'daakia-ai' && t.url?.trim()).at(-1) ?? null;
  }, [allTabs, previousTabId]);

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

  // Context bar is shown whenever there's a valid non-AI tab with a URL
  const showContextBar = !!contextTab?.url;

  // Guard: re-inject system prompts if the tab was loaded from persisted state
  // without them (tabs-store rehydration doesn't re-run openDaakiaAiTab logic).
  // Also inject context block as second system prompt.
  useEffect(() => {
    if (!activeTab || activeTab.type !== 'daakia-ai') return;

    const basePrompt = DAAKIA_ASSISTANT_SYSTEM_PROMPT;
    const contextBlock = showContextBar && contextTab
      ? buildContextBlock(
          contextTab,
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

  // ── Sprint 10.7-10.9 panel actions ───────────────────────────────────────
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPromptPicker, setShowPromptPicker] = useState(false);
  const templates = useAiPromptTemplatesStore(s => s.templates);
  // ── Sprint 10.10-10.17 platform tools ────────────────────────────────────
  const [showOpenApiModal, setShowOpenApiModal] = useState(false);
  const [showSecurityAudit, setShowSecurityAudit] = useState(false);
  const [showPostmanTranslator, setShowPostmanTranslator] = useState(false);
  const [showWebhookDebugger, setShowWebhookDebugger] = useState(false);
  const [showRequestClustering, setShowRequestClustering] = useState(false);
  // ── Sprint 14 platform tools ──────────────────────────────────────────────
  const [showCrossProtocol, setShowCrossProtocol] = useState(false);
  const [showChaosEngineering, setShowChaosEngineering] = useState(false);
  const [showContractNegotiator, setShowContractNegotiator] = useState(false);
  const [showLiveTrafficMirror, setShowLiveTrafficMirror] = useState(false);
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);

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

      {/* 10.7-10.9: AI Panel action bar */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 3%, var(--color-panel))' }}>
        <button type="button" onClick={() => setShowCollectionModal(true)}
          className="flex items-center gap-1 h-[22px] px-2.5 rounded-full text-[10px] font-medium cursor-pointer transition-all border"
          style={{ color: 'var(--color-protocol-ai)', borderColor: 'color-mix(in srgb, var(--color-protocol-ai) 30%, transparent)', backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)' }}
          title="Convert AI conversation to collection"
        >
          <SparkleIcon size={8} />→ Collection
        </button>
        <button type="button" onClick={() => setShowExportModal(true)}
          className="flex items-center gap-1 h-[22px] px-2.5 rounded-full text-[10px] font-medium cursor-pointer transition-all border"
          style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-surface-border)', backgroundColor: 'transparent' }}
          title="Export session as markdown"
        >
          Export ✦
        </button>
        <button type="button" onClick={() => setShowPromptPicker(p => !p)}
          className="flex items-center gap-1 h-[22px] px-2.5 rounded-full text-[10px] font-medium cursor-pointer transition-all border"
          style={{ color: showPromptPicker ? 'var(--color-protocol-ai)' : 'var(--color-text-muted)', borderColor: showPromptPicker ? 'color-mix(in srgb, var(--color-protocol-ai) 30%, transparent)' : 'var(--color-surface-border)', backgroundColor: showPromptPicker ? 'color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)' : 'transparent' }}
          title="@ Prompt Library quick-insert"
        >
          @ Prompts
        </button>
        <div className="w-px h-4 mx-0.5 flex-shrink-0" style={{ backgroundColor: 'var(--color-surface-border)' }} />
        {/* 10.10-10.17: Platform tools */}
        {aiEnabled('openApiGenerator') && (
          <button type="button" onClick={() => setShowOpenApiModal(true)}
            className="flex items-center gap-1 h-[22px] px-2.5 rounded-full text-[10px] font-medium cursor-pointer transition-all border"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-surface-border)', backgroundColor: 'transparent' }}
            title="Generate OpenAPI 3.1 spec from collection"
          >OpenAPI ✦</button>
        )}
        {aiEnabled('securityAudit') && (
          <button type="button" onClick={() => setShowSecurityAudit(true)}
            className="flex items-center gap-1 h-[22px] px-2.5 rounded-full text-[10px] font-medium cursor-pointer transition-all border"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-surface-border)', backgroundColor: 'transparent' }}
            title="AI Security Audit all tabs"
          >Security ✦</button>
        )}
        {aiEnabled('postmanTranslator') && (
          <button type="button" onClick={() => setShowPostmanTranslator(true)}
            className="flex items-center gap-1 h-[22px] px-2.5 rounded-full text-[10px] font-medium cursor-pointer transition-all border"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-surface-border)', backgroundColor: 'transparent' }}
            title="Translate Postman pm.* to Daakia dk.*"
          >pm→dk ✦</button>
        )}
        {aiEnabled('webhookDebugger') && (
          <button type="button" onClick={() => setShowWebhookDebugger(true)}
            className="flex items-center gap-1 h-[22px] px-2.5 rounded-full text-[10px] font-medium cursor-pointer transition-all border"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-surface-border)', backgroundColor: 'transparent' }}
            title="AI Webhook Debugger"
          >Webhook ✦</button>
        )}
        {aiEnabled('requestClustering') && (
          <button type="button" onClick={() => setShowRequestClustering(true)}
            className="flex items-center gap-1 h-[22px] px-2.5 rounded-full text-[10px] font-medium cursor-pointer transition-all border"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-surface-border)', backgroundColor: 'transparent' }}
            title="AI Request Clustering — auto-organize into collections"
          >Cluster ✦</button>
        )}
        {(aiEnabled('crossProtocolOrchestrator') || aiEnabled('chaosEngineeringPlanner') || aiEnabled('contractNegotiator') || aiEnabled('liveTrafficMirror')) && (
          <div className="w-px h-4 mx-0.5 flex-shrink-0" style={{ backgroundColor: 'var(--color-surface-border)' }} />
        )}
        {aiEnabled('crossProtocolOrchestrator') && (
          <button type="button" onClick={() => setShowCrossProtocol(true)}
            className="flex items-center gap-1 h-[22px] px-2.5 rounded-full text-[10px] font-medium cursor-pointer transition-all border"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-surface-border)', backgroundColor: 'transparent' }}
            title="Cross-Protocol Orchestrator — multi-protocol journey planner"
          >Orchestrate ✦</button>
        )}
        {aiEnabled('chaosEngineeringPlanner') && (
          <button type="button" onClick={() => setShowChaosEngineering(true)}
            className="flex items-center gap-1 h-[22px] px-2.5 rounded-full text-[10px] font-medium cursor-pointer transition-all border"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-surface-border)', backgroundColor: 'transparent' }}
            title="Chaos Engineering Planner — failure scenario designer"
          >Chaos ✦</button>
        )}
        {aiEnabled('contractNegotiator') && (
          <button type="button" onClick={() => setShowContractNegotiator(true)}
            className="flex items-center gap-1 h-[22px] px-2.5 rounded-full text-[10px] font-medium cursor-pointer transition-all border"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-surface-border)', backgroundColor: 'transparent' }}
            title="Contract Negotiator — resolve API contract conflicts between teams"
          >Contracts ✦</button>
        )}
        {aiEnabled('liveTrafficMirror') && (
          <button type="button" onClick={() => setShowLiveTrafficMirror(true)}
            className="flex items-center gap-1 h-[22px] px-2.5 rounded-full text-[10px] font-medium cursor-pointer transition-all border"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-surface-border)', backgroundColor: 'transparent' }}
            title="Live Traffic Mirror — proxy & AI analysis across all protocols"
          >Traffic ✦</button>
        )}
      </div>

      {/* 10.9: Prompt Library quick-picker */}
      {showPromptPicker && (
        <div className="flex-shrink-0 border-b max-h-[160px] overflow-y-auto [scrollbar-gutter:stable]" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
          <div className="px-3 pt-1.5 pb-0.5">
            <p className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Prompt Library · click to insert</p>
          </div>
          <div className="flex flex-wrap gap-1.5 px-3 py-1.5">
            {(Object.keys(templates) as AiPromptTemplateKey[]).slice(0, 20).map(key => (
              <button key={key} type="button"
                onClick={() => {
                  const text = templates[key];
                  if (text && navigator.clipboard) navigator.clipboard.writeText(text);
                  setShowPromptPicker(false);
                }}
                className="h-[22px] px-2 text-[10px] rounded-full border cursor-pointer transition-all whitespace-nowrap"
                style={{ color: 'var(--color-text-secondary)', borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-raised)' }}
                title={AI_PROMPT_TEMPLATE_LABELS[key]?.description || key}
              >
                {AI_PROMPT_TEMPLATE_LABELS[key]?.label || key}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Context bar — shows current tab context */}
      {showContextBar && contextTab && (
        <AiContextBar
          tab={contextTab}
          envName={contextEnv?.name ?? null}
          tabId={contextTab.id}
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

      {/* 10.7: Save conversation to collection */}
      {showCollectionModal && <AiConversationToCollectionModal onClose={() => setShowCollectionModal(false)} />}
      {/* 10.8: Export session as markdown */}
      {showExportModal && <AiSessionExportModal onClose={() => setShowExportModal(false)} />}
      {/* 10.10-10.17: Platform tools */}
      {showOpenApiModal && <AiOpenApiGeneratorModal onClose={() => setShowOpenApiModal(false)} />}
      {showSecurityAudit && <AiSecurityAuditModal onClose={() => setShowSecurityAudit(false)} />}
      {showPostmanTranslator && <AiPostmanTranslatorModal onClose={() => setShowPostmanTranslator(false)} />}
      {showWebhookDebugger && <AiWebhookDebuggerModal onClose={() => setShowWebhookDebugger(false)} />}
      {showRequestClustering && <AiRequestClusteringModal onClose={() => setShowRequestClustering(false)} />}
      {/* Sprint 14: Cross-protocol & advanced platform tools */}
      {showCrossProtocol && <AiCrossProtocolOrchestratorModal onClose={() => setShowCrossProtocol(false)} />}
      {showChaosEngineering && <AiChaosEngineeringModal onClose={() => setShowChaosEngineering(false)} />}
      {showContractNegotiator && <AiContractNegotiatorModal onClose={() => setShowContractNegotiator(false)} />}
      {showLiveTrafficMirror && <AiLiveTrafficMirrorModal onClose={() => setShowLiveTrafficMirror(false)} />}
    </div>
  );
}
