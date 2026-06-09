/**
 * AiResponseToTypescript — converts response JSON body to TypeScript interface/type definitions.
 * Feature 4.6.8 — AI Response to TypeScript
 *
 * One-click: response JSON → TS interfaces with proper optional/required field inference.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SparkleIcon, CloseIcon, CopyIcon, TypeIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';

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
  const [copied, setCopied] = useState(false);
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

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[680px] max-h-[90vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}>

        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <TypeIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Response → TypeScript</p>
            {url && <p className="text-[11px] text-[var(--color-text-muted)] truncate">{method} {url}</p>}
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
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
                <button type="button" onClick={copy}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors"
                  style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  <CopyIcon size={11} />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
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
            <button type="button" onClick={run}
              className="h-[32px] px-4 text-[12px] font-medium rounded-md text-white cursor-pointer hover:opacity-90 self-start"
              style={{ backgroundColor: ACCENT }}>
              <SparkleIcon size={11} className="inline mr-1" />
              Generate Interfaces
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            {responseBody.length > 0 ? `${responseBody.length} chars analyzed` : ''}
          </p>
          <div className="flex gap-2">
            {result && !loading && (
              <button type="button" onClick={run}
                className="h-[30px] px-3 text-[11px] rounded-md cursor-pointer border"
                style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                Regenerate
              </button>
            )}
            <button type="button" onClick={onClose}
              className="h-[30px] px-4 text-[11px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
