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
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { useTabsStore } from '../../store/tabs-store';
import { useAiPromptTemplatesStore, type AiPromptTemplateKey } from '../../store/prompt-template';
import { SparkleIcon, RefreshIcon, PlusIcon, CopyIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';
import type { MockRoute, HttpMethod } from './mock-types';
import { useAiFeaturesStore } from '../../store/ai-features-store';
import { AIButtonView, EditorView, MultilineInputView, TextInputView, ButtonView, IconButtonView, ModalView, TabView, type EditorLanguage } from '@salilvnair/dui';
import { logUiEvent } from '../../store/ui-audit-store';

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

// ─── Per-protocol idle-form config ───────────────────────────────────────────

interface IdleFormConfig {
  describePlaceholder: string;
  chips: string[];
  spec?: {
    tabLabel: string;
    hasUrl: boolean;
    urlPlaceholder?: string;
    urlError?: string;
    contextPrefixUrl?: string;
    pasteLabel: string;
    pastePlaceholder: string;
    contextPrefixPaste: string;
    pasteLanguage?: EditorLanguage;
  };
}

const PROTOCOL_IDLE: Record<string, IdleFormConfig> = {
  rest: {
    describePlaceholder: `Examples:\n• "Todo API with CRUD: create, read, update, delete, mark complete"\n• "User auth with JWT login, refresh token, logout, profile"\n• "E-commerce with products, orders, cart, checkout"`,
    chips: ['Todo / Task API', 'User Auth + JWT', 'E-commerce Catalog', 'Blog + Comments', 'Inventory CRUD'],
    spec: {
      tabLabel: 'URL / Spec', hasUrl: true,
      urlPlaceholder: 'https://petstore.swagger.io/v2/swagger.json',
      urlError: 'Enter an OpenAPI spec URL.',
      contextPrefixUrl: 'OpenAPI/Swagger spec fetched from',
      pasteLabel: '📋 Paste Spec',
      pastePlaceholder: `Paste OpenAPI JSON/YAML or a sample JSON response:\n{\n  "openapi": "3.0.0",\n  "info": {...},\n  "paths": {...}\n}`,
      contextPrefixPaste: 'User-pasted spec / JSON sample',
      pasteLanguage: 'yaml',
    },
  },
  graphql: {
    describePlaceholder: `Examples:\n• "Social platform: users, posts, comments, likes — queries & mutations"\n• "E-commerce: products, cart, orders, reviews with subscriptions"\n• "Blog CMS: articles, authors, tags, categories"`,
    chips: ['Social Platform', 'E-commerce Schema', 'Blog CMS', 'Auth + Roles', 'Real-time Subscriptions'],
    spec: {
      tabLabel: 'SDL', hasUrl: false,
      pasteLabel: '📋 Paste SDL',
      pastePlaceholder: `type Query {\n  user(id: ID!): User\n  users: [User!]!\n}\ntype Mutation {\n  createUser(name: String!, email: String!): User!\n}\ntype User { id: ID!, name: String!, email: String! }`,
      contextPrefixPaste: 'GraphQL SDL definition',
      pasteLanguage: 'graphql',
    },
  },
  grpc: {
    describePlaceholder: `Examples:\n• "UserService: GetUser, ListUsers, CreateUser, UpdateUser, DeleteUser"\n• "PaymentService: Charge, Refund, GetTransaction (unary + server-streaming)"\n• "NotificationService: Subscribe — bidirectional stream"`,
    chips: ['User Service', 'Payment Service', 'Notification Service', 'Auth Service', 'File Transfer'],
    spec: {
      tabLabel: 'Proto File', hasUrl: false,
      pasteLabel: '📋 Paste .proto',
      pastePlaceholder: `syntax = "proto3";\n\npackage users;\n\nservice UserService {\n  rpc GetUser (GetUserRequest) returns (User);\n  rpc ListUsers (ListUsersRequest) returns (ListUsersResponse);\n}\n\nmessage User { string id = 1; string name = 2; string email = 3; }`,
      contextPrefixPaste: 'Protocol Buffer definition',
      pasteLanguage: 'proto',
    },
  },
  soap: {
    describePlaceholder: `Examples:\n• "BankingService: GetBalance, Transfer, GetStatement operations with SOAP faults"\n• "WeatherService: GetForecast, GetCurrentConditions, GetAlerts"\n• "AuthService: Login, Logout, ValidateToken, RefreshToken"`,
    chips: ['Banking Service', 'Weather Service', 'Auth Service', 'Shipping Service', 'Payment Gateway'],
    spec: {
      tabLabel: 'WSDL', hasUrl: true,
      urlPlaceholder: 'http://www.dneonline.com/calculator.asmx?WSDL',
      urlError: 'Enter a WSDL URL.',
      contextPrefixUrl: 'WSDL fetched from',
      pasteLabel: '📋 Paste WSDL',
      pastePlaceholder: `<?xml version="1.0" encoding="UTF-8"?>\n<definitions name="MyService"\n  xmlns="http://schemas.xmlsoap.org/wsdl/"\n  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/">\n  <!-- paste your WSDL here -->\n</definitions>`,
      contextPrefixPaste: 'WSDL definition',
      pasteLanguage: 'xml',
    },
  },
  websocket: {
    describePlaceholder: `Examples:\n• "Chat app: connection welcome, send/broadcast message, typing indicator, user join/leave, disconnect"\n• "Live dashboard: subscribe to metrics channel, push data every second, unsubscribe"\n• "Multiplayer game: join room, player-move, shoot, game-state update, player-disconnect"`,
    chips: ['Chat App', 'Live Dashboard', 'Multiplayer Game', 'Push Notifications', 'Collaborative Editor'],
  },
  sse: {
    describePlaceholder: `Examples:\n• "Stock prices: push symbol, price, change% every 2 seconds for a watchlist"\n• "Order lifecycle: pending → processing → shipped → delivered with timestamps"\n• "System metrics: CPU, memory, disk, network every 5 seconds"`,
    chips: ['Stock Prices', 'Order Status', 'System Metrics', 'News Feed', 'Sports Live Scores'],
  },
  socketio: {
    describePlaceholder: `Examples:\n• "Chat rooms: join/leave room, send message, typing indicator, read receipts"\n• "Collaborative whiteboard: draw stroke, erase, cursor-move, clear-canvas"\n• "Game lobby: create-game, join, player-ready, start, game-over, leaderboard"`,
    chips: ['Chat Rooms', 'Live Collaboration', 'Game Lobby', 'Real-time Voting', 'Notification System'],
  },
  mqtt: {
    describePlaceholder: `Examples:\n• "IoT sensor suite: temperature, humidity, motion, door sensors on home/sensor/+ topics every 30s"\n• "Home automation: lights/thermostat/locks on command and status topics with retain"\n• "Fleet tracking: GPS position, fuel level, speed on vehicles/{id}/telemetry"`,
    chips: ['IoT Sensors', 'Home Automation', 'Fleet Tracking', 'Industrial Monitor', 'Smart Energy'],
  },
  mcp: {
    describePlaceholder: `Examples:\n• "File system tools: read_file, write_file, list_directory, delete_file, move_file"\n• "Database tools: sql_query, insert_row, update_row, delete_row, describe_schema"\n• "Web tools: fetch_url, search_web, take_screenshot, parse_html, extract_links"`,
    chips: ['File System Tools', 'Database Tools', 'Web Scraping Tools', 'Code Execution', 'API Integration'],
  },
  ai: {
    describePlaceholder: `Examples:\n• "Chat completion endpoint with streaming, system prompt, conversation history, token usage"\n• "Embeddings API returning float arrays for text inputs"\n• "Function calling with tool definitions, tool-call responses, and tool results"`,
    chips: ['Chat Completion', 'Streaming Responses', 'Embeddings', 'Function Calling', 'Vision API'],
  },
};

function getProtocolFromKey(templateKey: string): string {
  const m = templateKey.match(/^mock\.(\w+)\.generate$/);
  return m?.[1] ?? 'rest';
}

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

  // Per-protocol idle form config
  const protocol = getProtocolFromKey(templateKey);
  const idleCfg: IdleFormConfig = PROTOCOL_IDLE[protocol] ?? PROTOCOL_IDLE.rest!;

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
        `${idleCfg.spec?.contextPrefixUrl ?? 'Spec fetched from'} ${specUrl}:\n\n${content.slice(0, 8000)}`
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
    const isUrlMode = (idleCfg.spec?.hasUrl ?? false) && urlInputMode === 'url';
    if (isUrlMode) {
      if (!specUrl.trim()) { setSpecError(idleCfg.spec?.urlError ?? 'Enter a spec URL.'); return; }
      setSpecFetching(true);
      const reqId = `spec-fetch-${Date.now()}`;
      fetchReqIdRef.current = reqId;
      postMsg({ type: 'fetchUrl', reqId, url: specUrl.trim() });
    } else {
      // Paste mode
      if (!specPaste.trim()) { setSpecError(`Paste your ${idleCfg.spec?.tabLabel ?? 'spec'} content.`); return; }
      triggerGenerateWithContext(`${idleCfg.spec?.contextPrefixPaste ?? 'Spec'}:\n\n${specPaste.slice(0, 8000)}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlInputMode, specUrl, specPaste, triggerGenerateWithContext]);

  /** Triggered by the "Generate" button in idle state — starts AI generation */
  const handleGenerate = useCallback(() => {
    logUiEvent('mock.ai_generate', { cacheKey });
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
    logUiEvent('mock.ai_regen', { cacheKey });
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
    logUiEvent('mock.ai_add_one', { method: route.method, path: route.path, idx });
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
    logUiEvent('mock.ai_add_all', { count: parsedRoutes.length });
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
    logUiEvent('mock.ai_add_one', { name: item.name, idx });
    onAddGeneratedItems([item]);
    setAddedItemIds(prev => new Set(prev).add(idx));
  }, [onAddGeneratedItems]);

  const handleAddAllItems = useCallback(() => {
    if (!onAddGeneratedItems || parsedItems.length === 0) return;
    logUiEvent('mock.ai_add_all', { count: parsedItems.length });
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

  // ── Header right: streaming dots OR refine+regenerate ──────────────────────
  const headerRight = (
    <>
      {streaming && !error && (
        <div className="flex gap-[3px] items-center mr-1">
          {[0, 120, 240].map(d => (
            <span
              key={d}
              className="w-[5px] h-[5px] rounded-full animate-pulse"
              style={{ backgroundColor: ACCENT, animationDelay: `${d}ms`, opacity: 0.85 }}
            />
          ))}
        </div>
      )}
      {!streaming && !error && text && (
        <div className="flex items-center gap-1">
          <ButtonView size="sm" variant="ghost" accentColor={ACCENT} onClick={() => setIsIdle(true)} title="Edit description and regenerate">
            Refine
          </ButtonView>
          <IconButtonView size="xs" icon={<RefreshIcon size={10} />} accentColor={ACCENT} onClick={handleRegenerate} title="Regenerate" />
        </div>
      )}
    </>
  );

  // ── Footer left: regenerate / retry ─────────────────────────────────────────
  const footerLeft = error ? (
    <ButtonView size="md" variant="ghost" accentColor="var(--color-error)" iconLeft={<RefreshIcon size={11} />} onClick={handleRegenerate}>
      Retry
    </ButtonView>
  ) : (!streaming && !error && text) ? (
    <ButtonView size="md" variant="ghost" accentColor="var(--color-text-muted)" iconLeft={<RefreshIcon size={11} />} onClick={handleRegenerate}>
      Regenerate
    </ButtonView>
  ) : undefined;

  // ── Footer right: generate (idle) | add-all + copy-sdl (done) ───────────────
  const footerRight = isIdle ? (
    <ButtonView size="md" accentColor={ACCENT} disabled={specFetching} onClick={idleMode === 'describe' ? handleGenerate : handleFetchAndGenerate}>
      {specFetching ? 'Fetching…' : '✨ Generate'}
    </ButtonView>
  ) : (!streaming && !error && text) ? (
    <div className="flex items-center gap-2">
      {detectedSdl && (
        <ButtonView
          size="md"
          variant="ghost"
          accentColor={sdlCopied ? 'var(--color-success)' : 'var(--color-protocol-graphql, #ec4899)'}
          iconLeft={sdlCopied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
          onClick={handleCopySdl}
        >
          {sdlCopied ? 'SDL Copied!' : 'Copy SDL'}
        </ButtonView>
      )}
      {onAddGeneratedRoutes && parsedRoutes.length > 0 && (
        <ButtonView
          size="md"
          variant="ghost"
          accentColor={addedAll ? 'var(--color-success)' : ACCENT}
          disabled={addedAll}
          iconLeft={<PlusIcon size={11} />}
          onClick={handleAddAll}
        >
          {addedAll ? `✓ All ${parsedRoutes.length} Routes Added` : `Add All Routes (${parsedRoutes.length})`}
        </ButtonView>
      )}
      {onAddGeneratedItems && parsedItems.length > 0 && flavor && (
        <ButtonView
          size="md"
          variant="ghost"
          accentColor={addedAllItems ? 'var(--color-success)' : ACCENT}
          disabled={addedAllItems}
          iconLeft={<PlusIcon size={11} />}
          onClick={handleAddAllItems}
        >
          {addedAllItems
            ? `✓ All ${parsedItems.length} ${flavor.itemLabelPlural} Added`
            : `Add All ${flavor.itemLabelPlural} (${parsedItems.length})`}
        </ButtonView>
      )}
    </div>
  ) : undefined;

  return (
    <ModalView
      open={true}
      onClose={onClose}
      size="xl"
      maxHeight="60vh"
      bodyStyle={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      headerColor={ACCENT}
      headerGradient
      headerIcon={<SparkleIcon size={14} style={{ color: ACCENT }} />}
      title={`✨ Generate ${title}`}
      headerRight={headerRight}
      footerLeft={footerLeft}
      footerRight={footerRight}
      noPadding
    >
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Idle: describe mode or spec input ─────────────────────────── */}
        {isIdle && (
          <div className="px-5 py-4 flex flex-col gap-3 flex-shrink-0">

            {/* Mode tabs — only for protocols that have a spec format */}
            {idleCfg.spec && (
              <TabView
                tabs={[
                  { id: 'describe', label: '✏️ Describe' },
                  { id: 'url-spec', label: `📄 ${idleCfg.spec.tabLabel}` },
                ]}
                activeTab={idleMode}
                onChange={(id) => setIdleMode(id as 'describe' | 'url-spec')}
                variant="underline"
                size="sm"
                accentColor={ACCENT}
              />
            )}

            {/* Describe mode */}
            {idleMode === 'describe' && (
              <div className="flex flex-col gap-2.5">
                <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Describe what you want to generate{' '}
                  <span className="text-[10px] font-normal italic" style={{ color: 'var(--color-text-muted)' }}>
                    (uses server name "{serverName}" if empty)
                  </span>
                </label>

                {/* Quick chips */}
                <div className="flex flex-wrap gap-1.5">
                  {idleCfg.chips.map(chip => (
                    <ButtonView
                      key={chip}
                      size="xs"
                      borderRadius={9999}
                      accentColor={description === chip ? ACCENT : undefined}
                      onClick={() => setDescription(d => d === chip ? '' : chip)}
                      style={{
                        border: `1px solid ${description === chip ? `color-mix(in srgb, ${ACCENT} 40%, transparent)` : 'var(--color-surface-border)'}`,
                        background: description === chip ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : 'transparent',
                      }}
                    >
                      {chip}
                    </ButtonView>
                  ))}
                </div>

                <MultilineInputView
                  autoFocus
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
                  placeholder={idleCfg.describePlaceholder}
                  rows={4}
                  size="md"
                  style={{ fontFamily: 'monospace' }}
                />
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>⌘↵ to generate</p>
              </div>
            )}

            {/* Spec mode */}
            {idleMode === 'url-spec' && idleCfg.spec && (
              <div className="flex flex-col gap-2.5">
                {idleCfg.spec.hasUrl && (
                  <TabView
                    tabs={[
                      { id: 'url', label: '🔗 URL' },
                      { id: 'paste', label: idleCfg.spec.pasteLabel },
                    ]}
                    activeTab={urlInputMode}
                    onChange={(id) => { setUrlInputMode(id as 'url' | 'paste'); setSpecError(''); }}
                    variant="chip"
                    size="xs"
                    accentColor={ACCENT}
                  />
                )}

                {idleCfg.spec.hasUrl && urlInputMode === 'url' && (
                  <TextInputView
                    autoFocus
                    type="url"
                    value={specUrl}
                    onChange={e => { setSpecUrl(e.target.value); setSpecError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleFetchAndGenerate(); }}
                    placeholder={idleCfg.spec.urlPlaceholder}
                    size="md"
                    style={{ fontFamily: 'monospace' }}
                  />
                )}

                {(!idleCfg.spec.hasUrl || urlInputMode === 'paste') && (
                  <EditorView
                    value={specPaste}
                    onChange={(val) => { setSpecPaste(val); setSpecError(''); }}
                    language={idleCfg.spec.pasteLanguage ?? 'plaintext'}
                    placeholder={idleCfg.spec.pastePlaceholder}
                    height={160}
                  />
                )}

                {specError && (
                  <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{specError}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Thinking placeholder */}
        {streaming && !text && !error && (
          <div className="px-5 py-4 flex-shrink-0 text-[11px] italic" style={{ color: 'var(--color-text-muted)' }}>
            Generating {title.toLowerCase()} for{' '}
            <span className="font-medium not-italic" style={{ color: ACCENT }}>{serverName}</span>…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-5 py-4 flex-shrink-0">
            <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>⚠️ {error}</p>
          </div>
        )}

        {/* Scrollable markdown */}
        {text && (
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto [scrollbar-gutter:stable]"
            style={{ minHeight: 0 }}
          >
            <div className="px-5 py-4">
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

        {/* Detected REST routes — pinned bottom panel with own scroll */}
        {!streaming && parsedRoutes.length > 0 && onAddGeneratedRoutes && text && (
          <div
            className="flex-shrink-0 border-t flex flex-col"
            style={{
              maxHeight: 210,
              borderColor: `color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))`,
              background: `color-mix(in srgb, ${ACCENT} 3%, var(--color-surface))`,
            }}
          >
            <div
              className="flex items-center gap-2 px-4 py-2 border-b text-[10.5px] font-semibold flex-shrink-0"
              style={{
                background: `color-mix(in srgb, ${ACCENT} 7%, var(--color-surface))`,
                borderColor: `color-mix(in srgb, ${ACCENT} 15%, var(--color-surface-border))`,
                color: ACCENT,
              }}
            >
              <SparkleIcon size={10} style={{ color: ACCENT }} />
              Detected Routes ({parsedRoutes.length}) — click row to add
            </div>
            <div className="overflow-y-auto divide-y [scrollbar-gutter:stable]" style={{ borderColor: 'var(--color-surface-border)' }}>
              {parsedRoutes.map((route, idx) => {
                const isAdded = addedIds.has(idx);
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 px-4 py-2"
                    style={{ background: isAdded ? 'color-mix(in srgb, var(--color-success) 5%, transparent)' : 'transparent' }}
                  >
                    <span
                      className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{
                        color: METHOD_COLORS[route.method],
                        background: `color-mix(in srgb, ${METHOD_COLORS[route.method]} 12%, transparent)`,
                      }}
                    >
                      {route.method}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--color-text-primary)] flex-shrink-0">{route.path}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0">{route.statusCode}</span>
                    <span className="text-[11px] text-[var(--color-text-muted)] flex-1 truncate">{route.name}</span>
                    {isAdded ? (
                      <span className="text-[10px] flex-shrink-0 font-medium" style={{ color: 'var(--color-success)' }}>✓ Added</span>
                    ) : (
                      <ButtonView size="sm" variant="ghost" accentColor={ACCENT} iconLeft={<PlusIcon size={9} />} onClick={() => handleAddOne(route, idx)}>
                        Add Route
                      </ButtonView>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Detected generic items (non-REST) — pinned bottom panel */}
        {!streaming && parsedItems.length > 0 && onAddGeneratedItems && text && flavor && (
          <div
            className="flex-shrink-0 border-t flex flex-col"
            style={{
              maxHeight: 210,
              borderColor: `color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))`,
              background: `color-mix(in srgb, ${ACCENT} 3%, var(--color-surface))`,
            }}
          >
            <div
              className="flex items-center gap-2 px-4 py-2 border-b text-[10.5px] font-semibold flex-shrink-0"
              style={{
                background: `color-mix(in srgb, ${ACCENT} 7%, var(--color-surface))`,
                borderColor: `color-mix(in srgb, ${ACCENT} 15%, var(--color-surface-border))`,
                color: ACCENT,
              }}
            >
              <SparkleIcon size={10} style={{ color: ACCENT }} />
              Detected {flavor.itemLabelPlural} ({parsedItems.length}) — click row to add
            </div>
            <div className="overflow-y-auto divide-y [scrollbar-gutter:stable]" style={{ borderColor: 'var(--color-surface-border)' }}>
              {parsedItems.map((item, idx) => {
                const isAdded = addedItemIds.has(idx);
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 px-4 py-2"
                    style={{ background: isAdded ? 'color-mix(in srgb, var(--color-success) 5%, transparent)' : 'transparent' }}
                  >
                    {item.detail && (
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 12%, transparent)` }}
                      >
                        {item.detail}
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-[var(--color-text-primary)] flex-1 truncate">{item.name}</span>
                    {isAdded ? (
                      <span className="text-[10px] flex-shrink-0 font-medium" style={{ color: 'var(--color-success)' }}>✓ Added</span>
                    ) : (
                      <ButtonView
                        size="xs"
                        variant="ghost"
                        accentColor={ACCENT}
                        iconLeft={flavor.addButtonLabel ? undefined : <PlusIcon size={9} />}
                        onClick={() => handleAddOneItem(item, idx)}
                      >
                        {flavor.addButtonLabel ? flavor.addButtonLabel(item) : `Add ${flavor.itemLabel}`}
                      </ButtonView>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </ModalView>
  );
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
      <AIButtonView
        action="generate"
        size="md"
        accentColor={accentVar}
        label="Generate with AI"
        onClick={() => setOpen(p => !p)}
      />

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
