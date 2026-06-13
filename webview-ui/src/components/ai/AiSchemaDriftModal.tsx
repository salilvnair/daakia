/**
 * AiSchemaDriftModal — Sprint 11.7
 * Background agent watches your API. When a response shape changes from what
 * the collection expects → instant alert with field-level diff, severity classification,
 * and suggested fix.
 * Gate: schemaDriftMonitor feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView, SplitPanelView, EditorView } from '../../dui';

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

  return (
    <ModalView
      open
      onClose={onClose}
      title="Schema Drift Monitor ✦"
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--color-warning) 18%, transparent)',
        }}>
          <SparkleIcon size={13} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        <AIButtonView
          label={loading ? 'Detecting Drift…' : 'Detect Schema Drift'}
          size="sm"
          accentColor={ACCENT}
          disabled={loading}
          onClick={handleDetect}
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
          Compare baseline vs current API response schemas. AI detects field-level drift with severity classification and generates guard tests.
        </p>

        {/* Side-by-side editors */}
        <div style={{ height: 240 }}>
          <SplitPanelView
            direction="horizontal"
            defaultSplit={50}
            minFirst={140}
            minSecond={140}
            first={
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingRight: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                  Baseline Schema (expected)
                </label>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <EditorView
                    value={baselineSchema}
                    onChange={setBaselineSchema}
                    language="json"
                    height="100%"
                    placeholder="Paste JSON response or TypeScript interface..."
                    bordered
                  />
                </div>
              </div>
            }
            second={
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingLeft: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                  Current Schema (observed)
                </label>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <EditorView
                    value={currentSchema}
                    onChange={setCurrentSchema}
                    language="json"
                    height="100%"
                    placeholder="Paste current JSON response or TypeScript interface..."
                    bordered
                  />
                </div>
              </div>
            }
          />
        </div>

        {error && (
          <p style={{
            fontSize: 11, padding: '6px 10px', borderRadius: 6, margin: 0,
            background: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
            color: 'var(--color-error)',
          }}>
            {error}
          </p>
        )}

        {result && (
          <EditorView
            value={result}
            language="markdown"
            height="300px"
            readOnly
            wordWrap
            bordered
          />
        )}
      </div>
    </ModalView>
  );
}
