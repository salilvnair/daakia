/**
 * The workspace tab.
 *
 * What is in this workspace, what you can do next, and the collections
 * themselves — plus the documentation panel down the right, which is the only
 * thing on the screen that tells a newcomer what the project actually is.
 *
 * The counts come from the host rather than being derived from the sidebar: the
 * host is the side that knows what the database contains, and a number computed
 * from a half-loaded view is wrong in a way nobody would think to question.
 */
import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore, type Workspace } from '../../store/workspace-store';
import { useTabsStore } from '../../store/tabs-store';
import { postMsg } from '../../vscode';
import {
  LayoutGridIcon, ChevronDownIcon, CheckIcon, PlusIcon, FolderIcon, FolderOpenIcon,
  DownloadIcon, GlobeIcon, SettingsIcon, PencilIcon, TrashIcon, CloseIcon,
  UploadIcon, DocumentIcon,
} from '../../icons';
import { WorkspaceDocs } from './WorkspaceDocs';
import { EnvironmentsPanel } from '../rest/sidebar/EnvironmentsPanel';
import './workspace.css';

export function WorkspacePage() {
  const { workspaces, activeId, stats, load, switchTo, create, rename, remove, error } =
    useWorkspaceStore();
  const active = workspaces.find(w => w.id === activeId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [sub, setSub] = useState<'overview' | 'environments'>('overview');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { load(); }, [load]);

  /* A menu that stays open after you have clicked past it is a menu you have to
     dismiss twice. */
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className="ws-root">
      <WorkspaceHeader
        active={active}
        workspaces={workspaces}
        menuOpen={menuOpen}
        menuRef={menuRef}
        renaming={renaming}
        onToggleMenu={() => setMenuOpen(o => !o)}
        onPick={(id) => { switchTo(id); setMenuOpen(false); }}
        onCreate={() => { const n = window.prompt('Name the workspace'); if (n?.trim()) create(n); setMenuOpen(false); }}
        onOpen={() => { postMsg({ type: 'openWorkspace' }); setMenuOpen(false); }}
        onImport={() => { postMsg({ type: 'importWorkspace' }); setMenuOpen(false); }}
        onExport={() => { postMsg({ type: 'exportWorkspace' }); setMenuOpen(false); }}
        onRenameStart={() => { setRenaming(true); setMenuOpen(false); }}
        onRenameDone={(name) => { if (active && name.trim()) rename(active.id, name); setRenaming(false); }}
        onDelete={() => {
          if (!active) return;
          const sure = window.confirm(
            `Delete "${active.name}"?\n\nIts collections, environments and history go with it. This cannot be undone.`,
          );
          if (sure) remove(active.id);
          setMenuOpen(false);
        }}
      />

      {/* Two, not three. Git Sync already has its own settings page, and a
          second place to set the same remote is two screens that can disagree
          about it. */}
      <nav className="ws-subtabs">
        <button
          type="button"
          className={`ws-subtab${sub === 'overview' ? ' ws-subtab--on' : ''}`}
          onClick={() => setSub('overview')}
        >
          <LayoutGridIcon size={12} /> Overview
        </button>
        <button
          type="button"
          className={`ws-subtab${sub === 'environments' ? ' ws-subtab--on' : ''}`}
          onClick={() => setSub('environments')}
        >
          <GlobeIcon size={12} /> Environments
          {stats.environments > 0 && <span className="ws-subtab-n">{stats.environments}</span>}
        </button>
      </nav>

      {error && <div className="ws-error">{error}</div>}

      {sub === 'environments' ? (
        <div className="ws-envs">
          <EnvironmentsPanel />
        </div>
      ) : (
      <div className="ws-body">
        <div className="ws-main">
          <div className="ws-stats">
            <Stat n={stats.collections} label="collections" tone="coll" />
            <Stat n={stats.environments} label="environments" tone="env" />
            <Stat n={stats.requests} label="requests" tone="req" />
          </div>

          <div className="ws-caps">Quick actions</div>
          <div className="ws-actions">
            <Action tone="new" icon={<PlusIcon size={12} />} label="New collection"
              onClick={() => postMsg({ type: 'createCollectionPrompt', protocol: 'rest' })} />
            <Action tone="open" icon={<FolderOpenIcon size={12} />} label="Open collection"
              onClick={() => useTabsStore.getState().switchProtocol('rest')} />
            <Action tone="imp" icon={<DownloadIcon size={12} />} label="Import"
              onClick={() => postMsg({ type: 'importCollectionPrompt' })} />
            <Action tone="env" icon={<GlobeIcon size={12} />} label="New environment"
              onClick={() => postMsg({ type: 'openEnvironmentsPanel' })} />
          </div>

          <div className="ws-caps">This workspace</div>
          <WorkspaceFacts active={active} stats={stats} />
        </div>

        <WorkspaceDocs workspace={active} />
      </div>
      )}
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

function WorkspaceHeader({
  active, workspaces, menuOpen, menuRef, renaming,
  onToggleMenu, onPick, onCreate, onOpen, onImport, onExport,
  onRenameStart, onRenameDone, onDelete,
}: {
  active?: Workspace;
  workspaces: Workspace[];
  menuOpen: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  renaming: boolean;
  onToggleMenu: () => void;
  onPick: (id: string) => void;
  onCreate: () => void;
  onOpen: () => void;
  onImport: () => void;
  onExport: () => void;
  onRenameStart: () => void;
  onRenameDone: (name: string) => void;
  onDelete: () => void;
}) {
  const [overflow, setOverflow] = useState(false);

  return (
    <header className="ws-head">
      <LayoutGridIcon size={15} className="ws-head-icon" />

      {renaming ? (
        <input
          className="ws-rename"
          defaultValue={active?.name ?? ''}
          autoFocus
          onBlur={e => onRenameDone(e.currentTarget.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onRenameDone(e.currentTarget.value);
            if (e.key === 'Escape') onRenameDone('');
          }}
        />
      ) : (
        <button type="button" className="ws-name" onClick={onToggleMenu}>
          {active?.name ?? 'Workspace'}
          <ChevronDownIcon size={12} className="ws-chev" />
        </button>
      )}

      <div className="ws-head-spacer" />

      <button
        type="button"
        className="ws-overflow"
        title="Rename or delete this workspace"
        onClick={() => setOverflow(o => !o)}
      >
        <SettingsIcon size={13} />
      </button>

      {overflow && (
        <div className="ws-menu ws-menu--right" onMouseLeave={() => setOverflow(false)}>
          <button type="button" className="ws-menu-item" onClick={() => { setOverflow(false); onRenameStart(); }}>
            <PencilIcon size={12} /> Rename
          </button>
          <button type="button" className="ws-menu-item ws-menu-item--danger" onClick={() => { setOverflow(false); onDelete(); }}>
            <TrashIcon size={12} /> Delete
          </button>
        </div>
      )}

      {menuOpen && (
        <div className="ws-menu" ref={menuRef}>
          <div className="ws-menu-head">Workspaces</div>
          {workspaces.map(w => (
            <button
              key={w.id}
              type="button"
              className={`ws-menu-item${w.id === active?.id ? ' ws-menu-item--on' : ''}`}
              onClick={() => onPick(w.id)}
            >
              <LayoutGridIcon size={12} />
              <span className="ws-menu-label">{w.name}</span>
              {w.id === active?.id && <CheckIcon size={12} className="ws-menu-tick" />}
            </button>
          ))}
          <div className="ws-menu-rule" />
          <button type="button" className="ws-menu-item" onClick={onCreate}>
            <PlusIcon size={12} /> Create workspace
          </button>
          <button type="button" className="ws-menu-item" onClick={onOpen}>
            <FolderOpenIcon size={12} /> Open workspace
          </button>
          <button type="button" className="ws-menu-item" onClick={onImport}>
            <DownloadIcon size={12} /> Import workspace
          </button>
          <button type="button" className="ws-menu-item" onClick={onExport}>
            <UploadIcon size={12} /> Export workspace
          </button>
        </div>
      )}
    </header>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

/**
 * A number and what it counts.
 *
 * A zero keeps its colour. Greying it out would say "this does not apply", when
 * what it means is "there are none yet" — and the whole point of the strip is
 * that it reads at a glance either way.
 */
function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="ws-stat">
      <div className={`ws-stat-n ws-stat-n--${tone}`}>{n}</div>
      <div className="ws-stat-l">{label}</div>
    </div>
  );
}

function Action({ tone, icon, label, onClick }: {
  tone: string; icon: React.ReactNode; label: string; onClick: () => void;
}) {
  return (
    <button type="button" className={`ws-act ws-act--${tone}`} onClick={onClick}>
      {icon}{label}
    </button>
  );
}

/**
 * What this workspace holds, in words.
 *
 * The counts above say how much; this says what — and, more usefully, what is
 * common rather than scoped, because "why can I still see my mock servers?" is
 * the first question a workspace raises.
 */
function WorkspaceFacts({ active, stats }: {
  active?: Workspace;
  stats: { collections: number; environments: number; requests: number };
}) {
  const empty = stats.collections === 0 && stats.environments === 0;
  return (
    <div className="ws-facts">
      {empty ? (
        <div className="ws-empty">
          <FolderIcon size={26} />
          <p>Nothing here yet. Create a collection, or import one you already have.</p>
        </div>
      ) : (
        <p className="ws-fact">
          <b>{active?.name}</b> holds {stats.collections} collection{stats.collections === 1 ? '' : 's'}
          {stats.environments > 0 && <> and {stats.environments} environment{stats.environments === 1 ? '' : 's'}</>}.
        </p>
      )}
      <p className="ws-fact ws-fact--muted">
        Mock servers, dk8s and your model providers are shared across every workspace — a
        workspace scopes what you are testing, not what you are testing it with.
      </p>
    </div>
  );
}

export { CloseIcon };
