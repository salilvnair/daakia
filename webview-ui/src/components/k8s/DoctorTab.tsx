/**
 * Collecting evidence from a pod.
 *
 * Every action here reaches into a container somebody is depending on, so the
 * panel is built around being honest about that: what each one costs, whether
 * it is available at all in this image and why not, and — for the two that
 * genuinely hurt — a confirmation that names the cost rather than asking
 * "are you sure?".
 */
import { useMemo, useState } from 'react';
import { CopyButtonView, IconSize } from '@salilvnair/dui';
import {
  StethoscopeIcon, SpinnerIcon, CheckCircleIcon, XCircleIcon,
  SparkleIcon, FolderOpenIcon, WarningTriangleIcon, CpuIcon, MemoryIcon,
  TimelineIcon, NetworkIcon, FileTextIcon,
} from '../../icons';
import { useK8sStore, type PodAction } from '../../store/k8s-store';
import { useDk8sAiStore } from '../../store/dk8s-ai-store';
import { type CollectResult, useDk8sDoctorStore, ARTIFACT_META, type ArtifactKind } from '../../store/dk8s-doctor-store';
import { MemoryPanel } from './MemoryPanel';

const ACCENT = 'var(--color-dk8s)';

const ICONS: Record<string, typeof CpuIcon> = {
  threaddump: CpuIcon,
  'threaddump-sigquit': CpuIcon,
  histogram: MemoryIcon,
  heapdump: MemoryIcon,
  jfr: TimelineIcon,
  stackdump: CpuIcon,
  conns: NetworkIcon,
  logs: FileTextIcon,
};

