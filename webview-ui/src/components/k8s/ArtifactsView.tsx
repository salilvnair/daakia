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
  CheckSquareIcon, EmptySquareIcon, FilterInputView, IconSize } from '@salilvnair/dui';
import { CopyButtonView } from '@salilvnair/dui';
import {
  MemoryIcon, CpuIcon, FileTextIcon, TimelineIcon, NetworkIcon,
  FolderOpenIcon, TrashIcon, PlusIcon, StethoscopeIcon, CloseIcon,
} from '../../icons';
import { useDk8sArtifactStore, type StoredArtifact } from '../../store/dk8s-artifact-store';
import { openArtifactIn } from '../../store/dk8s-analyze-store';
import { ConfirmDialog } from '../shared/modals/ConfirmDialog';
import { shortAge } from './pod-view';

import { ACCENT } from './tone';

/**
 * One height for every control in the toolbar.
 *
 * The row had four: a `md` search input, a `compact` segmented control and
 * `md` buttons, each rounded to whatever its own scale said. Sizes that come
 * from four different scales do not line up by luck, and the eye reads the
 * tallest one as the important one — which is how the file picker ended up
 * looking like the primary action of the whole view.
 */
const CTRL_H = 26;
const DANGER = 'color-mix(in srgb, var(--color-error) 80%, transparent)';

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

function Row({ a, picked, onPick, onAskDelete }: {
  a: StoredArtifact;
  picked: boolean;
  onPick: (add: boolean) => void;
  onAskDelete: () => void;
}) {
  const { open } = useDk8sArtifactStore();
  const Icon = KIND_ICON[a.kind] ?? FileTextIcon;

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
      <CheckboxView checked={picked} size="xs" accentColor={ACCENT} onChange={onPick} />
      <Icon size={IconSize.row} color={ACCENT} />

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
      {/* The confirmation is one dialog owned by the view, not a strip that
          swapped this row's own buttons out — deleting one file and deleting
          ten are the same decision and should ask the same question. */}
      <ButtonView label="" size="sm" variant="secondary"
                  iconLeft={<TrashIcon size={IconSize.inline} color={DANGER} />}
                  onClick={onAskDelete}
                  title="Delete this file"
                  style={{ background: 'transparent' }} />
    </div>
  );
}

