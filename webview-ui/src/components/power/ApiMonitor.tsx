/**
 * ApiMonitor — schedule requests to run periodically, alert on failure/slowness.
 * Feature 6B.9 — API monitoring (scheduled)
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, PlusIcon, TrashIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';

interface MonitorRule {
  id: string;
  name: string;
  method: string;
  url: string;
  intervalMinutes: number;
  alertOnStatus: number[];  // HTTP status codes that trigger alert (e.g. [0, 4, 5] prefix)
  alertOnSlowMs: number;    // Alert if response > N ms
  enabled: boolean;
  lastStatus?: number;
  lastTime?: number;
  lastRunAt?: number;
  consecutiveFailures: number;
}

interface Props {
  onClose: () => void;
}

const STORAGE_KEY = 'daakia:monitor-rules';

function loadRules(): MonitorRule[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveRules(rules: MonitorRule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

const STATUS_COLOR = (status?: number) => {
  if (!status) return 'var(--color-text-muted)';
  if (status < 300) return 'var(--color-success)';
  if (status < 400) return 'var(--color-warning)';
  return 'var(--color-error)';
};

export function ApiMonitor({ onClose }: Props) {
  const [rules, setRules] = useState<MonitorRule[]>(loadRules);
  const [adding, setAdding] = useState(false);
  const [newRule, setNewRule] = useState<Partial<MonitorRule>>({
    method: 'GET', intervalMinutes: 5, alertOnStatus: [4, 5], alertOnSlowMs: 3000, enabled: true, consecutiveFailures: 0,
  });
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'monitor:result') {
        const { ruleId, status, responseTime } = msg as { ruleId: string; status: number; responseTime: number };
        setRules(prev => {
          const updated = prev.map(r => {
            if (r.id !== ruleId) return r;
            const failed = status >= 400 || responseTime > r.alertOnSlowMs;
            return { ...r, lastStatus: status, lastTime: responseTime, lastRunAt: Date.now(), consecutiveFailures: failed ? r.consecutiveFailures + 1 : 0 };
          });
          saveRules(updated);
          return updated;
        });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const addRule = () => {
    if (!newRule.url?.trim() || !newRule.name?.trim()) {
      addToast({ type: 'warning', message: 'Name and URL are required.' });
      return;
    }
    const rule: MonitorRule = {
      id: `monitor-${Date.now()}`,
      name: newRule.name || 'Monitor',
      method: newRule.method || 'GET',
      url: newRule.url || '',
      intervalMinutes: newRule.intervalMinutes || 5,
      alertOnStatus: newRule.alertOnStatus || [4, 5],
      alertOnSlowMs: newRule.alertOnSlowMs || 3000,
      enabled: true,
      consecutiveFailures: 0,
    };
    const updated = [...rules, rule];
    setRules(updated);
    saveRules(updated);
    postMsg({ type: 'monitor:register', rule });
    setAdding(false);
    setNewRule({ method: 'GET', intervalMinutes: 5, alertOnStatus: [4, 5], alertOnSlowMs: 3000, enabled: true, consecutiveFailures: 0 });
    addToast({ type: 'success', message: `Monitor "${rule.name}" registered` });
  };

  const toggleRule = (id: string) => {
    const updated = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    setRules(updated);
    saveRules(updated);
    const rule = updated.find(r => r.id === id);
    postMsg({ type: rule?.enabled ? 'monitor:register' : 'monitor:pause', rule });
  };

  const deleteRule = (id: string) => {
    const updated = rules.filter(r => r.id !== id);
    setRules(updated);
    saveRules(updated);
    postMsg({ type: 'monitor:remove', ruleId: id });
  };

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[700px] max-h-[90vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: '#1a1a1f', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">API Monitor</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Schedule periodic checks — get VS Code notifications on failure</p>
          </div>
          <button type="button" onClick={() => setAdding(true)}
            className="flex items-center gap-1 h-[26px] px-2.5 text-[11px] rounded cursor-pointer text-white"
            style={{ backgroundColor: 'var(--color-success)' }}>
            <PlusIcon size={10} />Add Monitor
          </button>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {rules.length === 0 && !adding && (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-[12px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>No monitors configured</p>
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Add monitors to track API uptime and performance</p>
              <button type="button" onClick={() => setAdding(true)}
                className="mt-2 h-[26px] px-2.5 text-[11px] font-medium rounded cursor-pointer text-white"
                style={{ backgroundColor: 'var(--color-success)' }}>
                <PlusIcon size={11} className="inline mr-1" />Add First Monitor
              </button>
            </div>
          )}

          {/* Add rule form */}
          {adding && (
            <div className="rounded-xl border p-4 flex flex-col gap-3"
              style={{ borderColor: 'color-mix(in srgb, var(--color-success) 30%, var(--color-surface-border))', backgroundColor: 'color-mix(in srgb, var(--color-success) 3%, var(--color-panel))' }}>
              <p className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>New Monitor</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Name</label>
                  <input value={newRule.name || ''} onChange={e => setNewRule(r => ({ ...r, name: e.target.value }))}
                    className="w-full h-[26px] px-2.5 rounded text-[11px] outline-none"
                    placeholder="API Health Check"
                    style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Interval</label>
                  <div className="flex gap-1.5">
                    {[1, 5, 15, 30, 60].map(m => (
                      <button key={m} type="button" onClick={() => setNewRule(r => ({ ...r, intervalMinutes: m }))}
                        className="px-2 py-1 text-[10px] rounded border cursor-pointer"
                        style={{
                          borderColor: newRule.intervalMinutes === m ? 'var(--color-info)' : 'var(--color-surface-border)',
                          color: newRule.intervalMinutes === m ? 'var(--color-info)' : 'var(--color-text-secondary)',
                        }}>
                        {m >= 60 ? '1h' : `${m}m`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>URL</label>
                  <div className="flex gap-2">
                    {['GET', 'POST', 'HEAD'].map(m => (
                      <button key={m} type="button" onClick={() => setNewRule(r => ({ ...r, method: m }))}
                        className="px-2 py-1 text-[10px] rounded border cursor-pointer flex-shrink-0"
                        style={{ borderColor: newRule.method === m ? 'var(--color-info)' : 'var(--color-surface-border)', color: newRule.method === m ? 'var(--color-info)' : 'var(--color-text-secondary)' }}>
                        {m}
                      </button>
                    ))}
                    <input value={newRule.url || ''} onChange={e => setNewRule(r => ({ ...r, url: e.target.value }))}
                      className="flex-1 h-[26px] px-2.5 rounded text-[11px] font-mono outline-none"
                      placeholder="https://api.example.com/health"
                      style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Alert if slower than (ms)</label>
                  <input type="number" value={newRule.alertOnSlowMs || 3000} onChange={e => setNewRule(r => ({ ...r, alertOnSlowMs: Number(e.target.value) }))}
                    className="w-[120px] h-[26px] px-2.5 rounded text-[11px] outline-none"
                    style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setAdding(false)}
                  className="h-[26px] px-2.5 text-[11px] rounded cursor-pointer"
                  style={{ color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface-hover)' }}>
                  Cancel
                </button>
                <button type="button" onClick={addRule}
                  className="h-[26px] px-2.5 text-[11px] font-medium rounded cursor-pointer text-white"
                  style={{ backgroundColor: 'var(--color-success)' }}>
                  Add Monitor
                </button>
              </div>
            </div>
          )}

          {/* Rules list */}
          {rules.map(rule => (
            <div key={rule.id} className="rounded-xl border p-4 flex items-start gap-3"
              style={{
                borderColor: rule.consecutiveFailures > 0 ? 'color-mix(in srgb, var(--color-error) 30%, var(--color-surface-border))' : 'var(--color-surface-border)',
                backgroundColor: rule.consecutiveFailures > 0 ? 'color-mix(in srgb, var(--color-error) 3%, var(--color-panel))' : 'var(--color-panel)',
              }}>

              {/* Status dot */}
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1"
                style={{
                  backgroundColor: !rule.enabled ? 'var(--color-text-muted)' :
                    rule.consecutiveFailures > 0 ? 'var(--color-error)' :
                    rule.lastRunAt ? 'var(--color-success)' : 'var(--color-warning)',
                }} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{rule.name}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: 'var(--color-info)' }}>{rule.method}</span>
                  <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>every {rule.intervalMinutes >= 60 ? '1h' : `${rule.intervalMinutes}m`}</span>
                </div>
                <p className="text-[11px] font-mono truncate mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{rule.url}</p>
                {rule.lastRunAt && (
                  <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Last: <span style={{ color: STATUS_COLOR(rule.lastStatus) }}>{rule.lastStatus || '?'}</span>
                    {rule.lastTime && <> · {rule.lastTime}ms</>}
                    {rule.consecutiveFailures > 0 && <span style={{ color: 'var(--color-error)' }}> · {rule.consecutiveFailures} consecutive failures</span>}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <label className="flex items-center gap-1 cursor-pointer">
                  <div className="relative w-8 h-4">
                    <input type="checkbox" checked={rule.enabled} onChange={() => toggleRule(rule.id)} className="sr-only" />
                    <div className="w-full h-full rounded-full transition-colors"
                      style={{ backgroundColor: rule.enabled ? 'var(--color-success)' : 'var(--color-surface-border)' }}>
                      <div className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform"
                        style={{ transform: rule.enabled ? 'translateX(16px)' : 'translateX(0)' }} />
                    </div>
                  </div>
                </label>
                <button type="button" onClick={() => deleteRule(rule.id)}
                  className="w-6 h-6 flex items-center justify-center opacity-40 hover:opacity-100 cursor-pointer">
                  <TrashIcon size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button type="button" onClick={onClose}
            className="h-[26px] px-2.5 text-[11px] font-medium rounded cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
