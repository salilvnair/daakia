/**
 * Workspaces — the box above collections.
 *
 * ── What the store holds ──
 *
 * The list, which one is active, and the three counts on the Overview. All of
 * it comes from the host; none of it is computed here, because the host is the
 * side that knows what the database actually contains and a count derived from
 * a half-loaded sidebar would be wrong in a way nobody would question.
 *
 * ── Why switching is loud ──
 *
 * Collections, environments and history are scoped to the active workspace in
 * the storage layer, so the moment it changes every view holding them is
 * showing another project's data under this project's name — and looking
 * completely normal doing it. The host answers a switch with `workspaceChanged`
 * and this store re-asks for all three rather than leaving each view to
 * remember; a view that forgot would be the bug you never notice until it
 * matters.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { useToastStore } from './toast-store';
import { permissionsFor, type WorkspaceArea } from '../services/workspace/editable';

export interface Workspace {
  id: string;
  name: string;
  path: string | null;
  color: string | null;
  docs: string | null;
  sort_order: number;
  created_at: string;
  last_used_at: string | null;
  /** 1 when Git Sync publishes this workspace to teammates. Only on your own. */
  shared?: number;
  /** Set on a teammate's shared workspace: their sync id and name. Read-only. */
  owner_id?: string | null;
  owner_name?: string | null;
}

/** One teammate's subgroup in the workspace menu. */
export interface SharedGroup {
  ownerId: string;
  ownerName: string;
  /** `localId` once you have opened it here — the read-only copy's id. */
  items: { workspaceId: string; name: string; localId?: string }[];
}

/**
 * Teammates' workspaces, grouped by who shares them: what they offer (from the
 * repo), plus any read-only copy you already have. Keyed by owner, so one
 * person is one subgroup however their workspaces reached you.
 */
export function sharedGroups(team: SharingTeammate[], workspaces: Workspace[]): SharedGroup[] {
  const groups = new Map<string, SharedGroup>();
  const group = (ownerId: string, ownerName: string) => {
    let g = groups.get(ownerId);
    if (!g) { g = { ownerId, ownerName, items: [] }; groups.set(ownerId, g); }
    return g;
  };
  const byId = new Map(workspaces.map(w => [w.id, w]));
  for (const member of team) {
    for (const ws of member.shared) {
      const localId = `shared-${member.id}-${ws.id}`;
      group(member.id, member.name).items.push({ workspaceId: ws.id, name: ws.name, localId: byId.has(localId) ? localId : undefined });
    }
  }
  for (const w of workspaces) {
    if (!w.owner_id) continue;
    const prefix = `shared-${w.owner_id}-`;
    const workspaceId = w.id.startsWith(prefix) ? w.id.slice(prefix.length) : w.id;
    const g = group(w.owner_id, w.owner_name ?? 'Teammate');
    if (!g.items.some(i => i.localId === w.id)) g.items.push({ workspaceId, name: w.name, localId: w.id });
  }
  return [...groups.values()].sort((a, b) => a.ownerName.localeCompare(b.ownerName));
}

/** A teammate's workspace, brought in by Git Sync — you can use it, not change it. */
export const isReadOnly = (w: Workspace | undefined): boolean => !!w?.owner_id;

/**
 * Can this area of the active workspace be changed? Every panel asks this for
 * its own area; the answers live in one table (services/workspace/editable.ts).
 */
export function useWorkspaceEditable(area: WorkspaceArea): boolean {
  return useWorkspaceStore(s => permissionsFor(s.workspaces.find(w => w.id === s.activeId))[area]);
}

/** A teammate on the Git Sync repo, and the workspaces they offer. */
export interface SharingTeammate {
  id: string;
  name: string;
  shared: { id: string; name: string; imported: boolean }[];
}

export interface WorkspaceStats {
  collections: number;
  environments: number;
  requests: number;
  /** Rows in this workspace's history, every protocol. */
  history: number;
}

interface WorkspaceState {
  workspaces: Workspace[];
  activeId: string | null;
  stats: WorkspaceStats;
  /** Teammates' shared workspaces, for Import shared. Empty without Git Sync. */
  team: SharingTeammate[];
  /** Settings → Git Sync: show teammates' workspaces and Import shared in the menu. */
  showShared: boolean;
  loaded: boolean;
  error: string | null;

  /** The workspace the app is in, or undefined before the first load. */
  active: () => Workspace | undefined;

