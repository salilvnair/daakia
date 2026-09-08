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

export interface Workspace {
  id: string;
  name: string;
  path: string | null;
  color: string | null;
  docs: string | null;
  sort_order: number;
  created_at: string;
  last_used_at: string | null;
}

export interface WorkspaceStats {
  collections: number;
  environments: number;
  requests: number;
}

interface WorkspaceState {
  workspaces: Workspace[];
  activeId: string | null;
  stats: WorkspaceStats;
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

  /** Applied from the host's replies — see wireWorkspaceMessages below. */
  _apply: (data: { workspaces?: Workspace[]; activeId?: string; stats?: WorkspaceStats }) => void;
  _setError: (message: string | null) => void;
}

const EMPTY_STATS: WorkspaceStats = { collections: 0, environments: 0, requests: 0 };

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeId: null,
  stats: EMPTY_STATS,
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

  _apply: (data) => set(s => ({
    workspaces: data.workspaces ?? s.workspaces,
    activeId: data.activeId ?? s.activeId,
    stats: data.stats ?? s.stats,
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
export function wireWorkspaceMessages(onSwitched: () => void): () => void {
  const handler = (event: MessageEvent) => {
    const msg = event.data as { type?: string; message?: string } & Record<string, unknown>;
    if (!msg?.type) return;

    switch (msg.type) {
      case 'workspacesData':
        useWorkspaceStore.getState()._apply(msg as never);
        break;
      case 'workspaceChanged':
        useWorkspaceStore.getState()._apply(msg as never);
        onSwitched();
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
