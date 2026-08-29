/**
 * K8sPanel — dk8s.
 *
 * An AI analysis surface for everything a pod can tell you: logs, heap,
 * threads, stacks. Collecting the evidence is how it gets here; reasoning about
 * it is the point. Artifacts feed the Doctor tab's analyzers, which already
 * exist — dk8s is what points them at a cluster.
 *
 * M1 is the way in: find kubectl, choose a cluster and namespace, and never
 * dead-end when a cluster says no.
 */
import { useEffect } from 'react';
import { Dk8sIcon } from '../../icons';
import { useK8sStore } from '../../store/k8s-store';
import { KubectlSetupGuide } from './KubectlSetupGuide';
import { ContextPicker, SensitivityPrompt, NamespacePicker, UnreachableNotice } from './ContextPicker';
import { PodGrid } from './PodGrid';

const ACCENT = 'var(--color-dk8s)';

/**
 * Context and namespace, always visible and always changeable.
 *
 * The first-run flow asks these once; from then on they live here, so nothing
 * the wizard decided is ever locked behind repeating it.
 */
function Breadcrumb() {
  const { context, namespace, sensitivity, reachable, openContextPicker, openNamespacePicker } = useK8sStore();
  const isProd = !!context && sensitivity[context] === 'production';

  return (
    <div
      className="flex items-center gap-2 px-4 flex-shrink-0"
      style={{ height: 42, borderBottom: '1px solid var(--color-surface-border)' }}
    >
      <div className="flex items-center justify-center flex-shrink-0" style={{ color: ACCENT }}>
        <Dk8sIcon size={17} strokeWidth={1.8} />
      </div>
      <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">dk8s</span>

      {context && (
        <>
          <span className="text-[12px] text-[var(--color-text-muted)]">/</span>
          <button
            type="button"
            onClick={openContextPicker}
            className="text-[12px] font-mono cursor-pointer px-1.5 py-0.5 rounded transition-colors text-[var(--color-text-secondary)]"
            style={{ background: 'transparent', border: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            title="Change cluster"
          >
            {context} ▾
          </button>
        </>
      )}

      {namespace && (
        <>
          <span className="text-[12px] text-[var(--color-text-muted)]">/</span>
          <button
            type="button"
            onClick={openNamespacePicker}
            className="text-[12px] font-mono cursor-pointer px-1.5 py-0.5 rounded transition-colors text-[var(--color-text-secondary)]"
            style={{ background: 'transparent', border: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            title="Change namespace"
          >
            {namespace} ▾
          </button>
        </>
      )}

      {/* Production marker. Persistent and unmissable on purpose — every
          operator has run something against prod thinking they were in dev. */}
      {isProd && (
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex-shrink-0"
          style={{ color: 'var(--color-error)', background: 'color-mix(in srgb, var(--color-error) 14%, transparent)' }}
          title="You marked this context as production"
        >
          prod
        </span>
      )}

      <div className="flex-1" />

      {reachable?.serverVersion && (
        <span className="text-[10.5px] font-mono text-[var(--color-text-muted)]">
          k8s {reachable.serverVersion}
        </span>
      )}
    </div>
  );
}

function Probing() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <span className="text-[12px] text-[var(--color-text-muted)]">Looking for kubectl…</span>
    </div>
  );
}

export function K8sPanel() {
  const stage = useK8sStore(s => s.stage);
  const apply = useK8sStore(s => s.apply);
  const probe = useK8sStore(s => s.probe);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (typeof msg?.type === 'string' && msg.type.startsWith('dk8s:')) {
        apply(msg);
      }
    };
    window.addEventListener('message', handler);
    probe();
    return () => window.removeEventListener('message', handler);
  }, [apply, probe]);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* The breadcrumb only makes sense once there is something to name. */}
      {stage !== 'probing' && stage !== 'no-kubectl' && <Breadcrumb />}

      {stage === 'probing' && <Probing />}
      {stage === 'no-kubectl' && <KubectlSetupGuide mode="no-kubectl" />}
      {stage === 'no-contexts' && <KubectlSetupGuide mode="no-contexts" />}
      {stage === 'pick-context' && <ContextPicker />}
      {stage === 'unreachable' && <UnreachableNotice />}
      {stage === 'ask-sensitivity' && <SensitivityPrompt />}
      {stage === 'pick-namespace' && <NamespacePicker />}
      {stage === 'ready' && <PodGrid />}
    </div>
  );
}
