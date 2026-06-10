/**
 * AiSequenceComposerModal — Sprint 11.3
 * "Login → create order → add 3 items → checkout" → AI generates a full chained
 * request sequence with variable extraction between steps.
 * Gate: sequenceComposer feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';

interface Props {
  protocol: string;
  onClose: () => void;
}

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') {
        streamRef.current += msg.chunk;
        setResult(streamRef.current);
      } else if (msg?.type === 'aiStream:done') {
        setResult(streamRef.current);
        setLoading(false);
      } else if (msg?.type === 'aiStream:error') {
        setError(msg.error || 'AI request failed');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleGenerate = useCallback(() => {
    if (!description.trim() || loading) return;
    streamRef.current = '';
    setResult('');
    setError('');
    setLoading(true);
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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
    >
      <div
        className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{
          width: 580, maxHeight: '82vh',
          background: 'var(--color-bg-panel)',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Sequence Composer ✦
          </span>
          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wide"
            style={{ background: 'color-mix(in srgb, var(--color-protocol-ai) 15%, transparent)', color: ACCENT }}>
            {protocol.toUpperCase()}
          </span>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3 p-4 overflow-y-auto flex-1">
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Describe a multi-step user journey in plain English. AI will generate a complete chained request sequence with variable extraction between steps.
          </p>
          <textarea
            ref={textareaRef}
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='e.g. Login as admin, fetch all users, get the first user details, update their name, delete the user'
            rows={4}
            className="w-full rounded text-[11px] px-2.5 py-2 resize-none"
            style={{
              background: 'var(--color-input-bg)',
              border: '1px solid var(--color-input-border)',
              color: 'var(--color-text-primary)',
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>⌘↵ to generate</span>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!description.trim() || loading}
              className="flex items-center gap-1.5 h-[26px] px-3 rounded text-[11px] font-medium cursor-pointer transition-opacity disabled:opacity-40"
              style={{ background: ACCENT, color: '#fff' }}
            >
              {loading ? (
                <span className="inline-block w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <SparkleIcon size={11} />
              )}
              {loading ? 'Composing…' : 'Compose Sequence'}
            </button>
          </div>

          {error && (
            <p className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>
              {error}
            </p>
          )}

          {result && (
            <div className="rounded border p-3 overflow-y-auto" style={{ maxHeight: 320, borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}>
              <MdViewer content={result} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
