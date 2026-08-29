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
import { Dk8sIcon, EyeIcon } from '../../icons';
import { useK8sStore } from '../../store/k8s-store';
import { KubectlSetupGuide } from './KubectlSetupGuide';
import { SensitivityPrompt, UnreachableNotice } from './ContextPicker';
import { ClusterPicker, NamespaceMultiPicker } from './MultiPicker';
import { PodGrid } from './PodGrid';
import { PodDetail } from './PodDetail';
import { useDk8sAiStore, applyDk8sAiError } from '../../store/dk8s-ai-store';
import { useDk8sDoctorStore } from '../../store/dk8s-doctor-store';
import { useTabsStore } from '../../store/tabs-store';
import { useUiStateStore } from '../../store/ui-state-store';

const ACCENT = 'var(--color-dk8s)';
/** Dimmer tone for anything filled or bordered — see MultiPicker. */
const ACCENT_FILL = 'var(--color-dk8s-muted)';

/**
 * Context and namespace, always visible and always changeable.
 *
 * The first-run flow asks these once; from then on they live here, so nothing
 * the wizard decided is ever locked behind repeating it.
 */
/**
 * Collapse a list of names to something that fits.
 *
 * Names go in full until roughly `max` characters, then the rest become "+3".
 * Truncating each name instead would give three unreadable stubs; showing the
 * first two whole and counting the remainder keeps what the eye can use.
 */
function summarise(names: string[], max = 25): { text: string; more: number; full: string } {
  const full = names.join(', ');
  if (full.length <= max || names.length <= 1) return { text: full, more: 0, full };
  const kept: string[] = [];
  let len = 0;
  for (const n of names) {
    const cost = kept.length ? n.length + 2 : n.length;
    if (kept.length && len + cost > max) break;
    kept.push(n);
    len += cost;
  }
  return { text: kept.join(', '), more: names.length - kept.length, full };
}

