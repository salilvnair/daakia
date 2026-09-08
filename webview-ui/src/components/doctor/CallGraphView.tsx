/**
 * The call graph, drawn as a stack.
 *
 * ── Why a stack and not a diagram ──
 *
 * The tree keeps paths apart, which is right for "where did the time go" and
 * wrong for "what reaches this method": a utility called from six places is six
 * rows scattered across branches that never meet, and no amount of expanding
 * brings them together. So this view answers the other question — one method,
 * everything above it, everything below it.
 *
 * The first draft drew that as three columns of cards, callers on the left and
 * callees on the right, which is how a graph tool would do it. It reads badly
 * for the same reason a horizontal stack trace would: a call chain is a
 * vertical thing, everyone who reads Java already reads stacks top-down, and a
 * profiler that prints them sideways is asking its reader to translate.
 *
 * So it is a stack. Callers ascend above the focused frame, callees descend
 * below it, and the whole thing is styled the way the thread dump styles a
 * stack — same origin colours, same `at package.Class.method` shape — because
 * it is the same object and should not look like a different one.
 *
 * ── What it adds over a real stack trace ──
 *
 * A stack trace is one path. This is every path at once: each frame carries how
 * many samples went through it, heat-coloured, and clicking any frame re-roots
 * the view on it. Above the focus that means "of the calls into this method,
 * this many came via here", which is the question a merged stack cannot answer.
 */
import { useMemo, useState } from 'react';
import { originOf, type FrameOrigin } from './thread-frame';
import { heatOfMax } from './heat';

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

/** The thread dump's palette, so the same frame reads the same in both views. */
const ORIGIN_STYLE: Record<FrameOrigin, { color: string; opacity: number }> = {
  app: { color: 'var(--color-dk8s)', opacity: 1 },
  framework: { color: 'var(--color-text-secondary)', opacity: 0.78 },
  jdk: { color: 'var(--color-text-muted)', opacity: 0.62 },
  native: { color: 'var(--color-warning)', opacity: 0.75 },
};

function split(method: string): { owner: string; name: string; pkg: string; cls: string } {
  const i = method.lastIndexOf('.');
  const owner = i < 0 ? '' : method.slice(0, i);
  const name = i < 0 ? method : method.slice(i + 1);
  const j = owner.lastIndexOf('.');
  return {
    owner, name,
    pkg: j < 0 ? '' : owner.slice(0, j),
    cls: j < 0 ? owner : owner.slice(j + 1),
  };
}

/**
 * One line of the stack.
 *
 * `role` decides the gutter mark: callers are what got here, the focus is where
 * you are, callees are where it went. The mark matters more than it looks —
 * without it a fifteen-frame stack with the focus in the middle gives no
 * indication which half is which.
 */
