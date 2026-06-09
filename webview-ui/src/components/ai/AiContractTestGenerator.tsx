/**
 * AiContractTestGenerator — generates dk.* contract test assertions from the last response (4.4.3)
 *
 * Rendered as a forwardRef component in ScriptsEditor's post-response toolbar.
 * When opened: shows the current response body (auto-loaded), optional schema input,
 * generates dk.expect() / dk.test() script, then inserts it into the post-response script.
 */
import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { useTabsStore } from '../../store/tabs-store';
import { CloseIcon, SparkleIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';

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

    // Expose handle
    useImperativeHandle(ref, () => ({
      open: () => { setVisible(true); setGenerated(''); setError(''); accRef.current = ''; },
      loading,
    }), [loading]);

    // Listen for AI stream
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

    if (!visible) return null;

    const hasResponse = !!(tab?.response as any)?.body;

    const modal = (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        <div
          className="w-[580px] max-h-[85vh] flex flex-col rounded-xl border shadow-2xl"
          style={{
            backgroundColor: 'var(--color-panel)',
            borderColor: 'var(--color-surface-border)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0"
            style={{ borderColor: 'var(--color-surface-border)' }}
          >
            <SparkleIcon size={15} style={{ color: ACCENT }} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Generate Contract Tests</p>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {tab ? `${tab.method} ${tab.url}` : 'No active tab'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer"
            >
              <CloseIcon size={12} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
            {/* Optional schema input */}
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Schema / OpenAPI spec{' '}
                <span className="font-normal italic text-[var(--color-text-muted)]">(optional)</span>
              </label>
              <textarea
                value={schema}
                onChange={e => setSchema(e.target.value)}
                placeholder={`Paste JSON Schema or OpenAPI path definition:\n{\n  "type": "object",\n  "required": ["id", "name"],\n  "properties": {...}\n}`}
                rows={4}
                className="w-full px-3 py-2 rounded-lg text-[11.5px] font-mono resize-none outline-none"
                style={{
                  backgroundColor: 'var(--color-input-bg)',
                  border: '1px solid var(--color-input-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>

            {!hasResponse && (
              <p className="text-[11px] italic" style={{ color: 'var(--color-text-muted)' }}>
                ⚠️ No response loaded yet — send the request first to generate tests against real data.
              </p>
            )}

            {/* Generate button */}
            {!generated && !loading && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!hasResponse}
                className="h-[32px] px-4 text-[12px] font-medium rounded-md text-white cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-40 self-start"
                style={{ backgroundColor: ACCENT }}
              >
                ✨ Generate Test Script
              </button>
            )}

            {/* Loading */}
            {loading && !generated && (
              <div className="flex gap-1 items-center py-2">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                    style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
                ))}
                <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Generating tests…</span>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>
            )}

            {/* Generated script preview */}
            {generated && (
              <div>
                <p className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  Generated test script:
                  {streaming && <span className="ml-2 text-[var(--color-text-muted)] italic">(streaming…)</span>}
                </p>
                <pre
                  className="text-[11px] px-3 py-2.5 rounded-lg overflow-auto max-h-[260px] font-mono [scrollbar-gutter:stable]"
                  style={{
                    backgroundColor: 'var(--color-input-bg)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-primary)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {generated}
                </pre>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between px-5 py-3 border-t flex-shrink-0"
            style={{ borderColor: 'var(--color-surface-border)' }}
          >
            <div>
              {generated && !streaming && (
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="text-[11px] underline cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                >
                  Regenerate
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {generated && !streaming && (
                <button
                  type="button"
                  onClick={() => { onApply(generated); setVisible(false); }}
                  className="h-[30px] px-4 rounded-md text-[12px] font-medium text-white cursor-pointer hover:opacity-90 transition-opacity flex items-center gap-1.5"
                  style={{ backgroundColor: ACCENT }}
                >
                  <CheckIcon size={11} />
                  Insert into Script
                </button>
              )}
              <button
                type="button"
                onClick={() => setVisible(false)}
                className="h-[30px] px-4 rounded-md text-[12px] font-medium cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );

    return createPortal(modal, document.body);
  }
);
