/**
 * AiAssistPopover — lightweight inline AI assist panel for response-context actions.
 *
 * Tasks: 4.3.1 (Error Diagnosis), 4.3.2 (Response Explainer), 4.3.3 (Request from Response)
 *
 * Key behaviours:
 * - Results are cached per response fingerprint — re-opening the same response shows cached output
 * - "Regenerate" button forces a fresh AI request and updates the cache
 * - "Open AI Chat" opens a new AI tab with the Q&A pre-loaded as initial conversation
 * - Responses are rendered by MdViewer (marked + highlight.js) instead of raw text
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { useTabsStore, type ResponseData } from '../../store/tabs-store';
import { SparkleIcon, RefreshIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared';
import type { DuiSize } from '../../dui';
import { useButtonBase } from '../../dui';

const ACCENT = 'var(--color-protocol-ai)';

// ─── Module-level response cache ─────────────────────────────────────────────
// Keyed by fingerprint (mode + method + url + status + body-prefix).
// Lives for the lifetime of the webview — reset happens only on Regenerate.

const assistCache = new Map<string, string>();

function makeFingerprint(
  mode: AssistMode,
  method: string,
  url: string,
  status: number,
  bodyPrefix: string,
): string {
  return `${mode}::${method}::${url}::${status}::${bodyPrefix}`;
}

// ─── Build context-aware AI prompts ──────────────────────────────────────────

function buildErrorDiagnosisPrompt(
  method: string,
  url: string,
  status: number,
  statusText: string,
  responseBody: string,
  requestBody?: string,
): string {
  const bodyPreview = responseBody.slice(0, 600);
  const reqBodyPreview = requestBody ? `\nRequest body: ${requestBody.slice(0, 300)}` : '';
  return `/explain HTTP ${status} ${statusText} error for ${method} ${url}${reqBodyPreview}\nResponse: ${bodyPreview}\n\nExplain why this error occurred and provide specific steps to fix it.`;
}

function buildResponseExplainerPrompt(
  method: string,
  url: string,
  status: number,
  contentType: string,
  responseBody: string,
): string {
  const bodyPreview = responseBody.slice(0, 800);
  return `/explain HTTP ${status} response from ${method} ${url} (${contentType})\n\n${bodyPreview}\n\nExplain this response in plain English — what data is returned, what each field means, and any notable patterns.`;
}

function buildFollowUpRequestsPrompt(
  method: string,
  url: string,
  responseBody: string,
): string {
  const bodyPreview = responseBody.slice(0, 800);
  return `/request Analyze this ${method} ${url} response and suggest 3-5 useful follow-up API requests:\n\n${bodyPreview}\n\nFor each, show the HTTP method, endpoint, and what it's useful for.`;
}

export type AssistMode = 'error-diagnosis' | 'explain' | 'follow-up';

const POPOVER_WIDTH = 360;

interface AiAssistPopoverProps {
  mode: AssistMode;
  response: ResponseData;
  requestMethod: string;
  requestUrl: string;
  requestBody?: string;
  onClose: () => void;
  /** The element to anchor the popover below — right edge aligns with anchor right edge. */
  anchorEl?: HTMLElement | null;
}

