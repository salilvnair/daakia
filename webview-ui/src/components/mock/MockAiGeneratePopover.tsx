/**
 * MockAiGeneratePopover — modal AI generation panel for mock server config panels.
 *
 * Features:
 * - Module-level response cache: never re-generates unless user clicks Regenerate
 * - Centered modal overlay (850px wide, up to 700px tall — 70% larger than original)
 * - Per-route "+ Add Route" buttons after generation completes
 * - "+ Add All Generated Routes" button in footer
 * - Description field in context so AI knows what to build
 *
 * Shared by all mock protocols (REST, GraphQL, gRPC, SOAP, SSE, WebSocket, Socket.IO, MQTT).
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { useTabsStore } from '../../store/tabs-store';
import { useAiPromptTemplatesStore, type AiPromptTemplateKey } from '../../store/ai-prompt-templates-store';
import { SparkleIcon, CloseIcon, RefreshIcon, PlusIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';
import type { MockRoute, HttpMethod } from './mock-types';

const ACCENT = 'var(--color-mock-server)';

// ─── Module-level generation cache ────────────────────────────────────────────
// Persists across open/close within the session — no re-generation unless explicit.

interface CachedResult {
  text: string;
  routes: ParsedRoute[];
}

const generateCache = new Map<string, CachedResult>();

// ─── Route parser ─────────────────────────────────────────────────────────────

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
  /** Passed into {context} placeholder — description + existing routes summary */
  serverContext?: string;
  onClose: () => void;
  /** Only wired for REST — adds parsed routes directly to the server */
  onAddGeneratedRoutes?: (routes: Partial<MockRoute>[]) => void;
}

export function MockAiGeneratePopover({
  templateKey,
  title,
  serverName,
  serverContext = 'None configured yet.',
  onClose,
  onAddGeneratedRoutes,
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

  // Check cache on mount — if hit, skip AI call entirely
  const cached = generateCache.get(cacheKey);

  // Re-parse routes from cached text if routes were not previously extracted
  // (handles cache entries from before parser improvements)
  const initialRoutes = cached?.routes?.length
    ? cached.routes
    : cached?.text ? parseRoutesFromText(cached.text) : [];

  // Update cache with freshly parsed routes if we had to re-parse
  if (cached && !cached.routes?.length && initialRoutes.length > 0) {
    generateCache.set(cacheKey, { ...cached, routes: initialRoutes });
  }

  const [text, setText] = useState(cached?.text || '');
  const [parsedRoutes, setParsedRoutes] = useState<ParsedRoute[]>(initialRoutes);
  const [streaming, setStreaming] = useState(!cached);   // no streaming if cache hit
  const [error, setError] = useState('');
  const [fetchKey, setFetchKey] = useState(0);
  const [addedAll, setAddedAll] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());

  // ── AI request — only fires when fetchKey changes AND no cache ──────────────
  useEffect(() => {
    // If there's cached text (fetchKey=0 = first mount, cache hit) skip the request
    if (fetchKey === 0 && generateCache.has(cacheKey)) return;

    setText('');
    setParsedRoutes([]);
    setStreaming(true);
    setError('');
    setAddedAll(false);
    setAddedIds(new Set());
    accumulatedRef.current = '';

    const prompt = resolve(templateKey, { serverName, context: serverContext });

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
        generateCache.set(cacheKey, { text: final, routes });
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
      provider,
      model,
      baseUrl: '',
      systemPrompts: [
        'You are a mock API generator with deep knowledge of real-world API design. You think like a senior backend engineer — you pick sensible resource names, use realistic IDs (UUIDs, slugs, domain-specific codes), generate real-looking timestamps and values, and make data that feels like it came from a production system.\n\nWhen generating routes, lead with a brief genuine explanation of your design: what resources you\'re creating, why these endpoints, what the data model looks like. Be specific to the domain, not generic.\n\nCRITICAL LIMITS — follow these strictly to avoid cut-off output:\n1. Generate at most 6 routes per call. If the user asks for more, generate 6 representative ones and note what was omitted.\n2. Keep each "body" object flat or at most one level deep — no deeply nested objects. Max 5 fields per body.\n3. The ```routes JSON block MUST be 100% complete and valid JSON before you finish responding. Never leave the JSON array open.\n4. Every item needs "method", "path", "statusCode", "name", "description", and "body" (a realistic JSON object). Invalid JSON or missing fields silently drops that route.\n5. Write descriptions in 10 words or fewer.',
      ],
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

  const handleRegenerate = useCallback(() => {
    generateCache.delete(cacheKey);
    accumulatedRef.current = '';
    setText('');
    setParsedRoutes([]);
    setError('');
    setAddedAll(false);
    setAddedIds(new Set());
    setFetchKey(k => k + 1);
  }, [cacheKey]);

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

  const modal = (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={(e) => {
        // Backdrop click does NOT close — only X button closes (per modal rules)
        e.stopPropagation();
      }}
    >
      <div
        className="flex flex-col rounded-xl border shadow-2xl overflow-hidden"
        style={{
          width: 850,
          maxWidth: '94vw',
          maxHeight: '90vh',
          minHeight: 200,
          backgroundColor: 'var(--color-surface)',
          borderColor: `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`,
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
            <button
              type="button"
              onClick={handleRegenerate}
              title="Regenerate"
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors opacity-50 hover:opacity-100"
              style={{ color: ACCENT }}
            >
              <RefreshIcon size={10} />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-[22px] h-[22px] flex items-center justify-center rounded cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
          >
            <CloseIcon size={12} />
          </button>
        </div>

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

        {/* Scrollable content area — markdown only, routes are fixed below */}
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

        {/* ── Detected Routes — fixed bottom section, never scrolls away ─────── */}
        {!streaming && parsedRoutes.length > 0 && onAddGeneratedRoutes && text && (
          <div
            className="flex-shrink-0 border-t flex flex-col"
            style={{
              maxHeight: 224,
              borderColor: `color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))`,
              backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-surface))`,
            }}
          >
            {/* Header — sticky within this section */}
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

            {/* Route cards — scrollable within the fixed section */}
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

            {/* Add all generated routes button — REST only */}
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
          </div>
        )}
      </div>
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
}

export function MockAiGenerateButton({
  templateKey,
  title,
  serverName,
  serverContext,
  accentVar = ACCENT,
  onAddGeneratedRoutes,
}: MockAiGenerateButtonProps) {
  const [open, setOpen] = useState(false);

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
        />
      )}
    </>
  );
}
