/**
 * RestRoutesConfig — REST route management for mock server.
 */
import { useState } from 'react';
import { StyledDropdown, ConfirmDialog, type DropdownOption } from '../../shared';
import { TrashIcon } from '../../../icons';
import { RouteCard } from '../RouteCard';
import { REST_SAMPLES } from '../samples';
import type { MockServer, MockRoute } from '../mock-types';
import { MockAiGenerateButton } from '../MockAiGeneratePopover';

const REST_SAMPLE_OPTIONS: DropdownOption[] = [
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
    setSelectedSample(sampleId);
    const routes: MockRoute[] = sample.routes.map(r => ({
      id: crypto.randomUUID(),
      ...r,
    }));
    onUpdate({ routes, description: sample.description });
  };

  // Build AI context: description (user's full text context) + existing routes
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
          <StyledDropdown
            size="sm"
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
          <button
            type="button"
            onClick={onAddRoute}
            className="h-[28px] px-2.5 text-[11px] rounded-md cursor-pointer transition-colors border"
            style={{ color: REST_COLOR, borderColor: `color-mix(in srgb, ${REST_COLOR} 30%, transparent)` }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `color-mix(in srgb, ${REST_COLOR} 10%, transparent)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            + Add Route
          </button>
          {server.routes.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDeleteAll(true)}
              title="Delete All Routes"
              className="h-[28px] w-[28px] flex items-center justify-center rounded-md cursor-pointer transition-colors border border-[rgba(239,68,68,0.3)] text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)]"
            >
              <TrashIcon size={12} />
            </button>
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
            onUpdate({ routes: [] });
            setShowDeleteAll(false);
          }}
          onCancel={() => setShowDeleteAll(false)}
        />
      )}
    </>
  );
}
