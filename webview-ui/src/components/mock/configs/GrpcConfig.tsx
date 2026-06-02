import { useState, useMemo } from 'react';
import { CodeEditor, StyledDropdown, ConfirmDialog, DurationInput } from '../../shared';
import type { DropdownOption } from '../../shared';
import { TrashIcon, DiagonalLinesPattern, ChevronRightIcon, GrpcUnaryIcon, GrpcServerStreamIcon, GrpcClientStreamIcon, GrpcBidiStreamIcon } from '../../../icons';
import { GRPC_SAMPLES } from '../samples/grpc';
import { useUiStateStore } from '../../../store/ui-state-store';
import type { MockServer, GrpcMockMethod } from '../mock-types';

const ACCENT = 'var(--color-mock-server)';

const RPC_TYPE_OPTIONS: DropdownOption[] = [
  { value: 'unary', label: 'Unary' },
  { value: 'server_streaming', label: 'Server Streaming' },
  { value: 'client_streaming', label: 'Client Streaming' },
  { value: 'bidi_streaming', label: 'Bidi Streaming' },
];

const STREAM_TYPE_CONFIG: Record<string, { icon: typeof GrpcUnaryIcon; color: string; label: string }> = {
  unary: { icon: GrpcUnaryIcon, color: '#60a5fa', label: 'UNARY' },
  server_streaming: { icon: GrpcServerStreamIcon, color: '#fbbf24', label: 'SERVER STREAM' },
  client_streaming: { icon: GrpcClientStreamIcon, color: '#4ade80', label: 'CLIENT STREAM' },
  bidi_streaming: { icon: GrpcBidiStreamIcon, color: '#f472b6', label: 'BIDI STREAM' },
};

const SAMPLE_OPTIONS: DropdownOption[] = [
  { value: '', label: 'Load Sample...' },
  { value: '__no_proto_header', label: '── No Proto ──', isHeader: true },
  ...GRPC_SAMPLES.filter(s => s.category === 'no-proto').map(s => ({ value: s.id, label: s.label })),
  { value: '__with_proto_header', label: '── With Proto ──', isHeader: true },
  ...GRPC_SAMPLES.filter(s => s.category === 'with-proto').map(s => ({ value: s.id, label: s.label })),
];

interface GrpcMethodRow {
  id: string;
  service: string;
  method: string;
  type: 'unary' | 'server_streaming' | 'client_streaming' | 'bidi_streaming';
  response: string;
  enabled: boolean;
  delay: number;
  statusCode: number;
  serviceEnabled: boolean;
}

interface ServiceGroup {
  service: string;
  methods: GrpcMethodRow[];
}

interface GrpcConfigProps {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
}

/**
 * GrpcConfig — gRPC mock server configuration panel.
 * Service → Method hierarchy with reordering support.
 */
