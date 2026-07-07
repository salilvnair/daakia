/**
 * MockStateMachineEditor — Visual drag-drop state machine editor.
 *
 * Two-panel layout:
 *   Left: SVG canvas — drag nodes to move, click → handle then click target to connect.
 *   Right: Persistent properties panel — shows context when nothing is selected,
 *          state properties when a node is clicked, transition properties when an arrow
 *          is clicked.
 *
 * Delete/Backspace removes the selected node or edge.
 */
import { useState, useRef, useEffect } from 'react';
import { ButtonView, IconButtonView, TextInputView, SelectInputView, type SelectOption } from '@salilvnair/dui';
import { PlusIcon, TrashIcon, CopyIcon, CheckIcon } from '../../icons';
import type { StateMachineConfig, StateNode, StateTransition } from './mock-types';
import { logUiEvent } from '../../store/ui-audit-store';

const ACCENT = 'var(--color-mock-server)';
const SUCCESS = 'var(--color-success)';
const NODE_W = 132;
const NODE_H = 46;
const CANVAS_W = 760;
const CANVAS_H = 400;

interface NodePos { x: number; y: number; }

function buildInitialPositions(states: StateNode[]): Record<string, NodePos> {
  const out: Record<string, NodePos> = {};
  states.forEach((s, i) => {
    out[s.id] = { x: 60 + (i % 4) * 176, y: 80 + Math.floor(i / 4) * 130 };
  });
  return out;
}

// ─── Per-protocol content ─────────────────────────────────────────────────────

interface SmProtocolConfig {
  whatIsThis: string;
  example: string;
  triggerLabel: string;
  triggerPlaceholder: string;
}

const SM_PROTOCOL: Record<string, SmProtocolConfig> = {
  rest: {
    whatIsThis: 'Makes your REST routes respond differently based on session state.',
    example: 'GET /cart returns empty until POST /cart/add fires — transitioning to has_items where GET /cart returns cart contents.',
    triggerLabel: 'Trigger (method:path)',
    triggerPlaceholder: 'e.g. POST:/cart/add',
  },
  graphql: {
    whatIsThis: 'Makes GraphQL operations return different data depending on prior calls.',
    example: 'getUser returns "pending" until activateUser mutation fires — then getUser returns the active profile.',
    triggerLabel: 'Trigger (operation name)',
    triggerPlaceholder: 'e.g. activateUser',
  },
  grpc: {
    whatIsThis: 'Makes gRPC methods respond differently based on call sequence.',
    example: 'GetOrder returns "processing" until ShipOrder is called — then GetOrder returns "shipped".',
    triggerLabel: 'Trigger (Service.Method)',
    triggerPlaceholder: 'e.g. OrderService.ShipOrder',
  },
  soap: {
    whatIsThis: 'Makes SOAP operations return different responses based on prior calls.',
    example: 'GetBalance returns 0 after CreateAccount — after AddFunds fires, GetBalance returns the deposited amount.',
    triggerLabel: 'Trigger (SOAPAction / operation)',
    triggerPlaceholder: 'e.g. AddFunds',
  },
  websocket: {
    whatIsThis: 'Makes WebSocket message handlers respond differently based on connection state.',
    example: 'type:ping returns "unauthorized" until type:login is received — then ping returns authenticated session data.',
    triggerLabel: 'Trigger (incoming message type)',
    triggerPlaceholder: 'e.g. type:login',
  },
  sse: {
    whatIsThis: 'Changes which events are streamed to clients based on server state.',
    example: 'On connect, stream "idle" heartbeats — after POST:/start fires, transition to "streaming" and push live data events.',
    triggerLabel: 'Trigger (event name or POST endpoint)',
    triggerPlaceholder: 'e.g. connect or POST:/start',
  },
  socketio: {
    whatIsThis: 'Makes Socket.IO event handlers respond differently based on session state.',
    example: 'Messages are ignored until join_room fires — then the session moves to in_room and messages are broadcast.',
    triggerLabel: 'Trigger (Socket.IO event name)',
    triggerPlaceholder: 'e.g. join_room',
  },
  mqtt: {
    whatIsThis: 'Changes which MQTT topics are published based on incoming message state.',
    example: 'devices/+/status publishes "offline" until devices/+/connect fires — then publishes live sensor readings.',
    triggerLabel: 'Trigger (topic pattern)',
    triggerPlaceholder: 'e.g. devices/+/connect',
  },
};

