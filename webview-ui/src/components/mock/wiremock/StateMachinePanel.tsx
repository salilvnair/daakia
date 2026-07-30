/**
 * StateMachinePanel — Visual state machine editor for scenario-based mock flows (6A.11-6A.12).
 * Per-route/operation "which connected workflow + which of its events gates this" selector,
 * plus server-level state machine config.
 */
import { SelectInputView, TextInputView, ButtonView, IconButtonView, EditorView, ResizablePanelView, type SelectOption } from '@salilvnair/dui';
import { PlusIcon, TrashIcon, ChevronDownIcon } from '../../../icons';
import { useState } from 'react';
import type { StateMachineConfig, StateNode, StateTransition, ConnectedWorkflow } from '../mock-types';

const MOCK_ACCENT = 'var(--color-mock-server)';

// ─── State Machine + Trigger Event selector (all protocols) ─────────────────
// Two-step, event-driven only: pick which connected workflow gates this
// route/operation (skipped when there's just one, unambiguous), then pick
// one of that workflow's real transition events. No "manual required state"
// fallback — the @salilvnair/state-machine engine (and its canvas) has no
// such concept, so neither does this selector; a route with no event set
// simply isn't gated at all.

interface StateMachineTriggerSelectProps {
  /** The server's connected workflows (preferred) and/or its legacy singular stateMachine (fallback, e.g. hand-authored samples). */
  server: { stateMachine?: StateMachineConfig; connectedWorkflows?: ConnectedWorkflow[] };
  connectedWorkflowId?: string;
  triggerEvent?: string;
  onChange: (patch: { connectedWorkflowId?: string; triggerEvent?: string }) => void;
}

