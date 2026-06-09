/**
 * MockAiGeneratePopover — modal AI generation panel for mock server config panels.
 *
 * Features:
 * - Module-level response cache: never re-generates unless user clicks Regenerate
 * - Centered modal overlay (850px wide, up to 700px tall — 70% larger than original)
 * - Per-route "+ Add Route" buttons after generation completes (REST)
 * - Protocol-aware item parsing for GQL, SOAP, gRPC, SSE, SIO, MQTT
 * - "+ Add All Generated [Items]" button in footer, individual "+ Add [Item]" per row
 * - Copy SDL button for GraphQL responses
 * - Description field in context so AI knows what to build
 *
 * Shared by all mock protocols (REST, GraphQL, gRPC, SOAP, SSE, WebSocket, Socket.IO, MQTT).
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { useTabsStore } from '../../store/tabs-store';
import { useAiPromptTemplatesStore, type AiPromptTemplateKey } from '../../store/prompt-template';
import { SparkleIcon, CloseIcon, RefreshIcon, PlusIcon, CopyIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';
import type { MockRoute, HttpMethod } from './mock-types';
import { useAiFeaturesStore } from '../../store/ai-features-store';

const ACCENT = 'var(--color-mock-server)';

// ─── Module-level generation cache ────────────────────────────────────────────
// Persists across open/close within the session — no re-generation unless explicit.

interface CachedResult {
  text: string;
  routes: ParsedRoute[];
  items?: ParsedGenericItem[];
  sdl?: string | null;
}

const generateCache = new Map<string, CachedResult>();

// ─── Route parser (REST) ──────────────────────────────────────────────────────

interface ParsedRoute {
  name: string;
  method: HttpMethod;
  path: string;
  statusCode: number;
  body: string;
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const HTTP_METHODS_RE = '(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)';

/**
 * Parse routes from AI-generated text.
 *
 * Strategy 1 (primary): AI was prompted to emit a ```routes JSON array.
 *   Parse that JSON directly — zero regex, zero ambiguity.
 *
 * Strategy 2 (legacy/custom prompts): "Route:" section headers with method+path.
 *   Used as fallback if no ```routes block is found.
 *
 * Strategy 3 (last resort): Direct METHOD /path line scan.
 */
