/**
 * DaakiaAiPanel — the Daakia AI tab.
 *
 * A history rail, a header, and ConvEngineChat in fullscreen mode with this
 * tab's landing, `/` palette and dk8s progress drawn inside it. The accent is
 * the tab's own orange (--color-ai-accent, falling back to Claude's clay);
 * surfaces follow the VS Code theme. See daakia-ai.css.
 *
 * E6.71 — Daakia AI dedicated tab · 3.3 — the revamp on convengine-chat 1.7.0
 */
import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ConvEngineChat } from '@salilvnair/convengine-chat';
import type { RendererComponentProps } from '@salilvnair/convengine-chat';
import { useTabsStore, DAAKIA_ASSISTANT_SYSTEM_PROMPT, type ResponseData } from '../../store/tabs-store';
import { useEnvStore, GLOBAL_ENV_ID } from '../../store/env-store';
import { MdViewer } from '../shared/display/MdViewer';
import { Dk8sSearchCard, isDk8sSearchPayload } from './Dk8sSearchCard';
import { AiNoticeCard, isAiNoticePayload } from './AiNoticeCard';
import { useLibrarySlot } from './use-library-slot';
import { postMsg } from '../../vscode';
import { AiPendingActions, parseDaakiaActions, type DaakiaAction } from './AiPendingActions';
import { AiConversationToCollectionModal } from './AiConversationToCollectionModal';
import { AiSessionExportModal } from './AiSessionExportModal';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { useK8sStore } from '../../store/k8s-store';
import { usePersistedPref, useUiStateStore } from '../../store/ui-state-store';
import { useAiConversationStore } from '../../store/ai-conversation-store';
import { useAiChatSessions, currentId } from '../../store/ai-chat-sessions-store';
import { DK8S_CHAT_PREF, DK8S_OFF_CHATS_PREF, DK8S_EXCLUDED_PREF, dk8sOffChats, setDk8sForChat, dk8sScoped } from './dk8s-chat-prompts';
import { Dk8sPodPickerPortal } from './Dk8sPodPicker';
import { Dk8sSearchProgressPortal } from './Dk8sSearchProgress';
import { AiHistoryRail } from './AiHistoryRail';
import { AiChatHeader } from './AiChatHeader';
import { AiLandingPortal } from './AiLanding';
import { PromptPalette } from './PromptPalette';
import { BUILD_PROMPTS, logPrompts } from './ai-prompts';
import { chatActionsFor } from './ai-chat-actions';
import { toUiMessages } from './ai-display';
import { copyText } from '../../utils/clipboard';
import { useDocTheme } from './use-doc-theme';
import { ButtonView, IconButtonView, SplitPanelView } from '@salilvnair/dui';
import './daakia-ai.css';

const ACCENT = 'var(--color-ai-accent, #D97757)';
const RAIL_SPLIT_PREF = 'ai.chat.railSplit';
const EMPTY_MESSAGES: import('../../store/tabs-store').AiMessage[] = [];

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
/** The bridge normally wraps AI text as `{ type: "text", rawText }`, but now that this
 *  renderer matches EVERY message it also has to cope with whatever else arrives —
 *  a bare string, or a structured payload from an error/verbose path. */
function payloadToText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (typeof p.rawText === 'string') return p.rawText;
    if (typeof p.text === 'string') return p.text;
    if (typeof p.message === 'string') return p.message;
    return '```json\n' + JSON.stringify(payload, null, 2) + '\n```';
  }
  return payload == null ? '' : String(payload);
}

function DaakiaMdRendererComponent({ payload }: { payload: unknown }) {
  return (
    <div className="daakia-chat-md">
      <MdViewer content={payloadToText(payload)} />
    </div>
  );
}

/**
 * An answer that came with a dk8s search: the explanation, and the lines it
 * cites drawn from the search's own result. `actions.submit` is how the card's
 * ±20 / ±100 / ±500 asks again — the model re-runs the search wider, the same
 * way it would if the user typed the request.
 */
function Dk8sRendererComponent({ payload, actions }: RendererComponentProps) {
  if (!isDk8sSearchPayload(payload)) return <DaakiaMdRendererComponent payload={payload} />;
  return <Dk8sSearchCard payload={payload} submit={actions ? (text) => actions.submit(text) : undefined} />;
}

