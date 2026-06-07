import { useState, useMemo } from 'react';
import { CodeEditor, StyledDropdown, ConfirmDialog, DurationInput } from '../../shared';
import type { DropdownOption } from '../../shared';
import { TrashIcon, DiagonalLinesPattern, ChevronRightIcon, CopyIcon, CheckIcon, ExternalLinkIcon } from '../../../icons';
import { SOAP_MOCK_SAMPLES } from '../samples/soap';
import { useUiStateStore } from '../../../store/ui-state-store';
import { useTabsStore } from '../../../store/tabs-store';
import type { MockServer, SoapMockOperation } from '../mock-types';
import { MockAiGenerateButton } from '../MockAiGeneratePopover';

const ACCENT = 'var(--color-mock-server)';

const RESPONSE_TYPE_OPTIONS: DropdownOption[] = [
  { value: 'static', label: 'Static XML' },
  { value: 'script', label: 'Script' },
  { value: 'fault', label: 'SOAP Fault' },
];

const RESPONSE_TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  static: { color: '#4ade80', label: 'STATIC' },
  script: { color: '#fbbf24', label: 'SCRIPT' },
  fault: { color: '#f87171', label: 'FAULT' },
};

const SAMPLE_OPTIONS: DropdownOption[] = [
  { value: '', label: 'Load Sample...' },
  ...SOAP_MOCK_SAMPLES.map(s => ({ value: s.id, label: s.label })),
];

interface OperationRow {
  id: string;
  service: string;
  operation: string;
  soapAction: string;
  responseType: 'static' | 'script' | 'fault';
  response: string;
  responseScript?: string;
  faultCode?: string;
  faultString?: string;
  delay: number;
  enabled: boolean;
  serviceEnabled: boolean;
}

interface ServiceGroup {
  service: string;
  operations: OperationRow[];
}

interface SoapConfigProps {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
}

/**
 * SoapConfig — SOAP mock server configuration panel.
 * Service → Operation hierarchy with response type (static/script/fault).
 */
