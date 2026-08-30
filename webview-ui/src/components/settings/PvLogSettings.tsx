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
import { FolderOpenIcon, WarningTriangleIcon, CheckCircleIcon } from '../../icons';
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
          label="mount path"
          hint="Where the volume is mounted on this machine. Nothing is ever written here — the files are only read."
        >
          <div className="flex items-center gap-2">
            <TextInputView
              value={draft.root} size="md" accentColor={ACCENT}
              placeholder={'\\\\\\\\fileserver\\\\k8s-logs   or   /mnt/k8s-logs'}
              onChange={e => patch({ root: e.target.value })}
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
            <ButtonView
              label={probing ? 'Checking…' : 'Check'}
              size="md" variant="secondary"
              accentColor={ACCENT} color={ACCENT}
              disabled={probing || !draft.root.trim()}
              iconLeft={probing ? <SpinnerIcon size={12} /> : <FolderOpenIcon size={12} />}
              onClick={runProbe}
              style={{
                background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
                borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`,
                whiteSpace: 'nowrap',
              }}
            />
          </div>
        </Field>

        <Field
          label="path template"
          hint={
            <>
              Where one pod&rsquo;s files live, relative to the mount.
              {' '}<code>{'{namespace}'}</code>, <code>{'{app}'}</code>, <code>{'{pod}'}</code>,
              {' '}<code>{'{container}'}</code> and <code>{'{date}'}</code> are filled in per pod;
              {' '}<code>*</code> and <code>**</code> work as globs.
              {' '}<code>{'{app}'}</code> is the pod name without its ReplicaSet hash — a volume is
              almost always laid out per application rather than per pod.
              {' '}<code>{'{date}'}</code> matches any date, so rotated files are included.
            </>
          }
        >
          <TextInputView
            value={draft.template ?? ''} size="md" accentColor={ACCENT}
            placeholder="{namespace}/{app}/{date}/*.log*"
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

/** What the mount actually holds — the point of the Check button. */
function ProbeReport() {
  const probe = useDk8sPvStore(s => s.probe);
  if (!probe) return null;

  if (!probe.ok) {
    return (
      <div className="flex items-start gap-2 px-3 py-2 rounded-md"
           style={{
             background: 'color-mix(in srgb, var(--color-error) 10%, var(--color-surface))',
             border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
           }}>
        <WarningTriangleIcon size={13} color="var(--color-error)" />
        <span className="text-[11.5px]" style={{ color: 'var(--color-error)' }}>
          {probe.error ?? 'Could not read that path.'}
        </span>
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
          {probe.fileCount.toLocaleString()} file{probe.fileCount === 1 ? '' : 's'}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {bytes(probe.totalBytes)} · {when(probe.oldest)} → {when(probe.newest)}
        </span>
      </div>

      {probe.topLevel.length > 0 && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[9.5px] uppercase tracking-wider shrink-0"
                style={{ color: 'var(--color-text-muted)' }}>
            top level
          </span>
          <span className="text-[10.5px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
            {probe.topLevel.slice(0, 12).join(', ')}
            {probe.topLevel.length > 12 && ` … +${probe.topLevel.length - 12}`}
          </span>
        </div>
      )}

      {probe.sample.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[9.5px] uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}>
            newest files — check your template against these
          </span>
          {probe.sample.map(f => (
            <div key={f.rel} className="flex items-baseline gap-2 text-[10.5px] font-mono">
              <span className="truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                {f.rel}
              </span>
              <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                {bytes(f.bytes)}
              </span>
              <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                {when(f.mtime)}
              </span>
            </div>
          ))}
        </div>
      )}

      {probe.fileCount === 0 && (
        <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
          The path is readable but nothing under it matched. Check the extension filter and the
          age limit before the template — those exclude files before the template is even tried.
        </span>
      )}
    </div>
  );
}
