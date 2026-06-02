import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore } from '../../store/tabs-store';
import type { GrpcMethodType, GrpcServiceDef } from '../../store/tabs-store';
import { GrpcUnaryIcon, GrpcServerStreamIcon, GrpcClientStreamIcon, GrpcBidiStreamIcon, CheckCircleFilledIcon, RefreshIcon, ChevronDownIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useClickOutside } from '../../hooks/useClickOutside';

const EMPTY_SERVICES: GrpcServiceDef[] = [];

/**
 * Stream type color scheme:
 * - Unary: blue (single request/response)
 * - Server Streaming: amber/yellow (server pushes multiple responses)
 * - Client Streaming: green (client pushes multiple requests)
 * - Bidi Streaming: pink/rose (both directions stream simultaneously)
 */
const STREAM_TYPE_CONFIG: Record<GrpcMethodType, { icon: typeof GrpcUnaryIcon; color: string; label: string; description: string }> = {
  unary: {
    icon: GrpcUnaryIcon,
    color: '#60a5fa', // blue-400
    label: 'Unary',
    description: 'Single request → single response',
  },
  server_streaming: {
    icon: GrpcServerStreamIcon,
    color: '#fbbf24', // amber-400
    label: 'Server Stream',
    description: 'Single request → stream of responses',
  },
  client_streaming: {
    icon: GrpcClientStreamIcon,
    color: '#4ade80', // green-400
    label: 'Client Stream',
    description: 'Stream of requests → single response',
  },
  bidi_streaming: {
    icon: GrpcBidiStreamIcon,
    color: '#f472b6', // pink-400
    label: 'Bidi Stream',
    description: 'Stream of requests ↔ stream of responses',
  },
};

/**
 * GrpcMethodSelector — TextboxDropdown that shows discovered services as categories
 * with methods as selectable options, styled with stream-type colored icons.
 * Also allows free-text input for manual method entry.
 */
export function GrpcMethodSelector() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  useClickOutside(dropdownRef, () => setOpen(false), open);

  const services = activeTab?.grpcServices ?? EMPTY_SERVICES;
  const method = activeTab?.grpcMethod || '';

  // Filter services/methods based on text input
  const filteredServices = useMemo(() => {
    if (!filter.trim()) return services;
    const lf = filter.toLowerCase();
    return services
      .map(svc => ({
        ...svc,
        methods: svc.methods.filter(m =>
          m.name.toLowerCase().includes(lf) ||
          m.fullName.toLowerCase().includes(lf) ||
          svc.name.toLowerCase().includes(lf)
        ),
      }))
      .filter(svc => svc.methods.length > 0);
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

  const handleSelect = useCallback((fullName: string, rpcType: GrpcMethodType) => {
    if (!activeTab) return;
    updateTab(activeTab.id, {
      grpcMethod: fullName,
      dirty: true,
      authData: { ...activeTab.authData, grpc_rpcType: rpcType },
    });
    setOpen(false);
    setFilter('');
  }, [activeTab, updateTab]);

  const handleInputChange = useCallback((val: string) => {
    if (!activeTab) return;
    setFilter(val);
    updateTab(activeTab.id, { grpcMethod: val, dirty: true });
    if (services.length > 0 && !open) setOpen(true);
  }, [activeTab, updateTab, services, open]);

  const handleRefresh = useCallback(() => {
    if (!activeTab) return;
    const endpoint = activeTab.url.trim();
    if (!endpoint) return;
    updateTab(activeTab.id, { grpcReflectionStatus: 'loading' });
    postMsg({
      type: 'grpc:reflect',
      tabId: activeTab.id,
      endpoint,
      tls: activeTab.grpcTls ?? false,
    });
  }, [activeTab, updateTab]);

  if (!activeTab) return null;

  const hasServices = services.length > 0;

  // Display: Service/Method format with stream type icon
  const getMethodDisplay = () => {
    if (!method) return { text: '', type: 'unary' as GrpcMethodType };
    // Find the method in services to get its type
    for (const svc of services) {
      const found = svc.methods.find(m => m.fullName === method);
      if (found) {
        const svcShort = svc.name.split('.').pop() || svc.name;
        return { text: `${svcShort}/${found.name}`, type: found.type };
      }
    }
    // Fallback for manual entry
    return { text: method, type: 'unary' as GrpcMethodType };
  };
  const methodDisplay = getMethodDisplay();
  const displayConfig = STREAM_TYPE_CONFIG[methodDisplay.type];
  const DisplayIcon = displayConfig.icon;

  return (
    <div ref={containerRef} className="flex items-center gap-1.5 flex-[2] min-w-0 relative">
      {/* Method selector — styled like a dropdown trigger */}
      <div
        className="flex-1 min-w-0 relative cursor-pointer"
        onClick={() => { if (hasServices && !open) setOpen(true); }}
      >
        {/* Selected method display (hidden when dropdown is open for filtering) */}
        {!open && method && hasServices ? (
          <div
            className="flex items-center gap-2 w-full h-[36px] px-2.5 pr-8 rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[13px] font-mono text-[var(--color-text-primary)] cursor-pointer"
            onClick={() => { setOpen(true); setFilter(''); }}
          >
            <span style={{ color: displayConfig.color }} className="shrink-0">
              <DisplayIcon size={13} />
            </span>
            <span className="truncate">{methodDisplay.text}</span>
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={hasServices ? filter : method}
            onChange={(e) => {
              if (hasServices) {
                setFilter(e.target.value);
                if (!open) setOpen(true);
              } else {
                handleInputChange(e.target.value);
              }
            }}
            onFocus={() => { if (hasServices && !open) setOpen(true); }}
            placeholder={hasServices ? 'Search methods...' : 'package.Service/Method'}
            className="w-full h-[36px] px-2.5 pr-8 rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[13px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors cursor-pointer"
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
            {filteredServices.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-[var(--color-text-muted)]">
                No methods match "{filter}"
              </div>
            ) : (
              filteredServices.map(svc => (
                <div key={svc.name}>
                  {/* Service category header */}
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] bg-[rgba(255,255,255,0.02)] border-b border-[var(--color-surface-border)]">
                    {svc.name.split('.').pop() || svc.name}
                  </div>
                  {/* Methods */}
                  {svc.methods.map(m => {
                    const cfg = STREAM_TYPE_CONFIG[m.type];
                    const Icon = cfg.icon;
                    const isSelected = method === m.fullName;
                    return (
                      <button
                        key={m.fullName}
                        type="button"
                        onClick={() => handleSelect(m.fullName, m.type)}
                        className={`flex items-center gap-2.5 w-full px-3 py-[7px] text-left cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[rgba(0,184,181,0.1)]'
                            : 'hover:bg-[var(--color-item-hover-bg)]'
                        }`}
                      >
                        <span style={{ color: cfg.color }} className="shrink-0">
                          <Icon size={13} />
                        </span>
                        <span className="flex-1 min-w-0 text-[12px] font-mono text-[var(--color-text-primary)] truncate">
                          {m.name}
                        </span>
                        <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color: cfg.color, backgroundColor: `${cfg.color}15` }}>
                          {cfg.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer — reflection source */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--color-surface-border)] bg-[rgba(255,255,255,0.02)]">
            <span className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
              <CheckCircleFilledIcon size={10} style={{ color: '#4ade80' }} />
              Using server reflection.
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-protocol-grpc)] cursor-pointer transition-colors"
              title="Refresh services"
            >
              <RefreshIcon size={10} />
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
