/**
 * Archived logs on a mounted volume.
 *
 * The page is built around one idea: never configure a path blind. The probe
 * runs against what is in the boxes right now — not what was saved — and
 * shows the directories it found and a handful of real file paths, so a
 * template can be checked by eye before any search depends on it.
 *
 * Without that, a wrong path and an empty archive produce the same result: no
 * matches, and no way to tell which one you are looking at.
 */
import { useEffect } from 'react';
import { ButtonView, TextInputView, CheckboxView, SpinnerIcon } from '@salilvnair/dui';
import {
  FolderOpenIcon, WarningTriangleIcon, CheckCircleIcon, TrashIcon, PlusIcon,
} from '../../icons';
import { useDk8sPvStore } from '../../store/dk8s-pv-store';

const ACCENT = 'var(--color-dk8s)';

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function when(ms?: number): string {
  if (!ms) return '—';
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Rows of `match → value`.
 *
 * Pairs rather than an object while editing, because a half-typed key is a
 * real state and an object would drop the row the moment the key went blank.
 */
function MapEditor({ rows, onChange, keyPlaceholder, valuePlaceholder }: {
  rows: [string, string][];
  onChange: (rows: [string, string][]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) {
  const setRow = (i: number, k: string, v: string) =>
    onChange(rows.map((r, j) => (j === i ? [k, v] : r)) as [string, string][]);

  return (
    <div className="flex flex-col gap-2">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-2">
          <TextInputView
            value={k} size="md" accentColor={ACCENT} placeholder={keyPlaceholder}
            onChange={e => setRow(i, e.target.value, v)}
            style={{ width: '100%', fontFamily: 'monospace' }}
          />
          <span className="text-[11px] shrink-0" style={{ color: 'var(--color-text-muted)' }}>
            &rarr;
          </span>
          <TextInputView
            value={v} size="md" accentColor={ACCENT} placeholder={valuePlaceholder}
            onChange={e => setRow(i, k, e.target.value)}
            style={{ width: '100%', fontFamily: 'monospace' }}
          />
          <ButtonView
            label="" size="md" variant="secondary"
            iconLeft={<TrashIcon size={12} />}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            style={{ background: 'transparent' }}
          />
        </div>
      ))}
      <ButtonView
        label="Add a mapping" size="sm" variant="secondary"
        iconLeft={<PlusIcon size={11} />}
        onClick={() => onChange([...rows, ['', '']])}
        style={{ background: 'transparent', alignSelf: 'flex-start' }}
      />
    </div>
  );
}

