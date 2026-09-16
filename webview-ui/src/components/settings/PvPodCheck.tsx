/**
 * Settings → DK8S → Logs — "check this against a real pod".
 *
 * Never configure a path blind is the rule the whole PV page is built on, and
 * this is the part that keeps it. The page used to check its paths with `fs`
 * on this machine; asked about `/prodapp-prod-pvc/prodapp_prod_logs` it
 * answered about `C:\prodapp-prod-pvc\prodapp_prod_logs`, which is not a
 * place and not the question. That walk is gone — a claim lives in the
 * cluster, and the only thing that can read it is a pod.
 *
 * So a pod is picked, not typed. Context narrows to namespace narrows to pod,
 * each menu filled from the cluster, and finished CronJob runs are left out:
 * a run that exited cannot answer where an app's logs pile up. Then it reports
 * what that pod mounts and what is really under each configured path, with the
 * command that produced each answer — a check you cannot reproduce by hand is
 * one you have to take on faith.
 */
import { useEffect, useMemo, useState } from 'react';
import { ButtonView, SelectInputView } from '@salilvnair/dui';
import { useK8sStore } from '../../store/k8s-store';
import { useDk8sPvStore } from '../../store/dk8s-pv-store';
import { usePodCheckStore, type CheckedMount } from '../../store/dk8s-pod-check-store';
import { StethoscopeIcon, CheckIcon, CloseIcon, FolderIcon } from '../../icons';

const ACCENT = 'var(--color-dk8s)';

const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-surface-border)',
  maxWidth: '100%',
};

/**
 * One step of the narrowing, as a menu of what is really there.
 *
 * These were three text boxes. A pod name typed from memory is a guess, and a
 * wrong guess does not fail — it comes back with nothing, which is the exact
 * failure this box was built to end. The cluster knows the answer, so the
 * cluster is asked and the answer is the menu.
 */
