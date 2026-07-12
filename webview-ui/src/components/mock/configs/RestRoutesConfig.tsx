/**
 * RestRoutesConfig — REST route management for mock server.
 */
import { useState } from 'react';
import { ButtonView, IconButtonView, SelectInputView, type SelectOption } from '@salilvnair/dui';
import { ConfirmDialog } from '../../shared';
import { TrashIcon } from '../../../icons';
import { RouteCard } from '../RouteCard';
import { REST_SAMPLES } from '../samples';
import { installSMRestWorkflow } from '../samples/sm-rest-workflows';
import type { MockServer, MockRoute, ConnectedWorkflow } from '../mock-types';
import { MockAiGenerateButton } from '../MockAiGeneratePopover';
import { postMsg } from '../../../vscode';
import { logUiEvent } from '../../../store/ui-audit-store';

const REST_SAMPLE_OPTIONS: SelectOption[] = [
  { value: '', label: 'Load Sample...' },
  ...REST_SAMPLES.map(s => ({ value: s.id, label: s.label })),
];

const REST_COLOR = 'var(--color-protocol-rest)';

interface RestRoutesConfigProps {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
  onAddRoute: () => void;
  onAddGeneratedRoutes?: (routes: Partial<MockRoute>[]) => void;
  onUpdateRoute: (routeId: string, patch: Partial<MockRoute>) => void;
  onDeleteRoute: (routeId: string) => void;
  editingRoute: string | null;
  onEditRoute: (id: string | null) => void;
}

export function RestRoutesConfig({ server, onUpdate, onAddRoute, onAddGeneratedRoutes, onUpdateRoute, onDeleteRoute, editingRoute, onEditRoute }: RestRoutesConfigProps) {
  const [selectedSample, setSelectedSample] = useState('');
  const [showDeleteAll, setShowDeleteAll] = useState(false);

  const applySample = (sampleId: string) => {
    if (!sampleId) return;
    const sample = REST_SAMPLES.find(s => s.id === sampleId);
    if (!sample) return;
    logUiEvent('mock.sample_load', { sampleId, protocol: 'rest' });
    setSelectedSample(sampleId);
    const routes: MockRoute[] = sample.routes.map(r => ({
      id: crypto.randomUUID(),
      ...r,
    }));

    // Install matching SM workflow (idempotent — safe to call every time)
    const workflow = installSMRestWorkflow(sampleId);

    if (workflow) {
      // Use sample's pre-configured stateMachine if provided, else preserve existing
      const smConfig = sample.stateMachine ?? server.stateMachine ?? undefined;
      const existing: ConnectedWorkflow[] = server.connectedWorkflows ?? [];
      const already = existing.find(w => w.workflowId === workflow.id);
      let connectedWorkflows: ConnectedWorkflow[] = already
        ? existing
        : [...existing, { workflowId: workflow.id, name: workflow.name, stateMachine: smConfig }];

      // Install + connect any additional workflows this sample ships with
      // (e.g. a second, independent auth flow reached only by a header-gated
      // route) — each carries its own stateMachine directly on the
      // ConnectedWorkflow entry, since only ONE workflow can use the
      // server-level `stateMachine` fallback slot.
      for (const [lookupKey, extraStateMachine] of Object.entries(sample.additionalWorkflows ?? {})) {
        const extraWorkflow = installSMRestWorkflow(lookupKey);
        if (!extraWorkflow) continue;
        if (connectedWorkflows.find(w => w.workflowId === extraWorkflow.id)) continue;
        connectedWorkflows = [...connectedWorkflows, { workflowId: extraWorkflow.id, name: extraWorkflow.name, stateMachine: extraStateMachine }];
      }

      onUpdate({ routes, description: sample.description, connectedWorkflows, connectedWorkflowId: workflow.id, stateMachine: smConfig });

      // Persist to extension host immediately (MockServerPanel debounced save may lag)
      postMsg({
        type: 'mockServer:patchStateMachine',
        serverId: server.id,
        connectedWorkflows,
        connectedWorkflowId: workflow.id,
        stateMachine: smConfig ?? null,
      });
    } else {
      onUpdate({ routes, description: sample.description });
    }
  };

  const buildAiContext = () => {
    const parts: string[] = [];
    if (server.description?.trim()) {
      parts.push(`Server description:\n${server.description.trim()}`);
    }
    if (server.routes.length > 0) {
      parts.push(`Existing routes:\n${server.routes.map(r => `${r.method} ${r.path}`).join('\n')}`);
    }
    return parts.length > 0 ? parts.join('\n\n') : undefined;
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--color-text-primary)]">Routes ({server.routes.length})</span>
        <div className="flex items-center gap-1.5">
          <SelectInputView
            size="md"
            options={REST_SAMPLE_OPTIONS}
            value={selectedSample}
            onChange={applySample}
            accentColor={REST_COLOR}
          />
          <MockAiGenerateButton
            templateKey="mock.rest.generate"
            title="REST Routes"
            serverName={server.name}
            serverContext={buildAiContext()}
            accentVar={REST_COLOR}
            onAddGeneratedRoutes={onAddGeneratedRoutes}
          />
          <ButtonView
            size="md"
            variant="accent"
            accentColor={REST_COLOR}
            onClick={() => { logUiEvent('mock.cfg_add', { protocol: 'rest' }); onAddRoute(); }}
          >
            + Add Route
          </ButtonView>
          {server.routes.length > 0 && (
            <IconButtonView
              size="md"
              icon={<TrashIcon size={12} />}
              title="Delete All Routes"
              accentColor="var(--color-error)"
              onClick={() => setShowDeleteAll(true)}
            />
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {server.routes.map(route => (
          <RouteCard
            key={route.id}
            route={route}
            isEditing={editingRoute === route.id}
            serverBaseUrl={server.running && server.port ? `http://localhost:${server.port}` : undefined}
            server={server}
            onEdit={() => onEditRoute(editingRoute === route.id ? null : route.id)}
            onUpdate={(patch) => onUpdateRoute(route.id, patch)}
            onDelete={() => onDeleteRoute(route.id)}
          />
        ))}
      </div>

      {showDeleteAll && (
        <ConfirmDialog
          title="Delete All Routes"
          message={`Are you sure you want to delete all ${server.routes.length} routes? This cannot be undone.`}
          confirmLabel="Delete All"
          danger
          onConfirm={() => {
            logUiEvent('mock.cfg_clear', { count: server.routes.length, protocol: 'rest' });
            onUpdate({ routes: [] });
            setShowDeleteAll(false);
          }}
          onCancel={() => setShowDeleteAll(false)}
        />
      )}
    </>
  );
}
