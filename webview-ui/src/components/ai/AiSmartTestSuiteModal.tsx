/**
 * AiSmartTestSuiteModal — Sprint 12.7
 * Describe what to test in plain English → AI writes the full test suite:
 * happy path, edge cases, error scenarios, boundary values, auth tests.
 * Runs immediately inside Daakia.
 * Gate: smartTestSuiteGen feature flag
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
  const [copied, setCopied] = useState(false);
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
        userMessage: `Collection: ${collectionNode.name}\n\nTest requirements: ${description.trim()}`,
        templateKey: 'rest.contract.test',
      },
    });
  }, [description, loading, collectionNode.name]);

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
        style={{ width: 600, maxHeight: '86vh', background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Smart Test Suite Generator ✦</span>
          <span className="ml-1 px-2 py-0.5 rounded text-[10px] font-mono truncate max-w-[140px]"
            style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-muted)' }}>{collectionNode.name}</span>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4 overflow-y-auto flex-1">
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Describe what to test in plain English. AI generates a complete dk.test() suite: happy path, edge cases, error scenarios, boundary values, and auth tests.
          </p>
          <textarea
            ref={textareaRef}
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleGenerate(); if (e.key === 'Escape') onClose(); }}
            placeholder='e.g. "Test the user CRUD endpoints: successful create with all fields, validation errors for missing email, duplicate username, unauthorized access, and pagination limits"'
            rows={4}
            className="w-full rounded text-[11px] px-2.5 py-2 resize-none"
            style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
          />
          <div className="flex justify-between items-center">
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>⌘↵ to generate</span>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!description.trim() || loading}
              className="flex items-center gap-1.5 h-[26px] px-3 rounded text-[11px] font-medium cursor-pointer disabled:opacity-40"
              style={{ background: ACCENT, color: '#fff' }}
            >
              {loading ? <span className="inline-block w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <SparkleIcon size={11} />}
              {loading ? 'Generating…' : 'Generate Tests'}
            </button>
          </div>

          {error && <p className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>{error}</p>}

          {result && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Generated Test Suite</span>
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
              <div className="rounded border p-3 overflow-y-auto" style={{ maxHeight: 360, borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}>
                <MdViewer content={result} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
