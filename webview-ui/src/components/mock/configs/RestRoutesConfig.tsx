/**
 * RestRoutesConfig — REST route management for mock server.
 */
import { useState } from 'react';
import { StyledDropdown, type DropdownOption } from '../../shared';
import { RouteCard } from '../RouteCard';
import { REST_SAMPLES } from '../samples';
import type { MockServer, MockRoute } from '../mock-types';
import { MockAiGenerateButton } from '../MockAiGeneratePopover';

const REST_SAMPLE_OPTIONS: DropdownOption[] = [
  { value: '', label: 'Load Sample...' },
  ...REST_SAMPLES.map(s => ({ value: s.id, label: s.label })),
];

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
            accentColor="var(--color-mock-server)"
          />
          <MockAiGenerateButton
            templateKey="mock.rest.generate"
            title="REST Routes"
            serverName={server.name}
            serverContext={buildAiContext()}
            onAddGeneratedRoutes={onAddGeneratedRoutes}
          />
          <button
            type="button"
            onClick={onAddRoute}
            className="h-[28px] px-2.5 text-[11px] rounded-md text-[var(--color-mock-server)] border border-[rgba(234,179,8,0.25)] hover:bg-[rgba(234,179,8,0.1)] cursor-pointer transition-colors"
          >
            + Add Route
          </button>
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
    </>
  );
}
