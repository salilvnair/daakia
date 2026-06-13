/**
 * AiSchemaValidatorModal — validates response against JSON Schema/OpenAPI spec with AI (4.4.8)
 */
import { useState, useEffect, useRef } from 'react';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { SparkleIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';
import { ModalView, AIButtonView, EditorView, ResizablePanelView } from '../../dui';

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
        accRef.current += (msg.delta as string) || (msg.text as string) || '';
        setResult(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        setResult(accRef.current || (msgPayload?.content as string) || '');
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
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'rest.schema.validate',
      systemPrompts: [systemPrompt],
      userPrompt,
      conversation: [], tools: [],
      settings: { temperature: 0.1, maxTokens: 1024, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  const allGood = result && !result.toLowerCase().includes('mismatch') && !result.toLowerCase().includes('violation') && !result.toLowerCase().includes('missing') && !result.toLowerCase().includes('invalid');

  return (
    <ModalView
      open
      onClose={onClose}
      title="Schema Validator"
      subtitle={url ? `${method} ${url} · ${status}` : undefined}
      size="md"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        <div style={{ display: 'flex', gap: 8 }}>
          {result && !loading && (
            <AIButtonView
              label="Re-validate"
              size="md"
              accentColor={ACCENT}
              disabled={loading}
              onClick={handleValidate}
            />
          )}
          {!result && (
            <AIButtonView
              label={loading ? 'Validating…' : 'Validate with AI'}
              size="md"
              accentColor={ACCENT}
              disabled={loading || !schema.trim() || !responseBody.trim()}
              onClick={handleValidate}
            />
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, marginBottom: 8, color: 'var(--color-text-secondary)' }}>
            JSON Schema or OpenAPI spec
          </label>
          <ResizablePanelView defaultHeight={220} minHeight={100} maxHeight={420}>
            <EditorView
              value={schema}
              onChange={setSchema}
              language="json"
              height="100%"
              placeholder={`{\n  "type": "object",\n  "required": ["id", "name"],\n  "properties": {\n    "id": { "type": "integer" },\n    "name": { "type": "string" }\n  }\n}`}
              bordered={false}
            />
          </ResizablePanelView>
        </div>

        <p style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: 0 }}>
          Response: {responseBody.length > 0 ? `${responseBody.length} chars loaded` : 'No response — send the request first'}
        </p>

        {error && <p style={{ fontSize: 11, color: 'var(--color-error)', margin: 0 }}>{error}</p>}

        {loading && !result && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0' }}>
            {[0, 150, 300].map(d => (
              <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
            ))}
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>Validating…</span>
          </div>
        )}

        {result && (
          <div style={{
            borderRadius: 8,
            border: `1px solid ${allGood ? 'color-mix(in srgb, var(--color-success) 30%, var(--color-surface-border))' : `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`}`,
            backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-panel))`,
            padding: 12,
          }}>
            {allGood && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 500, color: 'var(--color-success)' }}>
                <CheckIcon size={12} />
                Response appears to comply with the schema
              </div>
            )}
            <MdViewer content={result} />
            {isStreaming && <span className="inline-block w-[2px] h-[12px] ml-0.5 animate-pulse align-text-bottom" style={{ backgroundColor: ACCENT }} />}
          </div>
        )}
      </div>
    </ModalView>
  );
}
