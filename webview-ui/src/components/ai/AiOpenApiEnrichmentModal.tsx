/**
 * AiOpenApiEnrichmentModal — AI fills in descriptions, examples, errors in partial OpenAPI spec.
 * Feature 4.6.23 — AI OpenAPI Spec Enrichment
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SparkleIcon, CloseIcon, CopyIcon } from '../../icons';
import { postMsg } from '../../vscode';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const SYSTEM_PROMPT = `You are an OpenAPI specification enricher. The user will provide a minimal or partial OpenAPI 3.x spec. Enrich it by:

1. Adding meaningful descriptions to all operations, parameters, and schemas
2. Adding realistic example values for all request/response bodies
3. Adding common error responses (400, 401, 403, 404, 422, 429, 500) where missing
4. Adding parameter descriptions and validation constraints (minLength, pattern, enum, etc.)
5. Adding tags to group related operations
6. Adding a proper info.description if missing
7. Adding security schemes if auth endpoints are detected

Keep all existing content intact — only add/enhance, never remove.
Return the complete enriched OpenAPI YAML (preserve YAML format if input is YAML, JSON if JSON).
Return ONLY the spec, no explanation.`;

export function AiOpenApiEnrichmentModal({ onClose }: Props) {
  const [spec, setSpec] = useState('');
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
        accRef.current += (msg.delta as string) || '';
        setResult(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        setResult(accRef.current || '');
        setLoading(false);
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'Enrichment failed.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const run = () => {
    if (!spec.trim()) { setError('Paste your OpenAPI spec first.'); return; }
    setLoading(true);
    setResult('');
    setError('');
    accRef.current = '';
    const pid = `ai-openapi-${Date.now()}`;
    reqIdRef.current = pid;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'import.openapi.enrich',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt: `Enrich this OpenAPI spec:\n\n${spec.slice(0, 8000)}`,
      conversation: [], tools: [],
      settings: { temperature: 0.2, maxTokens: 4096, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  const copy = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[760px] max-h-[92vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-surface-bg)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">OpenAPI Spec Enrichment</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">AI fills in descriptions, examples, errors, and constraints</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 gap-0">
          {/* Input */}
          <div className="flex flex-col flex-1 min-w-0 border-r p-4 gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
            <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Partial/Minimal Spec (YAML or JSON)</p>
            <textarea
              autoFocus
              value={spec}
              onChange={e => { setSpec(e.target.value); setError(''); }}
              className="flex-1 px-3 py-2 rounded-lg text-[11px] font-mono resize-none outline-none"
              placeholder={`openapi: "3.0.3"\ninfo:\n  title: My API\n  version: "1.0"\npaths:\n  /users:\n    get:\n      responses:\n        "200":\n          description: OK`}
              style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)', minHeight: '300px' }}
            />
          </div>

          {/* Output */}
          <div className="flex flex-col flex-1 min-w-0 p-4 gap-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Enriched Spec</p>
              {result && (
                <button type="button" onClick={copy}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded cursor-pointer"
                  style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  <CopyIcon size={11} />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              )}
            </div>

            {loading && !result && (
              <div className="flex-1 flex items-center justify-center flex-col gap-2">
                <div className="flex gap-1">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-[6px] h-[6px] rounded-full animate-pulse"
                      style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
                  ))}
                </div>
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Enriching spec…</span>
              </div>
            )}

            {!result && !loading && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Enriched spec will appear here</p>
              </div>
            )}

            {result && (
              <pre className="flex-1 text-[10.5px] font-mono overflow-auto p-2 rounded-lg"
                style={{ color: 'var(--color-text-primary)', backgroundColor: 'var(--color-panel)', minHeight: '300px' }}>
                {result}
                {loading && <span className="inline-block w-[2px] h-[11px] ml-0.5 animate-pulse" style={{ backgroundColor: ACCENT }} />}
              </pre>
            )}
          </div>
        </div>

        {error && <p className="text-[11px] px-5 py-1" style={{ color: 'var(--color-error)' }}>{error}</p>}

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0 gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button type="button" onClick={run} disabled={loading || !spec.trim()}
            className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-40 text-white"
            style={{ backgroundColor: ACCENT }}>
            <SparkleIcon size={11} className="inline mr-1" />
            Enrich Spec
          </button>
          <button type="button" onClick={onClose}
            className="h-[30px] px-4 text-[11px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
