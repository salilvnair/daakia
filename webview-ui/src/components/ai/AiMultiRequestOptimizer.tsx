/**
 * AiMultiRequestOptimizer — detects redundant sequential calls and suggests batching.
 * Feature 4.6.24 — AI Multi-Request Optimizer
 */
import { useState, useEffect, useRef } from 'react';
import { SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useSidebarDataStore } from '../../store/sidebar-data-store';
import { MdViewer } from '../shared/display/MdViewer';
import { ModalView, AIButtonView, ButtonView, SelectInputView } from '../../dui';
import { useAiCollectionCacheStore } from '../../store/ai-collection-cache-store';

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
  const cacheGet = useAiCollectionCacheStore(s => s.get);
  const cacheSet = useAiCollectionCacheStore(s => s.set);
  const cacheKey = `optimizer:${selectedCollection}`;

  // Cache-first: picking a collection already analyzed shows the last result
  // instead of re-running the AI call — Re-analyze is always explicit.
  useEffect(() => {
    if (!selectedCollection) return;
    const cached = cacheGet(cacheKey);
    setResult(cached ? (cached.payload as string) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;
      if (msg.type === 'ai:chunk') { accRef.current += (msg.delta as string) || ''; setResult(accRef.current); }
      if (msg.type === 'ai:complete') {
        const content = accRef.current || '';
        setResult(content);
        setLoading(false);
        if (selectedCollection) cacheSet(cacheKey, content);
      }
      if (msg.type === 'ai:error') { setError((msg.message as string) || 'Analysis failed.'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

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

  return (
    <ModalView
      open
      onClose={onClose}
      title="Multi-Request Optimizer"
      subtitle="Detect N+1 queries, redundant calls, batching opportunities"
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--color-protocol-ai) 18%, transparent)',
        }}>
          <SparkleIcon size={13} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        <>
          {result && !loading && (
            <ButtonView size="md" onClick={run}>Re-analyze</ButtonView>
          )}
          <AIButtonView
            label={loading ? 'Analyzing…' : 'Analyze'}
            size="md"
            accentColor={ACCENT}
            loading={loading}
            disabled={loading || !selectedCollection}
            onClick={run}
          />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>Collection to analyze</label>
          <SelectInputView
            value={selectedCollection}
            options={collections.map(c => ({ value: c.id, label: c.name }))}
            onChange={setSelectedCollection}
            placeholder="Select collection…"
            size="md"
            accentColor={ACCENT}
            width="100%"
          />
        </div>

        {error && <p style={{ fontSize: 11, color: 'var(--color-error)', margin: 0 }}>{error}</p>}

        {loading && !result && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '16px 0' }}>
            {[0, 150, 300].map(d => (
              <span key={d} className="animate-pulse" style={{
                width: 5, height: 5, borderRadius: '50%', background: ACCENT, animationDelay: `${d}ms`,
              }} />
            ))}
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>Analyzing request patterns…</span>
          </div>
        )}

        {result && (
          <div style={{
            borderRadius: 8, padding: 16,
            border: `1px solid color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))`,
            background: `color-mix(in srgb, ${ACCENT} 3%, var(--color-panel))`,
          }}>
            <MdViewer content={result} />
            {loading && <span className="animate-pulse" style={{ display: 'inline-block', width: 2, height: 12, marginLeft: 2, background: ACCENT }} />}
          </div>
        )}
      </div>
    </ModalView>
  );
}
