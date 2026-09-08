/**
 * SD-4 — the comparison as a node graph.
 *
 * ── Why a grid and not a force layout ──
 *
 * The task says node graph, and a force simulation was the obvious reading.
 * But these nodes have no edges: an object is in sync or it is not, and nothing
 * connects `users` to `orders` in a schema diff. A force layout with no forces
 * to resolve produces a cloud that lands somewhere different every render,
 * which makes "the red one, top left" — the only way anyone refers to a node —
 * meaningless. Clustered by type in a stable grid, the same schema draws the
 * same picture every time, and the eye finds the red without being told.
 *
 * ── Zoom and pan ──
 *
 * Both are one transform on a group, driven by the wheel and a drag. The SVG
 * itself never resizes, so nothing reflows and the labels stay crisp: text
 * inside a scaled group is scaled type, not smaller type.
 */
import { useMemo, useRef, useState, useCallback } from 'react';
import { IconButtonView, BadgeChipView } from '@salilvnair/dui';
import { PlusIcon, RefreshIcon } from '../../../icons';
import type { SchemaAnomaly, DriftStatus, SchemaObjectType } from '../../../services/schema-diff/schema-diff';

/** The four states a node can be in, and what each one means at a glance. */
export const STATUS_TONE: Record<DriftStatus, { color: string; label: string }> = {
  'in-sync':     { color: 'var(--color-success)', label: 'In sync' },
  'drift':       { color: 'var(--color-warning)', label: 'Drift' },
  'missing':     { color: 'var(--color-error)',   label: 'Missing from target' },
  'target-only': { color: 'var(--color-text-muted)', label: 'Only in target' },
};

const NODE_W = 132;
const NODE_H = 30;
const GAP_X = 14;
const GAP_Y = 8;
const COL_PAD = 18;
const HEAD_H = 30;

interface Placed {
  a: SchemaAnomaly;
  x: number;
  y: number;
}

interface Cluster {
  type: SchemaObjectType;
  x: number;
  width: number;
  height: number;
  nodes: Placed[];
}

/**
 * Lay the objects out in a column per type.
 *
 * Column width follows the biggest cluster's node count so a schema of two
 * hundred tables does not become one column two hundred rows tall — past
 * `perColumn` a type wraps into a second lane of its own.
 */
function layout(anomalies: SchemaAnomaly[], perColumn: number): { clusters: Cluster[]; width: number; height: number } {
  const byType = new Map<SchemaObjectType, SchemaAnomaly[]>();
  for (const a of anomalies) {
    const list = byType.get(a.type) ?? [];
    list.push(a);
    byType.set(a.type, list);
  }

  const clusters: Cluster[] = [];
  let x = 0;
  let tallest = 0;

  for (const [type, list] of byType) {
    const lanes = Math.max(1, Math.ceil(list.length / perColumn));
    const rows = Math.ceil(list.length / lanes);
    const width = lanes * NODE_W + (lanes - 1) * GAP_X;
    const nodes: Placed[] = list.map((a, i) => ({
      a,
      x: x + (i % lanes) * (NODE_W + GAP_X),
      y: HEAD_H + Math.floor(i / lanes) * (NODE_H + GAP_Y),
    }));
    const height = HEAD_H + rows * (NODE_H + GAP_Y);
    clusters.push({ type, x, width, height, nodes });
    tallest = Math.max(tallest, height);
    x += width + COL_PAD * 2;
  }

  return { clusters, width: Math.max(x - COL_PAD * 2, NODE_W), height: Math.max(tallest, NODE_H) };
}

export function SchemaGraphView({ anomalies, selectedKey, onSelect, height = 340 }: {
  anomalies: SchemaAnomaly[];
  selectedKey?: string;
  onSelect: (a: SchemaAnomaly) => void;
  height?: number;
}) {
  const { clusters, width, height: boardH } = useMemo(() => layout(anomalies, 12), [anomalies]);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(2.5, Math.max(0.3, z * (e.deltaY < 0 ? 1.1 : 0.9))));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    /* Only a drag on the background pans; a drag that starts on a node is the
       start of a click, and stealing it would make nodes hard to select. */
    if ((e.target as SVGElement).closest('[data-node]')) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y };
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
  };

  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  if (anomalies.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Nothing to draw yet.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height }}>
      {/* Legend and the zoom controls — the legend is not optional: four
          colours with no key is a decoration. */}
      <div className="flex items-center gap-3 px-1 pb-2 shrink-0 flex-wrap">
        {(Object.keys(STATUS_TONE) as DriftStatus[]).map(s => (
          <span key={s} className="flex items-center gap-1.5">
            <span style={{
              width: 8, height: 8, borderRadius: 2, background: STATUS_TONE[s].color, display: 'inline-block',
            }} />
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{STATUS_TONE[s].label}</span>
          </span>
        ))}
        <span className="flex-1" />
        <BadgeChipView tone="var(--color-text-muted)" size="xs" style={{ textTransform: 'none' }}>
          {Math.round(zoom * 100)}%
        </BadgeChipView>
        <IconButtonView icon={<PlusIcon size={12} />} size="xs" tooltip="Zoom in"
                        onClick={() => setZoom(z => Math.min(2.5, z * 1.2))} />
        <IconButtonView icon={<RefreshIcon size={12} />} size="xs" tooltip="Reset view" onClick={reset} />
      </div>

      <div
        className="flex-1 min-h-0 overflow-hidden rounded"
        style={{ border: '1px solid var(--color-surface-border)', background: 'var(--color-input-bg)' }}
      >
        <svg
          width="100%"
          height="100%"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ cursor: drag.current ? 'grabbing' : 'grab', display: 'block', touchAction: 'none' }}
        >
          <g transform={`translate(${pan.x + 16}, ${pan.y + 12}) scale(${zoom})`}>
            {clusters.map(c => (
              <g key={c.type}>
                <text
                  x={c.x} y={14}
                  style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}
                  fill="var(--color-text-muted)"
                >
                  {c.type} · {c.nodes.length}
                </text>
                <line
                  x1={c.x} y1={20} x2={c.x + c.width} y2={20}
                  stroke="var(--color-surface-border)" strokeWidth={1}
                />
                {c.nodes.map(n => {
                  const tone = STATUS_TONE[n.a.status].color;
                  const on = n.a.key === selectedKey;
                  return (
                    <g
                      key={n.a.key}
                      data-node
                      transform={`translate(${n.x}, ${n.y})`}
                      onClick={() => onSelect(n.a)}
                      style={{ cursor: 'pointer' }}
                    >
                      <title>{`${n.a.type} ${n.a.name} — ${STATUS_TONE[n.a.status].label}`}</title>
                      <rect
                        width={NODE_W} height={NODE_H} rx={5}
                        fill={`color-mix(in srgb, ${tone} ${on ? 30 : 14}%, transparent)`}
                        stroke={tone}
                        strokeWidth={on ? 2 : 1}
                      />
                      {/* A severity stripe on the leading edge, so the state
                          reads even where the fill is faint. */}
                      <rect width={3} height={NODE_H} rx={1.5} fill={tone} />
                      <text
                        x={10} y={NODE_H / 2 + 3.5}
                        style={{ fontSize: 10.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                        fill="var(--color-text-primary)"
                      >
                        {n.a.name.length > 16 ? n.a.name.slice(0, 15) + '…' : n.a.name}
                      </text>
                    </g>
                  );
                })}
              </g>
            ))}
            {/* Keeps the drawing inside the pannable area when it is small. */}
            <rect width={width} height={boardH} fill="none" pointerEvents="none" />
          </g>
        </svg>
      </div>
    </div>
  );
}
