/**
 * AiDocGeneratorModal — Sprint 12.6
 * AI generates polished API documentation from a collection:
 * endpoint descriptions, parameter tables, examples, auth guide.
 * Exports to Markdown, HTML, OpenAPI.
 * Gate: docAutoGenerator feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import type { CollectionTreeNode } from '../../services/collections';
import { ModalView, AIButtonView, SegmentedControlView, TextInputView, CopyButtonView } from '@salilvnair/dui';
import { useAiCollectionCacheStore } from '../../store/ai-collection-cache-store';

interface Props {
  collectionNode: CollectionTreeNode;
  onClose: () => void;
}

const ACCENT = 'var(--color-success)';

type DocFormat = 'markdown' | 'openapi' | 'html';

const FORMAT_OPTIONS: { value: DocFormat; label: string }[] = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'openapi', label: 'OpenAPI 3.1' },
  { value: 'html', label: 'HTML' },
];

const FORMAT_LABELS: Record<DocFormat, string> = {
  markdown: 'Markdown',
  openapi: 'OpenAPI 3.1',
  html: 'HTML',
};

const SYSTEM_PROMPTS: Record<DocFormat, string> = {
  markdown: `You are a technical writer. Generate polished API documentation in Markdown format.

Include for each endpoint:
- ## Endpoint name (bold method + path)
- Short description of what it does
- ### Request section: URL, method, path params table, query params table, request body schema with examples
- ### Response section: status codes table, response body schema, example response JSON
- Auth requirements if applicable

Make it developer-friendly, clear, and production-quality.`,
  openapi: `You are an OpenAPI 3.1 spec writer. Generate a complete OpenAPI 3.1 YAML specification.

Include: openapi version, info (title, version, description), servers, paths with operations, components/schemas.
Use proper OpenAPI 3.1 syntax. Make schemas explicit with types and examples.`,
  html: `You are a technical writer. Generate clean, styled HTML API documentation.
Use semantic HTML, inline CSS for a clean modern look. No external dependencies.
Include: page title, endpoint cards with method badge, parameter tables, code examples with syntax highlighting using <pre> tags.`,
};

export function AiDocGeneratorModal({ collectionNode, onClose }: Props) {
  const [format, setFormat] = useState<DocFormat>('markdown');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');
  const cacheGet = useAiCollectionCacheStore(s => s.get);
  const cacheSet = useAiCollectionCacheStore(s => s.set);
  const cacheKey = `doc-gen:${collectionNode.id}:${format}`;

  // Cache-first: switching back to a format already generated for this collection
  // shows the last doc instead of re-running the AI call — Regenerate is explicit.
  useEffect(() => {
    const cached = cacheGet(cacheKey);
    setResult(cached ? (cached.payload as string) : '');
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
        cacheSet(cacheKey, streamRef.current);
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
    if (loading) return;
    streamRef.current = '';
    setResult('');
    setError('');
    setLoading(true);
    postMsg({
      type: 'aiStream',
      payload: {
        systemPrompt: SYSTEM_PROMPTS[format],
        userMessage: `Collection: ${collectionNode.name}\nFormat: ${FORMAT_LABELS[format]}\n${notes.trim() ? `\nAdditional notes: ${notes.trim()}` : ''}`,
        templateKey: 'platform.openapi.generator',
      },
    });
  }, [format, notes, loading, collectionNode.name]);

  return (
    <ModalView
      open
      onClose={onClose}
      title="Documentation Generator ✦"
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
        <CopyButtonView text={result} title="Copy documentation" accentColor={ACCENT} />
      ) : undefined}
      footerRight={
        <AIButtonView
          label={loading ? 'Generating…' : 'Generate Docs'}
          size="md"
          accentColor={ACCENT}
          loading={loading}
          disabled={loading}
          onClick={handleGenerate}
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
          AI generates polished API documentation from your collection. Choose output format and optionally add notes.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Format:</label>
          <SegmentedControlView
            options={FORMAT_OPTIONS}
            value={format}
            onChange={v => setFormat(v as DocFormat)}
            size="sm"
            accentColor={ACCENT}
          />
        </div>

        <TextInputView
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Optional notes (e.g. 'include authentication flow section, target audience: frontend devs')"
          size="md"
          width="fw"
        />

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
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Generated Documentation</span>
            <div style={{
              borderRadius: 8, padding: 12, overflowY: 'auto', maxHeight: 340,
              border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)',
            }}>
              {format === 'markdown' ? <MdViewer content={result} /> : (
                <pre style={{ fontSize: 10, fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0, color: 'var(--color-text-primary)' }}>{result}</pre>
              )}
            </div>
          </div>
        )}
      </div>
    </ModalView>
  );
}
