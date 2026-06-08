/**
 * AiAuditPanel — full AI call audit log for Daakia.
 * Shows every AI request: system prompt, user prompt, request payload,
 * response, headers, and metadata. Mirrors dmcr_copilot's AI Footprint panel.
 */
import { useState, useEffect, useCallback } from 'react';
import { postMsg } from '../../vscode';
import { RefreshIcon, TrashIcon, CopyIcon, ChevronLeftIcon, SparkleIcon } from '../../icons';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CeAuditEntry {
  audit_id?: number;
  conversation_id: string;
  stage: string;
  model?: string | null;
  system_prompt?: string | null;
  user_prompt?: string | null;
  request_payload?: string | null;
  response_payload?: string | null;
  headers?: string | null;
  meta?: string | null;
  duration_ms?: number | null;
  error?: string | null;
  created_at?: string;
}

// ─── Detail tabs ──────────────────────────────────────────────────────────────
// System Prompt + User Prompt are convenience views derived from request_payload.messages[].
// Request + Response are the full actual payloads sent/received from the AI API.
// Full Audit is one combined object — the single source of truth from the DB.

const DETAIL_TABS = [
  { id: 'systemPrompt', label: 'System Prompt' },
  { id: 'userPrompt',   label: 'User Prompt' },
  { id: 'request',      label: 'Request' },
  { id: 'response',     label: 'Response' },
  { id: 'full',         label: 'Full Audit' },
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]['id'];

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy to clipboard"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10.5px] cursor-pointer transition-colors border"
      style={{
        color: copied ? 'var(--color-success)' : 'var(--color-text-muted)',
        borderColor: copied ? 'color-mix(in srgb, var(--color-success) 30%, transparent)' : 'var(--color-surface-border)',
        background: copied ? 'color-mix(in srgb, var(--color-success) 8%, transparent)' : 'transparent',
      }}
    >
      <CopyIcon size={10} />
      {copied ? 'Copied' : label}
    </button>
  );
}

// ─── Pretty JSON display ──────────────────────────────────────────────────────

function AuditContent({ value }: { value: string | null | undefined }) {
  if (value == null || value === '') {
    return <span className="text-[11.5px] text-[var(--color-text-muted)] italic">— empty —</span>;
  }
  let display = value;
  try {
    const parsed = JSON.parse(value);
    display = JSON.stringify(parsed, null, 2);
  } catch { /* not JSON, show as-is */ }
  return (
    <pre
      className="text-[11px] leading-[1.55] whitespace-pre-wrap break-words font-mono"
      style={{ color: 'var(--color-text-primary)', margin: 0 }}
    >
      {display}
    </pre>
  );
}

// ─── Entry detail view ────────────────────────────────────────────────────────

