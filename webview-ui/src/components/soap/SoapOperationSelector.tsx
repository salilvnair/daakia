import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore } from '../../store/tabs-store';
import { postMsg } from '../../vscode';
import { ChevronDownIcon, CheckCircleFilledIcon, RefreshIcon } from '../../icons';
import { useClickOutside } from '../../hooks/useClickOutside';
import type { SoapServiceDef, SoapPortDef, SoapOperationDef } from '../../store/tabs-store';

const EMPTY_SERVICES: SoapServiceDef[] = [];

const STYLE_CONFIG: Record<string, { color: string; label: string }> = {
  document: { color: '#60a5fa', label: 'DOC/LIT' },
  rpc: { color: '#fbbf24', label: 'RPC/LIT' },
};

/**
 * SoapOperationSelector — Textbox with dropdown, exactly like GrpcMethodSelector.
 * Shows "Service/Operation" in a filterable textbox. Dropdown shows services as categories.
 * When no WSDL loaded, allows free-text input for SOAPAction.
 */
export function SoapOperationSelector() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  useClickOutside(dropdownRef, () => setOpen(false), open);

  const services = activeTab?.soapServices ?? EMPTY_SERVICES;
  const operation = activeTab?.soapOperation || '';
  const soapAction = activeTab?.soapAction || '';
  const hasServices = services.length > 0;

  // Flatten all operations for filtering
  const allOperations = useMemo(() => {
    const result: { service: SoapServiceDef; port: SoapPortDef; operation: SoapOperationDef }[] = [];
    for (const svc of services) {
      for (const port of svc.ports) {
        for (const op of port.operations) {
          result.push({ service: svc, port, operation: op });
        }
      }
    }
    return result;
  }, [services]);

  // Filter operations based on text input
  const filteredByService = useMemo(() => {
    if (!filter.trim()) return services;
    const lf = filter.toLowerCase();
    return services
      .map(svc => ({
        ...svc,
        ports: svc.ports.map(port => ({
          ...port,
          operations: port.operations.filter(op =>
            op.name.toLowerCase().includes(lf) ||
            svc.name.toLowerCase().includes(lf) ||
            (op.soapAction || '').toLowerCase().includes(lf)
          ),
        })).filter(port => port.operations.length > 0),
      }))
      .filter(svc => svc.ports.length > 0);
  }, [services, filter]);

  // Calculate dropdown position when opening
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const maxH = 320;
    let top = rect.bottom + 4;
    if (top + maxH > window.innerHeight) {
      top = rect.top - maxH - 4;
      if (top < 4) top = rect.bottom + 4;
    }
    setDropdownPos({ top, left: rect.left, width: rect.width });
  }, [open]);

  const handleSelect = useCallback((service: SoapServiceDef, port: SoapPortDef, op: SoapOperationDef) => {
    if (!activeTab) return;
    updateTab(activeTab.id, {
      soapService: service.name,
      soapPort: port.name,
      soapOperation: op.name,
      soapAction: op.soapAction,
      dirty: true,
    });

    // Request skeleton envelope generation
    postMsg({
      type: 'soap:generateEnvelope',
      tabId: activeTab.id,
      serviceName: service.name,
      portName: port.name,
      operationName: op.name,
      soapVersion: port.soapVersion || '1.1',
      soapAction: op.soapAction,
      inputSchema: op.inputSchema,
    });

    setOpen(false);
    setFilter('');
  }, [activeTab, updateTab]);

  const handleInputChange = useCallback((val: string) => {
    if (!activeTab) return;
    if (hasServices) {
      setFilter(val);
      if (!open) setOpen(true);
    } else {
      // No WSDL — free-text updates soapAction directly
      updateTab(activeTab.id, { soapAction: val, soapOperation: val, dirty: true });
    }
  }, [activeTab, updateTab, hasServices, open]);

  if (!activeTab) return null;

  // Display: Service/Operation format
  const getDisplay = () => {
    if (!operation) return '';
    const svc = activeTab.soapService;
    if (svc) {
      const svcShort = svc.split('.').pop() || svc;
      return `${svcShort}/${operation}`;
    }
    return operation;
  };
  const displayText = getDisplay();

  // Find style for the selected operation
  const selectedStyle = useMemo(() => {
    for (const item of allOperations) {
      if (item.operation.name === operation && item.service.name === activeTab.soapService) {
        return item.operation.style || 'document';
      }
    }
    return 'document';
  }, [allOperations, operation, activeTab.soapService]);
  const styleCfg = STYLE_CONFIG[selectedStyle] || STYLE_CONFIG.document;

  return (
    <div ref={containerRef} className="flex items-center gap-1.5 flex-[2] min-w-0 relative">
      {/* Operation selector — styled like a dropdown trigger */}
      <div
        className="flex-1 min-w-0 relative cursor-pointer"
        onClick={() => { if (hasServices && !open) setOpen(true); }}
      >
        {/* Selected operation display (hidden when dropdown is open for filtering) */}
        {!open && displayText ? (
          <div
            className="flex items-center gap-2 w-full h-[36px] px-2.5 pr-8 rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[13px] font-mono text-[var(--color-text-primary)] cursor-pointer"
            onClick={() => { if (hasServices) { setOpen(true); setFilter(''); } }}
          >
            <span className="truncate">{displayText}</span>
            {hasServices && (
              <span
                className="shrink-0 text-[9px] font-medium uppercase px-1.5 py-0.5 rounded"
                style={{ color: styleCfg.color, backgroundColor: `${styleCfg.color}15` }}
              >
                {styleCfg.label}
              </span>
            )}
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={hasServices ? filter : soapAction}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => { if (hasServices && !open) setOpen(true); }}
            placeholder={hasServices ? 'Search operations...' : 'Service/Operation or SOAPAction'}
            className="w-full h-[36px] px-2.5 pr-8 rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[13px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-protocol-soap)] transition-colors cursor-pointer"
          />
        )}
        {/* Dropdown chevron */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(!open); setFilter(''); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
        >
          <ChevronDownIcon size={12} />
        </button>
      </div>

      {/* Dropdown portal */}
      {open && hasServices && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[99999] bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-lg shadow-xl overflow-hidden animate-[fadeSlideIn_120ms_ease-out]"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, maxHeight: 320 }}
        >
          <div className="overflow-y-auto max-h-[308px] [scrollbar-gutter:stable] py-1">
            {filteredByService.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-[var(--color-text-muted)]">
                No operations match "{filter}"
              </div>
            ) : (
              filteredByService.map(svc => (
                <div key={svc.name}>
                  {/* Service category header */}
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] bg-[rgba(255,255,255,0.02)] border-b border-[var(--color-surface-border)]">
                    {svc.name.split('.').pop() || svc.name}
                  </div>
                  {/* Operations */}
                  {svc.ports.flatMap(port =>
                    port.operations.map(op => {
                      const opStyle = STYLE_CONFIG[op.style || 'document'] || STYLE_CONFIG.document;
                      const isSelected = operation === op.name && activeTab.soapService === svc.name;
                      return (
                        <button
                          key={`${svc.name}:${port.name}:${op.name}`}
                          type="button"
                          onClick={() => handleSelect(svc, port, op)}
                          className={`flex items-center gap-2.5 w-full px-3 py-[7px] text-left cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[rgba(232,121,249,0.1)]'
                              : 'hover:bg-[var(--color-item-hover-bg)]'
                          }`}
                        >
                          <span className="flex-1 min-w-0 text-[12px] font-mono text-[var(--color-text-primary)] truncate">
                            {op.name}
                          </span>
                          <span
                            className="shrink-0 text-[9px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded"
                            style={{ color: opStyle.color, backgroundColor: `${opStyle.color}15` }}
                          >
                            {opStyle.label}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer — WSDL source */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--color-surface-border)] bg-[rgba(255,255,255,0.02)]">
            <span className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
              <CheckCircleFilledIcon size={10} style={{ color: '#4ade80' }} />
              Using WSDL definition.
            </span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
