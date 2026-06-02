/**
 * GraphQLConfig — GraphQL schema + operations config for mock server.
 */
import { useState } from 'react';
import { TrashIcon, CopyIcon, CheckIcon, DiagonalLinesPattern } from '../../../icons';
import { CodeEditor, StyledDropdown, ResizablePanel, ConfirmDialog, type DropdownOption } from '../../shared';
import { GRAPHQL_SAMPLES } from '../samples';
import type { MockServer } from '../mock-types';

const GRAPHQL_SAMPLE_OPTIONS: DropdownOption[] = [
  { value: '', label: 'Load Sample...' },
  ...GRAPHQL_SAMPLES.map(s => ({ value: s.id, label: s.label })),
];

interface GraphQLConfigProps {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
}

export function GraphQLConfig({ server, onUpdate }: GraphQLConfigProps) {
  const [selectedSample, setSelectedSample] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--color-text-primary)]">Schema (SDL)</span>
        <div className="flex items-center gap-1.5">
          <StyledDropdown
            size="sm"
            options={GRAPHQL_SAMPLE_OPTIONS}
            value={selectedSample}
            onChange={applySample}
            accentColor="var(--color-mock-server)"
          />
          <button
            type="button"
            onClick={() => {/* TODO: AI generate */}}
            className="h-[28px] px-2.5 text-[10px] rounded-md text-[var(--color-protocol-graphql)] border border-[rgba(229,53,171,0.2)] hover:bg-[rgba(229,53,171,0.08)] cursor-pointer transition-colors opacity-50"
            title="Coming soon"
          >
            ✨ Generate with AI
          </button>
        </div>
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
        <button
          type="button"
          onClick={() => {
            const ops = server.graphqlOperations || [];
            onUpdate({ graphqlOperations: [...ops, { id: crypto.randomUUID(), operationType: 'query', operationName: '', response: '{\n  "data": {}\n}', statusCode: 200, delay: 0, enabled: true }] });
          }}
          className="h-[28px] px-2.5 text-[11px] rounded-md text-[var(--color-mock-server)] border border-[rgba(234,179,8,0.25)] hover:bg-[rgba(234,179,8,0.1)] cursor-pointer transition-colors"
        >
          + Add Operation
        </button>
      </div>
      {(server.graphqlOperations || []).map((op, i) => (
        <div key={op.id} className={`relative rounded-lg border p-3 flex flex-col gap-2 transition-all ${
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

          <div className={`flex items-center gap-2 ${op.enabled === false ? 'opacity-50' : ''}`}>
            <button
              type="button"
              onClick={() => {
                const ops = [...(server.graphqlOperations || [])];
                ops[i] = { ...op, enabled: op.enabled === false ? true : false };
                onUpdate({ graphqlOperations: ops });
              }}
              className="relative z-20 w-[28px] h-[14px] rounded-full transition-colors flex-shrink-0 cursor-pointer"
              style={{ backgroundColor: op.enabled !== false ? 'var(--color-success)' : 'var(--color-muted-fallback)' }}
              title={op.enabled !== false ? 'Disable' : 'Enable'}
            >
              <span className="absolute top-[2px] w-[10px] h-[10px] rounded-full bg-white transition-all" style={{ left: op.enabled !== false ? '16px' : '2px' }} />
            </button>
            <StyledDropdown
              size="sm"
              value={op.operationType}
              onChange={(val) => {
                const ops = [...(server.graphqlOperations || [])];
                ops[i] = { ...op, operationType: val as any };
                onUpdate({ graphqlOperations: ops });
              }}
              options={[
                { value: 'query', label: 'Query' },
                { value: 'mutation', label: 'Mutation' },
                { value: 'subscription', label: 'Subscription' },
              ]}
              accentColor="var(--color-mock-server)"
            />
            <input
              type="text"
              value={op.operationName}
              onChange={(e) => {
                const ops = [...(server.graphqlOperations || [])];
                ops[i] = { ...op, operationName: e.target.value };
                onUpdate({ graphqlOperations: ops });
              }}
              placeholder="Operation name (optional)"
              className="flex-1 h-[28px] px-2.5 text-[12px] font-mono rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
            />
            {gqlUrl && op.enabled !== false && (
              <button
                type="button"
                onClick={() => copyEndpoint(op.id)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
                title="Copy endpoint URL"
              >
                {copiedId === op.id ? <CheckIcon size={12} className="text-[var(--color-success)]" /> : <CopyIcon size={12} />}
              </button>
            )}
            {op.enabled !== false && (
              <button
                type="button"
                onClick={() => setDeleteConfirmId(op.id)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer"
              >
                <TrashIcon size={12} />
              </button>
            )}
          </div>
          {op.enabled !== false && (
            <ResizablePanel id={`mock.gql.op.${op.id}`} defaultHeight={80} minHeight={50} maxHeight={400}>
              <CodeEditor
                value={op.response}
                onChange={(val) => {
                  const ops = [...(server.graphqlOperations || [])];
                  ops[i] = { ...op, response: val };
                  onUpdate({ graphqlOperations: ops });
                }}
                language="json"
                height="100%"
              />
            </ResizablePanel>
          )}
        </div>
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
    </div>
  );
}