  load: () => void;
  switchTo: (id: string) => void;
  create: (name: string) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  saveDocs: (id: string, docs: string) => void;
  setShared: (id: string, shared: boolean) => void;
  importShared: (ownerId: string, workspaceId: string) => void;
  /** An editable copy in your own workspaces — of a workspace here, or straight from a teammate's share. */
  copyToMine: (source: { id: string } | { ownerId: string; workspaceId: string }) => void;

  /** Applied from the host's replies — see wireWorkspaceMessages below. */
  _apply: (data: { workspaces?: Workspace[]; activeId?: string; stats?: WorkspaceStats; team?: SharingTeammate[]; showShared?: boolean }) => void;
  _setError: (message: string | null) => void;
}

const EMPTY_STATS: WorkspaceStats = { collections: 0, environments: 0, requests: 0, history: 0 };

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeId: null,
  stats: EMPTY_STATS,
  team: [],
  showShared: true,
  loaded: false,
  error: null,

  active: () => {
    const { workspaces, activeId } = get();
    return workspaces.find(w => w.id === activeId);
  },

  load: () => postMsg({ type: 'getWorkspaces' }),
  switchTo: (id) => {
    if (id === get().activeId) return;
    postMsg({ type: 'switchWorkspace', id });
  },
  create: (name) => postMsg({ type: 'createWorkspace', name }),
  rename: (id, name) => postMsg({ type: 'renameWorkspace', id, name }),
  remove: (id) => postMsg({ type: 'deleteWorkspace', id }),
  saveDocs: (id, docs) => postMsg({ type: 'saveWorkspaceDocs', id, docs }),
  setShared: (id, shared) => postMsg({ type: 'setWorkspaceShared', id, shared }),
  importShared: (ownerId, workspaceId) => postMsg({ type: 'importSharedWorkspace', ownerId, workspaceId }),
  copyToMine: (source) => postMsg({ type: 'copyWorkspaceToMine', ...source }),

  _apply: (data) => set(s => ({
    workspaces: data.workspaces ?? s.workspaces,
    activeId: data.activeId ?? s.activeId,
    stats: data.stats ?? s.stats,
    team: data.team ?? s.team,
    showShared: data.showShared ?? s.showShared,
    loaded: true,
    error: null,
  })),
  _setError: (error) => set({ error }),
}));

/**
 * Listen for the host's workspace replies.
 *
 * `onSwitched` is where the scoped views reload. It is a callback rather than
 * this module reaching into the collections, environment and history stores
 * directly, because those import from here for the active id and a store that
 * imports its own subscribers is a cycle.
 */
/**
 * Data the tab counts are made of. The counts come from the host with the
 * workspace snapshot, which was only sent on a switch — so deleting a history
 * row, sending a request or adding a collection left the badge showing the
 * old number over a list that disagreed with it. When any of these arrive,
 * the snapshot is asked for again (once, for a burst).
 */
const COUNTED = new Set(['historyData', 'collectionsData', 'environmentsData']);
let _statsTimer: ReturnType<typeof setTimeout> | undefined;
function refreshStatsSoon(): void {
  if (_statsTimer) clearTimeout(_statsTimer);
  _statsTimer = setTimeout(() => { _statsTimer = undefined; postMsg({ type: 'getWorkspaces' }); }, 400);
}

export function wireWorkspaceMessages(onSwitched: () => void): () => void {
  const handler = (event: MessageEvent) => {
    const msg = event.data as { type?: string; message?: string } & Record<string, unknown>;
    if (!msg?.type) return;
    if (COUNTED.has(msg.type)) refreshStatsSoon();

    switch (msg.type) {
      case 'workspacesData':
        useWorkspaceStore.getState()._apply(msg as never);
        break;
      case 'workspaceChanged':
        useWorkspaceStore.getState()._apply(msg as never);
        onSwitched();
        /* Import, Open and Import shared say what they did. Nothing showed
           this before, so a successful import was silent. */
        if (typeof msg.toast === 'string') useToastStore.getState().addToast({ type: 'success', message: msg.toast });
        break;
      case 'workspaceDocsSaved': {
        const saved = msg.workspace as Workspace | undefined;
        if (saved) {
          useWorkspaceStore.setState(s => ({
            workspaces: s.workspaces.map(w => (w.id === saved.id ? saved : w)),
          }));
        }
        break;
      }
      case 'workspaceError':
        useWorkspaceStore.getState()._setError(msg.message ?? 'Something went wrong.');
        break;
    }
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