export function ArtifactsView() {
  const { artifacts, dir, error, load, importFile, reveal, remove } = useDk8sArtifactStore();
  const [filter, setFilter] = useState('');
  const [kind, setKind] = useState<'all' | 'heap' | 'threads' | 'logs' | 'cpu'>('all');
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

  /**
   * The files a pending delete would remove.
   *
   * `undefined` means no dialog is open. A single-file delete puts that one
   * file here rather than taking a different path, so both routes end at the
   * same confirmation and neither can quietly skip it.
   */
  const [pendingDelete, setPendingDelete] = useState<string[] | undefined>();

  const confirmDelete = () => {
    // One message per file: the host already knows how to delete one, and a
    // bulk path would be a second way to do the same thing.
    for (const f of pendingDelete ?? []) remove(f);
    setPicked(p => p.filter(f => !(pendingDelete ?? []).includes(f)));
    setPendingDelete(undefined);
  };

  const pendingBytes = artifacts
    .filter(a => (pendingDelete ?? []).includes(a.file))
    .reduce((n, a) => n + a.bytes, 0);
  const pendingNames = artifacts
    .filter(a => (pendingDelete ?? []).includes(a.file))
    .map(a => a.name);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        {/* Select-all sits with the filter, because what it selects is what
            the filter left on screen. */}
        {/* The checkbox itself, with nothing drawn around it. A bordered
            box made it look like a button that contained a checkbox. */}
        <button
          type="button"
          onClick={toggleAll}
          disabled={visible.length === 0}
          title={allShown ? 'Clear the selection' : `Select all ${visible.length} shown`}
          className="flex items-center justify-center cursor-pointer shrink-0 border-none bg-transparent p-0"
          // Indented to line up with the checkbox on every row below it. The
          // toolbar and the list share px-4, but each row adds px-3 inside
          // that; 8 rather than 12 because dui's checkbox insets its own box
          // by 4. Measured, not guessed.
          style={{
            width: 22, height: 22, marginLeft: 8,
            opacity: visible.length === 0 ? 0.4 : 1,
          }}
        >
          {allShown
            ? <CheckSquareIcon size={IconSize.control} color={ACCENT} />
            : <EmptySquareIcon size={IconSize.control} color="var(--color-text-muted)" />}
        </button>

        <div className="flex-1" style={{ minWidth: 200, paddingRight: 8 }}>
          <FilterInputView value={filter} onChange={setFilter}
                           placeholder="Filter artifacts" size="sm" width="100%"
                           accentColor={ACCENT} />
        </div>

        <SegmentedControlView
          value={kind}
          onChange={v => setKind(v as typeof kind)}
          options={[
            { value: 'all', label: 'all' },
            { value: 'heap', label: 'heap' },
            { value: 'threads', label: 'threads' },
            { value: 'cpu', label: 'recordings' },
            { value: 'logs', label: 'text' },
          ]}
          density="compact" accentColor={ACCENT}
        />

        {/*
          One height across this whole row.

          These were `md` beside a `compact` segmented control, so the filter
          sat visibly shorter than the buttons and the accent fill on this one
          made it read as larger again than the two plain buttons next to it.
          Three heights in a row of four controls. They are all `sm` now, which
          is what the compact control is built to sit with, and the accent here
          is carried by colour alone rather than by extra weight.
        */}
        <ButtonView label="Open a file…" size="sm" variant="secondary"
                    accentColor={ACCENT} color={ACCENT}
                    iconLeft={<PlusIcon size={IconSize.action} />}
                    onClick={importFile}
                    style={{
                      height: CTRL_H,
                      background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
                      borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`,
                    }} />

        {/* "Folder" named a noun and left you to guess the verb. It opens the
            directory these files live in, in the system file manager — the
            path is in the footer, and this saves copying it. */}
        <ButtonView label="Show folder" size="sm" variant="secondary"
                    iconLeft={<FolderOpenIcon size={IconSize.action} />}
                    onClick={reveal}
                    title={dir
                      ? `Open ${dir} in your file manager`
                      : 'Open the artifact folder in your file manager'}
                    style={{ height: CTRL_H, background: 'transparent' }} />

        {/*
          The analyzer, with nothing loaded.

          Every other way in starts from a file in this list, which leaves no
          route to a dump that is not in it — and dumps arrive by email and by
          `kubectl cp` far more often than they arrive through here. This opens
          the analyzer on its empty state, which is the screen that already
          knows how to ask for a file.
        */}
        <ButtonView label="" size="sm" variant="secondary"
                    iconLeft={<StethoscopeIcon size={IconSize.item} />}
                    onClick={() => openArtifactIn('heap')}
                    title="Open the analyzer — for a dump you already have on disk"
                    style={{ height: CTRL_H, width: CTRL_H, background: 'transparent' }} />
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
            <StethoscopeIcon size={IconSize.medallion} color="var(--color-text-muted)" />
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
              onAskDelete={() => setPendingDelete([a.file])}
            />
          ))
        )}
      </div>

      {/* A HUD rather than a toolbar row: it only exists while something is
          selected, and a row that appears and disappears would shift the list
          under the cursor every time you tick a box. */}
      {picked.length > 0 && (
        // Centred in a row of its own. `contained` makes the HUD
        // position:relative, and as a direct child of this flex column it was
        // stretched edge to edge into a bar — dui sizes it to its content, and
        // a flex row is what lets it do that.
        <div className="flex justify-center shrink-0 pb-2">
        <HudView
          contained
          // Draggable, as dui intends — a HUD that cannot be moved is in the
          // way of whichever row it happens to cover.
          accentColor={ACCENT}
          className="dk8s-artifact-hud"
          status={`${picked.length} selected · ${bytes(pickedBytes)}`}
          items={[
            {
              id: 'clear',
              // Red X, matching the pod grid's own convention: green to enter
              // a selection, red to leave it.
              icon: <CloseIcon size={IconSize.item} color={DANGER} />,
              label: 'Cancel',
              title: 'Clear the selection',
              onClick: () => setPicked([]),
            },
            {
              id: 'delete',
              // Red, because it is the one item here that destroys something.
              // Held at 80% so it reads as a warning rather than an alarm —
              // the HUD is already the accent colour around it.
              icon: <TrashIcon size={IconSize.item} color={DANGER} />,
              label: `Delete ${picked.length}`,
              title: 'Delete the selected files from this machine',
              separator: true,
              onClick: () => setPendingDelete(picked),
            },
          ]}
        />
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          danger
          title={pendingDelete.length === 1
            ? 'Delete this artifact?'
            : `Delete ${pendingDelete.length} artifacts?`}
          message={
            (pendingDelete.length === 1
              ? `${pendingNames[0]} (${bytes(pendingBytes)}) will be removed from this machine.`
              : `${pendingDelete.length} files totalling ${bytes(pendingBytes)} will be removed `
                + 'from this machine.')
            + ' This cannot be undone, and a dump collected from a pod that has since been '
            + 'replaced cannot be collected again.'
          }
          confirmLabel={pendingDelete.length === 1 ? 'Delete' : `Delete ${pendingDelete.length}`}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(undefined)}
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
