/**
 * Multi-cluster and multi-namespace selection.
 *
 * dk8s watches (cluster, namespace) pairs, and an incident rarely respects
 * either boundary — a service and the queue it feeds routinely live in
 * different namespaces, sometimes in different clusters. Making the user pick
 * one and re-pick is the tool getting in the way.
 *
 * The cap is deliberate: each target is a kubectl child process holding a
 * watch, so ticking forty namespaces would cost the API server more than it
 * gives the reader. Over the cap dk8s watches what it can and says so.
 */
import { useEffect, useMemo, useState } from 'react';
import { ButtonView, SearchInputView, TextInputView } from '@salilvnair/dui';
import { useK8sStore, type WatchTarget, type NamespaceOffer } from '../../store/k8s-store';
import { softPrimary } from './button-style';

const ACCENT = 'var(--color-dk8s)';
/** For filled areas. The same cyan that reads well as a small glyph is
 *  glaring across a whole button, so anything with a solid fill uses the
 *  muted tone and keeps the bright one for strokes and text. */
const ACCENT_FILL = 'var(--color-dk8s-muted)';

function Shell({ title, subtitle, children, footer }: {
  title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-auto flex justify-center px-6 py-8">
        <div className="flex flex-col gap-4" style={{ maxWidth: 620, width: '100%' }}>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[16px] font-semibold m-0 text-[var(--color-text-primary)]">{title}</h2>
            {subtitle && (
              <p className="text-[12.5px] leading-relaxed m-0 text-[var(--color-text-secondary)]">{subtitle}</p>
            )}
          </div>
          {children}
        </div>
      </div>
      {footer && (
        <div className="flex items-center justify-center gap-3 px-6 py-3 flex-shrink-0"
             style={{ borderTop: '1px solid var(--color-surface-border)', background: 'var(--color-panel)' }}>
          <div className="flex items-center gap-3" style={{ maxWidth: 620, width: '100%' }}>{footer}</div>
        </div>
      )}
    </div>
  );
}

/** A square tick that reads as checked at a glance, in the dk8s accent. */
function Check({ on }: { on: boolean }) {
  return (
    <span
      className="flex items-center justify-center flex-shrink-0"
      style={{
        width: 15, height: 15, borderRadius: 4,
        border: `1.5px solid ${on ? ACCENT : 'var(--color-surface-border)'}`,
        background: on ? ACCENT : 'transparent',
        transition: 'all .12s ease',
      }}
    >
      {on && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none"
             stroke="var(--color-panel)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.5L4.8 8.8L9.5 3.5" />
        </svg>
      )}
    </span>
  );
}

// ── Screen 1: clusters ──────────────────────────────────────────────────────