function Frame({ method, count, max, role, onPick, line }: {
  method: string;
  count: number;
  max: number;
  role: 'caller' | 'focus' | 'callee';
  onPick?: (m: string) => void;
  line?: number;
}) {
  const s = split(method);
  const origin = originOf(s.owner);
  const st = ORIGIN_STYLE[origin];
  const heat = heatOfMax(count, max);
  const focused = role === 'focus';

  return (
    <button
      type="button"
      disabled={!onPick}
      onClick={() => onPick?.(method)}
      title={`${method} — ${count.toLocaleString()} samples${focused ? '' : ', click to focus'}`}
      style={{
        font: 'inherit', width: '100%', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: focused ? '7px 10px' : '3px 10px',
        border: 'none', borderRadius: 6,
        cursor: onPick ? 'pointer' : 'default',
        background: focused
          ? 'color-mix(in srgb, var(--color-dk8s) 12%, transparent)'
          : heat.wash,
        borderLeft: focused
          ? '2px solid var(--color-dk8s)'
          : `2px solid ${heat.band === 'critical' || heat.band === 'high' ? heat.color : 'transparent'}`,
        opacity: focused ? 1 : st.opacity,
      }}
    >
      {/* Which direction this frame sits in, relative to the focus. */}
      <span style={{
        width: 12, flexShrink: 0, textAlign: 'center',
        fontSize: 9, color: 'var(--color-text-muted)', opacity: 0.7,
      }}>
        {role === 'caller' ? '↑' : role === 'callee' ? '↓' : '●'}
      </span>

      <span style={{
        flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: focused ? 12 : 10.5,
      }}>
        <span style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>at </span>
        {s.pkg && (
          <span style={{ color: 'var(--color-text-muted)', opacity: 0.55 }}>{s.pkg}.</span>
        )}
        <span style={{ color: st.color, fontWeight: origin === 'app' ? 600 : 400 }}>{s.cls}</span>
        <span style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>.</span>
        <span style={{ color: st.color, fontWeight: focused ? 700 : 400 }}>{s.name}</span>
        {line !== undefined && line >= 0 && (
          <span style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>:{line}</span>
        )}
      </span>

      <span style={{
        width: 74, height: 5, flexShrink: 0, borderRadius: 3,
        background: 'var(--color-surface-hover)', overflow: 'hidden',
      }}>
        <span style={{
          display: 'block', height: '100%', borderRadius: 3,
          width: `${Math.max(3, (count / Math.max(max, 1)) * 100)}%`,
          background: heat.color,
        }} />
      </span>

      <span style={{
        width: 52, textAlign: 'right', flexShrink: 0,
        fontFamily: 'ui-monospace, monospace', fontSize: 10,
        fontVariantNumeric: 'tabular-nums',
        color: heat.band === 'low' ? 'var(--color-text-muted)' : heat.color,
      }}>{count.toLocaleString()}</span>
    </button>
  );
}

export function CallGraphView({ nodes }: { nodes: GraphNode[] }) {
  const byMethod = useMemo(() => new Map(nodes.map(n => [n.method, n])), [nodes]);
  /*
    Opens on the hottest method rather than on nothing. An empty view with a
    search box makes the reader guess a method name before it shows them
    anything, and the one they would guess is the top of the hot spots table.
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

  /* Callers are ranked and reversed so the biggest sits furthest from the
     focus — a stack reads downward into the thing you are looking at. */
  const callers = [...node.callers].sort((a, b) => a.count - b.count).slice(-10);
  const callees = [...node.callees].sort((a, b) => b.count - a.count).slice(0, 10);
  const max = Math.max(node.total, ...callers.map(c => c.count), ...callees.map(c => c.count), 1);

  const heading = (text: string) => (
    <div style={{
      fontSize: 8.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase',
      color: 'var(--color-text-muted)', padding: '6px 10px 3px',
    }}>{text}</div>
  );

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex items-baseline gap-3 flex-wrap px-1">
        <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          {nodes.length} methods · click any frame to re-root the stack on it
        </span>
      </div>

      <div style={{
        border: '1px solid var(--color-surface-border)', borderRadius: 10,
        background: 'var(--color-surface)', padding: '6px 8px 10px',
        display: 'flex', flexDirection: 'column',
      }}>
        {callers.length > 0
          ? heading(`called from · ${node.callers.length} place${node.callers.length === 1 ? '' : 's'}`)
          : heading('nothing above — a thread entry point')}
        {callers.map(c => (
          <Frame key={`up-${c.method}`} method={c.method} count={c.count} max={max}
                 role="caller" onPick={setFocus} />
        ))}

        {heading('here')}
        <Frame method={node.method} count={node.total} max={max} role="focus" line={node.line} />
        {/* Self is the number that says whether this method is the problem or
            merely on the way to it. */}
        <div style={{
          padding: '2px 10px 4px 34px', fontSize: 10,
          color: node.self > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)',
        }}>
          {node.self > 0
            ? `${node.self.toLocaleString()} samples were running here, not below`
            : 'never running here — always on the way to something else'}
        </div>

        {callees.length > 0
          ? heading(`calls into · ${node.callees.length} method${node.callees.length === 1 ? '' : 's'}`)
          : heading('nothing below — this is where the sample landed')}
        {callees.map(c => (
          <Frame key={`down-${c.method}`} method={c.method} count={c.count} max={max}
                 role="callee" onPick={setFocus} />
        ))}
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