function EntryDetail({ entry, onBack }: { entry: CeAuditEntry; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<DetailTab>('systemPrompt');

  // ── Parse the two source-of-truth fields from DB ──────────────────────────
  type AiMessage = { role: string; content: string; id?: string; timestamp?: number };
  let request: Record<string, unknown> | null = null;
  let response: Record<string, unknown> | null = null;
  try { request = JSON.parse(entry.request_payload ?? ''); } catch { /* non-JSON or null */ }
  try { response = JSON.parse(entry.response_payload ?? ''); } catch { /* non-JSON or null */ }

  // ── Derive system prompt + user prompt from request.messages[] ────────────
  // These are convenience views — the real data is in request_payload.
  const messages: AiMessage[] = Array.isArray(request?.messages) ? (request!.messages as AiMessage[]) : [];
  const systemMessages = messages.filter(m => m.role === 'system');
  const userMessages   = messages.filter(m => m.role === 'user');
  const systemPromptText = systemMessages.length
    ? systemMessages.map(m => m.content).join('\n\n---\n\n')
    : null;
  const userPromptText = userMessages.length
    ? userMessages[userMessages.length - 1].content
    : null;

  // ── Full Audit = ONE combined object, built from request + response + metadata ──
  const fullAuditObj = {
    audit_id:        entry.audit_id,
    conversation_id: entry.conversation_id,
    stage:           entry.stage,
    model:           entry.model,
    duration_ms:     entry.duration_ms,
    error:           entry.error ?? null,
    created_at:      entry.created_at,
    request,
    response,
  };
  const fullAudit = JSON.stringify(fullAuditObj, null, 2);

  // ── Tab content — no duplicated DB columns; UI derives from the full payload ──
  const tabValues: Record<DetailTab, string | null | undefined> = {
    systemPrompt: systemPromptText,
    userPrompt:   userPromptText,
    request:      entry.request_payload,    // full actual request JSON
    response:     entry.response_payload,   // full actual response JSON
    full:         fullAudit,
  };

  const hasError = !!entry.error;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: 'var(--color-surface-border)', background: 'var(--color-panel)' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.06)]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <ChevronLeftIcon size={12} />
          Back
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[11.5px] text-[var(--color-text-muted)]">#{entry.audit_id}</span>
          <span
            className="text-[10.5px] font-mono font-semibold px-1.5 py-0.5 rounded"
            style={{
              color: hasError ? 'var(--color-error)' : 'var(--color-primary)',
              background: hasError
                ? 'color-mix(in srgb, var(--color-error) 12%, transparent)'
                : 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
            }}
          >
            {entry.stage}
          </span>
          {entry.model && (
            <span className="text-[11px] text-[var(--color-text-muted)] truncate">{entry.model}</span>
          )}
          {entry.duration_ms != null && (
            <span className="text-[11px]" style={{ color: 'var(--color-warning, #f59e0b)' }}>
              {entry.duration_ms}ms
            </span>
          )}
        </div>
        <CopyBtn text={fullAudit} label="Copy All" />
      </div>

      {/* Error banner */}
      {hasError && (
        <div
          className="px-3 py-2 text-[11.5px] border-b flex-shrink-0"
          style={{
            color: 'var(--color-error)',
            background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
            borderColor: 'color-mix(in srgb, var(--color-error) 20%, transparent)',
          }}
        >
          <span className="font-medium">Error: </span>{entry.error}
        </div>
      )}

      {/* Tab bar */}
      <div
        className="flex items-center gap-0 border-b flex-shrink-0 overflow-x-auto"
        style={{ borderColor: 'var(--color-surface-border)', background: 'var(--color-panel)' }}
      >
        {DETAIL_TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className="px-3 py-[7px] text-[11px] whitespace-nowrap cursor-pointer transition-colors border-b-[2px]"
            style={{
              color: activeTab === t.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
              borderColor: activeTab === t.id ? 'var(--color-primary)' : 'transparent',
              fontWeight: activeTab === t.id ? 600 : 400,
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${activeTab === t.id ? 'var(--color-primary)' : 'transparent'}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-3">
        {activeTab === 'full' ? (
          <div className="flex flex-col gap-4">
            {DETAIL_TABS.filter(t => t.id !== 'full').map(t => (
              <div key={t.id}>
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--color-primary)' }}
                >
                  {t.label}
                </div>
                <AuditContent value={tabValues[t.id]} />
              </div>
            ))}
          </div>
        ) : (
          <AuditContent value={tabValues[activeTab]} />
        )}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function AiAuditPanel() {
  const [entries, setEntries] = useState<CeAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewEntry, setViewEntry] = useState<CeAuditEntry | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  const loadEntries = useCallback(() => {
    setLoading(true);
    postMsg({ type: 'aiAudit:load', limit: 100 });
  }, []);

  // Listen for aiAudit:data message
  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'aiAudit:data') {
        setEntries((msg.entries as CeAuditEntry[]) ?? []);
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Load on mount
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const handleRefresh = () => {
    setLoading(true);
    loadEntries();
  };

  const handleDeleteOne = (auditId: number) => {
    postMsg({ type: 'aiAudit:delete', auditId });
    setEntries(prev => prev.filter(e => e.audit_id !== auditId));
  };

  const handleDeleteSelected = () => {
    const ids = Array.from(selected);
    postMsg({ type: 'aiAudit:deleteMany', auditIds: ids });
    setEntries(prev => prev.filter(e => e.audit_id == null || !selected.has(e.audit_id)));
    setSelected(new Set());
    setDeleteConfirm(false);
  };

  const handleClearAll = () => {
    postMsg({ type: 'aiAudit:clear' });
    setEntries([]);
    setSelected(new Set());
    setClearConfirm(false);
  };

  if (viewEntry) {
    return (
      <EntryDetail
        entry={viewEntry}
        onBack={() => setViewEntry(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b flex-shrink-0"
        style={{ borderColor: 'var(--color-surface-border)', background: 'var(--color-panel)' }}
      >
        <SparkleIcon size={14} style={{ color: 'var(--color-primary)' }} />
        <span className="text-[13px] font-medium text-[var(--color-text-primary)] flex-1">AI Audit</span>
        <span className="text-[11px] text-[var(--color-text-muted)]">{entries.length} records</span>
        <button
          type="button"
          onClick={handleRefresh}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors border"
          style={{
            color: 'var(--color-text-muted)',
            borderColor: 'var(--color-surface-border)',
            background: 'transparent',
          }}
          title="Refresh"
        >
          <RefreshIcon size={10} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={() => setClearConfirm(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors border"
            style={{
              color: 'var(--color-error)',
              borderColor: 'color-mix(in srgb, var(--color-error) 30%, transparent)',
              background: 'transparent',
            }}
            title="Clear all audit records"
          >
            <TrashIcon size={10} />
            Clear All
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
          <SparkleIcon size={24} style={{ color: 'var(--color-text-muted)', opacity: 0.4 }} />
          <span className="text-[12.5px] text-[var(--color-text-muted)]">No AI audit records yet</span>
          <span className="text-[11px] text-[var(--color-text-muted)] opacity-60">
            Make an AI request to generate audit data.
          </span>
        </div>
      ) : (
        <div className="flex-1 overflow-auto relative">
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr
                className="sticky top-0 z-10"
                style={{ background: 'var(--color-panel)', borderBottom: '1px solid var(--color-surface-border)' }}
              >
                <th className="px-2 py-2 w-8 text-left font-medium" style={{ color: 'var(--color-text-muted)' }}>
                  <input
                    type="checkbox"
                    checked={selected.size === entries.length && entries.length > 0}
                    ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < entries.length; }}
                    onChange={e => setSelected(e.target.checked ? new Set(entries.map(r => r.audit_id!)) : new Set())}
                    style={{ cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                  />
                </th>
                {['#', 'Stage', 'Model', 'Duration', 'Created At', ''].map(h => (
                  <th
                    key={h}
                    className="px-2 py-2 text-left font-medium whitespace-nowrap"
                    style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-surface-border)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const isChecked = e.audit_id != null && selected.has(e.audit_id);
                const hasError = !!e.error;
                return (
                  <tr
                    key={e.audit_id ?? i}
                    className="cursor-pointer transition-colors"
                    style={{
                      borderBottom: '1px solid color-mix(in srgb, var(--color-surface-border) 50%, transparent)',
                      background: isChecked
                        ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)'
                        : undefined,
                    }}
                    onClick={() => { setViewEntry(e); }}
                    onMouseEnter={ev => { if (!isChecked) (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
                    onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.background = isChecked ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : ''; }}
                  >
                    <td className="px-2 py-1.5 w-8" onClick={ev => ev.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (e.audit_id == null) return;
                          setSelected(prev => {
                            const s = new Set(prev);
                            s.has(e.audit_id!) ? s.delete(e.audit_id!) : s.add(e.audit_id!);
                            return s;
                          });
                        }}
                        style={{ cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                      />
                    </td>
                    <td className="px-2 py-1.5" style={{ color: 'var(--color-text-muted)' }}>
                      {e.audit_id}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className="font-mono font-semibold text-[10.5px] px-1.5 py-0.5 rounded"
                        style={{
                          color: hasError ? 'var(--color-error)' : 'var(--color-primary)',
                          background: hasError
                            ? 'color-mix(in srgb, var(--color-error) 12%, transparent)'
                            : 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                        }}
                      >
                        {e.stage}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-[var(--color-text-primary)]">
                      {e.model ?? '—'}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: 'var(--color-warning, #f59e0b)' }}>
                      {e.duration_ms != null ? `${e.duration_ms}ms` : '—'}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
                      {e.created_at?.slice(0, 19).replace('T', ' ') ?? ''}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap" onClick={ev => ev.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <CopyBtn
                          text={JSON.stringify({
                            audit_id: e.audit_id, conversation_id: e.conversation_id,
                            stage: e.stage, model: e.model, duration_ms: e.duration_ms,
                            error: e.error ?? null, created_at: e.created_at,
                            request: (() => { try { return JSON.parse(e.request_payload ?? ''); } catch { return e.request_payload; } })(),
                            response: (() => { try { return JSON.parse(e.response_payload ?? ''); } catch { return e.response_payload; } })(),
                          }, null, 2)}
                        />
                        <button
                          type="button"
                          title="Delete this entry"
                          onClick={() => e.audit_id != null && handleDeleteOne(e.audit_id)}
                          className="flex items-center justify-center w-[24px] h-[24px] rounded transition-colors cursor-pointer hover:bg-[rgba(239,68,68,0.1)]"
                          style={{ color: 'var(--color-error)', border: '1px solid color-mix(in srgb, var(--color-error) 25%, transparent)' }}
                        >
                          <TrashIcon size={10} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Multiselect HUD — ditto dmcr_copilot pill pattern */}
          {selected.size > 0 && (
            <div className="bs-multiselect-hud">
              <span className="bs-multiselect-hud-count">{selected.size} selected</span>
              <div className="bs-multiselect-hud-divider" />
              <button
                type="button"
                className="bs-multiselect-hud-btn bs-multiselect-hud-btn-danger"
                onClick={() => setDeleteConfirm(true)}
              >
                <TrashIcon size={11} />
                Delete
              </button>
              <div className="bs-multiselect-hud-divider" />
              <button
                type="button"
                className="bs-multiselect-hud-btn bs-multiselect-hud-btn-muted"
                onClick={() => setSelected(new Set())}
              >
                × Deselect
              </button>
            </div>
          )}
        </div>
      )}

      {/* Delete selected confirm dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div
            className="flex flex-col gap-3 p-6 rounded-xl border min-w-[300px]"
            style={{ background: 'var(--color-panel)', borderColor: 'color-mix(in srgb, var(--color-error) 40%, transparent)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
          >
            <p className="text-[13px] font-semibold" style={{ color: 'var(--color-error)' }}>
              Delete {selected.size} {selected.size === 1 ? 'entry' : 'entries'}?
            </p>
            <p className="text-[11.5px] text-[var(--color-text-muted)]">
              This action cannot be undone. The selected audit records will be permanently removed.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteConfirm(false)}
                className="px-3 py-1.5 rounded text-[12px] cursor-pointer border transition-colors"
                style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-surface-border)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="px-3 py-1.5 rounded text-[12px] cursor-pointer font-medium transition-colors"
                style={{ background: 'var(--color-error)', color: '#fff', border: 'none' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear all confirm dialog */}
      {clearConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div
            className="flex flex-col gap-3 p-6 rounded-xl border min-w-[300px]"
            style={{ background: 'var(--color-panel)', borderColor: 'color-mix(in srgb, var(--color-error) 40%, transparent)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
          >
            <p className="text-[13px] font-semibold" style={{ color: 'var(--color-error)' }}>
              Clear all {entries.length} audit records?
            </p>
            <p className="text-[11.5px] text-[var(--color-text-muted)]">
              This will permanently delete the entire AI audit log. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setClearConfirm(false)}
                className="px-3 py-1.5 rounded text-[12px] cursor-pointer border transition-colors"
                style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-surface-border)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="px-3 py-1.5 rounded text-[12px] cursor-pointer font-medium transition-colors"
                style={{ background: 'var(--color-error)', color: '#fff', border: 'none' }}
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
