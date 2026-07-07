import { useState, useMemo } from 'react';
import {
  SelectInputView, EditorView, ButtonView, IconButtonView, ToggleSwitchView,
  TextInputView, DurationInputView, TabView, type SelectOption, type TabItem,
} from '@salilvnair/dui';
import { ConfirmDialog } from '../../shared';
import { TrashIcon, DiagonalLinesPattern, ChevronRightIcon, GrpcUnaryIcon, GrpcServerStreamIcon, GrpcClientStreamIcon, GrpcBidiStreamIcon } from '../../../icons';
import { GRPC_SAMPLES } from '../samples/grpc';
import { useUiStateStore } from '../../../store/ui-state-store';
import type { MockServer, GrpcMockMethod, MockRoute } from '../mock-types';
import { MockAiGenerateButton, type ParsedGenericItem } from '../MockAiGeneratePopover';
import { logUiEvent } from '../../../store/ui-audit-store';
import { SequencePanel } from '../wiremock/SequencePanel';
import { MatchBuilderPanel } from '../wiremock/MatchBuilderPanel';
import { FaultInjectionPanel } from '../wiremock/FaultInjectionPanel';

type GrpcMethodTab = 'response' | 'sequence' | 'matching' | 'advanced';

const GRPC_METHOD_TABS: TabItem[] = [
  { id: 'response', label: 'Response' },
  { id: 'sequence', label: 'Sequence' },
  { id: 'matching', label: 'Matching' },
  { id: 'advanced', label: 'Advanced' },
];

function methodToRoute(m: GrpcMockMethod): MockRoute {
  return {
    id: m.id, method: 'POST', path: m.method, statusCode: m.statusCode ?? 0,
    headers: {}, body: m.response, delay: m.delay ?? 0, enabled: m.enabled,
    responses: m.responses, sequenceMode: m.sequenceMode,
    headerMatchers: m.headerMatchers, bodyMatcher: m.bodyMatcher,
    compositeLogic: m.compositeLogic, priority: m.priority,
    fault: m.fault, rateLimit: m.rateLimit,
  };
}

function routeToMethodPatch(patch: Partial<MockRoute>): Partial<GrpcMockMethod> {
  const { responses, sequenceMode, headerMatchers, bodyMatcher, compositeLogic, priority, fault, rateLimit } = patch;
  return { responses, sequenceMode, headerMatchers, bodyMatcher, compositeLogic, priority, fault, rateLimit };
}

const ACCENT = 'var(--color-protocol-grpc)';

