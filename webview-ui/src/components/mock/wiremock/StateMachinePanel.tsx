/**
 * StateMachinePanel — Visual state machine editor for scenario-based mock flows (6A.11-6A.12).
 * Per-route state requirements + transitions, plus server-level state machine config.
 */
import { useState } from 'react';
import { PlusIcon, TrashIcon, ChevronDownIcon } from '../../../icons';
import type { MockRoute, StateMachineConfig, StateNode, StateTransition } from '../mock-types';
import { StyledDropdown } from '../../shared/controls/StyledDropdown';

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
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors"
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
        <button type="button" onClick={e => { e.stopPropagation(); addState(); setExpanded(true); }}
          className="flex items-center gap-1 h-[20px] px-2 text-[10px] rounded cursor-pointer"
          style={{ color: MOCK_ACCENT, background: `color-mix(in srgb, ${MOCK_ACCENT} 10%, transparent)` }}>
          <PlusIcon size={9} /> Add State
        </button>
      </button>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-[rgba(255,255,255,0.07)]">
          {/* Initial state */}
          <div className="flex items-center gap-2 pt-2">
            <span className="text-[10px] text-[var(--color-text-muted)]">Initial state</span>
            <input
              type="text"
              value={cfg.initialState}
              onChange={e => onUpdate({ ...cfg, initialState: e.target.value })}
              className="h-[24px] px-2 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none w-[140px]"
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
              <button type="button" onClick={addState}
                className="flex items-center gap-1 h-[20px] px-2 text-[10px] rounded cursor-pointer"
                style={{ color: MOCK_ACCENT, background: `color-mix(in srgb, ${MOCK_ACCENT} 10%, transparent)` }}>
                <PlusIcon size={9} /> Add
              </button>
            </div>
            {cfg.states.length === 0 ? (
              <p className="text-[10px] text-[var(--color-text-muted)] opacity-50 py-1">No states defined yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {cfg.states.map((s, idx) => (
                  <div key={s.id} className="flex items-center gap-2 group">
                    <div className="w-[10px] h-[10px] rounded-full flex-shrink-0" style={{ background: s.color ?? MOCK_ACCENT }} />
                    <input
                      type="text"
                      value={s.id}
                      onChange={e => updateState(idx, { id: e.target.value })}
                      placeholder="state_id"
                      className="w-[120px] h-[24px] px-2 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none"
                    />
                    <input
                      type="text"
                      value={s.label ?? s.id}
                      onChange={e => updateState(idx, { label: e.target.value })}
                      placeholder="Display label"
                      className="flex-1 h-[24px] px-2 text-[11px] rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none"
                    />
                    {cfg.initialState === s.id && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-[rgba(34,197,94,0.12)] text-[var(--color-success)]">initial</span>
                    )}
                    <button type="button" onClick={() => removeState(s.id)} className="opacity-0 group-hover:opacity-100 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer">
                      <TrashIcon size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Transitions */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Transitions</span>
              <button type="button" onClick={addTransition} disabled={!hasMultipleStates}
                className="flex items-center gap-1 h-[20px] px-2 text-[10px] rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: MOCK_ACCENT, background: `color-mix(in srgb, ${MOCK_ACCENT} 10%, transparent)` }}>
                <PlusIcon size={9} /> Add
              </button>
            </div>
            {!hasMultipleStates && <p className="text-[10px] text-[var(--color-text-muted)] opacity-40">Need at least 2 states to add transitions.</p>}
            {cfg.transitions.map((t, idx) => (
              <div key={t.id} className="flex items-center gap-1.5 group mb-1.5">
                <StateSelect value={t.from} states={stateIds} onChange={v => updateTransition(idx, { from: v })} />
                <span className="text-[10px] text-[var(--color-text-muted)]">→</span>
                <StateSelect value={t.to} states={stateIds} onChange={v => updateTransition(idx, { to: v })} />
                <input
                  type="text"
                  value={t.triggeredByRouteId}
                  onChange={e => updateTransition(idx, { triggeredByRouteId: e.target.value })}
                  placeholder="route id (trigger)"
                  className="flex-1 h-[24px] px-2 text-[10px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-muted)] focus:outline-none"
                />
                <button type="button" onClick={() => removeTransition(idx)} className="opacity-0 group-hover:opacity-100 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer">
                  <TrashIcon size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Per-route state gate controls (within RouteCard) ────────────────────────

interface RouteStatePanelProps {
  route: MockRoute;
  onUpdate: (patch: Partial<MockRoute>) => void;
  availableStates?: string[];
}

export function RouteStatePanel({ route, onUpdate, availableStates = [] }: RouteStatePanelProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-text-muted)] w-[100px] flex-shrink-0">Required state</span>
        <input
          type="text"
          value={route.requiredState ?? ''}
          onChange={e => onUpdate({ requiredState: e.target.value || undefined })}
          list="available-states"
          placeholder="any state (no restriction)"
          className="flex-1 h-[26px] px-2 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
        />
        <datalist id="available-states">
          {availableStates.map(s => <option key={s} value={s} />)}
        </datalist>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-text-muted)] w-[100px] flex-shrink-0">Transition to state</span>
        <input
          type="text"
          value={route.newState ?? ''}
          onChange={e => onUpdate({ newState: e.target.value || undefined })}
          list="available-states"
          placeholder="no transition"
          className="flex-1 h-[26px] px-2 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
        />
      </div>
      {(route.requiredState || route.newState) && (
        <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
          {route.requiredState ? `Only matches when session is in state "${route.requiredState}". ` : ''}
          {route.newState ? `After matching, transitions session to "${route.newState}".` : ''}
        </p>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StateSelect({ value, states, onChange }: { value: string; states: string[]; onChange: (v: string) => void }) {
  return (
    <StyledDropdown
      value={value}
      options={states.map(s => ({ value: s, label: s }))}
      onChange={onChange}
      size="xs"
    />
  );
}

function StateDiagram({ states, transitions, initialState }: {
  states: StateNode[];
  transitions: StateTransition[];
  initialState: string;
}) {
  // Simple linear/circular text diagram — no canvas needed
  const stateMap = new Map(states.map(s => [s.id, s]));
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {states.map((s, i) => {
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
