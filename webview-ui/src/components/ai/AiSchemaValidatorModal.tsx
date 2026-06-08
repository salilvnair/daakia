/**
 * AiSchemaValidatorModal — validates response against JSON Schema/OpenAPI spec with AI (4.4.8)
 *
 * Auto-loads the current tab's response body. User pastes a schema/spec.
 * AI explains mismatches and compliance issues.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { CloseIcon, SparkleIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';

interface Props {
  responseBody: string;
  method?: string;
  url?: string;
  status?: string;
  onClose: () => void;
}

const ACCENT = 'var(--color-info)';

export function AiSchemaValidatorModal({ responseBody, method, url, status, onClose }: Props) {
  const [schema, setSchema] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');
  const resolve = useAiPromptTemplatesStore(s => s.resolve);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;

      if (msg.type === 'ai:chunk') {
        const delta = (msg.delta as string) || (msg.text as string) || '';
        accRef.current += delta;
        setResult(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        const content = accRef.current || (msgPayload?.content as string) || '';
        setResult(content);
        setLoading(false);
        setIsStreaming(false);
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'Validation failed.');
        setLoading(false);
        setIsStreaming(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleValidate = () => {
    if (!schema.trim()) { setError('Paste a schema or spec to validate against.'); return; }
    if (!responseBody.trim()) { setError('No response body found. Send the request first.'); return; }

    setLoading(true);
    setIsStreaming(true);
    setResult('');
    setError('');
    accRef.current = '';

    const pid = `ai-schema-val-${Date.now()}`;
    reqIdRef.current = pid;

    const systemPrompt = resolve('rest.schema.validate.system');
    const userPrompt = resolve('rest.schema.validate', {
      method: method || 'GET',
      url: url || '',
      status: status || '200',
      responseBody: responseBody.slice(0, 4000),
      schema: schema.slice(0, 3000),
    });

    postMsg({
      type: 'ai:send',
      tabId: pid,
      provider: '', model: '', baseUrl: '',
      stage: 'rest.schema.validate',
      systemPrompts: [systemPrompt],
      userPrompt,
      conversation: [],
      tools: [],
      settings: { temperature: 0.1, maxTokens: 1024, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  const allGood = result && !result.toLowerCase().includes('mismatch') && !result.toLowerCase().includes('violation') && !result.toLowerCase().includes('missing') && !result.toLowerCase().includes('invalid');

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-[600px] max-h-[88vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-surface-bg)', borderColor: 'var(--color-surface-border)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Schema Validator</p>
            {url && <p className="text-[11px] text-[var(--color-text-muted)] truncate">{method} {url} · {status}</p>}
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {/* Schema input */}
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              JSON Schema or OpenAPI spec
            </label>
            <textarea
              autoFocus
              value={schema}
              onChange={e => { setSchema(e.target.value); setError(''); }}
              rows={7}
              className="w-full px-3 py-2 rounded-lg text-[11px] font-mono resize-none outline-none"
              placeholder={`Paste JSON Schema (draft-07):\n{\n  "type": "object",\n  "required": ["id", "name", "email"],\n  "properties": {\n    "id": { "type": "integer" },\n    "name": { "type": "string", "minLength": 1 },\n    "email": { "type": "string", "format": "email" }\n  }\n}`}
              style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
            />
          </div>

          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            Response: {responseBody.length > 0 ? `${responseBody.length} chars (loaded)` : 'No response — send the request first'}
          </p>

          {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

          {!result && !loading && (
            <button
              type="button"
              onClick={handleValidate}
              disabled={!schema.trim() || !responseBody.trim()}
              className="h-[30px] px-4 text-[12px] font-medium rounded-md text-white cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 self-start"
              style={{ backgroundColor: ACCENT }}
            >
              ✨ Validate with AI
            </button>
          )}

          {loading && !result && (
            <div className="flex gap-1 items-center py-2">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
              ))}
              <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Validating…</span>
            </div>
          )}

          {result && (
            <div
              className="rounded-lg border p-3"
              style={{
                borderColor: allGood
                  ? 'color-mix(in srgb, var(--color-success) 30%, var(--color-surface-border))'
                  : `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`,
                backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-surface-bg))`,
              }}
            >
              {allGood && (
                <div className="flex items-center gap-1.5 mb-2 text-[11px] font-medium" style={{ color: 'var(--color-success)' }}>
                  <CheckIcon size={12} />
                  Response appears to comply with the schema
                </div>
              )}
              <MdViewer content={result} />
              {isStreaming && <span className="inline-block w-[2px] h-[12px] ml-0.5 animate-pulse align-text-bottom" style={{ backgroundColor: ACCENT }} />}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex gap-2">
            {result && !loading && (
              <button type="button" onClick={handleValidate}
                className="h-[30px] px-3 text-[11px] rounded-md cursor-pointer border text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                style={{ borderColor: 'var(--color-surface-border)' }}>
                Re-validate
              </button>
            )}
            <button type="button" onClick={onClose}
              className="h-[30px] px-4 text-[12px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
