/**
 * MockStateMachineEditor — Sprint 13.34 visual drag-drop state machine editor.
 * SVG canvas with draggable nodes, arrow edges, match condition editing,
 * and JSON export. Shared across REST, WS, GQL, MQTT, SSE, SIO, gRPC protocols.
 */
import { useState, useRef, useEffect } from 'react';
import { PlusIcon, TrashIcon, CopyIcon, CheckIcon } from '../../icons';
import type { StateMachineConfig, StateNode, StateTransition } from './mock-types';
import { StyledDropdown } from '../shared/controls/StyledDropdown';

const MOCK_ACCENT = 'var(--color-mock-server)';
const NODE_W = 110;
const NODE_H = 38;
const CANVAS_W = 700;
const CANVAS_H = 420;

interface NodePos { x: number; y: number; }

interface Props {
  config?: StateMachineConfig;
  onUpdate: (cfg: StateMachineConfig) => void;
}

export function MockStateMachineEditor({ config, onUpdate }: Props) {
  const cfg: StateMachineConfig = config ?? { initialState: 'initial', states: [], transitions: [] };

  // Positions stored separately (not in StateMachineConfig to keep config clean)
  const [positions, setPositions] = useState<Record<string, NodePos>>(() => buildInitialPositions(cfg.states));
  const [dragging, setDragging] = useState<{ id: string; ox: number; oy: number } | null>(null);
  const [connecting, setConnecting] = useState<{ fromId: string; mouseX: number; mouseY: number } | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Sync positions when states array changes (new states added externally)
  useEffect(() => {
    setPositions(prev => {
      const next = { ...prev };
      cfg.states.forEach((s, i) => {
        if (!next[s.id]) {
          const col = i % 4;
          const row = Math.floor(i / 4);
          next[s.id] = { x: 40 + col * 160, y: 60 + row * 120 };
        }
      });
      return next;
    });
  }, [cfg.states]);

  const getSvgPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: e.clientX, y: e.clientY };
    const rect = svg.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const addState = () => {
    const id = `state_${cfg.states.length + 1}`;
    const x = 40 + (cfg.states.length % 4) * 160;
    const y = 60 + Math.floor(cfg.states.length / 4) * 120;
    setPositions(p => ({ ...p, [id]: { x, y } }));
    onUpdate({ ...cfg, states: [...cfg.states, { id, label: id }] });
    setSelectedNode(id);
  };

  const updateState = (id: string, patch: Partial<StateNode>) => {
    const states = cfg.states.map(s => s.id === id ? { ...s, ...patch } : s);
    // If id changed, update positions + transitions
    if (patch.id && patch.id !== id) {
      setPositions(p => { const n = { ...p }; n[patch.id!] = n[id]; delete n[id]; return n; });
      onUpdate({
        ...cfg,
        states,
        transitions: cfg.transitions.map(t => ({
          ...t,
          from: t.from === id ? patch.id! : t.from,
          to: t.to === id ? patch.id! : t.to,
        })),
        initialState: cfg.initialState === id ? patch.id! : cfg.initialState,
      });
      if (selectedNode === id) setSelectedNode(patch.id!);
    } else {
      onUpdate({ ...cfg, states });
    }
  };

  const removeState = (id: string) => {
    setPositions(p => { const n = { ...p }; delete n[id]; return n; });
    onUpdate({
      ...cfg,
      states: cfg.states.filter(s => s.id !== id),
      transitions: cfg.transitions.filter(t => t.from !== id && t.to !== id),
    });
    if (selectedNode === id) setSelectedNode(null);
  };

  const updateTransition = (tid: string, patch: Partial<StateTransition>) => {
    onUpdate({ ...cfg, transitions: cfg.transitions.map(t => t.id === tid ? { ...t, ...patch } : t) });
  };

  const removeTransition = (tid: string) => {
    onUpdate({ ...cfg, transitions: cfg.transitions.filter(t => t.id !== tid) });
    if (selectedEdge === tid) setSelectedEdge(null);
  };

  // ── Drag node ───────────────────────────────────────────────────────────────

  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    if (connecting) {
      // Complete connection
      if (connecting.fromId !== id) {
        const tid = `tr_${Date.now()}`;
        onUpdate({ ...cfg, transitions: [...cfg.transitions, { id: tid, from: connecting.fromId, to: id, triggeredByRouteId: '' }] });
      }
      setConnecting(null);
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    const pt = getSvgPoint(e);
    const pos = positions[id] ?? { x: 0, y: 0 };
    setDragging({ id, ox: pt.x - pos.x, oy: pt.y - pos.y });
    setSelectedNode(id);
    setSelectedEdge(null);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const onSvgPointerMove = (e: React.PointerEvent) => {
    if (dragging) {
      const pt = getSvgPoint(e);
      setPositions(p => ({
        ...p,
        [dragging.id]: {
          x: Math.max(0, Math.min(CANVAS_W - NODE_W, pt.x - dragging.ox)),
          y: Math.max(0, Math.min(CANVAS_H - NODE_H, pt.y - dragging.oy)),
        },
      }));
    }
    if (connecting) {
      const pt = getSvgPoint(e);
      setConnecting(c => c ? { ...c, mouseX: pt.x, mouseY: pt.y } : null);
    }
  };

  const onSvgPointerUp = () => {
    setDragging(null);
    if (connecting) setConnecting(null); // dropped on canvas — cancel
  };

  const startConnect = (e: React.PointerEvent, fromId: string) => {
    e.stopPropagation();
    const pt = getSvgPoint(e);
    setConnecting({ fromId, mouseX: pt.x, mouseY: pt.y });
  };

  const exportJson = () => {
    const text = JSON.stringify(cfg, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const selectedStateData = selectedNode ? cfg.states.find(s => s.id === selectedNode) : null;
  const selectedTransData = selectedEdge ? cfg.transitions.find(t => t.id === selectedEdge) : null;

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">State Machine Editor</span>
        <button type="button" onClick={addState}
          className="flex items-center gap-1 h-[22px] px-2 text-[10px] rounded cursor-pointer"
          style={{ color: MOCK_ACCENT, background: `color-mix(in srgb, ${MOCK_ACCENT} 12%, transparent)` }}>
          <PlusIcon size={9} /> Add State
        </button>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {cfg.states.length} states · {cfg.transitions.length} transitions
          </span>
          <button type="button" onClick={exportJson} title="Copy state machine JSON"
            className="h-[22px] px-2 rounded flex items-center gap-1 text-[10px] cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] border border-[var(--color-surface-border)]">
            {copied ? <CheckIcon size={10} className="text-[var(--color-success)]" /> : <CopyIcon size={10} />}
            Export JSON
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="rounded-lg border border-[var(--color-surface-border)] overflow-hidden bg-[var(--color-input-bg)] relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          className="w-full select-none"
          style={{ height: 320 }}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onClick={() => { setSelectedNode(null); setSelectedEdge(null); }}
        >
          {/* Grid dots */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="0.5" cy="0.5" r="0.5" fill="rgba(255,255,255,0.06)" />
            </pattern>
          </defs>
          <rect width={CANVAS_W} height={CANVAS_H} fill="url(#grid)" />

          {/* Arrow marker */}
          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="var(--color-text-muted)" />
            </marker>
            <marker id="arrow-selected" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="var(--color-mock-server)" />
            </marker>
          </defs>

          {/* Edges */}
          {cfg.transitions.map(t => {
            const from = positions[t.from];
            const to = positions[t.to];
            if (!from || !to) return null;
            const isSelected = t.id === selectedEdge;
            const { x1, y1, x2, y2, mx, my } = edgeCoords(from, to);
            return (
              <g key={t.id} onClick={e => { e.stopPropagation(); setSelectedEdge(t.id); setSelectedNode(null); }}>
                {/* Wider invisible hit area */}
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} className="cursor-pointer" />
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={isSelected ? 'var(--color-mock-server)' : 'var(--color-text-muted)'}
                  strokeWidth={isSelected ? 1.5 : 1}
                  strokeDasharray={isSelected ? undefined : '4 3'}
                  markerEnd={isSelected ? 'url(#arrow-selected)' : 'url(#arrow)'}
                  className="cursor-pointer"
                />
                {/* Label */}
                {t.triggeredByRouteId && (
                  <text x={mx} y={my - 6} textAnchor="middle" fontSize={9} fill="var(--color-text-muted)"
                    className="pointer-events-none select-none font-mono">
                    {t.triggeredByRouteId.slice(0, 14)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Pending connection line */}
          {connecting && positions[connecting.fromId] && (
            <line
              x1={positions[connecting.fromId].x + NODE_W / 2}
              y1={positions[connecting.fromId].y + NODE_H / 2}
              x2={connecting.mouseX}
              y2={connecting.mouseY}
              stroke="var(--color-mock-server)"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              className="pointer-events-none"
            />
          )}

          {/* Nodes */}
          {cfg.states.map(s => {
            const pos = positions[s.id] ?? { x: 40, y: 40 };
            const isSelected = s.id === selectedNode;
            const isInitial = s.id === cfg.initialState;
            const color = s.color ?? MOCK_ACCENT;
            return (
              <g
                key={s.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onPointerDown={e => onNodePointerDown(e, s.id)}
                className="cursor-grab active:cursor-grabbing"
              >
                <rect
                  width={NODE_W} height={NODE_H} rx={6}
                  fill={`color-mix(in srgb, ${color} 10%, transparent)`}
                  stroke={isSelected ? color : `color-mix(in srgb, ${color} 35%, transparent)`}
                  strokeWidth={isSelected ? 1.5 : 1}
                />
                {isInitial && (
                  <circle cx={10} cy={19} r={4}
                    fill={`color-mix(in srgb, ${color} 60%, transparent)`}
                    stroke={color} strokeWidth={1}
                  />
                )}
                <text
                  x={NODE_W / 2} y={23}
                  textAnchor="middle" fontSize={10}
                  fill={color}
                  className="pointer-events-none select-none font-mono"
                  style={{ fontWeight: isSelected ? '600' : '500' }}
                >
                  {(s.label ?? s.id).slice(0, 14)}
                </text>

                {/* Connect handle — right edge */}
                <rect
                  x={NODE_W - 10} y={NODE_H / 2 - 8} width={10} height={16}
                  rx={3}
                  fill={`color-mix(in srgb, ${color} 20%, transparent)`}
                  stroke={`color-mix(in srgb, ${color} 40%, transparent)`}
                  strokeWidth={1}
                  className="cursor-crosshair"
                  onPointerDown={e => startConnect(e, s.id)}
                  title="Drag to connect"
                />
                <text
                  x={NODE_W - 5} y={NODE_H / 2 + 4}
                  textAnchor="middle" fontSize={8}
                  fill={color}
                  className="pointer-events-none select-none"
                >→</text>
              </g>
            );
          })}

          {/* Empty state hint */}
          {cfg.states.length === 0 && (
            <text x={CANVAS_W / 2} y={CANVAS_H / 2} textAnchor="middle" fontSize={12} fill="rgba(255,255,255,0.2)" className="select-none">
              Click "Add State" to get started
            </text>
          )}
        </svg>
      </div>

      {/* Properties panel */}
      {(selectedStateData || selectedTransData) && (
        <div className="rounded-lg border border-[var(--color-surface-border)] p-2.5 flex flex-col gap-2 bg-[var(--color-panel)]">
          {selectedStateData && (
            <StateProperties
              state={selectedStateData}
              isInitial={cfg.initialState === selectedStateData.id}
              onChange={patch => updateState(selectedStateData.id, patch)}
              onSetInitial={() => onUpdate({ ...cfg, initialState: selectedStateData.id })}
              onDelete={() => removeState(selectedStateData.id)}
            />
          )}
          {selectedTransData && (
            <TransitionProperties
              transition={selectedTransData}
              states={cfg.states}
              onChange={patch => updateTransition(selectedTransData.id, patch)}
              onDelete={() => removeTransition(selectedTransData.id)}
            />
          )}
        </div>
      )}

      {/* Initial state field */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-text-muted)] w-[90px] flex-shrink-0">Initial state</span>
        <input
          type="text"
          value={cfg.initialState}
          onChange={e => onUpdate({ ...cfg, initialState: e.target.value })}
          className="h-[26px] px-2.5 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none w-[140px]"
        />
      </div>
    </div>
  );
}

// ─── State properties panel ──────────────────────────────────────────────────

function StateProperties({ state, isInitial, onChange, onSetInitial, onDelete }: {
  state: StateNode;
  isInitial: boolean;
  onChange: (patch: Partial<StateNode>) => void;
  onSetInitial: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">State</span>
        <div className="flex items-center gap-1.5">
          {!isInitial && (
            <button type="button" onClick={onSetInitial}
              className="h-[20px] px-2 text-[10px] rounded cursor-pointer border border-[var(--color-surface-border)] text-[var(--color-success)] hover:bg-[rgba(34,197,94,0.1)]">
              Set as initial
            </button>
          )}
          {isInitial && <span className="text-[9px] text-[var(--color-success)] font-medium">▶ initial</span>}
          <button type="button" onClick={onDelete}
            className="h-[20px] px-1.5 rounded cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-error)]">
            <TrashIcon size={11} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-text-muted)] w-[50px]">ID</span>
        <input
          value={state.id}
          onChange={e => onChange({ id: e.target.value })}
          className="h-[26px] px-2.5 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none flex-1"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-text-muted)] w-[50px]">Label</span>
        <input
          value={state.label ?? ''}
          onChange={e => onChange({ label: e.target.value })}
          className="h-[26px] px-2.5 text-[11px] rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none flex-1"
        />
      </div>
    </div>
  );
}

// ─── Transition properties panel ─────────────────────────────────────────────

function TransitionProperties({ transition, states, onChange, onDelete }: {
  transition: StateTransition;
  states: StateNode[];
  onChange: (patch: Partial<StateTransition>) => void;
  onDelete: () => void;
}) {
  const stateIds = states.map(s => s.id);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Transition</span>
        <button type="button" onClick={onDelete}
          className="h-[20px] px-1.5 rounded cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-error)]">
          <TrashIcon size={11} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-text-muted)] w-[50px]">From</span>
        <StateSelect value={transition.from} states={stateIds} onChange={v => onChange({ from: v })} />
        <span className="text-[10px] text-[var(--color-text-muted)]">→</span>
        <StateSelect value={transition.to} states={stateIds} onChange={v => onChange({ to: v })} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-text-muted)] w-[50px]">Trigger</span>
        <input
          value={transition.triggeredByRouteId}
          onChange={e => onChange({ triggeredByRouteId: e.target.value })}
          placeholder="handler id / event name"
          className="h-[26px] px-2.5 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-muted)] placeholder:text-[var(--color-text-muted)] focus:outline-none flex-1"
        />
      </div>
      {(transition as any).condition !== undefined && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-text-muted)] w-[50px]">Condition</span>
          <input
            value={(transition as any).condition ?? ''}
            onChange={e => onChange({ ...(transition as any), condition: e.target.value })}
            placeholder="match pattern / state guard"
            className="h-[26px] px-2.5 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-muted)] placeholder:text-[var(--color-text-muted)] focus:outline-none flex-1"
          />
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function buildInitialPositions(states: StateNode[]): Record<string, NodePos> {
  const pos: Record<string, NodePos> = {};
  states.forEach((s, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    pos[s.id] = { x: 40 + col * 160, y: 60 + row * 120 };
  });
  return pos;
}

function edgeCoords(from: NodePos, to: NodePos) {
  const x1 = from.x + NODE_W / 2;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x + NODE_W / 2;
  const y2 = to.y + NODE_H / 2;
  // Offset endpoints to node edges
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ex1 = x1 + (dx / len) * (NODE_W / 2);
  const ey1 = y1 + (dy / len) * (NODE_H / 2);
  const ex2 = x2 - (dx / len) * (NODE_W / 2 + 6); // 6 for arrowhead
  const ey2 = y2 - (dy / len) * (NODE_H / 2 + 6);
  return { x1: ex1, y1: ey1, x2: ex2, y2: ey2, mx: (ex1 + ex2) / 2, my: (ey1 + ey2) / 2 };
}
