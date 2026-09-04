/**
 * The call graph — one node per method, with every caller and callee.
 *
 * The tree keeps paths apart, which is right for "where did the time go" and
 * wrong for "what reaches this method": a utility called from six places is
 * six rows scattered across branches that never meet, and no amount of
 * expanding brings them together.
 *
 * Drawn as a focused view rather than a canvas of four hundred nodes. A
 * method-centric graph is read one method at a time — this one in the middle,
 * who calls it on the left, what it calls on the right — and a node-link
 * diagram of the whole recording is a hairball that answers nothing. Clicking
 * a caller or a callee moves the focus, which is the navigation the question
 * actually has.
 */
import { useMemo, useState } from 'react';

export interface GraphEdge { method: string; count: number }
export interface GraphNode {
  method: string;
  className: string;
  methodName: string;
  line: number;
  self: number;
  total: number;
  callers: GraphEdge[];
  callees: GraphEdge[];
}

function isApp(className: string): boolean {
  return !/^(java|javax|jdk|sun|com\.sun|kotlin|scala)\./.test(className);
}

function short(method: string): { name: string; owner: string } {
  const i = method.lastIndexOf('.');
  return i < 0
    ? { name: method, owner: '' }
    : { name: method.slice(i + 1), owner: method.slice(0, i) };
}

function EdgeList({ title, edges, empty, onPick, align }: {
  title: string;
  edges: GraphEdge[];
  empty: string;
  onPick: (method: string) => void;
  align: 'left' | 'right';
}) {
  const max = Math.max(...edges.map(e => e.count), 1);
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{
        fontSize: 8.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase',
        color: 'var(--color-text-muted)', textAlign: align,
      }}>{title}</div>

      {!edges.length && (
        <div style={{
          fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic', textAlign: align,
        }}>{empty}</div>
      )}

      {edges.slice(0, 12).map(e => {
        const s = short(e.method);
        return (
          <button key={e.method} type="button" onClick={() => onPick(e.method)}
                  title={`${e.method} — on ${e.count.toLocaleString()} samples`}
                  style={{
                    font: 'inherit', cursor: 'pointer', textAlign: align,
                    background: 'transparent', border: 'none', padding: '2px 4px',
                    borderRadius: 4, minWidth: 0, width: '100%',
                    display: 'flex', flexDirection: 'column', gap: 2,
                    alignItems: align === 'right' ? 'flex-end' : 'flex-start',
                  }}>
            <span style={{
              fontFamily: 'ui-monospace, monospace', fontSize: 10.5, maxWidth: '100%',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              color: isApp(s.owner) ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            }}>{s.name}</span>
            <span style={{
              display: 'block', height: 4, borderRadius: 2,
              width: `${Math.max(4, (e.count / max) * 100)}%`,
              background: 'var(--color-dk8s)', opacity: 0.55,
            }} />
          </button>
        );
      })}
    </div>
  );
}

export function CallGraphView({ nodes }: { nodes: GraphNode[] }) {
  const byMethod = useMemo(() => new Map(nodes.map(n => [n.method, n])), [nodes]);
  /*
    Opens on the hottest method rather than on nothing.

    An empty graph with a search box makes the reader guess a method name
    before it will show them anything, and the method they would have picked
    first is the one at the top of the hot spots table anyway.
  */
  const [focus, setFocus] = useState<string | null>(nodes[0]?.method ?? null);

  if (!nodes.length) {
    return (
      <div className="px-2 py-6 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
        No runnable samples to build a graph from.
      </div>
    );
  }

  const node = (focus && byMethod.get(focus)) || nodes[0];
  const total = nodes.reduce((a, n) => Math.max(a, n.total), 1);
  const s = short(node.method);

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="flex items-baseline gap-3 flex-wrap px-1">
        <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          {nodes.length} methods · click a caller or callee to move the focus
        </span>
      </div>

      <div style={{
        display: 'flex', alignItems: 'stretch', gap: 14, padding: '12px 14px',
        border: '1px solid var(--color-surface-border)', borderRadius: 10,
        background: 'var(--color-surface)',
      }}>
        <EdgeList title="callers" edges={node.callers} align="right"
                  empty="nothing above — a thread entry point"
                  onPick={setFocus} />

        {/* ── the focused method ── */}
        <div style={{
          flexShrink: 0, width: 236, display: 'flex', flexDirection: 'column',
          gap: 6, padding: '10px 12px', borderRadius: 9,
          border: `1.4px solid ${isApp(node.className)
            ? 'color-mix(in srgb, var(--color-dk8s) 55%, var(--color-surface-border))'
            : 'var(--color-surface-border)'}`,
          background: 'color-mix(in srgb, var(--color-dk8s) 7%, var(--color-panel))',
        }}>
          <span style={{
            fontFamily: 'ui-monospace, monospace', fontSize: 12.5, fontWeight: 700,
            color: 'var(--color-text-primary)', overflowWrap: 'anywhere',
          }}>{s.name}</span>
          <span style={{
            fontFamily: 'ui-monospace, monospace', fontSize: 9.5,
            color: 'var(--color-text-muted)', overflowWrap: 'anywhere',
          }}>
            {node.className}{node.line >= 0 ? `:${node.line}` : ''}
          </span>

          <div style={{ display: 'flex', gap: 14, marginTop: 2 }}>
            <div>
              <div style={{ fontSize: 8.5, letterSpacing: '.08em', textTransform: 'uppercase',
                            color: 'var(--color-text-muted)' }}>on stack</div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12,
                            color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {node.total.toLocaleString()}
              </div>
            </div>
            <div>
              {/*
                Self is the number that says whether this method is the problem
                or merely on the way to it.
              */}
              <div style={{ fontSize: 8.5, letterSpacing: '.08em', textTransform: 'uppercase',
                            color: 'var(--color-text-muted)' }}>running here</div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12,
                            color: node.self > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)',
                            fontVariantNumeric: 'tabular-nums' }}>
                {node.self.toLocaleString()}
              </div>
            </div>
          </div>

          <span style={{
            display: 'block', height: 5, borderRadius: 3, marginTop: 2,
            background: 'var(--color-surface-hover)', overflow: 'hidden',
          }}>
            <span style={{
              display: 'block', height: '100%', borderRadius: 3,
              width: `${(node.total / total) * 100}%`,
              background: 'var(--color-dk8s)', opacity: 0.6,
            }} />
          </span>
        </div>

        <EdgeList title="callees" edges={node.callees} align="left"
                  empty="nothing below — this is where the sample landed"
                  onPick={setFocus} />
      </div>

      <div style={{ padding: '0 2px', fontSize: 10.5, color: 'var(--color-text-muted)' }}>
        {node.callers.length > 1
          ? <>Reached from {node.callers.length} places — the tree would scatter these across
              branches that never meet, which is the reason this view exists.</>
          : <>One caller, so the tree tells you as much as this does.</>}
      </div>
    </div>
  );
}
