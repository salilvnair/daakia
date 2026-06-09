/**
 * AuditLogTab — 7.3 Developer Tools: Audit Log
 * Colorful audit log: single URL-bar search, stage badges, Monaco read-only for payload preview.
 */
import { useState, useEffect, useCallback } from 'react';
import { postMsg } from '../../../vscode';
import { CodeEditor } from '../../shared';
import { TrashIcon, RefreshIcon, SearchIcon, ChevronDownIcon } from '../../../icons';

interface AuditEntry {
  audit_id: number;
  conversation_id: string;
  stage: string;
  model?: string;
  user_prompt?: string;
  system_prompt?: string;
  request_payload?: string;
  response_payload?: string;
  duration_ms?: number;
  error?: string;
  created_at: string;
}

// ─── Stage color / label ───────────────────────────────────────────────────────

const STAGE_LABEL: Record<string, string> = {
  'DAAKIA_AI':                 'AI Chat',
  'mock.rest.generate':        'REST Mock',
  'mock.graphql.generate':     'GQL Mock',
  'mock.websocket.generate':   'WS Mock',
  'mock.sse.generate':         'SSE Mock',
  'mock.socketio.generate':    'SIO Mock',
  'mock.grpc.generate':        'gRPC Mock',
  'mock.soap.generate':        'SOAP Mock',
  'mock.mqtt.generate':        'MQTT Mock',
  'rest.headers.suggest.generate': 'Header Suggest',
};

function stageColor(stage: string): string {
  if (stage.includes('error') || stage.includes('fail')) return '#ef4444';
  if (stage.includes('complete') || stage.includes('success')) return '#10b981';
  if (stage.includes('stream') || stage.includes('start')) return '#f59e0b';
  if (stage.includes('mock')) return 'var(--color-mock-server)';
  if (stage.includes('AI') || stage.includes('ai')) return 'var(--color-protocol-ai)';
  return '#818cf8';
}

function StageBadge({ stage }: { stage: string }) {
  const color = stageColor(stage);
  const label = STAGE_LABEL[stage] ?? stage.split('.').pop() ?? stage;
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0 whitespace-nowrap"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 20%, transparent)` }}
    >
      {label}
    </span>
  );
}

// ─── Payload block with Monaco read-only ──────────────────────────────────────