const RPC_TYPE_OPTIONS: SelectOption[] = [
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

const SAMPLE_OPTIONS: SelectOption[] = [
  { value: '', label: 'Load Sample...' },
  ...GRPC_SAMPLES.filter(s => s.category === 'no-proto').map(s => ({ value: s.id, label: `[No Proto] ${s.label}` })),
  ...GRPC_SAMPLES.filter(s => s.category === 'with-proto').map(s => ({ value: s.id, label: `[With Proto] ${s.label}` })),
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
  responses?: import('../mock-types').ResponseSequenceItem[];
  sequenceMode?: import('../mock-types').SequenceMode;
  headerMatchers?: import('../mock-types').MatchRule[];
  bodyMatcher?: import('../mock-types').BodyMatcher;
  compositeLogic?: import('../mock-types').CompositeLogic;
  priority?: number;
  fault?: import('../mock-types').FaultConfig;
  rateLimit?: import('../mock-types').RateLimitConfig;
}

interface ServiceGroup {
  service: string;
  methods: GrpcMethodRow[];
}

interface GrpcConfigProps {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
}

export function GrpcConfig({ server, onUpdate }: GrpcConfigProps) {
  const storedExpanded = useUiStateStore(s => s.getPref(`mock.grpc.expanded.${server.id}`));
  const storedMethodId = useUiStateStore(s => s.getPref(`mock.grpc.expandedMethod.${server.id}`));
  const [expandedServices, setExpandedServices] = useState<Set<string>>(() => {
    if (storedExpanded) try { return new Set(JSON.parse(storedExpanded)); } catch { /* */ }
    return new Set();
  });
  const [expandedMethodId, setExpandedMethodId] = useState<string | null>(storedMethodId || null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'service' | 'method'; id: string; label: string } | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);

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
    responses: m.responses,
    sequenceMode: m.sequenceMode,
    headerMatchers: m.headerMatchers,
    bodyMatcher: m.bodyMatcher,
    compositeLogic: m.compositeLogic,
    priority: m.priority,
    fault: m.fault,
    rateLimit: m.rateLimit,
  }));

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
    logUiEvent('mock.cfg_add', { type: 'service' });
    const svcName = `mypackage.NewService${serviceGroups.length + 1}`;
    update([...methods, { id: crypto.randomUUID(), service: svcName, method: 'MyMethod', type: 'unary', response: '{\n  "message": "Hello from gRPC mock"\n}', enabled: true, delay: 0, statusCode: 0, serviceEnabled: true }]);
    setExpandedServices(prev => new Set(prev).add(svcName));
  };

  const addMethodToService = (serviceName: string) => {
    logUiEvent('mock.cfg_add', { type: 'method', service: serviceName });
    update([...methods, { id: crypto.randomUUID(), service: serviceName, method: 'NewMethod', type: 'unary', response: '{\n  "message": "Hello from gRPC mock"\n}', enabled: true, delay: 0, statusCode: 0, serviceEnabled: true }]);
  };

  const removeMethod = (id: string) => { update(methods.filter(m => m.id !== id)); setDeleteConfirm(null); };
  const removeService = (serviceName: string) => { update(methods.filter(m => m.service !== serviceName)); setDeleteConfirm(null); };

  const handleAddGeneratedItems = (items: ParsedGenericItem[]) => {
    const newMethods: GrpcMethodRow[] = [];
    for (const item of items) {
      const svc = item.data as { service?: string; methods?: Array<{ method?: string; type?: string; response?: string }> };
      const svcName = svc.service || item.name || 'NewService';
      const svcMethods = Array.isArray(svc.methods) ? svc.methods : [];
      if (svcMethods.length === 0) {
        newMethods.push({ id: crypto.randomUUID(), service: svcName, method: 'NewMethod', type: 'unary', response: '{}', enabled: true, delay: 0, statusCode: 0, serviceEnabled: true });
      } else {
        for (const m of svcMethods) {
          const methodType = (['unary', 'server_streaming', 'client_streaming', 'bidi_streaming'].includes(m.type || '') ? m.type : 'unary') as GrpcMethodRow['type'];
          newMethods.push({ id: crypto.randomUUID(), service: svcName, method: m.method || 'NewMethod', type: methodType, response: m.response || '{}', enabled: true, delay: 0, statusCode: 0, serviceEnabled: true });
        }
      }
    }
    update([...methods, ...newMethods]);
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
    logUiEvent('mock.sample_load', { sampleId, protocol: 'grpc' });
    const newMethods: GrpcMethodRow[] = sample.methods.map(m => ({
      id: crypto.randomUUID(), service: m.service, method: m.method, type: m.type,
      response: m.response, enabled: true, delay: 0, statusCode: 0, serviceEnabled: true,
    }));
    onUpdate({ description: sample.description, grpcMethods: newMethods as GrpcMockMethod[] });
    setExpandedServices(new Set(newMethods.map(m => m.service)));
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--color-text-primary)]">Services ({serviceGroups.length})</span>
        <div className="flex items-center gap-1.5">
          <SelectInputView
            size="md"
            options={SAMPLE_OPTIONS}
            value=""
            onChange={(v) => { if (v) loadSample(v); }}
            accentColor={ACCENT}
          />
          <MockAiGenerateButton
            templateKey="mock.grpc.generate"
            title="gRPC Services"
            serverName={server.name}
            serverContext={[
              server.description?.trim() ? `Server description (MANDATORY — use strictly as primary context):\n${server.description.trim()}` : '',
              (server.grpcMethods || []).length > 0 ? `Existing methods:\n${(server.grpcMethods || []).map((m: GrpcMockMethod) => `${m.service}/${m.method} (${m.type})`).join(', ')}` : '',
            ].filter(Boolean).join('\n\n') || undefined}
            accentVar={ACCENT}
            onAddGeneratedItems={handleAddGeneratedItems}
          />
          <ButtonView size="md" variant="accent" accentColor={ACCENT} onClick={addService}>
            + Add Service
          </ButtonView>
          {serviceGroups.length > 0 && (
            <IconButtonView size="md" icon={<TrashIcon size={12} />} accentColor="var(--color-error)" onClick={() => setShowDeleteAll(true)} title="Delete All Services" />
          )}
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
                    ? 'border-[color-mix(in_srgb,var(--color-text-primary)_8%,transparent)] bg-[color-mix(in_srgb,var(--color-text-primary)_2%,transparent)]'
                    : 'border-[var(--color-surface-border)] bg-[var(--color-panel)]'
                }`}
              >
                {!svcEnabled && (
                  <div className="absolute inset-0 rounded-md z-10 pointer-events-none overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-md bg-[var(--color-muted-fallback)]" />
                    <DiagonalLinesPattern patternId={`disabled-grpc-svc-${stableKey}`} />
                  </div>
                )}

                {/* Service header */}
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-2 cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-text-primary)_3%,transparent)] relative ${!svcEnabled ? 'opacity-50' : ''}`}
                  onClick={() => { if (svcEnabled) toggleService(group.service); }}
                >
                  <div onClick={e => e.stopPropagation()}>
                    <ToggleSwitchView
                      checked={svcEnabled}
                      onChange={() => toggleServiceEnabled(group.service)}
                      accentColor="var(--color-success)"
                      size="xs"
                    />
                  </div>
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
                    <div onClick={e => e.stopPropagation()}>
                      <IconButtonView
                        size="sm"
                        icon={<TrashIcon size={12} />}
                        accentColor="var(--color-error)"
                        onClick={() => setDeleteConfirm({ type: 'service', id: group.service, label: group.service })}
                        title="Remove service"
                      />
                    </div>
                  )}
                </div>

                {/* Expanded service content */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-[var(--color-text-muted)] whitespace-nowrap">Service Name</label>
                      <TextInputView
                        value={group.service}
                        onChange={(e) => renameService(group.service, e.target.value)}
                        size="md"
                        style={{ flex: 1, fontFamily: 'monospace' }}
                      />
                      <ButtonView size="sm" variant="accent" accentColor={ACCENT} onClick={() => addMethodToService(group.service)}>
                        + Add Method
                      </ButtonView>
                    </div>

                    {group.methods.map((m) => (
                      <MethodRow
                        key={m.id}
                        method={m}
                        isExpanded={expandedMethodId === m.id}
                        onToggleExpand={() => { const next = expandedMethodId === m.id ? null : m.id; setExpandedMethodId(next); useUiStateStore.getState().setPref(`mock.grpc.expandedMethod.${server.id}`, next || ''); }}
                        onUpdate={(patch) => updateMethod(m.id, patch)}
                        onRemove={() => setDeleteConfirm({ type: 'method', id: m.id, label: m.method })}
                      />
                    ))}

                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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

      {showDeleteAll && (
        <ConfirmDialog
          title="Delete All Services"
          message={`Are you sure you want to delete all ${serviceGroups.length} service${serviceGroups.length !== 1 ? 's' : ''} and their methods? This cannot be undone.`}
          confirmLabel="Delete All"
          danger
          onConfirm={() => { logUiEvent('mock.cfg_clear', { count: methods.length, protocol: 'grpc' }); update([]); setShowDeleteAll(false); }}
          onCancel={() => setShowDeleteAll(false)}
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
  const [activeTab, setActiveTab] = useState<GrpcMethodTab>('response');

  return (
    <div
      className={`relative rounded-md border overflow-hidden transition-all ${
        m.enabled
          ? 'border-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] bg-[color-mix(in_srgb,var(--color-text-primary)_1%,transparent)]'
          : 'border-[var(--color-surface-border)] bg-[var(--color-panel)]'
      }`}
    >
      {!m.enabled && (
        <div className="absolute inset-0 rounded-md z-10 pointer-events-none overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-md bg-[var(--color-muted-fallback)]" />
          <DiagonalLinesPattern patternId={`disabled-grpc-${m.id}`} />
        </div>
      )}

      {/* Method header */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-text-primary)_3%,transparent)] relative ${!m.enabled ? 'opacity-50' : ''}`}
        onClick={() => { if (m.enabled) onToggleExpand(); }}
      >
        <div onClick={e => e.stopPropagation()}>
          <ToggleSwitchView
            checked={m.enabled}
            onChange={(v) => onUpdate({ enabled: v })}
            accentColor="var(--color-success)"
            size="xs"
          />
        </div>

        {(() => {
          const cfg = STREAM_TYPE_CONFIG[m.type] || STREAM_TYPE_CONFIG.unary;
          const Icon = cfg.icon;
          return <Icon size={14} style={{ color: cfg.color, flexShrink: 0 }} />;
        })()}

        <span className="flex-1 text-[11px] font-mono text-[var(--color-text-primary)] truncate">{m.method}</span>

        {(() => {
          const cfg = STREAM_TYPE_CONFIG[m.type] || STREAM_TYPE_CONFIG.unary;
          return (
            <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: cfg.color, backgroundColor: `${cfg.color}18` }}>
              {cfg.label}
            </span>
          );
        })()}

        {m.enabled && (
          <div onClick={e => e.stopPropagation()}>
            <IconButtonView
              size="sm"
              icon={<TrashIcon size={11} />}
              accentColor="var(--color-error)"
              onClick={onRemove}
            />
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {m.enabled && isExpanded && (
        <div className="border-t border-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)]">
          <div className="px-2.5 pt-1">
            <TabView
              tabs={GRPC_METHOD_TABS}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as GrpcMethodTab)}
              variant="underline"
              size="xs"
              accentColor={ACCENT}
            />
          </div>

          <div className="px-2.5 pb-2.5 pt-2 flex flex-col gap-2">
            {activeTab === 'response' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">Method Name</label>
                    <TextInputView
                      value={m.method}
                      onChange={(e) => onUpdate({ method: e.target.value })}
                      size="md"
                      style={{ width: '100%', fontFamily: 'monospace' }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">Type</label>
                    <SelectInputView
                      size="md"
                      options={RPC_TYPE_OPTIONS}
                      value={m.type}
                      onChange={(v) => onUpdate({ type: v as GrpcMethodRow['type'] })}
                      accentColor={ACCENT}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">Response (JSON)</label>
                  <div className="h-[120px] rounded-md overflow-hidden border border-[color-mix(in_srgb,var(--color-text-primary)_8%,transparent)]">
                    <EditorView value={m.response} onChange={(val) => onUpdate({ response: val })} language="json" height="100%" />
                  </div>
                </div>
                <div className="flex items-center gap-4 pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[var(--color-text-muted)]">Status</span>
                    <TextInputView
                      type="number"
                      value={String(m.statusCode)}
                      onChange={(e) => onUpdate({ statusCode: parseInt(e.target.value) || 0 })}
                      size="md"
                      style={{ width: 56, fontFamily: 'monospace', textAlign: 'center' }}
                      title="gRPC status code (0=OK, 1=CANCELLED, 2=UNKNOWN, ...)"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[var(--color-text-muted)]">Delay</span>
                    <DurationInputView value={m.delay} onChange={(ms) => onUpdate({ delay: ms })} size="sm" />
                  </div>
                </div>
              </>
            )}

            {activeTab === 'sequence' && (
              <SequencePanel route={methodToRoute(m as unknown as GrpcMockMethod)} onUpdate={(patch) => onUpdate(routeToMethodPatch(patch) as Partial<GrpcMethodRow>)} />
            )}
            {activeTab === 'matching' && (
              <MatchBuilderPanel route={methodToRoute(m as unknown as GrpcMockMethod)} onUpdate={(patch) => onUpdate(routeToMethodPatch(patch) as Partial<GrpcMethodRow>)} />
            )}
            {activeTab === 'advanced' && (
              <FaultInjectionPanel route={methodToRoute(m as unknown as GrpcMockMethod)} onUpdate={(patch) => onUpdate(routeToMethodPatch(patch) as Partial<GrpcMethodRow>)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
