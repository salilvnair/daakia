/**
 * AiContractTestGenerator — generates dk.* contract test assertions from the last response (4.4.3)
 *
 * Rendered as a forwardRef component in ScriptsEditor's post-response toolbar.
 * When opened: shows the current response body (auto-loaded), optional schema input,
 * generates dk.expect() / dk.test() script, then inserts it into the post-response script.
 */
import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { useTabsStore } from '../../store/tabs-store';
import { SparkleIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { ModalView, ButtonView, MultilineInputView } from '@salilvnair/dui';

// ─── Handle ───────────────────────────────────────────────────────────────────
export interface AiContractTestHandle {
  open: () => void;
  loading: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  tabId: string;
  /** Called with generated test script to insert into editor */
  onApply: (script: string) => void;
}

const ACCENT = 'var(--color-success)';

export const AiContractTestGenerator = forwardRef<AiContractTestHandle, Props>(
  function AiContractTestGenerator({ tabId, onApply }, ref) {
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [generated, setGenerated] = useState('');
    const [streaming, setStreaming] = useState(false);
    const [schema, setSchema] = useState('');
    const [error, setError] = useState('');

    const accRef = useRef('');
    const reqIdRef = useRef('');
    const resolve = useAiPromptTemplatesStore(s => s.resolve);

    const tab = useTabsStore(s => s.tabs.find(t => t.id === tabId));

    useImperativeHandle(ref, () => ({
      open: () => { setVisible(true); setGenerated(''); setError(''); accRef.current = ''; },
      loading,
    }), [loading]);

    useEffect(() => {
      const handler = (evt: MessageEvent) => {
        const msg = evt.data as Record<string, unknown>;
        if (!msg || msg.tabId !== reqIdRef.current) return;

        if (msg.type === 'ai:chunk') {
          const delta = (msg.delta as string) || (msg.text as string) || '';
          accRef.current += delta;
          setGenerated(accRef.current);
        }
        if (msg.type === 'ai:complete') {
          const msgPayload = msg.message as Record<string, unknown> | undefined;
          const content = accRef.current || (msgPayload?.content as string) || '';
          const clean = content
            .replace(/^```(?:javascript|js)?\s*/im, '')
            .replace(/\s*```\s*$/im, '')
            .trim();
          setGenerated(clean);
          setLoading(false);
          setStreaming(false);
        }
        if (msg.type === 'ai:error') {
          setError((msg.message as string) || 'AI generation failed.');
          setLoading(false);
          setStreaming(false);
        }
      };
      window.addEventListener('message', handler);
      return () => window.removeEventListener('message', handler);
    }, []);

    const handleGenerate = () => {
      if (!tab) return;
      setLoading(true);
      setStreaming(true);
      setGenerated('');
      setError('');
      accRef.current = '';

      const pid = `ai-contract-${Date.now()}`;
      reqIdRef.current = pid;

      const responseBody = (() => {
        const raw = tab.response?.body;
        if (!raw) return '{}';
        try { return JSON.stringify(JSON.parse(raw), null, 2).slice(0, 4000); }
        catch { return (raw as string).slice(0, 4000); }
      })();

      const schemaContext = schema.trim()
        ? `Schema / Spec:\n\`\`\`\n${schema.trim().slice(0, 3000)}\n\`\`\``
        : 'No schema provided — generate assertions based on the response structure.';

      const systemPrompt = resolve('rest.contract.test.system');
      const userPrompt = resolve('rest.contract.test', {
        method: tab.method || 'GET',
        url: tab.url || '',
        status: String((tab.response as any)?.status || '200'),
        responseBody,
        schemaContext,
      });

      postMsg({
        type: 'ai:send',
        tabId: pid,
        provider: '', model: '', baseUrl: '',
        stage: 'rest.contract.test',
        systemPrompts: [systemPrompt],
        userPrompt,
        conversation: [],
        tools: [],
        settings: {
          temperature: 0.1,
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
      });
    };

    const hasResponse = !!(tab?.response as any)?.body;
    const canInsert = !!(generated && !streaming);

    return (
      <ModalView
        open={visible}
        onClose={() => setVisible(false)}
        title="Generate Contract Tests"
        subtitle={tab ? `${tab.method} ${tab.url}` : 'No active tab'}
        headerIcon={<SparkleIcon size={14} style={{ color: ACCENT }} />}
        headerColor={ACCENT}
        size="md"
        footerLeft={
          canInsert ? (
            <ButtonView size="md" variant="ghost" onClick={handleGenerate} disabled={!hasResponse}>
              Regenerate
            </ButtonView>
          ) : undefined
        }
        footerRight={
          canInsert ? (
            <ButtonView
              size="md"
              variant="primary"
              iconLeft={<CheckIcon size={11} />}
              accentColor={ACCENT}
              onClick={() => { onApply(generated); setVisible(false); }}
            >
              Insert into Script
            </ButtonView>
          ) : !generated && !loading ? (
            <ButtonView
              size="md"
              variant="primary"
              iconLeft={<SparkleIcon size={11} />}
              accentColor={ACCENT}
              onClick={handleGenerate}
              disabled={!hasResponse}
            >
              Generate Test Script
            </ButtonView>
          ) : undefined
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Schema input */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
              Schema / OpenAPI spec{' '}
              <span style={{ fontWeight: 400, fontStyle: 'italic', color: 'var(--color-text-muted)' }}>(optional)</span>
            </label>
            <MultilineInputView
              size="md"
              value={schema}
              onChange={e => setSchema(e.target.value)}
              rows={5}
              style={{ fontFamily: 'var(--vscode-editor-font-family, monospace)', fontSize: '11.5px', width: '100%' }}
              placeholder={`Paste JSON Schema or OpenAPI path definition:\n{\n  "type": "object",\n  "required": ["id", "name"],\n  "properties": {...}\n}`}
            />
          </div>

          {/* No response warning */}
          {!hasResponse && (
            <p style={{ fontSize: '11px', fontStyle: 'italic', color: 'var(--color-text-muted)', margin: 0 }}>
              ⚠️ No response loaded yet — send the request first to generate tests against real data.
            </p>
          )}

          {/* Loading dots */}
          {loading && !generated && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
              {[0, 150, 300].map(d => (
                <span
                  key={d}
                  className="animate-pulse"
                  style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: ACCENT, display: 'inline-block', animationDelay: `${d}ms` }}
                />
              ))}
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: 6 }}>Generating tests…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <p style={{ fontSize: '11px', color: 'var(--color-error)', margin: 0 }}>{error}</p>
          )}

          {/* Generated script preview */}
          {generated && (
            <div>
              <p style={{ fontSize: '11px', fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
                Generated test script:
                {streaming && <span style={{ marginLeft: 8, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>(streaming…)</span>}
              </p>
              <pre style={{
                fontSize: '11px',
                padding: '8px 12px',
                borderRadius: 7,
                overflow: 'auto',
                maxHeight: 260,
                fontFamily: 'var(--vscode-editor-font-family, monospace)',
                backgroundColor: 'var(--color-input-bg)',
                border: '1px solid var(--color-surface-border)',
                color: 'var(--color-text-primary)',
                whiteSpace: 'pre-wrap',
                margin: 0,
              }}>
                {generated}
              </pre>
            </div>
          )}
        </div>
      </ModalView>
    );
  }
);