function getSmProtocol(protocol: string): SmProtocolConfig {
  return SM_PROTOCOL[protocol] ?? SM_PROTOCOL.rest!;
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  config?: StateMachineConfig;
  protocol?: string;
  onUpdate: (cfg: StateMachineConfig) => void;
}

export function MockStateMachineEditor({ config, protocol = 'rest', onUpdate }: Props) {
  const cfg: StateMachineConfig = config ?? { initialState: '', states: [], transitions: [] };
  const smCfg = getSmProtocol(protocol);

  const [positions, setPositions] = useState<Record<string, NodePos>>(() => buildInitialPositions(cfg.states));
  const [dragging, setDragging] = useState<{ id: string; ox: number; oy: number } | null>(null);
  const [connecting, setConnecting] = useState<{ fromId: string; mouseX: number; mouseY: number } | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Sync positions when states are added externally
  useEffect(() => {
    setPositions(prev => {
      const next = { ...prev };
      cfg.states.forEach((s, i) => {
        if (!next[s.id]) {
          next[s.id] = { x: 60 + (i % 4) * 176, y: 80 + Math.floor(i / 4) * 130 };
        }
      });
      return next;
    });
  }, [cfg.states]);

  // Delete / Backspace removes selected item
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (selectedNode) doRemoveState(selectedNode);
      else if (selectedEdge) doRemoveTransition(selectedEdge);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode, selectedEdge, cfg]);

  const getSvgPoint = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: e.clientX, y: e.clientY };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const doRemoveState = (id: string) => {
    logUiEvent('mock.sm_del_state', { stateId: id });
    const remaining = cfg.states.filter(s => s.id !== id);
    setPositions(p => { const n = { ...p }; delete n[id]; return n; });
    onUpdate({
      ...cfg,
      states: remaining,
      transitions: cfg.transitions.filter(t => t.from !== id && t.to !== id),
      initialState: cfg.initialState === id ? (remaining[0]?.id ?? '') : cfg.initialState,
    });
    if (selectedNode === id) setSelectedNode(null);
  };

  const doRemoveTransition = (tid: string) => {
    logUiEvent('mock.sm_del_trans', { transitionId: tid });
    onUpdate({ ...cfg, transitions: cfg.transitions.filter(t => t.id !== tid) });
    if (selectedEdge === tid) setSelectedEdge(null);
  };

  const addState = () => {
    logUiEvent('mock.sm_add_state');
    const n = cfg.states.length + 1;
    const id = `state_${n}`;
    const pos = { x: 60 + ((n - 1) % 4) * 176, y: 80 + Math.floor((n - 1) / 4) * 130 };
    setPositions(p => ({ ...p, [id]: pos }));
    const isFirst = cfg.states.length === 0;
    onUpdate({
      ...cfg,
      states: [...cfg.states, { id, label: `State ${n}` }],
      initialState: isFirst ? id : cfg.initialState,
    });
    setSelectedNode(id);
    setSelectedEdge(null);
  };

  const updateState = (id: string, patch: Partial<StateNode>) => {
    const states = cfg.states.map(s => s.id === id ? { ...s, ...patch } : s);
    if (patch.id && patch.id !== id) {
      setPositions(p => { const n = { ...p }; n[patch.id!] = n[id]; delete n[id]; return n; });
      onUpdate({
        ...cfg, states,
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

  const updateTransition = (tid: string, patch: Partial<StateTransition>) => {
    onUpdate({ ...cfg, transitions: cfg.transitions.map(t => t.id === tid ? { ...t, ...patch } : t) });
  };

  // ── Drag ──────────────────────────────────────────────────────────────────────

  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    if (connecting) {
      if (connecting.fromId !== id) {
        const exists = cfg.transitions.some(t => t.from === connecting.fromId && t.to === id);
        if (!exists) {
          logUiEvent('mock.sm_add_trans', { from: connecting.fromId, to: id });
          onUpdate({ ...cfg, transitions: [...cfg.transitions, { id: `tr_${Date.now()}`, from: connecting.fromId, to: id, triggeredByRouteId: '' }] });
        }
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
          x: Math.max(0, Math.min(CANVAS_W - NODE_W - 20, pt.x - dragging.ox)),
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
    if (connecting) setConnecting(null);
  };

  const startConnect = (e: React.PointerEvent, fromId: string) => {
    e.stopPropagation();
    const pt = getSvgPoint(e);
    setConnecting({ fromId, mouseX: pt.x, mouseY: pt.y });
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  const exportJson = () => {
    logUiEvent('mock.sm_export', { stateCount: cfg.states.length, transitionCount: cfg.transitions.length });
    navigator.clipboard.writeText(JSON.stringify(cfg, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const selectedStateData = selectedNode ? cfg.states.find(s => s.id === selectedNode) : null;
  const selectedTransData = selectedEdge ? cfg.transitions.find(t => t.id === selectedEdge) : null;
  const stateOptions: SelectOption[] = cfg.states.map(s => ({ value: s.id, label: s.id }));

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
          {cfg.states.length} states · {cfg.transitions.length} transitions
        </span>
        <ButtonView size="md" variant="ghost" accentColor={ACCENT} iconLeft={<PlusIcon size={11} />} onClick={addState}>
          Add State
        </ButtonView>
        <div className="ml-auto">
          <ButtonView
            size="md"
            variant="ghost"
            accentColor="var(--color-text-muted)"
            iconLeft={copied ? <CheckIcon size={10} /> : <CopyIcon size={10} />}
            onClick={exportJson}
          >
            {copied ? 'Copied!' : 'Export JSON'}
          </ButtonView>
        </div>
      </div>

      {/* Two-panel body */}
      <div className="flex rounded-lg border border-[var(--color-surface-border)] overflow-hidden" style={{ height: 400 }}>

        {/* ── SVG Canvas ─────────────────────────────────────────────────────── */}
        <div className="flex-1 relative" style={{ background: 'var(--color-input-bg)', cursor: connecting ? 'crosshair' : 'default' }}>

          {/* Connect-mode banner */}
          {connecting && (
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full text-[10px] font-medium pointer-events-none select-none"
              style={{
                background: `color-mix(in srgb, ${ACCENT} 15%, var(--color-surface))`,
                color: ACCENT,
                border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)`,
              }}
            >
              Click a state to connect · Esc cancels
            </div>
          )}

          <svg
            ref={svgRef}
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            className="w-full h-full select-none"
            onPointerMove={onSvgPointerMove}
            onPointerUp={onSvgPointerUp}
            onClick={() => { if (!connecting) { setSelectedNode(null); setSelectedEdge(null); } }}
            onKeyDown={e => { if (e.key === 'Escape') setConnecting(null); }}
            tabIndex={0}
          >
            <defs>
              <pattern id="sm-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <circle cx="0.5" cy="0.5" r="0.8" fill="color-mix(in srgb, var(--color-text-primary) 4%, transparent)" />
              </pattern>
              <marker id="sm-arr" markerWidth="7" markerHeight="7" refX="6.5" refY="3.5" orient="auto">
                <path d="M0,0.5 L0,6.5 L6.5,3.5 z" fill="color-mix(in srgb, var(--color-text-primary) 25%, transparent)" />
              </marker>
              <marker id="sm-arr-sel" markerWidth="7" markerHeight="7" refX="6.5" refY="3.5" orient="auto">
                <path d="M0,0.5 L0,6.5 L6.5,3.5 z" fill="var(--color-mock-server)" />
              </marker>
            </defs>
            <rect width={CANVAS_W} height={CANVAS_H} fill="url(#sm-grid)" />

            {/* Transition arrows */}
            {cfg.transitions.map(t => {
              const from = positions[t.from];
              const to = positions[t.to];
              if (!from || !to) return null;
              const isSelected = t.id === selectedEdge;
              const color = isSelected ? 'var(--color-mock-server)' : 'color-mix(in srgb, var(--color-text-primary) 22%, transparent)';

              if (t.from === t.to) {
                // Self-loop arc
                const cx = from.x + NODE_W / 2;
                const cy = from.y;
                const d = `M ${cx - 18} ${cy} C ${cx - 32} ${cy - 52} ${cx + 32} ${cy - 52} ${cx + 18} ${cy}`;
                return (
                  <g key={t.id} onClick={e => { e.stopPropagation(); setSelectedEdge(t.id); setSelectedNode(null); }}>
                    <path d={d} fill="none" stroke="transparent" strokeWidth={12} className="cursor-pointer" />
                    <path d={d} fill="none" stroke={color} strokeWidth={isSelected ? 1.5 : 1}
                      strokeDasharray={isSelected ? undefined : '4 3'}
                      markerEnd={isSelected ? 'url(#sm-arr-sel)' : 'url(#sm-arr)'}
                      className="cursor-pointer"
                    />
                    <text x={cx} y={cy - 38} textAnchor="middle" fontSize={8.5}
                      fill={color} fontFamily="monospace" className="pointer-events-none select-none">
                      {(t.triggeredByRouteId || 'self').slice(0, 16)}
                    </text>
                  </g>
                );
              }

              const x1 = from.x + NODE_W + 18;
              const y1 = from.y + NODE_H / 2;
              const x2 = to.x;
              const y2 = to.y + NODE_H / 2;
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;

              return (
                <g key={t.id} onClick={e => { e.stopPropagation(); setSelectedEdge(t.id); setSelectedNode(null); }}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14} className="cursor-pointer" />
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={color}
                    strokeWidth={isSelected ? 1.5 : 1}
                    strokeDasharray={isSelected ? undefined : '4 3'}
                    markerEnd={isSelected ? 'url(#sm-arr-sel)' : 'url(#sm-arr)'}
                    className="cursor-pointer"
                  />
                  {t.triggeredByRouteId && (
                    <text x={mx} y={my - 7} textAnchor="middle" fontSize={8.5}
                      fill={color} fontFamily="monospace" className="pointer-events-none select-none">
                      {t.triggeredByRouteId.slice(0, 18)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Pending connection line */}
            {connecting && positions[connecting.fromId] && (
              <line
                x1={positions[connecting.fromId].x + NODE_W + 18}
                y1={positions[connecting.fromId].y + NODE_H / 2}
                x2={connecting.mouseX}
                y2={connecting.mouseY}
                stroke="var(--color-mock-server)"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                className="pointer-events-none"
              />
            )}

            {/* State nodes */}
            {cfg.states.map(s => {
              const pos = positions[s.id] ?? { x: 60, y: 80 };
              const isSelected = s.id === selectedNode;
              const isInitial = s.id === cfg.initialState;
              const isConnecting = connecting?.fromId === s.id;
              const nodeColor = isInitial ? SUCCESS : ACCENT;

              return (
                <g
                  key={s.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onPointerDown={e => onNodePointerDown(e, s.id)}
                  style={{ cursor: connecting ? 'crosshair' : dragging?.id === s.id ? 'grabbing' : 'grab' }}
                >
                  {/* Initial state stripe — left edge */}
                  {isInitial && (
                    <rect x={0} y={5} width={3} height={NODE_H - 10} rx={1.5} fill={SUCCESS} />
                  )}

                  {/* Node body */}
                  <rect
                    x={isInitial ? 4 : 0} y={0}
                    width={isInitial ? NODE_W - 4 : NODE_W} height={NODE_H} rx={7}
                    fill={
                      isSelected
                        ? `color-mix(in srgb, ${nodeColor} 16%, var(--color-surface))`
                        : isConnecting
                          ? `color-mix(in srgb, ${ACCENT} 20%, var(--color-surface))`
                          : `color-mix(in srgb, ${nodeColor} 7%, var(--color-input-bg))`
                    }
                    stroke={
                      isSelected || isConnecting
                        ? nodeColor
                        : `color-mix(in srgb, ${nodeColor} 28%, var(--color-surface-border))`
                    }
                    strokeWidth={isSelected ? 1.5 : 1}
                  />

                  {/* Label */}
                  <text
                    x={(isInitial ? NODE_W + 4 : NODE_W) / 2}
                    y={isInitial ? NODE_H / 2 - 4 : (s.label && s.label !== s.id ? NODE_H / 2 - 5 : NODE_H / 2 + 4)}
                    textAnchor="middle" fontSize={10.5}
                    fill={isSelected ? nodeColor : `color-mix(in srgb, ${nodeColor} 75%, var(--color-text-muted))`}
                    fontFamily="monospace"
                    fontWeight={isSelected ? '600' : '500'}
                    className="pointer-events-none select-none"
                  >
                    {(s.label && s.label !== s.id ? s.label : s.id).slice(0, 13)}
                  </text>

                  {/* Sub-label: id when label differs */}
                  {s.label && s.label !== s.id && !isInitial && (
                    <text
                      x={NODE_W / 2} y={NODE_H / 2 + 9}
                      textAnchor="middle" fontSize={8}
                      fill="var(--color-text-muted)"
                      fontFamily="monospace"
                      className="pointer-events-none select-none"
                    >
                      {s.id.slice(0, 15)}
                    </text>
                  )}

                  {/* "▶ initial" badge on node */}
                  {isInitial && (
                    <text
                      x={(NODE_W + 4) / 2} y={NODE_H - 7}
                      textAnchor="middle" fontSize={7.5}
                      fill={SUCCESS}
                      className="pointer-events-none select-none"
                    >
                      ▶ initial
                    </text>
                  )}

                  {/* Connect handle — right side, clearly visible */}
                  <g onPointerDown={e => startConnect(e, s.id)} style={{ cursor: 'crosshair' }}>
                    <rect
                      x={NODE_W} y={NODE_H / 2 - 13} width={20} height={26}
                      rx={5}
                      fill={`color-mix(in srgb, ${nodeColor} 18%, var(--color-surface))`}
                      stroke={`color-mix(in srgb, ${nodeColor} 35%, transparent)`}
                      strokeWidth={1}
                    />
                    <text
                      x={NODE_W + 10} y={NODE_H / 2 + 4}
                      textAnchor="middle" fontSize={11}
                      fill={nodeColor}
                      className="pointer-events-none select-none"
                    >→</text>
                  </g>
                </g>
              );
            })}

            {/* Empty canvas hint */}
            {cfg.states.length === 0 && (
              <>
                <text x={CANVAS_W / 2} y={CANVAS_H / 2 - 14} textAnchor="middle" fontSize={13} fill="color-mix(in srgb, var(--color-text-primary) 12%, transparent)" className="select-none">
                  Click "+ Add State" to create your first state
                </text>
                <text x={CANVAS_W / 2} y={CANVAS_H / 2 + 8} textAnchor="middle" fontSize={10} fill="color-mix(in srgb, var(--color-text-primary) 7%, transparent)" className="select-none">
                  Drag nodes to move · click → handle then click another node to connect
                </text>
              </>
            )}
          </svg>
        </div>

        {/* ── Properties panel ───────────────────────────────────────────────── */}
        <div
          className="flex flex-col overflow-y-auto border-l border-[var(--color-surface-border)]"
          style={{ width: 226, flexShrink: 0, background: 'var(--color-panel)' }}
        >

          {/* Nothing selected → context panel */}
          {!selectedStateData && !selectedTransData && (
            <div className="flex flex-col h-full">
              <div className="px-3 pt-3 pb-2.5 border-b border-[var(--color-surface-border)]">
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: ACCENT }}>
                  What is this?
                </p>
                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                  {smCfg.whatIsThis}
                </p>
                <p className="text-[10px] leading-relaxed mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  {smCfg.example}
                </p>
                <div className="mt-2.5 pt-2 border-t border-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] flex flex-col gap-1">
                  {[
                    ['Drag', 'node body to reposition'],
                    ['Click →', 'handle then click target'],
                    ['Click', 'node or arrow to edit'],
                    ['Del', 'removes selected item'],
                  ].map(([key, desc]) => (
                    <p key={key} className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                      <span className="font-mono font-medium" style={{ color: 'var(--color-text-secondary)' }}>{key}</span>
                      {' '}{desc}
                    </p>
                  ))}
                </div>
              </div>

              {/* State & transition list */}
              <div className="flex-1 overflow-y-auto px-3 pt-2.5 pb-3 flex flex-col gap-1">
                {cfg.states.length === 0 ? (
                  <p className="text-[10px] italic" style={{ color: 'var(--color-text-muted)', opacity: 0.35 }}>No states yet — click + Add State</p>
                ) : (
                  <>
                    <p className="text-[8.5px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--color-text-muted)', opacity: 0.55 }}>
                      States ({cfg.states.length})
                    </p>
                    {cfg.states.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { setSelectedNode(s.id); setSelectedEdge(null); }}
                        className="flex items-center gap-1.5 px-2 py-1.5 rounded text-left w-full transition-colors hover:bg-[color-mix(in_srgb,var(--color-text-primary)_4%,transparent)]"
                      >
                        <div className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                          style={{ background: s.id === cfg.initialState ? SUCCESS : ACCENT }} />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[10px] font-mono truncate" style={{ color: 'var(--color-text-primary)' }}>
                            {s.label && s.label !== s.id ? s.label : s.id}
                          </span>
                          {s.label && s.label !== s.id && (
                            <span className="text-[8.5px] font-mono truncate" style={{ color: 'var(--color-text-muted)' }}>{s.id}</span>
                          )}
                        </div>
                        {s.id === cfg.initialState && (
                          <span className="text-[7.5px] font-medium px-1 py-0.5 rounded flex-shrink-0"
                            style={{ background: 'rgba(34,197,94,0.12)', color: SUCCESS }}>
                            initial
                          </span>
                        )}
                      </button>
                    ))}

                    {cfg.transitions.length > 0 && (
                      <>
                        <p className="text-[8.5px] font-semibold uppercase tracking-wide mt-2 mb-0.5" style={{ color: 'var(--color-text-muted)', opacity: 0.55 }}>
                          Transitions ({cfg.transitions.length})
                        </p>
                        {cfg.transitions.map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => { setSelectedEdge(t.id); setSelectedNode(null); }}
                            className="flex items-center gap-1.5 px-2 py-1.5 rounded text-left w-full transition-colors hover:bg-[color-mix(in_srgb,var(--color-text-primary)_4%,transparent)]"
                          >
                            <span className="text-[9.5px] font-mono truncate" style={{ color: 'var(--color-text-muted)' }}>
                              {t.from} <span style={{ color: ACCENT }}>→</span> {t.to}
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* State selected */}
          {selectedStateData && (
            <div className="flex flex-col gap-3 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: ACCENT }}>State</span>
                <IconButtonView size="sm" icon={<TrashIcon size={11} />} accentColor="var(--color-error)"
                  onClick={() => doRemoveState(selectedStateData.id)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>ID (used in transitions)</label>
                <TextInputView
                  value={selectedStateData.id}
                  onChange={e => updateState(selectedStateData.id, { id: e.target.value })}
                  placeholder="state_id"
                  size="md"
                  style={{ fontFamily: 'monospace', width: '100%' }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>Display label</label>
                <TextInputView
                  value={selectedStateData.label ?? selectedStateData.id}
                  onChange={e => updateState(selectedStateData.id, { label: e.target.value })}
                  placeholder="Human-readable name"
                  size="md"
                  style={{ width: '100%' }}
                />
              </div>
              {cfg.initialState === selectedStateData.id ? (
                <div className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: SUCCESS }}>
                  <span>▶</span>
                  <span>This is the initial state</span>
                </div>
              ) : (
                <ButtonView
                  size="md"
                  variant="ghost"
                  accentColor={SUCCESS}
                  onClick={() => { logUiEvent('mock.sm_initial', { stateId: selectedStateData.id }); onUpdate({ ...cfg, initialState: selectedStateData.id }); }}
                  style={{ width: '100%' }}
                >
                  Set as Initial
                </ButtonView>
              )}
              <div className="pt-1.5 border-t border-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)]">
                <p className="text-[8.5px]" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>
                  {cfg.transitions.filter(t => t.from === selectedStateData.id).length} outgoing ·{' '}
                  {cfg.transitions.filter(t => t.to === selectedStateData.id).length} incoming
                </p>
              </div>
            </div>
          )}

          {/* Transition selected */}
          {selectedTransData && !selectedStateData && (
            <div className="flex flex-col gap-3 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: ACCENT }}>Transition</span>
                <IconButtonView size="sm" icon={<TrashIcon size={11} />} accentColor="var(--color-error)"
                  onClick={() => doRemoveTransition(selectedTransData.id)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>From state</label>
                <SelectInputView
                  value={selectedTransData.from}
                  options={stateOptions}
                  onChange={v => updateTransition(selectedTransData.id, { from: v })}
                  size="md"
                  accentColor={ACCENT}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>To state</label>
                <SelectInputView
                  value={selectedTransData.to}
                  options={stateOptions}
                  onChange={v => updateTransition(selectedTransData.id, { to: v })}
                  size="md"
                  accentColor={ACCENT}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{smCfg.triggerLabel}</label>
                <TextInputView
                  value={selectedTransData.triggeredByRouteId}
                  onChange={e => updateTransition(selectedTransData.id, { triggeredByRouteId: e.target.value })}
                  placeholder={smCfg.triggerPlaceholder}
                  size="md"
                  style={{ fontFamily: 'monospace', width: '100%' }}
                />
                <p className="text-[8.5px] leading-relaxed" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>
                  What fires this transition? Leave empty to never auto-transition.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Initial state footer row */}
      <div className="flex items-center gap-2">
        <span className="text-[9.5px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>Initial state</span>
        <TextInputView
          value={cfg.initialState}
          onChange={e => onUpdate({ ...cfg, initialState: e.target.value })}
          size="md"
          style={{ width: 150, fontFamily: 'monospace' }}
        />
        <span className="text-[9px]" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>
          The session starts here when the mock server boots.
        </span>
      </div>
    </div>
  );
}
