/**
 * AuditConfigTab — configurable audit event framework.
 * Each event type has: module, button, action — enable/disable individually.
 * Config persists to localStorage via ui-audit-store.
 * Groups are collapsible via the category chip (like AiFeatureSettings).
 */
import { useState, useCallback } from 'react';
import { ChevronRightIcon } from '../../../icons';
import { AUDIT_EVENT_DEFS, getAuditConfig, setAuditEventEnabled, isAuditEventEnabled, resetAuditConfig } from '../../../store/ui-audit-store';

const MODULE_ORDER = ['REST', 'GraphQL', 'gRPC', 'SOAP', 'WebSocket', 'SSE', 'MQTT', 'Socket.IO', 'Mock Server', 'Collections', 'History', 'Settings'];

function useAuditConfig() {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);
  return { tick, refresh };
}

export function AuditConfigTab() {
  const { refresh } = useAuditConfig();
  const config = getAuditConfig();
  // Empty set = all groups expanded by default
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (module: string) =>
    setCollapsed(prev => { const n = new Set(prev); n.has(module) ? n.delete(module) : n.add(module); return n; });

  const toggle = (id: string, enabled: boolean) => {
    setAuditEventEnabled(id, enabled);
    refresh();
  };

  const toggleModule = (module: string, enable: boolean) => {
    AUDIT_EVENT_DEFS.filter(d => d.module === module).forEach(d => setAuditEventEnabled(d.id, enable));
    refresh();
  };

  const toggleAll = (enable: boolean) => {
    AUDIT_EVENT_DEFS.forEach(d => setAuditEventEnabled(d.id, enable));
    refresh();
  };

  const handleReset = () => {
    resetAuditConfig();
    refresh();
  };

  const grouped = MODULE_ORDER.map(module => ({
    module,
    defs: AUDIT_EVENT_DEFS.filter(d => d.module === module),
  })).filter(g => g.defs.length > 0);

  const totalEnabled = AUDIT_EVENT_DEFS.filter(d => isAuditEventEnabled(d.id)).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ─── Toolbar ─── */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0"
        style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'rgba(255,255,255,0.025)' }}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[var(--color-text-primary)]">Audit Config</span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
            style={{ color: 'var(--color-primary)', backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 20%, transparent)' }}>
            {totalEnabled}/{AUDIT_EVENT_DEFS.length} active
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => toggleAll(true)}
            className="px-2 py-0.5 text-[10px] rounded cursor-pointer transition-colors border"
            style={{ color: 'var(--color-success)', borderColor: 'color-mix(in srgb, var(--color-success) 25%, transparent)', background: 'color-mix(in srgb, var(--color-success) 6%, transparent)' }}>
            Enable All
          </button>
          <button type="button" onClick={() => toggleAll(false)}
            className="px-2 py-0.5 text-[10px] rounded cursor-pointer transition-colors border"
            style={{ color: 'var(--color-error)', borderColor: 'color-mix(in srgb, var(--color-error) 25%, transparent)', background: 'color-mix(in srgb, var(--color-error) 6%, transparent)' }}>
            Disable All
          </button>
          <button type="button" onClick={handleReset}
            className="px-2 py-0.5 text-[10px] rounded cursor-pointer transition-colors border text-[var(--color-text-muted)]"
            style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}>
            Reset Defaults
          </button>
        </div>
      </div>

      {/* ─── Description ─── */}
      <div className="px-4 py-2 shrink-0 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
        <p className="text-[10.5px] text-[var(--color-text-muted)] leading-relaxed">
          Control which UI events get recorded in the Audit Log. Events are structured as
          <span className="font-mono text-[10px] mx-1 px-1 py-0.5 rounded"
            style={{ color: 'var(--color-primary)', backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' }}>
            module · button · action
          </span>
          — disable noisy events to keep the log focused.
        </p>
      </div>

      {/* ─── Event type list ─── */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-4 py-3">
        <div className="flex flex-col gap-4">
          {grouped.map(({ module, defs }) => {
            const color = defs[0]?.color ?? 'var(--color-text-muted)';
            const groupEnabled = defs.filter(d => isAuditEventEnabled(d.id)).length;
            const allGroupEnabled = groupEnabled === defs.length;
            const isCollapsed = collapsed.has(module);
            return (
              <div key={module}>
                {/* Group header — chip is clickable to collapse */}
                <div className="flex items-center gap-2 mb-1.5">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(module)}
                    className="flex items-center gap-2 cursor-pointer min-w-0"
                    style={{ background: 'none', border: 'none', padding: 0 }}
                  >
                    <ChevronRightIcon
                      size={12}
                      style={{
                        color,
                        transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                        transition: 'transform 0.2s ease',
                        flexShrink: 0,
                        opacity: 0.7,
                      }}
                    />
                    <span className="text-[9.5px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}>
                      {module}
                    </span>
                  </button>
                  <div className="flex-1 h-px" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }} />
                  <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{groupEnabled}/{defs.length}</span>
                  {/* Group-level toggle switch */}
                  <button type="button"
                    onClick={e => { e.stopPropagation(); toggleModule(module, !allGroupEnabled); refresh(); }}
                    className="w-[28px] h-[15px] rounded-full cursor-pointer transition-all relative flex-shrink-0"
                    style={{ backgroundColor: allGroupEnabled ? color : 'rgba(255,255,255,0.1)' }}
                    title={allGroupEnabled ? `Disable all ${module}` : `Enable all ${module}`}>
                    <span className="absolute top-[2px] w-[11px] h-[11px] rounded-full bg-white shadow transition-all duration-200"
                      style={{ left: allGroupEnabled ? '14px' : '2px' }} />
                  </button>
                </div>

                {/* Collapsible rows */}
                {!isCollapsed && (
                  <div className="rounded-xl border overflow-hidden"
                    style={{ borderColor: `color-mix(in srgb, ${color} 12%, transparent)`, backgroundColor: `color-mix(in srgb, ${color} 2%, transparent)` }}>
                    {defs.map((def, idx) => {
                      const enabled = isAuditEventEnabled(def.id);
                      return (
                        <div key={def.id}
                          className={`flex items-center gap-3 px-3 py-2 ${idx < defs.length - 1 ? 'border-b' : ''}`}
                          style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                          {/* Labels */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10.5px] font-medium"
                                style={{ color: enabled ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                                {def.description}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[9px] px-1 py-0.5 rounded"
                                style={{ color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}>
                                {def.button}
                              </span>
                              <span className="text-[9px] text-[var(--color-text-muted)]">·</span>
                              <span className="font-mono text-[9px] text-[var(--color-text-muted)]">{def.action}</span>
                              <span className="text-[9px] text-[var(--color-text-muted)]">·</span>
                              <span className="font-mono text-[9px] text-[var(--color-text-muted)]">{def.id}</span>
                            </div>
                          </div>
                          {/* Per-event toggle */}
                          <button type="button"
                            onClick={() => toggle(def.id, !enabled)}
                            className="w-[32px] h-[18px] rounded-full cursor-pointer transition-all flex-shrink-0 relative"
                            style={{ backgroundColor: enabled ? color : 'rgba(255,255,255,0.1)' }}
                            title={enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}>
                            <span className="absolute top-[3px] w-[12px] h-[12px] rounded-full bg-white shadow transition-all duration-200"
                              style={{ left: enabled ? '17px' : '3px' }} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