/** An answer that did not come — stopped or failed — with the question offered again. */
function NoticeRendererComponent({ payload, actions }: RendererComponentProps) {
  if (!isAiNoticePayload(payload)) return <DaakiaMdRendererComponent payload={payload} />;
  return <AiNoticeCard payload={payload} submit={actions ? (text) => actions.submit(text) : undefined} />;
}

const DAAKIA_RENDERER_PROVIDERS = [
  {
    key: 'daakia-notice',
    priority: 300,
    match: (ctx: { payload?: unknown }) => isAiNoticePayload(ctx?.payload),
    Component: NoticeRendererComponent,
    hideBubble: true,
  },
  {
    key: 'daakia-dk8s-search',
    /* Above the markdown catch-all, which matches everything. */
    priority: 300,
    match: (ctx: { payload?: unknown }) => isDk8sSearchPayload(ctx?.payload),
    Component: Dk8sRendererComponent,
    /* The card brings its own border and width; a speech bubble around it squeezed both. */
    hideBubble: true,
  },
  {
    key: 'daakia-md',
    priority: 200,          // built-in renderers are priority 100
    // Catch EVERY assistant message so all text goes through MdViewer and never
    // reaches the library's built-in <pre>-style default, which renders raw text
    // with white-space:pre-wrap and turns each blank line into a visible gap.
    // The previous narrow match (effectiveType === 'text' && payload.rawText)
    // let errors, verbose stages and messages restored from a persisted
    // conversation fall through to that default. Matching everything is what
    // both ns9 and storybook do, for exactly this reason.
    match: () => true,
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
        backgroundColor: 'color-mix(in srgb, var(--color-ai-accent, #D97757) 5%, var(--color-panel))',
      }}
    >
      {/* Context label */}
      <span className="flex-shrink-0 text-[9.5px] font-semibold uppercase tracking-wider opacity-50" style={{ color: 'var(--color-ai-accent, #D97757)' }}>
        Context
      </span>

      {/* Protocol badge + URL + optional detail */}
      <span className="font-mono font-bold flex-shrink-0 text-[10px]" style={{ color: 'var(--color-ai-accent, #D97757)' }}>
        {protoBadge}
      </span>
      <span className="truncate flex-1 font-mono text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
        {truncatedUrl}
      </span>
      {detail && (
        <span className="flex-shrink-0 text-[9px] px-1.5 py-px rounded font-mono" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ai-accent, #D97757) 10%, transparent)', color: 'var(--color-ai-accent, #D97757)' }}>
          {detail}
        </span>
      )}
      {response && (
        <span className="flex-shrink-0 font-semibold text-[10px] px-1.5 py-0.5 rounded" style={{ color: statusColor, backgroundColor: `color-mix(in srgb, ${statusColor} 12%, transparent)` }}>
          {response.status}
        </span>
      )}
      {envName && envName !== 'Global' && (
        <span className="flex-shrink-0 px-1.5 py-px rounded text-[9px]" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ai-accent, #D97757) 12%, transparent)', color: 'var(--color-ai-accent, #D97757)' }}>
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
          style={{ color: 'var(--color-ai-accent, #D97757)', borderColor: 'color-mix(in srgb, var(--color-ai-accent, #D97757) 30%, transparent)', backgroundColor: 'color-mix(in srgb, var(--color-ai-accent, #D97757) 8%, transparent)' }}
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
 Save
        </button>
      </div>
    </div>
  );
}


// ─── Panel ────────────────────────────────────────────────────────────────────


/**
 * DaakiaAiPanel — the Daakia AI tab.
 *
 * ConvEngineChat is the conversation; everything around it is this tab's: a
 * history rail, a quiet header, the landing and the `/` palette drawn inside
 * the chat's own slots, and the dk8s context pinned in the composer as a
 * reply pill (`replyContext`, persisted) rather than a banner.
 *
 * The DaakiaVsCodeBridge (installed in App.tsx) intercepts ConvEngine's
 * HTTP/SSE calls and routes them through the Daakia extension protocol.
 * System prompts are injected via tab.aiSystemPrompts; the dk8s one is added
 * by the bridge at send time.
 */
