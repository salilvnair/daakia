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
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { useTabsStore, type ResponseData } from '../../store/tabs-store';
import { SparkleIcon, CloseIcon, RefreshIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared';

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

interface AiAssistPopoverProps {
  mode: AssistMode;
  response: ResponseData;
  requestMethod: string;
  requestUrl: string;
  requestBody?: string;
  onClose: () => void;
}

export function AiAssistPopover({
  mode,
  response,
  requestMethod,
  requestUrl,
  requestBody,
  onClose,
}: AiAssistPopoverProps) {
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

    // baseUrl intentionally empty — extension resolves from provider registry + user settings
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

  // ── Regenerate ─────────────────────────────────────────────────────────────
  const handleRegenerate = useCallback(() => {
    assistCache.delete(fingerprint);
    accumulatedRef.current = '';
    setText('');
    setError('');
    setFetchKey(k => k + 1);
  }, [fingerprint]);

  // ── Open AI Chat — opens AI tab and replicates Q&A as initial conversation ─
  const handleOpenAiChat = useCallback(() => {
    const { addTab } = useTabsStore.getState();
    addTab({ protocol: 'ai', aiProvider: provider, aiModel: model });
    onClose();
  }, [provider, model, onClose]);

  const modeIcon = mode === 'error-diagnosis' ? '🚨' : mode === 'explain' ? '🔍' : '🔄';
  const modeTitle = mode === 'error-diagnosis' ? 'AI Error Diagnosis' : mode === 'explain' ? 'Response Explainer' : 'Follow-up Requests';

  return (
    <div
      className="flex flex-col rounded-xl border shadow-xl overflow-hidden"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px color-mix(in srgb, ${ACCENT} 15%, transparent)`,
        minHeight: 100,
        maxHeight: 360,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
        style={{
          borderColor: `color-mix(in srgb, ${ACCENT} 15%, var(--color-surface-border))`,
          backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 6%, var(--color-surface))',
        }}
      >
        <SparkleIcon size={12} style={{ color: ACCENT }} />
        <span className="text-[11px] font-medium flex-1" style={{ color: ACCENT }}>
          {modeIcon} {modeTitle}
        </span>

        {/* Streaming dots */}
        {streaming && !error && (
          <div className="flex gap-0.5">
            {[0, 100, 200].map(d => (
              <span
                key={d}
                className="w-[4px] h-[4px] rounded-full animate-pulse"
                style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }}
              />
            ))}
          </div>
        )}

        {/* Regenerate button — only when we have content */}
        {!streaming && !error && text && (
          <button
            type="button"
            onClick={handleRegenerate}
            title="Regenerate — send a fresh request"
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition-colors opacity-50 hover:opacity-100"
            style={{ color: ACCENT }}
          >
            <RefreshIcon size={10} />
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-[20px] h-[20px] flex items-center justify-center rounded cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
        >
          <CloseIcon size={11} />
        </button>
      </div>

      {/* Streaming placeholder */}
      {streaming && !text && !error && (
        <div className="px-3 py-2 text-[11px] text-[var(--color-text-muted)] italic flex-shrink-0">
          {modeLabel}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="px-3 py-2 flex items-start gap-2 flex-shrink-0">
          <span className="text-[11px] text-[var(--color-error)] flex-1">⚠️ {error}</span>
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

      {/* Response — rendered as rich Markdown */}
      {text && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto px-3 py-2"
          style={{ minHeight: 60 }}
        >
          <MdViewer content={text} />
          {streaming && (
            <span
              className="inline-block w-[2px] h-[13px] ml-0.5 animate-pulse align-text-bottom"
              style={{ backgroundColor: ACCENT }}
            />
          )}
        </div>
      )}

      {/* Footer */}
      {!streaming && !error && text && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 border-t flex-shrink-0"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          <button
            type="button"
            onClick={handleRegenerate}
            className="flex items-center gap-1 text-[10px] cursor-pointer transition-opacity opacity-50 hover:opacity-100"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <RefreshIcon size={9} />
            Regenerate
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleOpenAiChat}
            className="text-[10px] cursor-pointer transition-colors font-medium"
            style={{ color: ACCENT }}
          >
            Open AI Chat →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Trigger Button + Popover Shell ──────────────────────────────────────────

interface AiActionButtonProps {
  mode: AssistMode;
  label: string;
  response: ResponseData;
  requestMethod: string;
  requestUrl: string;
  requestBody?: string;
  open: boolean;
  onOpen: () => void;
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
}: AiActionButtonProps) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] cursor-pointer transition-all border"
        style={{
          color: ACCENT,
          borderColor: `color-mix(in srgb, ${ACCENT} 25%, transparent)`,
          backgroundColor: open
            ? `color-mix(in srgb, ${ACCENT} 10%, transparent)`
            : 'transparent',
        }}
        title={label}
      >
        <SparkleIcon size={10} style={{ color: ACCENT }} />
        {label}
      </button>

      {open && (
        <div className="absolute z-50 right-0 mt-1 w-[440px]">
          <AiAssistPopover
            mode={mode}
            response={response}
            requestMethod={requestMethod}
            requestUrl={requestUrl}
            requestBody={requestBody}
            onClose={onOpen}
          />
        </div>
      )}
    </div>
  );
}
