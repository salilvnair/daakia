/**
 * GraphQLConfig — GraphQL schema + operations config for mock server.
 */
import { useState } from 'react';
import { TrashIcon, CopyIcon, CheckIcon, DiagonalLinesPattern } from '../../../icons';
import { CodeEditor, StyledDropdown, ResizablePanel, ConfirmDialog, type DropdownOption } from '../../shared';
import { GRAPHQL_SAMPLES } from '../samples';
import type { MockServer, MockRoute } from '../mock-types';
import { MockAiGenerateButton, type ParsedGenericItem } from '../MockAiGeneratePopover';
import type { GraphQLMockOperation } from '../mock-types';
import { SequencePanel } from '../wiremock/SequencePanel';
import { MatchBuilderPanel } from '../wiremock/MatchBuilderPanel';
import { FaultInjectionPanel } from '../wiremock/FaultInjectionPanel';

type GQLOpTab = 'response' | 'sequence' | 'matching' | 'advanced';

function gqlOpToRoute(op: GraphQLMockOperation): MockRoute {
  return {
    id: op.id, method: 'POST', path: op.operationName, statusCode: op.statusCode,
    headers: {}, body: op.response, delay: op.delay, enabled: op.enabled,
    responses: op.responses, sequenceMode: op.sequenceMode,
    urlMatch: op.urlMatch, headerMatchers: op.headerMatchers,
    queryParamMatchers: op.queryParamMatchers, cookieMatchers: op.cookieMatchers,
    bodyMatcher: op.bodyMatcher, compositeLogic: op.compositeLogic,
    priority: op.priority, fault: op.fault, rateLimit: op.rateLimit,
  };
}

function routeToGQLPatch(patch: Partial<MockRoute>): Partial<GraphQLMockOperation> {
  const { responses, sequenceMode, urlMatch, headerMatchers, queryParamMatchers,
          cookieMatchers, bodyMatcher, compositeLogic, priority, fault, rateLimit } = patch;
  return { responses, sequenceMode, urlMatch, headerMatchers, queryParamMatchers,
           cookieMatchers, bodyMatcher, compositeLogic, priority, fault, rateLimit };
}

const GRAPHQL_SAMPLE_OPTIONS: DropdownOption[] = [
  { value: '', label: 'Load Sample...' },
  ...GRAPHQL_SAMPLES.map(s => ({ value: s.id, label: s.label })),
];

const GQL_COLOR = 'var(--color-protocol-graphql)';

interface GraphQLConfigProps {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
}

