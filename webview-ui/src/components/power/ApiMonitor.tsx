/**
 * ApiMonitor — schedule requests to run periodically, alert on failure/slowness.
 * Feature 6B.9 — API monitoring (scheduled)
 *
 * ── What changed, and why it reads differently now ──
 *
 * The checks never ran. The panel posted `monitor:register` and waited for
 * `monitor:result`, and until `monitor-handler.ts` existed nothing answered —
 * so every status dot stayed amber, no run reached the audit log, and the
 * whole thing looked like a bug in the display. Now that results arrive, three
 * things had to follow: a rule has to be editable, its URL has to be checked
 * before it is scheduled, and each run has to be recorded somewhere a person
 * can look afterwards.
 */
import { useState, useEffect, useMemo } from 'react';
import { PlusIcon, TrashIcon, PencilIcon, RefreshIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import { ModalView, ButtonView, TextInputView, ToggleSwitchView, SelectInputView } from '@salilvnair/dui';
import { logUiEvent } from '../../store/ui-audit-store';
import { checkMonitorUrl } from '../../services/monitor/monitor-url';
import {
  INTERVAL_PRESETS, formatInterval, toValueUnit, checkInterval, readIntervalSeconds,
  type IntervalUnit,
} from '../../services/monitor/interval';

/** One recorded check. Kept short — this is a glance, not a time series. */
interface MonitorRun {
  at: number;
  status: number;
  ms: number;
  error?: string;
}

const HISTORY_LIMIT = 20;

interface MonitorRule {
  id: string;
  name: string;
  method: string;
  url: string;
  /** Canonical. `intervalMinutes` may still arrive from an older build. */
  intervalSeconds: number;
  intervalMinutes?: number;
  alertOnStatus: number[];
  alertOnSlowMs: number;
  enabled: boolean;
  lastStatus?: number;
  lastTime?: number;
  lastRunAt?: number;
  consecutiveFailures: number;
  history?: MonitorRun[];
}

interface Props {
  onClose: () => void;
  /** Pre-fills and opens the "Add Monitor" form immediately — used by the sidebar's "Monitor Request" action. */
  prefill?: { name: string; method: string; url: string };
}

const STORAGE_KEY = 'daakia:monitor-rules';
const ACCENT = 'var(--color-settings)';

function loadRules(): MonitorRule[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as MonitorRule[];
    /* Older rules stored whole minutes. Migrated on read because localStorage
       has no migration step to hang a rewrite on. */
    return raw.map(r => ({ ...r, intervalSeconds: readIntervalSeconds(r) }));
  } catch { return []; }
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

/**
 * The host is told the shape it understands, and nothing else.
 *
 * Deliberately not `{...rule}`: history and the failure counter are the panel's
 * business, and a scheduler does not need them.
 */
function toHostRule(r: MonitorRule) {
  return {
    id: r.id, name: r.name, method: r.method, url: r.url,
    intervalSeconds: r.intervalSeconds, alertOnSlowMs: r.alertOnSlowMs, enabled: r.enabled,
  };
}

/**
 * What an audit entry may carry.
 *
 * Never the URL. A monitored endpoint can hold a key in its query string, and
 * the audit log is read by people who were not the ones who typed it. The host
 * name is enough to tell two monitors apart; the rest is in the rule.
 */
function auditHost(url: string): string {
  try { return new URL(url).host; } catch { return 'unparsed'; }
}

const EMPTY_DRAFT = {
  method: 'GET', intervalSeconds: 300, alertOnStatus: [4, 5],
  alertOnSlowMs: 3000, enabled: true, consecutiveFailures: 0,
} as Partial<MonitorRule>;

export function ApiMonitor({ onClose, prefill }: Props) {
  const [rules, setRules] = useState<MonitorRule[]>(loadRules);
  const [adding, setAdding] = useState(!!prefill);
  /** Set while editing an existing rule; null while adding a new one. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<MonitorRule>>({
    ...EMPTY_DRAFT,
    method: prefill?.method || 'GET',
    name: prefill?.name, url: prefill?.url,
  });
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('30');
  const [customUnit, setCustomUnit] = useState<IntervalUnit>('s');
  const [touched, setTouched] = useState(false);
  const addToast = useToastStore(s => s.addToast);

  // ── Validation, computed rather than stored, so it cannot go stale ──────────

  const urlCheck = useMemo(() => checkMonitorUrl(draft.url || ''), [draft.url]);
  const nameError = (draft.name || '').trim() ? null : 'A name is required.';
  const customCheck = useMemo(
    () => checkInterval(Number(customValue), customUnit),
    [customValue, customUnit],
  );
  const intervalError = customOpen ? customCheck.error : null;
  const canSave = !urlCheck.error && !nameError && !intervalError;

  const effectiveInterval = customOpen && !customCheck.error
    ? customCheck.seconds
    : (draft.intervalSeconds || 300);

  // ── Results arriving from the host ─────────────────────────────────────────

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;

      if (msg.type === 'monitor:invalid') {
        addToast({ type: 'error', message: String(msg.reason) });
        return;
      }

      if (msg.type !== 'monitor:result') return;
      const { ruleId, status, responseTime, error } = msg as unknown as
        { ruleId: string; status: number; responseTime: number; error?: string };

      setRules(prev => {
        const updated = prev.map(r => {
          if (r.id !== ruleId) return r;
          const failed = status === 0 || status >= 400 || responseTime > r.alertOnSlowMs;
          const run: MonitorRun = { at: Date.now(), status, ms: responseTime, error };
          return {
            ...r,
            lastStatus: status, lastTime: responseTime, lastRunAt: run.at,
            consecutiveFailures: failed ? r.consecutiveFailures + 1 : 0,
            /* Newest first, and capped: this is a glance at recent behaviour,
               not a time series, and localStorage is a poor database. */
            history: [run, ...(r.history || [])].slice(0, HISTORY_LIMIT),
          };
        });
        saveRules(updated);

        /* Every check is recorded, pass or fail. A log that only holds failures
           cannot answer "was it up at four o'clock". */
        const rule = updated.find(r => r.id === ruleId);
        if (rule) {
          logUiEvent('monitor.check', {
            ruleId, name: rule.name, host: auditHost(rule.url),
            status, ms: responseTime,
            outcome: error ? 'error' : status >= 400 ? 'failed' : responseTime > rule.alertOnSlowMs ? 'slow' : 'ok',
          });
        }
        return updated;
      });
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [addToast]);

  // ── Add, edit, and the rest ────────────────────────────────────────────────

  const closeForm = () => {
    setAdding(false);
    setEditingId(null);
    setCustomOpen(false);
    setTouched(false);
    setDraft({ ...EMPTY_DRAFT });
  };

  const openEdit = (rule: MonitorRule) => {
    const { value, unit } = toValueUnit(rule.intervalSeconds);
    const isPreset = INTERVAL_PRESETS.some(p => p.seconds === rule.intervalSeconds);
    setDraft({ ...rule });
    setEditingId(rule.id);
    setAdding(true);
    setCustomOpen(!isPreset);
    setCustomValue(String(value));
    setCustomUnit(unit);
    setTouched(false);
  };

  const saveDraft = () => {
    setTouched(true);
    if (!canSave) return;

    if (editingId) {
      const updated = rules.map(r => r.id === editingId ? {
        ...r,
        name: (draft.name || '').trim(),
        method: draft.method || 'GET',
        url: (draft.url || '').trim(),
        intervalSeconds: effectiveInterval,
        alertOnSlowMs: draft.alertOnSlowMs || 3000,
      } : r);
      const rule = updated.find(r => r.id === editingId)!;
      setRules(updated);
      saveRules(updated);
      logUiEvent('settings.monitor_edit', {
        ruleId: rule.id, name: rule.name, host: auditHost(rule.url),
        intervalSeconds: rule.intervalSeconds,
      });
      /* Re-register rather than patch: the host restarts the timer on register,
         which is what a changed interval needs. */
      postMsg({ type: 'monitor:register', rule: toHostRule(rule) });
      addToast({ type: 'success', message: `Monitor "${rule.name}" updated` });
      closeForm();
      return;
    }

    const rule: MonitorRule = {
      id: `monitor-${Date.now()}`,
      name: (draft.name || '').trim(),
      method: draft.method || 'GET',
      url: (draft.url || '').trim(),
      intervalSeconds: effectiveInterval,
      alertOnStatus: draft.alertOnStatus || [4, 5],
      alertOnSlowMs: draft.alertOnSlowMs || 3000,
      enabled: true,
      consecutiveFailures: 0,
      history: [],
    };
    const updated = [...rules, rule];
    /* Host, not URL — a query string can hold a key. */
    logUiEvent('settings.monitor_add', {
      ruleId: rule.id, name: rule.name, host: auditHost(rule.url),
      method: rule.method, intervalSeconds: rule.intervalSeconds,
    });
    setRules(updated);
    saveRules(updated);
    postMsg({ type: 'monitor:register', rule: toHostRule(rule) });
    closeForm();
    addToast({ type: 'success', message: `Monitor "${rule.name}" registered` });
  };

  const toggleRule = (id: string) => {
    const updated = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    const rule = updated.find(r => r.id === id);
    logUiEvent('settings.monitor_toggle', { ruleId: id, enabled: rule?.enabled });
    setRules(updated);
    saveRules(updated);
    if (rule) postMsg({ type: rule.enabled ? 'monitor:register' : 'monitor:pause', rule: toHostRule(rule), ruleId: id });
  };

  const checkNow = (rule: MonitorRule) => {
    logUiEvent('monitor.check_now', { ruleId: rule.id, name: rule.name, host: auditHost(rule.url) });
    postMsg({ type: 'monitor:checkNow', rule: toHostRule(rule) });
    addToast({ type: 'info', message: `Checking "${rule.name}"…` });
  };

  const deleteRule = (id: string) => {
    logUiEvent('settings.monitor_del', { ruleId: id });
    const updated = rules.filter(r => r.id !== id);
    setRules(updated);
    saveRules(updated);
    postMsg({ type: 'monitor:remove', ruleId: id });
    if (editingId === id) closeForm();
  };

  /** Re-arm every enabled rule on mount — the host's timers die with the panel. */
  useEffect(() => {
    for (const r of rules) if (r.enabled) postMsg({ type: 'monitor:register', rule: toHostRule(r) });
    // Mount only: re-running this on every rule change would double-register.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fieldError = (msg: string | null) => touched && msg ? (
    <p className="text-[10.5px] mt-1 m-0" style={{ color: 'var(--color-error)' }}>{msg}</p>
  ) : null;

  return (
    <ModalView
      open
      title="API Monitor"
      subtitle="Schedule periodic checks — get VS Code notifications on failure"
      headerColor={ACCENT}
      size="lg"
      onClose={onClose}
      footerRight={
        <ButtonView size="md" variant="primary" accentColor={ACCENT} iconLeft={<PlusIcon size={10} />}
                    onClick={() => { closeForm(); setAdding(true); }}>
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

        {/* Add / edit form — one form, because the fields are identical and two
            would drift. */}
        {adding && (
          <div className="rounded-xl border p-4 flex flex-col gap-3"
            style={{ borderColor: `color-mix(in srgb, ${ACCENT} 30%, var(--color-surface-border))`, backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-panel))` }}>
            <p className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {editingId ? 'Edit Monitor' : 'New Monitor'}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Name</label>
                <TextInputView
                  value={draft.name || ''}
                  onChange={e => setDraft(r => ({ ...r, name: e.target.value }))}
                  placeholder="API Health Check"
                  size="md"
                  accentColor={ACCENT}
                  style={{ width: '100%' }}
                />
                {fieldError(nameError)}
              </div>

              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Interval</label>
                <div className="flex gap-1.5 flex-wrap items-center">
                  {INTERVAL_PRESETS.map(p => (
                    <ButtonView
                      key={p.seconds}
                      size="sm"
                      variant={!customOpen && draft.intervalSeconds === p.seconds ? 'accent' : 'secondary'}
                      accentColor={!customOpen && draft.intervalSeconds === p.seconds ? ACCENT : 'var(--color-text-muted)'}
                      onClick={() => { setCustomOpen(false); setDraft(r => ({ ...r, intervalSeconds: p.seconds })); }}
                    >
                      {p.label}
                    </ButtonView>
                  ))}
                  <ButtonView
                    size="sm"
                    variant={customOpen ? 'accent' : 'secondary'}
                    accentColor={customOpen ? ACCENT : 'var(--color-text-muted)'}
                    onClick={() => setCustomOpen(true)}
                  >
                    Custom
                  </ButtonView>
                </div>

                {customOpen && (
                  <div className="flex gap-1.5 items-center mt-2">
                    <TextInputView
                      type="number"
                      value={customValue}
                      onChange={e => setCustomValue(e.target.value)}
                      size="md"
                      accentColor={ACCENT}
                      style={{ width: 80 }}
                    />
                    <SelectInputView
                      value={customUnit}
                      onChange={v => setCustomUnit(v as IntervalUnit)}
                      options={[
                        { label: 'seconds', value: 's' },
                        { label: 'minutes', value: 'm' },
                        { label: 'hours', value: 'h' },
                      ]}
                      size="md"
                      accentColor={ACCENT}
                      style={{ width: 110 }}
                    />
                    {!customCheck.error && (
                      <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                        every {formatInterval(customCheck.seconds)}
                      </span>
                    )}
                  </div>
                )}
                {fieldError(intervalError)}
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>URL</label>
                <div className="flex gap-2">
                  {['GET', 'POST', 'HEAD'].map(m => (
                    <ButtonView
                      key={m}
                      size="sm"
                      variant={draft.method === m ? 'accent' : 'secondary'}
                      accentColor={draft.method === m ? ACCENT : 'var(--color-text-muted)'}
                      onClick={() => setDraft(r => ({ ...r, method: m }))}
                    >
                      {m}
                    </ButtonView>
                  ))}
                  <TextInputView
                    value={draft.url || ''}
                    onChange={e => setDraft(r => ({ ...r, url: e.target.value }))}
                    onBlur={() => setTouched(true)}
                    placeholder="https://api.example.com/health"
                    size="md"
                    accentColor={urlCheck.error && touched ? 'var(--color-error)' : ACCENT}
                    style={{ flex: 1, fontFamily: 'monospace' }}
                  />
                </div>
                {fieldError(urlCheck.error)}
                {/* A warning is worth saying and not worth blocking on. */}
                {!urlCheck.error && urlCheck.warning && (
                  <p className="text-[10.5px] mt-1 m-0" style={{ color: 'var(--color-warning)' }}>{urlCheck.warning}</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Alert if slower than (ms)</label>
                <TextInputView
                  type="number"
                  value={String(draft.alertOnSlowMs || 3000)}
                  onChange={e => setDraft(r => ({ ...r, alertOnSlowMs: Number(e.target.value) }))}
                  size="md"
                  accentColor={ACCENT}
                  style={{ width: 120 }}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <ButtonView size="md" accentColor="var(--color-text-muted)" onClick={closeForm}>
                Cancel
              </ButtonView>
              <ButtonView size="md" variant="primary" accentColor={ACCENT}
                          disabled={touched && !canSave} onClick={saveDraft}>
                {editingId ? 'Save Changes' : 'Add Monitor'}
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
                <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>every {formatInterval(rule.intervalSeconds)}</span>
              </div>
              <p className="text-[11px] font-mono truncate mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{rule.url}</p>
              {rule.lastRunAt && (
                <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  Last: <span style={{ color: STATUS_COLOR(rule.lastStatus) }}>{rule.lastStatus || 'no answer'}</span>
                  {rule.lastTime !== undefined && <> · {rule.lastTime}ms</>}
                  {' · '}{new Date(rule.lastRunAt).toLocaleTimeString()}
                  {rule.consecutiveFailures > 0 && <span style={{ color: 'var(--color-error)' }}> · {rule.consecutiveFailures} consecutive failures</span>}
                </p>
              )}

              {/* Recent runs, newest on the right so the row reads like time.
                  A bar each, coloured by outcome — enough to see a pattern
                  without opening anything. */}
              {(rule.history?.length ?? 0) > 0 && (
                <div className="flex items-end gap-[2px] mt-1.5" style={{ height: 14 }}>
                  {[...(rule.history || [])].reverse().map((h, i) => (
                    <span
                      key={i}
                      title={`${new Date(h.at).toLocaleTimeString()} — ${h.error || h.status} · ${h.ms}ms`}
                      style={{
                        width: 5, borderRadius: 1,
                        height: `${Math.max(4, Math.min(14, (h.ms / Math.max(rule.alertOnSlowMs, 1)) * 14))}px`,
                        backgroundColor: h.status === 0 || h.status >= 400
                          ? 'var(--color-error)'
                          : h.ms > rule.alertOnSlowMs ? 'var(--color-warning)' : 'var(--color-success)',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <ToggleSwitchView
                checked={rule.enabled}
                onChange={() => toggleRule(rule.id)}
                accentColor={ACCENT}
                size="sm"
              />
              <button type="button" onClick={() => checkNow(rule)} title="Check now"
                className="w-6 h-6 flex items-center justify-center opacity-40 hover:opacity-100 cursor-pointer">
                <RefreshIcon size={11} />
              </button>
              <button type="button" onClick={() => openEdit(rule)} title="Edit monitor"
                className="w-6 h-6 flex items-center justify-center opacity-40 hover:opacity-100 cursor-pointer">
                <PencilIcon size={11} />
              </button>
              <button type="button" onClick={() => deleteRule(rule.id)} title="Delete monitor"
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
