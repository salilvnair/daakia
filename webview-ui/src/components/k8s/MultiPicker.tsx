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

const ACCENT = 'var(--color-dk8s)';

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
          <ButtonView label={busy ? 'Connecting…' : 'Continue'} size="sm" variant="primary"
                      disabled={!checked.length || busy}
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
              className="flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer transition-colors"
              style={{
                background: on ? `color-mix(in srgb, ${ACCENT} 8%, transparent)` : 'transparent',
                border: 'none', borderBottom: '1px solid var(--color-surface-border)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = on ? `color-mix(in srgb, ${ACCENT} 13%, transparent)` : 'var(--color-surface-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = on ? `color-mix(in srgb, ${ACCENT} 8%, transparent)` : 'transparent'; }}
            >
              <Check on={on} />
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className="text-[12.5px] font-mono truncate"
                      style={{ color: on ? ACCENT : 'var(--color-text-primary)' }}>
                  {c.name}
                </span>
                <span className="text-[10.5px] text-[var(--color-text-muted)] truncate">
                  {c.cluster || '—'}{c.user ? ` · ${c.user}` : ''}{c.namespace ? ` · ${c.namespace}` : ''}
                </span>
              </div>
              {c.current && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0"
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

function OfferBlock({
  offer, checked, toggle, manual, setManual, addManual, multiCluster,
}: {
  offer: NamespaceOffer;
  checked: WatchTarget[];
  toggle: (t: WatchTarget) => void;
  manual: string;
  setManual: (v: string) => void;
  addManual: () => void;
  multiCluster: boolean;
}) {
  const [filter, setFilter] = useState('');
  const isOn = (ns: string) => checked.some(t => t.context === offer.context && t.namespace === ns);

  // Pinned first, then the rest — the ones you chose beat the ones you were given.
  const all = useMemo(() => {
    const rest = offer.namespaces.filter(n => !offer.pinned.includes(n));
    return [...offer.pinned, ...rest];
  }, [offer]);

  const shown = filter.trim() ? all.filter(n => n.toLowerCase().includes(filter.toLowerCase())) : all;

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

      <div className="flex items-center gap-3">
        <TextInputView
          value={manual}
          onChange={e => setManual(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') addManual(); }}
          placeholder={offer.fallback || 'type a namespace'}
          size="md"
          accentColor={ACCENT}
          style={{ flex: 1, width: '100%', fontFamily: 'monospace' }}
        />
        <ButtonView label="+  Add and save" size="md" variant="primary"
                    disabled={!manual.trim()} onClick={addManual} />
      </div>

      {offer.forbidden && (
        <p className="text-[11px] m-0 text-[var(--color-text-muted)]">
          This cluster will not list namespaces — normal when your access is scoped to specific ones.
          Type the name and it will be remembered.
        </p>
      )}
      {offer.error && (
        <p className="text-[11px] font-mono m-0" style={{ color: 'var(--color-error)' }}>{offer.error}</p>
      )}

      {all.length > 10 && (
        <SearchInputView value={filter} onChange={setFilter} placeholder="Filter namespaces" size="sm" />
      )}

      {all.length > 0 && (
        <div className="grid gap-1"
             style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          {shown.map(ns => {
            const on = isOn(ns);
            const pinned = offer.pinned.includes(ns);
            return (
              <button
                key={ns}
                type="button"
                onClick={() => toggle({ context: offer.context, namespace: ns })}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left cursor-pointer transition-colors"
                style={{
                  background: on ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : 'var(--color-surface)',
                  border: `1px solid ${on ? `color-mix(in srgb, ${ACCENT} 45%, transparent)` : 'var(--color-surface-border)'}`,
                }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'var(--color-surface)'; }}
              >
                <Check on={on} />
                <span className="text-[11.5px] font-mono truncate flex-1"
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
    offers, selectedContexts, contextResults, targets, setTargets,
    pinNamespace, openContextPicker,
  } = useK8sStore();

  const [checked, setChecked] = useState<WatchTarget[]>(targets);
  const [manual, setManual] = useState<Record<string, string>>({});

  // A cluster that stops being selected must not leave ticks behind.
  useEffect(() => {
    setChecked(prev => prev.filter(t => selectedContexts.includes(t.context)));
  }, [selectedContexts]);

  const multiCluster = selectedContexts.length > 1;
  const unreachable = contextResults.filter(r => !r.reachable.reachable);

  const toggle = (t: WatchTarget) =>
    setChecked(prev =>
      prev.some(x => x.context === t.context && x.namespace === t.namespace)
        ? prev.filter(x => !(x.context === t.context && x.namespace === t.namespace))
        : [...prev, t]);

  const addManual = (context: string) => {
    const ns = (manual[context] ?? '').trim();
    if (!ns) return;
    setManual(m => ({ ...m, [context]: '' }));
    pinNamespace(ns);
    setChecked(prev =>
      prev.some(x => x.context === context && x.namespace === ns) ? prev : [...prev, { context, namespace: ns }]);
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
          <ButtonView label="Watch" size="sm" variant="primary"
                      disabled={!checked.length} onClick={() => setTargets(checked)} />
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

      {offers.map(offer => (
        <OfferBlock
          key={offer.context}
          offer={offer}
          checked={checked}
          toggle={toggle}
          multiCluster={multiCluster}
          manual={manual[offer.context] ?? ''}
          setManual={(v) => setManual(m => ({ ...m, [offer.context]: v }))}
          addManual={() => addManual(offer.context)}
        />
      ))}

      {!offers.length && (
        <span className="text-[12px] text-[var(--color-text-muted)]">Loading namespaces…</span>
      )}
    </Shell>
  );
}
