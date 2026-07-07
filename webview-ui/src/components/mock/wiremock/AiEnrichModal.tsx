/**
 * AiEnrichModal — AI Enrich Captured Traffic ✦
 *
 * Generates N route variations from a captured interaction.
 * Tabs: Routes (editable/deletable) · State Machine · Sequences
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ModalView,
  AIButtonView,
  ButtonView,
  IconButtonView,
  TextInputView,
  MultilineInputView,
  TabView,
  type TabItem,
} from '@salilvnair/dui';
import { useTabsStore } from '../../../store/tabs-store';
import { useAiProvidersStore } from '../../../store/ai-providers-store';
import { useAiPromptTemplatesStore } from '../../../store/prompt-template';
import { SparkleIcon, PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon } from '../../../icons';
import { postMsg } from '../../../vscode';
import type {
  RecordedRequest,
  MockRoute,
  StateMachineConfig,
  StateNode,
  StateTransition,
  ResponseSequenceItem,
} from '../mock-types';

const ACCENT = 'var(--color-mock-server)';
const SM_AMBER = 'var(--color-sm-tab, #f59e0b)';
const SEQ_BLUE = 'var(--color-info)';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeneratedStub {
  request: {
    method: string;
    urlPattern?: string;
    urlPathPattern?: string;
    bodyPatterns?: Array<{ contains: string }>;
  };
  response: {
    status: number;
    headers?: Record<string, string>;
    body?: string;
    jsonBody?: unknown;
  };
  variant?: string;
}

interface Props {
  record: RecordedRequest;
  onClose: () => void;
  onAddRoutes: (routes: MockRoute[]) => void;
  onApplyStateMachine?: (sm: StateMachineConfig) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferEntityName(record: RecordedRequest): string {
  if (record.body) {
    try {
      const parsed = JSON.parse(record.body);
      const keys = ['name', 'customerName', 'companyName', 'organization', 'entity', 'client'];
      for (const k of keys) {
        if (typeof parsed[k] === 'string' && parsed[k].trim()) return parsed[k].trim();
      }
      const first = Object.values(parsed).find(v => typeof v === 'string' && (v as string).trim().length > 2);
      if (first) return (first as string).trim();
    } catch { /* not JSON */ }
  }
  return '';
}

function buildAlternatives(entityName: string): string {
  const retail = ['Walmart', 'Target', 'Costco', 'Amazon'];
  if (retail.some(n => n.toLowerCase() === entityName.toLowerCase())) {
    return retail.filter(n => n.toLowerCase() !== entityName.toLowerCase()).join(', ');
  }
  return 'Variant A, Variant B, Variant C';
}

function stubBody(stub: GeneratedStub): string {
  return stub.response.jsonBody
    ? JSON.stringify(stub.response.jsonBody, null, 2)
    : (stub.response.body ?? '');
}

function stubToRoute(stub: GeneratedStub, record: RecordedRequest): MockRoute {
  return {
    id: crypto.randomUUID(),
    method: (stub.request.method as MockRoute['method']) ?? 'POST',
    path: stub.request.urlPattern ?? stub.request.urlPathPattern ?? record.path,
    statusCode: stub.response.status ?? 200,
    body: stubBody(stub),
    headers: stub.response.headers ?? { 'Content-Type': 'application/json' },
    enabled: true,
    priority: 10,
    delay: 0,
  };
}

function buildStateMachine(stubs: GeneratedStub[], record: RecordedRequest): StateMachineConfig {
  const states: StateNode[] = stubs.map((stub, i) => ({
    id: `enrich_state_${i}`,
    name: stub.variant ?? `State ${i + 1}`,
    x: 80 + (i % 3) * 220,
    y: 80 + Math.floor(i / 3) * 160,
    isInitial: i === 0,
    mockResponses: [{
      method: (stub.request.method as StateNode['mockResponses'][0]['method']) ?? 'POST',
      path: stub.request.urlPattern ?? stub.request.urlPathPattern ?? record.path,
      status: stub.response.status ?? 200,
      body: stubBody(stub),
    }],
  }));

  const transitions: StateTransition[] = stubs.map((_, i) => ({
    id: `enrich_trans_${i}`,
    from: `enrich_state_${i}`,
    to: `enrich_state_${(i + 1) % stubs.length}`,
    routeId: record.path,
    label: `→ ${stubs[(i + 1) % stubs.length]?.variant ?? `State ${(i + 1) % stubs.length + 1}`}`,
  }));

  return {
    enabled: true,
    states,
    transitions,
    sessionMode: 'cookie',
    sessionKey: 'enrich-session',
    defaultState: 'enrich_state_0',
  };
}