export function GraphQLConfig({ server, onUpdate }: GraphQLConfigProps) {
  const [selectedSample, setSelectedSample] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);

  const gqlUrl = server.running && server.port ? `http://localhost:${server.port}/graphql` : '';

  const copyEndpoint = (id: string) => {
    if (!gqlUrl) return;
    navigator.clipboard.writeText(gqlUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const applySample = (sampleId: string) => {
    if (!sampleId) return;
    const sample = GRAPHQL_SAMPLES.find(s => s.id === sampleId);
    if (!sample) return;
    setSelectedSample(sampleId);
    onUpdate({
      description: sample.description,
      graphqlSchema: sample.schema,
      graphqlOperations: sample.operations.map(op => ({
        id: crypto.randomUUID(),
        operationType: op.operationType,
        operationName: op.operationName,
        response: op.response,
        statusCode: 200,
        delay: 0,
        enabled: true,
      })),
    });
  };

  const handleAddGeneratedItems = (items: ParsedGenericItem[]) => {
    const newOps: GraphQLMockOperation[] = items.map(item => {
      const d = item.data as { operationType?: string; operationName?: string; response?: string; statusCode?: number };
      return {
        id: crypto.randomUUID(),
        operationType: (['query', 'mutation', 'subscription'].includes(d.operationType || '') ? d.operationType : 'query') as 'query' | 'mutation' | 'subscription',
        operationName: d.operationName || item.name,
        response: d.response || '{\n  "data": {}\n}',
        statusCode: d.statusCode || 200,
        delay: 0,
        enabled: true,
      };
    });
    onUpdate({ graphqlOperations: [...(server.graphqlOperations || []), ...newOps] });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--color-text-primary)]">Schema (SDL)</span>
      </div>
      <p className="text-[10px] text-[var(--color-text-muted)]">
        Define a GraphQL schema (SDL) so the GraphQL client can introspect this mock server and show Schema/Documentation panels.
      </p>
      <ResizablePanel id={`mock.gql.schema.${server.id}`} defaultHeight={200} minHeight={80} maxHeight={500}>
        <CodeEditor
          value={server.graphqlSchema || 'type Query {\n  hello: String!\n  users: [User!]!\n}\n\ntype User {\n  id: ID!\n  name: String!\n  email: String\n}'}
          onChange={(val) => onUpdate({ graphqlSchema: val })}
          language="graphql"
          height="100%"
        />
      </ResizablePanel>

      <div className="flex items-center justify-between mt-2">
        <span className="text-[12px] font-medium text-[var(--color-text-primary)]">Mock Operations ({server.graphqlOperations?.length || 0})</span>
        <div className="flex items-center gap-1.5">
          <StyledDropdown
            size="sm"
            options={GRAPHQL_SAMPLE_OPTIONS}
            value={selectedSample}
            onChange={applySample}
            accentColor={GQL_COLOR}
          />
          <MockAiGenerateButton
            templateKey="mock.graphql.generate"
            title="GraphQL Operations"
            serverName={server.name}
            serverContext={[
              server.description?.trim() ? `Server description (MANDATORY — use strictly as primary context):\n${server.description.trim()}` : '',
              server.graphqlSchema ? `Existing schema:\n${server.graphqlSchema}` : '',
            ].filter(Boolean).join('\n\n') || undefined}
            accentVar={GQL_COLOR}
            onAddGeneratedItems={handleAddGeneratedItems}
          />
          <button
            type="button"
            onClick={() => {
              const ops = server.graphqlOperations || [];
              onUpdate({ graphqlOperations: [...ops, { id: crypto.randomUUID(), operationType: 'query', operationName: '', response: '{\n  "data": {}\n}', statusCode: 200, delay: 0, enabled: true }] });
            }}
            className="h-[26px] px-2.5 text-[11px] rounded cursor-pointer transition-colors border"
            style={{ color: GQL_COLOR, borderColor: `color-mix(in srgb, ${GQL_COLOR} 30%, transparent)` }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `color-mix(in srgb, ${GQL_COLOR} 10%, transparent)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            + Add Operation
          </button>
          {(server.graphqlOperations || []).length > 0 && (
            <button
              type="button"
              onClick={() => setShowDeleteAll(true)}
              title="Delete All Operations"
              className="h-[26px] w-[26px] flex items-center justify-center rounded cursor-pointer transition-colors border border-[rgba(239,68,68,0.3)] text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)]"
            >
              <TrashIcon size={12} />
            </button>
          )}
        </div>
      </div>
      {(server.graphqlOperations || []).map((op, i) => (
        <GQLOperationCard
          key={op.id}
          op={op}
          gqlUrl={gqlUrl}
          copiedId={copiedId}
          onCopyEndpoint={copyEndpoint}
          onDelete={() => setDeleteConfirmId(op.id)}
          onUpdate={(patch) => {
            const ops = [...(server.graphqlOperations || [])];
            ops[i] = { ...ops[i], ...patch };
            onUpdate({ graphqlOperations: ops });
          }}
        />
      ))}

      {deleteConfirmId && (
        <ConfirmDialog
          title="Delete Operation"
          message="Are you sure you want to delete this GraphQL operation? This cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            const ops = (server.graphqlOperations || []).filter(o => o.id !== deleteConfirmId);
            onUpdate({ graphqlOperations: ops });
            setDeleteConfirmId(null);
          }}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}

      {showDeleteAll && (
        <ConfirmDialog
          title="Delete All Operations"
          message={`Are you sure you want to delete all ${(server.graphqlOperations || []).length} operations? This cannot be undone.`}
          confirmLabel="Delete All"
          danger
          onConfirm={() => {
            onUpdate({ graphqlOperations: [] });
            setShowDeleteAll(false);
          }}
          onCancel={() => setShowDeleteAll(false)}
        />
      )}
    </div>
  );
}

// ─── GQL Operation Card ───────────────────────────────────────────────────────

interface GQLOperationCardProps {
  op: GraphQLMockOperation;
  gqlUrl: string;
  copiedId: string | null;
  onCopyEndpoint: (id: string) => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<GraphQLMockOperation>) => void;
}

function GQLOperationCard({ op, gqlUrl, copiedId, onCopyEndpoint, onDelete, onUpdate }: GQLOperationCardProps) {
  const [activeTab, setActiveTab] = useState<GQLOpTab>('response');

  return (
    <div className={`relative rounded-lg border flex flex-col transition-all overflow-hidden ${
      op.enabled !== false
        ? 'border-[var(--color-surface-border)] bg-[var(--color-surface)]'
        : 'border-[var(--color-surface-border)] bg-[var(--color-panel)]'
    }`}>
      {/* Disabled overlay */}
      {op.enabled === false && (
        <div className="absolute inset-0 rounded-lg z-10 pointer-events-none overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg bg-[var(--color-muted-fallback)]" />
          <DiagonalLinesPattern patternId={`disabled-gql-${op.id}`} />
        </div>
      )}

      {/* Header row */}
      <div className={`flex items-center gap-2 p-3 ${op.enabled === false ? 'opacity-50' : ''}`}>
        <button type="button"
          onClick={() => onUpdate({ enabled: op.enabled === false ? true : false })}
          className="relative z-20 w-[28px] h-[14px] rounded-full transition-colors flex-shrink-0 cursor-pointer"
          style={{ backgroundColor: op.enabled !== false ? 'var(--color-success)' : 'var(--color-muted-fallback)' }}
          title={op.enabled !== false ? 'Disable' : 'Enable'}>
          <span className="absolute top-[2px] w-[10px] h-[10px] rounded-full bg-white transition-all" style={{ left: op.enabled !== false ? '16px' : '2px' }} />
        </button>
        <StyledDropdown size="sm" value={op.operationType}
          onChange={(val) => onUpdate({ operationType: val as GraphQLMockOperation['operationType'] })}
          options={[{ value: 'query', label: 'Query' }, { value: 'mutation', label: 'Mutation' }, { value: 'subscription', label: 'Subscription' }]}
          accentColor={GQL_COLOR} />
        <input type="text" value={op.operationName}
          onChange={(e) => onUpdate({ operationName: e.target.value })}
          placeholder="Operation name (optional)"
          className="flex-1 h-[26px] px-2.5 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none" />
        {gqlUrl && op.enabled !== false && (
          <button type="button" onClick={() => onCopyEndpoint(op.id)}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors" title="Copy endpoint URL">
            {copiedId === op.id ? <CheckIcon size={12} className="text-[var(--color-success)]" /> : <CopyIcon size={12} />}
          </button>
        )}
        {op.enabled !== false && (
          <button type="button" onClick={onDelete} className="text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer">
            <TrashIcon size={12} />
          </button>
        )}
      </div>

      {/* Tab bar — only when enabled */}
      {op.enabled !== false && (
        <>
          <div className="flex items-center gap-0 border-t border-b border-[rgba(255,255,255,0.06)] px-3">
            {(['response', 'sequence', 'matching', 'advanced'] as GQLOpTab[]).map(tab => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                className="h-[28px] px-2.5 text-[10px] font-medium cursor-pointer transition-colors"
                style={{
                  borderBottom: activeTab === tab ? `2px solid ${GQL_COLOR}` : '2px solid transparent',
                  color: activeTab === tab ? GQL_COLOR : 'var(--color-text-muted)',
                  marginBottom: '-1px',
                }}>
                {tab === 'response' ? 'Response' : tab === 'sequence' ? 'Sequence' : tab === 'matching' ? 'Matching' : 'Advanced'}
              </button>
            ))}
          </div>

          <div className="p-3 flex flex-col gap-2">
            {activeTab === 'response' && (
              <ResizablePanel id={`mock.gql.op.${op.id}`} defaultHeight={80} minHeight={50} maxHeight={400}>
                <CodeEditor value={op.response} onChange={(val) => onUpdate({ response: val })} language="json" height="100%" />
              </ResizablePanel>
            )}
            {activeTab === 'sequence' && (
              <SequencePanel route={gqlOpToRoute(op)} onUpdate={(patch) => onUpdate(routeToGQLPatch(patch))} />
            )}
            {activeTab === 'matching' && (
              <MatchBuilderPanel route={gqlOpToRoute(op)} onUpdate={(patch) => onUpdate(routeToGQLPatch(patch))} />
            )}
            {activeTab === 'advanced' && (
              <FaultInjectionPanel route={gqlOpToRoute(op)} onUpdate={(patch) => onUpdate(routeToGQLPatch(patch))} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