function ActionCard({ action }: { action: PodAction }) {
  const { detail, capabilities, safety, guardHeapDump } = useK8sStore();
  const { running, collect } = useDk8sDoctorStore();
  const [confirming, setConfirming] = useState(false);

  const meta = ARTIFACT_META[action.id];
  const Icon = ICONS[action.id] ?? StethoscopeIcon;
  const busy = running?.kind === action.id;
  const heavy = !!action.disruptive || !!action.mutatesPod;

  // A heap dump on a pod with no headroom is the one action here that can
  // destroy the thing it was meant to diagnose, so the memory verdict overrides
  // "the tooling is present". Blocked, not merely warned about — a warning next
  // to a live button is what people click through at 3am.
  const memoryBlocked = action.id === 'heapdump'
    && guardHeapDump
    && safety?.verdict === 'unsafe';
  const available = action.available && !memoryBlocked;

  // "logs" is listed by the probe for completeness, but the Logs tab already
  // is the log — a button that switches tabs would be noise.
  if (action.id === 'logs') return null;

  const fire = () => {
    // No context means we cannot say WHICH cluster this pod is in, and with
    // multi-cluster watching that is not a detail to guess at — a heap dump
    // taken against the wrong cluster is the exact failure this guards.
    if (!detail?.context) return;
    setConfirming(false);
    collect({
      kind: action.id as ArtifactKind,
      context: detail.context,
      namespace: detail.namespace,
      pod: detail.name,
      targetPid: capabilities?.targetPid,
      useJstack: action.id === 'threaddump' && !capabilities?.jcmd,
      useJmap: action.id === 'heapdump' && !capabilities?.jcmd,
      allowInstall: action.id === 'stackdump',
    });
  };

  return (
    <div className="flex flex-col rounded-lg overflow-hidden"
         style={{
           background: 'var(--color-surface)',
           border: `1px solid ${memoryBlocked
             ? 'color-mix(in srgb, var(--color-error) 32%, transparent)'
             : available
               ? 'var(--color-surface-border)'
               : 'color-mix(in srgb, var(--color-surface-border) 60%, transparent)'}`,
           opacity: available ? 1 : 0.62,
         }}>
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <Icon size={IconSize.row} color={available ? ACCENT : 'var(--color-text-muted)'} />

        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
              {action.label}
            </span>
            {meta && (
              <span className="text-[9.5px] px-1.5 py-0.5 rounded uppercase tracking-wide"
                    style={{
                      background: meta.cost === 'heavy'
                        ? 'color-mix(in srgb, var(--color-error) 14%, transparent)'
                        : meta.cost === 'moderate'
                          ? 'color-mix(in srgb, var(--color-warning) 14%, transparent)'
                          : 'var(--color-surface-hover)',
                      color: meta.cost === 'heavy' ? 'var(--color-error)'
                        : meta.cost === 'moderate' ? 'var(--color-warning)'
                        : 'var(--color-text-muted)',
                    }}>
                {meta.costLabel}
              </span>
            )}
            {action.mutatesPod && (
              <span className="text-[9.5px] px-1.5 py-0.5 rounded uppercase tracking-wide"
                    style={{
                      background: 'color-mix(in srgb, var(--color-warning) 14%, transparent)',
                      color: 'var(--color-warning)',
                    }}>
                changes the pod
              </span>
            )}
          </div>

          <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
            {meta?.what ?? action.reason}
          </span>

          {/* The probe's reason, verbatim. When something is unavailable this
              is the whole answer — "no jcmd, this is a JRE image" tells you
              what to do next; "unavailable" does not. */}
          {!action.available && action.reason && (
            <span className="text-[10.5px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
              {action.reason}
            </span>
          )}

          {memoryBlocked && safety && (
            <span className="text-[10.5px] leading-relaxed" style={{ color: 'var(--color-error)' }}>
              Blocked: {safety.headline} You can turn the guard off in
              {' '}Settings &rsaquo; Advanced &rsaquo; dk8s.
            </span>
          )}
        </div>

        {available && !busy && !confirming && (
          <button
            type="button"
            onClick={() => (heavy ? setConfirming(true) : fire())}
            className="px-2.5 py-1.5 rounded-md text-[11px] cursor-pointer shrink-0"
            style={{
              background: `color-mix(in srgb, ${ACCENT} 16%, transparent)`,
              border: `1px solid color-mix(in srgb, ${ACCENT} 40%, transparent)`,
              color: ACCENT, fontWeight: 600,
            }}
          >
            Collect
          </button>
        )}

        {busy && (
          <span className="flex items-center gap-1.5 text-[11px] shrink-0" style={{ color: ACCENT }}>
            <SpinnerIcon size={IconSize.action} color={ACCENT} />
            working
          </span>
        )}
      </div>

      {/* The confirmation names the cost instead of asking "are you sure?",
          which is a question nobody has ever answered thoughtfully. */}
      {confirming && meta && (
        <div className="flex items-start gap-2.5 px-3 py-2.5"
             style={{
               background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
               borderTop: '1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)',
             }}>
          <WarningTriangleIcon size={IconSize.item} color="var(--color-warning)" />
          <span className="text-[11px] flex-1" style={{ color: 'var(--color-text-secondary)' }}>
            {meta.warning}
          </span>
          <button type="button" onClick={() => setConfirming(false)}
                  className="px-2 py-1 rounded text-[10.5px] cursor-pointer bg-transparent"
                  style={{ border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
            Cancel
          </button>
          <button type="button" onClick={fire}
                  className="px-2 py-1 rounded text-[10.5px] cursor-pointer border-none"
                  style={{ background: 'var(--color-warning)', color: '#1a1205', fontWeight: 600 }}>
            {meta.confirmLabel}
          </button>
        </div>
      )}

      {busy && running?.progress && (
        <div className="flex flex-col gap-1 px-3 py-2"
             style={{ borderTop: '1px solid var(--color-surface-border)' }}>
          <span className="text-[10.5px]" style={{ color: 'var(--color-text-secondary)' }}>
            {running.progress.detail}
          </span>
          <div style={{ height: 3, borderRadius: 2, background: 'var(--color-surface-hover)' }}>
            <div style={{
              height: '100%', borderRadius: 2, background: ACCENT,
              width: running.progress.fraction !== undefined
                ? `${Math.round(running.progress.fraction * 100)}%`
                : '100%',
              opacity: running.progress.fraction !== undefined ? 1 : 0.4,
              transition: 'width .3s ease',
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: CollectResult }) {
  const analyze = useDk8sDoctorStore(s => s.analyze);
  const detail = useK8sStore(s => s.detail);
  const runtime = useK8sStore(s => s.runtime);
  const ask = useDk8sAiStore(s => s.ask);
  const [showText, setShowText] = useState(false);

  if (!result) return null;
  const meta = ARTIFACT_META[result.kind];

  const askAi = () => {
    if (!result.text && !result.file) return;
    ask({
      promptKey: meta?.promptKey ?? 'dk8s.log.askWhy',
      title: `Explain ${meta?.label ?? result.kind}`,
      // A histogram or thread dump can be megabytes; the model gets the head,
      // which is where the answer is in both cases (biggest classes, and the
      // dump header plus the first threads).
      evidence: (result.text ?? '').slice(0, 60_000),
      evidenceLabel: (meta?.label ?? result.kind).toUpperCase(),
      evidenceKind: result.kind,
      podContext: {
        pod: detail?.name, namespace: detail?.namespace,
        phase: detail?.phase, restarts: detail?.restarts,
        runtime: runtime?.runtime,
      },
    });
  };

  return (
    <div className="flex flex-col rounded-lg overflow-hidden"
         style={{
           background: 'var(--color-surface)',
           border: `1px solid ${result.ok
             ? 'color-mix(in srgb, var(--color-success) 28%, transparent)'
             : 'color-mix(in srgb, var(--color-error) 30%, transparent)'}`,
         }}>
      <div className="flex items-center gap-2 px-3 py-2">
        {result.ok
          ? <CheckCircleIcon size={IconSize.item} color="var(--color-success)" />
          : <XCircleIcon size={IconSize.item} color="var(--color-error)" />}
        <span className="text-[11.5px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {meta?.label ?? result.kind}
        </span>
        {result.bytes !== undefined && (
          <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
            {formatBytes(result.bytes)}
          </span>
        )}
        {result.elapsedMs !== undefined && (
          <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
            {(result.elapsedMs / 1000).toFixed(1)}s
          </span>
        )}
        <div className="flex-1" />

        {result.ok && result.text && (
          <button type="button" onClick={askAi}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10.5px] cursor-pointer"
                  style={{
                    background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${ACCENT} 35%, transparent)`,
                    color: ACCENT,
                  }}>
            <SparkleIcon size={IconSize.inline} color={ACCENT} />
            Ask AI
          </button>
        )}

        {result.ok && result.file && (
          <button type="button" onClick={() => analyze(result)}
                  className="px-2 py-1 rounded text-[10.5px] cursor-pointer bg-transparent"
                  style={{ border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)' }}
                  title="Open in the Doctor tab's analyzer">
            Analyze
          </button>
        )}
      </div>

      {result.error && (
        <div className="px-3 py-2 text-[11px]"
             style={{ color: 'var(--color-error)', borderTop: '1px solid var(--color-surface-border)' }}>
          {result.error}
        </div>
      )}

      {result.file && (
        <div className="flex items-center gap-2 px-3 py-1.5"
             style={{ borderTop: '1px solid var(--color-surface-border)' }}>
          <span className="text-[10px] font-mono truncate flex-1" style={{ color: 'var(--color-text-muted)' }}>
            {result.file}
          </span>
          <CopyButtonView text={result.file} size="xs" />
        </div>
      )}

      {result.text && (
        <>
          <button type="button" onClick={() => setShowText(v => !v)}
                  className="px-3 py-1.5 text-[10.5px] cursor-pointer border-none bg-transparent text-left"
                  style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-surface-border)' }}>
            {showText ? 'Hide' : 'Show'} output · {result.text.split('\n').length.toLocaleString()} lines
          </button>
          {showText && (
            <pre className="px-3 py-2 text-[10.5px] font-mono overflow-auto m-0"
                 style={{
                   maxHeight: 320, background: 'var(--color-surface-hover)',
                   color: 'var(--color-text-primary)', whiteSpace: 'pre',
                 }}>
              {result.text}
            </pre>
          )}
        </>
      )}

      {result.command && (
        <div className="flex items-center gap-2 px-3 py-1.5"
             style={{ borderTop: '1px solid var(--color-surface-border)' }}>
          <span className="text-[9.5px] uppercase tracking-wider shrink-0" style={{ color: 'var(--color-text-muted)' }}>
            ran
          </span>
          <code className="text-[10px] font-mono truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>
            {result.command}
          </code>
          <CopyButtonView text={result.command} size="xs" />
        </div>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function DoctorTab() {
  const { actions, probeBusy, capabilities, runtime, detail } = useK8sStore();
  const { results: allResults, reveal } = useDk8sDoctorStore();
  const detailPod = useK8sStore(s => s.detail?.name);

  /*
    Only this pod's artifacts.

    The store keeps one flat list of the last dozen collections, so before this
    every pod's Doctor tab showed every artifact ever collected — open a second
    pod and its tab claimed the first pod's heap dump as its own. Reading the
    wrong pod's thread dump during an incident is exactly the mistake that
    costs an hour.

    Results collected before results carried a pod have no `pod` field; they
    are still shown rather than hidden, since a result that vanishes is worse
    than one attributed loosely.
  */
  const results = useMemo(
    () => allResults.filter(r => !r.pod || !detailPod || r.pod === detailPod),
    [allResults, detailPod],
  );

  if (probeBusy) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <SpinnerIcon size={IconSize.state} color={ACCENT} />
        <span className="text-[12px] text-[var(--color-text-muted)]">
          Looking at what this container has…
        </span>
      </div>
    );
  }

  if (capabilities?.unreachable) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 px-8 text-center">
        <WarningTriangleIcon size={IconSize.state} color="var(--color-warning)" />
        <span className="text-[12px]" style={{ color: 'var(--color-text-primary)' }}>
          dk8s could not run anything inside this container.
        </span>
        <span className="text-[11px] text-[var(--color-text-muted)]">{capabilities.unreachable}</span>
        <span className="text-[11px] text-[var(--color-text-muted)]">
          Logs still work — they come from the API server, not from inside the pod.
        </span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-4 h-full min-h-0">
      {/* What we found in the container, stated plainly. This is the context
          for every "unavailable" below, so it goes first. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2.5 rounded-lg"
           style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
        <div className="flex items-center gap-1.5">
          <StethoscopeIcon size={IconSize.item} color={ACCENT} />
          <span className="text-[11px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {runtime && runtime.runtime !== 'unknown'
              ? `${runtime.runtime} · detected from ${runtime.detectedFrom}`
              : 'runtime not identified'}
          </span>
        </div>
        {capabilities && (
          <div className="flex items-center gap-2.5 flex-wrap">
            {([
              ['shell', !!capabilities.shell, capabilities.shell ?? 'none'],
              ['tar', capabilities.tar, 'tar'],
              ['jcmd', capabilities.jcmd, 'jcmd'],
              ['jstack', capabilities.jstack, 'jstack'],
              ['jmap', capabilities.jmap, 'jmap'],
              ['jfr', capabilities.jfr, 'jfr'],
              ['python3', capabilities.python3, 'python3'],
            ] as [string, boolean, string][])
              .filter(([, , ]) => true)
              .map(([key, present, label]) => (
                <span key={key} className="flex items-center gap-1 text-[10px] font-mono"
                      style={{ color: present ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  <span style={{ opacity: present ? 1 : 0.5 }}>{present ? '✓' : '✗'}</span>
                  {label}
                </span>
              ))}
            {capabilities.targetPid && (
              <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                pid {capabilities.targetPid}
              </span>
            )}
          </div>
        )}
      </div>

      {/* What a dump would cost, before the button that would take one. */}
      <MemoryPanel />

      {actions.filter(a => a.id !== 'logs').length === 0 ? (
        <span className="text-[11.5px] text-[var(--color-text-muted)] py-4 text-center">
          Nothing to collect from a {runtime?.runtime ?? 'container'} beyond its logs.
          {' '}Tag the pod's runtime with the <code className="font-mono">dk8s.daakia/runtime</code> label
          {' '}if this is a JVM or Python workload dk8s did not recognise.
        </span>
      ) : (
        <div className="flex flex-col gap-2">
          {actions.map(a => <ActionCard key={a.id} action={a} />)}
        </div>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              collected
            </span>
            <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
            <button type="button" onClick={reveal}
                    className="flex items-center gap-1 text-[10.5px] cursor-pointer bg-transparent border-none"
                    style={{ color: 'var(--color-text-secondary)' }}>
              <FolderOpenIcon size={IconSize.inline} />
              open folder
            </button>
          </div>
          {results.map((r, i) => <ResultCard key={i} result={r} />)}
        </div>
      )}

      {detail && (
        <span className="text-[10px] text-[var(--color-text-muted)] pb-2">
          Artifacts stay on this machine. Only what you explicitly send with &ldquo;Ask AI&rdquo; leaves it.
        </span>
      )}
    </div>
  );
}
