/**
 * AiGqlFederationModal — AI explains GraphQL federation: cross-subgraph queries, entity resolution, @key directives.
 * Task 10.15 — AI GraphQL Federation Explorer · Gate: gqlFederation
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore } from '../../store/tabs-store';
import { CloseIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-graphql)';

const FEDERATION_MODES = [
  { key: 'overview', label: 'Federation Overview' },
  { key: 'entities', label: '@key & Entities' },
  { key: 'query', label: 'Cross-Subgraph Query' },
  { key: 'stitching', label: 'Schema Stitching' },
] as const;

type FederationMode = typeof FEDERATION_MODES[number]['key'];

export function AiGqlFederationModal({ onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [mode, setMode] = useState<FederationMode>('overview');
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');

  useEffect(() => { analyze(mode); }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setAnalysis(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setLoading(false); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'Analysis failed'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const analyze = (m: FederationMode) => {
    if (!activeTab || loading) return;
    streamRef.current = ''; setAnalysis(''); setError(''); setLoading(true);

    const schema = activeTab.graphqlSchema || activeTab.introspectionSchema || '';
    const query = activeTab.graphqlQuery || activeTab.body || '';

    const prompts: Record<FederationMode, string> = {
      overview: `You are a GraphQL Federation expert. ${schema ? `Given this GraphQL schema:\n\`\`\`graphql\n${String(schema).slice(0, 2000)}\n\`\`\`` : 'Without a specific schema loaded,'} explain:

## GraphQL Federation Architecture
1. What Apollo Federation 2.0 is and how it differs from a monolithic GraphQL schema
2. How the supergraph (gateway) and subgraphs communicate
3. The role of the Router, subgraph services, and the compose step
4. Key federation directives: @key, @external, @requires, @provides, @link, @shareable, @inaccessible, @override

## Benefits Over Monolithic GraphQL
- Team autonomy, independent deployments, schema ownership
- Performance: parallel subgraph resolution

## Common Patterns
With concrete SDL examples for each concept.`,

      entities: `You are a GraphQL Federation expert. Explain entity resolution in Apollo Federation 2.0${schema ? ` for this schema:\n\`\`\`graphql\n${String(schema).slice(0, 2000)}\n\`\`\`` : ''}:

## @key Directive & Entity Definition
- Primary vs compound keys
- How to define an entity in a subgraph
- The __resolveReference function

## Cross-Subgraph Entity References
- How one subgraph references another's entity
- @external and @extends pattern
- @requires for dependent fields

## Entity Resolution Flow
Step-by-step walkthrough of how the Router resolves entities across subgraphs, with a concrete example.

## Common Pitfalls
- N+1 issues and batching with DataLoader
- Circular dependencies between subgraphs`,

      query: `You are a GraphQL Federation expert. ${query ? `Analyze this GraphQL query for federation patterns:\n\`\`\`graphql\n${String(query).slice(0, 1500)}\n\`\`\`` : 'Explain how cross-subgraph queries work in Apollo Federation 2.0:'}

## Query Planning
How the Router decomposes a federated query into subgraph fetch plans.

## Entity Fetching
How the __entities query works under the hood when crossing subgraph boundaries.

## Performance Considerations
- Query plan visualization
- Parallel vs sequential subgraph calls
- How @provides can optimize away an extra subgraph hop

## Example Query Plan
Show a concrete example query plan JSON for a multi-subgraph query.`,

      stitching: `You are a GraphQL Federation expert. Compare Apollo Federation 2.0 vs Schema Stitching:

## Schema Stitching (Legacy)
- How it works: merge schemas at the gateway layer
- Limitations: runtime merging, type conflicts, delegation complexity

## Apollo Federation 2.0 (Modern)
- Declarative subgraph ownership with @key
- Composition-time validation with rover compose
- Managed federation with Apollo Studio

## Migration Path
Step-by-step guide to migrate from schema stitching to federation.

## Tooling
- rover CLI, Apollo Studio, IntelliJ plugin
- Testing federated schemas with rover subgraph check

Include SDL examples for both approaches showing the same entity in each style.`,
    };

    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{ role: 'user', content: prompts[m] }],
      stream: true,
    });
  };

  const handleModeChange = (m: FederationMode) => {
    setMode(m);
    analyze(m);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onMouseDown={e => e.stopPropagation()}>
      <div className="relative flex flex-col rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--color-panel)', borderColor: `color-mix(in srgb, ${ACCENT} 30%, var(--color-surface-border))`, width: 700, maxHeight: '87vh' }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex items-center gap-2">
            <SparkleIcon size={14} style={{ color: ACCENT }} />
            <span className="text-[13px] font-semibold" style={{ color: ACCENT }}>GraphQL Federation Explorer ✦</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-[var(--color-hover)] cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
            <CloseIcon size={13} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex items-center gap-0 px-4 pt-2 pb-0 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          {FEDERATION_MODES.map(m => (
            <button key={m.key} type="button" onClick={() => handleModeChange(m.key)}
              className="px-3 py-1.5 text-[11px] font-medium cursor-pointer transition-all border-b-2 -mb-[1px]"
              style={{
                color: mode === m.key ? ACCENT : 'var(--color-text-muted)',
                borderBottomColor: mode === m.key ? ACCENT : 'transparent',
              }}
            >{m.label}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-5 min-h-0">
          {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
          {loading && !analysis && <p className="text-[11px] animate-pulse text-center py-12" style={{ color: ACCENT }}>Analyzing federation patterns…</p>}
          {analysis && <MdViewer content={analysis} />}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[var(--color-hover)]" style={{ color: 'var(--color-text-muted)' }}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
