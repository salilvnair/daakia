/**
 * AiAssistPopover — lightweight inline AI assist panel for response-context actions.
 *
 * Tasks: 4.3.1 (Error Diagnosis), 4.3.2 (Response Explainer), 4.3.3 (Request from Response)
 *
 * Renders a floating panel below the trigger button that streams the AI response inline.
 * The user doesn't need to navigate to the AI tab — answers appear right in context.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { useTabsStore, type ResponseData } from '../../store/tabs-store';
import { SparkleIcon, CloseIcon } from '../../icons';
import { postMsg } from '../../vscode';

const ACCENT = 'var(--color-protocol-ai)';

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
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(true);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const popoverId = useRef(`ai-assist-${Date.now()}`).current;

  const providers = useAiProvidersStore(s => s.providers);

  // Build prompt based on mode
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

  const modeLabel = mode === 'error-diagnosis' ? 'Diagnosing error…' : mode === 'explain' ? 'Explaining response…' : 'Suggesting follow-up requests…';

  // Get active provider info
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const provider = activeTab?.aiProvider || providers.find(p => p.enabled)?.id || 'openai';
  const model = activeTab?.aiModel || providers.find(p => p.id === provider)?.models.find(m => m.enabled)?.id || '';

  // Send the AI request on mount, listen for responses tagged with popoverId
  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      // Filter by tabId — the extension echoes back tabId on all ai:* responses
      if (!msg || msg.tabId !== popoverId) return;

      if (msg.type === 'ai:chunk') {
        const chunk = (msg.delta as string) || (msg.text as string) || '';
        setText(prev => prev + chunk);
        setStreaming(true);
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        const content = (msgPayload?.content as string) || '';
        if (content) setText(prev => prev || content);
        setStreaming(false);
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'AI request failed');
        setStreaming(false);
      }
    };

    window.addEventListener('message', handler);

    // Fire request using a unique popoverId as tabId — responses come back with matching tabId
    postMsg({
      type: 'ai:send',
      tabId: popoverId,
      provider,
      model,
      baseUrl: activeTab?.url || '',
      systemPrompts: [],
      userPrompt: prompt.current,
      conversation: [],
      tools: [],
      settings: { temperature: 0.4, maxTokens: 1024, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
      authType: activeTab?.authType,
      authData: activeTab?.authData,
      envId: activeTab?.envId,
    });

    return () => window.removeEventListener('message', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll as text streams in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  const handleOpenInChat = useCallback(() => {
    // Create/switch to AI tab with the completed text as context
    useTabsStore.getState().addTab({ protocol: 'ai', aiProvider: provider, aiModel: model });
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
        maxHeight: 320,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: `color-mix(in srgb, ${ACCENT} 15%, var(--color-surface-border))`, backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 6%, var(--color-surface))' }}
      >
        <SparkleIcon size={12} style={{ color: ACCENT }} />
        <span className="text-[11px] font-medium flex-1" style={{ color: ACCENT }}>
          {modeIcon} {modeTitle}
        </span>
        {streaming && (
          <div className="flex gap-0.5">
            {[0, 100, 200].map(d => (
              <span key={d} className="w-[4px] h-[4px] rounded-full animate-pulse" style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-[20px] h-[20px] flex items-center justify-center rounded cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
        >
          <CloseIcon size={11} />
        </button>
      </div>

      {/* Streaming label while loading */}
      {streaming && !text && (
        <div className="px-3 py-2 text-[11px] text-[var(--color-text-muted)] italic flex-shrink-0">
          {modeLabel}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="px-3 py-2 text-[11px] text-[var(--color-error)] flex-shrink-0">
          ⚠️ {error}
        </div>
      )}

      {/* Response text */}
      {text && (
        <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-2 text-[12px] leading-relaxed text-[var(--color-text-primary)] whitespace-pre-wrap" style={{ minHeight: 60 }}>
          {text}
          {streaming && <span className="inline-block w-[2px] h-[13px] ml-0.5 bg-[var(--color-protocol-ai)] animate-pulse align-text-bottom" />}
        </div>
      )}

      {/* Footer: open in chat */}
      {!streaming && !error && text && (
        <div className="flex items-center justify-end gap-2 px-3 py-1.5 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button
            type="button"
            onClick={handleOpenInChat}
            className="text-[10px] cursor-pointer transition-colors"
            style={{ color: ACCENT }}
          >
            Open in AI chat →
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
}

export function AiActionButton({ mode, label, response, requestMethod, requestUrl, requestBody }: AiActionButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] cursor-pointer transition-all border"
        style={{
          color: ACCENT,
          borderColor: `color-mix(in srgb, ${ACCENT} 25%, transparent)`,
          backgroundColor: open ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : 'transparent',
        }}
        title={label}
      >
        <SparkleIcon size={10} style={{ color: ACCENT }} />
        {label}
      </button>

      {open && (
        <div className="absolute z-50 right-0 mt-1 w-[420px]">
          <AiAssistPopover
            mode={mode}
            response={response}
            requestMethod={requestMethod}
            requestUrl={requestUrl}
            requestBody={requestBody}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
