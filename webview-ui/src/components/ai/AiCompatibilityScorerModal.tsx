/**
 * AiCompatibilityScorerModal — Sprint 12.4
 * Compare two API versions; AI scores breaking change severity per endpoint,
 * generates migration guide, suggests adapter patterns.
 * Gate: compatibilityScorer feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import type { CollectionTreeNode } from '../../services/collections';
import { ModalView, AIButtonView, ButtonView, EditorView, SplitPanelView, ResizablePanelView } from '@salilvnair/dui';
import { useAiCollectionCacheStore } from '../../store/ai-collection-cache-store';

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
  const v1Ref = useRef('');
  const v2Ref = useRef('');
  const cacheGet = useAiCollectionCacheStore(s => s.get);
  const cacheSet = useAiCollectionCacheStore(s => s.set);
  const cacheKey = `compat-scorer:${collectionNode.id}`;

  // Cache-first: reopening this action for the same collection shows the last
  // comparison instead of an empty form — Regenerate is always explicit.
  useEffect(() => {
    const cached = cacheGet(cacheKey);
    if (!cached) return;
    const p = cached.payload as { v1Desc: string; v2Desc: string; result: string };
    setV1Desc(p.v1Desc); v1Ref.current = p.v1Desc;
    setV2Desc(p.v2Desc); v2Ref.current = p.v2Desc;
    setResult(p.result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') {
        streamRef.current += msg.chunk;
        setResult(streamRef.current);
      } else if (msg?.type === 'aiStream:done') {
        setResult(streamRef.current);
        setLoading(false);
        cacheSet(cacheKey, { v1Desc: v1Ref.current, v2Desc: v2Ref.current, result: streamRef.current });
      } else if (msg?.type === 'aiStream:error') {
        setError(msg.error || 'AI request failed');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

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

  return (
    <ModalView
      open
      onClose={onClose}
      title="API Compatibility Scorer ✦"
      subtitle={collectionNode.name}
      size="xl"
      headerColor={ACCENT}
      headerIcon={
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--color-info) 18%, transparent)',
        }}>
          <SparkleIcon size={13} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        result && !loading ? (
          <ButtonView size="md" onClick={handleAnalyze}>Regenerate</ButtonView>
        ) : (
          <AIButtonView
            label={loading ? 'Analyzing…' : 'Score Compatibility'}
            size="md"
            accentColor={ACCENT}
            loading={loading}
            disabled={loading || (!v1Desc.trim() && !v2Desc.trim())}
            onClick={handleAnalyze}
          />
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
          Describe two API versions. AI will score breaking changes by severity and generate a migration guide.
        </p>
        <ResizablePanelView defaultHeight={240} minHeight={160} maxHeight={520} borderRadius={8}>
          <SplitPanelView
            direction="horizontal"
            accentColor={ACCENT}
            defaultSplit={50}
            minFirst={160}
            minSecond={160}
            first={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%', paddingRight: 8 }}>
                <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', flexShrink: 0 }}>Version 1 (current / old)</label>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <EditorView
                    value={v1Desc}
                    onChange={v => { setV1Desc(v); v1Ref.current = v; }}
                    language="yaml"
                    height="100%"
                    size="md"
                    bordered
                    placeholder="Describe v1 API or paste OpenAPI spec snippet…"
                  />
                </div>
              </div>
            }
            second={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%', paddingLeft: 8 }}>
                <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', flexShrink: 0 }}>Version 2 (new / target)</label>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <EditorView
                    value={v2Desc}
                    onChange={v => { setV2Desc(v); v2Ref.current = v; }}
                    language="yaml"
                    height="100%"
                    size="md"
                    bordered
                    placeholder="Describe v2 API or paste OpenAPI spec snippet…"
                  />
                </div>
              </div>
            }
          />
        </ResizablePanelView>

        {error && (
          <p style={{
            fontSize: 11, padding: '6px 10px', borderRadius: 6, margin: 0,
            background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)',
          }}>
            {error}
          </p>
        )}

        {result && (
          <div style={{ borderRadius: 8, padding: 12, border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
            <MdViewer content={result} />
          </div>
        )}
      </div>
    </ModalView>
  );
}
