/**
 * AiSmartRetryAdvisor — on request failure, AI suggests retry strategies.
 * Feature 4.6.17 — AI Smart Retry Advisor
 *
 * Shown inline below a failed response. AI reads the status code + error body
 * and suggests: backoff timing, auth refresh, rate-limit handling, alternative endpoints, etc.
 */
import { useState, useEffect, useRef } from 'react';
import { SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';

interface Props {
  status: number;
  responseBody: string;
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
}

const ACCENT = 'var(--color-protocol-ai)';

const SYSTEM_PROMPT = `You are an API debugging expert. Given a failed API request, suggest a concrete retry strategy.

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

  const accRef = useRef('');
  const reqIdRef = useRef('');

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

  const handleOpen = () => {
    setOpen(true);
    if (result) return; // already have a result
    setLoading(true);
    accRef.current = '';
    const pid = `ai-retry-${Date.now()}`;
    reqIdRef.current = pid;

    const headersStr = requestHeaders ? Object.entries(requestHeaders).map(([k, v]) => `${k}: ${v}`).join('\n') : '';

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'rest.retry.advisor',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt: `Failed request:\n${method} ${url}\nStatus: ${status}\n${headersStr ? `Request Headers:\n${headersStr}\n` : ''}Error body:\n${responseBody.slice(0, 3000)}`,
      conversation: [], tools: [],
      settings: { temperature: 0.2, maxTokens: 512, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  return (
    <div>
      {/* Trigger button — shown inline */}
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1 text-[10.5px] px-2.5 py-1 rounded-md cursor-pointer border transition-all"
        style={{
          color: ACCENT,
          borderColor: open ? ACCENT : `color-mix(in srgb, ${ACCENT} 25%, transparent)`,
          backgroundColor: open ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : 'transparent',
        }}
        title="Get AI retry suggestions for this failure"
      >
        <SparkleIcon size={10} />
        Retry advice
      </button>

      {/* Inline advisory panel */}
      {open && (
        <div className="mt-2 rounded-lg border p-3"
          style={{
            borderColor: `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`,
            backgroundColor: `color-mix(in srgb, ${ACCENT} 4%, var(--color-panel))`,
          }}>

          <div className="flex items-center justify-between mb-2">
            <span className="text-[10.5px] font-semibold" style={{ color: ACCENT }}>✦ AI Retry Advisor</span>
            <button type="button" onClick={() => setOpen(false)} className="text-[10px] opacity-50 hover:opacity-100 cursor-pointer"
              style={{ color: 'var(--color-text-muted)' }}>dismiss</button>
          </div>

          {loading && !result && (
            <div className="flex gap-1 items-center py-1">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-[4px] h-[4px] rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
              ))}
              <span className="text-[10.5px] text-[var(--color-text-muted)] ml-1">Analyzing failure…</span>
            </div>
          )}

          {result && (
            <div className="text-[11px]">
              <MdViewer content={result} />
              {loading && <span className="inline-block w-[2px] h-[11px] ml-0.5 animate-pulse" style={{ backgroundColor: ACCENT }} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