export function GrpcConfig({ server, onUpdate }: GrpcConfigProps) {
  // Persist expanded state via ui-state-store
  const storedExpanded = useUiStateStore(s => s.getPref(`mock.grpc.expanded.${server.id}`));
  const storedMethodId = useUiStateStore(s => s.getPref(`mock.grpc.expandedMethod.${server.id}`));
  const [expandedServices, setExpandedServices] = useState<Set<string>>(() => {
    if (storedExpanded) try { return new Set(JSON.parse(storedExpanded)); } catch { /* */ }
    return new Set();
  });
  const [expandedMethodId, setExpandedMethodId] = useState<string | null>(storedMethodId || null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'service' | 'method'; id: string; label: string } | null>(null);

  const methods: GrpcMethodRow[] = (server.grpcMethods || []).map(m => ({
    id: m.id,
    service: m.service || '',
    method: m.method || '',
    type: m.type || 'unary',
    response: m.response || '{}',
    enabled: m.enabled !== false,
    delay: m.delay || 0,
    statusCode: m.statusCode ?? 0,
    serviceEnabled: m.serviceEnabled !== false,
  }));

  // Group methods by service, preserving order of first appearance
  const serviceGroups: ServiceGroup[] = useMemo(() => {
    const map = new Map<string, GrpcMethodRow[]>();
    for (const m of methods) {
      const existing = map.get(m.service);
      if (existing) existing.push(m);
      else map.set(m.service, [m]);
    }
    return Array.from(map.entries()).map(([service, mths]) => ({ service, methods: mths }));
  }, [methods]);

  const update = (newMethods: GrpcMethodRow[]) => {
    onUpdate({ grpcMethods: newMethods as GrpcMockMethod[] });
  };

  const addService = () => {
    const svcName = `mypackage.NewService${serviceGroups.length + 1}`;
    update([...methods, {
      id: crypto.randomUUID(),
      service: svcName,
      method: 'MyMethod',
      type: 'unary',
      response: '{\n  "message": "Hello from gRPC mock"\n}',
      enabled: true,
      delay: 0,
      statusCode: 0,
      serviceEnabled: true,
    }]);
    setExpandedServices(prev => new Set(prev).add(svcName));
  };

  const addMethodToService = (serviceName: string) => {
    update([...methods, {
      id: crypto.randomUUID(),
      service: serviceName,
      method: 'NewMethod',
      type: 'unary',
      response: '{\n  "message": "Hello from gRPC mock"\n}',
      enabled: true,
      delay: 0,
      statusCode: 0,
      serviceEnabled: true,
    }]);
  };

  const removeMethod = (id: string) => {
    update(methods.filter(m => m.id !== id));
    setDeleteConfirm(null);
  };

  const removeService = (serviceName: string) => {
    update(methods.filter(m => m.service !== serviceName));
    setDeleteConfirm(null);
  };

  const updateMethod = (id: string, patch: Partial<GrpcMethodRow>) => {
    update(methods.map(m => m.id === id ? { ...m, ...patch } : m));
  };

  const renameService = (oldName: string, newName: string) => {
    update(methods.map(m => m.service === oldName ? { ...m, service: newName } : m));
    setExpandedServices(prev => {
      const next = new Set(prev);
      next.delete(oldName);
      next.add(newName);
      return next;
    });
  };



  const toggleService = (svc: string) => {
    setExpandedServices(prev => {
      const next = new Set(prev);
      if (next.has(svc)) next.delete(svc);
      else next.add(svc);
      useUiStateStore.getState().setPref(`mock.grpc.expanded.${server.id}`, JSON.stringify([...next]));
      return next;
    });
  };

  const toggleServiceEnabled = (serviceName: string) => {
    const currentMethods = methods.filter(m => m.service === serviceName);
    const currentlyEnabled = currentMethods[0]?.serviceEnabled !== false;
    update(methods.map(m => m.service === serviceName ? { ...m, serviceEnabled: !currentlyEnabled } : m));
  };

  const isServiceEnabled = (serviceName: string): boolean => {
    const svcMethods = methods.filter(m => m.service === serviceName);
    return svcMethods.length > 0 ? svcMethods[0].serviceEnabled !== false : true;
  };

  const loadSample = (sampleId: string) => {
    const sample = GRPC_SAMPLES.find(s => s.id === sampleId);
    if (!sample) return;
    const newMethods: GrpcMethodRow[] = sample.methods.map(m => ({
      id: crypto.randomUUID(),
      service: m.service,
      method: m.method,
      type: m.type,
      response: m.response,
      enabled: true,
      delay: 0,
      statusCode: 0,
      serviceEnabled: true,
    }));
    onUpdate({ description: sample.description, grpcMethods: newMethods as GrpcMockMethod[] });
    // Expand all services from sample
    const svcNames = new Set(newMethods.map(m => m.service));
    setExpandedServices(svcNames);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--color-text-primary)]">Services ({serviceGroups.length})</span>
        <div className="flex items-center gap-1.5">
          <StyledDropdown
            options={SAMPLE_OPTIONS}
            value=""
            onChange={(v) => { if (v) loadSample(v); }}
            size="sm"
            accentColor={ACCENT}
          />
          <button
            type="button"
            onClick={() => {/* TODO: AI generate */}}
            className="h-[28px] px-2.5 text-[10px] rounded-md text-[var(--color-mock-server)] border border-[rgba(234,179,8,0.2)] hover:bg-[rgba(234,179,8,0.08)] cursor-pointer transition-colors opacity-50"
            title="Coming soon"
          >
            ✨ Generate with AI
          </button>
          <button
            type="button"
            onClick={addService}
            className="h-[28px] px-2.5 text-[11px] rounded-md cursor-pointer transition-colors border border-[color-mix(in_srgb,var(--color-mock-server)_30%,transparent)]"
            style={{ color: ACCENT, background: 'transparent' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-mock-server) 10%, transparent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            + Add Service
          </button>
        </div>
      </div>

      {/* Service list */}
      {serviceGroups.length === 0 ? (
        <p className="text-[11px] text-[var(--color-text-muted)] text-center py-6">
          No gRPC services configured. Add a service or load a sample.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {serviceGroups.map((group) => {
            const isExpanded = expandedServices.has(group.service);
            const stableKey = group.methods[0]?.id || group.service;
            const svcEnabled = isServiceEnabled(group.service);
            return (
              <div
                key={stableKey}
                className={`relative rounded-md border overflow-hidden transition-all ${
                  svcEnabled
                    ? 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]'
                    : 'border-[var(--color-surface-border)] bg-[var(--color-panel)]'
                }`}
              >
                {/* Disabled overlay */}
                {!svcEnabled && (
                  <div className="absolute inset-0 rounded-md z-10 pointer-events-none overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-md bg-[var(--color-muted-fallback)]" />
                    <DiagonalLinesPattern patternId={`disabled-grpc-svc-${stableKey}`} />
                  </div>
                )}

                {/* Service header */}
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-2 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] relative ${!svcEnabled ? 'opacity-50' : ''}`}
                  onClick={() => { if (svcEnabled) toggleService(group.service); }}
                >
                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleServiceEnabled(group.service); }}
                    className="relative z-20 w-[26px] h-[13px] rounded-full transition-colors flex-shrink-0 cursor-pointer"
                    style={{ backgroundColor: svcEnabled ? 'var(--color-success)' : 'var(--color-muted-fallback)' }}
                    title={svcEnabled ? 'Disable service' : 'Enable service'}
                  >
                    <span className="absolute top-[2px] w-[9px] h-[9px] rounded-full bg-white transition-all" style={{ left: svcEnabled ? '15px' : '2px' }} />
                  </button>

                  <span
                    className="transition-transform duration-150"
                    style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', color: ACCENT, visibility: svcEnabled ? 'visible' : 'hidden' }}
                  >
                    <ChevronRightIcon size={12} />
                  </span>
                  <span className="flex-1 text-[12px] font-mono font-medium text-[var(--color-text-primary)] truncate">
                    {group.service}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {group.methods.length} method{group.methods.length !== 1 ? 's' : ''}
                  </span>
                  {svcEnabled && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: 'service', id: group.service, label: group.service }); }}
                    className="w-5 h-5 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors"
                    title="Remove service"
                  >
                    <TrashIcon size={12} />
                  </button>
                  )}
                </div>

                {/* Expanded service content */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-[rgba(255,255,255,0.06)] flex flex-col gap-2">
                    {/* Service name edit */}
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-[var(--color-text-muted)] whitespace-nowrap">Service Name</label>
                      <input
                        type="text"
                        value={group.service}
                        onChange={(e) => renameService(group.service, e.target.value)}
                        className="flex-1 h-[26px] px-2 rounded-md text-[11px] font-mono bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-mock-server)]"
                      />
                    </div>

                    {/* Method rows */}
                    {group.methods.map((m, idx) => (
                      <MethodRow
                        key={m.id}
                        method={m}
                        isExpanded={expandedMethodId === m.id}
                        onToggleExpand={() => { const next = expandedMethodId === m.id ? null : m.id; setExpandedMethodId(next); useUiStateStore.getState().setPref(`mock.grpc.expandedMethod.${server.id}`, next || ''); }}
                        onUpdate={(patch) => updateMethod(m.id, patch)}
                        onRemove={() => setDeleteConfirm({ type: 'method', id: m.id, label: m.method })}
                      />
                    ))}

                    {/* Add method button */}
                    <button
                      type="button"
                      onClick={() => addMethodToService(group.service)}
                      className="h-[26px] px-2 text-[10px] rounded-md cursor-pointer transition-colors self-start border border-dashed border-[color-mix(in_srgb,var(--color-mock-server)_35%,transparent)]"
                      style={{ color: ACCENT, background: 'transparent' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-mock-server) 8%, transparent)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      + Add Method
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <ConfirmDialog
          title={deleteConfirm.type === 'service' ? 'Delete Service' : 'Delete Method'}
          message={deleteConfirm.type === 'service'
            ? `Are you sure you want to delete "${deleteConfirm.label}" and all its methods? This cannot be undone.`
            : `Are you sure you want to delete method "${deleteConfirm.label}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            if (deleteConfirm.type === 'service') removeService(deleteConfirm.id);
            else removeMethod(deleteConfirm.id);
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

/* ─── Method Row Sub-Component ─── */

interface MethodRowProps {
  method: GrpcMethodRow;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (patch: Partial<GrpcMethodRow>) => void;
  onRemove: () => void;
}

function MethodRow({ method: m, isExpanded, onToggleExpand, onUpdate, onRemove }: MethodRowProps) {
  return (
    <div
      className={`relative rounded-md border overflow-hidden transition-all ${
        m.enabled
          ? 'border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.01)]'
          : 'border-[var(--color-surface-border)] bg-[var(--color-panel)]'
      }`}
    >
      {/* Disabled overlay */}
      {!m.enabled && (
        <div className="absolute inset-0 rounded-md z-10 pointer-events-none overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-md bg-[var(--color-muted-fallback)]" />
          <DiagonalLinesPattern patternId={`disabled-grpc-${m.id}`} />
        </div>
      )}

      {/* Method header */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] relative ${!m.enabled ? 'opacity-50' : ''}`}
        onClick={() => { if (m.enabled) onToggleExpand(); }}
      >
        {/* Toggle */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onUpdate({ enabled: !m.enabled }); }}
          className="relative z-20 w-[26px] h-[13px] rounded-full transition-colors flex-shrink-0 cursor-pointer"
          style={{ backgroundColor: m.enabled ? 'var(--color-success)' : 'var(--color-muted-fallback)' }}
          title={m.enabled ? 'Disable' : 'Enable'}
        >
          <span className="absolute top-[2px] w-[9px] h-[9px] rounded-full bg-white transition-all" style={{ left: m.enabled ? '15px' : '2px' }} />
        </button>

        {/* Stream type icon (colored like client tab) */}
        {(() => {
          const cfg = STREAM_TYPE_CONFIG[m.type] || STREAM_TYPE_CONFIG.unary;
          const Icon = cfg.icon;
          return <Icon size={14} style={{ color: cfg.color, flexShrink: 0 }} />;
        })()}

        {/* Method name */}
        <span className="flex-1 text-[11px] font-mono text-[var(--color-text-primary)] truncate">
          {m.method}
        </span>

        {/* Type badge (right side, colored) */}
        {(() => {
          const cfg = STREAM_TYPE_CONFIG[m.type] || STREAM_TYPE_CONFIG.unary;
          return (
            <span
              className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0"
              style={{ color: cfg.color, backgroundColor: `${cfg.color}18` }}
            >
              {cfg.label}
            </span>
          );
        })()}

        {/* Delete */}
        {m.enabled && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="w-5 h-5 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors"
          >
            <TrashIcon size={11} />
          </button>
        )}
      </div>

      {/* Expanded detail */}
      {m.enabled && isExpanded && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-[rgba(255,255,255,0.06)] flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">Method Name</label>
              <input
                type="text"
                value={m.method}
                onChange={(e) => onUpdate({ method: e.target.value })}
                className="w-full h-[28px] px-2.5 rounded-md text-[11px] font-mono bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-mock-server)]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">Type</label>
              <StyledDropdown
                options={RPC_TYPE_OPTIONS}
                value={m.type}
                onChange={(v) => onUpdate({ type: v as GrpcMethodRow['type'] })}
                size="sm"
                accentColor={ACCENT}
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">Response (JSON)</label>
            <div className="h-[120px] rounded-md overflow-hidden border border-[rgba(255,255,255,0.08)]">
              <CodeEditor
                value={m.response}
                onChange={(val) => onUpdate({ response: val })}
                language="json"
                className="h-full"
              />
            </div>
          </div>
          {/* Status + Delay */}
          <div className="flex items-center gap-4 pt-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[var(--color-text-muted)]">Status</span>
              <input
                type="text"
                inputMode="numeric"
                value={m.statusCode}
                onChange={(e) => onUpdate({ statusCode: parseInt(e.target.value) || 0 })}
                className="w-[56px] h-[28px] px-2 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-mock-server)] text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                title="gRPC status code (0=OK, 1=CANCELLED, 2=UNKNOWN, ...)"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[var(--color-text-muted)]">Delay</span>
              <DurationInput
                value={m.delay}
                onChange={(ms) => onUpdate({ delay: ms })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
