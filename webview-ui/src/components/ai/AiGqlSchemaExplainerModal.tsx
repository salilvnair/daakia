/**
 * AiGqlSchemaExplainerModal — AI explains the current GraphQL schema in plain English.
 * Covers types, fields, relationships, and query patterns.
 *
 * Task 8.9 — GQL Schema Explainer ✦
 * Gate: gqlSchemaExplainer feature flag
 */
import { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, ButtonView } from '../../dui';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-graphql)';

const SYSTEM_PROMPT = `You are a GraphQL documentation expert. Given a GraphQL SDL schema, explain it in plain English for a developer who is new to this API.

Structure your response as:
1. **Overview** — what this API does in 1-2 sentences
2. **Main Types** — for each root type (Query, Mutation, Subscription), list operations with one-line descriptions
3. **Key Object Types** — explain the most important types and their fields
4. **Relationships** — describe how types connect to each other
5. **Common Patterns** — 2-3 example use-cases with the query to use

Keep explanations concise, practical, and developer-friendly.`;

export function AiGqlSchemaExplainerModal({ onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const resolve = useAiPromptTemplatesStore(s => s.resolve);
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');
  const hasSchema = !!(activeTab?.authData?.['gql_schema_sdl'] || activeTab?.authData?.['gql_schema']);

  useEffect(() => {
    if (hasSchema) startExplain();
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') {
        streamRef.current += msg.chunk;
        setExplanation(streamRef.current);
      } else if (msg?.type === 'aiStream:done') {
        setLoading(false);
      } else if (msg?.type === 'aiStream:error') {
        setError(msg.error || 'AI request failed');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const startExplain = () => {
    if (!activeTab || loading) return;
    const sdl = (activeTab.authData?.['gql_schema_sdl'] as string)
      || JSON.stringify(activeTab.authData?.['gql_schema'] || {}, null, 2).slice(0, 3000);
    if (!sdl) return;

    const template = resolve('graphql.schema.view');
    streamRef.current = '';
    setExplanation('');
    setError('');
    setLoading(true);
    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\nSchema:\n${sdl.slice(0, 4000)}` }],
      systemPrompt: template || SYSTEM_PROMPT,
      stream: true,
    });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="Schema Explainer ✦"
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)`, flexShrink: 0 }}>
          <SparkleIcon size={13} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={
        !loading && explanation ? (
          <ButtonView
            label="Refresh"
            variant="secondary"
            size="md"
            accentColor={ACCENT}
            onClick={startExplain}
          />
        ) : undefined
      }
    >
      {!hasSchema && !loading && !explanation && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <SparkleIcon size={24} style={{ color: ACCENT, opacity: 0.4 }} />
          <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            No schema loaded. Connect to a GraphQL endpoint first to load the schema.
          </p>
        </div>
      )}

      {error && (
        <p className="text-[11px] px-3 py-2 rounded-lg mb-4" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>
          {error}
        </p>
      )}

      {loading && !explanation && (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <SparkleIcon size={20} style={{ color: ACCENT }} className="animate-pulse" />
          <p className="text-[11px] animate-pulse" style={{ color: ACCENT }}>Analyzing schema…</p>
        </div>
      )}

      {explanation && (
        <MdViewer content={explanation} />
      )}
    </ModalView>
  );
}