function PayloadBlock({ label, value, color, lang = 'plaintext' }: {
  label: string;
  value: string | null | undefined;
  color: string;
  lang?: string;
}) {
  if (!value) return null;
  // Detect JSON
  const trimmed = value.trim();
  const isJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  const language = isJson ? 'json' : lang;
  let display = value;
  if (isJson) {
    try { display = JSON.stringify(JSON.parse(trimmed), null, 2); } catch { /* raw */ }
  }
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded self-start"
        style={{ color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}
      >
        {label}
      </span>
      <div className="rounded-lg overflow-hidden border" style={{ borderColor: `color-mix(in srgb, ${color} 15%, transparent)` }}>
        <CodeEditor
          value={display.slice(0, 3000)}
          language={language}
          readOnly
          height="120px"
        />
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AuditLogTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(() => {
    postMsg({ type: 'aiAudit:load', limit: 500 });
  }, []);

  useEffect(() => {
    load();
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'aiAudit:data') setEntries(e.data.entries ?? []);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [load]);

  const handleDelete = (id: number) => {
    postMsg({ type: 'aiAudit:delete', auditId: id });
    setEntries(prev => prev.filter(e => e.audit_id !== id));
    if (expanded === id) setExpanded(null);
  };

  const handleClear = () => {
    postMsg({ type: 'aiAudit:clear' });
    setEntries([]);
    setExpanded(null);
  };

  const filtered = entries.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.stage.toLowerCase().includes(q) ||
      (e.model ?? '').toLowerCase().includes(q) ||
      (e.user_prompt ?? '').toLowerCase().includes(q) ||
      (e.conversation_id ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ─── Toolbar ─── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)] shrink-0">
        {/* Search bar: flex row — icon sits BESIDE input, both inside a styled container */}
        <div
          className="flex items-center gap-1.5 flex-1 h-[28px] px-2.5 rounded-md border transition-colors"
          style={{
            background: 'rgba(255,255,255,0.04)',
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <SearchIcon size={11} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by stage, model, prompt…"
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[11px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
          />
        </div>
        <span className="text-[10px] font-mono text-[var(--color-text-muted)] shrink-0 tabular-nums">{filtered.length} entries</span>
        <button type="button" onClick={load} title="Refresh"
          className="w-7 h-7 flex items-center justify-center rounded-md cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)] transition-colors">
          <RefreshIcon size={13} />
        </button>
        <button type="button" onClick={handleClear} title="Clear all"
          className="w-7 h-7 flex items-center justify-center rounded-md cursor-pointer text-[var(--color-text-muted)] hover:text-[#ef4444] hover:bg-[rgba(239,68,68,0.08)] transition-colors">
          <TrashIcon size={13} />
        </button>
      </div>

      {/* ─── Table ─── */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[11px] text-[var(--color-text-muted)]">
            {entries.length === 0 ? 'No audit entries yet — AI calls will appear here' : 'No matches'}
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10 bg-[var(--color-surface)]">
              <tr className="border-b border-[rgba(255,255,255,0.06)]">
                <th className="text-left px-4 py-2 font-medium text-[var(--color-text-muted)] w-[36px]">#</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)]">Stage</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)]">Model</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)]">Prompt (preview)</th>
                <th className="text-right px-2 py-2 font-medium text-[var(--color-text-muted)] w-[70px]">Duration</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)] w-[130px]">Time</th>
                <th className="w-[28px]" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const color = stageColor(e.stage);
                const isOpen = expanded === e.audit_id;
                return (
                  <>
                    <tr
                      key={e.audit_id}
                      onClick={() => setExpanded(isOpen ? null : e.audit_id)}
                      className="border-b border-[rgba(255,255,255,0.025)] cursor-pointer transition-colors"
                      style={{ background: isOpen ? `color-mix(in srgb, ${color} 5%, transparent)` : undefined }}
                      onMouseEnter={ev => { if (!isOpen) (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
                      onMouseLeave={ev => { if (!isOpen) (ev.currentTarget as HTMLElement).style.background = ''; }}
                    >
                      <td className="px-4 py-2 text-[var(--color-text-muted)] font-mono text-[10px]">{e.audit_id}</td>
                      <td className="px-2 py-2"><StageBadge stage={e.stage} /></td>
                      <td className="px-2 py-2 text-[var(--color-text-muted)] truncate max-w-[100px] text-[10.5px]">{e.model ?? '—'}</td>
                      <td className="px-2 py-2 text-[10.5px] truncate max-w-[220px]">
                        {e.error
                          ? <span className="text-[#ef4444]">{e.error}</span>
                          : <span className="text-[var(--color-text-primary)]">{(e.user_prompt ?? '').slice(0, 80) || '—'}</span>
                        }
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-[10px]" style={{ color: e.duration_ms != null ? color : 'var(--color-text-muted)' }}>
                        {e.duration_ms != null ? `${e.duration_ms}ms` : '—'}
                      </td>
                      <td className="px-2 py-2 text-[var(--color-text-muted)] font-mono text-[10px]">
                        {e.created_at.replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="px-2 py-2">
                        <ChevronDownIcon size={11} style={{ color, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                      </td>
                    </tr>

                    {isOpen && (
                      <tr key={`${e.audit_id}-detail`}>
                        <td colSpan={7} className="px-4 pb-4 pt-2" style={{ background: `color-mix(in srgb, ${color} 4%, var(--color-surface))` }}>
                          <div className="flex flex-col gap-3">
                            {/* Conversation ID */}
                            <div className="flex items-center gap-2 text-[10.5px]">
                              <span className="text-[var(--color-text-muted)] shrink-0">Conversation ID</span>
                              <span className="font-mono px-2 py-0.5 rounded text-[10px]" style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
                                {e.conversation_id}
                              </span>
                            </div>

                            {/* Payload blocks */}
                            {e.system_prompt && (
                              <PayloadBlock label="System Prompt" value={e.system_prompt} color="#818cf8" />
                            )}
                            {e.user_prompt && (
                              <PayloadBlock label="User Prompt" value={e.user_prompt} color="#06b6d4" />
                            )}
                            {e.response_payload && (
                              <PayloadBlock label="Response" value={e.response_payload} color="#10b981" />
                            )}
                            {e.error && (
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded self-start text-[#ef4444] bg-[rgba(239,68,68,0.1)]">
                                  Error
                                </span>
                                <p className="text-[10.5px] font-mono text-[#ef4444] px-1">{e.error}</p>
                              </div>
                            )}

                            {/* Delete row */}
                            <div className="flex justify-end pt-1">
                              <button
                                type="button"
                                onClick={() => handleDelete(e.audit_id)}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] rounded-lg cursor-pointer transition-colors border"
                                style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)' }}
                              >
                                <TrashIcon size={11} /> Delete entry
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