function Picker({ label, value, options, onChange, disabled, empty, width, busy }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  /** What the menu says when it has nothing to offer — never a blank list. */
  empty: string;
  width?: number | string;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1"
         style={{ width: width ?? undefined, flex: width ? undefined : 1, minWidth: 0 }}>
      <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      <SelectInputView
        value={value}
        options={options}
        onChange={onChange}
        size="sm"
        accentColor={ACCENT}
        width="100%"
        disabled={disabled || busy}
        /* The placeholder says which of three states this is in: nothing
           chosen upstream yet, nothing came back, or still asking. */
        placeholder={busy ? 'loading…' : options.length ? `${label}…` : empty}
        style={{ fontFamily: 'var(--font-mono, monospace)' }}
      />
    </div>
  );
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** What the pod says it has, which is where a configured path should come from. */
function MountRow({ m, configured, onUse }: {
  m: CheckedMount; configured: boolean;
  /** Absent where there is nothing to add it to — a read-only view of the same facts. */
  onUse?: () => void;
}) {
  return (
    <div className="flex items-baseline gap-2 px-3 py-1.5"
         style={{ borderBottom: '1px solid color-mix(in srgb, var(--color-surface-border) 55%, transparent)' }}>
      <code className="text-[11px]" style={{
        fontFamily: 'var(--font-mono, monospace)',
        color: m.likelyLogs ? ACCENT : 'var(--color-text-primary)',
        overflowWrap: 'anywhere',
      }}>{m.path}</code>
      <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{
        color: 'var(--color-text-muted)',
        background: 'color-mix(in srgb, var(--color-text-muted) 10%, transparent)',
      }}>{m.kind}{m.claim ? ` · ${m.claim}` : ''}</span>
      {m.readOnly && (
        <span className="text-[10px] shrink-0" style={{ color: 'var(--color-text-muted)' }}>read-only</span>
      )}
      <span className="flex-1" />
      {m.likelyLogs && !configured && (
        <span className="text-[10px] shrink-0" style={{ color: ACCENT }}>likely logs</span>
      )}
      {configured ? (
        <span className="text-[10px] shrink-0 flex items-center gap-1" style={{ color: 'var(--color-success)' }}>
          <CheckIcon size={10} /> configured
        </span>
      ) : onUse ? (
        <button
          type="button"
          onClick={onUse}
          className="text-[10px] px-1.5 py-0.5 rounded shrink-0 cursor-pointer"
          style={{
            color: ACCENT,
            background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${ACCENT} 28%, transparent)`,
          }}
        >
          Use this
        </button>
      ) : null}
    </div>
  );
}

export function PvPodCheck() {
  const storeContext = useK8sStore(s => s.context);
  const storeNamespace = useK8sStore(s => s.namespace);
  const contexts = useK8sStore(s => s.contexts);
  const detail = useK8sStore(s => s.detail);
  const draft = useDk8sPvStore(s => s.draft);
  const patch = useDk8sPvStore(s => s.patch);

  /*
    Take a path the pod reported and put it in the configuration.

    Copying it out of a listing and into a box two sections up is exactly where
    a character goes missing — which produces an empty search rather than an
    error, the failure this whole box exists to end.
  */
  const addMount = (path: string) => {
    const existing = (draft.mounts ?? []).filter(m => m.path?.trim());
    if (existing.some(m => m.path.trim() === path)) return;
    patch({ mounts: [...existing, { path }], root: undefined });
  };

  const {
    pod, namespace, context, busy, checked, mounts, mountsError, mountsCommand, paths,
    namespaces, pods, loadingPicker, pickerError,
    setTarget, check, clear, apply, loadPicker,
  } = usePodCheckStore();

  /* The host's replies land here. Settings can be open without dk8s ever
     having been, so this listens itself rather than relying on the panel. */
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const t = e.data?.type;
      if (t === 'dk8s:podMounts' || t === 'dk8s:pvListed' || t === 'dk8s:podPicker') apply(e.data);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [apply]);

  /*
    Opens on whatever dk8s is already looking at.

    The pod you want to check is nearly always the one on screen, and starting
    on it means the common case is one click — Check — rather than three
    menus. Only a starting point: every one of them is still a menu.
  */
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded) return;
    const ctx = detail?.context ?? storeContext ?? '';
    if (!ctx) return;
    setSeeded(true);
    setTarget({
      context: ctx,
      namespace: detail?.namespace ?? storeNamespace ?? '',
      pod: detail?.name ?? '',
    });
  }, [detail, seeded, setTarget, storeContext, storeNamespace]);

  /* The menus below the chosen context, refilled whenever it narrows. */
  useEffect(() => {
    if (context) loadPicker(context, namespace);
  }, [context, namespace, loadPicker]);

  /* The mounts as configured, which is what this is checking. */
  const roots = useMemo(() => {
    const list = (draft.mounts ?? []).map(m => m.path?.trim()).filter((p): p is string => !!p);
    return [...new Set(list)];
  }, [draft.mounts]);

  /* Labelled by app, not only by pod: a template is written in terms of
     `{app}`, and three replicas of one Deployment are one answer. */
  const podOptions = useMemo(() => pods.map(p => ({
    value: p.name,
    label: p.phase && p.phase !== 'Running' ? `${p.name}  (${p.phase})` : p.name,
  })), [pods]);

  const ready = !!pod.trim() && !!namespace.trim() && !!context.trim();
  const pathList = Object.values(paths);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          check against a pod
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
      </div>

      <div className="flex flex-col gap-3 px-4 py-3.5 rounded-lg" style={cardStyle}>
        <div className="flex items-start gap-3">
          <StethoscopeIcon size={15} style={{ color: ACCENT, marginTop: 2, flexShrink: 0 }} />
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
Pick a pod and see what is really there
            </span>
            <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              The paths above live inside a container, so nothing on this machine can confirm
              one. Pick a pod and this asks it directly &mdash; what it mounts, and what is
              really under each path you configured, read
              with <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>kubectl exec</code>.
              Every answer carries the command that produced it.
            </span>
          </div>
        </div>

        {/* Context, then namespace, then pod — the order the choice is
            actually made in. Each menu is filled by the one to its left, and
            choosing again to the left empties what is to the right rather
            than leaving a pod that belongs to somewhere else on screen. */}
        <div className="flex items-end gap-2 flex-wrap">
          <Picker
            label="context" value={context} width={210}
            options={contexts.map(c => ({ value: c.name, label: c.name }))}
            empty="no contexts"
            onChange={v => setTarget({ context: v })}
          />
          <Picker
            label="namespace" value={namespace} width={190}
            options={namespaces.map(n => ({ value: n, label: n }))}
            disabled={!context}
            busy={loadingPicker && !namespaces.length}
            empty={context ? 'none visible' : 'pick a context'}
            onChange={v => setTarget({ namespace: v })}
          />
          {/* Apps only. A finished CronJob run is gone, and where its logs
              went is the owning app's question — offering one here is
              offering an answer that cannot be right. */}
          <Picker
            label="pod" value={pod}
            options={podOptions}
            disabled={!namespace}
            busy={loadingPicker && !!namespace && !pods.length}
            empty={namespace ? 'no app pods here' : 'pick a namespace'}
            onChange={v => setTarget({ pod: v })}
          />
          <ButtonView
            label={busy ? 'Checking…' : 'Check'}
            size="sm" variant="secondary"
            disabled={!ready || busy}
            accentColor={ACCENT}
            color={ready && !busy ? ACCENT : 'var(--color-text-muted)'}
            onClick={() => check(roots)}
          />
          {(mounts || pathList.length > 0) && (
            <ButtonView label="Clear" size="sm" variant="secondary" onClick={clear} />
          )}
        </div>

        {pickerError && (
          <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
            {pickerError}
          </span>
        )}

        <PvCheckResults roots={roots} onUse={addMount} />

        {checked && !busy && roots.length === 0 && (
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            No mount paths configured above, so there was nothing of yours to check &mdash; the
            list of what this pod mounts is the place to start.
          </span>
        )}
      </div>
    </div>
  );
}

/** What produced the answer above it. Selectable, because it is meant to be run. */
function Command({ text }: { text: string }) {
  return (
    <div className="px-3 py-1.5" style={{ borderTop: '1px solid color-mix(in srgb, var(--color-surface-border) 45%, transparent)' }}>
      <code className="text-[10px]" style={{
        fontFamily: 'var(--font-mono, monospace)',
        color: 'var(--color-text-muted)',
        userSelect: 'text',
        overflowWrap: 'anywhere',
      }}>{text}</code>
    </div>
  );
}

/**
 * What the check found, wherever it was run from.
 *
 * The same body serves the Settings page and the modal the pod menu opens —
 * two screens answering one question would drift, and this is a question
 * people will ask from whichever of the two they happen to be looking at.
 */
export function PvCheckResults({ roots, onUse }: {
  roots: string[];
  onUse?: (path: string) => void;
}) {
  const { checked, mounts, mountsError, mountsCommand, paths } = usePodCheckStore();
  const pathList = Object.values(paths);

  return (
    <>
        {/* ── What the pod says it mounts ── */}
        {mountsError && (
          <div className="text-[11.5px] px-3 py-2 rounded-md" style={{
            color: 'var(--color-warning)',
            background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-warning) 26%, transparent)',
          }}>{mountsError}</div>
        )}

        {mounts && mounts.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
              What <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>{checked}</code> mounts.
              A path you configure should be one of these, or under one.
            </span>
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-surface-border)' }}>
              {mounts.map(m => (
                <MountRow
                  key={`${m.container}:${m.path}`}
                  m={m}
                  /* Configured already, or offered — copying a path out of a
                     listing and into a box two sections up is exactly where a
                     character goes missing. */
                  configured={roots.includes(m.path)}
                  onUse={onUse ? () => onUse(m.path) : undefined}
                />
              ))}
            </div>
            {mountsCommand && <Command text={mountsCommand} />}
          </div>
        )}

        {/* ── What is under each configured path ── */}
        {pathList.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
              Your configured paths, inside this pod.
            </span>
            {pathList.map(p => (
              <div key={p.root} className="rounded-lg overflow-hidden"
                   style={{ border: '1px solid var(--color-surface-border)' }}>
                <div className="flex items-center gap-2 px-3 py-1.5"
                     style={{ background: 'var(--color-panel)' }}>
                  {p.busy ? <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>checking…</span>
                    : p.error ? <CloseIcon size={11} style={{ color: 'var(--color-warning)' }} />
                      : <CheckIcon size={11} style={{ color: 'var(--color-success)' }} />}
                  <code className="text-[11px]" style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    color: 'var(--color-text-primary)', overflowWrap: 'anywhere',
                  }}>{p.root}</code>
                  <span className="flex-1" />
                  {!p.busy && !p.error && (
                    <span className="text-[10.5px] tabular-nums shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                      {p.files.length} file{p.files.length === 1 ? '' : 's'}{p.capped ? '+' : ''}
                    </span>
                  )}
                </div>

                {p.error && (
                  <div className="text-[11px] px-3 py-2" style={{ color: 'var(--color-warning)' }}>
                    {p.error}
                  </div>
                )}

                {!p.error && p.files.length > 0 && (
                  <div className="flex flex-col">
                    {p.files.slice(0, 12).map(f => (
                      <div key={f.rel} className="flex items-baseline gap-2 px-3 py-1"
                           style={{ borderTop: '1px solid color-mix(in srgb, var(--color-surface-border) 45%, transparent)' }}>
                        <FolderIcon size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                        <code className="text-[10.5px]" style={{
                          fontFamily: 'var(--font-mono, monospace)',
                          color: 'var(--color-text-secondary)', overflowWrap: 'anywhere',
                        }}>{f.rel}</code>
                        <span className="flex-1" />
                        <span className="text-[10px] tabular-nums shrink-0"
                              style={{ color: 'var(--color-text-muted)' }}>{bytes(f.bytes)}</span>
                      </div>
                    ))}
                    {p.files.length > 12 && (
                      <span className="text-[10px] px-3 py-1" style={{ color: 'var(--color-text-muted)' }}>
                        and {p.files.length - 12} more
                      </span>
                    )}
                  </div>
                )}

                {!p.error && !p.busy && p.files.length === 0 && (
                  <div className="text-[11px] px-3 py-2" style={{ color: 'var(--color-text-muted)' }}>
                    The path is there and holds no log files. A mount that is real and empty and a
                    path that is wrong look the same in a search &mdash; here they do not.
                  </div>
                )}

                {p.command && <Command text={p.command} />}
              </div>
            ))}
          </div>
        )}

    </>
  );
}