function Field({ label, hint, children }: {
  label: string; hint?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9.5px] uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-[11px] leading-relaxed text-[var(--color-text-muted)]"
              style={{ maxWidth: '92ch' }}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function PvLogSettings() {
  const {
    draft, probe, probing, dirty, load, patch, runProbe, save, reset, apply,
  } = useDk8sPvStore();

  // A config written before mounts existed still has `root`; showing it as the
  // first mount is what stops the page rendering empty over a working setup.
  const mounts = draft.mounts?.length
    ? draft.mounts
    : [{ path: draft.root ?? '' }];
  const setMount = (i: number, over: Partial<typeof mounts[number]>) =>
    patch({ mounts: mounts.map((m, j) => (j === i ? { ...m, ...over } : m)), root: undefined });

  // Kept as pairs rather than an object while editing: a half-typed key is a
  // real state, and an object would drop the row the moment the key is blank.
  const envRows = Object.entries(draft.envByContext ?? {}) as [string, string][];
  const setEnv = (rows: [string, string][]) =>
    patch({ envByContext: Object.fromEntries(rows) });

  const appRows = Object.entries(draft.appByPod ?? {}) as [string, string][];
  const setApp = (rows: [string, string][]) =>
    patch({ appByPod: Object.fromEntries(rows) });

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>;
      if (msg?.type === 'dk8s:pvConfig' || msg?.type === 'dk8s:pvProbe') apply(msg);
    };
    window.addEventListener('message', handler);
    load();
    return () => window.removeEventListener('message', handler);
  }, [apply, load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          archived logs
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
        {dirty && (
          <>
            <ButtonView label="Discard" size="sm" variant="secondary" onClick={reset}
                        style={{ background: 'transparent' }} />
            <ButtonView label="Save" size="sm" variant="secondary"
                        accentColor={ACCENT} color={ACCENT} onClick={save}
                        style={{
                          background: `color-mix(in srgb, ${ACCENT} 16%, transparent)`,
                          borderColor: `color-mix(in srgb, ${ACCENT} 45%, transparent)`,
                          fontWeight: 600,
                        }} />
          </>
        )}
      </div>

      <span className="text-[11px] leading-relaxed"
            style={{ color: 'var(--color-text-muted)', maxWidth: '92ch' }}>
        <code>kubectl logs</code> reaches the running container and the one before it, and
        nothing else — a pod that has restarted for a day has lost the restart that mattered.
        If your cluster ships logs to a volume that is mounted on this machine, point dk8s at
        it and Search Everywhere will look there too, alongside the live pods.
      </span>

      <CheckboxView
        label="Search archived logs as well as live pods"
        checked={draft.enabled}
        size="md"
        accentColor={ACCENT}
        onChange={v => patch({ enabled: v })}
      />

      <div className="flex flex-col gap-3.5 px-3 py-3 rounded-lg"
           style={{
             background: 'var(--color-surface)',
             border: '1px solid var(--color-surface-border)',
             opacity: draft.enabled ? 1 : 0.55,
           }}>
        <Field
          label="mount paths"
          hint={
            'Where the volumes are mounted on this machine. Nothing is ever written here — '
            + 'the files are only read. Add more than one when separate shares are mounted '
            + 'separately; a single share holding every claim needs only one.'
          }
        >
          <div className="flex flex-col gap-2">
            {mounts.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <TextInputView
                  value={m.path} size="md" accentColor={ACCENT}
                  placeholder={'\\\\\\\\fileserver\\\\pvcs   or   /mnt/pvcs'}
                  onChange={e => setMount(i, { path: e.target.value })}
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
                {mounts.length > 1 && (
                  <ButtonView
                    label="" size="md" variant="secondary"
                    iconLeft={<TrashIcon size={12} />}
                    onClick={() => patch({ mounts: mounts.filter((_, j) => j !== i) })}
                    style={{ background: 'transparent' }}
                  />
                )}
              </div>
            ))}
            <div className="flex items-center gap-2">
              <ButtonView
                label="Add a mount" size="sm" variant="secondary"
                iconLeft={<PlusIcon size={11} />}
                onClick={() => patch({ mounts: [...mounts, { path: '' }] })}
                style={{ background: 'transparent' }}
              />
              <div className="flex-1" />
              <ButtonView
                label={probing ? 'Checking…' : 'Check'}
                size="md" variant="secondary"
                accentColor={ACCENT} color={ACCENT}
                disabled={probing || !mounts.some(m => m.path.trim())}
                iconLeft={probing ? <SpinnerIcon size={12} /> : <FolderOpenIcon size={12} />}
                onClick={runProbe}
                style={{
                  background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
                  borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`,
                  whiteSpace: 'nowrap',
                }}
              />
            </div>
          </div>
        </Field>

        <Field
          label="path template"
          hint={
            <>
              Where one pod&rsquo;s files live, relative to the mount.
              {' '}<code>{'{app}'}</code>, <code>{'{env}'}</code>, <code>{'{namespace}'}</code>,
              {' '}<code>{'{pod}'}</code>, <code>{'{container}'}</code> and <code>{'{date}'}</code>
              {' '}are filled in per pod; <code>*</code> and <code>**</code> work as globs.
              {' '}<code>{'{app}'}</code> is the pod name with its ReplicaSet hash and pod suffix
              removed, so <code>zp-backend-7f9455548d-xm6kc</code> becomes
              {' '}<code>zp-backend</code>. <code>{'{env}'}</code> comes from the cluster, mapped
              below. <code>{'{date}'}</code> and <code>**</code> both match anything, which is how
              rotated files under an <code>archived/</code> directory are picked up.
            </>
          }
        >
          <TextInputView
            value={draft.template ?? ''} size="md" accentColor={ACCENT}
            placeholder="{app}-{env}-pvc/{app}-{env}-logs/**/{app}*.log*"
            onChange={e => patch({ template: e.target.value })}
            style={{ width: '100%', fontFamily: 'monospace' }}
          />
        </Field>

        <Field
          label="fallback pattern"
          hint={
            <>
              Optional. A regular expression matched against each file&rsquo;s path below the
              mount, for anything the template cannot express. Named groups
              {' '}<code>{'(?<namespace>…)'}</code>, <code>{'(?<app>…)'}</code> and
              {' '}<code>{'(?<pod>…)'}</code> say which pod a file belongs to; without them a file is
              claimed when the pod or application name appears in its path.
            </>
          }
        >
          <TextInputView
            value={draft.pattern ?? ''} size="md" accentColor={ACCENT}
            placeholder={String.raw`^legacy/(?<pod>[^/]+)\.log$`}
            onChange={e => patch({ pattern: e.target.value })}
            style={{ width: '100%', fontFamily: 'monospace' }}
          />
        </Field>

        <Field
          label="what {env} means"
          hint={
            'Kubernetes has no notion of an environment, so this is the one thing that cannot be '
            + 'derived. Match part of a context name on the left, and the token it stands for on '
            + 'the right. Left empty, {env} matches anything — which still finds the logs, it just '
            + 'cannot tell a prod claim from a dev one.'
          }
        >
          <MapEditor rows={envRows} onChange={setEnv}
                     keyPlaceholder="context contains…" valuePlaceholder="prod" />
        </Field>

        <Field
          label="what {app} means"
          hint={
            <>
              Usually nothing to do here. <code>{'{app}'}</code> is the pod&rsquo;s owning
              workload, which Kubernetes reports directly — two replicas of one Deployment
              both resolve to the same name without any guessing. This is for the two cases
              that cannot cover: a bare pod with no owner, and a directory named something
              other than the workload. Match part of a pod name on the left.
            </>
          }
        >
          <MapEditor rows={appRows} onChange={setApp}
                     keyPlaceholder="pod name contains…" valuePlaceholder="app" />
        </Field>

        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Field label="file extensions" hint="Comma separated. Blank means every file.">
            <TextInputView
              value={(draft.extensions ?? []).join(', ')} size="md" accentColor={ACCENT}
              placeholder=".log, .txt"
              onChange={e => patch({
                extensions: e.target.value.split(',').map(x => x.trim()).filter(Boolean),
              })}
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
          </Field>
          <Field label="ignore files older than" hint="Days. 0 searches everything.">
            <TextInputView
              type="number" value={String(draft.maxAgeDays ?? 0)} size="md" accentColor={ACCENT}
              onChange={e => patch({ maxAgeDays: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              style={{ width: 120 }}
            />
          </Field>
        </div>

        {probe && <ProbeReport />}
      </div>
    </div>
  );
}

/** What each mount actually holds — the point of the Check button. */
function ProbeReport() {
  const probe = useDk8sPvStore(s => s.probe);
  if (!probe) return null;

  if (probe.error) {
    return (
      <div className="flex items-start gap-2 px-3 py-2 rounded-md"
           style={{
             background: 'color-mix(in srgb, var(--color-error) 10%, var(--color-surface))',
             border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
           }}>
        <WarningTriangleIcon size={13} color="var(--color-error)" />
        <span className="text-[11.5px]" style={{ color: 'var(--color-error)' }}>{probe.error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* One block per mount. A working prod volume beside a mistyped dev one
          has to say exactly that, rather than a single verdict that hides
          half of what was asked for. */}
      {probe.mounts.map((m, i) => <MountReport key={i} m={m} />)}
    </div>
  );
}

function MountReport({ m }: { m: import('../../store/dk8s-pv-store').PvMountProbe }) {
  if (!m.ok) {
    return (
      <div className="flex items-start gap-2 px-3 py-2 rounded-md"
           style={{
             background: 'color-mix(in srgb, var(--color-error) 10%, var(--color-surface))',
             border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
           }}>
        <WarningTriangleIcon size={13} color="var(--color-error)" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[11.5px]" style={{ color: 'var(--color-error)' }}>
            {m.error ?? 'Could not read that path.'}
          </span>
          <span className="text-[10.5px] font-mono truncate" style={{ color: 'var(--color-text-muted)' }}>
            {m.resolved || m.path}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 rounded-md"
         style={{
           background: 'var(--color-surface-hover)',
           border: '1px solid var(--color-surface-border)',
         }}>
      <div className="flex items-center gap-2 flex-wrap">
        <CheckCircleIcon size={13} color="var(--color-success)" />
        <span className="text-[11.5px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {m.fileCount.toLocaleString()} file{m.fileCount === 1 ? '' : 's'}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {bytes(m.totalBytes)} · {when(m.oldest)} → {when(m.newest)}
        </span>
        <div className="flex-1" />
        <span className="text-[10px] font-mono truncate" style={{ color: 'var(--color-text-muted)', maxWidth: '40%' }}>
          {m.resolved}
        </span>
      </div>

      {m.topLevel.length > 0 && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[9.5px] uppercase tracking-wider shrink-0"
                style={{ color: 'var(--color-text-muted)' }}>
            top level
          </span>
          <span className="text-[10.5px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
            {m.topLevel.slice(0, 12).join(', ')}
            {m.topLevel.length > 12 && ` … +${m.topLevel.length - 12}`}
          </span>
        </div>
      )}

      {m.sample.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[9.5px] uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}>
            newest files — check your template against these
          </span>
          {m.sample.map(f => (
            <div key={f.rel} className="flex items-baseline gap-2 text-[10.5px] font-mono">
              <span className="truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                {f.rel}
              </span>
              <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>{bytes(f.bytes)}</span>
              <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                {when(f.mtime)}
              </span>
            </div>
          ))}
        </div>
      )}

      {m.fileCount === 0 && (
        <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
          The path is readable but nothing under it matched. Check the extension filter and the
          age limit before the template — those exclude files before the template is even tried.
        </span>
      )}
    </div>
  );
}
