/**
 * AiGqlFederationModal — AI explains GraphQL federation: cross-subgraph queries, entity resolution, @key directives.
 * Task 10.15 — AI GraphQL Federation Explorer · Gate: gqlFederation
 */
import { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, TabView, type TabItem } from '../../dui';

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

const FEDERATION_TABS: TabItem[] = FEDERATION_MODES.map(m => ({ id: m.key, label: m.label }));

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
    if (!activeTab) return;
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

  return (
    <ModalView
      open
      onClose={onClose}
      title="GraphQL Federation Explorer ✦"
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)`, flexShrink: 0 }}>
          <SparkleIcon size={13} style={{ color: ACCENT }} />
        </div>
      }
      noPadding
    >
      {/* Mode tabs */}
      <div className="px-4 pt-2 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
        <TabView
          tabs={FEDERATION_TABS}
          activeTab={mode}
          onChange={(id) => handleModeChange(id as FederationMode)}
          variant="underline"
          accentColor={ACCENT}
          size="sm"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-5 min-h-0" style={{ maxHeight: '60vh' }}>
        {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
        {loading && !analysis && <p className="text-[11px] animate-pulse text-center py-12" style={{ color: ACCENT }}>Analyzing federation patterns…</p>}
        {analysis && <MdViewer content={analysis} />}
      </div>
    </ModalView>
  );
}
