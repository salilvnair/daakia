/**
 * HeapGraphView — the dominator tree, expanded one level at a time.
 *
 * Never lays out the whole tree: a real dump has tens of millions of nodes and
 * any attempt to render them all is a hang. It starts at the GC roots and
 * fetches children on click, so what is on screen is always what the user
 * actually asked to see.
 *
 * Node width encodes retained bytes on a square-root scale, so a node holding
 * 100× more memory reads as clearly larger without becoming 100× wider.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MarkerType, type Node, type Edge } from '@xyflow/react';
import { RetentionNode, type RetentionNodeData } from './RetentionNode';
import { decodeClassName } from './class-name';
import '@xyflow/react/dist/style.css';
import { heapQuery, bytes, hueFor, type DominatorChild } from './heap-query';

/*
  Sized for the node, which is now a card rather than a line of text.

  These were 260×54, from when a node was one line high. The card is ~250 wide
  and ~92 tall with its header strip, badge row, detail row and bar — so every
  node overlapped the one below it and the columns ran into each other. A
  layout that overlaps is worse than no layout: it hides the very structure the
  view exists to show.
*/
const COL_W = 320;
const ROW_H = 116;

interface Loaded {
  row: number;
  className: string;
  retainedBytes: number;
  childCount: number;
  depth: number;
  parent: number | null;
}

/** Plain, and matching the other analyzer toolbars. */
/** One custom node type, defined once so React Flow does not remount them. */
const NODE_TYPES = { retention: RetentionNode };

const TOOL_BTN: React.CSSProperties = {
  font: 'inherit', fontSize: 10.5, padding: '2px 8px', borderRadius: 5,
  cursor: 'pointer', background: 'var(--color-surface)',
  border: '1px solid var(--color-surface-border)',
  color: 'var(--color-text-muted)',
};

