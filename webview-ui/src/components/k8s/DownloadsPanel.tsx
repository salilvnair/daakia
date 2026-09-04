/**
 * What came out of the pod, and where it went.
 *
 * A download nobody can find is a download done twice, so the folder path is
 * printed rather than implied. And a failure carries its reason in the row
 * rather than in a toast that has already gone — "this container has no tar"
 * is the whole diagnosis, and it is worth nothing if it appears for four
 * seconds while somebody is looking at the file list.
 */
import { useEffect } from 'react';
import { EmptyStateView } from '@salilvnair/dui';
import { DownloadIcon, FolderOpenIcon, CloseIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useDk8sFilesStore, type Download } from '../../store/dk8s-files-store';

const ACCENT = 'var(--color-dk8s)';

function bytes(v?: number): string {
  if (v === undefined) return '—';
  if (v < 1024) return `${v} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  return `${(v / 1024 ** 3).toFixed(2)} GB`;
}

function folderOf(dest: string): string {
  const cut = Math.max(dest.lastIndexOf('/'), dest.lastIndexOf('\\'));
  return cut > 0 ? dest.slice(0, cut) : dest;
}

export function DownloadsPanel() {
  const downloads = useDk8sFilesStore(s => s.downloads);
  const markSeen = useDk8sFilesStore(s => s.markSeen);
  const clearFinished = useDk8sFilesStore(s => s.clearFinished);

  // Opening the list is what "seen" means; there is nothing else to read.
  useEffect(() => { markSeen(); }, [markSeen]);

  const folder = downloads.length ? folderOf(downloads[0].dest) : '';
  const done = downloads.filter(d => d.state !== 'running').length;

  if (!downloads.length) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center px-8">
        <EmptyStateView
          variant="medallion"
          icon={<DownloadIcon size={22} />}
          title="Nothing downloaded yet"
          message="Anything you save from Files or Search lands here, with the folder it went to."
          accentColor={ACCENT}
          hints={[
            { key: 'eye', text: 'opens a file in the viewer without downloading it' },
            { key: 'arrow', text: 'saves it to disk — streamed, so size is not a problem' },
            { key: 'folder', text: 'a whole directory, which is the one action needing tar' },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-3 px-3 py-1.5 flex-shrink-0 flex-wrap"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {downloads.length} {downloads.length === 1 ? 'download' : 'downloads'}
        </span>
        <span className="flex-1" />
        {folder && (
          <button
            type="button"
            onClick={() => postMsg({ type: 'files:revealFolder', path: folder })}
            className="flex items-center gap-1.5 rounded-md px-2 py-1"
            style={{
              fontSize: 10, cursor: 'pointer', color: 'var(--color-text-secondary)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-surface-border)',
            }}
          >
            <FolderOpenIcon size={11} /> Show folder
          </button>
        )}
        {done > 0 && (
          <button
            type="button"
            onClick={clearFinished}
            title="Clear the finished rows — anything still copying stays"
            className="flex items-center gap-1.5 rounded-md px-2 py-1"
            style={{
              fontSize: 10, cursor: 'pointer', color: 'var(--color-text-muted)',
              background: 'transparent',
              border: '1px solid var(--color-surface-border)',
            }}
          >
            <CloseIcon size={10} /> Clear
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {downloads.map(d => <Row key={d.id} d={d} />)}
      </div>

      {folder && (
        <div className="px-3 py-2 flex-shrink-0 text-[10px] font-mono"
             style={{
               borderTop: '1px solid var(--color-surface-border)',
               color: 'var(--color-text-muted)', overflowWrap: 'anywhere',
             }}>
          {folder}
        </div>
      )}
    </div>
  );
}

function Row({ d }: { d: Download }) {
  const tone = d.state === 'failed' ? 'var(--color-error)'
    : d.state === 'done' ? 'var(--color-success)'
      : ACCENT;

  return (
    <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-[11.5px] font-mono" style={{ color: 'var(--color-text-primary)' }}>
          {d.name}
        </span>
        {d.directory && (
          <Chip tone="var(--color-warning)">directory</Chip>
        )}
        <Chip tone={tone}>
          {d.state === 'running' ? 'copying' : d.state === 'done' ? 'done' : 'failed'}
        </Chip>
        <span className="flex-1" />
        <span className="text-[10px] font-mono tabular-nums"
              style={{ color: 'var(--color-text-muted)' }}>
          {d.state === 'done' ? bytes(d.bytes) : ''}
        </span>
      </div>

      {/*
        A running copy gets an indeterminate bar rather than a percentage.
        `cat` over exec does not report a total, so any percentage here would
        be invented — and a progress bar that lies is worse than one that only
        says "still going".
      */}
      {d.state === 'running' && (
        <div style={{
          marginTop: 6, height: 3, borderRadius: 2, overflow: 'hidden',
          background: 'var(--color-surface-hover)',
        }}>
          <div style={{
            height: '100%', width: '35%', borderRadius: 2, background: ACCENT,
            animation: 'dk8s-slide 1.1s ease-in-out infinite',
          }} />
        </div>
      )}

      {d.error && (
        <p className="text-[10.5px] leading-relaxed m-0 mt-1.5"
           style={{ color: 'var(--color-error)' }}>{d.error}</p>
      )}

      {d.state === 'done' && (
        <p className="text-[9.5px] font-mono m-0 mt-1"
           style={{ color: 'var(--color-text-muted)', overflowWrap: 'anywhere' }}>
          {d.dest}
        </p>
      )}
    </div>
  );
}

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 8.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase',
      padding: '1.5px 6px', borderRadius: 4, whiteSpace: 'nowrap',
      color: tone,
      background: `color-mix(in srgb, ${tone} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${tone} 30%, transparent)`,
    }}>{children}</span>
  );
}
