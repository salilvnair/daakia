/**
 * AiDocGeneratorModal — Sprint 12.6
 * AI generates polished API documentation from a collection:
 * endpoint descriptions, parameter tables, examples, auth guide.
 * Exports to Markdown, HTML, OpenAPI.
 * Gate: docAutoGenerator feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, SparkleIcon, CopyIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import type { CollectionTreeNode } from '../../services/collections';

interface Props {
  collectionNode: CollectionTreeNode;
  onClose: () => void;
}

const ACCENT = 'var(--color-success)';

type DocFormat = 'markdown' | 'openapi' | 'html';

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
  const [copied, setCopied] = useState(false);
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

  const handleCopy = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(result).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
    >
      <div
        className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{ width: 640, maxHeight: '86vh', background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Documentation Generator ✦</span>
          <span className="ml-1 px-2 py-0.5 rounded text-[10px] font-mono truncate max-w-[140px]"
            style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-muted)' }}>{collectionNode.name}</span>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4 overflow-y-auto flex-1">
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            AI generates polished API documentation from your collection. Choose output format and optionally add notes.
          </p>

          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Format:</label>
            {(Object.keys(FORMAT_LABELS) as DocFormat[]).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className="h-[26px] px-2.5 rounded text-[11px] font-medium cursor-pointer transition-colors"
                style={{
                  background: format === f ? ACCENT : 'var(--color-bg-surface)',
                  color: format === f ? '#fff' : 'var(--color-text-muted)',
                  border: `1px solid ${format === f ? ACCENT : 'var(--color-border)'}`,
                }}
              >
                {FORMAT_LABELS[f]}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes (e.g. 'include authentication flow section, target audience: frontend devs')"
            className="h-[26px] px-2.5 rounded text-[11px] w-full"
            style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
          />

          <div className="flex justify-between items-center">
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Generates complete API docs from collection structure</span>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="flex items-center gap-1.5 h-[26px] px-3 rounded text-[11px] font-medium cursor-pointer disabled:opacity-40"
              style={{ background: ACCENT, color: '#fff' }}
            >
              {loading ? <span className="inline-block w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <SparkleIcon size={11} />}
              {loading ? 'Generating…' : 'Generate Docs'}
            </button>
          </div>

          {error && <p className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>{error}</p>}

          {result && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Generated Documentation</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 h-[22px] px-2 rounded text-[10px] cursor-pointer"
                  style={{ background: copied ? 'var(--color-success)' : 'var(--color-bg-surface)', color: copied ? '#fff' : 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                >
                  <CopyIcon size={10} />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="rounded border p-3 overflow-y-auto" style={{ maxHeight: 340, borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}>
                {format === 'markdown' ? <MdViewer content={result} /> : (
                  <pre className="text-[10px] font-mono whitespace-pre-wrap" style={{ color: 'var(--color-text-primary)' }}>{result}</pre>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