export function HeapGraphView({ liveBytes, onAsk }: {
  liveBytes: number;
  /** Asking about one node, the same gesture the suspects list has. */
  onAsk?: (className: string, retainedBytes: number, sharePercent: number) => void;
}) {
  const [nodesData, setNodesData] = useState<Loaded[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  /*
    Where the reader put things.

    Positions were recomputed from scratch on every render, so expanding one
    node threw away every node anyone had moved — the graph forgot the
    arrangement each time it was used. A node the reader has placed keeps its
    place; nodes they have not touched still get laid out.
  */
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});
  /*
    Freezing the layout.

    Once an arrangement is worth keeping, expanding another node must not
    reflow around it. Locked, new nodes still appear — at their computed
    positions — and nothing that already exists moves.
  */
  const [locked, setLocked] = useState(false);

  const load = useCallback(async (parentRow: number, depth: number) => {
    setBusy(parentRow);
    try {
      const r = await heapQuery<{ row: number; children: DominatorChild[] }>(
        { type: 'children', row: parentRow, limit: 8 },
      );
      setNodesData(prev => {
        const known = new Set(prev.map(n => n.row));
        const added = r.children
          .filter(c => !known.has(c.row))
          .map(c => ({
            row: c.row, className: c.className, retainedBytes: c.retainedBytes,
            childCount: c.childCount, depth, parent: parentRow === -1 ? null : parentRow,
          }));
        return [...prev, ...added];
      });
      setExpanded(prev => new Set(prev).add(parentRow));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => { load(-1, 0); }, [load]);

  const { nodes, edges } = useMemo(() => {
    // Simple layered layout: depth is the column, order within depth the row.
    const byDepth = new Map<number, Loaded[]>();
    for (const n of nodesData) {
      const list = byDepth.get(n.depth) ?? [];
      list.push(n);
      byDepth.set(n.depth, list);
    }

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    for (const [depth, list] of byDepth) {
      list.forEach((n, i) => {
        const share = liveBytes ? n.retainedBytes / liveBytes : 0;
        // Square root, so area rather than width tracks the share.
        const width = 150 + Math.sqrt(share) * 110;
        const collapsed = n.childCount > 0 && !expanded.has(n.row);
        const id = String(n.row);
        /*
          Decoded, not split on dots.

          `[Ljava.lang.Object;` split on '.' gives a name of `Object;` and a
          package of `[Ljava.lang` — both wrong, and both were on screen. The
          shared decoder turns it into `java.lang.Object[]`, which is what the
          histogram has always shown.
        */
        const decodedName = decodeClassName(n.className);
        const simpleName = decodedName.simpleName;
        const decoded = decodedName.packageName ? decodedName.packageName.split('.') : [];
        const data: RetentionNodeData = {
          className: n.className,
          simpleName,
          packageName: decoded.join('.'),
          bytesLabel: bytes(n.retainedBytes),
          sharePercent: share * 100,
          childCount: n.childCount,
          hue: hueFor(n.className),
          // The root of the tree is the suspect the view opened on, and it is
          // drawn as the subject: bigger, bolder, with the retained bar.
          isRoot: n.parent === null,
          /*
            The bar is drawn only where it can be read.

            Every top-level dominator has no parent, so keying the bar on
            "is a root" put a 0.1% sliver under eight nodes — eight lines of
            chrome carrying nothing. At 1% it is a mark you can actually
            compare against the one above it.
          */
          showBar: share * 100 >= 1,
          busy: busy === n.row,
          onAsk: () => onAsk?.(n.className, n.retainedBytes, share * 100),
        };
        nodes.push({
          id,
          type: 'retention',
          // A position the reader chose wins over the computed one.
          position: moved[id] ?? { x: depth * COL_W, y: i * ROW_H },
          data: data as unknown as Record<string, unknown>,
          // Sizing is the node's own business now; React Flow measures it.
          style: { width: undefined },
        });
        if (n.parent !== null) {
          edges.push({
            id: `${n.parent}-${n.row}`,
            source: String(n.parent),
            target: String(n.row),
            // Curved and arrowed: the direction is "holds", and a plain line
            // leaves the reader to work out which end is which.
            type: 'bezier',
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-text-muted)', width: 14, height: 14 },
            style: { stroke: 'var(--color-text-muted)', strokeWidth: 1.4, opacity: 0.55 },
          });
        }
      });
    }
    return { nodes, edges };
  }, [nodesData, expanded, busy, liveBytes, moved]);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    const row = Number(node.id);
    const data = nodesData.find(n => n.row === row);
    if (!data || data.childCount === 0 || expanded.has(row)) return;
    load(row, data.depth + 1);
  }, [nodesData, expanded, load]);

  /** Remembers where a node was dropped, so the next render keeps it there. */
  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    setMoved(m => ({ ...m, [node.id]: { x: node.position.x, y: node.position.y } }));
  }, []);

  const relayout = useCallback(() => { setMoved({}); setLocked(false); }, []);

  /*
    Locking pins where everything is NOW, not just what was dragged.

    Without the snapshot, a node the reader never touched still gets a computed
    position on the next render, so expanding something would slide half the
    graph while the toolbar claimed it was frozen — a control that says it did
    something it did not do.
  */
  const toggleLock = useCallback(() => {
    setLocked(was => {
      if (!was) setMoved(Object.fromEntries(nodes.map(n => [n.id, { ...n.position }])));
      return !was;
    });
  }, [nodes]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-3 py-2 flex-shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="text-[12px] font-semibold font-mono"
              style={{ color: 'var(--color-text-primary)' }}>Retention</span>
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          dominator tree — click a node to open what it holds
        </span>
        <div className="flex-1" />
        {error && <span className="text-[11.5px] text-[var(--color-error)]">{error}</span>}
        {Object.keys(moved).length > 0 && (
          <button type="button" onClick={relayout} style={TOOL_BTN}
                  title="Put every node back where the layout would place it">
            re-layout
          </button>
        )}
        <button type="button" onClick={() => toggleLock()}
                style={{
                  ...TOOL_BTN,
                  color: locked ? 'var(--color-success)' : 'var(--color-text-muted)',
                  borderColor: locked
                    ? 'color-mix(in srgb, var(--color-success) 40%, transparent)'
                    : 'var(--color-surface-border)',
                }}
                title={locked
                  ? 'Positions are frozen — expanding a node will not move anything'
                  : 'Freeze positions, so expanding a node does not rearrange the graph'}>
          {locked ? '🔒 locked' : '🔓 unlocked'}
        </button>
        <span className="text-[11px] text-[var(--color-text-muted)] font-mono tabular-nums">
          {nodesData.length} shown
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <ReactFlow
          nodeTypes={NODE_TYPES}
          nodes={nodes}
          edges={edges}
          onNodeClick={onNodeClick}
          onNodeDragStop={onNodeDragStop}
          // Only on the first layout: re-fitting after every expand undoes the
          // reader's zoom as well as their arrangement.
          fitView={!locked && Object.keys(moved).length === 0}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={!locked}
          nodesConnectable={false}
        >
          <Background color="var(--color-surface-border)" gap={18} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
