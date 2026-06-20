/**
 * AiGqlQueryBuilderDrawer — Inline drawer above the GQL query editor.
 * Describe a GraphQL operation in plain English; AI generates the exact query.
 *
 * Task 8.8 enhancement — inline drawer pattern (like AiBodyGenerate for REST).
 * Gate: gqlQueryBuilder feature flag
 */
import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { useToastStore } from '../../store/toast-store';
import { CloseIcon, SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { EditorView } from '../../dui';

export interface AiGqlQueryBuilderDrawerHandle {
  open: () => void;
}

interface Props {
  tabId: string;
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

export const AiGqlQueryBuilderDrawer = forwardRef<AiGqlQueryBuilderDrawerHandle, Props>(
  function AiGqlQueryBuilderDrawer({ tabId, onApply }: Props, ref) {
    const [visible, setVisible] = useState(false);
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [generated, setGenerated] = useState('');
    const [streaming, setStreaming] = useState('');
    const [error, setError] = useState('');

    const accRef = useRef('');
    const reqIdRef = useRef('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const activeTab = useTabsStore(s => s.tabs.find(t => t.id === tabId));
    const resolve = useAiPromptTemplatesStore(s => s.resolve);
    const addToast = useToastStore(s => s.addToast);

    useEffect(() => {
      const handler = (evt: MessageEvent) => {
        const msg = evt.data as Record<string, unknown>;
        if (!msg || msg.tabId !== reqIdRef.current) return;

        if (msg.type === 'ai:chunk') {
          const delta = (msg.delta as string) || (msg.text as string) || '';
          accRef.current += delta;
          setStreaming(accRef.current);
        }
        if (msg.type === 'ai:complete') {
          const msgPayload = msg.message as Record<string, unknown> | undefined;
          const raw = accRef.current || (msgPayload?.content as string) || '';
          const cleaned = stripFences(raw);
          setGenerated(cleaned);
          setStreaming('');
          setLoading(false);
        }
        if (msg.type === 'ai:error') {
          const errMsg = (msg.message as string) || 'AI generation failed. Check your AI provider settings.';
          setError(errMsg);
          setStreaming('');
          setLoading(false);
          addToast({ type: 'error', message: `Query Builder: ${errMsg}` });
        }
      };
      window.addEventListener('message', handler);
      return () => window.removeEventListener('message', handler);
    }, [addToast]);

    useEffect(() => {
      if (visible && !loading) {
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    }, [visible, loading]);

    const handleGenerate = useCallback(() => {
      if (!description.trim() || loading) return;

      const schemaHint = activeTab?.authData?.['gql_schema_sdl']
        ? `\n\nSchema context (excerpt):\n${(activeTab.authData['gql_schema_sdl'] as string).slice(0, 800)}`
        : '';
      const systemPrompt = resolve('graphql.query.generate.system') || SYSTEM_PROMPT;
      const userPrompt = `${SYSTEM_PROMPT}${schemaHint}\n\nUser request: ${description.trim()}`;

      const pid = `ai-gql-qb-${Date.now()}`;
      reqIdRef.current = pid;
      accRef.current = '';

      setGenerated('');
      setStreaming('');
      setError('');
      setLoading(true);

      postMsg({
        type: 'ai:send',
        tabId: pid,
        provider: '',
        model: '',
        baseUrl: '',
        stage: 'graphql.query.generate',
        systemPrompts: [systemPrompt],
        userPrompt,
        conversation: [],
        tools: [],
        settings: {
          temperature: 0.5,
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
        authType: activeTab?.authType,
        authData: activeTab?.authData,
        envId: activeTab?.envId,
      });
    }, [description, loading, activeTab, resolve]);

    const handleApply = useCallback(() => {
      if (!generated.trim()) return;
      onApply(generated.trim());
      setGenerated('');
      setDescription('');
      setVisible(false);
    }, [generated, onApply]);

    const handleClose = useCallback(() => {
      setVisible(false);
      setGenerated('');
      setStreaming('');
      setError('');
      setLoading(false);
      accRef.current = '';
      reqIdRef.current = '';
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleGenerate();
      }
    }, [handleGenerate]);

    useImperativeHandle(ref, () => ({
      open: () => setVisible(true),
    }), []);

    if (!visible) return null;

    const liveQuery = generated || streaming;

    return (
      <div
        className="mx-1 mt-1 mb-0 rounded-lg border overflow-hidden flex-shrink-0"
        style={{
          borderColor: `color-mix(in srgb, ${ACCENT} 25%, transparent)`,
          backgroundColor: `color-mix(in srgb, ${ACCENT} 4%, var(--color-panel))`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 py-2 border-b"
          style={{ borderColor: `color-mix(in srgb, ${ACCENT} 15%, transparent)` }}
        >
          <SparkleIcon size={12} style={{ color: ACCENT, flexShrink: 0 }} />
          <span className="text-[11px] font-medium flex-1" style={{ color: ACCENT }}>
            Query Builder with AI
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="w-[18px] h-[18px] flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer transition-opacity"
            title="Close"
          >
            <CloseIcon size={10} />
          </button>
        </div>

        {/* Description input */}
        <div className="px-3 py-2.5">
          <textarea
            ref={textareaRef}
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={2}
            placeholder={`Describe what you want… e.g. "get user by ID with name, email, and orders"`}
            className="w-full resize-none rounded-md px-2.5 py-2 text-[12px] font-mono bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none disabled:opacity-50 transition-colors"
            style={{ minHeight: 52 }}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-[var(--color-text-muted)]">⌘↵ to generate</span>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || !description.trim()}
              className="h-[26px] px-3 rounded-md text-[11px] font-medium cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: ACCENT, color: 'var(--color-btn-primary-text, #fff)' }}
            >
              {loading ? 'Generating…' : (generated ? 'Regenerate' : 'Generate')}
            </button>
          </div>
        </div>

        {/* Loading dots */}
        {loading && !streaming && (
          <div className="flex gap-0.5 items-center px-3 pb-2.5">
            {[0, 120, 240].map(d => (
              <span
                key={d}
                className="w-[4px] h-[4px] rounded-full animate-pulse"
                style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }}
              />
            ))}
            <span className="text-[11px] ml-1.5" style={{ color: ACCENT }}>Generating…</span>
          </div>
        )}

        {/* Live preview */}
        {liveQuery && (
          <div className="px-3 pb-2.5">
            <EditorView
              value={liveQuery}
              language="graphql"
              height="160px"
              readOnly
              wordWrap
              bordered
            />
            {generated && !loading && (
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={handleApply}
                  className="h-[26px] px-3 rounded-md text-[11px] font-medium cursor-pointer transition-opacity hover:opacity-90"
                  style={{ backgroundColor: ACCENT, color: 'var(--color-btn-primary-text, #fff)' }}
                >
                  Apply to editor
                </button>
              </div>
            )}
          </div>
        )}

        {/* Inline error (also shown as toast above) */}
        {error && !loading && (
          <div className="px-3 pb-2.5">
            <p className="text-[11px] text-[var(--color-error)]">⚠️ {error}</p>
          </div>
        )}
      </div>
    );
  },
);
