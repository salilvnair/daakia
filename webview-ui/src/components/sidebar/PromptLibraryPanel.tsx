/**
 * PromptLibraryPanel — unified editor for ALL AI prompts.
 *
 * Sidebar: two collapsible sections (Agent Prompts / AI Actions) with resizable internal split.
 * Editor: Monaco + preview for both agents (System/User tabs) and AI template keys (single tab).
 * Split pane uses setPointerCapture — no accidental toggle on drag.
 *
 * E6.86 — merged AI Templates into Prompt Library (single source of truth).
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Editor from '@monaco-editor/react';
import type * as MonacoT from 'monaco-editor';
import { postMsg } from '../../vscode';
import { TrashIcon, ChevronRightIcon, SparkleIcon } from '../../icons';
import { ConfirmDialog } from '../shared';
import {
  AGENT_CATEGORIES, SCENARIO_LABELS, SCENARIO_DESCRIPTIONS, SCENARIO_COLORS,
  AGENT_SCENARIO_VARIABLES, getDefaultSystemPrompt, getDefaultUserPrompt,
  ALL_AGENT_SCENARIOS, type AgentScenario, type ScenarioVarMap,
} from '../../store/prompt-template';
import {
  useAiPromptTemplatesStore,
  AI_TEMPLATE_CATEGORIES, AI_TEMPLATE_COLORS, AI_PROMPT_TEMPLATE_LABELS,
  AI_PROMPT_TEMPLATE_DEFAULTS, AI_PROMPT_TEMPLATE_VARIABLES,
  type AiPromptTemplateKey,
} from '../../store/prompt-template';

const ACCENT = 'var(--color-protocol-ai)';
const PL_MIN_W = 190;
const PL_MAX_W = 400;
const PL_DEFAULT_W = 255;

// ─── System key resolver ──────────────────────────────────────────────────────
//
// Resolves the system-prompt counterpart for any mock user-prompt key.
//  'mock.rest.generate'           → 'mock.rest.system'           (has .generate)
//  'rest.headers.suggest.generate'→ 'rest.headers.suggest.system'(has .generate)
//  'askAiWhy'                     → 'askAiWhy.system'            (no .generate)
//  'explainWithAi'                → 'explainWithAi.system'
//  'followupWithAi'               → 'followupWithAi.system'

function toSystemKey(key: AiPromptTemplateKey): AiPromptTemplateKey {
  return (key.includes('.generate')
    ? key.replace('.generate', '.system')
    : `${key}.system`) as AiPromptTemplateKey;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveItem =
  | { kind: 'agent'; scenario: AgentScenario }
  | { kind: 'template'; key: AiPromptTemplateKey }
  | { kind: 'mock'; key: AiPromptTemplateKey }    // key = user-prompt key; system = toSystemKey(key)
  | null;
interface PromptRow { scenario: string; system_prompt: string; user_prompt?: string; agent_name?: string; updated_at?: string; }
interface AgentEntry { scenario: AgentScenario; systemPrompt: string; userPrompt: string; agentName: string; isCustomized: boolean; variables: ScenarioVarMap; updatedAt: string | null; }
interface VarPill { pill: string; insert: string; title: string; }

function buildEntry(s: AgentScenario, row?: PromptRow): AgentEntry {
  return {
    scenario: s, systemPrompt: row?.system_prompt ?? getDefaultSystemPrompt(s),
    userPrompt: row?.user_prompt ?? getDefaultUserPrompt(s),
    agentName: row?.agent_name ?? SCENARIO_LABELS[s],
    isCustomized: !!row?.updated_at, variables: AGENT_SCENARIO_VARIABLES[s], updatedAt: row?.updated_at ?? null,
  };
}

// ─── Monaco decoration helpers ────────────────────────────────────────────────

function ensureVarStyle() {
  if (document.getElementById('pl-var-style')) return;
  const s = document.createElement('style'); s.id = 'pl-var-style';
  s.textContent = `.monaco-editor .pl-var { background:rgba(139,92,246,.18); border-bottom:1.5px solid rgba(139,92,246,.55); border-radius:2px; color:#c084fc!important; font-weight:600; }`;
  document.head.appendChild(s);
}

function computeDecos(text: string, monaco: typeof MonacoT): MonacoT.editor.IModelDeltaDecoration[] {
  const decos: MonacoT.editor.IModelDeltaDecoration[] = [];
  const re = /\{\{[a-zA-Z_][a-zA-Z0-9_.]*\}\}|\{[a-zA-Z_][a-zA-Z0-9_.]*\}/g;
  text.split('\n').forEach((line, li) => {
    let m; re.lastIndex = 0;
    while ((m = re.exec(line)) !== null)
      decos.push({ range: new monaco.Range(li+1, m.index+1, li+1, m.index+m[0].length+1), options: { inlineClassName: 'pl-var' } });
  });
  return decos;
}

// ─── Prompt preview ({{var}} and {var} as pills) ──────────────────────────────

function PromptPreview({ text }: { text: string }) {
  if (!text) return <p className="text-[12px] text-[var(--color-text-muted)] italic">No prompt — switch to Edit to add one.</p>;
  return (
    <div className="text-[12px] font-mono leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap break-words">
      {text.split(/(\{\{[a-zA-Z_][a-zA-Z0-9_.]*\}\}|\{[a-zA-Z_][a-zA-Z0-9_.]*\})/g).map((part, i) => {
        if (/^(\{\{[a-zA-Z_][a-zA-Z0-9_.]*\}\}|\{[a-zA-Z_][a-zA-Z0-9_.]*\})$/.test(part))
          return <span key={i} className="inline-block rounded px-1 font-semibold" style={{ background:'rgba(139,92,246,.18)', color:'#c084fc', border:'1px solid rgba(139,92,246,.35)', lineHeight:'1.6' }}>{part}</span>;
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function PromptLibraryPanel() {
  // ── data ──
  const [dbRows, setDbRows] = useState<PromptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ActiveItem>(null);
  const [resetConfirm, setResetConfirm] = useState<AgentScenario | null>(null);

  // ── sidebar geometry ──
  const [sidebarWidth, setSidebarWidth] = useState(PL_DEFAULT_W);
  const [isDraggingMain, setIsDraggingMain] = useState(false);
  const mainDragRef = useRef({ active: false, startX: 0, startW: PL_DEFAULT_W });
  const [agentSplit, setAgentSplit] = useState(50); // % of sidebar height for Agent section
  const [agentCollapsed, setAgentCollapsed] = useState(false);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const sidebarContainerRef = useRef<HTMLDivElement>(null);
  const sidebarDragRef = useRef({ active: false });

  // ── category collapse within sections ──
  const [catCollapsed, setCatCollapsed] = useState<Set<string>>(new Set());
  const toggleCat = (id: string) => setCatCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── editor state ──
  const [editA, setEditA] = useState('');      // system prompt (agents) or template text
  const [editB, setEditB] = useState('');      // user prompt (agents only)
  const [editRole, setEditRole] = useState<'a'|'b'>('a');
  const [viewMode, setViewMode] = useState<'preview'|'edit'>('preview');
  const [dirty, setDirty] = useState(false);
  const editorRef = useRef<MonacoT.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof MonacoT | null>(null);
  const decoRef = useRef<MonacoT.editor.IEditorDecorationsCollection | null>(null);

  const { templates, setTemplate, resetTemplate, loadTemplates } = useAiPromptTemplatesStore();

  useEffect(() => { ensureVarStyle(); loadTemplates(); }, [loadTemplates]);

  // Load agent rows
  useEffect(() => {
    postMsg({ type: 'promptLibrary:load' });
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'promptLibrary:data') { setDbRows(msg.prompts || []); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const entries = useMemo(() => ALL_AGENT_SCENARIOS.map(s => buildEntry(s, dbRows.find(r => r.scenario === s))), [dbRows]);

  // Sync editor when selection changes
  useEffect(() => {
    if (!active) return;
    if (active.kind === 'agent') {
      const e = entries.find(x => x.scenario === active.scenario);
      setEditA(e?.systemPrompt ?? ''); setEditB(e?.userPrompt ?? '');
    } else if (active.kind === 'mock') {
      const systemKey = toSystemKey(active.key);
      setEditA(templates[systemKey] ?? AI_PROMPT_TEMPLATE_DEFAULTS[systemKey] ?? '');
      setEditB(templates[active.key] ?? AI_PROMPT_TEMPLATE_DEFAULTS[active.key] ?? '');
    } else {
      setEditA(templates[active.key] ?? AI_PROMPT_TEMPLATE_DEFAULTS[active.key] ?? ''); setEditB('');
    }
    setEditRole('a'); setViewMode('preview'); setDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.kind === 'agent' ? active.scenario : (active as {key?: AiPromptTemplateKey})?.key]);

  const updateDecos = useCallback((text: string) => {
    if (decoRef.current && monacoRef.current) decoRef.current.set(computeDecos(text, monacoRef.current));
  }, []);

  const currentText = editRole === 'b' ? editB : editA;

  const handleSave = useCallback(() => {
    if (!active) return;
    if (active.kind === 'template') {
      setTemplate(active.key, editA); setDirty(false); return;
    }
    if (active.kind === 'mock') {
      const sysKey = toSystemKey(active.key);
      setTemplate(sysKey, editA);
      setTemplate(active.key, editB);
      setDirty(false); return;
    }
    const entry = entries.find(e => e.scenario === active.scenario);
    if (!entry) return;
    postMsg({ type: 'promptLibrary:save', scenario: active.scenario, prompt: { scenario: active.scenario, system_prompt: editA, user_prompt: editB, agent_name: entry.agentName } });
    const updatedAt = new Date().toISOString();
    setDbRows(prev => {
      const row: PromptRow = { scenario: active.scenario, system_prompt: editA, user_prompt: editB, agent_name: entry.agentName, updated_at: updatedAt };
      const idx = prev.findIndex(r => r.scenario === active.scenario);
      return idx >= 0 ? prev.map((r, i) => i === idx ? row : r) : [...prev, row];
    });
    setDirty(false);
  }, [active, editA, editB, entries, setTemplate]);

  const handleReset = useCallback(() => {
    if (!active) return;
    if (active.kind === 'template') {
      resetTemplate(active.key); setEditA(AI_PROMPT_TEMPLATE_DEFAULTS[active.key] ?? ''); setDirty(false);
    } else if (active.kind === 'mock') {
      const sysKey = toSystemKey(active.key);
      resetTemplate(sysKey); resetTemplate(active.key);
      setEditA(AI_PROMPT_TEMPLATE_DEFAULTS[sysKey] ?? '');
      setEditB(AI_PROMPT_TEMPLATE_DEFAULTS[active.key] ?? '');
      setDirty(false);
    } else {
      setResetConfirm(active.scenario);
    }
  }, [active, resetTemplate]);

  const handleAgentResetConfirm = useCallback((scenario: AgentScenario) => {
    postMsg({ type: 'promptLibrary:reset', scenario });
    setDbRows(prev => prev.filter(r => r.scenario !== scenario));
    if (active?.kind === 'agent' && active.scenario === scenario) {
      setEditA(getDefaultSystemPrompt(scenario)); setEditB(getDefaultUserPrompt(scenario)); setDirty(false);
    }
    setResetConfirm(null);
  }, [active]);

  const insertVar = useCallback((insert: string) => {
    if (!editorRef.current) return;
    const sel = editorRef.current.getSelection();
    if (!sel) return;
    editorRef.current.executeEdits('insert-var', [{ range: sel, text: insert, forceMoveMarkers: true }]);
    const val = editorRef.current.getValue();
    if (editRole === 'b') setEditB(val); else setEditA(val);
    setDirty(true); setViewMode('edit'); updateDecos(val);
  }, [editRole, updateDecos]);

  const allVars = useMemo<VarPill[]>(() => {
    if (!active) return [];
    if (active.kind === 'agent') {
      const known = AGENT_SCENARIO_VARIABLES[active.scenario];
      const extra: Record<string, { description: string; source: string }> = {};
      (editA + '\n' + editB).replace(/\{\{([^}]+)\}\}/g, (_, k) => { if (!(k in known)) extra[k] = { description: 'Custom variable', source: 'prompt' }; return k; });
      return Object.entries({ ...known, ...extra }).map(([k, v]) => ({ pill: `{{${k}}}`, insert: `{{${k}}}`, title: `${v.description}\nSource: ${v.source}` }));
    }
    if (active.kind === 'mock') {
      // Variables always shown at top level for BOTH System and User tabs —
      // they belong to the user prompt but are visible on both tabs so the
      // system prompt author can see what runtime context is available.
      return AI_PROMPT_TEMPLATE_VARIABLES[active.key].map(v => ({ pill: v, insert: v, title: `Variable: ${v}` }));
    }
    return AI_PROMPT_TEMPLATE_VARIABLES[active.key].map(v => ({ pill: v, insert: v, title: `Variable: ${v}` }));
  }, [active, editA, editB, editRole]);

  // ── Editor header info ──
  const isAgent = active?.kind === 'agent';
  const isTpl = active?.kind === 'template';
  const isMock = active?.kind === 'mock';
  const activeKey = (active as { key?: AiPromptTemplateKey })?.key;
  const mockSystemKey = isMock && activeKey ? toSystemKey(activeKey) : null;

  const editorColor = isAgent ? SCENARIO_COLORS[active!.scenario]
    : (isTpl || isMock) ? AI_TEMPLATE_COLORS[activeKey!]
    : ACCENT;
  const editorLabel = isAgent ? (entries.find(e => e.scenario === (active as {scenario: AgentScenario}).scenario)?.agentName ?? '')
    : (isTpl || isMock) ? AI_PROMPT_TEMPLATE_LABELS[activeKey!].label
    : '';
  const editorDesc = isAgent ? SCENARIO_DESCRIPTIONS[(active as {scenario: AgentScenario}).scenario]
    : (isTpl || isMock) ? AI_PROMPT_TEMPLATE_LABELS[activeKey!].description
    : '';
  const isCustomized = isAgent
    ? (entries.find(e => e.scenario === (active as {scenario: AgentScenario}).scenario)?.isCustomized ?? false)
    : isMock && mockSystemKey
    ? (
        (templates[activeKey!] ?? '') !== (AI_PROMPT_TEMPLATE_DEFAULTS[activeKey!] ?? '') ||
        (templates[mockSystemKey] ?? '') !== (AI_PROMPT_TEMPLATE_DEFAULTS[mockSystemKey] ?? '')
      )
    : isTpl ? ((templates[activeKey!] ?? '') !== (AI_PROMPT_TEMPLATE_DEFAULTS[activeKey!] ?? ''))
    : false;
  const updatedAt = isAgent ? (entries.find(e => e.scenario === (active as {scenario: AgentScenario}).scenario)?.updatedAt ?? null) : null;

  if (loading) return (
    <div className="flex flex-col h-full items-center justify-center gap-2">
      <SparkleIcon size={24} style={{ color: ACCENT, opacity: 0.4 }} />
      <p className="text-[12px] text-[var(--color-text-muted)]">Loading prompts…</p>
    </div>
  );

  return (
    <div className={`flex flex-col h-full overflow-hidden${isDraggingMain ? ' cursor-col-resize select-none' : isDraggingSidebar ? ' cursor-row-resize select-none' : ''}`}>

      {/* Header */}
      <div className="flex-shrink-0 border-b border-[var(--color-surface-border)] pt-3">
        <div className="flex items-center px-5">
          <span className="px-3 py-2 text-[12px] border-b-2 font-medium" style={{ borderColor: ACCENT, color: ACCENT }}>Prompt Library</span>
        </div>
      </div>

      {/* Two-pane */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <div ref={sidebarContainerRef} className="flex flex-col h-full border-r border-[var(--color-surface-border)] flex-shrink-0" style={{ width: sidebarWidth }}>

          {/* Agent Prompts section */}
          <div
            className="flex flex-col overflow-hidden flex-shrink-0"
            style={agentCollapsed ? { height: 30 } : { height: `${agentSplit}%`, minHeight: 60 }}
          >
            {/* Section header */}
            <button type="button" onClick={() => setAgentCollapsed(c => !c)}
              className="flex items-center gap-1.5 px-3 h-[30px] w-full text-left flex-shrink-0 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)] hover:bg-[rgba(255,255,255,0.03)] transition-colors"
            >
              <span className={`transition-transform duration-150 ${agentCollapsed ? '' : 'rotate-90'}`}><ChevronRightIcon size={9} /></span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">Agent Prompts</span>
            </button>

            {!agentCollapsed && (
              <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] py-1">
                {AGENT_CATEGORIES.map(cat => {
                  const isOpen = !catCollapsed.has(cat.id);
                  return (
                    <div key={cat.id} className="mb-0.5">
                      <button type="button" onClick={() => toggleCat(cat.id)}
                        className="w-full flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold tracking-wide uppercase cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                      >
                        <span className={`transition-transform duration-150 flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}><ChevronRightIcon size={9} /></span>
                        {cat.label}
                        <span className="ml-auto opacity-50">{cat.scenarios.length}</span>
                      </button>
                      {isOpen && cat.scenarios.map(s => {
                        const row = dbRows.find(r => r.scenario === s);
                        const isAct = active?.kind === 'agent' && active.scenario === s;
                        const color = SCENARIO_COLORS[s];
                        return (
                          <button key={s} type="button" onClick={() => setActive({ kind: 'agent', scenario: s })}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors text-left ${isAct ? 'bg-[rgba(139,92,246,0.12)]' : 'hover:bg-[rgba(255,255,255,0.04)]'}`}
                          >
                            <div className="w-[22px] h-[22px] rounded-md flex items-center justify-center flex-shrink-0 text-white text-[9px] font-bold" style={{ backgroundColor: color }}>{SCENARIO_LABELS[s].slice(0,2)}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] font-medium truncate" style={{ color: isAct ? color : 'var(--color-text-primary)' }}>{SCENARIO_LABELS[s]}</span>
                                {!!row?.updated_at && <span className="text-[8px] px-1 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ backgroundColor: `${color}22`, color }}>CUSTOM</span>}
                              </div>
                              <p className="text-[10px] text-[var(--color-text-muted)] truncate leading-tight">{SCENARIO_DESCRIPTIONS[s]}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Internal sidebar drag handle (between sections) */}
          {!agentCollapsed && !aiCollapsed && (
            <div
              className="h-[5px] flex-shrink-0 cursor-row-resize relative group"
              onPointerDown={e => {
                e.preventDefault();
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                sidebarDragRef.current.active = true;
                setIsDraggingSidebar(true);
              }}
              onPointerMove={e => {
                if (!sidebarDragRef.current.active || !sidebarContainerRef.current) return;
                const rect = sidebarContainerRef.current.getBoundingClientRect();
                setAgentSplit(Math.max(20, Math.min(80, ((e.clientY - rect.top) / rect.height) * 100)));
              }}
              onPointerUp={e => { (e.target as HTMLElement).releasePointerCapture(e.pointerId); sidebarDragRef.current.active = false; setIsDraggingSidebar(false); }}
            >
              <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[2px] rounded-full transition-all duration-150 ${isDraggingSidebar ? 'w-[80px] bg-[var(--color-protocol-ai)]' : 'w-[40px] bg-[var(--color-surface-border)] group-hover:w-[80px] group-hover:bg-[var(--color-protocol-ai)]'}`} />
            </div>
          )}

          {/* AI Actions section */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <button type="button" onClick={() => setAiCollapsed(c => !c)}
              className="flex items-center gap-1.5 px-3 h-[30px] w-full text-left flex-shrink-0 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)] hover:bg-[rgba(255,255,255,0.03)] transition-colors"
            >
              <span className={`transition-transform duration-150 ${aiCollapsed ? '' : 'rotate-90'}`}><ChevronRightIcon size={9} /></span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">AI Actions</span>
            </button>

            {!aiCollapsed && (
              <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] py-1">
                {AI_TEMPLATE_CATEGORIES.map(cat => {
                  const isOpen = !catCollapsed.has(`tpl-${cat.id}`);
                  return (
                    <div key={cat.id} className="mb-0.5">
                      <button type="button" onClick={() => toggleCat(`tpl-${cat.id}`)}
                        className="w-full flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold tracking-wide uppercase cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                      >
                        <span className={`transition-transform duration-150 flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}><ChevronRightIcon size={9} /></span>
                        {cat.label}
                        <span className="ml-auto opacity-50">{cat.keys.length}</span>
                      </button>
                      {isOpen && cat.keys.map(key => {
                        const { label, description } = AI_PROMPT_TEMPLATE_LABELS[key];
                        const color = AI_TEMPLATE_COLORS[key];
                        const isMockCat = cat.kind === 'mock';
                        const isAct = isMockCat
                          ? (active?.kind === 'mock' && active.key === key)
                          : (active?.kind === 'template' && active.key === key);
                        // For mock: badge if either system or user prompt is customized
                        const sysKey = isMockCat ? toSystemKey(key) : null;
                        const isItemCustomized = isMockCat
                          ? (
                            (templates[key] ?? '') !== (AI_PROMPT_TEMPLATE_DEFAULTS[key] ?? '') ||
                            (sysKey && (templates[sysKey] ?? '') !== (AI_PROMPT_TEMPLATE_DEFAULTS[sysKey] ?? ''))
                          )
                          : (templates[key] ?? '') !== (AI_PROMPT_TEMPLATE_DEFAULTS[key] ?? '');
                        return (
                          <button key={key} type="button"
                            onClick={() => setActive(isMockCat ? { kind: 'mock', key } : { kind: 'template', key })}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors text-left ${isAct ? 'bg-[rgba(139,92,246,0.12)]' : 'hover:bg-[rgba(255,255,255,0.04)]'}`}
                          >
                            <div className="w-[22px] h-[22px] rounded-md flex items-center justify-center flex-shrink-0 text-white text-[11px]" style={{ backgroundColor: color }}>{isMockCat ? label.slice(0, 2) : '✦'}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] font-medium truncate" style={{ color: isAct ? color : 'var(--color-text-primary)' }}>{label}</span>
                                {isItemCustomized && <span className="text-[8px] px-1 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ backgroundColor: `${color}22`, color }}>CUSTOM</span>}
                              </div>
                              <p className="text-[10px] text-[var(--color-text-muted)] truncate leading-tight">{description}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Main splitter (sidebar ↔ editor) — setPointerCapture, no toggle ── */}
        <div
          className="w-[5px] flex-shrink-0 cursor-col-resize relative group"
          onPointerDown={e => {
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            mainDragRef.current = { active: true, startX: e.clientX, startW: sidebarWidth };
            setIsDraggingMain(true);
          }}
          onPointerMove={e => {
            if (!mainDragRef.current.active) return;
            setSidebarWidth(Math.max(PL_MIN_W, Math.min(PL_MAX_W, mainDragRef.current.startW + e.clientX - mainDragRef.current.startX)));
          }}
          onPointerUp={e => { (e.target as HTMLElement).releasePointerCapture(e.pointerId); mainDragRef.current.active = false; setIsDraggingMain(false); }}
        >
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[3px] rounded-full transition-all duration-150 ${isDraggingMain ? 'h-[80px] bg-[var(--color-protocol-ai)]' : 'h-[44px] bg-[var(--color-surface-border)] group-hover:h-[80px] group-hover:bg-[var(--color-protocol-ai)]'}`} />
        </div>

        {/* ── Editor pane ──────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          {(isAgent || isTpl || isMock) ? (
            <>
              {/* Header */}
              <div className="flex-shrink-0 flex items-start gap-3 px-4 py-3 border-b border-[var(--color-surface-border)]">
                <div className="w-[32px] h-[32px] rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-[11px] font-bold" style={{ backgroundColor: editorColor }}>
                  {isAgent ? editorLabel.slice(0,2) : '✦'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{editorLabel}</p>
                    {isCustomized && !dirty && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: `${editorColor}22`, color: editorColor }}>CUSTOM</span>}
                    {dirty && <span className="text-[9px] text-[var(--color-text-muted)]">● unsaved</span>}
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)]">{editorDesc}</p>
                  {updatedAt && <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Modified: {new Date(updatedAt).toLocaleString()}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                  <button type="button" onClick={handleSave} disabled={!dirty} className="px-3 py-1 text-[11px] rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-white" style={{ backgroundColor: ACCENT }}>Save</button>
                  {isCustomized && !dirty && (
                    <button type="button" onClick={handleReset} className="h-[26px] w-[26px] flex items-center justify-center rounded cursor-pointer hover:bg-[rgba(255,80,80,0.12)] transition-colors" title="Reset to default">
                      <TrashIcon size={12} className="text-[var(--color-error)]" />
                    </button>
                  )}
                </div>
              </div>

              {/* Variable ribbon */}
              {allVars.length > 0 && (
                <div className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 border-b border-[var(--color-surface-border)] flex-wrap">
                  <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0">Variables — click to insert:</span>
                  {allVars.map(({ pill, insert, title }) => (
                    <button key={pill} type="button" onClick={() => insertVar(insert)} title={title}
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold cursor-pointer flex-shrink-0 hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: 'rgba(139,92,246,.15)', color: '#c084fc', border: '1px solid rgba(139,92,246,.3)' }}
                    >{pill}</button>
                  ))}
                </div>
              )}

              {/* Tabs: System/User for agents + mock; single Template tab for diagnostics */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 border-b border-[var(--color-surface-border)]">
                <div className="flex items-center">
                  {(isAgent || isMock) ? (
                    (['a','b'] as const).map(role => (
                      <button key={role} type="button"
                        onClick={() => { setEditRole(role); updateDecos(role === 'b' ? editB : editA); }}
                        className="px-3 py-2 text-[11px] cursor-pointer transition-colors border-b-2"
                        style={{ borderColor: editRole === role ? ACCENT : 'transparent', color: editRole === role ? ACCENT : 'var(--color-text-muted)' }}
                      >{role === 'a' ? '⚙ System' : '💬 User'}</button>
                    ))
                  ) : (
                    <span className="px-3 py-2 text-[11px] border-b-2" style={{ borderColor: editorColor, color: editorColor }}>📝 Template</span>
                  )}
                </div>
                <div className="flex items-center">
                  {(['preview','edit'] as const).map(mode => (
                    <button key={mode} type="button" onClick={() => setViewMode(mode)}
                      className="px-3 py-2 text-[11px] cursor-pointer transition-colors border-b-2"
                      style={{ borderColor: viewMode === mode ? ACCENT : 'transparent', color: viewMode === mode ? ACCENT : 'var(--color-text-muted)' }}
                    >{mode === 'preview' ? '👁 Preview' : '✏ Edit'}</button>
                  ))}
                </div>
              </div>

              {/* Editor / Preview content */}
              <div className="flex-1 overflow-hidden">
                {viewMode === 'preview' ? (
                  <div className="h-full overflow-auto p-4 [scrollbar-gutter:stable]"><PromptPreview text={currentText} /></div>
                ) : (
                  <Editor
                    key={`${isAgent ? (active as {scenario:string}).scenario : (active as {key:string}).key}-${editRole}-${active?.kind}`}
                    height="100%" language="plaintext" theme="daakia-dark" value={currentText}
                    onChange={val => {
                      const v = val ?? '';
                      if (editRole === 'b') setEditB(v); else setEditA(v);
                      setDirty(true); updateDecos(v);
                    }}
                    onMount={(editor, monaco) => {
                      editorRef.current = editor as unknown as MonacoT.editor.IStandaloneCodeEditor;
                      monacoRef.current = monaco as unknown as typeof MonacoT;
                      decoRef.current = editor.createDecorationsCollection([]);
                      decoRef.current.set(computeDecos(currentText, monaco as unknown as typeof MonacoT));
                    }}
                    options={{ fontSize:12, wordWrap:'on', lineNumbers:'off', minimap:{enabled:false}, scrollBeyondLastLine:false, padding:{top:12,bottom:12}, renderLineHighlight:'none', overviewRulerLanes:0, lineDecorationsWidth:0, folding:false, glyphMargin:false }}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col flex-1 h-full items-center justify-center gap-3 text-center px-8">
              <SparkleIcon size={36} style={{ color: ACCENT, opacity: 0.35 }} />
              <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Select a prompt</p>
              <p className="text-[11px] text-[var(--color-text-muted)] max-w-[280px] leading-relaxed">Choose an agent or AI action from the left to view and edit its prompt. Changes persist in your local database.</p>
            </div>
          )}
        </div>
      </div>

      {resetConfirm && (
        <ConfirmDialog title="Reset to Default" message={`Reset "${SCENARIO_LABELS[resetConfirm]}" prompt to the built-in default? Customizations will be lost.`} confirmLabel="Reset" danger
          onConfirm={() => handleAgentResetConfirm(resetConfirm)} onCancel={() => setResetConfirm(null)} />
      )}
    </div>
  );
}
