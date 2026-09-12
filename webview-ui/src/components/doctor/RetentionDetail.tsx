/**
 * Everything about the node you just clicked.
 *
 * A node on the canvas has room for a name, a size and a share, and that is
 * the right amount: a graph where every node carries a paragraph is a graph
 * nobody can read. But those three facts are rarely enough to decide anything,
 * and the alternative was expanding the node and reading its children — which
 * answers "what is under this" and not "what IS this".
 *
 * So the detail lives beside the canvas, the way the state machine editor puts
 * state properties in a panel rather than inside the state. One panel, always
 * present, describing whatever is selected: the graph stays legible and the
 * depth is one click away instead of unavailable.
 *
 * The headline number here is `retainedClasses` — what this object keeps
 * alive, grouped by class. It is the question a dominator tree exists to
 * answer and the worker has been able to answer it since the heap walker was
 * built; nothing had ever asked.
 */
import { useEffect, useState } from 'react';
import { heapQuery, bytes, hueForShare, type RetainedClasses } from './heap-query';
import { decodeClassName } from './class-name';
import { AskChip } from './AskChip';

export interface DetailSubject {
  row: number;
  className: string;
  retainedBytes: number;
  childCount: number;
  depth: number;
  sharePercent: number;
  /** The chain from the root down to this node, for the "held by" line. */
  path: { row: number; className: string }[];
}

const LABEL: React.CSSProperties = {
  fontSize: 8.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase',
  color: 'var(--color-text-muted)', opacity: 0.7,
};

function Row({ k, v, mono = true }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 10, color: 'var(--color-text-muted)', width: 62, flexShrink: 0 }}>{k}</span>
      <span style={{
        fontSize: 10.5, color: 'var(--color-text-secondary)', minWidth: 0,
        fontFamily: mono ? 'ui-monospace, monospace' : undefined,
        overflowWrap: 'anywhere',
      }}>{v}</span>
    </div>
  );
}

