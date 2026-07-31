/**
 * AiSmartTestSuiteModal — Sprint 12.7
 * Describe what to test in plain English → AI writes the full test suite:
 * happy path, edge cases, error scenarios, boundary values, auth tests.
 * Runs immediately inside Daakia.
 * Gate: smartTestSuiteGen feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import type { CollectionTreeNode } from '../../services/collections';
import { ModalView, AIButtonView, ButtonView, MultilineInputView, CopyButtonView } from '@salilvnair/dui';
import { useAiCollectionCacheStore } from '../../store/ai-collection-cache-store';

interface Props {
  collectionNode: CollectionTreeNode;
  onClose: () => void;
}

const ACCENT = 'var(--color-success)';

const SYSTEM_PROMPT = `You are a test automation expert. Given a plain-English description of what to test, generate a complete test suite using Daakia's dk.test() API.

Test suite structure:
\`\`\`javascript
// ── Happy Path ──────────────────────────────
dk.test("should return 200 for valid request", () => {
  dk.expect(dk.response.status).toBe(200);
  dk.expect(dk.response.json().data).toBeDefined();
});

// ── Edge Cases ───────────────────────────────
dk.test("should handle empty array response", () => {
  dk.expect(Array.isArray(dk.response.json())).toBe(true);
});

// ── Error Scenarios ──────────────────────────
dk.test("should return 401 for missing auth", () => {
  dk.expect(dk.response.status).toBe(401);
});

// ── Boundary Values ──────────────────────────
// ── Auth Tests ───────────────────────────────
\`\`\`

Include tests for: happy path, edge cases, error scenarios, boundary values, performance (response time), and security (auth, exposed fields).
Comment each test group clearly. Use realistic assertions.`;

export function AiSmartTestSuiteModal({ collectionNode, onClose }: Props) {
  const [description, setDescription] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');
  const descRef = useRef('');
  const cacheGet = useAiCollectionCacheStore(s => s.get);
  const cacheSet = useAiCollectionCacheStore(s => s.set);
  const cacheKey = `smart-test-suite:${collectionNode.id}`;

  // Cache-first: reopening this action for the same collection shows the last
  // generated suite instead of an empty form — Regenerate is always explicit.
  useEffect(() => {
    const cached = cacheGet(cacheKey);
    if (!cached) return;
    const p = cached.payload as { description: string; result: string };
    setDescription(p.description); descRef.current = p.description;
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
        cacheSet(cacheKey, { description: descRef.current, result: streamRef.current });
      } else if (msg?.type === 'aiStream:error') {
        setError(msg.error || 'AI request failed');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

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
        userMessage: `Collection: ${collectionNode.name}\n\nTest requirements: ${description.trim()}`,
        templateKey: 'rest.contract.test',
      },
    });
  }, [description, loading, collectionNode.name]);

  return (
    <ModalView
      open
      onClose={onClose}
      title="Smart Test Suite Generator"
      subtitle={collectionNode.name}
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--color-success) 18%, transparent)',
        }}>
          <SparkleIcon size={13} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={result && !loading ? (
        <CopyButtonView text={result} title="Copy test suite" accentColor={ACCENT} />
      ) : undefined}
      footerRight={
        result && !loading ? (
          <ButtonView size="md" onClick={handleGenerate}>Regenerate</ButtonView>
        ) : (
          <AIButtonView
            label={loading ? 'Generating…' : 'Generate Tests'}
            size="md"
            accentColor={ACCENT}
            loading={loading}
            disabled={!description.trim() || loading}
            onClick={handleGenerate}
          />
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
          Describe what to test in plain English. AI generates a complete dk.test() suite: happy path, edge cases, error scenarios, boundary values, and auth tests.
        </p>
        <MultilineInputView
          autoFocus
          value={description}
          onChange={e => { setDescription(e.target.value); descRef.current = e.target.value; }}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleGenerate(); if (e.key === 'Escape') onClose(); }}
          placeholder='e.g. "Test the user CRUD endpoints: successful create with all fields, validation errors for missing email, duplicate username, unauthorized access, and pagination limits"'
          rows={4}
          size="md"
          accentColor={ACCENT}
          width="fw"
        />
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>⌘↵ to generate</span>

        {error && (
          <p style={{
            fontSize: 11, padding: '6px 10px', borderRadius: 6, margin: 0,
            background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)',
          }}>
            {error}
          </p>
        )}

        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Generated Test Suite</span>
            <div style={{
              borderRadius: 8, padding: 12, overflowY: 'auto', maxHeight: 360,
              border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)',
            }}>
              <MdViewer content={result} />
            </div>
          </div>
        )}
      </div>
    </ModalView>
  );
}