function parseRoutesFromText(text: string): ParsedRoute[] {
  // ── Strategy 1: Structured JSON from ```routes block ─────────────────────────
  const routesBlockMatch = text.match(/```routes\n?([\s\S]*?)\n?```/i);
  if (routesBlockMatch) {
    try {
      const parsed: unknown = JSON.parse(routesBlockMatch[1].trim());
      if (Array.isArray(parsed)) {
        const routes: ParsedRoute[] = [];
        for (const r of parsed) {
          if (!r || typeof r !== 'object') continue;
          const rec = r as Record<string, unknown>;
          const method = (rec.method as string)?.toUpperCase() as HttpMethod;
          const path = rec.path as string;
          if (!method || !path || !HTTP_METHODS.includes(method)) continue;
          const rawBody = rec.body;
          const body = typeof rawBody === 'string'
            ? rawBody
            : rawBody != null ? JSON.stringify(rawBody, null, 2) : '{\n  "message": "OK"\n}';
          routes.push({
            name: (rec.name as string) || `${method} ${path}`,
            method,
            path,
            statusCode: (rec.statusCode as number) || (method === 'POST' ? 201 : 200),
            body,
          });
        }
        if (routes.length > 0) return routes;
      }
    } catch { /* JSON.parse failed — fall through to regex strategies */ }
  }

  // ── Strategy 2: "Route:" section headers (regex — legacy/custom prompts) ─────
  const routes: ParsedRoute[] = [];
  const seen = new Set<string>();
  const sectionRe = /(?:^|\n)(?:#{1,4}\s+)?(?:\*{1,2})?(Route\s*\d*\s*[:—\-]\s*)([^\n]*)(?:\*{1,2})?/gi;
  const sections: Array<{ header: string; start: number }> = [];
  let sm: RegExpExecArray | null;
  while ((sm = sectionRe.exec(text)) !== null) {
    const header = sm[2].trim().replace(/\*+/g, '');
    if (header) sections.push({ header, start: sm.index });
  }

  if (sections.length > 0) {
    for (let i = 0; i < sections.length; i++) {
      const { header, start } = sections[i];
      const end = i + 1 < sections.length ? sections[i + 1].start : text.length;
      const block = text.slice(start, end);

      const inlineRe = new RegExp(`\\b(${HTTP_METHODS_RE})\\b\\s+(/[^\\s\\n*\`'"\\])]+)`, 'i');
      const inlineMatch = header.match(inlineRe);
      let method: HttpMethod | undefined;
      let path: string | undefined;
      let routeName: string;

      if (inlineMatch) {
        method = inlineMatch[1].toUpperCase() as HttpMethod;
        path = inlineMatch[2].replace(/[*`]+$/, '');
        routeName = header.replace(inlineMatch[0], '').trim().replace(/^[-:—\s]+/, '') || `${method} ${path}`;
      } else {
        routeName = header;
        const bodyRe = new RegExp(`\\b(${HTTP_METHODS_RE})\\b\\s+(/[^\\s\\n*\`'"\\])]+)`, 'i');
        const bm = block.match(bodyRe);
        if (bm) { method = bm[1].toUpperCase() as HttpMethod; path = bm[2].replace(/[*`]+$/, ''); }
      }
      if (!method || !path) continue;
      const key = `${method}:${path}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const statusMatch = block.match(/(?:Response\s*(?:Body\s*)?\(|Returns?\s*\(?|status[:\s]+|HTTP\s+)(\d{3})/i);
      const statusCode = statusMatch ? parseInt(statusMatch[1]) : (method === 'POST' ? 201 : 200);
      const codeMatch = block.match(/```(?:json|JSON)?\n?([\s\S]*?)\n?```/);
      const body = codeMatch ? codeMatch[1].trim() : '{\n  "message": "OK"\n}';
      routes.push({ name: routeName, method, path, statusCode, body });
    }
    if (routes.length > 0) return routes;
  }

  // ── Strategy 3: Direct METHOD /path line scan (last resort) ──────────────────
  const directRe = /(?:^|\n)[ \t]*(?:\*{1,2})?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)(?:\*{1,2})?[ \t]+(\/[^\s\n\*`'")\]]+)/gim;
  const matches: Array<{ method: HttpMethod; path: string; pos: number }> = [];
  let dm: RegExpExecArray | null;
  while ((dm = directRe.exec(text)) !== null) {
    const meth = dm[1].toUpperCase() as HttpMethod;
    const pth = dm[2].replace(/[*`]+$/, '');
    const key = `${meth}:${pth}`;
    if (!seen.has(key)) { seen.add(key); matches.push({ method: meth, path: pth, pos: dm.index }); }
  }
  for (let i = 0; i < matches.length; i++) {
    const { method, path, pos } = matches[i];
    const end = i + 1 < matches.length ? matches[i + 1].pos : text.length;
    const block = text.slice(pos, end);
    const sm2 = block.match(/(?:Response\s*(?:Body\s*)?\(|Returns?\s*\(?|status[:\s]+|HTTP\s+)(\d{3})/i);
    const statusCode = sm2 ? parseInt(sm2[1]) : (method === 'POST' ? 201 : 200);
    const cm = block.match(/```(?:json|JSON)?\n?([\s\S]*?)\n?```/);
    const body = cm ? cm[1].trim() : '{\n  "message": "OK"\n}';
    routes.push({ name: `${method} ${path}`, method, path, statusCode, body });
  }
  return routes;
}

// ─── Generic item types (non-REST protocols) ──────────────────────────────────

export interface ParsedGenericItem {
  name: string;
  detail?: string;
  data: unknown;
}

interface ProtocolFlavor {
  codeBlockName: string;
  sdlBlockName?: string;
  itemLabel: string;
  itemLabelPlural: string;
  parseItem: (raw: Record<string, unknown>) => ParsedGenericItem;
  /** Optional per-item add-button label. Defaults to "Add {itemLabel}" */
  addButtonLabel?: (item: ParsedGenericItem) => string;
}

const PROTOCOL_FLAVORS: Record<string, ProtocolFlavor> = {
  'mock.graphql.generate': {
    codeBlockName: 'graphql_operations',
    sdlBlockName: 'graphql_sdl',
    itemLabel: 'Operation',
    itemLabelPlural: 'Operations',
    parseItem: (raw) => ({
      name: (raw.operationName as string) || 'Unknown',
      detail: (raw.operationType as string) || 'query',
      data: raw,
    }),
  },
  'mock.soap.generate': {
    codeBlockName: 'soap_services',
    itemLabel: 'Service',
    itemLabelPlural: 'Services',
    parseItem: (raw) => {
      const ops = Array.isArray(raw.operations) ? raw.operations.length : 0;
      return { name: (raw.service as string) || 'Unknown', detail: `${ops} op${ops !== 1 ? 's' : ''}`, data: raw };
    },
  },
  'mock.grpc.generate': {
    codeBlockName: 'grpc_services',
    itemLabel: 'Service',
    itemLabelPlural: 'Services',
    parseItem: (raw) => {
      const methods = Array.isArray(raw.methods) ? raw.methods.length : 0;
      return { name: (raw.service as string) || 'Unknown', detail: `${methods} method${methods !== 1 ? 's' : ''}`, data: raw };
    },
  },
  'mock.sse.generate': {
    codeBlockName: 'sse_events',
    itemLabel: 'Event',
    itemLabelPlural: 'Events',
    parseItem: (raw) => ({
      name: (raw.eventName as string) || 'Unknown',
      detail: raw.intervalMs ? `${(raw.intervalMs as number) / 1000}s` : undefined,
      data: raw,
    }),
  },
  'mock.socketio.generate': {
    codeBlockName: 'sio_handlers',
    itemLabel: 'Handler',
    itemLabelPlural: 'Handlers',
    parseItem: (raw) => ({
      name: (raw.listenEvent as string) || 'Unknown',
      detail: raw.emitEvent ? `→ ${raw.emitEvent as string}` : (raw.type as string) || undefined,
      data: raw,
    }),
  },
  'mock.mqtt.generate': {
    codeBlockName: 'mqtt_topics',
    itemLabel: 'Topic',
    itemLabelPlural: 'Topics',
    parseItem: (raw) => ({
      name: (raw.topic as string) || 'Unknown',
      detail: raw.intervalMs ? `${(raw.intervalMs as number) / 1000}s` : undefined,
      data: raw,
    }),
  },
  'mock.websocket.generate': {
    codeBlockName: 'websocket_handlers',
    itemLabel: 'Handler',
    itemLabelPlural: 'Handlers',
    parseItem: (raw) => {
      const type = ((raw.type as string) || 'message').toLowerCase();
      const labelMap: Record<string, string> = {
        connect: 'On Connect',
        message: 'On Message',
        disconnect: 'On Disconnect',
      };
      return {
        name: labelMap[type] || (raw.name as string) || 'On Message',
        detail: (raw.matchPattern as string) || undefined,
        data: raw,
      };
    },
    addButtonLabel: (item) => `+ ${item.name}`,
  },
};

function parseGenericItemsFromText(text: string, flavor: ProtocolFlavor): ParsedGenericItem[] {
  const re = new RegExp('```' + flavor.codeBlockName + '\\n?([\\s\\S]*?)\\n?```', 'i');
  const m = text.match(re);
  if (!m) return [];
  try {
    const parsed: unknown = JSON.parse(m[1].trim());
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map(r => flavor.parseItem(r));
  } catch { return []; }
}

function parseSdlFromText(text: string): string | null {
  const m = text.match(/```graphql_sdl\n?([\s\S]*?)\n?```/i);
  return m ? m[1].trim() : null;
}

// ─── Method badge colors ──────────────────────────────────────────────────────

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET:     'var(--color-method-get)',
  POST:    'var(--color-method-post)',
  PUT:     'var(--color-method-put)',
  PATCH:   'var(--color-method-patch)',
  DELETE:  'var(--color-method-delete)',
  HEAD:    'var(--color-method-get)',
  OPTIONS: 'var(--color-method-get)',
};

// ─── Popover ──────────────────────────────────────────────────────────────────

interface MockAiGeneratePopoverProps {
  templateKey: AiPromptTemplateKey;
  /** Shown in the header — e.g. "REST Mock", "GraphQL Schema" */
  title: string;
  /** Passed into {serverName} placeholder */
  serverName: string;
  /** Passed into {context} placeholder — description + existing items summary */
  serverContext?: string;
  onClose: () => void;
  /** Only wired for REST — adds parsed routes directly to the server */
  onAddGeneratedRoutes?: (routes: Partial<MockRoute>[]) => void;
  /** For non-REST protocols — adds parsed generic items (GQL/SOAP/gRPC/SSE/SIO/MQTT) */
  onAddGeneratedItems?: (items: ParsedGenericItem[]) => void;
}

export function MockAiGeneratePopover({
  templateKey,
  title,
  serverName,
  serverContext = 'None configured yet.',
  onClose,
  onAddGeneratedRoutes,
  onAddGeneratedItems,
}: MockAiGeneratePopoverProps) {
  const popoverId = useRef(`mock-ai-${Date.now()}`).current;
  const cacheKey = `${templateKey}:${serverName}`;
  const accumulatedRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const providers = useAiProvidersStore(s => s.providers);
  const defaultProviderId = useAiProvidersStore(s => s.defaultProviderId);
  const defaultModelId = useAiProvidersStore(s => s.defaultModelId);
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));

  const provider = activeTab?.aiProvider || defaultProviderId || providers.find(p => p.enabled)?.id || 'openai';
  const model = activeTab?.aiModel || defaultModelId || providers.find(p => p.id === provider)?.models.find(m => m.enabled)?.id || '';

  const { resolve } = useAiPromptTemplatesStore();

  // Detect protocol flavor (for non-REST protocols)
  const flavor = PROTOCOL_FLAVORS[templateKey];

  // Check cache on mount — if hit, skip AI call entirely
  const cached = generateCache.get(cacheKey);

  // Re-parse routes from cached text if routes were not previously extracted
  const initialRoutes = cached?.routes?.length
    ? cached.routes
    : cached?.text ? parseRoutesFromText(cached.text) : [];

  // Re-parse items from cached text if needed
  const initialItems = cached?.items?.length
    ? cached.items
    : cached?.text && flavor ? parseGenericItemsFromText(cached.text, flavor) : [];

  const initialSdl = cached?.sdl !== undefined
    ? cached.sdl
    : cached?.text && flavor?.sdlBlockName ? parseSdlFromText(cached.text) : null;

  // Update cache with freshly parsed data if we had to re-parse
  if (cached && !cached.routes?.length && initialRoutes.length > 0) {
    generateCache.set(cacheKey, { ...cached, routes: initialRoutes });
  }

  const [text, setText] = useState(cached?.text || '');
  const [parsedRoutes, setParsedRoutes] = useState<ParsedRoute[]>(initialRoutes);
  const [parsedItems, setParsedItems] = useState<ParsedGenericItem[]>(initialItems);
  const [detectedSdl, setDetectedSdl] = useState<string | null>(initialSdl);
  const [sdlCopied, setSdlCopied] = useState(false);
  const [streaming, setStreaming] = useState(false);  // don't auto-start
  const [error, setError] = useState('');
  const [fetchKey, setFetchKey] = useState(0);

  // ── Natural language description (4.4.1) ─────────────────────────────────
  const [description, setDescription] = useState('');
  /** Idle = waiting for user to describe what to generate (first run only; not shown on cache hit) */
  const [isIdle, setIsIdle] = useState(!cached);

  // ── URL / Spec mode (4.4.2) ──────────────────────────────────────────────
  const [idleMode, setIdleMode] = useState<'describe' | 'url-spec'>('describe');
  const [specUrl, setSpecUrl] = useState('');
  const [specPaste, setSpecPaste] = useState('');
  const [urlInputMode, setUrlInputMode] = useState<'url' | 'paste'>('url');
  const [specFetching, setSpecFetching] = useState(false);
  const [specError, setSpecError] = useState('');
  const fetchReqIdRef = useRef('');
  // REST route tracking
  const [addedAll, setAddedAll] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  // Generic item tracking
  const [addedAllItems, setAddedAllItems] = useState(false);
  const [addedItemIds, setAddedItemIds] = useState<Set<number>>(new Set());

  // ── AI request — only fires when fetchKey > 0 (user clicked Generate) ────────
  useEffect(() => {
    // Don't fire on mount — wait for user to click Generate
    if (fetchKey === 0) return;

    setText('');
    setParsedRoutes([]);
    setParsedItems([]);
    setDetectedSdl(null);
    setSdlCopied(false);
    setStreaming(true);
    setError('');
    setAddedAll(false);
    setAddedIds(new Set());
    setAddedAllItems(false);
    setAddedItemIds(new Set());
    accumulatedRef.current = '';

    // Include natural language description if provided
    const fullContext = description.trim()
      ? `User description: ${description.trim()}\n\nExisting context: ${serverContext}`
      : serverContext;
    const prompt = resolve(templateKey, { serverName, context: fullContext });
    // System prompt is stored in Prompt Library under the matching .system key
    // e.g. 'mock.rest.generate' → 'mock.rest.system'
    const systemKey = templateKey.replace('.generate', '.system') as AiPromptTemplateKey;
    const systemPrompt = resolve(systemKey, {});

    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== popoverId) return;

      if (msg.type === 'ai:chunk') {
        const chunk = (msg.delta as string) || (msg.text as string) || '';
        accumulatedRef.current += chunk;
        setText(accumulatedRef.current);
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        const content = (msgPayload?.content as string) || '';
        const final = accumulatedRef.current || content;
        setText(final);
        setStreaming(false);
        const routes = parseRoutesFromText(final);
        setParsedRoutes(routes);
        let items: ParsedGenericItem[] = [];
        let sdl: string | null = null;
        if (flavor) {
          items = parseGenericItemsFromText(final, flavor);
          setParsedItems(items);
          if (flavor.sdlBlockName) {
            sdl = parseSdlFromText(final);
            setDetectedSdl(sdl);
          }
        }
        generateCache.set(cacheKey, { text: final, routes, items, sdl });
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'AI request failed');
        setStreaming(false);
      }
    };

    window.addEventListener('message', handler);

    postMsg({
      type: 'ai:send',
      tabId: popoverId,
      stage: templateKey,
      provider,
      model,
      baseUrl: '',
      systemPrompts: [systemPrompt],
      userPrompt: prompt,
      conversation: [],
      tools: [],
      settings: {
        temperature: 0.6,
        maxTokens: 4096,
        stream: true,
        topP: 1,
        stopSequences: [],
        responseFormat: 'text',
        frequencyPenalty: 0,
        presencePenalty: 0,
        seed: null,
      },
      mcpServerConfigs: [],
      envId: activeTab?.envId,
    });

    return () => window.removeEventListener('message', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  // Auto-scroll while streaming
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [text]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── fetchUrlResult listener (4.4.2) ──────────────────────────────────────
  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.type !== 'fetchUrlResult') return;
      if (msg.reqId !== fetchReqIdRef.current) return;

      setSpecFetching(false);
      if (msg.error) {
        setSpecError(`Could not fetch spec: ${msg.error}`);
        return;
      }
      const content = (msg.content as string) || '';
      // Use fetched spec as the generation context
      triggerGenerateWithContext(
        `OpenAPI/Swagger spec fetched from ${specUrl}:\n\n${content.slice(0, 8000)}`
      );
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specUrl]);

  const triggerGenerateWithContext = useCallback((ctx: string) => {
    generateCache.delete(cacheKey);
    accumulatedRef.current = '';
    setText('');
    setParsedRoutes([]);
    setParsedItems([]);
    setDetectedSdl(null);
    setSdlCopied(false);
    setError('');
    setAddedAll(false);
    setAddedIds(new Set());
    setAddedAllItems(false);
    setAddedItemIds(new Set());
    setIsIdle(false);
    setStreaming(true);
    // Encode context into description so the useEffect picks it up
    setDescription(ctx);
    setFetchKey(k => k + 1);
  }, [cacheKey]);

  const handleFetchAndGenerate = useCallback(() => {
    setSpecError('');
    if (urlInputMode === 'url') {
      if (!specUrl.trim()) { setSpecError('Enter an OpenAPI spec URL.'); return; }
      setSpecFetching(true);
      const reqId = `spec-fetch-${Date.now()}`;
      fetchReqIdRef.current = reqId;
      postMsg({ type: 'fetchUrl', reqId, url: specUrl.trim() });
    } else {
      // Paste mode
      if (!specPaste.trim()) { setSpecError('Paste your OpenAPI spec or JSON sample.'); return; }
      triggerGenerateWithContext(`User-pasted spec / JSON sample:\n\n${specPaste.slice(0, 8000)}`);
    }
  }, [urlInputMode, specUrl, specPaste, triggerGenerateWithContext]);

  /** Triggered by the "Generate" button in idle state — starts AI generation */
  const handleGenerate = useCallback(() => {
    generateCache.delete(cacheKey);
    accumulatedRef.current = '';
    setText('');
    setParsedRoutes([]);
    setParsedItems([]);
    setDetectedSdl(null);
    setSdlCopied(false);
    setError('');
    setAddedAll(false);
    setAddedIds(new Set());
    setAddedAllItems(false);
    setAddedItemIds(new Set());
    setIsIdle(false);
    setStreaming(true);
    setFetchKey(k => k + 1);
  }, [cacheKey]);

  const handleRegenerate = useCallback(() => {
    generateCache.delete(cacheKey);
    accumulatedRef.current = '';
    setText('');
    setParsedRoutes([]);
    setParsedItems([]);
    setDetectedSdl(null);
    setSdlCopied(false);
    setError('');
    setAddedAll(false);
    setAddedIds(new Set());
    setAddedAllItems(false);
    setAddedItemIds(new Set());
    setStreaming(true);
    setFetchKey(k => k + 1);
  }, [cacheKey]);

  // ── REST route handlers ─────────────────────────────────────────────────────

  const handleAddOne = useCallback((route: ParsedRoute, idx: number) => {
    if (!onAddGeneratedRoutes) return;
    onAddGeneratedRoutes([{
      method: route.method,
      path: route.path,
      statusCode: route.statusCode,
      body: route.body,
      headers: { 'Content-Type': 'application/json' },
      delay: 0,
      enabled: true,
    }]);
    setAddedIds(prev => new Set(prev).add(idx));
  }, [onAddGeneratedRoutes]);

  const handleAddAll = useCallback(() => {
    if (!onAddGeneratedRoutes || parsedRoutes.length === 0) return;
    onAddGeneratedRoutes(parsedRoutes.map(r => ({
      method: r.method,
      path: r.path,
      statusCode: r.statusCode,
      body: r.body,
      headers: { 'Content-Type': 'application/json' },
      delay: 0,
      enabled: true,
    })));
    setAddedAll(true);
    setAddedIds(new Set(parsedRoutes.map((_, i) => i)));
  }, [onAddGeneratedRoutes, parsedRoutes]);

  // ── Generic item handlers ───────────────────────────────────────────────────

  const handleAddOneItem = useCallback((item: ParsedGenericItem, idx: number) => {
    if (!onAddGeneratedItems) return;
    onAddGeneratedItems([item]);
    setAddedItemIds(prev => new Set(prev).add(idx));
  }, [onAddGeneratedItems]);

  const handleAddAllItems = useCallback(() => {
    if (!onAddGeneratedItems || parsedItems.length === 0) return;
    onAddGeneratedItems(parsedItems);
    setAddedAllItems(true);
    setAddedItemIds(new Set(parsedItems.map((_, i) => i)));
  }, [onAddGeneratedItems, parsedItems]);

  const handleCopySdl = useCallback(() => {
    if (!detectedSdl) return;
    navigator.clipboard.writeText(detectedSdl).then(() => {
      setSdlCopied(true);
      setTimeout(() => setSdlCopied(false), 2000);
    });
  }, [detectedSdl]);

  const modal = (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={(e) => {
        // Backdrop click does NOT close — only X button closes (per modal rules)
        e.stopPropagation();
      }}
    >
      {/* Snake glow wrapper — rotating conic-gradient border while streaming */}
      <div
        style={{
          position: 'relative',
          borderRadius: '13px',
          padding: streaming ? '1.5px' : '0',
          overflow: 'hidden',
          flexShrink: 0,
          maxWidth: '94vw',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {streaming && (
          <div
            style={{
              position: 'absolute',
              inset: '-50%',
              background: `conic-gradient(${ACCENT} 0deg, color-mix(in srgb, ${ACCENT} 15%, transparent) 40deg, color-mix(in srgb, ${ACCENT} 15%, transparent) 320deg, ${ACCENT} 360deg)`,
              animation: 'ai-snake-spin 2s linear infinite',
            }}
          />
        )}
      <div
        className="flex flex-col rounded-xl border shadow-2xl overflow-hidden"
        style={{
          position: 'relative',
          zIndex: 1,
          width: 850,
          maxWidth: '94vw',
          maxHeight: '90vh',
          minHeight: 200,
          backgroundColor: 'var(--color-surface)',
          borderColor: streaming ? 'transparent' : `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`,
          boxShadow: `0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px color-mix(in srgb, ${ACCENT} 15%, transparent)`,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-2.5 border-b flex-shrink-0"
          style={{
            borderColor: `color-mix(in srgb, ${ACCENT} 15%, var(--color-surface-border))`,
            backgroundColor: `color-mix(in srgb, ${ACCENT} 6%, var(--color-surface))`,
          }}
        >
          <SparkleIcon size={13} style={{ color: ACCENT }} />
          <span className="text-[12px] font-semibold flex-1" style={{ color: ACCENT }}>
            ✨ Generate {title}
          </span>

          {/* Streaming dots */}
          {streaming && !error && (
            <div className="flex gap-0.5 mr-1">
              {[0, 100, 200].map(d => (
                <span
                  key={d}
                  className="w-[4px] h-[4px] rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }}
                />
              ))}
            </div>
          )}

          {/* Regenerate (header shortcut) — only when done */}
          {!streaming && !error && text && (
            <>
              <button
                type="button"
                onClick={() => setIsIdle(true)}
                title="Refine description & regenerate"
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors opacity-50 hover:opacity-100"
                style={{ color: ACCENT }}
              >
                Refine
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                title="Regenerate"
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors opacity-50 hover:opacity-100"
                style={{ color: ACCENT }}
              >
                <RefreshIcon size={10} />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-[22px] h-[22px] flex items-center justify-center rounded cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
          >
            <CloseIcon size={12} />
          </button>
        </div>

        {/* ── Idle state: natural language OR URL/Spec (4.4.1 + 4.4.2) ─── */}
        {isIdle && (
          <div className="px-4 py-4 flex flex-col gap-3 flex-shrink-0">
            {/* Mode tabs */}
            <div className="flex gap-1 border-b" style={{ borderColor: `color-mix(in srgb, ${ACCENT} 15%, var(--color-surface-border))` }}>
              {(['describe', 'url-spec'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setIdleMode(m)}
                  className="px-3 py-1.5 text-[11px] font-medium cursor-pointer transition-colors rounded-t"
                  style={idleMode === m
                    ? { color: ACCENT, borderBottom: `2px solid ${ACCENT}`, marginBottom: '-1px' }
                    : { color: 'var(--color-text-muted)' }}
                >
                  {m === 'describe' ? '✏️ Describe' : '📄 URL / Spec'}
                </button>
              ))}
            </div>

            {idleMode === 'describe' && (
              <div>
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  Describe what you want to generate{' '}
                  <span className="text-[10px] font-normal italic" style={{ color: 'var(--color-text-muted)' }}>(optional — uses server name "{serverName}" if empty)</span>
                </label>
                <textarea
                  autoFocus
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
                  placeholder={`Examples:\n• "Todo API with CRUD: create, read, update, delete, mark complete"\n• "User auth with JWT login, refresh token, logout, profile"\n• "E-commerce with products, orders, cart, checkout"`}
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg text-[12px] font-mono resize-none outline-none"
                  style={{
                    backgroundColor: 'var(--color-input-bg)',
                    borderColor: `color-mix(in srgb, ${ACCENT} 30%, var(--color-input-border))`,
                    border: '1px solid',
                    color: 'var(--color-text-primary)',
                  }}
                />
                <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>⌘↵ to generate</p>
              </div>
            )}

            {idleMode === 'url-spec' && (
              <div className="flex flex-col gap-2">
                {/* URL vs Paste sub-toggle */}
                <div className="flex gap-2">
                  {(['url', 'paste'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setUrlInputMode(m); setSpecError(''); }}
                      className="px-2.5 py-1 text-[10px] rounded cursor-pointer transition-colors border"
                      style={urlInputMode === m
                        ? { backgroundColor: `color-mix(in srgb, ${ACCENT} 12%, transparent)`, color: ACCENT, borderColor: `color-mix(in srgb, ${ACCENT} 35%, transparent)` }
                        : { color: 'var(--color-text-muted)', borderColor: 'var(--color-surface-border)' }}
                    >
                      {m === 'url' ? '🔗 URL' : '📋 Paste Spec'}
                    </button>
                  ))}
                </div>
                {urlInputMode === 'url' && (
                  <input
                    autoFocus
                    type="url"
                    value={specUrl}
                    onChange={e => { setSpecUrl(e.target.value); setSpecError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleFetchAndGenerate(); }}
                    placeholder="https://petstore.swagger.io/v2/swagger.json"
                    className="w-full px-3 py-2 rounded-lg text-[12px] font-mono outline-none"
                    style={{
                      backgroundColor: 'var(--color-input-bg)',
                      border: '1px solid',
                      borderColor: `color-mix(in srgb, ${ACCENT} 30%, var(--color-input-border))`,
                      color: 'var(--color-text-primary)',
                    }}
                  />
                )}
                {urlInputMode === 'paste' && (
                  <textarea
                    autoFocus
                    value={specPaste}
                    onChange={e => { setSpecPaste(e.target.value); setSpecError(''); }}
                    placeholder={`Paste OpenAPI JSON/YAML or a sample JSON response:\n{\n  "openapi": "3.0.0",\n  "info": {...},\n  "paths": {...}\n}`}
                    rows={6}
                    className="w-full px-3 py-2 rounded-lg text-[12px] font-mono resize-none outline-none"
                    style={{
                      backgroundColor: 'var(--color-input-bg)',
                      border: '1px solid',
                      borderColor: `color-mix(in srgb, ${ACCENT} 30%, var(--color-input-border))`,
                      color: 'var(--color-text-primary)',
                    }}
                  />
                )}
                {specError && (
                  <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{specError}</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={idleMode === 'describe' ? handleGenerate : handleFetchAndGenerate}
                disabled={specFetching}
                className="h-[30px] px-4 text-[12px] font-medium rounded-lg text-white cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: ACCENT }}
              >
                {specFetching ? 'Fetching spec…' : '✨ Generate'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-[30px] px-3 text-[12px] rounded-lg cursor-pointer transition-colors"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Thinking placeholder */}
        {streaming && !text && !error && (
          <div className="px-4 py-3 text-[11px] italic flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
            Generating {title.toLowerCase()} for <span className="font-medium" style={{ color: ACCENT }}>{serverName}</span>…
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="px-4 py-3 flex items-start gap-2 flex-shrink-0">
            <span className="text-[11px] flex-1" style={{ color: 'var(--color-error)' }}>⚠️ {error}</span>
            <button
              type="button"
              onClick={handleRegenerate}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded cursor-pointer border flex-shrink-0"
              style={{ color: ACCENT, borderColor: `color-mix(in srgb, ${ACCENT} 30%, transparent)` }}
            >
              <RefreshIcon size={9} /> Retry
            </button>
          </div>
        )}

        {/* Scrollable content area — markdown only, items are fixed below */}
        {text && (
          <div ref={scrollRef} className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
            <div className="px-4 py-3">
              <MdViewer content={text} />
              {streaming && (
                <span
                  className="inline-block w-[2px] h-[13px] ml-0.5 animate-pulse align-text-bottom"
                  style={{ backgroundColor: ACCENT }}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Detected REST Routes — fixed bottom section ─────────────────────── */}
        {!streaming && parsedRoutes.length > 0 && onAddGeneratedRoutes && text && (
          <div
            className="flex-shrink-0 border-t flex flex-col"
            style={{
              maxHeight: 224,
              borderColor: `color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))`,
              backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-surface))`,
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-2 px-3 py-2 border-b text-[10.5px] font-semibold flex-shrink-0"
              style={{
                backgroundColor: `color-mix(in srgb, ${ACCENT} 7%, var(--color-surface))`,
                borderColor: `color-mix(in srgb, ${ACCENT} 15%, var(--color-surface-border))`,
                color: ACCENT,
              }}
            >
              <SparkleIcon size={10} style={{ color: ACCENT }} />
              Detected Routes ({parsedRoutes.length}) — click to add individually or use "Add All" below
            </div>

            {/* Route cards */}
            <div className="overflow-y-auto divide-y [scrollbar-gutter:stable]" style={{ borderColor: 'var(--color-surface-border)' }}>
              {parsedRoutes.map((route, idx) => {
                const isAdded = addedIds.has(idx);
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 px-3 py-2"
                    style={{ backgroundColor: isAdded ? 'color-mix(in srgb, var(--color-success) 5%, transparent)' : 'transparent' }}
                  >
                    <span
                      className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{
                        color: METHOD_COLORS[route.method],
                        backgroundColor: `color-mix(in srgb, ${METHOD_COLORS[route.method]} 12%, transparent)`,
                      }}
                    >
                      {route.method}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--color-text-primary)] flex-shrink-0">
                      {route.path}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0">
                      {route.statusCode}
                    </span>
                    <span className="text-[11px] text-[var(--color-text-muted)] flex-1 truncate">
                      {route.name}
                    </span>
                    {isAdded ? (
                      <span className="text-[10px] px-2 py-0.5 rounded flex-shrink-0" style={{ color: 'var(--color-success)' }}>
                        ✓ Added
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddOne(route, idx)}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors flex-shrink-0 border"
                        style={{
                          color: ACCENT,
                          borderColor: `color-mix(in srgb, ${ACCENT} 25%, transparent)`,
                          backgroundColor: `color-mix(in srgb, ${ACCENT} 5%, transparent)`,
                        }}
                      >
                        <PlusIcon size={9} />
                        Add Route
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Detected Generic Items (non-REST protocols) — fixed bottom section ─ */}
        {!streaming && parsedItems.length > 0 && onAddGeneratedItems && text && flavor && (
          <div
            className="flex-shrink-0 border-t flex flex-col"
            style={{
              maxHeight: 224,
              borderColor: `color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))`,
              backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-surface))`,
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-2 px-3 py-2 border-b text-[10.5px] font-semibold flex-shrink-0"
              style={{
                backgroundColor: `color-mix(in srgb, ${ACCENT} 7%, var(--color-surface))`,
                borderColor: `color-mix(in srgb, ${ACCENT} 15%, var(--color-surface-border))`,
                color: ACCENT,
              }}
            >
              <SparkleIcon size={10} style={{ color: ACCENT }} />
              Detected {flavor.itemLabelPlural} ({parsedItems.length}) — click to add individually or use "Add All" below
            </div>

            {/* Item rows */}
            <div className="overflow-y-auto divide-y [scrollbar-gutter:stable]" style={{ borderColor: 'var(--color-surface-border)' }}>
              {parsedItems.map((item, idx) => {
                const isAdded = addedItemIds.has(idx);
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 px-3 py-2"
                    style={{ backgroundColor: isAdded ? 'color-mix(in srgb, var(--color-success) 5%, transparent)' : 'transparent' }}
                  >
                    {item.detail && (
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{
                          color: ACCENT,
                          backgroundColor: `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
                        }}
                      >
                        {item.detail}
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-[var(--color-text-primary)] flex-1 truncate">
                      {item.name}
                    </span>
                    {isAdded ? (
                      <span className="text-[10px] px-2 py-0.5 rounded flex-shrink-0" style={{ color: 'var(--color-success)' }}>
                        ✓ Added
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddOneItem(item, idx)}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors flex-shrink-0 border"
                        style={{
                          color: ACCENT,
                          borderColor: `color-mix(in srgb, ${ACCENT} 25%, transparent)`,
                          backgroundColor: `color-mix(in srgb, ${ACCENT} 5%, transparent)`,
                        }}
                      >
                        {!flavor.addButtonLabel && <PlusIcon size={9} />}
                        {flavor.addButtonLabel ? flavor.addButtonLabel(item) : `Add ${flavor.itemLabel}`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer — after streaming completes */}
        {!streaming && !error && text && (
          <div
            className="flex items-center gap-2 px-4 py-2.5 border-t flex-shrink-0"
            style={{ borderColor: 'var(--color-surface-border)' }}
          >
            <button
              type="button"
              onClick={handleRegenerate}
              className="flex items-center gap-1.5 text-[10.5px] cursor-pointer transition-opacity opacity-50 hover:opacity-100"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <RefreshIcon size={10} />
              Regenerate
            </button>

            <div className="flex-1" />

            {/* Copy SDL — GraphQL only */}
            {detectedSdl && (
              <button
                type="button"
                onClick={handleCopySdl}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md cursor-pointer transition-colors font-medium"
                style={{
                  backgroundColor: sdlCopied
                    ? 'color-mix(in srgb, var(--color-success) 12%, transparent)'
                    : 'color-mix(in srgb, var(--color-protocol-graphql, #ec4899) 10%, transparent)',
                  color: sdlCopied ? 'var(--color-success)' : 'var(--color-protocol-graphql, #ec4899)',
                  border: `1px solid ${sdlCopied ? 'color-mix(in srgb, var(--color-success) 30%, transparent)' : 'color-mix(in srgb, var(--color-protocol-graphql, #ec4899) 30%, transparent)'}`,
                }}
              >
                {sdlCopied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
                {sdlCopied ? 'SDL Copied!' : 'Copy SDL'}
              </button>
            )}

            {/* Add all generated REST routes */}
            {onAddGeneratedRoutes && parsedRoutes.length > 0 && (
              <button
                type="button"
                onClick={handleAddAll}
                disabled={addedAll}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md cursor-pointer transition-colors font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: addedAll
                    ? 'color-mix(in srgb, var(--color-success) 12%, transparent)'
                    : `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
                  color: addedAll ? 'var(--color-success)' : ACCENT,
                  border: `1px solid ${addedAll ? 'color-mix(in srgb, var(--color-success) 30%, transparent)' : `color-mix(in srgb, ${ACCENT} 30%, transparent)`}`,
                }}
              >
                <PlusIcon size={11} />
                {addedAll ? `✓ All ${parsedRoutes.length} Routes Added` : `Add All Generated Routes (${parsedRoutes.length})`}
              </button>
            )}

            {/* Add all generated items (non-REST protocols) */}
            {onAddGeneratedItems && parsedItems.length > 0 && flavor && (
              <button
                type="button"
                onClick={handleAddAllItems}
                disabled={addedAllItems}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md cursor-pointer transition-colors font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: addedAllItems
                    ? 'color-mix(in srgb, var(--color-success) 12%, transparent)'
                    : `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
                  color: addedAllItems ? 'var(--color-success)' : ACCENT,
                  border: `1px solid ${addedAllItems ? 'color-mix(in srgb, var(--color-success) 30%, transparent)' : `color-mix(in srgb, ${ACCENT} 30%, transparent)`}`,
                }}
              >
                <PlusIcon size={11} />
                {addedAllItems
                  ? `✓ All ${parsedItems.length} ${flavor.itemLabelPlural} Added`
                  : `Add All ${flavor.itemLabelPlural} (${parsedItems.length})`}
              </button>
            )}
          </div>
        )}
      </div>
      </div> {/* ── end snake glow wrapper ── */}
    </div>
  );

  return createPortal(modal, document.body);
}

// ─── Trigger Button + Popover Shell ──────────────────────────────────────────

interface MockAiGenerateButtonProps {
  templateKey: AiPromptTemplateKey;
  title: string;
  serverName: string;
  serverContext?: string;
  /** Accent CSS variable for the protocol (default: --color-mock-server) */
  accentVar?: string;
  /** Only for REST — adds parsed routes to the server */
  onAddGeneratedRoutes?: (routes: Partial<MockRoute>[]) => void;
  /** For non-REST protocols — adds parsed generic items */
  onAddGeneratedItems?: (items: ParsedGenericItem[]) => void;
}

export function MockAiGenerateButton({
  templateKey,
  title,
  serverName,
  serverContext,
  accentVar = ACCENT,
  onAddGeneratedRoutes,
  onAddGeneratedItems,
}: MockAiGenerateButtonProps) {
  const [open, setOpen] = useState(false);
  const mockAiEnabled = useAiFeaturesStore(s => s.isEnabled('mockAiGenerate'));

  // Gated by mockAiGenerate feature flag — hides button completely when disabled
  if (!mockAiEnabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className="h-[28px] px-2.5 text-[10px] rounded-md border cursor-pointer transition-colors"
        style={{
          color: accentVar,
          borderColor: `color-mix(in srgb, ${accentVar} 25%, transparent)`,
          backgroundColor: open ? `color-mix(in srgb, ${accentVar} 10%, transparent)` : 'transparent',
        }}
        title="Generate with AI"
      >
        ✨ Generate with AI
      </button>

      {open && (
        <MockAiGeneratePopover
          templateKey={templateKey}
          title={title}
          serverName={serverName}
          serverContext={serverContext}
          onClose={() => setOpen(false)}
          onAddGeneratedRoutes={onAddGeneratedRoutes}
          onAddGeneratedItems={onAddGeneratedItems}
        />
      )}
    </>
  );
}