export function StateMachineTriggerSelect({ server, connectedWorkflowId, triggerEvent, onChange }: StateMachineTriggerSelectProps) {
  const workflows: ConnectedWorkflow[] = server.connectedWorkflows?.length
    ? server.connectedWorkflows
    : server.stateMachine
      ? [{ workflowId: '', name: 'Connected State Machine', stateMachine: server.stateMachine }]
      : [];

  if (workflows.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
          Trigger Event
        </span>
        <p style={{ fontSize: 10, color: 'color-mix(in srgb, var(--color-text-primary) 30%, transparent)', lineHeight: 1.5 }}>
          Connect a state machine workflow (State Machine tab → Connect to Mock Server) to pick from its real event names here.
        </p>
      </div>
    );
  }

  const singleWorkflow = workflows.length === 1 ? workflows[0] : undefined;
  const selectedWorkflow = singleWorkflow ?? workflows.find(w => w.workflowId === connectedWorkflowId);

  // Multiple connected workflows: the "State Machine" dropdown below already has
  // its own real "Select a connected workflow…" unselected state — that's where
  // a consumer opts out of gating entirely. Once a specific workflow IS picked
  // there, the event is mandatory: no separate "None" inside Trigger Event too
  // (that would just be the same "not gated" choice available in two places).
  // Single connected workflow: there's no "State Machine" selector at all (it's
  // auto-applied), so "None" here remains the only way a route can stay ungated
  // while the server still has a workflow connected — several bundled samples
  // (e.g. orders-api's `GET /api/orders`) rely on exactly this.
  const realEventOptions: SelectOption[] = Array.from(
    new Set((selectedWorkflow?.stateMachine?.transitions ?? []).map(t => t.label).filter((l): l is string => !!l)),
  ).map(e => ({ value: e, label: e }));
  const eventOptions: SelectOption[] = workflows.length > 1
    ? realEventOptions
    : [{ value: '', label: 'None — always matches, no state gating' }, ...realEventOptions];

  return (
    <div className="flex flex-col gap-2">
      {workflows.length > 1 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
            State Machine
          </span>
          <SelectInputView
            options={[{ value: '', label: 'Select a connected workflow…' }, ...workflows.map(w => ({ value: w.workflowId, label: w.name }))]}
            value={connectedWorkflowId ?? ''}
            onChange={(v) => onChange({ connectedWorkflowId: (v as string) || undefined, triggerEvent: undefined })}
            size="sm"
            accentColor={MOCK_ACCENT}
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
          Trigger Event
        </span>
        <SelectInputView
          options={eventOptions}
          value={triggerEvent ?? ''}
          onChange={(v) => onChange({ connectedWorkflowId, triggerEvent: (v as string) || undefined })}
          size="sm"
          accentColor={MOCK_ACCENT}
          disabled={workflows.length > 1 && !selectedWorkflow}
          placeholder={workflows.length > 1 ? 'Select an event…' : undefined}
        />
        <p style={{ fontSize: 10, color: 'color-mix(in srgb, var(--color-text-primary) 30%, transparent)', lineHeight: 1.5 }}>
          {workflows.length > 1 && !selectedWorkflow
            ? 'Pick a State Machine above first.'
            : workflows.length > 1
            ? "Required once a State Machine is selected — fires directly against the workflow's own transitions, rejected if the event isn't valid from the session's current state."
            : "When set, a successful match fires this event directly against the workflow's own transitions — rejected if the event isn't valid from the session's current state."}
        </p>
      </div>

      {triggerEvent && (
        <div style={{
          borderRadius: 7, border: `1px solid color-mix(in srgb, ${MOCK_ACCENT} 20%, transparent)`,
          background: `color-mix(in srgb, ${MOCK_ACCENT} 6%, transparent)`,
          padding: '8px 10px',
        }}>
          <p style={{ fontSize: 10, color: MOCK_ACCENT, lineHeight: 1.5 }}>
            Firing event <strong>{triggerEvent}</strong> on a successful match.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Server-level state machine config ───────────────────────────────────────

interface StateMachineEditorProps {
  config?: StateMachineConfig;
  onUpdate: (cfg: StateMachineConfig) => void;
}

export function StateMachineEditor({ config, onUpdate }: StateMachineEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const cfg: StateMachineConfig = config ?? { enabled: true, sessionMode: 'global' as const, defaultState: 'default', states: [], transitions: [] };

  const addState = () => {
    const id = `state_${Date.now()}`;
    onUpdate({ ...cfg, states: [...cfg.states, { id, name: 'New State', x: 0, y: 0, color: MOCK_ACCENT }] });
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
      routeId: '',
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
    <div className="border border-dashed border-[color-mix(in_srgb,var(--color-text-primary)_10%,transparent)] rounded-lg overflow-hidden">
      <div
        className="w-full flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-text-primary)_3%,transparent)] transition-colors"
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
          variant="ghost"
          accentColor={MOCK_ACCENT}
          iconLeft={<PlusIcon size={12} />}
          onClick={e => { e.stopPropagation(); addState(); setExpanded(true); }}
        >
          Add State
        </ButtonView>
      </div>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]">
          {/* Initial state */}
          <div className="flex items-center gap-2 pt-2">
            <span className="text-[10px] text-[var(--color-text-muted)]">Initial state</span>
            <TextInputView
              value={cfg.defaultState}
              onChange={e => onUpdate({ ...cfg, defaultState: e.target.value })}
              size="md"
              style={{ width: 140, fontFamily: 'monospace' }}
            />
          </div>

          {/* Visual state diagram */}
          {cfg.states.length > 0 && (
            <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-text-primary)_8%,transparent)] p-3 bg-[color-mix(in_srgb,var(--color-text-primary)_2%,transparent)]">
              <p className="text-[9px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide mb-2">Visual Flow</p>
              <StateDiagram states={cfg.states} transitions={cfg.transitions} initialState={cfg.defaultState} />
            </div>
          )}

          {/* States list */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">States</span>
              <ButtonView size="sm" variant="ghost" accentColor={MOCK_ACCENT} iconLeft={<PlusIcon size={9} />} onClick={addState}>
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
                      value={s.name ?? s.id}
                      onChange={e => updateState(idx, { name: e.target.value })}
                      placeholder="Display label"
                      size="md"
                      style={{ flex: 1 }}
                    />
                    {cfg.defaultState === s.id && (
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
                variant="ghost"
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
                  value={t.routeId}
                  onChange={e => updateTransition(idx, { routeId: e.target.value })}
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
                {s.name ?? s.id}
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
                        {target?.name ?? t.to}
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
