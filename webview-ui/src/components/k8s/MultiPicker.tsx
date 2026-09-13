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
import { ButtonView, SearchInputView, TextInputView, FilterInputView,
  ContextMenuView, LoadingStateView, IconSize, type ContextMenuItem,
} from '@salilvnair/dui';
import { LayersIcon } from '../../icons';
import { useK8sStore, type WatchTarget, type NamespaceOffer } from '../../store/k8s-store';
import { postMsg } from '../../vscode';
import { softPrimary } from './button-style';

import { ACCENT, ACCENT_MUTED as ACCENT_FILL } from './tone';
/** For filled areas. The same cyan that reads well as a small glyph is
 *  glaring across a whole button, so anything with a solid fill uses the
 *  muted tone and keeps the bright one for strokes and text. */


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

  /*
    Right-click, on the row it was aimed at.

    One menu rather than controls on every row: all of this is occasional — you
    set a default once a week and copy a name when you are pasting it into a
    terminal — and four buttons per row would bury the thing the screen exists
    for, which is ticking a box.
  */
  const [menu, setMenu] = useState<{ ctx: string; x: number; y: number } | null>(null);
  const current = contexts.find(c => c.current)?.name;

  const menuItems = (ctx: string): ContextMenuItem[] => [
    {
      id: 'only', label: 'Select only this',
      description: 'Untick every other cluster',
      onClick: () => setChecked([ctx]),
    },
    {
      id: 'all', label: 'Select all', onClick: () => setChecked(contexts.map(c => c.name)),
      disabled: checked.length === contexts.length,
    },
    { id: 'none', label: 'Clear selection', onClick: () => setChecked([]),
      disabled: !checked.length },
    { id: 's1', label: '', separator: true },
    {
      id: 'default',
      label: 'Set as kubeconfig default',
      /*
        The one thing on this screen that reaches outside dk8s, which is why it
        says so. dk8s itself does not care — it names the context on every
        command either way — but a bare `kubectl get pods`, a Helm chart or an
        old script all read the default, and setting it from the cluster you are
        already looking at beats switching windows to run one command.
      */
      description: ctx === current
        ? 'Already the default'
        : 'Runs kubectl config use-context. Affects your other tools, not dk8s.',
      disabled: ctx === current,
      onClick: () => postMsg({ type: 'dk8s:setDefaultContext', context: ctx }),
    },
    { id: 's2', label: '', separator: true },
    {
      id: 'copy', label: 'Copy context name',
      onClick: () => navigator.clipboard?.writeText(ctx),
    },
    {
      id: 'copy-cmd', label: 'Copy kubectl command',
      description: `kubectl --context ${ctx} get pods`,
      onClick: () => navigator.clipboard?.writeText(`kubectl --context ${ctx} get pods`),
    },
  ];

  return (
    <Shell
      title="Which clusters?"
      subtitle="Tick as many as you need. dk8s names the context on every command, so nothing here repoints a terminal you have open elsewhere. Right-click a cluster for the one action that deliberately does."
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
        <FilterInputView value={filter} onChange={setFilter} placeholder="Filter clusters" size="sm"
            accentColor={ACCENT} />
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
              onContextMenu={e => {
                e.preventDefault();
                setMenu({ ctx: c.name, x: e.clientX, y: e.clientY });
              }}
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

      <ContextMenuView
        open={!!menu}
        anchorEl={null}
        position={menu ? { x: menu.x, y: menu.y } : undefined}
        items={menu ? menuItems(menu.ctx) : []}
        onClose={() => setMenu(null)}
      />
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

  const { pinNamespace, unpinNamespace } = useK8sStore();
  const [menu, setMenu] = useState<{ ns: string; x: number; y: number } | null>(null);

  /*
    Pinning is the one that earns its place here. A cluster with eighty
    namespaces buries the three you actually watch, and the alternative to a
    pin is scrolling past kube-system every single time.
  */
  const items = (ns: string): ContextMenuItem[] => {
    const pinned = offer.pinned.includes(ns);
    return [
      {
        id: 'only', label: 'Select only this',
        description: multiCluster ? `In ${offer.context}` : undefined,
        onClick: () => {
          const others = checked.filter(t => t.context !== offer.context);
          useK8sStore.getState().setPendingTargets(
            [...others, { context: offer.context, namespace: ns }]);
        },
      },
      {
        id: 'all', label: 'Select every namespace here',
        onClick: () => {
          const others = checked.filter(t => t.context !== offer.context);
          useK8sStore.getState().setPendingTargets([
            ...others,
            ...offer.namespaces.map(n => ({ context: offer.context, namespace: n })),
          ]);
        },
      },
      { id: 's1', label: '', separator: true },
      {
        id: 'pin',
        label: pinned ? 'Unpin from the top' : 'Pin to the top',
        description: pinned ? undefined : 'Kept above the rest, in every cluster this one appears in',
        onClick: () => (pinned ? unpinNamespace(ns) : pinNamespace(ns)),
      },
      { id: 's2', label: '', separator: true },
      { id: 'copy', label: 'Copy namespace name',
        onClick: () => navigator.clipboard?.writeText(ns) },
      {
        id: 'copy-cmd', label: 'Copy kubectl command',
        description: `kubectl --context ${offer.context} -n ${ns} get pods`,
        onClick: () => navigator.clipboard?.writeText(
          `kubectl --context ${offer.context} -n ${ns} get pods`),
      },
    ];
  };

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
                onContextMenu={e => {
                  e.preventDefault();
                  setMenu({ ns, x: e.clientX, y: e.clientY });
                }}
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

      <ContextMenuView
        open={!!menu}
        anchorEl={null}
        position={menu ? { x: menu.x, y: menu.y } : undefined}
        items={menu ? items(menu.ns) : []}
        onClose={() => setMenu(null)}
      />
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

  /*
    Three states, not two.

    "No namespaces yet" was being rendered as "Loading namespaces…", which is
    true exactly once — before the reply arrives. After it, an empty list means
    something specific and actionable: every cluster refused, or they answered
    and hold nothing. Spinning forever on a cluster that already said no is the
    one outcome that tells the reader nothing and gives them nothing to press.
  */
  const heardBack = contextResults.length >= selectedContexts.length
    && selectedContexts.length > 0;
  const allUnreachable = heardBack && unreachable.length === selectedContexts.length;

  /*
    And the fourth state: no answer at all.

    The host bounds its own calls — 15s to check a context, 20s to list
    namespaces — so a reply should always arrive. "Should" is doing work in that
    sentence: a dropped message, a host that died, a kubectl wedged past its
    own timeout, and the screen waits forever on a promise nobody is keeping.

    This is deliberately longer than the host's own bound. Firing first would
    accuse a cluster of being unreachable while the call that would have proved
    otherwise is still in flight, which is worse than the spinner.
  */
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (heardBack) { setTimedOut(false); return; }
    setTimedOut(false);
    const id = window.setTimeout(() => setTimedOut(true), 25_000);
    return () => window.clearTimeout(id);
  }, [heardBack, selectedContexts.join(',')]);

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
        allUnreachable ? (
          /* Every cluster refused. The errors are already named in the banner
             above, so this says what to DO rather than repeating them. */
          <div className="flex flex-col items-center gap-2 py-6 px-4 text-center">
            <span className="text-[12.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {selectedContexts.length === 1
                ? 'That cluster is not answering'
                : 'None of these clusters are answering'}
            </span>
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)', maxWidth: '52ch', lineHeight: 1.6 }}>
              There are no namespaces to choose from until one of them responds. A cluster that
              has been stopped, a VPN that is not up, or a context left over from a cluster that
              no longer exists all look like this.
            </span>
            <div className="flex gap-2 mt-1">
              <ButtonView label="Choose other clusters" size="sm" variant="secondary"
                          accentColor={ACCENT_FILL} color={ACCENT}
                          style={softPrimary(ACCENT)} onClick={openContextPicker} />
              <ButtonView label="Try again" size="sm" variant="secondary"
                          onClick={() => useK8sStore.getState().probe()} />
            </div>
          </div>
        ) : heardBack ? (
          /* Reachable, and genuinely holding nothing — rare, and not an error.
             The filter box above still accepts a name, which is the way out. */
          <span className="text-[12px] text-[var(--color-text-muted)]">
            No namespaces were returned. Type a name above to watch it anyway.
          </span>
        ) : timedOut ? (
          <div className="flex flex-col items-center gap-2 py-6 px-4 text-center">
            <span className="text-[12.5px] font-semibold" style={{ color: 'var(--color-warning)' }}>
              No answer from {selectedContexts.length === 1 ? 'that cluster' : 'these clusters'}
            </span>
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)', maxWidth: '52ch', lineHeight: 1.6 }}>
              kubectl has not replied in 25 seconds. It is usually a cluster that is stopped or
              behind a VPN that is not up — an API server that is merely slow answers well
              inside this.
            </span>
            <div className="flex gap-2 mt-1">
              <ButtonView label="Choose other clusters" size="sm" variant="secondary"
                          accentColor={ACCENT_FILL} color={ACCENT}
                          style={softPrimary(ACCENT)} onClick={openContextPicker} />
              <ButtonView label="Try again" size="sm" variant="secondary"
                          onClick={() => useK8sStore.getState().probe()} />
            </div>
          </div>
        ) : (
          <LoadingStateView
            icon={<LayersIcon size={IconSize.medallion} />}
            title={multiCluster ? 'Reading namespaces' : `Reading namespaces in ${selectedContexts[0] ?? 'the cluster'}`}
            message="One call per cluster, in parallel."
            accentColor={ACCENT}
            /* A cluster in another region answers in seconds rather than
               milliseconds, and the reader cannot tell that from a hang. */
            slowAfterSeconds={6}
            slowMessage="Taking longer than usual. A cluster in another region, or one behind a VPN, answers in seconds rather than milliseconds."
            action={{ label: 'Choose other clusters', onClick: openContextPicker }}
          />
        )
      )}
    </Shell>
  );
}
