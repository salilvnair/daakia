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
  PathBreadcrumbView, FileBrowserView, SearchFieldView, SegmentedControlView,
  EmptyStateView, SelectInputView, ContextMenuView, ModalView, ButtonView,
  type ContextMenuItem,
  type FileBrowserEntry, type FileBrowserAction,
} from '@salilvnair/dui';
import {
  ExternalLinkIcon, DownloadIcon, SearchIcon, LockIcon, ArrowToLeftIcon, FolderOpenIcon,
  RefreshIcon,
  CopyIcon, InfoCircleIcon, FileSearchIcon,
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
  /** Visible in the listing, unreadable by the user this container runs as. */
  denied?: boolean;
  mode?: string;
  owner?: string;
  group?: string;
  /** What a symlink resolves to; absent when it is broken. */
  linkKind?: 'file' | 'dir' | 'link' | 'other';
}

interface Listing {
  path: string;
  entries: ExplorerEntry[];
  command: string;
  error?: string;
}

interface PodMount {
  path: string;
  source: string;
  kind: 'pvc' | 'config' | 'secret' | 'ephemeral' | 'host' | 'other';
  readOnly: boolean;
  container: string;
}

/**
 * The deepest mount containing this path.
 *
 * Deepest because mounts nest — a claim on `/data` and a ConfigMap on
 * `/data/conf` both contain `/data/conf/app.yaml`, and the ConfigMap is what
 * actually provides it. The boundary check keeps `/data` from claiming
 * `/database`, which a bare `startsWith` would do.
 */
export function mountFor(mounts: PodMount[], path: string): PodMount | undefined {
  let best: PodMount | undefined;
  for (const m of mounts) {
    const pre = m.path.endsWith('/') ? m.path : `${m.path}/`;
    if (path !== m.path && !path.startsWith(pre)) continue;
    if (!best || m.path.length > best.path.length) best = m;
  }
  return best;
}

interface Hits {
  hits: { path: string; name: string; size?: number; modified?: string }[];
  capped: boolean;
  command: string;
  error?: string;
}

const ACCENT = 'var(--color-dk8s)';

/**
 * The longest plain run in a pattern, for highlighting.
 *
 * A search pattern is a glob or a regex; a highlight needs literal text. This
 * takes the longest stretch with no metacharacter in it, which for `*invoice*`
 * is `invoice`, for `inv[0-9]+\.pdf` is `inv`, and for a bare word is the
 * word. Longest rather than first because the informative part of a pattern is
 * usually its longest literal — `.*application` should mark `application`,
 * not nothing.
 */
export function literalOf(pattern: string): string {
  const runs = pattern.split(/[*?\[\]().+^$|{}\\]+/).filter(Boolean);
  return runs.reduce((best, r) => (r.length > best.length ? r : best), '');
}

/** Mirrors the host's `maxDepth` default in pod-files.ts — shown, not guessed. */
const SEARCH_DEPTH = 8;

const MOUNT_TONE: Record<PodMount['kind'], string> = {
  pvc: 'var(--color-success)',
  config: 'var(--color-info, #3fb9cc)',
  secret: 'var(--color-warning)',
  ephemeral: 'var(--color-text-muted)',
  host: 'var(--color-warning)',
  other: 'var(--color-text-muted)',
};

/** What is behind this directory, named rather than described. */
function MountChip({ mount }: { mount: PodMount }) {
  const c = MOUNT_TONE[mount.kind];
  return (
    <span
      title={`${mount.path} is ${mount.source}${mount.readOnly ? ', mounted read-only' : ''}`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        lineHeight: 1, height: 17,
        fontSize: 8, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
        padding: '0 5px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0,
        fontFamily: 'ui-monospace, monospace',
        color: c,
        background: `color-mix(in srgb, ${c} 15%, transparent)`,
        border: `1px solid color-mix(in srgb, ${c} 32%, transparent)`,
        boxShadow: `inset 0 1px 0 color-mix(in srgb, ${c} 22%, transparent)`,
      }}
    >{mount.source}</span>
  );
}

/**
 * How deep to walk, as a control rather than a statement.
 *
 * The values stop at 12 rather than offering "unlimited". A PersistentVolume
 * can hold millions of files and an uncapped walk on a pod that is already
 * struggling is a real way to make an incident worse — so the deepest choice
 * is still a cap, and the UI never offers to remove it.
 */
function DepthPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span title="How many directories deep the walk goes">
      <SelectInputView
        value={String(value)}
        onChange={v => onChange(Number(v))}
        options={[2, 4, 6, 8, 12].map(d => ({ value: String(d), label: `depth ${d}` }))}
        /*
          The same size token as the field beside it.

          dui sizes every control off one scale, so `sm` here and `sm` there is
          what keeps a row of controls on one baseline — an `xs` select next to
          an `sm` input is two heights on one line, and the eye reads that as a
          mistake before it reads either control.
        */
        size="sm"
        width={112}
        accentColor={ACCENT}
      />
    </span>
  );
}