function Crumb({ names, onClick, title }: { names: string[]; onClick: () => void; title: string }) {
  const { text, more, full } = summarise(names);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-[12px] font-mono cursor-pointer px-1.5 py-0.5 rounded transition-colors text-[var(--color-text-secondary)]"
      style={{ background: 'transparent', border: 'none', maxWidth: 300 }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      title={more ? `${title}
${full}` : title}
    >
      <span className="truncate">{text || '—'}</span>
      {more > 0 && (
        <span className="text-[10px] font-semibold px-1 py-px rounded flex-shrink-0"
              style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 15%, transparent)` }}>
          +{more}
        </span>
      )}
      <span className="text-[9px] flex-shrink-0 text-[var(--color-text-muted)]">▾</span>
    </button>
  );
}

function Breadcrumb() {
  const {
    context, sensitivity, reachable, targets, selectedContexts,
    openContextPicker, openNamespacePicker, watchStatus,
    stage, pendingTargets, commitPendingTargets,
  } = useK8sStore();
  const isProd = !!context && sensitivity[context] === 'production';

  const clusterNames = selectedContexts.length ? selectedContexts : (context ? [context] : []);
  // De-duplicated: two namespaces in one cluster should not name it twice.
  const namespaceNames = [...new Set(targets.map(t => t.namespace))];

  return (
    <div
      className="flex items-center gap-2 px-4 flex-shrink-0"
      style={{ height: 42, borderBottom: '1px solid var(--color-surface-border)' }}
    >
      <div className="flex items-center justify-center flex-shrink-0" style={{ color: ACCENT }}>
        <Dk8sIcon size={17} strokeWidth={1.8} />
      </div>
      <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">dk8s</span>

      {clusterNames.length > 0 && (
        <>
          <span className="text-[12px] text-[var(--color-text-muted)]">/</span>
          <Crumb names={clusterNames} onClick={openContextPicker} title="Change clusters" />
        </>
      )}

      {namespaceNames.length > 0 && (
        <>
          <span className="text-[12px] text-[var(--color-text-muted)]">/</span>
          <Crumb names={namespaceNames} onClick={openNamespacePicker} title="Change namespaces" />
        </>
      )}

      {/* Only while the namespace picker is open, and it commits exactly what
          the picker's own Watch button commits — the same ticked set, which is
          why that set lives in the store rather than in the picker. Showing it
          the rest of the time made it look like a page-level control. */}
      {stage === 'pick-namespace' && pendingTargets.length > 0 && (
        <button
          type="button"
          onClick={commitPendingTargets}
          title={`Watch the ${pendingTargets.length} selected namespace${pendingTargets.length === 1 ? '' : 's'}`}
          className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md cursor-pointer transition-colors flex-shrink-0"
          style={{
            background: 'transparent',
            border: `1px solid ${watchStatus === 'connected'
              ? `color-mix(in srgb, ${ACCENT_FILL} 40%, transparent)`
              : 'var(--color-surface-border)'}`,
            color: watchStatus === 'connected' ? ACCENT_FILL : 'var(--color-text-muted)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, ${ACCENT_FILL} 14%, transparent)`; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <EyeIcon size={12} strokeWidth={1.8} />
          Watch
        </button>
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
  const detail = useK8sStore(s => s.detail);
  const applyAi = useDk8sAiStore(s => s.apply);
  const applyDoctor = useDk8sDoctorStore(s => s.apply);
  const handoff = useDk8sDoctorStore(s => s.handoff);
  const clearHandoff = useDk8sDoctorStore(s => s.clearHandoff);
  const openDoctorTab = useTabsStore(s => s.openDoctorTab);

  // A collected artifact has been sent to an analyzer, so bring that tab
  // forward. The analyzer is already parsing by the time this runs — the host
  // posts the handoff before it starts, precisely so the tab is on screen for
  // the progress rather than appearing after the result.
  useEffect(() => {
    if (!handoff) return;
    // Select the analyzer BEFORE the tab mounts. A thread dump landing on the
    // heap analyzer's empty state looks exactly like the handoff failed.
    useUiStateStore.getState().setPref('doctor.analyzer', handoff.analyzer);
    openDoctorTab();
    clearHandoff();
  }, [handoff, openDoctorTab, clearHandoff]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      const type = typeof msg?.type === 'string' ? msg.type : '';
      if (!type) return;

      if (type === 'dk8s:aiError') { applyDk8sAiError(msg); return; }

      // AI replies arrive on the shared `ai:` channel, not a dk8s-specific one,
      // so they are routed by tabId inside the store rather than by prefix here.
      if (type.startsWith('ai:')) { applyAi(msg); return; }

      if (!type.startsWith('dk8s:')) return;
      // Collection messages belong to the doctor store; everything else to the
      // pod store. Both are dk8s:-prefixed, so the split is by name.
      if (/^dk8s:(collect|handoff)/.test(type)) applyDoctor(msg);
      else apply(msg);
    };
    window.addEventListener('message', handler);
    probe();
    return () => window.removeEventListener('message', handler);
  }, [apply, probe, applyAi, applyDoctor]);

  return (
    // `relative` so the detail overlay can pin to this panel rather than the
    // whole window — the sidebar and tab bar stay visible and usable.
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
      {/* The breadcrumb only makes sense once there is something to name. */}
      {stage !== 'probing' && stage !== 'no-kubectl' && <Breadcrumb />}

      {stage === 'probing' && <Probing />}
      {stage === 'no-kubectl' && <KubectlSetupGuide mode="no-kubectl" />}
      {stage === 'no-contexts' && <KubectlSetupGuide mode="no-contexts" />}
      {stage === 'pick-context' && <ClusterPicker />}
      {stage === 'unreachable' && <UnreachableNotice />}
      {stage === 'ask-sensitivity' && <SensitivityPrompt />}
      {stage === 'pick-namespace' && <NamespaceMultiPicker />}
      {stage === 'ready' && <PodGrid />}

      {detail && <PodDetail />}
    </div>
  );
}
