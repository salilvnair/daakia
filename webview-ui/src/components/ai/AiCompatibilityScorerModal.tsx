/**
 * AiCompatibilityScorerModal — Sprint 12.4
 * Compare two API versions; AI scores breaking change severity per endpoint,
 * generates migration guide, suggests adapter patterns.
 * Gate: compatibilityScorer feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import type { CollectionTreeNode } from '../../services/collections';

interface Props {
  collectionNode: CollectionTreeNode;
  onClose: () => void;
}

const ACCENT = 'var(--color-info)';

const SYSTEM_PROMPT = `You are an API compatibility expert. Given descriptions of two API versions, analyze breaking changes and generate a migration guide.

Score each endpoint change with severity:
- 🔴 **BREAKING** — existing clients will fail (removed fields, type changes, renamed endpoints)
- 🟡 **WARNING** — may break some clients (optional field made required, changed defaults)
- 🟢 **INFO** — non-breaking additions (new optional fields, new endpoints)

Output format:
## Compatibility Score: X% (Y breaking, Z warning, W info)

### Breaking Changes
| Endpoint | Change | Impact |
|---|---|---|
...

### Migration Guide
Step-by-step upgrade instructions.

### Adapter Patterns
Code patterns to maintain backward compatibility.`;

export function AiCompatibilityScorerModal({ collectionNode, onClose }: Props) {
  const [v1Desc, setV1Desc] = useState('');
  const [v2Desc, setV2Desc] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');

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

  const handleAnalyze = useCallback(() => {
    if ((!v1Desc.trim() && !v2Desc.trim()) || loading) return;
    streamRef.current = '';
    setResult('');
    setError('');
    setLoading(true);
    postMsg({
      type: 'aiStream',
      payload: {
        systemPrompt: SYSTEM_PROMPT,
        userMessage: `Collection: ${collectionNode.name}\n\nAPI Version 1 description:\n${v1Desc.trim() || '(current collection)'}\n\nAPI Version 2 description:\n${v2Desc.trim() || '(target version)'}`,
        templateKey: 'rest.schema.validate',
      },
    });
  }, [v1Desc, v2Desc, loading, collectionNode.name]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
    >
      <div
        className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{ width: 600, maxHeight: '84vh', background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>API Compatibility Scorer ✦</span>
          <span className="ml-1 px-2 py-0.5 rounded text-[10px] font-mono truncate max-w-[140px]"
            style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-muted)' }}>
            {collectionNode.name}
          </span>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4 overflow-y-auto flex-1">
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Describe two API versions. AI will score breaking changes by severity and generate a migration guide.
          </p>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-medium mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>Version 1 (current / old)</label>
              <textarea
                value={v1Desc}
                onChange={e => setV1Desc(e.target.value)}
                placeholder="Describe v1 API or paste OpenAPI spec snippet…"
                rows={4}
                className="w-full rounded text-[11px] px-2.5 py-2 resize-none"
                style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-medium mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>Version 2 (new / target)</label>
              <textarea
                value={v2Desc}
                onChange={e => setV2Desc(e.target.value)}
                placeholder="Describe v2 API or paste OpenAPI spec snippet…"
                rows={4}
                className="w-full rounded text-[11px] px-2.5 py-2 resize-none"
                style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={loading}
              className="flex items-center gap-1.5 h-[26px] px-3 rounded text-[11px] font-medium cursor-pointer disabled:opacity-40"
              style={{ background: ACCENT, color: '#fff' }}
            >
              {loading ? <span className="inline-block w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <SparkleIcon size={11} />}
              {loading ? 'Analyzing…' : 'Score Compatibility'}
            </button>
          </div>
          {error && <p className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>{error}</p>}
          {result && (
            <div className="rounded border p-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}>
              <MdViewer content={result} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