/** One of the query's bounds, worn beside the box that sets the rest of it. */
function Cap({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      /*
        A raised dark pill, the way the plan draws it — not a tinted wash.
        These are bounds on the query, not findings, so they take no hue at
        all; the lift comes from a lighter surface than the row behind it plus
        one hairline along the top edge.
      */
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      lineHeight: 1, height: 17,
      fontSize: 8, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
      padding: '0 5px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0,
      fontFamily: 'ui-monospace, monospace',
      color: 'var(--color-text-muted)',
      background: 'var(--color-surface-hover)',
      border: '1px solid var(--color-surface-border)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,.045)',
    }}>{children}</span>
  );
}

/*
  Where to start.

  `/` is technically right and practically useless — it opens on `bin`, `dev`,
  `proc` and the rest of the image, which is never what anyone came for. These
  are the paths a mounted volume actually lands on, tried in order, and the
  first that lists wins. Falling back to `/` when none of them exist keeps the
  view working on a pod with no volume at all.
*/
const LIKELY_ROOTS = ['/data', '/var/lib', '/mnt', '/opt', '/app', '/'];

export function ExplorerTab({ context, namespace, pod, container, initialPath,
  highlight, onBackToSearch }: {
  context: string; namespace: string; pod: string; container?: string;
  /**
   * Open here instead of probing for a volume.
   *
   * Set when something already knows where to go — a file-search hit is a
   * place, and making the reader navigate back to the directory they just
   * searched throws away the entire value of finding it.
   */
  initialPath?: string;
  /** The file to flash once the listing arrives. */
  highlight?: string;
  /** Offer a way back to the search this came from. */
  onBackToSearch?: () => void;
}) {
  const [mode, setMode] = useState<'files' | 'search' | 'downloads' | 'access'>('files');
  /*
    Typing a path needs room the chain does not.

    The chain is as wide as its segments and no wider, which is right when it
    is a row of jump targets. The moment it becomes a text field it is the
    thing being used, and sharing a line with a search box that still holds its
    full width leaves a few characters to type an absolute path into. So the
    field takes 70% and the query squeezes — for exactly as long as the edit
    lasts.
  */
  const [pathEditing, setPathEditing] = useState(false);
  /*
    What is mounted where, asked once per pod.

    A path inside a container tells you nothing about where its contents come
    from, and that is the difference between a directory baked into the image
    — gone on restart — and one backed by a claim, which is usually the reason
    anyone opened this tab. It comes from the pod spec rather than an exec, so
    it also answers on images where nothing else here can.
  */
  const [mounts, setMounts] = useState<PodMount[]>([]);
  /*
    The depth cap, adjustable rather than announced.

    It was printed beside the query as a fact, which told you why a result
    might be short and gave you nothing to do about it. Depth is the one cap
    worth reaching for: a file six levels down in a volume whose shape you know
    is a different search from a blind walk of the whole tree, and the cost of
    the deeper walk is real enough that it should be a choice.
  */
  const [depth, setDepth] = useState(SEARCH_DEPTH);
  /*
    The menu, and the row it was opened over.

    Two icons fit on a row before it turns into a toolbar, so the row carries
    the verbs people use every time — read it, save it — and everything else
    lives here. The entry is captured with the position: the list can re-render
    under an open menu, and a menu that acted on "whatever is selected now"
    would act on the wrong file the moment it did.
  */
  const [menu, setMenu] = useState<
    { entry: FileBrowserEntry | null; x: number; y: number } | null>(null);
  /** The folder a scoped search was opened on, or none. */
  const [scopedSearch, setScopedSearch] = useState<string | null>(null);
  const [info, setInfo] = useState<FileBrowserEntry | null>(null);
  const [path, setPath] = useState<string>('');
  const [listing, setListing] = useState<Listing | null>(null);
  const [hits, setHits] = useState<Hits | null>(null);
  const [pattern, setPattern] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ path: string; name: string; size?: number } | null>(null);
  const [selected, setSelected] = useState<string | undefined>();
  /*
    The arriving flash, cleared on a timer.

    Long enough to find with the eye, short enough that it stops competing
    with whatever the reader selects next — a highlight that never fades is
    just a second selection nobody asked for.
  */
  const [flash, setFlash] = useState<string | undefined>(highlight);
  useEffect(() => {
    setFlash(highlight);
    if (!highlight) return;
    /*
      The flash fades; the selection does not.

      Arriving on a row and having it go quiet after two seconds leaves you
      exactly where you started — knowing a file is somewhere on this screen
      and not which one. The flash finds it, the selection keeps it found.
    */
    setSelected(highlight);
    const t = setTimeout(() => setFlash(undefined), 2600);
    return () => clearTimeout(t);
  }, [highlight]);
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

  // Asked once per pod: the spec does not change while the tab is open.
  useEffect(() => {
    let live = true;
    void request<{ mounts?: PodMount[] }>('files:mounts', {})
      .then(r => { if (live) setMounts(r.mounts ?? []); })
      .catch(() => { /* a pod we cannot describe simply has no chips */ });
    return () => { live = false; };
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
      if (initialPath) {
        // Somebody already knows the answer; probing would only be slower and
        // could land somewhere else.
        const r = await request<Listing>('files:list', { path: initialPath });
        if (cancelled) return;
        setPath(initialPath);
        setListing(r);
        setBusy(false);
        return;
      }
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
  }, [request, initialPath]);

  const runSearch = useCallback(async () => {
    if (!pattern.trim()) { setHits(null); return; }
    setBusy(true);
    const r = await request<Hits>('files:search', { root: path || '/', pattern, maxDepth: depth });
    setHits(r);
    setBusy(false);
  }, [request, pattern, path]);

  const actions: FileBrowserAction[] = [
    {
      id: 'open', label: 'Open in the viewer', tone: 'accent',
      icon: <ExternalLinkIcon size={12} />,
      // A folder opens by clicking its name; the eye is for files that can be
      // rendered, and its absence is how a row says nothing here can show it.
      /*
        A symlink counts as whatever it points at.

        `cat` follows a link without being asked, so reading one through a link
        to a FILE always worked and the actions were simply never offered —
        which mattered, because a ConfigMap mount projects every key as a
        symlink and that made the whole of /config unopenable.

        But a link to a DIRECTORY is a directory, and offering to view it ran
        `cat /bin` and returned "Is a directory": an error the reader can do
        nothing with, on a row that should have opened as a folder. So the
        resolved kind decides, and a broken link — one that resolves to nothing
        — offers neither.
      */
      show: e => fileLike(e) && e.badge !== 'binary' && e.badge !== 'too large',
    },
    {
      id: 'save', label: 'Save to disk',
      icon: <DownloadIcon size={12} />,
      show: e => fileLike(e),
    },
    {
      id: 'saveDir', label: 'Download this directory', tone: 'success',
      icon: <DownloadIcon size={12} />,
      show: e => dirLike(e),
    },
  ];

  const onAction = (id: string, e: FileBrowserEntry) => {
    const full = (e as FileBrowserEntry & { fullPath?: string }).fullPath ?? e.name;
    if (id === 'open') setOpen({ path: full, name: e.name, size: e.size });
    else if (id === 'save') postMsg({ type: 'files:download', ...target, path: full, name: e.name });
    else if (id === 'saveDir') postMsg({ type: 'files:downloadDir', ...target, path: full, name: e.name });
  };

  /*
    The menu is built from the same predicates the row icons use.

    A menu offering "Open in the viewer" on a binary, or a directory download
    on a file, would be a second answer to a question the row has already
    answered by NOT showing the icon — and the two disagreeing is how a menu
    stops being trusted.
  */
  const menuFor = (e: FileBrowserEntry): ContextMenuItem[] => {
    const can = (id: string) => {
      const a = actions.find(x => x.id === id);
      return !!a && (!a.show || a.show(e));
    };
    /*
      Every icon carries its verb's colour.

      A column of grey glyphs is a column of shapes to decode; the same set in
      the colours the rest of the panel already uses for those actions — the
      accent for reading, green for downloading, amber for navigating — is
      scannable without reading the labels at all, and matches what the row
      icons beside it are already doing.
    */
    return [
      ...(can('open') ? [{
        id: 'open', label: 'Open as text',
        icon: <ExternalLinkIcon size={12} />, iconColor: ACCENT,
      }] : []),
      ...(dirLike(e) ? [{
        id: 'go', label: 'Open folder',
        icon: <FolderOpenIcon size={12} />, iconColor: 'var(--color-warning)',
      }] : []),
      ...(dirLike(e) ? [{
        id: 'searchHere', label: 'Search in this folder',
        icon: <SearchIcon size={12} />, iconColor: 'var(--color-info, #3fb9cc)',
      }] : []),
      ...(can('save') ? [{
        id: 'save', label: 'Download',
        icon: <DownloadIcon size={12} />, iconColor: 'var(--color-success)',
      }] : []),
      ...(can('saveDir') ? [{
        id: 'saveDir', label: 'Download this directory',
        icon: <DownloadIcon size={12} />, iconColor: 'var(--color-success)',
      }] : []),
      { id: 'sep', label: '', separator: true },
      {
        id: 'copy', label: 'Copy path',
        icon: <CopyIcon size={12} />, iconColor: 'var(--color-text-secondary)',
      },
      {
        id: 'info', label: 'Get Info',
        icon: <InfoCircleIcon size={12} />, iconColor: 'var(--color-primary-light)',
      },
    ];
  };

  /*
    The directory itself, right-clicked where there is no row.

    The empty space below the last entry is still this directory, and acting on
    it there is what a file manager has always allowed. Without this the
    browser's own menu appeared, offering Copy and Select All over a list that
    has neither.
  */
  const emptyMenu = (): ContextMenuItem[] => [
    {
      id: 'searchHere', label: 'Search in this folder',
      icon: <SearchIcon size={12} />, iconColor: 'var(--color-info, #3fb9cc)',
      onClick: () => { setMenu(null); setScopedSearch(path || '/'); },
    },
    {
      id: 'refresh', label: 'Refresh',
      icon: <RefreshIcon size={12} />, iconColor: ACCENT,
      onClick: () => { setMenu(null); go(path || '/'); },
    },
    {
      id: 'up', label: 'Go up one',
      icon: <ArrowToLeftIcon size={12} />, iconColor: 'var(--color-warning)',
      disabled: !path || path === '/',
      onClick: () => { setMenu(null); go(parentOf(path)); },
    },
    { id: 'sep', label: '', separator: true },
    {
      id: 'saveDir', label: 'Download this directory',
      icon: <DownloadIcon size={12} />, iconColor: 'var(--color-success)',
      onClick: () => {
        setMenu(null);
        postMsg({ type: 'files:downloadDir', ...target, path: path || '/', name: (path || '/').split('/').pop() || 'root' });
      },
    },
    {
      id: 'copy', label: 'Copy this path',
      icon: <CopyIcon size={12} />, iconColor: 'var(--color-text-secondary)',
      onClick: () => { setMenu(null); void navigator.clipboard?.writeText(path || '/'); },
    },
  ];

  const onMenuPick = (id: string, e: FileBrowserEntry) => {
    setMenu(null);
    if (id === 'go') { setMode('files'); go(fullOf(e)); return; }
    if (id === 'searchHere') { setScopedSearch(fullOf(e)); return; }
    if (id === 'copy') { void navigator.clipboard?.writeText(fullOf(e)); return; }
    if (id === 'info') { setInfo(e); return; }
    onAction(id, e);
  };

  const here = mountFor(mounts, path || '/');

  const rows: FileBrowserEntry[] = (listing?.entries ?? []).map(e => {
    const k = e.denied
      ? { badge: 'no permission', tone: 'danger' as const }
      : kindBadge(e);
    return {
      id: e.path,
      name: e.name,
      kind: e.kind,
      /*
        A row we can see and cannot open keeps its place with its reason.
        FileBrowserView draws a `disabledReason` as a locked, dimmed row and
        withholds the actions, which is the honest shape: the file is there,
        and this is why nothing will open it.
      */
      disabledReason: e.denied
        ? `Owned by uid ${e.owner ?? '?'}, mode ${e.mode ?? '?'} — the user this`
          + ' container runs as cannot read it. It is here; it will not open.'
        : undefined,
      size: e.size,
      modified: e.modified,
      linkTarget: e.linkTarget,
      linkKind: e.linkKind,
      badge: k.badge,
      badgeTone: k.tone,
      fullPath: e.path,
      // Carried for Get Info, which is the only thing that shows them: a
      // column of modes would be noise on every row to answer a question
      // asked about one.
      mode: e.mode,
      owner: e.owner,
      group: e.group,
    } as FileBrowserEntry & { fullPath: string };
  });

  const hitRows: FileBrowserEntry[] = (hits?.hits ?? []).map(h => {
    const k = kindBadge({ name: h.name, kind: 'file', size: h.size });
    return {
      id: h.path,
      name: h.path,
      kind: 'file',
      size: h.size,
      badge: k.badge,
      badgeTone: k.tone,
      fullPath: h.path,
    } as FileBrowserEntry & { fullPath: string };
  });

  /*
    A pod that will not list will not search either.

    The search screen has its own error, but only after a search has been run
    — so a pod that is down, distroless or refusing exec showed the cheerful
    "here is how to write a glob" placeholder, which is advice for a screen
    that cannot do anything. The listing already knows; falling back to it
    means the reason arrives before the first attempt rather than after.
  */
  const error = mode === 'files' ? listing?.error : (hits?.error ?? listing?.error);

  return (
    <div className="flex flex-col h-full min-h-0"
         /*
           The type badges take this panel's accent rather than dui's default.
           A file list inside dk8s should look like dk8s, and the badge is the
           one part of the row that carries a colour of its own.
         */
         style={{ ['--dui-file-badge' as string]: ACCENT } as React.CSSProperties}>
      {/* ── bar ── */}
      <div className="flex items-center gap-3 px-3 py-2 flex-shrink-0 flex-wrap"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        {onBackToSearch && (
          <button
            type="button"
            onClick={onBackToSearch}
            title="Back to the search you came from"
            className="flex items-center gap-1.5 rounded-md px-2 py-1"
            style={{
              fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap', color: ACCENT,
              background: `color-mix(in srgb, ${ACCENT} 13%, transparent)`,
              border: `1px solid color-mix(in srgb, ${ACCENT} 34%, transparent)`,
            }}
          >
            <ArrowToLeftIcon size={11} /> Back to search
          </button>
        )}
        <span className="flex-1" />
        {busy && (
          <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
            asking the pod…
          </span>
        )}
        {/*
          The mode strip sits at the right, and there is no refresh beside it.

          Refresh was a second button for something every screen already does:
          Search re-runs on its own button, and a directory re-lists whenever
          you navigate to it — including to the one you are already on. A
          control whose only job is to repeat what the control next to it does
          is a control to remove.
        */}
        <SegmentedControlView
          options={[
            { value: 'files', label: 'Files' },
            { value: 'search', label: 'Search' },
            { value: 'downloads', label: unseen ? `Downloads (${unseen})` : 'Downloads' },
            { value: 'access', label: 'Access' },
          ]}
          value={mode}
          onChange={v => setMode(v as typeof mode)}
          size="xs" density="compact" accentColor={ACCENT}
        />
      </div>

      {/* ── path, and the query when searching ── */}
      {(mode === 'files' || mode === 'search') && (
      <div className="flex items-center gap-3 px-3 py-1.5 flex-shrink-0 flex-wrap"
           /*
             The whole strip arms the path editor, not just the text.

             The chain is as wide as its segments, so on a shallow path most of
             this bar was dead to a double-click and you had to hit `/ > root`
             exactly. The bar is the path's row; double-clicking any of it is
             the same gesture.
           */
           onDoubleClick={e => {
             if ((e.target as HTMLElement).closest('input,button')) return;
             setPathEditing(true);
           }}
           style={{
             gap: '9px 14px',
             borderBottom: '1px solid var(--color-surface-border)',
             background: 'var(--color-panel)',
           }}>
        <span style={{
          display: 'flex', alignItems: 'center', minWidth: 0,
          flex: pathEditing ? '1 1 70%' : '0 1 auto',
        }}>
          <PathBreadcrumbView
            path={path || '/'}
            /*
              The path changes where you are, not which screen you are on.

              Both handlers used to force the Files tab, so clicking a crumb on
              the Search screen threw away the search to show a directory
              listing — the one thing the reader was not asking for. The path
              is shared by both screens precisely because it means the same
              thing on each: on Files it is the directory being listed, on
              Search it is where the walk starts.
            */
            onNavigate={p => go(p)}
            onSubmit={p => go(p.startsWith('/') ? p : `/${p}`)}
            editing={pathEditing}
            onEditingChange={setPathEditing}
            size="sm"
            color={ACCENT}
          />
        </span>

        {/*
          What this directory actually is, at the right of the path.

          It sits opposite the breadcrumb rather than beside it because it
          answers a different question: the path says where you are, the chip
          says what you are standing on. A claim is worth noticing and takes
          the success colour; a ConfigMap or Secret is context and stays quiet.
          No chip means no mount, which is its own answer — whatever is here
          came with the image and goes when the pod does.
        */}
        {mode === 'files' && here && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginLeft: 'auto', flexShrink: 0,
          }}>
            <MountChip mount={here} />
            {here.readOnly && <Cap>read-only</Cap>}
          </span>
        )}

        {mode === 'search' && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
            flex: pathEditing ? '1 1 0%' : '1 1 320px',
          }}>
            {/*
              Enter runs it, and the icon lives inside the box.

              A Search button beside a search field is a second way to do what
              Enter already does, and it was taking width from the field on
              every screen. The icon moves inside and keeps the accent the
              button had, so the field reads as the thing that searches — it
              just stopped being two things. Enter runs it.
            */}
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <SearchFieldView
                value={pattern}
                onChange={setPattern}
                onSearch={runSearch}
                /*
                  Clearing drops the results too.

                  An empty box above a full result list is a screen describing
                  a search whose terms are no longer on it — and the next
                  question is always "what did I search for".
                */
                onClear={() => { setPattern(''); setHits(null); }}
                placeholder="Name, glob or regex — *invoice*, \.ya?ml$ — Enter to search"
                size="sm"
                accentColor={ACCENT}
              />
            </span>
            {/*
              The caps are part of the query, so they are shown next to it.

              A short result list has two very different explanations — there
              are few matches, or the walk stopped early — and without the
              bounds on screen they look identical. Reading pattern, depth and
              type as one line is how you tell a real answer from a narrow one.
            */}
            <DepthPicker value={depth} onChange={setDepth} />
            <Cap>files only</Cap>
          </span>
        )}
      </div>
      )}

      {/*
        ── body ──

        Its own positioning context, because the viewer opens INSIDE it.

        A file opened from the Explorer used to cover the whole tab — the mode
        strip, the path, the query and the results all disappeared behind it,
        so reading one hit meant losing the search that found it and the only
        way back was a close button. Scoped here, the viewer fills the results
        area and nothing above it moves: the path you are in and the query that
        produced the list stay on screen, and closing it puts you back on a
        list that never went anywhere.
      */}
      <div className="flex-1 min-h-0 flex flex-col relative">
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
          // Tight rows, small chips, bare glyphs. A directory of 400 entries
          // is a list you scan, and a box around every icon on every row is
          // more border than content.
          dense
          entries={rows}
          onParent={path && path !== '/' ? () => go(parentOf(path)) : undefined}
          onOpen={e => {
            if (dirLike(e)) go((e as FileBrowserEntry & { fullPath: string }).fullPath);
            else if (actions[0].show?.(e)) onAction('open', e);
          }}
          actions={actions}
          onAction={onAction}
          onSelect={e => setSelected(e.id)}
          onContextMenu={(e, ev) => setMenu({ entry: e, x: ev.clientX, y: ev.clientY })}
          onEmptyContextMenu={ev => setMenu({ entry: null, x: ev.clientX, y: ev.clientY })}
          selectedId={selected}
          highlightId={flash}
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
          dense
          entries={hitRows}
          actions={actions.filter(a => a.id !== 'saveDir')}
          onAction={onAction}
          onOpen={e => onAction('open', e)}
          onSelect={e => setSelected(e.id)}
          onContextMenu={(e, ev) => setMenu({ entry: e, x: ev.clientX, y: ev.clientY })}
          onEmptyContextMenu={ev => setMenu({ entry: null, x: ev.clientX, y: ev.clientY })}
          selectedId={selected}
          /*
            The literal behind the pattern, for the eye only.

            `*invoice*` highlighted as written would match nothing, so the glob
            and regex punctuation comes off and what is left is the run to
            mark. Three weights then say why each row is a result: the
            directory dim, the matched text in the flash colour, the rest of
            the filename bright.
          */
          match={literalOf(pattern)}
          showSize
          showModified={false}
          showHeader={false}
          accentColor={ACCENT}
          size="sm"
          emptyText={
            busy ? 'searching…'
              /*
                Keyed on a search having RUN, not on the box having text.

                It was `pattern ? ...`, so the first keystroke replaced the
                instructions with "Nothing matched that name" — a verdict on a
                search nobody had asked for yet, delivered while the reader was
                still typing the thing they wanted to search for.
              */
              : hits ? (
                <div className="px-8 py-6">
                  <EmptyStateView
                    variant="medallion"
                    icon={<FileSearchIcon size={22} />}
                    title="Nothing matched"
                    message={`No file under ${path || '/'} matched that name.`}
                    accentColor="var(--color-warning)"
                    hints={[
                      { key: 'depth', text: 'the walk stops at the depth beside the box — raise it to look deeper' },
                      { key: 'path', text: 'the search starts at the path above, not at /' },
                      { key: 'glob', text: 'a bare word matches anywhere in the path; *name* matches the filename' },
                    ]}
                  />
                </div>
              )
                : (
                  /*
                    The same medallion the Downloads tab uses. A bare line of
                    grey text in the middle of an empty panel reads as a
                    failure; this reads as a screen waiting to be used, and it
                    has room to say what the box actually accepts — which
                    matters more now that the box takes a regex.
                  */
                  <div className="px-8 py-6">
                    <EmptyStateView
                      variant="medallion"
                      icon={<SearchIcon size={22} />}
                      title="Find a file in this pod"
                      message="One `find`, starting at the path above. Enter runs it."
                      accentColor={ACCENT}
                      /*
                        Plain words as keys, not chips.

                        EmptyStateView draws the key its own box; putting a
                        bordered chip inside a bordered box gave every hint two
                        frames, and the wider ones ran under the text.
                      */
                      hints={[
                        { key: 'glob',
                          text: '*invoice*, *.pdf — matched against the filename' },
                        { key: 'regex',
                          text: 'anything else: \.ya?ml$, inv[0-9]+ — matched against the path' },
                        { key: 'cap',
                          text: 'the depth beside the box, and a result cap — a large volume '
                            + 'cannot be walked forever' },
                      ]}
                    />
                  </div>
                )
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

      <ContextMenuView
        open={!!menu}
        anchorEl={null}
        position={menu ? { x: menu.x, y: menu.y } : undefined}
        onClose={() => setMenu(null)}
        items={!menu ? [] : menu.entry
          ? menuFor(menu.entry).map(i => (i.separator ? i : {
            ...i, onClick: () => onMenuPick(i.id, menu.entry!),
          }))
          : emptyMenu()}
      />

      {scopedSearch !== null && (
        <ScopedSearch
          root={scopedSearch}
          target={target}
          onClose={() => setScopedSearch(null)}
          actions={actions.filter(a => a.id !== 'saveDir')}
          onAction={onAction}
          onContextMenu={(e, ev) => setMenu({ entry: e, x: ev.clientX, y: ev.clientY })}
          selectedId={selected}
          onSelect={e => setSelected(e.id)}
        />
      )}

      {info && <InfoPanel entry={info} mount={mountFor(mounts, fullOf(info))} onClose={() => setInfo(null)} />}
    </div>
  );
}

