/**
 * StateMachinePanel — Visual state machine editor for scenario-based mock flows (6A.11-6A.12).
 * Per-route state requirements + transitions, plus server-level state machine config.
 */
import { SelectInputView, TextInputView, ButtonView, IconButtonView, EditorView, ResizablePanelView, type SelectOption } from '@salilvnair/dui';
import { PlusIcon, TrashIcon, ChevronDownIcon } from '../../../icons';
import { useState } from 'react';
import type { MockRoute, StateMachineConfig, StateNode, StateTransition, StateTransitionEntry } from '../mock-types';

const MOCK_ACCENT = 'var(--color-mock-server)';

// ─── Server-level state machine config ───────────────────────────────────────

interface StateMachineEditorProps {
  config?: StateMachineConfig;
  onUpdate: (cfg: StateMachineConfig) => void;
}

export function StateMachineEditor({ config, onUpdate }: StateMachineEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const cfg: StateMachineConfig = config ?? { initialState: 'default', states: [], transitions: [] };

  const addState = () => {
    const id = `state_${Date.now()}`;
    onUpdate({ ...cfg, states: [...cfg.states, { id, label: 'New State', color: MOCK_ACCENT }] });
  };

  const updateState = (idx: number, patch: Partial<StateNode>) => {
    const states = [...cfg.states];
    states[idx] = { ...states[idx], ...patch };
    onUpdate({ ...cfg, states });
  };

  const removeState = (id: string) => {
    onUpdate({
      ...cfg,
      states: cfg.states.filter(s => s.id !== id),
      transitions: cfg.transitions.filter(t => t.from !== id && t.to !== id),
    });
  };

  const addTransition = () => {
    const t: StateTransition = {
      id: `tr_${Date.now()}`,
      from: cfg.states[0]?.id ?? 'default',
      to: cfg.states[1]?.id ?? 'default',
      triggeredByRouteId: '',
    };
    onUpdate({ ...cfg, transitions: [...cfg.transitions, t] });
  };

  const updateTransition = (idx: number, patch: Partial<StateTransition>) => {
    const transitions = [...cfg.transitions];
    transitions[idx] = { ...transitions[idx], ...patch };
    onUpdate({ ...cfg, transitions });
  };

  const removeTransition = (idx: number) => {
    onUpdate({ ...cfg, transitions: cfg.transitions.filter((_, i) => i !== idx) });
  };

  const stateIds = cfg.states.map(s => s.id);
  const hasMultipleStates = cfg.states.length >= 2;

  return (
    <div className="border border-dashed border-[rgba(255,255,255,0.1)] rounded-lg overflow-hidden">
      <div
        className="w-full flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="transition-transform duration-150 text-[var(--color-text-muted)]" style={{ display: 'inline-flex', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
            <ChevronDownIcon size={12} />
          </span>
          <span className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">State Machine</span>
          {cfg.states.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: `color-mix(in srgb, ${MOCK_ACCENT} 15%, transparent)`, color: MOCK_ACCENT }}>
              {cfg.states.length} states · {cfg.transitions.length} transitions
            </span>
          )}
        </div>
        <ButtonView
          size="sm"
          accentColor={MOCK_ACCENT}
          iconLeft={<PlusIcon size={12} />}
          onClick={e => { e.stopPropagation(); addState(); setExpanded(true); }}
        >
          Add State
        </ButtonView>
      </div>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-[rgba(255,255,255,0.07)]">
          {/* Initial state */}
          <div className="flex items-center gap-2 pt-2">
            <span className="text-[10px] text-[var(--color-text-muted)]">Initial state</span>
            <TextInputView
              value={cfg.initialState}
              onChange={e => onUpdate({ ...cfg, initialState: e.target.value })}
              size="md"
              style={{ width: 140, fontFamily: 'monospace' }}
            />
          </div>

          {/* Visual state diagram */}
          {cfg.states.length > 0 && (
            <div className="rounded-lg border border-[rgba(255,255,255,0.08)] p-3 bg-[rgba(255,255,255,0.02)]">
              <p className="text-[9px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide mb-2">Visual Flow</p>
              <StateDiagram states={cfg.states} transitions={cfg.transitions} initialState={cfg.initialState} />
            </div>
          )}

          {/* States list */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">States</span>
              <ButtonView size="sm" accentColor={MOCK_ACCENT} iconLeft={<PlusIcon size={9} />} onClick={addState}>
                Add
              </ButtonView>
            </div>
            {cfg.states.length === 0 ? (
              <p className="text-[10px] text-[var(--color-text-muted)] opacity-50 py-1">No states defined yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {cfg.states.map((s, idx) => (
                  <div key={s.id} className="flex items-center gap-2 group">
                    <div className="w-[10px] h-[10px] rounded-full flex-shrink-0" style={{ background: s.color ?? MOCK_ACCENT }} />
                    <TextInputView
                      value={s.id}
                      onChange={e => updateState(idx, { id: e.target.value })}
                      placeholder="state_id"
                      size="md"
                      style={{ width: 120, fontFamily: 'monospace' }}
                    />
                    <TextInputView
                      value={s.label ?? s.id}
                      onChange={e => updateState(idx, { label: e.target.value })}
                      placeholder="Display label"
                      size="md"
                      style={{ flex: 1 }}
                    />
                    {cfg.initialState === s.id && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-[rgba(34,197,94,0.12)] text-[var(--color-success)]">initial</span>
                    )}
                    <IconButtonView
                      size="sm"
                      icon={<TrashIcon size={11} />}
                      accentColor="var(--color-error)"
                      className="opacity-0 group-hover:opacity-100"
                      onClick={() => removeState(s.id)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Transitions */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Transitions</span>
              <ButtonView
                size="sm"
                accentColor={MOCK_ACCENT}
                iconLeft={<PlusIcon size={9} />}
                disabled={!hasMultipleStates}
                onClick={addTransition}
              >
                Add
              </ButtonView>
            </div>
            {!hasMultipleStates && <p className="text-[10px] text-[var(--color-text-muted)] opacity-40">Need at least 2 states to add transitions.</p>}
            {cfg.transitions.map((t, idx) => (
              <div key={t.id} className="flex items-center gap-1.5 group mb-1.5">
                <StateSelect value={t.from} states={stateIds} onChange={v => updateTransition(idx, { from: v })} />
                <span className="text-[10px] text-[var(--color-text-muted)]">→</span>
                <StateSelect value={t.to} states={stateIds} onChange={v => updateTransition(idx, { to: v })} />
                <TextInputView
                  value={t.triggeredByRouteId}
                  onChange={e => updateTransition(idx, { triggeredByRouteId: e.target.value })}
                  placeholder="route id (trigger)"
                  size="md"
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
                <IconButtonView
                  size="sm"
                  icon={<TrashIcon size={11} />}
                  accentColor="var(--color-error)"
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => removeTransition(idx)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Per-route state transitions table (multi-entry) ─────────────────────────

const ACCENT = 'var(--color-mock-server)';

interface RouteStatePanelProps {
  route: MockRoute;
  onUpdate: (patch: Partial<MockRoute>) => void;
}

function initEntries(route: MockRoute): StateTransitionEntry[] {
  if (route.stateTransitions?.length) return route.stateTransitions;
  // Migrate legacy single-pair on first open
  if (route.requiredState || route.newState) {
    return [{
      id: `tr_${route.id}_0`,
      requiredState: route.requiredState ?? '',
      newState: route.newState ?? '',
    }];
  }
  return [];
}

export function RouteStatePanel({ route, onUpdate }: RouteStatePanelProps) {
  const entries = route.stateTransitions ?? initEntries(route);
  const [expandedBody, setExpandedBody] = useState<Set<string>>(new Set());

  const save = (next: StateTransitionEntry[]) => {
    onUpdate({
      stateTransitions: next,
      // Keep legacy fields in sync for backward-compat with engine
      requiredState: next[0]?.requiredState || undefined,
      newState: next[0]?.newState || undefined,
    });
  };

  const addEntry = () => {
    save([...entries, { id: `tr_${Date.now()}`, requiredState: '', newState: '' }]);
  };

  const updateEntry = (id: string, patch: Partial<StateTransitionEntry>) => {
    save(entries.map(e => e.id === id ? { ...e, ...patch } : e));
  };

  const removeEntry = (id: string) => {
    save(entries.filter(e => e.id !== id));
    setExpandedBody(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const toggleBody = (id: string) => {
    setExpandedBody(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  return (
    <div className="flex flex-col gap-2">

      {/* ── header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
            State Transitions
          </span>
          {entries.length > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
              background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
              color: ACCENT,
            }}>
              {entries.length}
            </span>
          )}
        </div>
        <ButtonView
          size="sm"
          accentColor={ACCENT}
          iconLeft={<PlusIcon size={10} />}
          onClick={addEntry}
        >
          Add Transition
        </ButtonView>
      </div>

      {/* ── empty hint ──────────────────────────────────────────────── */}
      {entries.length === 0 && (
        <div style={{
          borderRadius: 7, border: '1px dashed rgba(255,255,255,0.09)',
          padding: '10px 12px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>
            No state transitions yet
          </p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', lineHeight: 1.5 }}>
            Add entries to serve different responses based on session state.
            <br />
            Same URL — multiple behaviors.
          </p>
        </div>
      )}

      {/* ── column header (only when entries exist) ─────────────────── */}
      {entries.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '14px 1fr 20px 1fr 54px',
          gap: 6, alignItems: 'center',
          padding: '0 4px',
        }}>
          <span />
          <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Required State
          </span>
          <span />
          <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Transition To
          </span>
          <span />
        </div>
      )}

      {/* ── entries ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        {entries.map((entry, i) => {
          const bodyOpen = expandedBody.has(entry.id);
          const hasOverride = !!(entry.responseBodyOverride || entry.statusCodeOverride);
          return (
            <div key={entry.id} style={{
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(255,255,255,0.02)',
              overflow: 'hidden',
            }}>
              {/* main row */}
              <div style={{
                display: 'grid', gridTemplateColumns: '14px 1fr 20px 1fr 54px',
                gap: 6, alignItems: 'center', padding: '7px 8px',
              }}>
                {/* index */}
                <span style={{
                  fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.2)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {String(i + 1).padStart(2, '0')}
                </span>

                {/* required state */}
                <TextInputView
                  value={entry.requiredState}
                  onChange={e => updateEntry(entry.id, { requiredState: e.target.value })}
                  placeholder="any state (initial)"
                  size="sm"
                  style={{ fontFamily: 'monospace', fontSize: 11 }}
                />

                {/* arrow */}
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>→</span>

                {/* new state */}
                <TextInputView
                  value={entry.newState}
                  onChange={e => updateEntry(entry.id, { newState: e.target.value })}
                  placeholder="no transition"
                  size="sm"
                  style={{ fontFamily: 'monospace', fontSize: 11 }}
                />

                {/* actions: body toggle + delete */}
                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                  <IconButtonView
                    size="sm"
                    icon={<ChevronDownIcon size={10} />}
                    title="Response override"
                    accentColor={hasOverride ? ACCENT : 'rgba(255,255,255,0.3)'}
                    style={{
                      transform: bodyOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                      transition: 'transform 150ms',
                      opacity: bodyOpen || hasOverride ? 1 : 0.5,
                    }}
                    onClick={() => toggleBody(entry.id)}
                  />
                  <IconButtonView
                    size="sm"
                    icon={<TrashIcon size={10} />}
                    accentColor="var(--color-error)"
                    title="Remove"
                    onClick={() => removeEntry(entry.id)}
                  />
                </div>
              </div>

              {/* optional response override panel */}
              {bodyOpen && (
                <div style={{
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  padding: '8px 10px',
                  display: 'flex', flexDirection: 'column', gap: 7,
                  background: 'rgba(0,0,0,0.15)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em', width: 72, flexShrink: 0 }}>
                      Status
                    </span>
                    <TextInputView
                      value={entry.statusCodeOverride ? String(entry.statusCodeOverride) : ''}
                      onChange={e => updateEntry(entry.id, { statusCodeOverride: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="inherit"
                      size="sm"
                      style={{ width: 80, fontFamily: 'monospace' }}
                    />
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginLeft: 2 }}>
                      leave blank to use route's status code
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Response Body Override
                    </span>
                    <ResizablePanelView defaultHeight={80} minHeight={60} maxHeight={300}>
                      <EditorView
                        value={entry.responseBodyOverride ?? ''}
                        onChange={val => updateEntry(entry.id, { responseBodyOverride: val || undefined })}
                        language="json"
                        placeholder={'// leave blank to use route\'s main body\n{\n  "status": "shipped"\n}'}
                        height="100%"
                        bordered
                      />
                    </ResizablePanelView>
                  </div>
                </div>
              )}

              {/* state label chips row */}
              {(entry.requiredState || entry.newState) && (
                <div style={{
                  padding: '4px 10px 6px',
                  display: 'flex', alignItems: 'center', gap: 6,
                  borderTop: bodyOpen ? undefined : '1px solid rgba(255,255,255,0.04)',
                }}>
                  {entry.requiredState ? (
                    <span style={{
                      fontSize: 9, padding: '2px 7px', borderRadius: 4, fontFamily: 'monospace',
                      background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
                      color: 'var(--color-warning)',
                    }}>
                      {entry.requiredState}
                    </span>
                  ) : (
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>any state</span>
                  )}
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>→</span>
                  {entry.newState ? (
                    <span style={{
                      fontSize: 9, padding: '2px 7px', borderRadius: 4, fontFamily: 'monospace',
                      background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
                      color: 'var(--color-success)',
                    }}>
                      {entry.newState}
                    </span>
                  ) : (
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>no transition</span>
                  )}
                  {hasOverride && (
                    <span style={{
                      marginLeft: 4, fontSize: 9, padding: '2px 6px', borderRadius: 4,
                      background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
                      color: ACCENT,
                    }}>
                      override
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* hint when entries exist */}
      {entries.length > 0 && (
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', lineHeight: 1.5, marginTop: 2 }}>
          Entries match top-to-bottom. First match wins. Empty "Required State" matches any session state.
        </p>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StateSelect({ value, states, onChange }: { value: string; states: string[]; onChange: (v: string) => void }) {
  const options: SelectOption[] = states.map(s => ({ value: s, label: s }));
  return (
    <SelectInputView
      value={value}
      options={options}
      onChange={onChange}
      size="md"
    />
  );
}

function StateDiagram({ states, transitions, initialState }: {
  states: StateNode[];
  transitions: StateTransition[];
  initialState: string;
}) {
  const stateMap = new Map(states.map(s => [s.id, s]));
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {states.map((s) => {
        const outgoing = transitions.filter(t => t.from === s.id);
        return (
          <div key={s.id} className="flex items-center gap-1.5">
            <div className="flex flex-col items-center">
              <div
                className="px-2 py-1 rounded text-[10px] font-mono font-medium"
                style={{
                  background: `color-mix(in srgb, ${s.color ?? MOCK_ACCENT} 15%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${s.color ?? MOCK_ACCENT} 30%, transparent)`,
                  color: s.color ?? MOCK_ACCENT,
                }}
              >
                {s.label ?? s.id}
              </div>
              {s.id === initialState && (
                <span className="text-[8px] text-[var(--color-success)] mt-0.5">▶ initial</span>
              )}
            </div>
            {outgoing.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {outgoing.map(t => {
                  const target = stateMap.get(t.to);
                  return (
                    <div key={t.id} className="flex items-center gap-1">
                      <span className="text-[9px] text-[var(--color-text-muted)]">→</span>
                      <div
                        className="px-1.5 py-0.5 rounded text-[9px] font-mono"
                        style={{
                          background: `color-mix(in srgb, ${target?.color ?? MOCK_ACCENT} 10%, transparent)`,
                          color: target?.color ?? MOCK_ACCENT,
                        }}
                      >
                        {target?.label ?? t.to}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
