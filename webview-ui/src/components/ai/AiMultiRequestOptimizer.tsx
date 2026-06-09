/**
 * AiMultiRequestOptimizer — detects redundant sequential calls and suggests batching.
 * Feature 4.6.24 — AI Multi-Request Optimizer
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SparkleIcon, CloseIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useSidebarDataStore } from '../../store/sidebar-data-store';
import { MdViewer } from '../shared/display/MdViewer';
import { StyledDropdown } from '../shared/controls/StyledDropdown';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const SYSTEM_PROMPT = `You are an API performance optimizer. Analyze a collection of API endpoints and identify optimization opportunities.

Look for:
1. **Batching opportunities**: Multiple GET requests to same resource (GET /users/1, /users/2, /users/3 → GET /users?ids=1,2,3)
2. **N+1 query patterns**: A list request followed by individual detail requests for each item
3. **Redundant calls**: Same endpoint called multiple times with same params
4. **Sequential vs parallel**: Calls that have no dependency and could be parallelized
5. **Missing pagination**: Large list endpoints that should paginate
6. **Unnecessary polling**: Repeated calls that should use webhooks/SSE instead

Format as markdown with:
## ⚡ Optimization Report

### Critical (Save >50% calls)
- **Pattern**: description
  **Current**: what the API is doing
  **Optimized**: what it should do instead
  **Savings**: estimated call reduction

### Recommended
- ...

### Minor
- ...`;

export function AiMultiRequestOptimizer({ onClose }: Props) {
  const [selectedCollection, setSelectedCollection] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');
  const collections = useSidebarDataStore(s => s.getCollections('rest'));

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;
      if (msg.type === 'ai:chunk') { accRef.current += (msg.delta as string) || ''; setResult(accRef.current); }
      if (msg.type === 'ai:complete') { setResult(accRef.current || ''); setLoading(false); }
      if (msg.type === 'ai:error') { setError((msg.message as string) || 'Analysis failed.'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const run = () => {
    const collection = collections.find(c => c.id === selectedCollection);
    if (!collection) { setError('Select a collection first.'); return; }
    setLoading(true);
    setResult('');
    setError('');
    accRef.current = '';
    const pid = `ai-optimizer-${Date.now()}`;
    reqIdRef.current = pid;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'collection.optimize',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt: `Analyze collection "${collection.name}" for optimization opportunities.`,
      conversation: [], tools: [],
      settings: { temperature: 0.2, maxTokens: 1500, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[660px] max-h-[90vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Multi-Request Optimizer</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Detect N+1 queries, redundant calls, batching opportunities</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Collection to analyze</label>
            <StyledDropdown value={selectedCollection} options={collections.map(c => ({ value: c.id, label: c.name }))} onChange={setSelectedCollection} placeholder="Select collection…" />
          </div>

          {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

          {loading && !result && (
            <div className="flex gap-1 items-center py-4">
              {[0, 150, 300].map(d => (<span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse" style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />))}
              <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Analyzing request patterns…</span>
            </div>
          )}

          {result && (
            <div className="rounded-lg border p-4"
              style={{ borderColor: `color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))`, backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-panel))` }}>
              <MdViewer content={result} />
              {loading && <span className="inline-block w-[2px] h-[12px] ml-0.5 animate-pulse" style={{ backgroundColor: ACCENT }} />}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0 gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
          {result && !loading && (
            <button type="button" onClick={run} className="h-[30px] px-3 text-[11px] rounded-md cursor-pointer border" style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
              Re-analyze
            </button>
          )}
          <button type="button" onClick={run} disabled={loading || !selectedCollection}
            className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-40 text-white"
            style={{ backgroundColor: ACCENT }}>
            <SparkleIcon size={11} className="inline mr-1" />
            Analyze
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