export function AiAssistPopover({
  mode,
  response,
  requestMethod,
  requestUrl,
  requestBody,
  onClose,
  anchorEl,
}: AiAssistPopoverProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const popoverId = useRef(`ai-assist-${Date.now()}`).current;
  const accumulatedRef = useRef('');

  const providers = useAiProvidersStore(s => s.providers);
  const defaultProviderId = useAiProvidersStore(s => s.defaultProviderId);
  const defaultModelId = useAiProvidersStore(s => s.defaultModelId);
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));

  const provider = activeTab?.aiProvider || defaultProviderId || providers.find(p => p.enabled)?.id || 'openai';
  const model = activeTab?.aiModel || defaultModelId || providers.find(p => p.id === provider)?.models.find(m => m.enabled)?.id || '';

  // Build prompt once
  const prompt = useRef('');
  if (!prompt.current) {
    if (mode === 'error-diagnosis') {
      prompt.current = buildErrorDiagnosisPrompt(requestMethod, requestUrl, response.status, response.statusText, response.body, requestBody);
    } else if (mode === 'explain') {
      prompt.current = buildResponseExplainerPrompt(requestMethod, requestUrl, response.status, response.contentType, response.body);
    } else {
      prompt.current = buildFollowUpRequestsPrompt(requestMethod, requestUrl, response.body);
    }
  }

  // Fingerprint — changes only when the actual response changes
  const fingerprint = useMemo(
    () => makeFingerprint(mode, requestMethod, requestUrl, response.status, response.body.slice(0, 150)),
    [mode, requestMethod, requestUrl, response.status, response.body],
  );

  // fetchKey — increment to force a new AI request (Regenerate)
  const [fetchKey, setFetchKey] = useState(0);

  // Text state — initialised from cache if available
  const [text, setText] = useState<string>(() => assistCache.get(fingerprint) ?? '');
  const [streaming, setStreaming] = useState(() => !assistCache.has(fingerprint));
  const [error, setError] = useState('');

  const modeLabel = mode === 'error-diagnosis'
    ? 'Diagnosing error…'
    : mode === 'explain'
      ? 'Explaining response…'
      : 'Suggesting follow-up requests…';

  // ── AI request effect ──────────────────────────────────────────────────────
  useEffect(() => {
    // Cache hit on first render — skip request
    if (fetchKey === 0 && assistCache.has(fingerprint)) {
      setStreaming(false);
      return;
    }

    // Start fresh
    setText('');
    setStreaming(true);
    setError('');
    accumulatedRef.current = '';

    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== popoverId) return;

      if (msg.type === 'ai:chunk') {
        const chunk = (msg.delta as string) || (msg.text as string) || '';
        accumulatedRef.current += chunk;
        setText(accumulatedRef.current);
        setStreaming(true);
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        const content = (msgPayload?.content as string) || '';
        const final = accumulatedRef.current || content;
        setText(final);
        setStreaming(false);
        if (final) assistCache.set(fingerprint, final);
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
      systemPrompts: [],
      userPrompt: prompt.current,
      conversation: [],
      tools: [],
      settings: {
        temperature: 0.4,
        maxTokens: 1024,
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
  }, [fetchKey, fingerprint]);

  // Auto-scroll while streaming
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  // Viewport-aware positioning — right-aligned by default (extends leftward from anchor's right edge)
  useEffect(() => {
    if (!menuRef.current || !anchorEl) return;
    const menu = menuRef.current;
    const place = () => {
      const r = anchorEl.getBoundingClientRect();
      const menuH = menu.scrollHeight;
      // Right-align: popover right edge = anchor right edge → extends leftward
      let left = r.right - POPOVER_WIDTH;
      let top = r.bottom + 4;
      // Clamp horizontally
      if (left < 8) left = Math.min(r.left, window.innerWidth - POPOVER_WIDTH - 8);
      if (left + POPOVER_WIDTH > window.innerWidth - 8) left = window.innerWidth - POPOVER_WIDTH - 8;
      if (left < 8) left = 8;
      // Flip above if not enough space below
      if (top + menuH > window.innerHeight - 8) top = Math.max(8, r.top - menuH - 4);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener('scroll', place, { passive: true, capture: true });
    window.addEventListener('resize', place, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
    };
  }, [anchorEl, text]); // re-run when text changes (height grows)

  // Outside-click close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (anchorEl?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anchorEl, onClose]);

  // ── Regenerate ─────────────────────────────────────────────────────────────
  const handleRegenerate = useCallback(() => {
    assistCache.delete(fingerprint);
    accumulatedRef.current = '';
    setText('');
    setError('');
    setFetchKey(k => k + 1);
  }, [fingerprint]);

  // ── Open AI Chat ──────────────────────────────────────────────────────────
  const handleOpenAiChat = useCallback(() => {
    const { addTab } = useTabsStore.getState();
    addTab({ protocol: 'ai', aiProvider: provider, aiModel: model });
    onClose();
  }, [provider, model, onClose]);

  const modeIcon = mode === 'error-diagnosis' ? '🚨' : mode === 'explain' ? '🔍' : '🔄';
  const modeTitle = mode === 'error-diagnosis' ? 'AI Error Diagnosis' : mode === 'explain' ? 'Response Explainer' : 'Follow-up Requests';

  const card = (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        zIndex: 99998,
        width: POPOVER_WIDTH,
        left: -9999,
        top: -9999,
        background: 'var(--color-elevated, var(--color-surface))',
        border: '1px solid var(--color-surface-border)',
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px var(--color-panel-border, rgba(255,255,255,.04))',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Compact header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          background: `color-mix(in srgb, ${ACCENT} 10%, var(--color-surface))`,
          borderBottom: `1px solid color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 18, height: 18, borderRadius: 4, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `color-mix(in srgb, ${ACCENT} 22%, transparent)`,
          }}
        >
          <SparkleIcon size={10} style={{ color: ACCENT }} />
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, flex: 1,
          color: `color-mix(in srgb, ${ACCENT} 80%, var(--color-text-primary))`,
        }}>
          {modeIcon} {modeTitle}
        </span>
        {streaming && !error && (
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {[0, 100, 200].map(d => (
              <span
                key={d}
                className="w-[3px] h-[3px] rounded-full animate-pulse"
                style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 5, border: 'none',
            background: 'transparent', cursor: 'pointer',
            fontSize: 13, color: 'var(--color-text-muted)', padding: 0, flexShrink: 0,
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--color-error) 12%, transparent)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.background = 'transparent'; }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div
        ref={scrollRef}
        style={{ padding: '10px 12px', maxHeight: 260, overflowY: 'auto', flex: 1 }}
      >
        {streaming && !text && !error && (
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic', margin: 0 }}>
            {modeLabel}
          </p>
        )}
        {error && (
          <p style={{ fontSize: 11, color: 'var(--color-error)', margin: 0 }}>⚠️ {error}</p>
        )}
        {text && (
          <div style={{ fontSize: 11 }}>
            <MdViewer content={text} />
            {streaming && (
              <span
                className="inline-block w-[2px] h-[13px] ml-0.5 animate-pulse align-text-bottom"
                style={{ backgroundColor: ACCENT }}
              />
            )}
          </div>
        )}
      </div>

      {/* Compact footer */}
      {((!streaming && !error && text) || error) && (
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 10px',
            borderTop: '1px solid var(--color-surface-border)',
            flexShrink: 0,
          }}
        >
          <div>
            {!streaming && !error && text && (
              <button
                type="button"
                onClick={handleRegenerate}
                className="flex items-center gap-1 text-[10px] cursor-pointer transition-opacity opacity-50 hover:opacity-100"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <RefreshIcon size={9} />
                Regenerate
              </button>
            )}
          </div>
          <div>
            {error ? (
              <button
                type="button"
                onClick={handleRegenerate}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded cursor-pointer border"
                style={{ color: ACCENT, borderColor: `color-mix(in srgb, ${ACCENT} 30%, transparent)` }}
              >
                <RefreshIcon size={9} /> Retry
              </button>
            ) : (text ? (
              <button
                type="button"
                onClick={handleOpenAiChat}
                className="text-[10px] font-medium cursor-pointer transition-colors hover:opacity-80"
                style={{ color: ACCENT }}
              >
                Open AI Chat →
              </button>
            ) : null)}
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(card, document.body);
}

// ─── Trigger Button + Modal Shell ─────────────────────────────────────────────

interface AiActionButtonProps {
  mode: AssistMode;
  label: string;
  response: ResponseData;
  requestMethod: string;
  requestUrl: string;
  requestBody?: string;
  open: boolean;
  onOpen: () => void;
  /** Override the accent color for this specific button */
  accentColor?: string;
  /** compact=true → xs size (20px) for response panel toolbars */
  compact?: boolean;
  /** Explicit DUI size — overrides the compact default. */
  size?: DuiSize;
}

export function AiActionButton({
  mode,
  label,
  response,
  requestMethod,
  requestUrl,
  requestBody,
  open,
  onOpen,
  accentColor,
  compact,
  size,
}: AiActionButtonProps) {
  const btnAccent = accentColor ?? ACCENT;
  const resolvedSize: DuiSize = size ?? (compact ? 'xs' : 'sm');
  const base = useButtonBase(resolvedSize);
  const borderRadius = compact ? '4px' : '6px';
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={onOpen}
        className="flex items-center cursor-pointer transition-all border"
        style={{
          height: base.height,
          paddingLeft: base.paddingX,
          paddingRight: base.paddingX,
          gap: base.gap,
          fontSize: base.fontSize,
          fontWeight: compact ? 400 : 500,
          borderRadius,
          color: btnAccent,
          borderColor: open
            ? `color-mix(in srgb, ${btnAccent} 45%, var(--color-surface-border))`
            : `color-mix(in srgb, ${btnAccent} 25%, var(--color-surface-border))`,
          backgroundColor: open
            ? `color-mix(in srgb, ${btnAccent} 12%, var(--color-surface))`
            : 'transparent',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.backgroundColor = `color-mix(in srgb, ${btnAccent} 10%, var(--color-surface))`;
          e.currentTarget.style.borderColor = `color-mix(in srgb, ${btnAccent} 45%, var(--color-surface-border))`;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.backgroundColor = open ? `color-mix(in srgb, ${btnAccent} 12%, var(--color-surface))` : 'transparent';
          e.currentTarget.style.borderColor = open
            ? `color-mix(in srgb, ${btnAccent} 45%, var(--color-surface-border))`
            : `color-mix(in srgb, ${btnAccent} 25%, var(--color-surface-border))`;
        }}
        title={label}
      >
        <SparkleIcon size={base.iconSize} style={{ color: btnAccent }} />
        {label}
      </button>

      {open && (
        <AiAssistPopover
          mode={mode}
          response={response}
          requestMethod={requestMethod}
          requestUrl={requestUrl}
          requestBody={requestBody}
          onClose={onOpen}
          anchorEl={btnRef.current}
        />
      )}
    </>
  );
}