/**
 * What a row behaves as, following the link if there is one.
 *
 * `kind` says what the entry IS; these say what it points at, which is what
 * every action here actually cares about. A link with no resolved kind is
 * broken — it names something that is not there — and answers false to both,
 * so it offers nothing rather than offering something that will fail.
 */
function resolvedKind(e: FileBrowserEntry): string | undefined {
  const k = e.kind;
  if (k !== 'link') return k;
  return (e as FileBrowserEntry & { linkKind?: string }).linkKind;
}

function fileLike(e: FileBrowserEntry): boolean {
  return resolvedKind(e) === 'file';
}

function dirLike(e: FileBrowserEntry): boolean {
  return resolvedKind(e) === 'dir';
}

/**
 * Search one folder, without leaving the one you are looking at.
 *
 * The Search tab re-roots the whole screen: it takes over the path, replaces
 * the listing with results, and getting back means navigating again. That is
 * right when searching IS the task and wrong when it is a question about one
 * directory you happened to be standing in — "is there a properties file
 * anywhere under /opt" should not cost you /opt.
 *
 * So this is the same `find`, scoped to the folder that was right-clicked,
 * in a dialog you close to find the listing exactly where you left it.
 */
function ScopedSearch({
  root, target, onClose, actions, onAction, onContextMenu, selectedId, onSelect,
}: {
  root: string;
  target: { context: string; namespace: string; pod: string; container?: string };
  onClose: () => void;
  /*
    The Search tab's own actions and menu, handed in rather than rebuilt.

    A second set written for the dialog is a second set to keep in step, and
    the first thing to drift is exactly what makes a row usable: which actions
    a binary gets, what the menu offers on a symlink, whether a click selects.
    Passing them means this list IS the Search list, rooted somewhere else.
  */
  actions: FileBrowserAction[];
  onAction: (id: string, e: FileBrowserEntry) => void;
  onContextMenu: (e: FileBrowserEntry, ev: React.MouseEvent) => void;
  selectedId?: string;
  onSelect: (e: FileBrowserEntry) => void;
}) {
  const [pattern, setPattern] = useState('');
  const [depth, setDepth] = useState(SEARCH_DEPTH);
  const [hits, setHits] = useState<Hits | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const run = () => {
    if (!pattern.trim()) return;
    const requestId = `sx-${++seq.current}`;
    setBusy(true);
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== 'files:search' || e.data?.requestId !== requestId) return;
      window.removeEventListener('message', onMsg);
      setHits(e.data as Hits);
      setBusy(false);
    };
    window.addEventListener('message', onMsg);
    postMsg({ type: 'files:search', requestId, ...target, root, pattern, maxDepth: depth });
  };

  const rows: FileBrowserEntry[] = (hits?.hits ?? []).map(h => {
    const k = kindBadge({ name: h.name, kind: 'file', size: h.size });
    return {
      id: h.path, name: h.path, kind: 'file', size: h.size,
      badge: k.badge, badgeTone: k.tone, fullPath: h.path,
    } as FileBrowserEntry & { fullPath: string };
  });

  return (
    /*
      A popup, and a wide one.

      560px gave a hundred and forty absolute paths a column narrow enough to
      truncate most of them; `inline` fixed the width and lost the popup, which
      pushed the dialog into the page under the listing it was supposed to
      float over. `xxl` is the width, and an explicit height so the result list
      has real space to fill rather than shrink-wrapping to its content.
    */
    <ModalView
      open
      size="xxl"
      height="62vh"
      onClose={onClose}
      title="Search in this folder"
      subtitle={root}
      headerColor={ACCENT}
      footerRight={
        <div className="flex items-center gap-2">
          {hits && (
            <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
              {hits.hits.length} {hits.hits.length === 1 ? 'match' : 'matches'}
              {hits.capped && ' · capped'}
            </span>
          )}
          <ButtonView label="Close" size="sm" variant="secondary" onClick={onClose} />
        </div>
      }
    >
      <div className="flex flex-col gap-3 h-full">
        {/* The scope is the dialog's subtitle now — it belongs to the whole
            screen rather than to the query row, and repeating it beside the
            box cost the box width on the one screen that wants it. */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <span className="flex-1" style={{ minWidth: 240 }}>
            <SearchFieldView
              value={pattern}
              onChange={setPattern}
              onSearch={run}
              onClear={() => { setPattern(''); setHits(null); }}
              placeholder="Name, glob or regex — Enter to search"
              size="sm"
              accentColor={ACCENT}
            />
          </span>
          <DepthPicker value={depth} onChange={setDepth} />
        </div>

        <div className="flex-1 min-h-0 rounded-md overflow-hidden"
             style={{
               border: '1px solid var(--color-surface-border)',
               background: 'var(--color-surface)',
             }}>
          <FileBrowserView
            className="h-full"
            style={{ ['--dui-file-badge' as string]: ACCENT } as React.CSSProperties}
            dense
            entries={rows}
            showHeader={false}
            showModified={false}
            size="sm"
            accentColor={ACCENT}
            match={literalOf(pattern)}
            actions={actions}
            onAction={onAction}
            onOpen={e => onAction('open', e)}
            onSelect={onSelect}
            selectedId={selectedId}
            onContextMenu={onContextMenu}
            emptyText={busy ? 'searching…' : hits ? (
              <div className="px-6 py-4">
                <EmptyStateView
                  variant="medallion"
                  icon={<FileSearchIcon size={22} />}
                  title="Nothing matched"
                  message={`No file under ${root} matched that name.`}
                  accentColor="var(--color-warning)"
                  hints={[
                    { key: 'depth', text: 'the walk stops at the depth beside the box' },
                    { key: 'scope', text: 'only this folder and what is under it is searched' },
                  ]}
                />
              </div>
            ) : (
              <div className="px-6 py-4">
                <EmptyStateView
                  variant="medallion"
                  icon={<SearchIcon size={22} />}
                  title="Search under this folder"
                  message="One `find`, rooted here rather than at the pod. The file list behind stays where it is."
                  accentColor={ACCENT}
                  hints={[
                    { key: 'glob', text: '*invoice*, *.pdf — matched against the filename' },
                    { key: 'regex', text: 'anything else — matched against the path' },
                    { key: 'recursive', text: 'every directory under this one, to the depth beside the box' },
                  ]}
                />
              </div>
            )}
            footer={hits?.capped
              ? 'capped — narrow the pattern or lower the depth to see the rest'
              : undefined}
          />
        </div>
      </div>
    </ModalView>
  );
}

