/**
 * AuditLogTab — 7.3 Developer Tools: Audit Log
 * Unified log: AI calls (ce_audit) + UI events (ui_audit).
 * Protocol-correct color coding per module + Module badge column.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { postMsg } from '../../../vscode';
import { CodeEditor } from '../../shared';
import { TrashIcon, RefreshIcon, SearchIcon, CloseIcon, ChevronDownIcon } from '../../../icons';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CeAuditEntry {
  kind: 'ai';
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

interface UiAuditEntry {
  kind: 'ui';
  audit_id: number;
  event_type: string;
  module: string;
  button?: string;
  action?: string;
  metadata?: string;
  created_at: string;
}

type AnyAuditEntry = CeAuditEntry | UiAuditEntry;

// ─── Module info ──────────────────────────────────────────────────────────────

interface ModuleInfo { label: string; color: string; }

const MODULE_MAP: Record<string, ModuleInfo> = {
  'REST':        { label: 'REST',        color: 'var(--color-protocol-rest)' },
  'GraphQL':     { label: 'GraphQL',     color: 'var(--color-protocol-graphql)' },
  'gRPC':        { label: 'gRPC',        color: 'var(--color-protocol-grpc)' },
  'SOAP':        { label: 'SOAP',        color: 'var(--color-protocol-soap)' },
  'WebSocket':   { label: 'WebSocket',   color: 'var(--color-protocol-websocket)' },
  'SSE':         { label: 'SSE',         color: 'var(--color-protocol-sse)' },
  'MQTT':        { label: 'MQTT',        color: 'var(--color-protocol-mqtt)' },
  'Socket.IO':   { label: 'Socket.IO',   color: 'var(--color-protocol-socketio)' },
  'MCP':         { label: 'MCP',         color: 'var(--color-protocol-mcp)' },
  'Mock Server': { label: 'Mock Server', color: 'var(--color-mock-server)' },
  'Collections': { label: 'Collections', color: 'var(--color-primary)' },
  'History':     { label: 'History',     color: 'var(--color-info)' },
  'AI Chat':     { label: 'AI Chat',     color: 'var(--color-protocol-ai)' },
  'Tools':       { label: 'Tools',       color: '#a78bfa' },
  'Testing':     { label: 'Testing',     color: 'var(--color-success)' },
  'Import':      { label: 'Import',      color: 'var(--color-info)' },
  'Settings':    { label: 'Settings',    color: 'var(--color-text-muted)' },
};

function moduleFromStage(stage: string): ModuleInfo {
  if (stage === 'DAAKIA_AI')                             return MODULE_MAP['AI Chat']!;
  if (stage.startsWith('rest.'))                         return MODULE_MAP['REST']!;
  if (stage.startsWith('mock.'))                         return MODULE_MAP['Mock Server']!;
  if (stage.startsWith('gql.') || stage.startsWith('graphql.')) return MODULE_MAP['GraphQL']!;
  if (stage.startsWith('grpc.'))                         return MODULE_MAP['gRPC']!;
  if (stage.startsWith('soap.'))                         return MODULE_MAP['SOAP']!;
  if (stage.startsWith('ws.'))                           return MODULE_MAP['WebSocket']!;
  if (stage.startsWith('sse.'))                          return MODULE_MAP['SSE']!;
  if (stage.startsWith('mqtt.'))                         return MODULE_MAP['MQTT']!;
  if (stage.startsWith('sio.'))                          return MODULE_MAP['Socket.IO']!;
  if (stage.startsWith('mcp.'))                          return MODULE_MAP['MCP']!;
  if (stage.startsWith('collection.'))                   return MODULE_MAP['Collections']!;
  if (stage.startsWith('import.'))                       return MODULE_MAP['Import']!;
  if (stage.startsWith('test.'))                         return MODULE_MAP['Testing']!;
  if (stage.startsWith('data.') || stage.startsWith('agent.')) return MODULE_MAP['Tools']!;
  return { label: 'System', color: 'var(--color-text-muted)' };
}

// ─── Stage label map ──────────────────────────────────────────────────────────

const STAGE_LABEL: Record<string, string> = {
  'DAAKIA_AI':                        'AI Chat',
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
  'rest.body.generate':               'Generate Body',
  'rest.headers.suggest.generate':    'Header Suggest',
  'rest.request.name':                'Name Request',
  'rest.env.extract':                 'Extract Variables',
  'rest.api.flow':                    'API Flow Builder',
  'rest.collection.organize':         'Organize Collection',
  'rest.collection.search':           'Smart Search',
  'rest.curl.explain':                'Explain cURL',
  'rest.code.import':                 'Import Code',
  'import.logs':                      'From Logs',
  'import.voice':                     'Voice to Request',
  'import.openapi.enrich':            'OpenAPI Enrich',
  'import.screenshot':                'From Screenshot',
  'collection.dependency.graph':      'Dependency Graph',
  'collection.sdk.generate':          'SDK Generator',
  'collection.compliance':            'Compliance Check',
  'collection.generate':              'Build Collection',
  'collection.scenario.generate':     'Scenario Generator',
  'collection.optimize':              'Request Optimizer',
  'test.variations.generate':         'Test Variations',
  'test.variations.analyze':          'Analyze Variations',
  'data.generate':                    'Data Generator',
  'agent.learn.analyze':              'Agent Learning',
  'mock.rest.generate':               'REST Mock',
  'mock.graphql.generate':            'GQL Mock',
  'mock.websocket.generate':          'WS Mock',
  'mock.sse.generate':                'SSE Mock',
  'mock.socketio.generate':           'SIO Mock',
  'mock.grpc.generate':               'gRPC Mock',
  'mock.soap.generate':               'SOAP Mock',
  'mock.mqtt.generate':               'MQTT Mock',
};

// ─── Badges ───────────────────────────────────────────────────────────────────

function ModuleBadge({ label, color }: ModuleInfo) {
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0 whitespace-nowrap"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 18%, transparent)` }}
    >
      {label}
    </span>
  );
}

function StageBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0 whitespace-nowrap"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 20%, transparent)` }}
    >
      {label}
    </span>
  );
}

// ─── Payload block with draggable Monaco ─────────────────────────────────────

const DEFAULT_PAYLOAD_HEIGHT = 120;
const MIN_PAYLOAD_HEIGHT = 80;
const MAX_PAYLOAD_HEIGHT = 600;

function PayloadBlock({ label, value, color, lang = 'plaintext' }: {
  label: string; value: string | null | undefined; color: string; lang?: string;
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
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, []);

  const handleDragStart = (e: React.MouseEvent) => {
    isDragging.current = true; startY.current = e.clientY; startH.current = height; e.preventDefault();
  };

  if (!value) return null;
  const trimmed = value.trim();
  const isJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  const language = isJson ? 'json' : lang;
  let display = value;
  if (isJson) { try { display = JSON.stringify(JSON.parse(trimmed), null, 2); } catch { /* raw */ } }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded self-start"
        style={{ color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}>
        {label}
      </span>
      <div className="rounded-lg overflow-hidden border relative" style={{ borderColor: `color-mix(in srgb, ${color} 15%, transparent)` }}>
        <CodeEditor value={display.slice(0, 6000)} language={language} readOnly height={`${height}px`} />
        <div onMouseDown={handleDragStart}
          className="absolute bottom-0 left-0 right-0 h-[7px] flex items-center justify-center select-none z-10"
          style={{ cursor: 'ns-resize', backgroundColor: `color-mix(in srgb, ${color} 8%, var(--color-surface))`, borderTop: `1px solid color-mix(in srgb, ${color} 20%, transparent)` }}
          title="Drag to resize">
          <div className="flex gap-[3px]">
            {[0,1,2,3,4].map(i => <div key={i} className="w-[3px] h-[3px] rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 50%, transparent)` }} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AuditLogTab() {
  const [aiEntries, setAiEntries] = useState<Omit<CeAuditEntry, 'kind'>[]>([]);
  const [uiEntries, setUiEntries] = useState<Omit<UiAuditEntry, 'kind'>[]>([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null); // 'ai-123' or 'ui-456'

  const load = useCallback(() => {
    postMsg({ type: 'aiAudit:load', limit: 500 });
    postMsg({ type: 'uiAudit:load', limit: 500 });
  }, []);

  useEffect(() => {
    load();
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'aiAudit:data') setAiEntries(e.data.entries ?? []);
      if (e.data?.type === 'uiAudit:data') setUiEntries(e.data.entries ?? []);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [load]);

  const handleClear = () => {
    postMsg({ type: 'aiAudit:clear' });
    postMsg({ type: 'uiAudit:clear' });
    setAiEntries([]); setUiEntries([]); setExpanded(null);
  };

  const allEntries: AnyAuditEntry[] = [
    ...aiEntries.map(e => ({ ...e, kind: 'ai' as const })),
    ...uiEntries.map(e => ({ ...e, kind: 'ui' as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const filtered = allEntries.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    if (e.kind === 'ai') {
      return e.stage.toLowerCase().includes(q) || (e.model ?? '').toLowerCase().includes(q) || (e.user_prompt ?? '').toLowerCase().includes(q);
    }
    return e.event_type.toLowerCase().includes(q) || e.module.toLowerCase().includes(q) || (e.button ?? '').toLowerCase().includes(q);
  });

  const rowKey = (e: AnyAuditEntry) => e.kind === 'ai' ? `ai-${e.audit_id}` : `ui-${e.audit_id}`;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ─── Toolbar ─── */}
      <div className="flex items-center border-b shrink-0"
        style={{ height: 28, borderColor: 'var(--color-surface-border)', backgroundColor: 'rgba(255,255,255,0.025)' }}>
        <div className="flex items-center gap-1.5 flex-1 h-full px-2.5 border-r" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <SearchIcon size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filter by module, stage, event…"
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[11px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} title="Clear filter"
              className="w-4 h-4 flex items-center justify-center rounded cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
              <CloseIcon size={9} />
            </button>
          ) : (
            <span className="text-[10px] font-mono tabular-nums px-1 rounded shrink-0 leading-none"
              style={{ color: 'var(--color-text-muted)', backgroundColor: 'rgba(255,255,255,0.05)' }}>
              {filtered.length}
            </span>
          )}
        </div>
        <div className="flex items-center px-1 shrink-0">
          <button type="button" onClick={load} title="Refresh"
            className="w-6 h-6 flex items-center justify-center rounded cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)] transition-colors">
            <RefreshIcon size={12} />
          </button>
          <button type="button" onClick={handleClear} title="Clear all"
            className="w-6 h-6 flex items-center justify-center rounded cursor-pointer text-[var(--color-text-muted)] hover:text-[#ef4444] hover:bg-[rgba(239,68,68,0.08)] transition-colors">
            <TrashIcon size={12} />
          </button>
        </div>
      </div>

      {/* ─── Table ─── */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[11px] text-[var(--color-text-muted)]">
            {allEntries.length === 0 ? 'No audit entries yet — AI calls and UI actions appear here' : 'No matches'}
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10 bg-[var(--color-surface)]">
              <tr className="border-b border-[rgba(255,255,255,0.06)]">
                <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)] w-[32px]">#</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)] w-[90px]">Module</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)]">Stage / Event</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)] w-[90px]">Model / Button</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)]">Preview</th>
                <th className="text-right px-2 py-2 font-medium text-[var(--color-text-muted)] w-[68px]">Duration</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)] w-[120px]">Time</th>
                <th className="w-[24px]" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const key = rowKey(e);
                const isOpen = expanded === key;
                const modInfo: ModuleInfo = e.kind === 'ai'
                  ? moduleFromStage(e.stage)
                  : (MODULE_MAP[e.module] ?? { label: e.module, color: 'var(--color-text-muted)' });
                const color = modInfo.color;

                const stageLabel = e.kind === 'ai'
                  ? (STAGE_LABEL[e.stage] ?? e.stage.split('.').pop() ?? e.stage)
                  : (e.button ? `${e.button}` : e.event_type.split('.').pop() ?? e.event_type);

                const modelOrButton = e.kind === 'ai' ? (e.model ?? '—') : (e.action ?? '—');
                const previewText = e.kind === 'ai'
                  ? (e.error ? `⚠ ${e.error}` : (e.user_prompt ?? '').slice(0, 80) || '—')
                  : (e.event_type);

                return (
                  <>
                    <tr key={key}
                      onClick={() => setExpanded(isOpen ? null : key)}
                      className="border-b border-[rgba(255,255,255,0.025)] cursor-pointer transition-colors"
                      style={{ background: isOpen ? `color-mix(in srgb, ${color} 5%, transparent)` : undefined }}
                      onMouseEnter={ev => { if (!isOpen) (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
                      onMouseLeave={ev => { if (!isOpen) (ev.currentTarget as HTMLElement).style.background = ''; }}
                    >
                      <td className="px-3 py-2 text-[var(--color-text-muted)] font-mono text-[10px]">{e.audit_id}</td>
                      <td className="px-2 py-2">
                        <ModuleBadge label={modInfo.label} color={color} />
                      </td>
                      <td className="px-2 py-2">
                        <StageBadge label={stageLabel} color={color} />
                      </td>
                      <td className="px-2 py-2 text-[var(--color-text-muted)] truncate text-[10.5px]">{modelOrButton}</td>
                      <td className="px-2 py-2 text-[10.5px] truncate max-w-[180px]">
                        {e.kind === 'ai' && e.error
                          ? <span className="text-[#ef4444]">{previewText}</span>
                          : <span className="text-[var(--color-text-primary)]">{previewText}</span>
                        }
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-[10px]" style={{ color: e.kind === 'ai' && e.duration_ms != null ? color : 'var(--color-text-muted)' }}>
                        {e.kind === 'ai' && e.duration_ms != null ? `${e.duration_ms}ms` : '—'}
                      </td>
                      <td className="px-2 py-2 text-[var(--color-text-muted)] font-mono text-[10px]">
                        {e.created_at.replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="px-2 py-2">
                        <ChevronDownIcon size={11} style={{ color, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                      </td>
                    </tr>

                    {isOpen && (
                      <tr key={`${key}-detail`}>
                        <td colSpan={8} className="px-4 pb-4 pt-2" style={{ background: `color-mix(in srgb, ${color} 4%, var(--color-surface))` }}>
                          {e.kind === 'ai' ? (
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-2 text-[10.5px]">
                                <span className="text-[var(--color-text-muted)] shrink-0">Conversation ID</span>
                                <span className="font-mono px-2 py-0.5 rounded text-[10px]" style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
                                  {e.conversation_id}
                                </span>
                              </div>
                              {e.system_prompt && <PayloadBlock label="System Prompt" value={e.system_prompt} color="#818cf8" />}
                              {e.user_prompt && <PayloadBlock label="User Prompt" value={e.user_prompt} color="#06b6d4" />}
                              {e.response_payload && <PayloadBlock label="Response" value={e.response_payload} color="#10b981" />}
                              {e.error && (
                                <div className="flex flex-col gap-1">
                                  <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded self-start text-[#ef4444] bg-[rgba(239,68,68,0.1)]">Error</span>
                                  <p className="text-[10.5px] font-mono text-[#ef4444] px-1">{e.error}</p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-4 flex-wrap text-[10.5px]">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[var(--color-text-muted)]">Event</span>
                                  <span className="font-mono px-2 py-0.5 rounded text-[10px]" style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>{e.event_type}</span>
                                </div>
                                {e.button && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[var(--color-text-muted)]">Button</span>
                                    <span className="font-mono px-2 py-0.5 rounded text-[10px]" style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>{e.button}</span>
                                  </div>
                                )}
                                {e.action && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[var(--color-text-muted)]">Action</span>
                                    <span className="font-mono px-2 py-0.5 rounded text-[10px]" style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>{e.action}</span>
                                  </div>
                                )}
                              </div>
                              {e.metadata && <PayloadBlock label="Metadata" value={e.metadata} color={color} />}
                            </div>
                          )}
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
