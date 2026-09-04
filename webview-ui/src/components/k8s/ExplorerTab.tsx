/**
 * The pod's filesystem, browsed.
 *
 * A pod with a volume mounted on it is a filesystem you cannot see. Logs got a
 * search long ago; files never did, and the answer was a remembered
 * `kubectl exec ... -- find / -name` typed twice because the first one had a
 * typo.
 *
 * Everything here is one `kubectl exec` running a command the container may not
 * have, so the failure states are not an afterthought — a distroless image
 * genuinely cannot do any of this, and saying "this image has no shell" is a
 * different message from "that directory is empty". The host translates those;
 * this renders what it says.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PathBreadcrumbView, FileBrowserView, SearchInputView, SegmentedControlView,
  EmptyStateView,
  type FileBrowserEntry, type FileBrowserAction,
} from '@salilvnair/dui';
import {
  EyeIcon, DownloadIcon, RefreshIcon, SearchIcon, LockIcon,
} from '../../icons';
import { postMsg } from '../../vscode';
import { FileViewer } from './FileViewer';
import { DownloadsPanel } from './DownloadsPanel';
import { CapabilityPanel, capabilitiesFrom } from './CapabilityPanel';
import { useDk8sFilesStore, listenForDownloads } from '../../store/dk8s-files-store';

export interface ExplorerEntry {
  name: string;
  path: string;
  kind: 'file' | 'dir' | 'link' | 'other';
  size?: number;
  modified?: string;
  linkTarget?: string;
}

interface Listing {
  path: string;
  entries: ExplorerEntry[];
  command: string;
  error?: string;
}

interface Hits {
  hits: { path: string; name: string }[];
  capped: boolean;
  command: string;
  error?: string;
}

const ACCENT = 'var(--color-dk8s)';

/*
  Where to start.

  `/` is technically right and practically useless — it opens on `bin`, `dev`,
  `proc` and the rest of the image, which is never what anyone came for. These
  are the paths a mounted volume actually lands on, tried in order, and the
  first that lists wins. Falling back to `/` when none of them exist keeps the
  view working on a pod with no volume at all.
*/
const LIKELY_ROOTS = ['/data', '/var/lib', '/mnt', '/opt', '/app', '/'];

