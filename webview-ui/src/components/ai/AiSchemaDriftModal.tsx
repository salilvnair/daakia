/**
 * AiSchemaDriftModal — Sprint 11.7
 * Background agent watches your API. When a response shape changes from what
 * the collection expects → instant alert with field-level diff, severity classification,
 * and suggested fix.
 * Gate: schemaDriftMonitor feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-warning)';

const SYSTEM_PROMPT = `You are an API schema drift detection expert. Compare two API response schemas and identify drift.

For each changed field provide:
- **Severity**: BREAKING (🔴), ADDITIVE (🟢), or DEPRECATION (🟡)
- **Field path** — using dot notation (e.g. data.user.email)
- **Change type**: added, removed, type-changed, renamed, made-optional, made-required
- **Impact** — what breaks if consumers don't update
- **Suggested fix** — exact migration step

Format output as:

## Schema Drift Report

### Drift Summary
X changes detected: Y breaking, Z additive, W deprecations.

### Changes Table
| Field Path | Change Type | Severity | Impact | Fix |
|---|---|---|---|---|
...

### Migration Guide
Ordered steps to safely migrate consumers.

### Auto-Generated Guard Code
\`\`\`javascript
// dk.test assertions to guard against future drift
dk.test("schema guard: user.email still exists", () => {
  dk.expect(dk.response.json().data?.user?.email).toBeDefined();
});
\`\`\``;

export function AiSchemaDriftModal({ onClose }: Props) {
  const [baselineSchema, setBaselineSchema] = useState('');
  const [currentSchema, setCurrentSchema] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setResult(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setResult(streamRef.current); setLoading(false); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'AI request failed'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleDetect = useCallback(() => {
    if ((!baselineSchema.trim() && !currentSchema.trim()) || loading) return;
    streamRef.current = ''; setResult(''); setError(''); setLoading(true);
    postMsg({ type: 'aiStream', payload: {
      systemPrompt: SYSTEM_PROMPT,
      userMessage: `Baseline schema (expected):\n${baselineSchema.trim() || '(not provided)'}\n\n---\n\nCurrent schema (observed):\n${currentSchema.trim() || '(not provided)'}`,
      templateKey: 'rest.schema.validate',
    }});
  }, [baselineSchema, currentSchema, loading]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) e.preventDefault(); }}>
      <div className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{ width: 680, maxHeight: '88vh', background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Schema Drift Monitor ✦</span>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer" style={{ color: 'var(--color-text-muted)' }}><CloseIcon size={14} /></button>
        </div>
        <div className="flex flex-col gap-3 p-4 overflow-y-auto flex-1">
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Compare baseline vs current API response schemas. AI detects field-level drift with severity classification and generates guard tests.
          </p>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-medium mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>Baseline Schema (expected)</label>
              <textarea value={baselineSchema} onChange={e => setBaselineSchema(e.target.value)}
                placeholder="Paste JSON response or TypeScript interface..."
                rows={6} className="w-full rounded text-[11px] px-2.5 py-2 resize-none"
                style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }} />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-medium mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>Current Schema (observed)</label>
              <textarea value={currentSchema} onChange={e => setCurrentSchema(e.target.value)}
                placeholder="Paste current JSON response or TypeScript interface..."
                rows={6} className="w-full rounded text-[11px] px-2.5 py-2 resize-none"
                style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }} />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={handleDetect} disabled={loading}
              className="flex items-center gap-1.5 h-[26px] px-3 rounded text-[11px] font-medium cursor-pointer disabled:opacity-40"
              style={{ background: ACCENT, color: '#fff' }}>
              {loading ? <span className="inline-block w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <SparkleIcon size={11} />}
              {loading ? 'Detecting Drift…' : 'Detect Schema Drift'}
            </button>
          </div>
          {error && <p className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>{error}</p>}
          {result && <div className="rounded border p-3 overflow-y-auto" style={{ maxHeight: 380, borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}><MdViewer content={result} /></div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
