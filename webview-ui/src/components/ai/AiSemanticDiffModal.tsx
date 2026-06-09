/**
 * AiSemanticDiffModal — AI understands intent behind API response changes.
 * Feature 4.6.22 — AI API Diff (Semantic)
 *
 * Not just "field removed" — AI understands: "userName renamed to username"
 * vs "userName removed and unrelated username added"
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SparkleIcon, CloseIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';

interface Props {
  responseBodyA?: string;
  responseBodyB?: string;
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const SYSTEM_PROMPT = `You are a semantic API diff analyzer. Given two API responses, provide an intelligent diff that understands intent — not just structural differences.

For each difference, classify it as:
- 🔄 **Rename**: field was renamed (userName → username — same data, different key)
- ➕ **Added**: genuinely new field
- ➖ **Removed**: field no longer present
- 🔀 **Type changed**: field exists but type changed (string → number)
- 📦 **Restructured**: data moved (user.address → user.location.address)
- ⚠️ **Breaking change**: will cause clients to break

Format:
## Semantic Diff Analysis

### Summary
[1-2 sentences about the overall change]

### Changes
[List each change with classification emoji, field name, and explanation]

### Breaking Changes
[List any breaking changes that will affect existing clients]

### Migration Notes
[What consumers of this API need to update]`;

export function AiSemanticDiffModal({ responseBodyA = '', responseBodyB = '', onClose }: Props) {
  const [bodyA, setBodyA] = useState(responseBodyA);
  const [bodyB, setBodyB] = useState(responseBodyB);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;
      if (msg.type === 'ai:chunk') { accRef.current += (msg.delta as string) || ''; setResult(accRef.current); }
      if (msg.type === 'ai:complete') { setResult(accRef.current || ''); setLoading(false); }
      if (msg.type === 'ai:error') { setError((msg.message as string) || 'Diff failed.'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const run = () => {
    if (!bodyA.trim() || !bodyB.trim()) { setError('Paste both API responses to compare.'); return; }
    setLoading(true);
    setResult('');
    setError('');
    accRef.current = '';
    const pid = `ai-diff-${Date.now()}`;
    reqIdRef.current = pid;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'rest.semantic.diff',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt: `Response A (before/old):\n${bodyA.slice(0, 3000)}\n\nResponse B (after/new):\n${bodyB.slice(0, 3000)}`,
      conversation: [], tools: [],
      settings: { temperature: 0.1, maxTokens: 1200, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[780px] max-h-[92vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Semantic API Diff</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">AI understands intent — renames vs removals, breaking vs non-breaking</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 gap-0">
          {/* Two-pane input */}
          <div className="flex flex-col w-1/3 border-r" style={{ borderColor: 'var(--color-surface-border)' }}>
            <div className="px-3 py-2 border-b text-[11px] font-medium" style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface-hover)' }}>
              Response A (old)
            </div>
            <textarea value={bodyA} onChange={e => { setBodyA(e.target.value); setError(''); }}
              className="flex-1 p-3 text-[10.5px] font-mono resize-none outline-none"
              placeholder='{"userName": "John", "userId": 123}'
              style={{ backgroundColor: 'var(--color-panel)', color: 'var(--color-text-primary)' }} />
          </div>

          <div className="flex flex-col w-1/3 border-r" style={{ borderColor: 'var(--color-surface-border)' }}>
            <div className="px-3 py-2 border-b text-[11px] font-medium" style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface-hover)' }}>
              Response B (new)
            </div>
            <textarea value={bodyB} onChange={e => { setBodyB(e.target.value); setError(''); }}
              className="flex-1 p-3 text-[10.5px] font-mono resize-none outline-none"
              placeholder='{"username": "John", "id": 123, "createdAt": "2026-01-01"}'
              style={{ backgroundColor: 'var(--color-panel)', color: 'var(--color-text-primary)' }} />
          </div>

          {/* Analysis pane */}
          <div className="flex flex-col flex-1">
            <div className="px-3 py-2 border-b text-[11px] font-medium" style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface-hover)' }}>
              Semantic Analysis
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {loading && !result && (
                <div className="flex gap-1 items-center py-4">
                  {[0, 150, 300].map(d => (<span key={d} className="w-[4px] h-[4px] rounded-full animate-pulse" style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />))}
                  <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Analyzing…</span>
                </div>
              )}
              {result && <MdViewer content={result} />}
              {!result && !loading && (
                <p className="text-[11px] text-center py-8" style={{ color: 'var(--color-text-muted)' }}>Paste both responses and click Analyze</p>
              )}
            </div>
          </div>
        </div>

        {error && <p className="text-[11px] px-5 py-1" style={{ color: 'var(--color-error)' }}>{error}</p>}

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0 gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button type="button" onClick={run} disabled={loading || !bodyA.trim() || !bodyB.trim()}
            className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-40 text-white"
            style={{ backgroundColor: ACCENT }}>
            <SparkleIcon size={11} className="inline mr-1" />
            Analyze Diff
          </button>
          <button type="button" onClick={onClose}
            className="h-[30px] px-4 text-[11px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
