/**
 * AiSmartRetryAdvisor — on request failure, AI suggests retry strategies.
 * Feature 4.6.17 — AI Smart Retry Advisor
 *
 * Renders as a small toolbar button (xs AIButtonView). Clicking opens a ModalView
 * with the AI-generated retry advice. Only shown on error responses.
 * Prompt template: 'rest.smart.retry' / 'rest.smart.retry.system' from Prompt Library.
 */
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { postMsg } from '../../vscode';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { ModalView, AIButtonView } from '../../dui';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';

interface Props {
  status: number;
  responseBody: string;
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
}

const ACCENT = 'var(--color-warning)';

const DEFAULT_SYSTEM_PROMPT = `You are an API debugging expert. Given a failed API request, suggest a concrete retry strategy.

Based on the HTTP status code and error body, provide:
1. **Root cause** — why this likely failed (1-2 sentences)
2. **Retry strategy** — specific steps to fix/retry:
   - For 401/403: how to refresh auth / fix auth
   - For 429: rate limit — extract Retry-After header, suggest backoff
   - For 5xx: exponential backoff suggestion with specific delays
   - For 404: check URL spelling, versioning, resource existence
   - For 400: what in the request body/params looks malformed
   - For timeout: connection vs read timeout, suggest smaller payload or chunking
3. **Quick fix** — the single most likely thing to change right now

Keep it concise — 3-5 bullet points max. Use markdown.`;

export function AiSmartRetryAdvisor({ status, responseBody, method, url, requestHeaders }: Props) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const templates = useAiPromptTemplatesStore(s => s.templates);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; visible: boolean }>({
    top: -9999, left: -9999, visible: false,
  });

  const accRef = useRef('');
  const reqIdRef = useRef('');

  useLayoutEffect(() => {
    if (!open || !triggerRect || !popRef.current) return;
    const id = requestAnimationFrame(() => {
      if (!popRef.current) return;
      const pop = popRef.current.getBoundingClientRect();
      const W = 360;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = triggerRect.right - W;
      let top = triggerRect.bottom + 6;
      left = Math.max(8, Math.min(left, vw - W - 8));
      if (top + pop.height > vh - 8) top = triggerRect.top - pop.height - 6;
      setPos({ top: Math.max(8, top), left, visible: true });
    });
    return () => cancelAnimationFrame(id);
  }, [open, triggerRect]);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;
      if (msg.type === 'ai:chunk') {
        accRef.current += (msg.delta as string) || (msg.text as string) || '';
        setResult(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        setResult(accRef.current || (msg.message as Record<string, unknown>)?.content as string || '');
        setLoading(false);
      }
      if (msg.type === 'ai:error') {
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    setTriggerRect((e.currentTarget as HTMLElement).getBoundingClientRect());
    setOpen(true);
    if (result) return;
    setLoading(true);
    accRef.current = '';
    const pid = `ai-retry-${Date.now()}`;
    reqIdRef.current = pid;

    const systemPrompt = templates['rest.smart.retry.system'] || DEFAULT_SYSTEM_PROMPT;
    const headersStr = requestHeaders ? Object.entries(requestHeaders).map(([k, v]) => `${k}: ${v}`).join('\n') : '';
    const userPrompt = `Failed request:\n${method} ${url}\nStatus: ${status}\n${headersStr ? `Request Headers:\n${headersStr}\n` : ''}Error body:\n${responseBody.slice(0, 3000)}`;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'rest.smart.retry',
      systemPrompts: [systemPrompt],
      userPrompt,
      conversation: [], tools: [],
      settings: { temperature: 0.2, maxTokens: 512, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  return (
    <>
      <AIButtonView
        label="Retry Advice"
        size="xs"
        accentColor={ACCENT}
        onClick={handleOpen}
      />
      {open && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div
            ref={popRef}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: 360,
              zIndex: 9999,
              visibility: pos.visible ? 'visible' : 'hidden',
            }}
          >
            <ModalView
              mode="inline"
              open
              onClose={() => setOpen(false)}
              title="AI Retry Advisor"
              headerColor={ACCENT}
              headerIcon={
                <div style={{
                  width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `color-mix(in srgb, ${ACCENT} 22%, transparent)`,
                }}>
                  <SparkleIcon size={10} style={{ color: ACCENT }} />
                </div>
              }
            >
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {loading && !result && (
                  <div className="flex gap-1.5 items-center py-2">
                    {[0, 150, 300].map(d => (
                      <span key={d} className="w-[4px] h-[4px] rounded-full animate-pulse"
                        style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
                    ))}
                    <span className="text-[11px] text-[var(--color-text-muted)] ml-1">Analyzing failure…</span>
                  </div>
                )}
                {result && (
                  <div className="text-[11px]">
                    <MdViewer content={result} />
                    {loading && (
                      <span className="inline-block w-[2px] h-[11px] ml-0.5 animate-pulse" style={{ backgroundColor: ACCENT }} />
                    )}
                  </div>
                )}
              </div>
            </ModalView>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
