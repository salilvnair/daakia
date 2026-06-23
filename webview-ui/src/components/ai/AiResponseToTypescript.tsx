/**
 * AiResponseToTypescript — converts response JSON body to TypeScript interface/type definitions.
 * Feature 4.6.8 — AI Response to TypeScript
 *
 * One-click: response JSON → TS interfaces with proper optional/required field inference.
 */
import { useState, useEffect, useRef } from 'react';
import { SparkleIcon, TypeIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView, CopyButtonView, ButtonView } from '@salilvnair/dui';

interface Props {
  responseBody: string;
  method?: string;
  url?: string;
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const SYSTEM_PROMPT = `You are a TypeScript expert. Convert JSON response bodies into TypeScript interface definitions.

Rules:
- Generate clean, well-named TypeScript interfaces
- Infer optional fields (use ?) for fields that might be null/undefined
- Use proper TypeScript types: string, number, boolean, null, Date (for ISO strings), arrays, nested interfaces
- Generate a root interface named after the resource (e.g. "User", "Product", "Order") or "ApiResponse" if unclear
- If the response is an array, generate the item interface and a type alias for the array
- Add JSDoc comments for fields that have non-obvious semantics
- Export all interfaces

Output ONLY the TypeScript code — no markdown fences, no explanation text. Just the interfaces.`;

export function AiResponseToTypescript({ responseBody, method, url, onClose }: Props) {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        setError((msg.message as string) || 'Generation failed.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Auto-run on mount
  useEffect(() => {
    if (!responseBody.trim()) return;
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = () => {
    setLoading(true);
    setResult('');
    setError('');
    accRef.current = '';
    const pid = `ai-ts-gen-${Date.now()}`;
    reqIdRef.current = pid;

    const userPrompt = `Convert this JSON API response to TypeScript interfaces.\n\nEndpoint: ${method || 'GET'} ${url || ''}\n\nResponse body:\n${responseBody.slice(0, 6000)}`;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'rest.ts.generate',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt,
      conversation: [], tools: [],
      settings: { temperature: 0.1, maxTokens: 2048, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="Response → TypeScript"
      subtitle={url ? `${method} ${url}` : undefined}
      size="xl"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <TypeIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={
        responseBody.length > 0 ? (
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{responseBody.length} chars analyzed</span>
        ) : undefined
      }
      footerRight={
        result && !loading ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <ButtonView size="md" variant="secondary" onClick={run}>Regenerate</ButtonView>
            <CopyButtonView text={result} title="Copy TypeScript" size="md" accentColor={ACCENT} />
          </div>
        ) : !result && !loading && responseBody.trim() ? (
          <AIButtonView label="Generate Interfaces" size="md" accentColor={ACCENT} onClick={run} />
        ) : undefined
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!responseBody.trim() && (
          <p className="text-[12px]" style={{ color: 'var(--color-error)' }}>No response body found. Send the request first.</p>
        )}

        {loading && !result && (
          <div className="flex gap-1 items-center py-4">
            {[0, 150, 300].map(d => (
              <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
            ))}
            <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Generating TypeScript interfaces…</span>
          </div>
        )}

        {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

        {result && (
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-surface-border)' }}>
            <div className="flex items-center justify-between px-3 py-1.5 border-b"
              style={{ backgroundColor: 'var(--color-surface-hover)', borderColor: 'var(--color-surface-border)' }}>
              <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>TypeScript</span>
              <CopyButtonView text={result} title="Copy" size="sm" accentColor={ACCENT} />
            </div>
            <pre className="p-4 text-[11.5px] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed"
              style={{ color: 'var(--color-text-primary)', backgroundColor: 'var(--color-panel)' }}>
              {result}
              {loading && <span className="inline-block w-[2px] h-[12px] ml-0.5 animate-pulse align-text-bottom"
                style={{ backgroundColor: ACCENT }} />}
            </pre>
          </div>
        )}

        {!result && !loading && responseBody.trim() && (
          <AIButtonView label="Generate Interfaces" size="md" accentColor={ACCENT} onClick={run} />
        )}
      </div>
    </ModalView>
  );
}