export function ClusterPicker() {
  const { contexts, contextError, busy, selectedContexts, useContexts } = useK8sStore();
  const [filter, setFilter] = useState('');
  const [checked, setChecked] = useState<string[]>(() =>
    selectedContexts.length ? selectedContexts : contexts.filter(c => c.current).map(c => c.name));

  const shown = filter.trim()
    ? contexts.filter(c => `${c.name} ${c.cluster} ${c.user}`.toLowerCase().includes(filter.toLowerCase()))
    : contexts;

  const toggle = (name: string) =>
    setChecked(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);

  return (
    <Shell
      title="Which clusters?"
      subtitle="Tick as many as you need. dk8s passes the context on every command and never touches your kubeconfig, so this cannot repoint a terminal you have open elsewhere."
      footer={
        <>
          <span className="text-[11.5px] text-[var(--color-text-muted)] flex-1">
            {checked.length ? `${checked.length} selected` : 'Nothing selected yet'}
          </span>
          <ButtonView label="Select all" size="sm" variant="secondary"
                      onClick={() => setChecked(contexts.map(c => c.name))} />
          <ButtonView label={busy ? 'Connecting…' : 'Continue'} size="sm" variant="secondary"
                      accentColor={ACCENT_FILL}
                      color={!checked.length || busy ? 'var(--color-text-muted)' : ACCENT}
                      disabled={!checked.length || busy}
                      style={softPrimary(ACCENT, checked.length > 0 && !busy)}
                      onClick={() => useContexts(checked)} />
        </>
      }
    >
      {contexts.length > 6 && (
        <SearchInputView value={filter} onChange={setFilter} placeholder="Filter clusters" size="sm" />
      )}

      <div className="flex flex-col rounded-md overflow-hidden"
           style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
        {shown.map(c => {
          const on = checked.includes(c.name);
          return (
            <button
              key={c.name}
              type="button"
              onClick={() => toggle(c.name)}
              className="flex items-center gap-3.5 px-4 py-4 text-left cursor-pointer transition-colors"
              style={{
                background: on ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--color-surface-border)',
                // Same selected-state rail the namespace rows use, so the two
                // screens read as one flow rather than two designs.
                borderLeft: `2px solid ${on ? ACCENT : 'transparent'}`,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = on ? `color-mix(in srgb, ${ACCENT} 13%, transparent)` : 'var(--color-surface-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = on ? `color-mix(in srgb, ${ACCENT} 8%, transparent)` : 'transparent'; }}
            >
              <Check on={on} />
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <span className="text-[13px] font-mono truncate"
                      style={{ color: on ? ACCENT : 'var(--color-text-primary)' }}>
                  {c.name}
                </span>
                <span className="text-[10.5px] text-[var(--color-text-muted)] truncate">
                  {c.cluster || '—'}{c.user ? ` · ${c.user}` : ''}{c.namespace ? ` · ${c.namespace}` : ''}
                </span>
              </div>
              {c.current && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded flex-shrink-0"
                      style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 14%, transparent)` }}>
                  kubeconfig default
                </span>
              )}
            </button>
          );
        })}
        {!shown.length && (
          <span className="text-[12px] text-[var(--color-text-muted)] px-3 py-4">
            No cluster matches &ldquo;{filter}&rdquo;.
          </span>
        )}
      </div>

      {contextError && (
        <p className="text-[11.5px] m-0" style={{ color: 'var(--color-error)' }}>{contextError}</p>
      )}
    </Shell>
  );
}

// ── Screen 2: namespaces, across every selected cluster ─────────────────────

function OfferBlock({ offer, checked, toggle, query, multiCluster }: {
  offer: NamespaceOffer;
  checked: WatchTarget[];
  toggle: (t: WatchTarget) => void;
  /** The one filter at the top of the screen, shared by every block. */
  query: string;
  multiCluster: boolean;
}) {
  const isOn = (ns: string) => checked.some(t => t.context === offer.context && t.namespace === ns);

  // Pinned first, then the rest — the ones you chose beat the ones you were given.
  const all = useMemo(() => {
    const rest = offer.namespaces.filter(n => !offer.pinned.includes(n));
    return [...offer.pinned, ...rest];
  }, [offer]);

  const shown = query ? all.filter(n => n.toLowerCase().includes(query.toLowerCase())) : all;

  return (
    <div className="flex flex-col gap-2">
      {multiCluster && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono" style={{ color: ACCENT }}>{offer.context}</span>
          <span className="flex-1" style={{ height: 1, background: 'var(--color-surface-border)' }} />
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {offer.forbidden ? 'listing not permitted' : `${offer.namespaces.length}`}
          </span>
        </div>
      )}

      {offer.forbidden && (
        <p className="text-[11px] m-0 text-[var(--color-text-muted)]">
          This cluster will not list namespaces — normal when your access is scoped to specific ones.
          Type the name and it will be remembered.
        </p>
      )}
      {offer.error && (
        <p className="text-[11px] font-mono m-0" style={{ color: 'var(--color-error)' }}>{offer.error}</p>
      )}

      {/* One per row, full width. A three-column grid of short names made the
          eye jump around to read a list it should be able to scan straight
          down, and left most of the width unused anyway. */}
      {!shown.length && !offer.forbidden && (
        <span className="text-[11px] text-[var(--color-text-muted)] px-1 py-1">
          {query ? `Nothing here matches \u201c${query}\u201d.` : 'No namespaces.'}
        </span>
      )}

      {shown.length > 0 && (
        <div className="flex flex-col rounded-md overflow-hidden"
             style={{ border: '1px solid var(--color-surface-border)' }}>
          {shown.map((ns, i) => {
            const on = isOn(ns);
            const pinned = offer.pinned.includes(ns);
            return (
              <button
                key={ns}
                type="button"
                onClick={() => toggle({ context: offer.context, namespace: ns })}
                className="flex items-center gap-3 px-3.5 py-2.5 text-left cursor-pointer transition-colors"
                style={{
                  background: on ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : 'var(--color-surface)',
                  border: 'none',
                  borderBottom: i === shown.length - 1 ? 'none' : '1px solid var(--color-surface-border)',
                  borderLeft: `2px solid ${on ? ACCENT : 'transparent'}`,
                }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'var(--color-surface)'; }}
              >
                <Check on={on} />
                <span className="text-[12px] font-mono truncate flex-1"
                      style={{ color: on ? ACCENT : 'var(--color-text-primary)' }}>
                  {ns}
                </span>
                {pinned && <span className="text-[8.5px] uppercase tracking-wider flex-shrink-0"
                                 style={{ color: ACCENT, opacity: 0.65 }}>saved</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function NamespaceMultiPicker() {
  const {
    offers, selectedContexts, contextResults, pinNamespace, openContextPicker,
    pendingTargets, setPendingTargets, commitPendingTargets,
  } = useK8sStore();

  const checked = pendingTargets;
  const setChecked = (next: WatchTarget[] | ((prev: WatchTarget[]) => WatchTarget[])) =>
    setPendingTargets(typeof next === 'function' ? next(useK8sStore.getState().pendingTargets) : next);
  const [query, setQuery] = useState('');

  // A cluster that stops being selected must not leave ticks behind.
  useEffect(() => {
    const { pendingTargets: p } = useK8sStore.getState();
    const kept = p.filter(t => selectedContexts.includes(t.context));
    if (kept.length !== p.length) setPendingTargets(kept);
  }, [selectedContexts, setPendingTargets]);

  const multiCluster = selectedContexts.length > 1;
  const unreachable = contextResults.filter(r => !r.reachable.reachable);

  const toggle = (t: WatchTarget) =>
    setChecked(prev =>
      prev.some(x => x.context === t.context && x.namespace === t.namespace)
        ? prev.filter(x => !(x.context === t.context && x.namespace === t.namespace))
        : [...prev, t]);

  const trimmed = query.trim();

  /**
   * Clusters where the typed name is not already on offer.
   *
   * With more than one cluster selected, "add this namespace" has to say WHERE
   * — the same name can be missing from one cluster and present in another, and
   * silently adding it everywhere would start watches for namespaces that do
   * not exist.
   */
  const addableTo = trimmed
    ? offers.filter(o => !o.namespaces.some(ns => ns.toLowerCase() === trimmed.toLowerCase())
                      && !o.pinned.some(ns => ns.toLowerCase() === trimmed.toLowerCase()))
    : [];

  const addTo = (context: string) => {
    if (!trimmed) return;
    pinNamespace(trimmed);
    setChecked(prev =>
      prev.some(x => x.context === context && x.namespace === trimmed)
        ? prev
        : [...prev, { context, namespace: trimmed }]);
    setQuery('');
  };

  return (
    <Shell
      title={multiCluster ? 'Which namespaces?' : 'Which namespace?'}
      subtitle={multiCluster
        ? `Across ${selectedContexts.length} clusters. Tick any combination — dk8s watches them together and the grid keeps them apart.`
        : `In ${selectedContexts[0] ?? ''}.`}
      footer={
        <>
          <span className="text-[11.5px] text-[var(--color-text-muted)] flex-1">
            {checked.length ? `${checked.length} namespace${checked.length === 1 ? '' : 's'} selected` : 'Nothing selected yet'}
          </span>
          <ButtonView label="Back" size="sm" variant="secondary" onClick={openContextPicker} />
          <ButtonView label="Watch" size="sm" variant="secondary" accentColor={ACCENT_FILL}
                      color={checked.length ? ACCENT : 'var(--color-text-muted)'}
                      style={softPrimary(ACCENT, checked.length > 0)}
                      disabled={!checked.length} onClick={commitPendingTargets} />
        </>
      }
    >
      {unreachable.length > 0 && (
        <div className="flex flex-col gap-1 px-3 py-2 rounded-md"
             style={{ background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)' }}>
          {unreachable.map(r => (
            <span key={r.context} className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
              <span className="font-mono">{r.context}</span> did not answer — {r.reachable.error}
            </span>
          ))}
        </div>
      )}

      {/* One box for the whole screen. Per-cluster boxes meant three identical
          inputs asking the same question, and you had to pick which one to
          type in before you knew whether the name existed at all. */}
      <TextInputView
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Filter namespaces, or type one that is not listed"
        size="md"
        accentColor={ACCENT}
        style={{ width: '100%', fontFamily: 'monospace' }}
      />

      {addableTo.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 rounded-md"
             style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
          <span className="text-[11.5px] text-[var(--color-text-muted)]">
            <span className="font-mono" style={{ color: 'var(--color-text-primary)' }}>{trimmed}</span>
            {' '}is not listed{multiCluster ? ' in' : ''} —
          </span>
          {addableTo.map(o => (
            <ButtonView
              key={o.context}
              label={multiCluster ? `+  Add to ${o.context}` : '+  Add and save'}
              size="sm" variant="secondary" accentColor={ACCENT_FILL}
              color={ACCENT}
              style={softPrimary(ACCENT)}
              onClick={() => addTo(o.context)}
            />
          ))}
        </div>
      )}

      {offers.map(offer => (
        <OfferBlock
          key={offer.context}
          offer={offer}
          checked={checked}
          toggle={toggle}
          query={trimmed}
          multiCluster={multiCluster}
        />
      ))}

      {!offers.length && (
        <span className="text-[12px] text-[var(--color-text-muted)]">Loading namespaces…</span>
      )}
    </Shell>
  );
}
