/**
 * AiGqlQueryBuilderModal — describe a GraphQL operation in plain English,
 * AI generates the exact query / mutation / subscription.
 *
 * Task 8.8 — GQL Query Builder ✦
 * Gate: gqlQueryBuilder feature flag
 */
import { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, MultilineInputView, ButtonView, AIButtonView } from '../../dui';

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
  const resolve = useAiPromptTemplatesStore(s => s.resolve);
  const [description, setDescription] = useState('');
  const [generated, setGenerated] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');

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
    const template = resolve('graphql.schema.view');
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

  return (
    <ModalView
      open
      onClose={onClose}
      title="Query Builder ✦"
      size="md"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)`, flexShrink: 0 }}>
          <SparkleIcon size={13} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={
        <AIButtonView
          label={loading ? 'Generating…' : 'Generate'}
          action="generate"
          size="md"
          accentColor={ACCENT}
          disabled={!description.trim() || loading}
          onClick={handleGenerate}
        />
      }
      footerRight={
        generated.trim() ? (
          <ButtonView
            label="Apply to editor"
            variant="secondary"
            size="md"
            accentColor={ACCENT}
            disabled={!generated.trim()}
            onClick={handleApply}
          />
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            Describe what you want to query or mutate
          </label>
          <MultilineInputView
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) handleGenerate(); }}
            placeholder="e.g. Get all users with their orders and payment status, sorted by creation date"
            rows={3}
            size="md"
            accentColor={ACCENT}
            autoFocus
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
    </ModalView>
  );
}