/** The absolute path a row carries, whichever list it came from. */
function fullOf(e: FileBrowserEntry): string {
  return (e as FileBrowserEntry & { fullPath?: string }).fullPath ?? e.name;
}

/**
 * What a row will tell you about itself, beyond its two icons.
 *
 * Everything here is already on screen or already fetched — Get Info opens no
 * exec. It exists because a listing row has room for a name, a size and a date
 * and a file has more than that: the mode that explains why it will not open,
 * the volume it came from, where a symlink actually points. Those are the
 * questions asked once per file and never worth a permanent column.
 */
function InfoPanel({ entry, mount, onClose }: {
  entry: FileBrowserEntry;
  mount?: PodMount;
  onClose: () => void;
}) {
  const e = entry as FileBrowserEntry & {
    fullPath?: string; mode?: string; owner?: string; group?: string;
  };
  const base = entry.name.slice(entry.name.lastIndexOf('/') + 1);
  const isDir = entry.kind === 'dir';

  /*
    Values that are facts get chips; values that are text stay text.

    A chip says "this is one of a small set" — a kind, a volume, a mode class.
    A path is not one of a set, and putting it in a chip would make a
    forty-character string look like a label. So the chips are the things worth
    recognising at a glance and the rest reads as what it is.
  */
  const rows: [string, React.ReactNode][] = [
    ['location', <span key="p" style={{ overflowWrap: 'anywhere' }}>{parentOf(fullOf(entry))}</span>],
    ['size', isDir ? <Dim key="s">not counted for a directory</Dim> : formatBytes(entry.size)],
    ['modified', entry.modified ?? <Dim key="m">unknown</Dim>],
  ];
  if (entry.linkTarget) {
    rows.push(['points at', <span key="l" style={{ overflowWrap: 'anywhere' }}>{entry.linkTarget}</span>]);
  }
  if (e.mode) {
    rows.push(['mode', (
      <span key="mo" className="flex items-center gap-2 flex-wrap">
        <Pill tone="var(--color-text-secondary)">{e.mode}</Pill>
        {e.owner && <Dim>uid {e.owner}{e.group ? ` · gid ${e.group}` : ''}</Dim>}
      </span>
    )]);
  }
  rows.push(['volume', mount ? (
    <span key="v" className="flex items-center gap-2 flex-wrap">
      <MountChip mount={mount} />
      {mount.readOnly && <Pill tone="var(--color-warning)">read-only</Pill>}
      <Dim>at {mount.path}</Dim>
    </span>
  ) : (
    <Dim key="v">none — part of the image, and gone when the pod is</Dim>
  )]);

  return (
    <ModalView open onClose={onClose} title="Get Info" size="sm">
      <div className="flex flex-col gap-3 px-1 pb-1">
        {/*
          The name gets a line of its own with its icon and type.

          It was the first row of a label/value table, which made the thing the
          panel is ABOUT look like one more attribute of itself.
        */}
        <div className="flex items-center gap-2.5 pb-3 flex-wrap"
             style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
          <span style={{ display: 'flex', flexShrink: 0, color: isDir ? 'var(--color-warning)' : ACCENT }}>
            {entry.disabledReason ? <LockIcon size={15} />
              : isDir ? <FolderOpenIcon size={15} />
                : <ExternalLinkIcon size={15} />}
          </span>
          <span className="text-[12.5px] font-mono font-semibold"
                style={{ color: 'var(--color-text-primary)', overflowWrap: 'anywhere' }}>
            {base}
          </span>
          <Pill tone={isDir ? 'var(--color-warning)'
            : entry.kind === 'link' ? 'var(--color-info, #3fb9cc)'
              : 'var(--color-text-muted)'}>
            {isDir ? 'directory' : entry.kind === 'link' ? 'symlink' : 'file'}
          </Pill>
          {entry.badge && !isDir && <Pill tone={ACCENT}>{entry.badge}</Pill>}
        </div>

        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start gap-3">
            <span style={{
              flexShrink: 0, width: 96, fontSize: 9, fontWeight: 600,
              letterSpacing: '.09em', textTransform: 'uppercase',
              color: 'var(--color-text-muted)', paddingTop: 3,
            }}>{k}</span>
            <span className="text-[11.5px] font-mono"
                  style={{ color: 'var(--color-text-primary)', minWidth: 0, flex: 1 }}>
              {v}
            </span>
          </div>
        ))}

        {entry.disabledReason && (
          <div className="flex items-start gap-2 px-2.5 py-2 rounded-md mt-1"
               style={{
                 background: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                 border: '1px solid color-mix(in srgb, var(--color-error) 26%, transparent)',
               }}>
            <LockIcon size={12} color="var(--color-error)" />
            <span className="text-[10.5px] leading-relaxed"
                  style={{ color: 'var(--color-error)' }}>{entry.disabledReason}</span>
          </div>
        )}
      </div>
    </ModalView>
  );
}

/** A value that is one of a small set, so it reads as a label rather than text. */
function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      lineHeight: 1, height: 17,
      fontSize: 8, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
      padding: '0 6px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0,
      fontFamily: 'ui-monospace, monospace',
      color: tone,
      background: `color-mix(in srgb, ${tone} 15%, transparent)`,
      border: `1px solid color-mix(in srgb, ${tone} 32%, transparent)`,
      boxShadow: `inset 0 1px 0 color-mix(in srgb, ${tone} 22%, transparent)`,
    }}>{children}</span>
  );
}

/** Secondary text beside a value — a unit, a caveat, an absence. */
function Dim({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--color-text-muted)' }}>{children}</span>;
}

function formatBytes(v?: number): string {
  if (v === undefined) return '—';
  if (v < 1024) return `${v} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  return `${(v / 1024 ** 3).toFixed(2)} GB`;
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
