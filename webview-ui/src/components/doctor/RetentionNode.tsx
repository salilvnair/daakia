/**
 * A retention node, in the state machine editor's visual language.
 *
 * The graph was React Flow's default node: a bordered box with two lines of
 * text in it. Everything it had to say was said in a sentence, so the reader
 * had to read every node to compare any two of them.
 *
 * This is the language used elsewhere in the product, and every part of it
 * carries a value rather than decorating one:
 *
 *   coloured header strip  the class's hue, so a node is identifiable at a
 *                          zoom where the text is unreadable
 *   pill badges            share and child count, read without parsing prose
 *   retained bar           the share again, as a length — the only encoding
 *                          that compares across nodes at a glance
 *   socket handle          where an edge leaves, so the direction of
 *                          "holds" is visible rather than inferred
 *   no chevron             a node with nothing under it does not get a child
 *                          badge, so "expandable" is visible BEFORE clicking
 *
 * There is no source pill on a node, though the mock has one. Resolving a class
 * to a file in the open workspace is a round trip per class, and a graph is
 * dozens of them — so it lives on the leak chain, which is about ONE class and
 * can afford the question. A pill that never filled in would be worse than no
 * pill at all.
 */
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface RetentionNodeData {
  className: string;
  simpleName: string;
  packageName: string;
  bytesLabel: string;
  /** Only the root carries one; a graph row has no object count. */
  objects?: number;
  sharePercent: number;
  childCount: number;
  /** Whether this node's children are currently on the canvas. */
  isExpanded?: boolean;
  hue: string;
  /** The dominator root — opened on, and drawn as the subject. */
  isRoot: boolean;
  /** Whether the share is big enough for the bar to say anything. */
  showBar?: boolean;
  busy?: boolean;
  onAsk?: () => void;
  [key: string]: unknown;
}

function Pill({ colour, children, strong }: {
  colour: string; children: React.ReactNode; strong?: boolean;
}) {
  return (
    <span style={{
      fontFamily: 'ui-monospace, monospace',
      fontSize: 9.5, fontWeight: 700, lineHeight: 1,
      padding: '4px 7px', borderRadius: 9, whiteSpace: 'nowrap',
      color: colour,
      background: `color-mix(in srgb, ${colour} ${strong ? 20 : 12}%, transparent)`,
      border: `.8px solid color-mix(in srgb, ${colour} ${strong ? 45 : 30}%, transparent)`,
    }}>{children}</span>
  );
}

export function RetentionNode({ data, selected }: NodeProps) {
  const d = data as RetentionNodeData;
  const hue = d.hue;
  const root = d.isRoot;

  return (
    <div
      className="dk8s-retention-node"
      style={{
        position: 'relative',
        minWidth: root ? 250 : 210,
        // Capped, or one long inner-class name makes a node three times the
        // width of every other and the columns stop lining up.
        maxWidth: 320,
        borderRadius: 10,
        /*
          The state machine editor's restraint, and for its reason.

          A full-saturation border on every node makes ten nodes shout equally
          and the graph read as decoration. Mixing the hue most of the way into
          the surface leaves the node clearly bounded and quiet; the selected
          one gets the undiluted colour, so at any moment exactly one thing on
          the canvas is at full strength.
        */
        border: `${selected || root ? 1.6 : 1}px solid ${
          selected
            ? hue
            : `color-mix(in srgb, ${hue} ${root ? 55 : 28}%, var(--color-surface-border))`}`,
        background: selected
          ? `color-mix(in srgb, ${hue} 16%, var(--color-surface))`
          : `color-mix(in srgb, ${hue} 7%, var(--color-input-bg))`,
        boxShadow: selected ? `0 0 0 2px color-mix(in srgb, ${hue} 22%, transparent)` : undefined,
        transition: 'border-color .12s ease, background .12s ease, box-shadow .12s ease',
        opacity: d.busy ? 0.5 : 1,
        overflow: 'hidden',
      }}
    >
      {/* The strip, at the same strength as the border rather than full: it
          marks the node at a zoom where the text is unreadable without turning
          the canvas into stripes. */}
      <div style={{
        height: 4,
        background: selected ? hue : `color-mix(in srgb, ${hue} 45%, transparent)`,
      }} />

      <div style={{ padding: '8px 11px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: hue, opacity: selected ? 1 : 0.75,
          }} />
          <span style={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: root ? 14 : 12.5, fontWeight: 700,
            color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{d.simpleName}</span>
          <span style={{ flex: 1 }} />
          <Pill colour={hue} strong>{d.sharePercent.toFixed(1)}%</Pill>
          {/*
            Only when there IS something under it — the absence of this badge is
            what says "nothing to expand" before anyone clicks. The chevron
            points the way the next click goes: right to open, down to close.
            Without it an expanded node looked identical to an unexpanded one
            and there was no way to tell what a click would do.
          */}
          {d.childCount > 0 && (
            <Pill colour={hue} strong={d.isExpanded}>
              {d.isExpanded ? '▾' : '▸'} {d.childCount}
            </Pill>
          )}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 7,
          fontFamily: 'ui-monospace, monospace', fontSize: 10.5,
          color: 'var(--color-text-muted)',
        }}>
          <span>{d.bytesLabel}</span>
          {root && d.objects !== undefined && <span>· {d.objects.toLocaleString()} objects</span>}
          {!root && d.packageName && (
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              · {d.packageName}
            </span>
          )}
          <span style={{ flex: 1 }} />
        </div>

        {/* The share as a length. Two nodes can be compared without reading
            either number. */}
        {d.showBar && (
          <div style={{
            marginTop: 8, height: 7, borderRadius: 4,
            background: 'var(--color-surface-hover)', overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min(100, d.sharePercent)}%`, height: '100%',
              borderRadius: 4, background: hue,
            }} />
          </div>
        )}
      </div>

      {/* Hover actions. Hidden until the pointer is on the node, because a
          graph with two buttons on every node is a graph of buttons. */}
      {d.onAsk && (
        <div className="dk8s-node-actions" style={{
          position: 'absolute', top: 10, right: 8, display: 'flex', gap: 4,
        }}>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); d.onAsk?.(); }}
            style={{
              font: 'inherit', fontSize: 9, fontWeight: 700, cursor: 'pointer',
              padding: '3px 7px', borderRadius: 9,
              color: 'var(--color-protocol-ai, #a97bf0)',
              background: 'color-mix(in srgb, var(--color-protocol-ai, #a97bf0) 22%, var(--color-panel))',
              border: '.8px solid color-mix(in srgb, var(--color-protocol-ai, #a97bf0) 45%, transparent)',
            }}
          >✦ Ask AI</button>
        </div>
      )}

      {/* Sockets. An edge leaves the right and arrives on the left, so "holds"
          reads left to right without a legend. */}
      <Handle type="target" position={Position.Left}
              style={{ width: 9, height: 9, background: 'var(--color-panel)', border: `1.6px solid ${hue}` }} />
      <Handle type="source" position={Position.Right}
              style={{ width: 11, height: 11, background: 'var(--color-panel)', border: `1.6px solid ${hue}` }} />
    </div>
  );
}
