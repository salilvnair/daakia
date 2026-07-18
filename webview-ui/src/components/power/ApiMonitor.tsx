/**
 * ApiMonitor — schedule requests to run periodically, alert on failure/slowness.
 * Feature 6B.9 — API monitoring (scheduled)
 */
import { useState, useEffect } from 'react';
import { PlusIcon, TrashIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import { ModalView, ButtonView, TextInputView, ToggleSwitchView } from '@salilvnair/dui';
import { logUiEvent } from '../../store/ui-audit-store';

interface MonitorRule {
  id: string;
  name: string;
  method: string;
  url: string;
  intervalMinutes: number;
  alertOnStatus: number[];
  alertOnSlowMs: number;
  enabled: boolean;
  lastStatus?: number;
  lastTime?: number;
  lastRunAt?: number;
  consecutiveFailures: number;
}

interface Props {
  onClose: () => void;
  /** Pre-fills and opens the "Add Monitor" form immediately — used by the sidebar's "Monitor Request" action. */
  prefill?: { name: string; method: string; url: string };
}

const STORAGE_KEY = 'daakia:monitor-rules';
const ACCENT = 'var(--color-settings)';

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

export function ApiMonitor({ onClose, prefill }: Props) {
  const [rules, setRules] = useState<MonitorRule[]>(loadRules);
  const [adding, setAdding] = useState(!!prefill);
  const [newRule, setNewRule] = useState<Partial<MonitorRule>>({
    method: prefill?.method || 'GET', intervalMinutes: 5, alertOnStatus: [4, 5], alertOnSlowMs: 3000, enabled: true, consecutiveFailures: 0,
    name: prefill?.name, url: prefill?.url,
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
    logUiEvent('settings.monitor_add', { name: rule.name, url: rule.url });
    setRules(updated);
    saveRules(updated);
    postMsg({ type: 'monitor:register', rule });
    setAdding(false);
    setNewRule({ method: 'GET', intervalMinutes: 5, alertOnStatus: [4, 5], alertOnSlowMs: 3000, enabled: true, consecutiveFailures: 0 });
    addToast({ type: 'success', message: `Monitor "${rule.name}" registered` });
  };

  const toggleRule = (id: string) => {
    logUiEvent('settings.monitor_toggle', { ruleId: id });
    const updated = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    setRules(updated);
    saveRules(updated);
    const rule = updated.find(r => r.id === id);
    postMsg({ type: rule?.enabled ? 'monitor:register' : 'monitor:pause', rule });
  };

  const deleteRule = (id: string) => {
    logUiEvent('settings.monitor_del', { ruleId: id });
    const updated = rules.filter(r => r.id !== id);
    setRules(updated);
    saveRules(updated);
    postMsg({ type: 'monitor:remove', ruleId: id });
  };

  return (
    <ModalView
      open
      title="API Monitor"
      subtitle="Schedule periodic checks — get VS Code notifications on failure"
      headerColor={ACCENT}
      size="lg"
      onClose={onClose}
      footerRight={
        <ButtonView size="md" variant="primary" accentColor={ACCENT} iconLeft={<PlusIcon size={10} />} onClick={() => setAdding(true)}>
          Add Monitor
        </ButtonView>
      }
    >
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        {rules.length === 0 && !adding && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <p className="text-[12px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>No monitors configured</p>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Add monitors to track API uptime and performance</p>
            <ButtonView size="md" variant="primary" accentColor={ACCENT} iconLeft={<PlusIcon size={11} />} onClick={() => setAdding(true)}>
              Add First Monitor
            </ButtonView>
          </div>
        )}

        {/* Add rule form */}
        {adding && (
          <div className="rounded-xl border p-4 flex flex-col gap-3"
            style={{ borderColor: `color-mix(in srgb, ${ACCENT} 30%, var(--color-surface-border))`, backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-panel))` }}>
            <p className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>New Monitor</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Name</label>
                <TextInputView
                  value={newRule.name || ''}
                  onChange={e => setNewRule(r => ({ ...r, name: e.target.value }))}
                  placeholder="API Health Check"
                  size="md"
                  accentColor={ACCENT}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Interval</label>
                <div className="flex gap-1.5">
                  {[1, 5, 15, 30, 60].map(m => (
                    <ButtonView
                      key={m}
                      size="sm"
                      accentColor={newRule.intervalMinutes === m ? ACCENT : 'var(--color-text-muted)'}
                      onClick={() => setNewRule(r => ({ ...r, intervalMinutes: m }))}
                    >
                      {m >= 60 ? '1h' : `${m}m`}
                    </ButtonView>
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>URL</label>
                <div className="flex gap-2">
                  {['GET', 'POST', 'HEAD'].map(m => (
                    <ButtonView
                      key={m}
                      size="sm"
                      accentColor={newRule.method === m ? ACCENT : 'var(--color-text-muted)'}
                      onClick={() => setNewRule(r => ({ ...r, method: m }))}
                    >
                      {m}
                    </ButtonView>
                  ))}
                  <TextInputView
                    value={newRule.url || ''}
                    onChange={e => setNewRule(r => ({ ...r, url: e.target.value }))}
                    placeholder="https://api.example.com/health"
                    size="md"
                    accentColor={ACCENT}
                    style={{ flex: 1, fontFamily: 'monospace' }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Alert if slower than (ms)</label>
                <TextInputView
                  type="number"
                  value={String(newRule.alertOnSlowMs || 3000)}
                  onChange={e => setNewRule(r => ({ ...r, alertOnSlowMs: Number(e.target.value) }))}
                  size="md"
                  accentColor={ACCENT}
                  style={{ width: 120 }}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <ButtonView size="md" accentColor="var(--color-text-muted)" onClick={() => setAdding(false)}>
                Cancel
              </ButtonView>
              <ButtonView size="md" variant="primary" accentColor={ACCENT} onClick={addRule}>
                Add Monitor
              </ButtonView>
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
              <ToggleSwitchView
                checked={rule.enabled}
                onChange={() => toggleRule(rule.id)}
                accentColor={ACCENT}
                size="sm"
              />
              <button type="button" onClick={() => deleteRule(rule.id)}
                className="w-6 h-6 flex items-center justify-center opacity-40 hover:opacity-100 cursor-pointer">
                <TrashIcon size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ModalView>
  );
}
