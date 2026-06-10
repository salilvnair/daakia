/**
 * AiGqlQueryBuilderModal — describe a GraphQL operation in plain English,
 * AI generates the exact query / mutation / subscription.
 *
 * Task 8.8 — GQL Query Builder ✦
 * Gate: gqlQueryBuilder feature flag
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore } from '../../store/tabs-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { CloseIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';

interface Props {
  onClose: () => void;
  onApply: (query: string) => void;
}

const ACCENT = 'var(--color-protocol-graphql)';

const SYSTEM_PROMPT = `You are a GraphQL expert. Given a plain-English description of what the user wants to query or mutate, generate a valid GraphQL operation.

Rules:
- Output ONLY the GraphQL operation (query/mutation/subscription) — no explanation, no markdown fences
- Use descriptive field names and include common fields like id, name, createdAt where relevant
- Add variables where appropriate (e.g. $id: ID!)
- If the user mentions a schema type, use it exactly
- Keep the operation concise and production-ready`;

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:graphql|gql)?\s*/im, '')
    .replace(/\s*```$/im, '')
    .trim();
}

export function AiGqlQueryBuilderModal({ onClose, onApply }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const getTemplate = useAiPromptTemplatesStore(s => s.getTemplate);
  const [description, setDescription] = useState('');
  const [generated, setGenerated] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') {
        streamRef.current += msg.chunk;
        setGenerated(streamRef.current);
      } else if (msg?.type === 'aiStream:done') {
        const cleaned = stripFences(streamRef.current);
        streamRef.current = cleaned;
        setGenerated(cleaned);
        setLoading(false);
      } else if (msg?.type === 'aiStream:error') {
        setError(msg.error || 'AI request failed');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleGenerate = () => {
    if (!description.trim() || loading) return;
    const schemaHint = activeTab?.authData?.['gql_schema_sdl']
      ? `\n\nSchema context (excerpt):\n${(activeTab.authData['gql_schema_sdl'] as string).slice(0, 800)}`
      : '';
    const userPrompt = `${SYSTEM_PROMPT}${schemaHint}\n\nUser request: ${description.trim()}`;
    const template = getTemplate('graphql.schema.view');
    streamRef.current = '';
    setGenerated('');
    setError('');
    setLoading(true);
    postMsg({
      type: 'aiChat',
      tabId: activeTab?.id ?? '',
      messages: [{ role: 'user', content: userPrompt }],
      systemPrompt: template || SYSTEM_PROMPT,
      stream: true,
    });
  };

  const handleApply = () => {
    if (!generated.trim()) return;
    onApply(generated.trim());
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div
        className="relative flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--color-panel)',
          borderColor: `color-mix(in srgb, ${ACCENT} 30%, var(--color-surface-border))`,
          width: 560,
          maxHeight: '80vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          <div className="flex items-center gap-2">
            <SparkleIcon size={14} style={{ color: ACCENT }} />
            <span className="text-[13px] font-semibold" style={{ color: ACCENT }}>Query Builder ✦</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-[var(--color-hover)] cursor-pointer transition-colors" style={{ color: 'var(--color-text-muted)' }}>
            <CloseIcon size={13} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-5 flex flex-col gap-4 min-h-0">
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              Describe what you want to query or mutate
            </label>
            <textarea
              ref={textareaRef}
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleGenerate(); }}
              placeholder="e.g. Get all users with their orders and payment status, sorted by creation date"
              rows={3}
              className="w-full resize-none rounded-lg px-3 py-2 text-[12px] border outline-none transition-all"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`,
                color: 'var(--color-text-primary)',
              }}
            />
            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>⌘+Enter to generate</p>
          </div>

          {error && (
            <p className="text-[11px] px-3 py-2 rounded-lg" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>
              {error}
            </p>
          )}

          {(generated || loading) && (
            <div>
              <p className="text-[10.5px] font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Generated query</p>
              <div
                className="rounded-lg border overflow-hidden"
                style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface)' }}
              >
                {loading && !generated ? (
                  <p className="px-4 py-3 text-[11px] animate-pulse" style={{ color: ACCENT }}>Generating…</p>
                ) : (
                  <MdViewer content={'```graphql\n' + generated + '\n```'} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3 border-t flex-shrink-0"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!description.trim() || loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: ACCENT, color: '#fff' }}
          >
            <SparkleIcon size={12} />
            {loading ? 'Generating…' : 'Generate'}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[12px] font-medium cursor-pointer transition-all hover:bg-[var(--color-hover)]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!generated.trim()}
              className="px-4 py-2 rounded-lg text-[12px] font-medium cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 15%, transparent)`, color: ACCENT }}
            >
              Apply to editor
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