export function RetentionDetail({ subject, onOpenSource, onAsk }: {
  subject: DetailSubject | null;
  onOpenSource?: (className: string) => void;
  /** Ask about the selected node; the graph reads what it holds first. */
  onAsk?: (row: number) => void;
}) {
  const [held, setHeld] = useState<RetainedClasses | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!subject) { setHeld(null); setError(''); return; }
    let cancelled = false;
    setBusy(true); setError(''); setHeld(null);
    heapQuery<RetainedClasses>({ type: 'retainedClasses', row: subject.row, limit: 12 })
      .then(r => { if (!cancelled) setHeld(r); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [subject?.row]);

  if (!subject) {
    return (
      <div style={{ padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={LABEL}>Retention</div>
        <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          The dominator tree: each node holds everything under it alive, so the
          share on a node is the memory that would be freed if it were released.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
          {[
            ['Click', 'a node to see what it holds'],
            ['Click', 'again to close it'],
            ['Drag', 'to move it; scroll to pan'],
            ['Lock', 'freezes the arrangement'],
          ].map(([k, d], i) => (
            <p key={i} style={{ margin: 0, fontSize: 9.5, color: 'var(--color-text-muted)' }}>
              <span style={{
                fontFamily: 'ui-monospace, monospace', fontWeight: 600,
                color: 'var(--color-text-secondary)',
              }}>{k}</span> {d}
            </p>
          ))}
        </div>
      </div>
    );
  }

  const decoded = decodeClassName(subject.className);
  const hue = hueForShare(subject.sharePercent);
  const parent = subject.path.length > 1 ? subject.path[subject.path.length - 2] : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {/* ── identity ── */}
      <div style={{
        padding: '11px 13px 12px',
        borderBottom: '1px solid var(--color-surface-border)',
        display: 'flex', flexDirection: 'column', gap: 9,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: hue, flexShrink: 0 }} />
          <span style={{
            fontFamily: 'ui-monospace, monospace', fontSize: 12.5, fontWeight: 700,
            color: 'var(--color-text-primary)', overflowWrap: 'anywhere', minWidth: 0,
          }}>{decoded.simpleName}</span>
          <span style={{ flex: 1 }} />
          {onAsk && (
            <AskChip label=""
                     title="Explain this class and what it is holding"
                     onClick={() => onAsk(subject.row)} />
          )}
        </div>

        {decoded.packageName && (
          <div style={{
            fontFamily: 'ui-monospace, monospace', fontSize: 9.5,
            color: 'var(--color-text-muted)', overflowWrap: 'anywhere',
          }}>{decoded.packageName}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Row k="retains" v={<span style={{ color: hue, fontWeight: 700 }}>
            {bytes(subject.retainedBytes)} · {subject.sharePercent.toFixed(1)}%
          </span>} />
          <Row k="children" v={subject.childCount.toLocaleString()} />
          <Row k="depth" v={subject.depth === 0 ? 'a top-level dominator' : `${subject.depth} from the root`} />
          {/*
            Who holds it. On a dominator tree the parent is not "a reference to
            this" — it is the object whose release would free this one, which is
            the only relationship that decides whether a leak is fixable here or
            somewhere above.
          */}
          {parent && (
            <Row k="held by" v={decodeClassName(parent.className).simpleName} />
          )}
        </div>

        {onOpenSource && (
          <button type="button"
                  onClick={() => onOpenSource(subject.className)}
                  style={{
                    alignSelf: 'flex-start', font: 'inherit', fontSize: 9.5, cursor: 'pointer',
                    fontFamily: 'ui-monospace, monospace',
                    padding: '2.5px 8px', borderRadius: 5,
                    color: 'var(--color-success)',
                    background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
                    border: '.8px solid color-mix(in srgb, var(--color-success) 30%, transparent)',
                  }}>
            open source
          </button>
        )}
      </div>

      {/* ── what it keeps alive ── */}
      <div style={{ padding: '10px 13px 4px' }}>
        <div style={LABEL}>What it keeps alive</div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 13px 13px' }}>
        {busy && (
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>reading the dump…</div>
        )}
        {error && (
          <div style={{ fontSize: 10, color: 'var(--color-error)' }}>{error}</div>
        )}
        {held && held.rows.length === 0 && (
          <div style={{ fontSize: 10, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
            {/*
              A leaf in the dominator tree. Worth saying rather than showing an
              empty list, because "holds nothing" is a real answer: this object
              is the end of the chain and its own size is all of it.
            */}
            Nothing — this is a leaf. Its {bytes(subject.retainedBytes)} is its own
            size, not a structure it is holding open.
          </div>
        )}
        {held && held.rows.length > 0 && (
          <>
            <div style={{
              fontSize: 9.5, color: 'var(--color-text-muted)', marginBottom: 7,
            }}>
              {held.totalObjects.toLocaleString()} objects, {bytes(held.totalBytes)} in total
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {held.rows.map(r => {
                const share = held.totalBytes ? (r.bytes / held.totalBytes) * 100 : 0;
                const d = decodeClassName(r.className);
                return (
                  <div key={r.className} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{
                        fontFamily: 'ui-monospace, monospace', fontSize: 10,
                        color: 'var(--color-text-secondary)', minWidth: 0,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }} title={d.packageName ? `${d.packageName}.${d.simpleName}` : d.simpleName}>
                        {d.simpleName}
                      </span>
                      <span style={{ flex: 1 }} />
                      <span style={{
                        fontFamily: 'ui-monospace, monospace', fontSize: 9.5,
                        color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums',
                      }}>{r.instances.toLocaleString()} ×</span>
                      <span style={{
                        fontFamily: 'ui-monospace, monospace', fontSize: 9.5,
                        color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums',
                        width: 54, textAlign: 'right',
                      }}>{bytes(r.bytes)}</span>
                    </div>
                    <div style={{
                      height: 3, borderRadius: 2,
                      background: 'var(--color-surface-hover)', overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${Math.max(1, share)}%`, height: '100%', borderRadius: 2,
                        background: `color-mix(in srgb, ${hueForShare(share)} 65%, transparent)`,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
