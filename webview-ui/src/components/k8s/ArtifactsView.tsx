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
import {
  ButtonView, SearchInputView, SegmentedControlView, CheckboxView, HudView,
  CheckSquareIcon, EmptySquareIcon,
} from '@salilvnair/dui';
import { CopyButtonView } from '@salilvnair/dui';
import {
  MemoryIcon, CpuIcon, FileTextIcon, TimelineIcon, NetworkIcon,
  FolderOpenIcon, TrashIcon, PlusIcon, StethoscopeIcon, CloseIcon,
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

function Row({ a, picked, onPick }: {
  a: StoredArtifact; picked: boolean; onPick: (add: boolean) => void;
}) {
  const { open, remove } = useDk8sArtifactStore();
  const Icon = KIND_ICON[a.kind] ?? FileTextIcon;
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
         style={{
           background: picked
             ? `color-mix(in srgb, ${ACCENT} 8%, var(--color-surface))`
             : 'var(--color-surface)',
           border: `1px solid ${picked
             ? `color-mix(in srgb, ${ACCENT} 40%, transparent)`
             : 'var(--color-surface-border)'}`,
         }}>
      <CheckboxView checked={picked} size="md" accentColor={ACCENT} onChange={onPick} />
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
  const { artifacts, dir, error, load, importFile, reveal, remove } = useDk8sArtifactStore();
  const [filter, setFilter] = useState('');
  const [kind, setKind] = useState<'all' | 'heap' | 'threads' | 'logs'>('all');
  const [picked, setPicked] = useState<string[]>([]);

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

  // Selection is scoped to what is on screen: "select all" under a filter has
  // to mean the rows you can see, or it quietly picks up files you filtered
  // out and then deletes them.
  const allShown = visible.length > 0 && visible.every(a => picked.includes(a.file));
  const pickedShown = visible.filter(a => picked.includes(a.file));
  const pickedBytes = artifacts
    .filter(a => picked.includes(a.file))
    .reduce((n, a) => n + a.bytes, 0);

  const toggleAll = () => setPicked(allShown
    ? picked.filter(f => !visible.some(a => a.file === f))
    : [...new Set([...picked, ...visible.map(a => a.file)])]);

  const deletePicked = () => {
    // One message per file: the host already knows how to delete one, and a
    // bulk path would be a second way to do the same thing.
    for (const f of picked) remove(f);
    setPicked([]);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        {/* Select-all sits with the filter, because what it selects is what
            the filter left on screen. */}
        <button
          type="button"
          onClick={toggleAll}
          disabled={visible.length === 0}
          title={allShown ? 'Clear the selection' : `Select all ${visible.length} shown`}
          className="flex items-center justify-center cursor-pointer shrink-0"
          style={{
            width: 30, height: 30, borderRadius: 4,
            background: allShown ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'transparent',
            border: `1px solid ${allShown
              ? `color-mix(in srgb, ${ACCENT} 40%, transparent)`
              : 'var(--color-surface-border)'}`,
            opacity: visible.length === 0 ? 0.4 : 1,
          }}
        >
          {allShown
            ? <CheckSquareIcon size={14} color={ACCENT} />
            : <EmptySquareIcon size={14} color="var(--color-text-muted)" />}
        </button>

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
          visible.map(a => (
            <Row
              key={a.file}
              a={a}
              picked={picked.includes(a.file)}
              onPick={add => setPicked(add
                ? [...picked, a.file]
                : picked.filter(f => f !== a.file))}
            />
          ))
        )}
      </div>

      {/* A HUD rather than a toolbar row: it only exists while something is
          selected, and a row that appears and disappears would shift the list
          under the cursor every time you tick a box. */}
      {picked.length > 0 && (
        <HudView
          contained
          draggable={false}
          accentColor={ACCENT}
          status={`${picked.length} selected · ${bytes(pickedBytes)}`}
          items={[
            {
              id: 'clear',
              icon: <CloseIcon size={13} />,
              label: 'Cancel',
              title: 'Clear the selection',
              onClick: () => setPicked([]),
            },
            {
              id: 'delete',
              icon: <TrashIcon size={13} />,
              label: `Delete ${picked.length}`,
              title: 'Delete the selected files from this machine',
              separator: true,
              onClick: deletePicked,
            },
          ]}
          className="dk8s-artifact-hud"
        />
      )}

      <div className="flex items-center gap-3 px-4 py-1.5 text-[10.5px] shrink-0"
           style={{ borderTop: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {artifacts.length} file{artifacts.length === 1 ? '' : 's'} · {bytes(totalBytes)}
          {pickedShown.length > 0 && ` · ${pickedShown.length} selected`}
        </span>
        <div className="flex-1" />
        <span className="font-mono truncate" style={{ maxWidth: '55%' }}>{dir}</span>
      </div>
    </div>
  );
}
