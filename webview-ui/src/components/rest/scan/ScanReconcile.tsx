/**
 * What a second scan proposes to do to a collection you already have.
 *
 * ── Why this screen exists at all ──
 *
 * A collection you have worked in is worth more than the scan that made it —
 * you renamed things, filled in real values, added a script. Overwriting that
 * because the code changed would make re-scanning something nobody dares do,
 * and "always make a new collection" leaves you reconciling two of them by
 * hand.
 *
 * So every request gets one of five outcomes, and the two that could lose
 * somebody's work — a conflict and an orphan — are the two that are NOT
 * selected by default. Nothing here is clever: the rules are decided in
 * `reconcile.ts`, which has a test per case, and this screen renders them.
 */
import { useMemo } from 'react';
import { ButtonView } from '@salilvnair/dui';
import { summarise, type Outcome, type Reconciled } from '@daakia/scan-reconcile';

const ACCENT = 'var(--color-sidebar-collections)';

const TONE: Record<Outcome, string> = {
  added: 'var(--color-success)',
  updated: 'var(--color-info)',
  conflict: 'var(--color-warning)',
  orphaned: 'var(--color-text-muted)',
  unchanged: 'var(--color-text-muted)',
};

/** What each outcome means, in the words somebody deciding needs. */
const MEANS: Record<Outcome, string> = {
  added: 'New in the source. Not in this collection yet.',
  updated: 'The code changed and you had not touched these, so there is nothing to lose.',
  conflict: 'The code changed AND you had edited these. Yours is kept unless you take theirs.',
  orphaned: 'No longer in the source. Marked, never deleted — a removed route and a moved file look the same from here.',
  unchanged: 'Neither the code nor the request has changed. Not rewritten, not reordered, not touched.',
};

const ORDER: Outcome[] = ['conflict', 'added', 'updated', 'orphaned', 'unchanged'];

const METHOD_COLOR: Record<string, string> = {
  GET: 'var(--color-method-get)',
  POST: 'var(--color-method-post)',
  PUT: 'var(--color-method-put)',
  PATCH: 'var(--color-method-patch)',
  DELETE: 'var(--color-method-delete)',
};

export function ScanReconcile({
  rows, chosen, onToggle, collectionName, onBack, onApply, applying,
}: {
  rows: Reconciled[];
  /** Identities that will be written. */
  chosen: Set<string>;
  onToggle: (identity: string) => void;
  collectionName: string;
  onBack: () => void;
  onApply: () => void;
  applying: boolean;
}) {
  const counts = useMemo(() => summarise(rows), [rows]);
  const grouped = useMemo(() => {
    const map = new Map<Outcome, Reconciled[]>();
    for (const r of rows) {
      const list = map.get(r.outcome) ?? [];
      list.push(r);
      map.set(r.outcome, list);
    }
    return ORDER.filter(o => map.has(o)).map(o => ({ outcome: o, rows: map.get(o)! }));
  }, [rows]);

  const willWrite = rows.filter(r => chosen.has(r.identity) && r.outcome !== 'orphaned').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div style={{ padding: '14px 18px 10px' }}>
        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>
          {collectionName} already has requests from a scan
        </p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.55, maxWidth: '78ch' }}>
          Matched by method and path, so renaming a request does not orphan it. Nothing is written
          until you press the button, and nothing is ever deleted.
        </p>

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
          {ORDER.filter(o => counts[o] > 0).map(o => (
            <span key={o} style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 5,
              color: TONE[o], background: `color-mix(in srgb, ${TONE[o]} 13%, transparent)`,
              border: `1px solid color-mix(in srgb, ${TONE[o]} 24%, transparent)`,
            }}>{counts[o]} {o}</span>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--color-surface-border)' }}>
        {grouped.map(({ outcome, rows: group }) => (
          <div key={outcome}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px',
              background: 'var(--color-surface)',
              borderBottom: '1px solid var(--color-surface-border)',
              fontSize: 11, color: TONE[outcome], textTransform: 'capitalize',
            }}>
              {outcome}
              <span style={{ marginLeft: 'auto', color: 'var(--color-text-muted)' }}>{group.length}</span>
            </div>
            <div style={{ padding: '7px 14px 9px 14px', fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
              {MEANS[outcome]}
            </div>
            {group.map(r => (
              <Row
                key={r.identity}
                row={r}
                chosen={chosen.has(r.identity)}
                onToggle={() => onToggle(r.identity)}
              />
            ))}
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        borderTop: '1px solid var(--color-surface-border)',
      }}>
        <ButtonView label="Back" size="sm" variant="secondary" onClick={onBack} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
          {willWrite === 0 ? 'Nothing selected' : `${willWrite} to write`}
        </span>
        <ButtonView
          label={applying ? 'Applying…' : 'Apply'}
          size="sm" variant="secondary" accentColor={ACCENT} color={ACCENT}
          disabled={applying || willWrite === 0}
          onClick={onApply}
        />
      </div>
    </div>
  );
}

function Row({ row, chosen, onToggle }: { row: Reconciled; chosen: boolean; onToggle: () => void }) {
  const r = row.next ?? undefined;
  const method = r?.method ?? row.existing?.method ?? '';
  const path = row.identity.replace(/^\w+\s/, '');
  /* An orphan has nothing to write, so the tick would promise something the
     Apply button cannot keep. */
  const selectable = row.outcome !== 'orphaned' && row.outcome !== 'unchanged';

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 14px',
      borderBottom: '1px solid color-mix(in srgb, var(--color-surface-border) 55%, transparent)',
      opacity: row.outcome === 'orphaned' || row.outcome === 'unchanged' ? 0.72 : 1,
    }}>
      <span
        onClick={selectable ? onToggle : undefined}
        style={{
          width: 13, height: 13, borderRadius: 3, marginTop: 2, flexShrink: 0,
          display: 'grid', placeItems: 'center',
          cursor: selectable ? 'pointer' : 'default',
          border: `1.5px solid ${chosen ? ACCENT : 'var(--color-surface-border)'}`,
          background: chosen ? ACCENT : 'transparent',
          visibility: selectable ? 'visible' : 'hidden',
        }}
      >
        {chosen && (
          <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="var(--color-panel)"
               strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.5L4.8 8.8L9.5 3.5" />
          </svg>
        )}
      </span>

      <span style={{
        fontFamily: 'var(--font-mono, monospace)', fontSize: 10, fontWeight: 700,
        color: METHOD_COLOR[method] ?? 'var(--color-text-muted)', minWidth: 46, marginTop: 1,
      }}>{method}</span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{
          fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5,
          color: 'var(--color-text-primary)',
          textDecoration: row.outcome === 'orphaned' ? 'line-through' : undefined,
          overflowWrap: 'anywhere',
        }}>{path}</span>

        {/* What actually differs — the reason this row is a decision. */}
        {row.outcome === 'conflict' && row.changedFields?.length ? (
          <span style={{ fontSize: 10.5, color: 'var(--color-warning)' }}>
            theirs changes {row.changedFields.join(', ')} · yours is kept unless you tick this
          </span>
        ) : null}

        {row.outcome === 'orphaned' && (
          <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>
            kept — remove it yourself if the route really is gone
          </span>
        )}

        {r?.scan.source && row.outcome !== 'orphaned' && (
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
            {r.scan.source}
          </span>
        )}
      </span>
    </div>
  );
}
