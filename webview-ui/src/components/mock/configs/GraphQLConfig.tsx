/**
 * GraphQLConfig — GraphQL schema + operations config for mock server.
 */
import { useState } from 'react';
import {
  SelectInputView, EditorView, ResizablePanelView, ButtonView, IconButtonView,
  ToggleSwitchView, TextInputView, TabView, type SelectOption, type TabItem,
} from '@salilvnair/dui';
import { TrashIcon, CopyIcon, CheckIcon, DiagonalLinesPattern } from '../../../icons';
import { ConfirmDialog } from '../../shared';
import { GRAPHQL_SAMPLES } from '../samples';
import type { MockServer, MockRoute } from '../mock-types';
import { MockAiGenerateButton, type ParsedGenericItem } from '../MockAiGeneratePopover';
import type { GraphQLMockOperation } from '../mock-types';
import { logUiEvent } from '../../../store/ui-audit-store';
import { SequencePanel } from '../wiremock/SequencePanel';
import { MatchBuilderPanel } from '../wiremock/MatchBuilderPanel';
import { FaultInjectionPanel } from '../wiremock/FaultInjectionPanel';

type GQLOpTab = 'response' | 'sequence' | 'matching' | 'advanced';

const GQL_OP_TABS: TabItem[] = [
  { id: 'response', label: 'Response' },
  { id: 'sequence', label: 'Sequence' },
  { id: 'matching', label: 'Matching' },
  { id: 'advanced', label: 'Advanced' },
];

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

const GRAPHQL_SAMPLE_OPTIONS: SelectOption[] = [
  { value: '', label: 'Load Sample...' },
  ...GRAPHQL_SAMPLES.map(s => ({ value: s.id, label: s.label })),
];

const OP_TYPE_OPTIONS: SelectOption[] = [
  { value: 'query', label: 'Query' },
  { value: 'mutation', label: 'Mutation' },
  { value: 'subscription', label: 'Subscription' },
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
    logUiEvent('mock.sample_load', { sampleId, protocol: 'graphql' });
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
      <ResizablePanelView id={`mock.gql.schema.${server.id}`} defaultHeight={200} minHeight={80} maxHeight={500}>
        <EditorView
          value={server.graphqlSchema || 'type Query {\n  hello: String!\n  users: [User!]!\n}\n\ntype User {\n  id: ID!\n  name: String!\n  email: String\n}'}
          onChange={(val) => onUpdate({ graphqlSchema: val })}
          language="graphql"
          height="100%"
        />
      </ResizablePanelView>

      <div className="flex items-center justify-between mt-2">
        <span className="text-[12px] font-medium text-[var(--color-text-primary)]">Mock Operations ({server.graphqlOperations?.length || 0})</span>
        <div className="flex items-center gap-1.5">
          <SelectInputView
            size="md"
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
          <ButtonView
            size="md"
            variant="accent"
            accentColor={GQL_COLOR}
            onClick={() => {
              logUiEvent('mock.cfg_add', { protocol: 'graphql' });
              const ops = server.graphqlOperations || [];
              onUpdate({ graphqlOperations: [...ops, { id: crypto.randomUUID(), operationType: 'query', operationName: '', response: '{\n  "data": {}\n}', statusCode: 200, delay: 0, enabled: true }] });
            }}
          >
            + Add Operation
          </ButtonView>
          {(server.graphqlOperations || []).length > 0 && (
            <IconButtonView
              size="md"
              icon={<TrashIcon size={12} />}
              accentColor="var(--color-error)"
              onClick={() => setShowDeleteAll(true)}
              title="Delete All Operations"
            />
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
            logUiEvent('mock.cfg_clear', { count: (server.graphqlOperations || []).length, protocol: 'graphql' });
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
        <ToggleSwitchView
          checked={op.enabled !== false}
          onChange={(v) => onUpdate({ enabled: v })}
          accentColor="var(--color-success)"
          size="xs"
        />
        <SelectInputView
          size="md"
          options={OP_TYPE_OPTIONS}
          value={op.operationType}
          onChange={(val) => onUpdate({ operationType: val as GraphQLMockOperation['operationType'] })}
          accentColor={GQL_COLOR}
        />
        <TextInputView
          value={op.operationName}
          onChange={(e) => onUpdate({ operationName: e.target.value })}
          placeholder="Operation name (optional)"
          size="md"
          style={{ flex: 1, fontFamily: 'monospace' }}
        />
        {gqlUrl && op.enabled !== false && (
          <IconButtonView
            size="sm"
            icon={copiedId === op.id ? <CheckIcon size={12} className="text-[var(--color-success)]" /> : <CopyIcon size={12} />}
            onClick={() => onCopyEndpoint(op.id)}
            title="Copy endpoint URL"
          />
        )}
        {op.enabled !== false && (
          <IconButtonView
            size="sm"
            icon={<TrashIcon size={12} />}
            accentColor="var(--color-error)"
            onClick={onDelete}
          />
        )}
      </div>

      {/* Tab bar — only when enabled */}
      {op.enabled !== false && (
        <>
          <div className="border-t border-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] px-3">
            <TabView
              tabs={GQL_OP_TABS}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as GQLOpTab)}
              variant="underline"
              size="xs"
              accentColor={GQL_COLOR}
            />
          </div>

          <div className="p-3 flex flex-col gap-2">
            {activeTab === 'response' && (
              <ResizablePanelView id={`mock.gql.op.${op.id}`} defaultHeight={80} minHeight={50} maxHeight={400}>
                <EditorView value={op.response} onChange={(val) => onUpdate({ response: val })} language="json" height="100%" />
              </ResizablePanelView>
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
