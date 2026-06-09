/**
 * AuditLogTab — 7.3 Developer Tools: Audit Log
 * Colorful audit log: single URL-bar search, stage badges, Monaco read-only for payload preview.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { postMsg } from '../../../vscode';
import { CodeEditor, SearchInput } from '../../shared';
import { TrashIcon, RefreshIcon, SearchIcon, CloseIcon, ChevronDownIcon } from '../../../icons';

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

// ─── Stage label map ───────────────────────────────────────────────────────────
// Names MUST match the button label the user sees in the UI.
const STAGE_LABEL: Record<string, string> = {
  // ── Core ───────────────────────────────────────────────────────────────────
  'DAAKIA_AI':                        'AI Chat',

  // ── Response panel AI actions ──────────────────────────────────────────────
  'rest.assert.generate':             'AI Assertions',
  'rest.semantic.validate':           'Semantic Validate',
  'rest.response.transform':          'Transform Response',
  'rest.response.diff':               'Compare with AI',
  'rest.schema.validate':             'Schema Validate',
  'rest.ts.generate':                 'TypeScript Types',
  'rest.pattern.check':               'Pattern Baseline',
  'rest.retry.advisor':               'Smart Retry',
  'rest.performance.insights':        'Performance Insights',
  'rest.changelog.generate':          'API Changelog',
  'rest.semantic.diff':               'Semantic Diff',
  'rest.contract.test':               'Contract Tests',

  // ── Request builder AI helpers ─────────────────────────────────────────────
  'rest.body.generate':               'Generate Body',
  'rest.headers.suggest.generate':    'Header Suggest',
  'rest.request.name':                'Name Request',
  'rest.env.extract':                 'Extract Variables',
  'rest.api.flow':                    'API Flow Builder',
  'rest.collection.organize':         'Organize Collection',
  'rest.collection.search':           'Smart Search',

  // ── Import tools ───────────────────────────────────────────────────────────
  'rest.curl.explain':                'Explain cURL',
  'rest.code.import':                 'Import Code',
  'import.logs':                      'From Logs',
  'import.voice':                     'Voice to Request',
  'import.openapi.enrich':            'OpenAPI Enrich',
  'import.screenshot':                'From Screenshot',

  // ── Collection tools ───────────────────────────────────────────────────────
  'collection.dependency.graph':      'Dependency Graph',
  'collection.sdk.generate':          'SDK Generator',
  'collection.compliance':            'Compliance Check',
  'collection.generate':              'Build Collection',
  'collection.scenario.generate':     'Scenario Generator',
  'collection.optimize':              'Request Optimizer',

  // ── Test & agent tools ─────────────────────────────────────────────────────
  'test.variations.generate':         'Test Variations',
  'test.variations.analyze':          'Analyze Variations',
  'data.generate':                    'Data Generator',
  'agent.learn.analyze':              'Agent Learning',

  // ── Mock server AI generators ──────────────────────────────────────────────
  'mock.rest.generate':               'REST Mock',
  'mock.graphql.generate':            'GQL Mock',
  'mock.websocket.generate':          'WS Mock',
  'mock.sse.generate':                'SSE Mock',
  'mock.socketio.generate':           'SIO Mock',
  'mock.grpc.generate':               'gRPC Mock',
  'mock.soap.generate':               'SOAP Mock',
  'mock.mqtt.generate':               'MQTT Mock',
};

// ─── Stage color by category ──────────────────────────────────────────────────
function stageColor(stage: string): string {
  if (stage === 'DAAKIA_AI')                  return 'var(--color-protocol-ai)';
  if (stage.startsWith('mock.'))              return 'var(--color-mock-server)';
  if (stage.startsWith('rest.'))              return 'var(--color-protocol-ai)';
  if (stage.startsWith('collection.'))        return 'var(--color-primary)';
  if (stage.startsWith('import.'))            return 'var(--color-info)';
  if (stage.startsWith('test.'))              return 'var(--color-success)';
  if (stage.startsWith('data.'))              return '#a78bfa';
  if (stage.startsWith('agent.'))             return 'var(--color-warning)';
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

// ─── Payload block with draggable-resize Monaco ──────────────────────────────
// Drag the bottom handle to resize. Min 80px, max 600px.

const DEFAULT_PAYLOAD_HEIGHT = 120;
const MIN_PAYLOAD_HEIGHT = 80;
const MAX_PAYLOAD_HEIGHT = 600;

function PayloadBlock({ label, value, color, lang = 'plaintext' }: {
  label: string;
  value: string | null | undefined;
  color: string;
  lang?: string;
}) {
  const [height, setHeight] = useState(DEFAULT_PAYLOAD_HEIGHT);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const diff = e.clientY - startY.current;
      setHeight(Math.max(MIN_PAYLOAD_HEIGHT, Math.min(MAX_PAYLOAD_HEIGHT, startH.current + diff)));
    };
    const onMouseUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const handleDragStart = (e: React.MouseEvent) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startH.current = height;
    e.preventDefault();
  };

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
      <div className="rounded-lg overflow-hidden border relative" style={{ borderColor: `color-mix(in srgb, ${color} 15%, transparent)` }}>
        <CodeEditor
          value={display.slice(0, 6000)}
          language={language}
          readOnly
          height={`${height}px`}
        />
        {/* Drag handle — same pattern as mock server resize */}
        <div
          onMouseDown={handleDragStart}
          className="absolute bottom-0 left-0 right-0 h-[7px] flex items-center justify-center select-none z-10"
          style={{
            cursor: 'ns-resize',
            backgroundColor: `color-mix(in srgb, ${color} 8%, var(--color-surface))`,
            borderTop: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
          }}
          title="Drag to resize"
        >
          {/* Grip dots */}
          <div className="flex gap-[3px]">
            {[0, 1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="w-[3px] h-[3px] rounded-full"
                style={{ backgroundColor: `color-mix(in srgb, ${color} 50%, transparent)` }}
              />
            ))}
          </div>
        </div>
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
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter by stage, model, prompt…"
          prefix={<SearchIcon size={11} />}
          suffix={
            search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="w-5 h-5 flex items-center justify-center rounded cursor-pointer hover:text-[var(--color-text-primary)] transition-colors"
                title="Clear filter"
              >
                <CloseIcon size={10} />
              </button>
            ) : (
              <span
                className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded"
                style={{ color: 'var(--color-text-muted)', backgroundColor: 'rgba(255,255,255,0.04)' }}
              >
                {filtered.length}
              </span>
            )
          }
        />
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
