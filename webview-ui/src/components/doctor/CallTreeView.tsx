/**
 * The call tree — where the time went, walked from the entry point down.
 *
 * Hot spots answers "which method burns the CPU", which is the right first
 * question and a bad second one: it flattens every path, so a utility called
 * from six places is one row and nothing says which caller is responsible.
 * Here `parse` under `handleOrder` and `parse` under `healthCheck` are
 * different rows, and the one that matters is obvious from where it sits.
 *
 * The bar is TOTAL, not self. A frame with no self time can still be the
 * answer — it is the branch everything expensive hangs beneath — and a tree
 * that only marked self time would leave that branch invisible all the way
 * down to the leaf that finally does the work.
 */
import { useMemo, useState } from 'react';

export interface CallNode {
  id: string;
  method: string;
  className: string;
  methodName: string;
  line: number;
  self: number;
  total: number;
  children: CallNode[];
}

const ROW_H = 21;
const INDENT = 13;

function isApp(className: string): boolean {
  return !/^(java|javax|jdk|sun|com\.sun|kotlin|scala)\./.test(className);
}

function Row({ node, depth, total, open, toggle }: {
  node: CallNode; depth: number; total: number;
  open: Set<string>; toggle: (id: string) => void;
}) {
  const isOpen = open.has(node.id);
  const pct = total ? (node.total / total) * 100 : 0;
  const selfPct = total ? (node.self / total) * 100 : 0;
  const app = isApp(node.className);

  /*
    Truncation, stated.

    The host drops single-sample paths, so a node can have children the tree
    does not carry. Without saying so, a parent whose children do not sum to
    its total looks like an arithmetic bug.
  */
  const shown = node.children.reduce((a, c) => a + c.total, 0);
  const hidden = node.total - node.self - shown;

  return (
    <>
      <div
        onClick={() => node.children.length && toggle(node.id)}
        title={`${node.method}${node.line >= 0 ? `:${node.line}` : ''} — ${node.total} samples, ${node.self} self`}
        style={{
          height: ROW_H, display: 'flex', alignItems: 'center', gap: 7,
          paddingLeft: 6 + depth * INDENT, paddingRight: 6,
          cursor: node.children.length ? 'pointer' : 'default',
        }}
      >
        <span style={{
          width: 9, flexShrink: 0, fontSize: 8.5,
          color: 'var(--color-text-muted)',
        }}>
          {node.children.length ? (isOpen ? '▾' : '▸') : ''}
        </span>

        <span style={{
          minWidth: 0, flex: 1,
          fontFamily: 'ui-monospace, monospace', fontSize: 10.5,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          color: app ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          fontWeight: app ? 500 : 400,
        }}>
          {node.methodName}
          <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>
            {' · '}{node.className}
          </span>
        </span>

        <span style={{
          width: 96, height: 8, flexShrink: 0, borderRadius: 3,
          background: 'var(--color-surface-hover)', overflow: 'hidden',
          position: 'relative',
        }}>
          <span style={{
            position: 'absolute', inset: 0, width: `${Math.max(0.5, pct)}%`,
            borderRadius: 3, background: 'var(--color-dk8s)', opacity: 0.45,
          }} />
          {/* Self time inside the total, so a leaf that actually burns CPU
              stands out from a branch that merely contains one. */}
          <span style={{
            position: 'absolute', inset: 0, width: `${selfPct}%`,
            borderRadius: 3, background: 'var(--color-warning)', opacity: 0.95,
          }} />
        </span>

        <span style={{
          width: 44, textAlign: 'right', flexShrink: 0,
          fontFamily: 'ui-monospace, monospace', fontSize: 10,
          fontVariantNumeric: 'tabular-nums',
          color: pct >= 10 ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
        }}>{pct.toFixed(1)}%</span>

        <span style={{
          width: 52, textAlign: 'right', flexShrink: 0,
          fontFamily: 'ui-monospace, monospace', fontSize: 10,
          fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-muted)',
        }}>{node.total.toLocaleString()}</span>
      </div>

      {isOpen && node.children.map(c => (
        <Row key={c.id} node={c} depth={depth + 1} total={total} open={open} toggle={toggle} />
      ))}
      {isOpen && hidden > 0 && (
        <div style={{
          height: ROW_H, display: 'flex', alignItems: 'center',
          paddingLeft: 6 + (depth + 1) * INDENT + 16,
          fontSize: 9.5, color: 'var(--color-text-muted)', fontStyle: 'italic',
        }}>
          {hidden.toLocaleString()} more samples in paths seen only once
        </div>
      )}
    </>
  );
}

export function CallTreeView({ roots }: { roots: CallNode[] }) {
  const total = useMemo(() => roots.reduce((a, r) => a + r.total, 0), [roots]);

  /*
    Opened down the hottest path on load.

    A tree that starts fully collapsed makes the reader click eight times
    through JDK frames before reaching anything they wrote, and the first eight
    clicks are the same eight every time. Following the widest child does that
    walk for them, and stops at the branch point where the choice starts to
    matter.
  */
  const [open, setOpen] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    let level = roots;
    for (let i = 0; i < 12 && level.length; i++) {
      const widest = level.reduce((a, b) => (b.total > a.total ? b : a));
      if (!widest.children.length) break;
      ids.add(widest.id);
      level = widest.children;
    }
    return ids;
  });

  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (!roots.length) {
    return (
      <div className="px-2 py-6 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
        No runnable samples in this recording. An application that spends its
        life waiting produces almost none — the Blocking view is where its time
        went.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex items-baseline gap-3 flex-wrap px-1">
        <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          {total.toLocaleString()} runnable samples, by path
        </span>
        <span className="flex-1" />
        <span className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          <span style={{ width: 9, height: 6, borderRadius: 2, background: 'var(--color-dk8s)', opacity: 0.45 }} />
          in this branch
        </span>
        <span className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          <span style={{ width: 9, height: 6, borderRadius: 2, background: 'var(--color-warning)' }} />
          running here
        </span>
      </div>

      <div style={{ overflowY: 'auto', minHeight: 0 }}>
        {roots.map(r => (
          <Row key={r.id} node={r} depth={0} total={total} open={open} toggle={toggle} />
        ))}
      </div>
    </div>
  );
}