export function DaakiaAiPanel({ tabId }: { tabId: string }) {
  /* This panel's own tab: each Daakia AI tab is a conversation of its own. */
  const thisTab = useTabsStore(s => s.tabs.find(t => t.id === tabId));
  const onScreen = useTabsStore(s => s.activeTabId === tabId);
  const updateTab = useTabsStore(s => s.updateTab);

  // ── AI Conversation Context (4.5.4) ──────────────────────────────────────
  // Use the tab that was active when "Ask AI" was clicked (previousTabId),
  // NOT "last tab with a URL" which picks the wrong protocol when multiple tabs are open.
  const allTabs = useTabsStore(s => s.tabs);
  const previousTabId = useTabsStore(s => s.previousTabId);
  const contextTab = useMemo(() => {
    const prev = previousTabId ? allTabs.find(t => t.id === previousTabId) : null;
    if (prev && prev.type !== 'daakia-ai') return prev;
    return allTabs.filter(t => t.type !== 'daakia-ai' && t.url?.trim()).at(-1) ?? null;
  }, [allTabs, previousTabId]);

  const environments = useEnvStore(s => s.environments);
  const activeEnvId = useEnvStore(s => s.activeEnvId);
  const contextEnv = useMemo(() => {
    const envId = contextTab?.envId ?? activeEnvId;
    if (!envId || envId === GLOBAL_ENV_ID) return environments.find(e => e.isGlobal) ?? null;
    return environments.find(e => e.id === envId) ?? null;
  }, [contextTab, environments, activeEnvId]);

  const showContextBar = !!contextTab?.url;

  // Guard: re-inject system prompts if the tab was loaded from persisted state
  // without them (tabs-store rehydration doesn't re-run openDaakiaAiTab logic).
  // Also inject context block as second system prompt.
  useEffect(() => {
    if (!thisTab) return;
    const basePrompt = DAAKIA_ASSISTANT_SYSTEM_PROMPT;
    const contextBlock = showContextBar && contextTab
      ? buildContextBlock(contextTab, contextEnv?.name ?? null, contextEnv?.variables?.length ?? 0)
      : '';
    const newPrompts = contextBlock ? [basePrompt, contextBlock] : [basePrompt];
    const currentPrompts = thisTab.aiSystemPrompts ?? [];
    const needsUpdate =
      currentPrompts.length !== newPrompts.length ||
      currentPrompts[0] !== newPrompts[0] ||
      currentPrompts[1] !== newPrompts[1];
    if (needsUpdate) updateTab(tabId, { aiSystemPrompts: newPrompts });
  }, [tabId, showContextBar, contextTab?.url, contextTab?.response?.status, contextEnv?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const templates = useAiPromptTemplatesStore(s => s.templates);

  // ── The rail, and which conversation is open ─────────────────────────────
  const [railPref, setRailPref] = usePersistedPref('ai.chat.rail', 'open', ['open', 'closed'] as const);
  /* The rail's width, as the split's percentage — dragged once, kept. */
  const railSplitPref = Number(useUiStateStore(s => s.prefs[RAIL_SPLIT_PREF]));
  const railSplit = railSplitPref > 0 && railSplitPref < 60 ? railSplitPref : 20;
  /*
    This tab's thread. `ensure` creates the session the first time and asks
    for the conversation the tab keeps, so a restart puts each tab's thread
    back on screen — the model's history and the chat together.
  */
  useEffect(() => { useAiChatSessions.getState().ensure(tabId); }, [tabId]);
  const session = useAiChatSessions(s => s.byTab[tabId]);
  const epoch = session?.epoch ?? 0;
  const seed = useMemo(() => session?.seed ?? [], [session?.seed]);
  const activeId = session?.activeId ?? '';
  const conversations = useAiChatSessions(s => s.conversations);
  const modelMessages = useAiConversationStore(s => s.byTab[tabId]?.messages) ?? EMPTY_MESSAGES;

  const title = useMemo(() => {
    const row = conversations.find(c => c.id === activeId);
    if (row) return row.title;
    const firstUser = modelMessages.find(m => m.role === 'user')?.content.trim();
    return firstUser ? firstUser.slice(0, 60) + (firstUser.length > 60 ? '…' : '') : 'New conversation';
  }, [conversations, activeId, modelMessages]);

  // ── dk8s: may the assistant search the watched pods? ─────────────────────
  const [dk8sPref, setDk8sPref] = usePersistedPref(DK8S_CHAT_PREF, 'on', ['on', 'off'] as const);
  /* ✕ on the pill is for this conversation; the header's switch is for the tab. */
  const chatId = activeId || currentId(tabId);
  const offHere = dk8sOffChats(useUiStateStore(s => s.prefs[DK8S_OFF_CHATS_PREF])).includes(chatId);
  const dk8sOn = dk8sPref === 'on' && !offHere;
  const k8sContext = useK8sStore(s => s.context);
  const k8sNamespace = useK8sStore(s => s.namespace);
  const allPods = useK8sStore(s => s.pods);
  const podsOnScreen = useMemo(() => allPods.filter(p =>
    (!k8sContext || p.context === k8sContext) && (!k8sNamespace || p.namespace === k8sNamespace)), [allPods, k8sContext, k8sNamespace]);
  const excludedRaw = useUiStateStore(s => s.prefs[DK8S_EXCLUDED_PREF]);
  /* What a question will search: the pods on screen, less those the pill's picker leaves out. */
  const searchedPods = useMemo(() => dk8sScoped(podsOnScreen, excludedRaw).length, [podsOnScreen, excludedRaw]);
  const watchedPods = podsOnScreen.length;
  const dk8sActive = dk8sOn && watchedPods > 0;
  const where = [k8sContext, k8sNamespace].filter(Boolean).join(' / ');

  /*
    The dk8s context, pinned in the composer.

    A reply pill that persists across sends — the library's own affordance for
    "this is what the next message is about". ✕ on it turns dk8s search off
    for this conversation only; the header offers to turn it back on. The pods
    themselves are sent by the bridge, from what dk8s shows at the moment of
    sending.
  */
  const replyContext = useMemo(() => dk8sActive ? {
    label: 'dk8s',
    text: `${where} · ${searchedPods === watchedPods ? `${watchedPods} pod${watchedPods === 1 ? '' : 's'}`
      : searchedPods === 0 ? 'no pods ticked — not searching' : `${searchedPods} of ${watchedPods} pods`}`,
    persist: true,
    clearable: true,
    title: `Questions can search the logs of ${searchedPods} of the ${watchedPods} pods you are watching — choose which beside the ✕. ✕ stops that in this conversation.`,
    onClear: () => setDk8sForChat(chatId, false),
  } : null, [dk8sActive, where, watchedPods, searchedPods, chatId]);

  /* The header's switch: back on here if only this conversation had it off, else the tab's. */
  const toggleDk8s = useCallback(() => {
    if (offHere) {
      setDk8sForChat(chatId, true);
      if (dk8sPref === 'off') setDk8sPref('on');
    } else setDk8sPref(dk8sPref === 'on' ? 'off' : 'on');
  }, [offHere, chatId, dk8sPref]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── While an answer is on its way, Send is Stop ──────────────────────────
  const streaming = !!thisTab?.aiStreaming;
  const stop = useCallback(() => postMsg({ type: 'ai:cancel', tabId }), [tabId]);

  /* Ctrl N (⌘N) is New chat, as the button says — while this tab is the one on screen. */
  useEffect(() => {
    if (!onScreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'n') return;
      e.preventDefault();
      e.stopPropagation();
      useAiChatSessions.getState().newChat(tabId);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onScreen, tabId]);

  const logPromptList = useMemo(() => logPrompts(templates), [templates]);
  const palettePrompts = useMemo(
    () => [...(dk8sActive ? logPromptList : []), ...BUILD_PROMPTS],
    [dk8sActive, logPromptList],
  );

  const [chatRoot, setChatRoot] = useState<HTMLDivElement | null>(null);
  /* Beside the library's send button, drawn with its class so it sits exactly where Send was.
     The selector skips our own button: with it, the slot matched itself and nested forever. */
  const stopSlot = useLibrarySlot(chatRoot, ':has(> .ce-composer-send:not(.dai-stop))', 'dai-stop-slot', streaming);

  /*
    The chat's own dark/light mode follows Daakia's. It is only read when the
    chat mounts, so a change remounts it — seeded with the thread as it stands,
    so switching theme mid-conversation loses nothing.
  */
  const docTheme = useDocTheme();
  const lastTheme = useRef(docTheme);
  useEffect(() => {
    if (lastTheme.current === docTheme) return;
    lastTheme.current = docTheme;
    useAiChatSessions.setState(s => s.byTab[tabId] ? {
      byTab: { ...s.byTab, [tabId]: { ...s.byTab[tabId], seed: useAiConversationStore.getState().messagesOf(tabId), epoch: s.byTab[tabId].epoch + 1 } },
    } : s);
  }, [docTheme, tabId]);

  // ── AI Suggestion Chips (4.5.5) ──────────────────────────────────────────
  const [showChips, setShowChips] = useState(false);
  // ── AI Actions from Chat (4.5.6) ─────────────────────────────────────────
  const [pendingActions, setPendingActions] = useState<DaakiaAction[]>([]);

  const handleMessage = useCallback((_text: string) => {
    setShowChips(false);
    setPendingActions([]);
  }, []);

  const handleResponse = useCallback((text: string) => {
    const actions = parseDaakiaActions(text);
    if (actions.length > 0) setPendingActions(actions);
    setShowChips(true);
  }, []);

  const handleDismissAction = useCallback((index: number) => {
    setPendingActions(prev => prev.filter((_, i) => i !== index));
  }, []);
  const handleDismissAllActions = useCallback(() => setPendingActions([]), []);

  // The conversation id the bridge reads is this tab's id — which tab a question
  // and its answer belong to. Switching threads remounts the chat (key = epoch).
  const conversationId = tabId;
  const initialMessages = useMemo(() => toUiMessages(seed), [seed]);

  const chatConfig = useMemo(() => ({
    apiHost: '',
    conversationId,
    title: '',
    subtitle: '',
    placeholder: dk8sActive
      ? 'Ask about a failure, a request id, a thread… or an API. Type / for prompts'
      : 'Ask anything about APIs, REST, GraphQL, mocks, cURL, tests… Type / for prompts',
    showFeedback: false,
    showAudit: false,
    showNewChat: false,
    showLayoutPicker: false,
    showMaximize: false,
    showMinimize: false,
    showEngineStatus: false,
    showHeaderDot: false,
    showLandingAvatar: false,
    showLandingSubtitle: false,
    defaultDark: docTheme === 'dark',
    composerShape: 'rect' as const,
    landingChips: [],
    initialMessages,
    replyContext,
    stream: { enabled: true, transport: 'sse' as const },
    renderers: DAAKIA_RENDERER_PROVIDERS,
    onMessage: handleMessage,
    onResponse: handleResponse,
  }), [handleMessage, handleResponse, dk8sActive, initialMessages, replyContext, docTheme]);

  const chatTheme = useMemo(() => ({
    'color-accent': 'var(--color-ai-accent, #D97757)',
    'bg-panel': 'var(--color-panel)',
    'bg-header': 'transparent',
    'border-color': 'var(--color-surface-border)',
    'shadow-panel': 'none',
    'bg-composer': 'var(--color-panel)',
    'bg-composer-surface': 'color-mix(in srgb, var(--color-text-primary) 4%, var(--color-panel))',
    'text-primary': 'var(--color-text-primary)',
    'text-secondary': 'var(--color-text-muted)',
    'text-placeholder': 'var(--color-text-muted)',
    'bg-bubble-user': 'color-mix(in srgb, var(--color-text-primary) 9%, var(--color-panel))',
    'text-bubble-user': 'var(--color-text-primary)',
    'bg-bubble-agent': 'transparent',
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
        void copyText(contextTab.url);
        break;
      case 'switch-tab':
        useTabsStore.getState().setActiveTab(contextTab.id);
        break;
    }
  }, [contextTab]);

  return (
    <div className={streaming ? 'dai dai--streaming' : 'dai'}>
      {/*
        The rail and the conversation, as a split somebody can drag. Hidden,
        the rail collapses rather than unmounts, so its search and scroll stay.
      */}
      <SplitPanelView
        direction="horizontal"
        defaultSplit={railSplit}
        minFirst={200}
        minSecond={480}
        collapsed={railPref !== 'open'}
        collapsedSide="first"
        accentColor={ACCENT}
        onResizeEnd={v => useUiStateStore.getState().setPref(RAIL_SPLIT_PREF, String(Math.round(v * 10) / 10))}
        style={{ flex: 1, minWidth: 0, minHeight: 0 }}
        first={<AiHistoryRail tabId={tabId} />}
        second={
      <div className="dai-main">
        <AiChatHeader
          tabId={tabId}
          title={title}
          dk8s={watchedPods > 0 ? { on: dk8sOn, toggle: toggleDk8s, where } : undefined}
          railOpen={railPref === 'open'}
          onToggleRail={() => setRailPref(railPref === 'open' ? 'closed' : 'open')}
          onCollection={() => setShowCollectionModal(true)}
          onExport={() => setShowExportModal(true)}
        />

        {showContextBar && contextTab && (
          <AiContextBar tab={contextTab} envName={contextEnv?.name ?? null} tabId={contextTab.id} />
        )}

        {pendingActions.length > 0 && (
          <AiPendingActions
            actions={pendingActions}
            contextTab={contextTab}
            onDismiss={handleDismissAction}
            onDismissAll={handleDismissAllActions}
          />
        )}

        <div ref={setChatRoot} className="dai-chat">
          <ConvEngineChat
            key={`${activeId}:${epoch}`}
            mode="fullscreen"
            config={chatConfig}
            theme={chatTheme}
            actionsRef={chatActionsFor(tabId)}
          />
          <AiLandingPortal
            root={chatRoot}
            dk8s={dk8sActive && searchedPods > 0 ? { pods: searchedPods, namespace: k8sNamespace } : undefined}
            logPrompts={logPromptList}
            buildPrompts={BUILD_PROMPTS}
          />
          <PromptPalette root={chatRoot} prompts={palettePrompts} />
          <Dk8sSearchProgressPortal root={chatRoot} tabId={tabId} />
          {dk8sActive && <Dk8sPodPickerPortal root={chatRoot} pods={podsOnScreen} />}
          {streaming && stopSlot && createPortal(
            <button type="button" className="ce-composer-send dai-stop" onClick={stop}
                    aria-label="Stop the answer" title="Stop the answer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            </button>,
            stopSlot,
          )}

          {/*
            Suggestion chips — float above the composer after each response,
            only when there is a request tab for them to act on.
          */}
          {showChips && contextTab?.url && (
            <div className="absolute bottom-[96px] left-0 right-0 flex items-center justify-center gap-1.5 px-3 py-1.5 flex-wrap pointer-events-none" style={{ zIndex: 10 }}>
              <span className="pointer-events-auto flex flex-wrap gap-1.5">
                <ButtonView variant="secondary" size="sm" rounded accentColor={ACCENT} onClick={() => handleChipAction('run')}>Run request</ButtonView>
                <ButtonView variant="ghost" size="sm" rounded onClick={() => handleChipAction('save')}>Save to collection</ButtonView>
                <ButtonView variant="ghost" size="sm" rounded onClick={() => handleChipAction('copy-url')}>Copy URL</ButtonView>
                <ButtonView variant="ghost" size="sm" rounded onClick={() => handleChipAction('switch-tab')}>Switch to tab</ButtonView>
                <IconButtonView size="sm" rounded tooltip="Dismiss suggestions" aria-label="Dismiss suggestions" onClick={() => setShowChips(false)}
                  icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>} />
              </span>
            </div>
          )}
        </div>
      </div>
        }
      />

      {showCollectionModal && (
        <AiConversationToCollectionModal
          // The chat is about contextTab — so its protocol decides which collection list
          // the export lands in. Without this a GraphQL export filed itself under REST.
          contextProtocol={contextTab?.protocol}
          onClose={() => setShowCollectionModal(false)}
        />
      )}
      {showExportModal && <AiSessionExportModal onClose={() => setShowExportModal(false)} />}
    </div>
  );
}
