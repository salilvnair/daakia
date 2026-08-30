/**
 * Everything dk8s has collected, in one place.
 *
 * This is what lets the separate Doctor tab go away. Until now a collected
 * dump was only visible in the panel that collected it and vanished when that
 * pod was closed, so the artifact folder filled up with files nothing in the
 * app could see — and analysing a dump you already had meant a whole separate
 * tab whose only job was a file picker.
 *
 * Both problems have the same answer: make the folder a view. Collected dumps
 * are durable, imported ones live alongside them, and clicking either opens
 * the analyzer that understands it.
 */
import { useEffect, useMemo, useState } from 'react';
import { ButtonView, SearchInputView, SegmentedControlView } from '@salilvnair/dui';
import { CopyButtonView } from '@salilvnair/dui';
import {
  MemoryIcon, CpuIcon, FileTextIcon, TimelineIcon, NetworkIcon,
  FolderOpenIcon, TrashIcon, PlusIcon, StethoscopeIcon,
} from '../../icons';
import { useDk8sArtifactStore, type StoredArtifact } from '../../store/dk8s-artifact-store';
import { shortAge } from './pod-view';

const ACCENT = 'var(--color-dk8s)';

const KIND_ICON: Record<string, typeof MemoryIcon> = {
  heapdump: MemoryIcon,
  histogram: MemoryIcon,
  threaddump: CpuIcon,
  'threaddump-sigquit': CpuIcon,
  stackdump: CpuIcon,
  jfr: TimelineIcon,
  conns: NetworkIcon,
  imported: FileTextIcon,
};

const KIND_LABEL: Record<string, string> = {
  heapdump: 'Heap dump',
  histogram: 'Class histogram',
  threaddump: 'Thread dump',
  'threaddump-sigquit': 'Thread dump (SIGQUIT)',
  stackdump: 'Python stack dump',
  jfr: 'Flight recording',
  conns: 'Connections',
  imported: 'Imported',
};

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function Row({ a }: { a: StoredArtifact }) {
  const { open, remove } = useDk8sArtifactStore();
  const Icon = KIND_ICON[a.kind] ?? FileTextIcon;
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
         style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
      <Icon size={15} color={ACCENT} />

      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {KIND_LABEL[a.kind] ?? a.kind}
          </span>
          {a.pod && (
            <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-muted)' }}>
              {a.pod}
            </span>
          )}
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            {bytes(a.bytes)}
          </span>
          {a.collectedAt && (
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              {shortAge(new Date(a.collectedAt).toISOString())} ago
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono truncate" style={{ color: 'var(--color-text-muted)' }}>
          {a.name}
        </span>
      </div>

      {confirming ? (
        <>
          <span className="text-[10.5px]" style={{ color: 'var(--color-warning)' }}>
            Delete this file?
          </span>
          <ButtonView label="Cancel" size="sm" variant="secondary"
                      onClick={() => setConfirming(false)} style={{ background: 'transparent' }} />
          <ButtonView label="Delete" size="sm" variant="secondary"
                      accentColor="var(--color-error)" color="var(--color-error)"
                      onClick={() => { remove(a.file); setConfirming(false); }}
                      style={{ background: 'color-mix(in srgb, var(--color-error) 14%, transparent)' }} />
        </>
      ) : (
        <>
          <CopyButtonView text={a.file} size="xs" />
          <ButtonView
            label="Analyze"
            size="sm" variant="secondary"
            accentColor={ACCENT} color={ACCENT}
            onClick={() => open(a)}
            style={{
              background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
              borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`,
              fontWeight: 600,
            }}
          />
          <ButtonView label="" size="sm" variant="secondary"
                      iconLeft={<TrashIcon size={11} />}
                      onClick={() => setConfirming(true)}
                      style={{ background: 'transparent' }} />
        </>
      )}
    </div>
  );
}

export function ArtifactsView() {
  const { artifacts, dir, error, load, importFile, reveal } = useDk8sArtifactStore();
  const [filter, setFilter] = useState('');
  const [kind, setKind] = useState<'all' | 'heap' | 'threads' | 'logs'>('all');

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return artifacts.filter(a => {
      if (kind !== 'all' && a.analyzer !== kind) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q) || (a.pod ?? '').toLowerCase().includes(q);
    });
  }, [artifacts, filter, kind]);

  const totalBytes = artifacts.reduce((n, a) => n + a.bytes, 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <div className="flex-1" style={{ minWidth: 200, paddingRight: 8 }}>
          <SearchInputView value={filter} onChange={setFilter}
                           placeholder="Filter artifacts" size="md" width="100%" />
        </div>

        <SegmentedControlView
          value={kind}
          onChange={v => setKind(v as typeof kind)}
          options={[
            { value: 'all', label: 'all' },
            { value: 'heap', label: 'heap' },
            { value: 'threads', label: 'threads' },
            { value: 'logs', label: 'text' },
          ]}
          size="md" variant="rounded" accentColor={ACCENT}
        />

        <ButtonView label="Open a file…" size="md" variant="secondary"
                    accentColor={ACCENT} color={ACCENT}
                    iconLeft={<PlusIcon size={12} />}
                    onClick={importFile}
                    style={{
                      background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
                      borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`,
                    }} />

        <ButtonView label="Folder" size="md" variant="secondary"
                    iconLeft={<FolderOpenIcon size={12} />}
                    onClick={reveal} style={{ background: 'transparent' }} />
      </div>

      {error && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-md text-[11px] shrink-0"
             style={{
               background: 'color-mix(in srgb, var(--color-error) 10%, var(--color-surface))',
               border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
               color: 'var(--color-error)',
             }}>
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-2 min-h-0">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-8 text-center">
            <StethoscopeIcon size={22} color="var(--color-text-muted)" />
            <span className="text-[12px]" style={{ color: 'var(--color-text-primary)' }}>
              {artifacts.length === 0 ? 'Nothing collected yet' : 'Nothing matches that filter'}
            </span>
            <span className="text-[11px] max-w-[460px] leading-relaxed"
                  style={{ color: 'var(--color-text-muted)' }}>
              {artifacts.length === 0
                ? 'Take a thread dump or a heap dump from a pod’s Doctor tab and it will appear '
                  + 'here. You can also open a dump you already have — one from a colleague, or '
                  + 'pulled off production before dk8s existed.'
                : 'Clear the filter to see the rest.'}
            </span>
          </div>
        ) : (
          visible.map(a => <Row key={a.file} a={a} />)
        )}
      </div>

      <div className="flex items-center gap-3 px-4 py-1.5 text-[10.5px] shrink-0"
           style={{ borderTop: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {artifacts.length} file{artifacts.length === 1 ? '' : 's'} · {bytes(totalBytes)}
        </span>
        <div className="flex-1" />
        <span className="font-mono truncate" style={{ maxWidth: '55%' }}>{dir}</span>
      </div>
    </div>
  );
}