function buildSequenceRoute(stubs: GeneratedStub[], record: RecordedRequest): MockRoute {
  const responses: ResponseSequenceItem[] = stubs.map(stub => ({
    id: crypto.randomUUID(),
    statusCode: stub.response.status ?? 200,
    headers: stub.response.headers ?? { 'Content-Type': 'application/json' },
    body: stubBody(stub),
  }));

  return {
    id: crypto.randomUUID(),
    method: record.method as MockRoute['method'],
    path: record.path,
    statusCode: stubs[0]?.response.status ?? 200,
    body: stubBody(stubs[0]),
    headers: stubs[0]?.response.headers ?? { 'Content-Type': 'application/json' },
    enabled: true,
    priority: 10,
    delay: 0,
    sequenceMode: 'sequential',
    responses,
  };
}

// ─── Stub row with inline edit/delete ─────────────────────────────────────────

function StubRow({
  stub,
  index,
  record,
  onEdit,
  onDelete,
  onAdd,
}: {
  stub: GeneratedStub;
  index: number;
  record: RecordedRequest;
  onEdit: (idx: number, raw: string) => void;
  onDelete: (idx: number) => void;
  onAdd: (stub: GeneratedStub) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editRaw, setEditRaw] = useState('');
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState('');

  const startEdit = () => {
    setEditRaw(JSON.stringify(stub, null, 2));
    setEditing(true);
    setExpanded(true);
    setEditError('');
  };

  const applyEdit = () => {
    try {
      JSON.parse(editRaw);
      onEdit(index, editRaw);
      setEditing(false);
      setEditError('');
    } catch {
      setEditError('Invalid JSON — fix before applying');
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditError('');
  };

  const path = stub.request.urlPattern ?? stub.request.urlPathPattern ?? record.path;
  const status = stub.response.status ?? 200;

  return (
    <div className="rounded-lg border flex flex-col" style={{ borderColor: 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)', background: 'color-mix(in srgb, var(--color-text-primary) 2%, transparent)' }}>
      {/* Header row */}
      <div className="flex items-center gap-1.5 p-2">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex-shrink-0 flex items-center justify-center w-4 h-4 rounded"
          style={{ color: 'var(--color-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          {expanded
            ? <ChevronDownIcon size={10} />
            : <ChevronRightIcon size={10} />}
        </button>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono flex-shrink-0"
          style={{ background: `color-mix(in srgb, ${ACCENT} 18%, transparent)`, color: ACCENT }}>
          {stub.request.method}
        </span>
        <code className="text-[10px] text-[var(--color-text-primary)] truncate flex-1">{path}</code>
        {stub.variant && (
          <span className="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0"
            style={{ background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`, color: ACCENT }}>
            {stub.variant}
          </span>
        )}
        <span className="text-[10px] font-mono flex-shrink-0"
          style={{ color: status < 400 ? 'var(--color-success)' : 'var(--color-error)' }}>
          {status}
        </span>
        <IconButtonView
          size="sm"
          icon={<span className="text-[9px]">✎</span>}
          title="Edit stub JSON"
          accentColor={ACCENT}
          onClick={startEdit}
        />
        <IconButtonView
          size="sm"
          icon={<TrashIcon size={9} />}
          title="Delete this route"
          accentColor="var(--color-error)"
          onClick={() => onDelete(index)}
        />
        <ButtonView
          size="sm"
          variant="ghost"
          accentColor={ACCENT}
          iconLeft={<PlusIcon size={9} />}
          onClick={() => onAdd(stub)}
        >
          Add
        </ButtonView>
      </div>

      {/* Expandable body */}
      {expanded && (
        <div className="px-2 pb-2 flex flex-col gap-1.5 border-t" style={{ borderColor: 'color-mix(in srgb, var(--color-text-primary) 6%, transparent)' }}>
          {editing ? (
            <>
              <MultilineInputView
                value={editRaw}
                onChange={e => setEditRaw(e.target.value)}
                rows={10}
                size="sm"
                width="fw"
                accentColor={ACCENT}
                style={{ fontFamily: 'monospace', fontSize: 10 }}
              />
              {editError && (
                <p className="text-[10px]" style={{ color: 'var(--color-error)' }}>{editError}</p>
              )}
              <div className="flex gap-1.5">
                <ButtonView size="sm" variant="ghost" accentColor={ACCENT} onClick={applyEdit}>Apply</ButtonView>
                <ButtonView size="sm" variant="ghost" accentColor="var(--color-text-muted)" onClick={cancelEdit}>Cancel</ButtonView>
              </div>
            </>
          ) : (
            <pre className="text-[10px] font-mono text-[var(--color-text-muted)] whitespace-pre-wrap break-all pt-1.5">
              {JSON.stringify(stub, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function AiEnrichModal({ record, onClose, onAddRoutes, onApplyStateMachine }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const defaultProviderId = useAiProvidersStore(s => s.defaultProviderId);
  const defaultModelId = useAiProvidersStore(s => s.defaultModelId);
  const providers = useAiProvidersStore(s => s.providers);
  const templates = useAiPromptTemplatesStore(s => s.templates);

  const [entityName, setEntityName] = useState(() => inferEntityName(record));
  const [alternatives, setAlternatives] = useState(() => buildAlternatives(inferEntityName(record)));
  const [count, setCount] = useState('4');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rawResult, setRawResult] = useState('');
  const [stubs, setStubs] = useState<GeneratedStub[] | null>(null);
  const [resultTab, setResultTab] = useState<'routes' | 'statemachine' | 'sequences'>('routes');
  const streamRef = useRef('');

  const cookies = Object.entries(record.headers ?? {})
    .filter(([k]) => k.toLowerCase() === 'cookie')
    .map(([, v]) => v)
    .join('; ');

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') {
        streamRef.current += msg.chunk;
        setRawResult(streamRef.current);
      } else if (msg?.type === 'aiStream:done') {
        setLoading(false);
        tryParseStubs(streamRef.current);
      } else if (msg?.type === 'aiStream:error') {
        setError(msg.error || 'AI request failed');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const tryParseStubs = (text: string) => {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return;
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) setStubs(parsed);
    } catch { /* incomplete stream */ }
  };

  const handleGenerate = useCallback(() => {
    if (!activeTab || loading) return;
    streamRef.current = '';
    setRawResult('');
    setError('');
    setStubs(null);
    setLoading(true);

    const provider = activeTab.aiProvider || defaultProviderId;
    const providerInfo = providers.find(p => p.id === provider);
    const model = activeTab.aiModel || defaultModelId || providerInfo?.models.find(m => m.enabled)?.id || '';

    const userPromptTemplate = templates['mock.traffic.enrich'] || '';
    const systemPrompt = templates['mock.traffic.enrich.system'] || '';
    const n = parseInt(count, 10) || 4;
    const altList = alternatives.trim() || buildAlternatives(entityName);

    const userPrompt = userPromptTemplate
      .replace(/{count}/g, String(n))
      .replace(/{entityName}/g, entityName || '(entity)')
      .replace(/{alternatives}/g, altList)
      .replace(/{method}/g, record.method)
      .replace(/{path}/g, record.path)
      .replace(/{requestHeaders}/g, JSON.stringify(record.headers ?? {}, null, 2))
      .replace(/{cookies}/g, cookies || '(none)')
      .replace(/{queryParams}/g, JSON.stringify(record.queryParams ?? {}, null, 2))
      .replace(/{requestBody}/g, record.body ?? '(empty)')
      .replace(/{responseStatus}/g, String(record.response.status))
      .replace(/{responseHeaders}/g, JSON.stringify(record.response.headers ?? {}, null, 2))
      .replace(/{responseBody}/g, record.response.body ?? '(empty)');

    postMsg({
      type: 'ai:send',
      tabId: activeTab?.id,
      provider,
      model,
      baseUrl: '',
      systemPrompts: systemPrompt ? [systemPrompt] : [],
      userPrompt,
      conversation: [],
      tools: [],
      settings: {},
      mcpServerConfigs: [],
      images: [],
      envId: activeTab?.envId,
    });
  }, [activeTab, loading, defaultProviderId, defaultModelId, providers, templates, entityName, alternatives, count, record, cookies]);

  // Stub mutation helpers
  const handleEdit = useCallback((idx: number, raw: string) => {
    setStubs(prev => {
      if (!prev) return prev;
      const next = [...prev];
      try { next[idx] = JSON.parse(raw); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const handleDelete = useCallback((idx: number) => {
    setStubs(prev => prev ? prev.filter((_, i) => i !== idx) : prev);
  }, []);

  const handleAddOne = useCallback((stub: GeneratedStub) => {
    onAddRoutes([stubToRoute(stub, record)]);
  }, [onAddRoutes, record]);

  const handleAddAll = useCallback(() => {
    if (!stubs) return;
    onAddRoutes(stubs.map(s => stubToRoute(s, record)));
    onClose();
  }, [stubs, onAddRoutes, onClose, record]);

  const handleAddSequence = useCallback(() => {
    if (!stubs) return;
    onAddRoutes([buildSequenceRoute(stubs, record)]);
    onClose();
  }, [stubs, onAddRoutes, onClose, record]);

  const handleApplySM = useCallback(() => {
    if (!stubs || !onApplyStateMachine) return;
    onApplyStateMachine(buildStateMachine(stubs, record));
    onClose();
  }, [stubs, onApplyStateMachine, onClose, record]);

  const requestSummary = `${record.method} ${record.path}` +
    (Object.keys(record.queryParams ?? {}).length > 0
      ? `?${new URLSearchParams(record.queryParams).toString()}`
      : '');

  const bodyPreview = record.body
    ? record.body.slice(0, 180) + (record.body.length > 180 ? '…' : '')
    : '';

  const resultTabs: TabItem[] = [
    { id: 'routes', label: `Routes${stubs ? ` (${stubs.length})` : ''}` },
    { id: 'statemachine', label: 'State Machine' },
    { id: 'sequences', label: 'Sequences' },
  ];

  const smConfig = stubs ? buildStateMachine(stubs, record) : null;
  const smJson = smConfig ? JSON.stringify(smConfig, null, 2) : '';

  return (
    <ModalView
      open
      onClose={onClose}
      title="AI Enrich Captured Traffic ✦"
      subtitle={requestSummary}
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={
        stubs && stubs.length > 0 ? (
          <div className="flex items-center gap-2">
            {resultTab === 'routes' && (
              <ButtonView size="md" variant="ghost" accentColor={ACCENT} iconLeft={<PlusIcon size={11} />} onClick={handleAddAll}>
                Add All {stubs.length} Routes
              </ButtonView>
            )}
            {resultTab === 'sequences' && (
              <ButtonView size="md" variant="ghost" accentColor={SEQ_BLUE} iconLeft={<PlusIcon size={11} />} onClick={handleAddSequence}>
                Add as Sequence Route
              </ButtonView>
            )}
            {resultTab === 'statemachine' && onApplyStateMachine && (
              <ButtonView size="md" variant="ghost" accentColor={SM_AMBER} iconLeft={<PlusIcon size={11} />} onClick={handleApplySM}>
                Apply State Machine
              </ButtonView>
            )}
          </div>
        ) : undefined
      }
      footerRight={
        <AIButtonView
          label={loading ? 'Enriching…' : 'Generate Variations ✦'}
          size="md"
          accentColor={ACCENT}
          disabled={!entityName.trim() || !alternatives.trim() || loading}
          loading={loading}
          onClick={handleGenerate}
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Captured request summary */}
        <div className="rounded-lg border p-3 flex flex-col gap-1.5" style={{ borderColor: `color-mix(in srgb, ${ACCENT} 25%, transparent)`, background: `color-mix(in srgb, ${ACCENT} 5%, transparent)` }}>
          <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: ACCENT }}>Captured Request</p>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono" style={{ background: `color-mix(in srgb, ${ACCENT} 20%, transparent)`, color: ACCENT }}>{record.method}</span>
            <code className="text-[11px] text-[var(--color-text-primary)]">{record.path}</code>
            <span className="ml-auto text-[10px] font-mono" style={{ color: record.response.status < 400 ? 'var(--color-success)' : 'var(--color-error)' }}>{record.response.status}</span>
          </div>
          {bodyPreview && (
            <code className="text-[10px] text-[var(--color-text-muted)] opacity-60 break-all line-clamp-2">{bodyPreview}</code>
          )}
        </div>

        {/* Inputs row */}
        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Entity Name</label>
            <TextInputView value={entityName} onChange={e => setEntityName(e.target.value)} placeholder="e.g. Walmart" size="md" width="fw" accentColor={ACCENT} />
          </div>
          <div className="flex flex-col gap-1 w-[60px]">
            <label className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Count</label>
            <TextInputView value={count} onChange={e => setCount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="4" size="md" accentColor={ACCENT} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Alternatives (comma-separated)</label>
          <TextInputView value={alternatives} onChange={e => setAlternatives(e.target.value)} placeholder="Target, Costco, Amazon, Best Buy" size="md" width="fw" accentColor={ACCENT} />
        </div>

        {/* Error */}
        {error && (
          <p className="text-[11px] px-3 py-2 rounded-lg" style={{ color: 'var(--color-error)', background: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>
        )}

        {/* Loading state */}
        {loading && !rawResult && (
          <p className="text-[11px] animate-pulse text-center py-6" style={{ color: ACCENT }}>Generating route variations…</p>
        )}

        {/* Results */}
        {stubs && stubs.length > 0 ? (
          <div className="flex flex-col gap-2">
            <TabView
              tabs={resultTabs}
              activeTab={resultTab}
              onChange={id => setResultTab(id as typeof resultTab)}
              variant="underline"
              size="xs"
              accentColor={ACCENT}
            />

            {/* Routes tab */}
            {resultTab === 'routes' && (
              <div className="flex flex-col gap-1.5">
                {stubs.map((stub, i) => (
                  <StubRow
                    key={i}
                    stub={stub}
                    index={i}
                    record={record}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onAdd={handleAddOne}
                  />
                ))}
              </div>
            )}

            {/* State Machine tab */}
            {resultTab === 'statemachine' && (
              <div className="flex flex-col gap-2">
                <div className="rounded-lg border p-3 flex flex-col gap-1.5" style={{ borderColor: `color-mix(in srgb, ${SM_AMBER} 20%, transparent)`, background: `color-mix(in srgb, ${SM_AMBER} 4%, transparent)` }}>
                  <p className="text-[10px] font-medium" style={{ color: SM_AMBER }}>
                    State Machine — {stubs.length} states, round-robin transitions
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    Each entity variant becomes a state. Requests cycle through states sequentially. Session tracked via cookie.
                  </p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {stubs.map((s, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ border: `1px solid ${SM_AMBER}`, color: SM_AMBER, background: `color-mix(in srgb, ${SM_AMBER} 8%, transparent)` }}>
                        {s.variant ?? `State ${i + 1}`}
                      </span>
                    ))}
                    <span className="text-[9px] px-1.5 py-0.5 rounded text-[var(--color-text-muted)]">→ loops back</span>
                  </div>
                </div>
                <pre className="text-[10px] font-mono text-[var(--color-text-muted)] whitespace-pre-wrap break-all overflow-auto max-h-[260px] p-2 rounded-lg"
                  style={{ background: 'color-mix(in srgb, var(--color-text-primary) 3%, transparent)', border: '1px solid color-mix(in srgb, var(--color-text-primary) 7%, transparent)' }}>
                  {smJson}
                </pre>
              </div>
            )}

            {/* Sequences tab */}
            {resultTab === 'sequences' && (
              <div className="flex flex-col gap-2">
                <div className="rounded-lg border p-3 flex flex-col gap-1.5" style={{ borderColor: `color-mix(in srgb, ${SEQ_BLUE} 20%, transparent)`, background: `color-mix(in srgb, ${SEQ_BLUE} 4%, transparent)` }}>
                  <p className="text-[10px] font-medium" style={{ color: SEQ_BLUE }}>
                    Sequence Route — {stubs.length} responses, sequential rotation
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    One route at <code>{record.path}</code> rotates through all variants in order — each call returns the next response in the sequence.
                  </p>
                </div>
                {stubs.map((stub, i) => (
                  <div key={i} className="rounded-lg border p-2.5 flex items-center gap-2"
                    style={{ borderColor: 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)', background: 'color-mix(in srgb, var(--color-text-primary) 2%, transparent)' }}>
                    <span className="text-[10px] font-bold tabular-nums w-5 flex-shrink-0 text-[var(--color-text-muted)]">#{i + 1}</span>
                    {stub.variant && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ border: `1px solid ${SEQ_BLUE}`, color: SEQ_BLUE, background: `color-mix(in srgb, ${SEQ_BLUE} 8%, transparent)` }}>
                        {stub.variant}
                      </span>
                    )}
                    <span className="text-[10px] font-mono flex-shrink-0"
                      style={{ color: (stub.response.status ?? 200) < 400 ? 'var(--color-success)' : 'var(--color-error)' }}>
                      {stub.response.status ?? 200}
                    </span>
                    <code className="text-[10px] text-[var(--color-text-muted)] truncate flex-1">
                      {stubBody(stub).slice(0, 80)}{stubBody(stub).length > 80 ? '…' : ''}
                    </code>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : !loading && !error ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <SparkleIcon size={22} style={{ color: ACCENT, opacity: 0.35 }} />
            <p className="text-[11px] text-center text-[var(--color-text-muted)]">
              Enter the entity name and alternatives above, then click <strong>Generate Variations ✦</strong>
            </p>
          </div>
        ) : null}
      </div>
    </ModalView>
  );
}
