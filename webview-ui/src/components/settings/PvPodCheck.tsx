/**
 * Settings → DK8S → Logs — "check this against a real pod".
 *
 * Never configure a path blind is the rule the whole PV page is built on, and
 * this is the part that finally keeps it for a volume inside the cluster. The
 * probe next door reads the mount with `fs`, which only works when the volume
 * is on this machine; ask it about `/prodapp-prod-pvc/prodapp_prod_logs` and
 * it answers about `C:\prodapp-prod-pvc\prodapp_prod_logs`, which is not a
 * place and not the question.
 *
 * So this asks a pod. Name one, and it reports what that pod says it mounts
 * and what is really under each path you have configured — with the command
 * that produced each answer, because a check you cannot reproduce by hand is
 * one you have to take on faith.
 */
import { useEffect, useMemo, useState } from 'react';
import { ButtonView } from '@salilvnair/dui';
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

function Field({ label, value, onChange, placeholder, width }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; width?: number;
}) {
  return (
    <label className="flex flex-col gap-1" style={{ width: width ?? undefined, flex: width ? undefined : 1 }}>
      <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      <input
        value={value}
        spellCheck={false}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="text-[11.5px] px-2.5 py-1.5 rounded-md w-full"
        style={{
          fontFamily: 'var(--font-mono, monospace)',
          background: 'var(--color-panel)',
          border: '1px solid var(--color-surface-border)',
          color: 'var(--color-text-primary)',
          outlineColor: ACCENT,
        }}
      />
    </label>
  );
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** What the pod says it has, which is where a configured path should come from. */
function MountRow({ m, configured, onUse }: {
  m: CheckedMount; configured: boolean; onUse: () => void;
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
      ) : (
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
      )}
    </div>
  );
}

export function PvPodCheck() {
  const storeContext = useK8sStore(s => s.context);
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
    setTarget, check, clear, apply,
  } = usePodCheckStore();

  /* The host's replies land here. Settings can be open without dk8s ever
     having been, so this listens itself rather than relying on the panel. */
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const t = e.data?.type;
      if (t === 'dk8s:podMounts' || t === 'dk8s:pvListed') apply(e.data);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [apply]);

  /* Seeded from whatever dk8s is looking at, because the pod you want to check
     is nearly always the one already on screen. Only as a starting value —
     typing over it is the point of the box. */
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || !detail) return;
    setSeeded(true);
    setTarget({
      pod: detail.name,
      namespace: detail.namespace,
      context: detail.context ?? storeContext ?? '',
    });
  }, [detail, seeded, setTarget, storeContext]);

  /* The mounts as configured, which is what this is checking. */
  const roots = useMemo(() => {
    const list = (draft.mounts ?? []).map(m => m.path?.trim()).filter((p): p is string => !!p);
    return [...new Set(list)];
  }, [draft.mounts]);

  const ready = !!pod.trim() && !!namespace.trim();
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
              Name a pod and see what is really there
            </span>
            <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              The mounts above are checked on <em>this</em> machine, which only works for a volume
              you have mounted here. A claim that lives in the cluster is somewhere only a pod can
              reach &mdash; so this asks one: what it mounts, and what is under each path you have
              configured, read with <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>kubectl exec</code>.
            </span>
          </div>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          {/* Deliberately not example values. A placeholder that looks like a
              real pod name reads as a filled-in field, and the first Check
              then does nothing at all with no way to see why. */}
          <Field label="pod" value={pod} onChange={v => setTarget({ pod: v })}
                 placeholder="a pod name…" />
          <Field label="namespace" value={namespace} onChange={v => setTarget({ namespace: v })}
                 placeholder="namespace…" width={180} />
          <Field label="context" value={context} onChange={v => setTarget({ context: v })}
                 placeholder="context…" width={180} />
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
                  onUse={() => { addMount(m.path); check([...roots, m.path]); }}
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
