/**
 * AiSequenceComposerModal — Sprint 11.3
 * Describe a journey → AI generates a full chained request sequence.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, ButtonView, MultilineInputView } from '@salilvnair/dui';

interface Props { protocol: string; onClose: () => void; }

const ACCENT = 'var(--color-protocol-ai)';

const SYSTEM_PROMPT = `You are an API workflow expert. Given a plain-English description of a multi-step user journey, generate a complete chained request sequence.

For each step provide:
1. **Step name** — short descriptive label
2. **Method & URL** — e.g. POST /api/auth/login
3. **Request body** — JSON payload (if applicable)
4. **Variable extraction** — which fields to capture from the response (e.g. \`token = response.data.token\`)
5. **Variable injection** — which captured variables to inject into this step (e.g. Authorization header uses {{token}})

Format as numbered steps with clear headers. Use {{variableName}} syntax for variable references.
Keep each step concise and production-ready.`;

function stripFences(raw: string): string {
  return raw.replace(/^```(?:\w+)?\s*/im, '').replace(/\s*```$/im, '').trim();
}

export function AiSequenceComposerModal({ protocol, onClose }: Props) {
  const [description, setDescription] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>;
      if (msg?.type === 'aiStream:chunk') {
        streamRef.current += (msg.chunk as string) || '';
        setResult(streamRef.current);
      } else if (msg?.type === 'aiStream:done') {
        setResult(stripFences(streamRef.current));
        setLoading(false);
      } else if (msg?.type === 'aiStream:error') {
        setError((msg.error as string) || 'AI request failed');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleGenerate = useCallback(() => {
    if (!description.trim() || loading) return;
    streamRef.current = '';
    setResult(''); setError(''); setLoading(true);
    postMsg({
      type: 'aiStream',
      payload: {
        systemPrompt: SYSTEM_PROMPT,
        userMessage: `Protocol: ${protocol.toUpperCase()}\n\nWorkflow description: ${description.trim()}`,
        templateKey: 'rest.api.flow',
      },
    });
  }, [description, loading, protocol]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleGenerate();
    if (e.key === 'Escape') onClose();
  };

  const protocolBadge = (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wide"
      style={{ background: `color-mix(in srgb, ${ACCENT} 15%, transparent)`, color: ACCENT }}>
      {protocol.toUpperCase()}
    </span>
  );

  const footerLeft = (
    <span className="text-[10px] text-[var(--color-text-muted)]">⌘↵ to generate</span>
  );

  const footerRight = (
    <ButtonView
      size="md"
      variant="primary"
      accentColor={ACCENT}
      disabled={!description.trim() || loading}
      iconLeft={loading
        ? <span className="inline-block w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
        : <SparkleIcon size={11} />}
      onClick={handleGenerate}
    >
      {loading ? 'Composing…' : 'Compose Sequence'}
    </ButtonView>
  );

  return (
    <ModalView
      open
      onClose={onClose}
      title="Sequence Composer"
      size="lg"
      elevated
      headerColor={ACCENT}
      headerIcon={<SparkleIcon size={14} style={{ color: ACCENT }} />}
      headerRight={protocolBadge}
      footerLeft={footerLeft}
      footerRight={footerRight}
    >
      <div className="flex flex-col gap-3">
        <p className="text-[11px] text-[var(--color-text-muted)]">
          Describe a multi-step user journey in plain English. AI will generate a complete chained request sequence with variable extraction between steps.
        </p>

        <MultilineInputView
          autoFocus
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Login as admin, fetch all users, get the first user details, update their name, delete the user"
          rows={5}
          accentColor={ACCENT}
          style={{ width: '100%' }}
        />

        {error && (
          <p className="text-[11px] px-2.5 py-1.5 rounded"
            style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>
            {error}
          </p>
        )}

        {result && (
          <div className="rounded-lg border p-3 overflow-y-auto"
            style={{ maxHeight: 320, borderColor: 'var(--color-surface-border)', background: 'var(--color-panel)' }}>
            <MdViewer content={result} />
          </div>
        )}
      </div>
    </ModalView>
  );
}