export function ExplorerTab({ context, namespace, pod, container }: {
  context: string; namespace: string; pod: string; container?: string;
}) {
  const [mode, setMode] = useState<'files' | 'search' | 'downloads' | 'access'>('files');
  const [path, setPath] = useState<string>('');
  const [listing, setListing] = useState<Listing | null>(null);
  const [hits, setHits] = useState<Hits | null>(null);
  const [pattern, setPattern] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ path: string; name: string; size?: number } | null>(null);
  const seq = useRef(0);
  const unseen = useDk8sFilesStore(s => s.unseen);

  // Registered once, at module scope inside the store, so a copy that is still
  // running survives navigating away from this tab.
  useEffect(() => { listenForDownloads(); }, []);

  const target = { context, namespace, pod, container };

  const request = useCallback(<T,>(type: string, body: Record<string, unknown>): Promise<T> => {
    const requestId = `fx-${++seq.current}`;
    return new Promise(resolve => {
      /*
        Resolve on timeout rather than reject.

        A listing that never comes back is a container that is wedged or a
        `find` still walking a very large volume, and the honest outcome is a
        message saying we asked and heard nothing — not an unhandled rejection
        in the console and a spinner that never stops.
      */
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMsg);
        resolve({ error: 'The pod did not answer in time.' } as T);
      }, 30_000);
      const onMsg = (e: MessageEvent) => {
        if (e.data?.type !== type || e.data?.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        resolve(e.data as T);
      };
      window.addEventListener('message', onMsg);
      postMsg({ type, requestId, ...target, ...body });
    });
  }, [context, namespace, pod, container]);

  const go = useCallback(async (to: string) => {
    setBusy(true);
    setPath(to);
    const r = await request<Listing>('files:list', { path: to });
    setListing(r);
    setBusy(false);
  }, [request]);

  /*
    Find somewhere worth opening on, once.

    Each candidate is a real `ls`, so this is a handful of execs on first open
    and none afterwards. Worth it: landing on `/` means the first thing anyone
    sees is the operating system rather than their data.
  */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      for (const candidate of LIKELY_ROOTS) {
        const r = await request<Listing>('files:list', { path: candidate });
        if (cancelled) return;
        if (!r.error && r.entries?.length) {
          setPath(candidate);
          setListing(r);
          setBusy(false);
          return;
        }
        // A path that exists but is empty still beats falling through to `/`.
        if (!r.error && candidate !== '/') {
          setPath(candidate);
          setListing(r);
          setBusy(false);
          return;
        }
      }
      if (!cancelled) {
        const r = await request<Listing>('files:list', { path: '/' });
        setPath('/');
        setListing(r);
        setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [request]);

  const runSearch = useCallback(async () => {
    if (!pattern.trim()) { setHits(null); return; }
    setBusy(true);
    const r = await request<Hits>('files:search', { root: path || '/', pattern });
    setHits(r);
    setBusy(false);
  }, [request, pattern, path]);

  const actions: FileBrowserAction[] = [
    {
      id: 'open', label: 'Open in the viewer', tone: 'accent',
      icon: <EyeIcon size={12} />,
      // A folder opens by clicking its name; the eye is for files that can be
      // rendered, and its absence is how a row says nothing here can show it.
      show: e => e.kind === 'file' && e.badge !== 'binary' && e.badge !== 'too large',
    },
    {
      id: 'save', label: 'Save to disk',
      icon: <DownloadIcon size={12} />,
      show: e => e.kind === 'file',
    },
    {
      id: 'saveDir', label: 'Download this directory', tone: 'success',
      icon: <DownloadIcon size={12} />,
      show: e => e.kind === 'dir',
    },
  ];

  const onAction = (id: string, e: FileBrowserEntry) => {
    const full = (e as FileBrowserEntry & { fullPath?: string }).fullPath ?? e.name;
    if (id === 'open') setOpen({ path: full, name: e.name, size: e.size });
    else if (id === 'save') postMsg({ type: 'files:download', ...target, path: full, name: e.name });
    else if (id === 'saveDir') postMsg({ type: 'files:downloadDir', ...target, path: full, name: e.name });
  };

  const rows: FileBrowserEntry[] = (listing?.entries ?? []).map(e => {
    const k = kindBadge(e);
    return {
      id: e.path,
      name: e.name,
      kind: e.kind,
      size: e.size,
      modified: e.modified,
      linkTarget: e.linkTarget,
      badge: k.badge,
      badgeTone: k.tone,
      fullPath: e.path,
    } as FileBrowserEntry & { fullPath: string };
  });

  const hitRows: FileBrowserEntry[] = (hits?.hits ?? []).map(h => {
    const k = kindBadge({ name: h.name, kind: 'file' });
    return {
      id: h.path,
      name: h.path,
      kind: 'file',
      badge: k.badge,
      badgeTone: k.tone,
      fullPath: h.path,
    } as FileBrowserEntry & { fullPath: string };
  });

  const error = mode === 'files' ? listing?.error : hits?.error;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── bar ── */}
      <div className="flex items-center gap-3 px-3 py-2 flex-shrink-0 flex-wrap"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <SegmentedControlView
          options={[
            { value: 'files', label: 'Files' },
            { value: 'search', label: 'Search' },
            { value: 'downloads', label: unseen ? `Downloads (${unseen})` : 'Downloads' },
            { value: 'access', label: 'Access' },
          ]}
          value={mode}
          onChange={v => setMode(v as typeof mode)}
          size="sm" density="compact" accentColor={ACCENT}
        />
        <button
          type="button"
          onClick={() => (mode === 'files' ? go(path) : runSearch())}
          title="Run it again"
          aria-label="Refresh"
          className="flex items-center justify-center rounded-md"
          style={{
            width: 24, height: 22, cursor: 'pointer',
            color: 'var(--color-text-muted)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
          }}
        >
          <RefreshIcon size={12} />
        </button>
        <span className="flex-1" />
        {busy && (
          <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
            asking the pod…
          </span>
        )}
      </div>

      {/* ── path, and the query when searching ── */}
      {(mode === 'files' || mode === 'search') && (
      <div className="flex items-center gap-3 px-3 py-1.5 flex-shrink-0 flex-wrap"
           style={{
             gap: '9px 14px',
             borderBottom: '1px solid var(--color-surface-border)',
             background: 'var(--color-panel)',
           }}>
        <span style={{ display: 'flex', alignItems: 'center', flex: '0 1 auto', minWidth: 0 }}>
          <PathBreadcrumbView
            path={path || '/'}
            onNavigate={p => { setMode('files'); go(p); }}
            onSubmit={p => { setMode('files'); go(p.startsWith('/') ? p : `/${p}`); }}
            size="sm"
            color={ACCENT}
          />
        </span>

        {mode === 'search' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 320px', minWidth: 0 }}>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <SearchInputView
                value={pattern}
                onChange={setPattern}
                placeholder="Name to look for — *invoice*"
                size="sm"
              />
            </span>
            <button
              type="button"
              onClick={runSearch}
              className="flex items-center gap-1.5 rounded-md px-2 py-1"
              style={{
                fontSize: 10.5, cursor: 'pointer', whiteSpace: 'nowrap',
                color: ACCENT,
                background: `color-mix(in srgb, ${ACCENT} 13%, transparent)`,
                border: `1px solid color-mix(in srgb, ${ACCENT} 34%, transparent)`,
              }}
            >
              <SearchIcon size={11} /> Search
            </button>
          </span>
        )}
      </div>
      )}

      {/* ── body ── */}
      {mode === 'downloads' ? (
        <DownloadsPanel />
      ) : mode === 'access' ? (
        <CapabilityPanel
          capabilities={capabilitiesFrom({
            listed: !!listing && !listing.error,
            listError: listing?.error,
          })}
          onRecheck={() => go(path || '/')}
        />
      ) : error ? (
        <div className="flex-1 min-h-0 grid place-items-center px-8">
          <div style={{ maxWidth: 520 }}>
            <EmptyStateView
              variant="medallion"
              icon={<LockIcon size={22} />}
              title="This pod will not open its filesystem"
              message={error}
              accentColor="var(--color-warning)"
              action={{ label: 'Try again', onClick: () => go(path || '/') }}
            />
            {(listing?.command || hits?.command) && (
              /*
                The command that failed, kept.

                Every other dk8s view shows what it ran, and an error is
                exactly when that matters most — half of these are fixed by
                noticing the namespace or the container is wrong.
              */
              <p className="text-[9.5px] font-mono text-center m-0 mt-4 px-4 py-2 rounded-md"
                 style={{
                   color: 'var(--color-text-muted)', overflowWrap: 'anywhere',
                   background: 'var(--color-surface)',
                   border: '1px solid var(--color-surface-border)',
                 }}>
                {listing?.command || hits?.command}
              </p>
            )}
          </div>
        </div>
      ) : mode === 'files' ? (
        <FileBrowserView
          className="flex-1 min-h-0"
          entries={rows}
          onParent={path && path !== '/' ? () => go(parentOf(path)) : undefined}
          onOpen={e => {
            if (e.kind === 'dir') go((e as FileBrowserEntry & { fullPath: string }).fullPath);
            else if (actions[0].show?.(e)) onAction('open', e);
          }}
          actions={actions}
          onAction={onAction}
          accentColor={ACCENT}
          size="sm"
          emptyText={busy ? 'asking the pod…' : 'This directory is empty.'}
          footer={listing && (
            <>
              {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
              {' · '}
              <span style={{ opacity: 0.75 }}>{listing.command}</span>
            </>
          )}
        />
      ) : (
        <FileBrowserView
          className="flex-1 min-h-0"
          entries={hitRows}
          actions={actions.filter(a => a.id !== 'saveDir')}
          onAction={onAction}
          onOpen={e => onAction('open', e)}
          showHeader={false}
          accentColor={ACCENT}
          size="sm"
          emptyText={
            busy ? 'searching…'
              : pattern ? 'Nothing matched that name.'
                : 'Type a name to look for. The search starts at the path above.'
          }
          footer={hits && (
            <>
              {hits.hits.length} {hits.hits.length === 1 ? 'match' : 'matches'}
              {hits.capped && (
                <span style={{ color: 'var(--color-warning)' }}>
                  {' '}· capped — narrow the pattern or the start path to see the rest
                </span>
              )}
              {' · '}<span style={{ opacity: 0.75 }}>{hits.command}</span>
            </>
          )}
        />
      )}

      {open && (
        <FileViewer
          {...target}
          path={open.path}
          name={open.name}
          size={open.size}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** The badge a row wears, and how loudly. */
function kindBadge(e: { name: string; kind: string; size?: number }): {
  badge?: string; tone?: FileBrowserEntry['badgeTone'];
} {
  if (e.kind === 'dir') return {};
  const dot = e.name.lastIndexOf('.');
  const ext = dot > 0 ? e.name.slice(dot + 1).toLowerCase() : '';
  const TEXTY = /^(properties|conf|cfg|ini|env|yaml|yml|json|xml|csv|tsv|sh|bash|sql|md|log|txt|toml|out|err)$/;
  if (TEXTY.test(ext)) return { badge: ext, tone: 'info' };
  if (!ext) return { badge: 'file', tone: 'neutral' };
  if (/^(jar|db|sqlite|bin|so|gz|zip|tar|png|jpg|pdf|class|war)$/.test(ext)) {
    return { badge: 'binary', tone: 'neutral' };
  }
  return { badge: ext, tone: 'info' };
}

function parentOf(p: string): string {
  const clean = p.replace(/\/+$/, '');
  const cut = clean.lastIndexOf('/');
  return cut <= 0 ? '/' : clean.slice(0, cut);
}
