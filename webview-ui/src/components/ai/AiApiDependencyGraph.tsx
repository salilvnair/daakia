/**
 * AiApiDependencyGraph — AI analyzes collection and shows visual request dependency map.
 * Feature 4.6.10 — AI API Dependency Graph
 */
import { useState, useEffect, useRef } from 'react';
import { SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useSidebarDataStore } from '../../store/sidebar-data-store';
import { MdViewer } from '../shared/display/MdViewer';
import { ModalView, AIButtonView, SelectInputView } from '../../dui';
import { useAiCollectionCacheStore } from '../../store/ai-collection-cache-store';

interface DependencyNode {
  name: string;
  method: string;
  url: string;
  dependsOn: string[];
  provides: string[];
  note?: string;
}

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const SYSTEM_PROMPT = `You are an API dependency analyzer. Given a collection of API endpoints, identify which requests depend on which.

A dependency exists when:
- Request B needs a value extracted from Request A's response (e.g., userId from login → used in getUser)
- Request B can only succeed after Request A (e.g., must create before you can update)

Return ONLY a JSON array:
[
  {
    "name": "Login",
    "method": "POST",
    "url": "/auth/login",
    "dependsOn": [],
    "provides": ["authToken", "userId"],
    "note": "Entry point — must run first"
  },
  {
    "name": "Get User",
    "method": "GET",
    "url": "/users/{userId}",
    "dependsOn": ["Login"],
    "provides": ["userEmail", "userRole"],
    "note": "Requires userId from Login response"
  }
]`;

export function AiApiDependencyGraph({ onClose }: Props) {
  const [selectedCollection, setSelectedCollection] = useState('');
  const [graph, setGraph] = useState<DependencyNode[] | null>(null);
  const [rawResult, setRawResult] = useState('');
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');
  const collections = useSidebarDataStore(s => s.getCollections('rest'));
  const cacheGet = useAiCollectionCacheStore(s => s.get);
  const cacheSet = useAiCollectionCacheStore(s => s.set);

  // Cache-first: picking a collection that was already analyzed shows the last
  // result instead of re-running the AI call — Analyze again is always explicit.
  useEffect(() => {
    if (!selectedCollection) return;
    const cached = cacheGet(`dependency-graph:${selectedCollection}`);
    if (!cached) { setGraph(null); setExplanation(''); return; }
    const p = cached.payload as { graph: DependencyNode[] | null; explanation: string };
    setGraph(p.graph);
    setExplanation(p.explanation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCollection]);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;
      if (msg.type === 'ai:chunk') {
        accRef.current += (msg.delta as string) || '';
        setRawResult(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        const content = accRef.current || '';
        setLoading(false);
        let parsedGraph: DependencyNode[] | null = null;
        let parsedExplanation = '';
        try { parsedGraph = JSON.parse(content); }
        catch { parsedExplanation = content; }
        setGraph(parsedGraph);
        setExplanation(parsedExplanation);
        cacheSet(`dependency-graph:${selectedCollection}`, { graph: parsedGraph, explanation: parsedExplanation });
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'Analysis failed.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCollection]);

  const run = () => {
    const collection = collections.find(c => c.id === selectedCollection);
    if (!collection) { setError('Select a collection first.'); return; }
    setLoading(true);
    setRawResult('');
    setGraph(null);
    setExplanation('');
    setError('');
    accRef.current = '';
    const pid = `ai-deps-${Date.now()}`;
    reqIdRef.current = pid;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'collection.dependency.graph',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt: `Analyze dependencies for collection: ${collection.name}\n\nEndpoints: (collection data would be serialized here)`,
      conversation: [], tools: [],
      settings: { temperature: 0.1, maxTokens: 2000, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="API Dependency Graph"
      subtitle="Visualize which requests depend on which"
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
        <AIButtonView
          label={loading ? 'Analyzing…' : 'Analyze Dependencies'}
          size="md"
          accentColor={ACCENT}
          loading={loading}
          disabled={loading || !selectedCollection}
          onClick={run}
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>Collection</label>
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

        {loading && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '16px 0' }}>
            {[0, 150, 300].map(d => (
              <span key={d} className="animate-pulse" style={{
                width: 5, height: 5, borderRadius: '50%', background: ACCENT, animationDelay: `${d}ms`,
              }} />
            ))}
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>Analyzing dependencies…</span>
          </div>
        )}

        {graph && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: ACCENT, margin: 0 }}>✦ {graph.length} requests mapped</p>
            {graph.map((node, i) => (
              <div key={i} style={{
                borderRadius: 8, padding: 12,
                border: '1px solid var(--color-surface-border)', background: 'var(--color-panel)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: 'var(--color-btn-primary-text, #fff)', padding: '2px 6px', borderRadius: 4,
                    background: 'var(--color-info)',
                  }}>
                    {node.method}
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{node.name}</span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>{node.url}</span>
                </div>
                {node.dependsOn.length > 0 && (
                  <p style={{ fontSize: 10, margin: '0 0 2px', color: 'var(--color-warning)' }}>
                    ← Depends on: {node.dependsOn.join(', ')}
                  </p>
                )}
                {node.provides.length > 0 && (
                  <p style={{ fontSize: 10, margin: '0 0 2px', color: 'var(--color-success)' }}>
                    → Provides: {node.provides.map(p => `{{${p}}}`).join(', ')}
                  </p>
                )}
                {node.note && (
                  <p style={{ fontSize: 10, margin: '4px 0 0', color: 'var(--color-text-muted)' }}>{node.note}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {explanation && !graph && (
          <div style={{ borderRadius: 8, padding: 16, border: '1px solid var(--color-surface-border)' }}>
            <MdViewer content={explanation} />
          </div>
        )}
      </div>
    </ModalView>
  );
}
