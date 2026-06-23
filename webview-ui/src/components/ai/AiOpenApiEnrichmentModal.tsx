/**
 * AiOpenApiEnrichmentModal — AI fills in descriptions, examples, errors in partial OpenAPI spec.
 * Feature 4.6.23 — AI OpenAPI Spec Enrichment
 */
import { useState, useEffect, useRef } from 'react';
import { SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView, MultilineInputView, CopyButtonView } from '@salilvnair/dui';

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

  return (
    <ModalView
      open
      onClose={onClose}
      title="OpenAPI Spec Enrichment"
      subtitle="AI fills in descriptions, examples, errors, and constraints"
      size="xl"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={
        result ? <CopyButtonView text={result} size="md" /> : undefined
      }
      footerRight={
        <AIButtonView
          label={loading ? 'Enriching…' : 'Enrich Spec'}
          size="md"
          accentColor={ACCENT}
          disabled={loading || !spec.trim()}
          loading={loading}
          onClick={run}
        />
      }
    >
      <div className="flex flex-1 min-h-0 gap-3" style={{ minHeight: 400 }}>
        {/* Input */}
        <div className="flex flex-col flex-1 min-w-0 gap-2">
          <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Partial/Minimal Spec (YAML or JSON)</p>
          <MultilineInputView
            autoFocus
            value={spec}
            onChange={e => { setSpec(e.target.value); setError(''); }}
            rows={16}
            size="md"
            width="fw"
            placeholder={`openapi: "3.0.3"\ninfo:\n  title: My API\n  version: "1.0"\npaths:\n  /users:\n    get:\n      responses:\n        "200":\n          description: OK`}
          />
        </div>

        {/* Output */}
        <div className="flex flex-col flex-1 min-w-0 gap-2">
          <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Enriched Spec</p>

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
              style={{ color: 'var(--color-text-primary)', backgroundColor: 'var(--color-panel)', minHeight: 300 }}>
              {result}
              {loading && <span className="inline-block w-[2px] h-[11px] ml-0.5 animate-pulse" style={{ backgroundColor: ACCENT }} />}
            </pre>
          )}
        </div>
      </div>

      {error && <p className="text-[11px] mt-2" style={{ color: 'var(--color-error)' }}>{error}</p>}
    </ModalView>
  );
}