export function SoapConfig({ server, onUpdate }: SoapConfigProps) {
  // Persist expanded state via ui-state-store
  const storedExpanded = useUiStateStore(s => s.getPref(`mock.soap.expanded.${server.id}`));
  const storedOpId = useUiStateStore(s => s.getPref(`mock.soap.expandedOp.${server.id}`));
  const [expandedServices, setExpandedServices] = useState<Set<string>>(() => {
    if (storedExpanded) try { return new Set(JSON.parse(storedExpanded)); } catch { /* */ }
    return new Set();
  });
  const [expandedOpId, setExpandedOpId] = useState<string | null>(storedOpId || null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'service' | 'operation'; id: string; label: string } | null>(null);
  const [copiedService, setCopiedService] = useState<string | null>(null);

  const operations: OperationRow[] = (server.soapOperations || []).map(op => ({
    id: op.id,
    service: op.service || '',
    operation: op.operation || '',
    soapAction: op.soapAction || '',
    responseType: op.responseType || 'static',
    response: op.response || '',
    responseScript: op.responseScript,
    faultCode: op.faultCode,
    faultString: op.faultString,
    delay: op.delay || 0,
    enabled: op.enabled !== false,
    serviceEnabled: op.serviceEnabled !== false,
  }));

  const serviceGroups: ServiceGroup[] = useMemo(() => {
    const map = new Map<string, OperationRow[]>();
    for (const op of operations) {
      const existing = map.get(op.service);
      if (existing) existing.push(op);
      else map.set(op.service, [op]);
    }
    return Array.from(map.entries()).map(([service, ops]) => ({ service, operations: ops }));
  }, [operations]);

  const update = (newOps: OperationRow[]) => {
    onUpdate({ soapOperations: newOps as SoapMockOperation[] });
  };

  const addService = () => {
    const svcName = `NewService${serviceGroups.length + 1}`;
    update([...operations, {
      id: crypto.randomUUID(),
      service: svcName,
      operation: 'NewOperation',
      soapAction: `http://example.com/${svcName}/NewOperation`,
      responseType: 'static',
      response: `<?xml version="1.0" encoding="UTF-8"?>\n<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">\n  <soap:Body>\n    <Response>\n      <message>Hello from SOAP mock</message>\n    </Response>\n  </soap:Body>\n</soap:Envelope>`,
      delay: 0,
      enabled: true,
    }]);
    setExpandedServices(prev => new Set(prev).add(svcName));
  };

  const addOperationToService = (serviceName: string) => {
    update([...operations, {
      id: crypto.randomUUID(),
      service: serviceName,
      operation: 'NewOperation',
      soapAction: `http://example.com/${serviceName}/NewOperation`,
      responseType: 'static',
      response: `<?xml version="1.0" encoding="UTF-8"?>\n<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">\n  <soap:Body>\n    <Response>\n      <message>Hello from SOAP mock</message>\n    </Response>\n  </soap:Body>\n</soap:Envelope>`,
      delay: 0,
      enabled: true,
    }]);
  };

  const removeOperation = (id: string) => {
    update(operations.filter(op => op.id !== id));
    setDeleteConfirm(null);
  };

  const removeService = (serviceName: string) => {
    update(operations.filter(op => op.service !== serviceName));
    setDeleteConfirm(null);
  };

  const updateOperation = (id: string, patch: Partial<OperationRow>) => {
    update(operations.map(op => op.id === id ? { ...op, ...patch } : op));
  };

  const renameService = (oldName: string, newName: string) => {
    update(operations.map(op => op.service === oldName ? { ...op, service: newName } : op));
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
      useUiStateStore.getState().setPref(`mock.soap.expanded.${server.id}`, JSON.stringify([...next]));
      return next;
    });
  };

  const toggleServiceEnabled = (serviceName: string) => {
    const currentOps = operations.filter(op => op.service === serviceName);
    const currentlyEnabled = currentOps[0]?.serviceEnabled !== false;
    update(operations.map(op => op.service === serviceName ? { ...op, serviceEnabled: !currentlyEnabled } : op));
  };

  const isServiceEnabled = (serviceName: string): boolean => {
    const svcOps = operations.filter(op => op.service === serviceName);
    return svcOps.length > 0 ? svcOps[0].serviceEnabled !== false : true;
  };

  const loadSample = (sampleId: string) => {
    const sample = SOAP_MOCK_SAMPLES.find(s => s.id === sampleId);
    if (!sample) return;
    const newOps: OperationRow[] = sample.operations.map(op => ({
      id: crypto.randomUUID(),
      service: op.service,
      operation: op.operation,
      soapAction: op.soapAction,
      responseType: op.responseType,
      response: op.response,
      faultCode: op.faultCode,
      faultString: op.faultString,
      delay: 0,
      enabled: true,
    }));
    // REPLACE existing — clear out and set new
    onUpdate({ description: sample.description, soapOperations: newOps as SoapMockOperation[] });
    const newServices = new Set(newOps.map(op => op.service));
    setExpandedServices(newServices);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header — matches gRPC layout exactly */}
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
          <MockAiGenerateButton
            templateKey="mock.soap.generate"
            title="SOAP Operations"
            serverName={server.name}
            serverContext={(server.soapOperations || []).length > 0
              ? (server.soapOperations || []).map((op: SoapMockOperation) => op.soapAction || op.operationName || '').join('\n')
              : undefined}
            accentVar="var(--color-protocol-soap)"
          />
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
          No SOAP services configured. Add a service or load a sample.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {serviceGroups.map((group) => {
            const isExpanded = expandedServices.has(group.service);
            const stableKey = group.operations[0]?.id || group.service;
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
                    <DiagonalLinesPattern patternId={`disabled-soap-svc-${stableKey}`} />
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
                    {group.operations.length} op{group.operations.length !== 1 ? 's' : ''}
                  </span>
                  {svcEnabled && server.running && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const serverUrl = `http://localhost:${server.port || 8000}`;
                      const svcOps = group.operations.filter(op => op.enabled);
                      const op = svcOps[0];
                      const { addTab, switchProtocol } = useTabsStore.getState();
                      const envelope = `<?xml version="1.0" encoding="UTF-8"?>\n<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">\n  <soap:Header/>\n  <soap:Body>\n    <!-- ${op?.operation || 'Request'} -->\n  </soap:Body>\n</soap:Envelope>`;
                      switchProtocol('soap');
                      addTab({
                        protocol: 'soap',
                        url: serverUrl,
                        name: `Try ${group.service}`,
                        soapVersion: '1.1',
                        soapAction: op?.soapAction || '',
                        soapOperation: op?.operation || '',
                        soapService: group.service,
                        soapEnvelope: envelope,
                      });
                    }}
                    className="w-5 h-5 flex items-center justify-center rounded text-[var(--color-try-button)] hover:text-[var(--color-try-button)] cursor-pointer transition-colors"
                    title="Try this service"
                  >
                    <ExternalLinkIcon size={12} />
                  </button>
                  )}
                  {svcEnabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const svcName = group.service.replace(/[^a-zA-Z0-9]/g, '');
                      const url = `localhost:${server.port || 8000}/${svcName}?wsdl`;
                      navigator.clipboard.writeText(url);
                      setCopiedService(group.service);
                      setTimeout(() => setCopiedService(null), 1500);
                    }}
                    className="w-5 h-5 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-mock-server)] hover:bg-[rgba(249,113,113,0.08)] cursor-pointer transition-colors"
                    title={`Copy WSDL URL`}
                  >
                    {copiedService === group.service ? <CheckIcon size={11} className="text-[var(--color-success)]" /> : <CopyIcon size={11} />}
                  </button>
                  )}
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

                    {/* Operation rows */}
                    {group.operations.map((op) => (
                      <OperationItem
                        key={op.id}
                        operation={op}
                        isExpanded={expandedOpId === op.id}
                        onToggleExpand={() => { const next = expandedOpId === op.id ? null : op.id; setExpandedOpId(next); useUiStateStore.getState().setPref(`mock.soap.expandedOp.${server.id}`, next || ''); }}
                        onUpdate={(patch) => updateOperation(op.id, patch)}
                        onRemove={() => setDeleteConfirm({ type: 'operation', id: op.id, label: op.operation })}
                      />
                    ))}

                    {/* Add operation button */}
                    <button
                      type="button"
                      onClick={() => addOperationToService(group.service)}
                      className="h-[26px] px-2 text-[10px] rounded-md cursor-pointer transition-colors self-start border border-dashed border-[color-mix(in_srgb,var(--color-mock-server)_35%,transparent)]"
                      style={{ color: ACCENT, background: 'transparent' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-mock-server) 8%, transparent)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      + Add Operation
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
          title={deleteConfirm.type === 'service' ? 'Delete Service' : 'Delete Operation'}
          message={deleteConfirm.type === 'service'
            ? `Are you sure you want to delete "${deleteConfirm.label}" and all its operations? This cannot be undone.`
            : `Are you sure you want to delete operation "${deleteConfirm.label}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            if (deleteConfirm.type === 'service') removeService(deleteConfirm.id);
            else removeOperation(deleteConfirm.id);
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

// ────────── Operation Item (mirrors GrpcConfig's MethodRow) ──────────

interface OperationItemProps {
  operation: OperationRow;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (patch: Partial<OperationRow>) => void;
  onRemove: () => void;
}

function OperationItem({ operation: op, isExpanded, onToggleExpand, onUpdate, onRemove }: OperationItemProps) {
  const cfg = RESPONSE_TYPE_CONFIG[op.responseType] || RESPONSE_TYPE_CONFIG.static;

  return (
    <div
      className={`relative rounded-md border overflow-hidden transition-all ${
        op.enabled
          ? 'border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.01)]'
          : 'border-[var(--color-surface-border)] bg-[var(--color-panel)]'
      }`}
    >
      {/* Disabled overlay */}
      {!op.enabled && (
        <div className="absolute inset-0 rounded-md z-10 pointer-events-none overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-md bg-[var(--color-muted-fallback)]" />
          <DiagonalLinesPattern patternId={`disabled-soap-${op.id}`} />
        </div>
      )}

      {/* Operation header */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] relative ${!op.enabled ? 'opacity-50' : ''}`}
        onClick={() => { if (op.enabled) onToggleExpand(); }}
      >
        {/* Toggle */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onUpdate({ enabled: !op.enabled }); }}
          className="relative z-20 w-[26px] h-[13px] rounded-full transition-colors flex-shrink-0 cursor-pointer"
          style={{ backgroundColor: op.enabled ? 'var(--color-success)' : 'var(--color-muted-fallback)' }}
          title={op.enabled ? 'Disable' : 'Enable'}
        >
          <span className="absolute top-[2px] w-[9px] h-[9px] rounded-full bg-white transition-all" style={{ left: op.enabled ? '15px' : '2px' }} />
        </button>

        {/* Operation name */}
        <span className="flex-1 text-[11px] font-mono text-[var(--color-text-primary)] truncate">
          {op.operation}
        </span>

        {/* Type badge (right side, colored) */}
        <span
          className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0"
          style={{ color: cfg.color, backgroundColor: `${cfg.color}18` }}
        >
          {cfg.label}
        </span>

        {/* Delete */}
        {op.enabled && (
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
      {op.enabled && isExpanded && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-[rgba(255,255,255,0.06)] flex flex-col gap-2">
          {/* Operation name + SOAPAction */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">Operation Name</label>
              <input
                type="text"
                value={op.operation}
                onChange={(e) => onUpdate({ operation: e.target.value })}
                className="w-full h-[28px] px-2.5 rounded-md text-[11px] font-mono bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-mock-server)]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">SOAPAction</label>
              <input
                type="text"
                value={op.soapAction}
                onChange={(e) => onUpdate({ soapAction: e.target.value })}
                className="w-full h-[28px] px-2.5 rounded-md text-[11px] font-mono bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-mock-server)]"
              />
            </div>
          </div>

          {/* Response type + delay */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">Response Type</label>
              <StyledDropdown
                options={RESPONSE_TYPE_OPTIONS}
                value={op.responseType}
                onChange={(v) => onUpdate({ responseType: v as OperationRow['responseType'] })}
                size="sm"
                accentColor={ACCENT}
              />
            </div>
            <div className="flex items-end gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[var(--color-text-muted)]">Delay</span>
                <DurationInput
                  value={op.delay}
                  onChange={(ms) => onUpdate({ delay: ms })}
                />
              </div>
            </div>
          </div>

          {/* Response body / fault config */}
          {op.responseType === 'fault' ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">Fault Code</label>
                <input
                  type="text"
                  value={op.faultCode || ''}
                  onChange={(e) => onUpdate({ faultCode: e.target.value })}
                  placeholder="soap:Server"
                  className="w-full h-[28px] px-2.5 rounded-md text-[11px] font-mono bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-mock-server)]"
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">Fault String</label>
                <input
                  type="text"
                  value={op.faultString || ''}
                  onChange={(e) => onUpdate({ faultString: e.target.value })}
                  placeholder="Error description"
                  className="w-full h-[28px] px-2.5 rounded-md text-[11px] font-mono bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-mock-server)]"
                />
              </div>
            </div>
          ) : op.responseType === 'script' ? (
            <div>
              <label className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">Response Script</label>
              <div className="h-[120px] rounded-md overflow-hidden border border-[rgba(255,255,255,0.08)]">
                <CodeEditor
                  value={op.responseScript || '// Return XML string\nreturn `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">\n  <soap:Body>\n    <Response><result>${Date.now()}</result></Response>\n  </soap:Body>\n</soap:Envelope>`;'}
                  onChange={(v) => onUpdate({ responseScript: v })}
                  language="javascript"
                  className="h-full"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="text-[10px] text-[var(--color-text-muted)] block mb-0.5">Response XML</label>
              <div className="h-[120px] rounded-md overflow-hidden border border-[rgba(255,255,255,0.08)]">
                <CodeEditor
                  value={op.response}
                  onChange={(v) => onUpdate({ response: v })}
                  language="xml"
                  className="h-full"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
