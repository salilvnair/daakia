/**
 * The first-run flow: context, then "is this production?", then namespace.
 *
 * The only wizard in dk8s. Wizards suit genuinely sequential, once-per-setup
 * decisions and nothing else, so after this every one of these choices becomes
 * a control in the breadcrumb that can be changed at any time.
 */
import { useState } from 'react';
import { ButtonView, TextInputView, SearchInputView } from '@salilvnair/dui';
import { useK8sStore, type KubeContext } from '../../store/k8s-store';

const ACCENT = 'var(--color-dk8s)';

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-auto flex justify-center px-6 py-8">
      <div className="flex flex-col gap-4" style={{ maxWidth: 560, width: '100%' }}>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[16px] font-semibold m-0 text-[var(--color-text-primary)]">{title}</h2>
          {subtitle && (
            <p className="text-[12.5px] leading-relaxed m-0 text-[var(--color-text-secondary)]">{subtitle}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function ContextRow({ ctx, onPick, busy }: { ctx: KubeContext; onPick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy}
      className="flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer transition-colors"
      style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--color-surface-border)' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-[12.5px] font-mono text-[var(--color-text-primary)] truncate">{ctx.name}</span>
        <span className="text-[10.5px] text-[var(--color-text-muted)] truncate">
          {ctx.cluster}{ctx.user ? ` · ${ctx.user}` : ''}{ctx.namespace ? ` · ${ctx.namespace}` : ''}
        </span>
      </div>
      {ctx.current && (
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0"
          style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 14%, transparent)` }}
        >
          kubeconfig default
        </span>
      )}
    </button>
  );
}

export function ContextPicker() {
  const { contexts, contextError, busy, useContext: pick } = useK8sStore();
  const [filter, setFilter] = useState('');

  const shown = filter.trim()
    ? contexts.filter(c => `${c.name} ${c.cluster} ${c.user}`.toLowerCase().includes(filter.toLowerCase()))
    : contexts;

  return (
    <Shell
      title="Which cluster?"
      subtitle="dk8s passes this on every command and leaves your kubeconfig alone, so picking here will not repoint terminals you have open elsewhere."
    >
      {contexts.length > 6 && (
        <SearchInputView value={filter} onChange={setFilter} placeholder="Filter contexts" size="sm" />
      )}
      <div
        className="flex flex-col rounded-md overflow-hidden"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}
      >
        {shown.map(c => <ContextRow key={c.name} ctx={c} busy={busy} onPick={() => pick(c.name)} />)}
        {!shown.length && (
          <span className="text-[12px] text-[var(--color-text-muted)] px-3 py-4">No context matches “{filter}”.</span>
        )}
      </div>
      {contextError && (
        <p className="text-[11.5px] m-0" style={{ color: 'var(--color-error)' }}>{contextError}</p>
      )}
    </Shell>
  );
}

/**
 * Asked once per context, and never inferred silently.
 *
 * A cluster called `eu-live-01` matches no `prod` pattern and is absolutely
 * production; `prod-sandbox` matches and is not. The guess only pre-selects.
 */
export function SensitivityPrompt() {
  const { context, sensitivityGuess, setSensitivity } = useK8sStore();
  return (
    <Shell
      title={`Is ${context} a production cluster?`}
      subtitle="Asked once. A production context gets a persistent marker across the panel and requires you to type a pod's name before anything disruptive runs against it."
    >
      {sensitivityGuess && (
        <p className="text-[11.5px] m-0 px-3 py-2 rounded"
           style={{ color: 'var(--color-warning)', background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)' }}>
          The name looks like production — but that is a guess from a string, so it is yours to confirm.
        </p>
      )}
      <div className="flex items-center gap-2">
        <ButtonView label="Yes — treat as production" size="sm" variant="primary"
                    onClick={() => setSensitivity('production')} />
        <ButtonView label="No — dev or test" size="sm" variant="secondary"
                    onClick={() => setSensitivity('normal')} />
      </div>
      <p className="text-[11px] m-0 text-[var(--color-text-muted)]">
        You can change this later from the breadcrumb.
      </p>
    </Shell>
  );
}

export function NamespacePicker() {
  const {
    context, namespaces, namespacesForbidden, namespaceFallback, namespaceError,
    setNamespace,
  } = useK8sStore();
  const [filter, setFilter] = useState('');
  const [manual, setManual] = useState(namespaceFallback ?? '');

  // Listing namespaces is a cluster-scoped read that plenty of enterprise
  // clusters refuse. That is a permission to route around, not a dead end.
  if (namespacesForbidden || (!namespaces.length && namespaceError)) {
    return (
      <Shell
        title="Which namespace?"
        subtitle={namespacesForbidden
          ? 'This cluster does not let you list namespaces — common when you have access inside specific namespaces rather than cluster-wide. Type the one you work in.'
          : 'Could not list namespaces. Type the one you work in.'}
      >
        <div className="flex items-center gap-2">
          <TextInputView value={manual} onChange={e => setManual(e.target.value)} placeholder="payments" size="sm" accentColor={ACCENT} />
          <ButtonView label="Use" size="sm" variant="primary"
                      disabled={!manual.trim()} onClick={() => setNamespace(manual.trim())} />
        </div>
        {namespaceError && (
          <p className="text-[11px] font-mono m-0" style={{ color: 'var(--color-error)' }}>{namespaceError}</p>
        )}
      </Shell>
    );
  }

  const shown = filter.trim()
    ? namespaces.filter(n => n.toLowerCase().includes(filter.toLowerCase()))
    : namespaces;

  return (
    <Shell title="Which namespace?" subtitle={`In ${context}.`}>
      {namespaces.length > 8 && (
        <SearchInputView value={filter} onChange={setFilter} placeholder="Filter namespaces" size="sm" />
      )}
      <div
        className="flex flex-col rounded-md overflow-hidden"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', maxHeight: 360, overflowY: 'auto' }}
      >
        {shown.map(ns => (
          <button
            key={ns}
            type="button"
            onClick={() => setNamespace(ns)}
            className="text-left px-3 py-2 text-[12.5px] font-mono cursor-pointer transition-colors text-[var(--color-text-primary)]"
            style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--color-surface-border)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {ns}
          </button>
        ))}
        {!shown.length && (
          <span className="text-[12px] text-[var(--color-text-muted)] px-3 py-4">Nothing matches “{filter}”.</span>
        )}
      </div>
    </Shell>
  );
}

/** The context was chosen but the API server did not answer. */
export function UnreachableNotice() {
  const { context, reachable, openContextPicker, probe, busy } = useK8sStore();
  return (
    <Shell
      title={`${context} did not answer`}
      subtitle="The context is valid — kubectl could not reach the cluster behind it. A VPN that is not connected is the usual cause."
    >
      {reachable?.error && (
        <pre
          className="text-[11px] font-mono m-0 p-3 rounded overflow-auto"
          style={{ background: 'var(--color-surface-hover)', color: 'var(--color-error)', maxHeight: 160 }}
        >
          {reachable.error}
        </pre>
      )}
      <div className="flex items-center gap-2">
        <ButtonView label={busy ? 'Retrying…' : 'Retry'} size="sm" variant="primary" disabled={busy} onClick={probe} />
        <ButtonView label="Pick another cluster" size="sm" variant="secondary" onClick={openContextPicker} />
      </div>
    </Shell>
  );
}
