/**
 * Workspace handlers — list, switch, create, rename, delete, docs.
 *
 * Switching is the one that matters. Collections, environments and history are
 * all scoped to the active workspace in the storage layer, so the switch is a
 * single write followed by "everything you were showing is now wrong" — which
 * is why `workspaceChanged` carries the fresh lists rather than expecting the
 * webview to remember to ask for each of them. A view that forgot to refetch
 * would show one project's requests under another project's name, and look
 * completely normal doing it.
 */
import {
  listWorkspaces, getWorkspace, createWorkspace, renameWorkspace, deleteWorkspace,
  setWorkspaceDocs, setActiveWorkspaceId, getActiveWorkspaceId, getWorkspaceStats,
} from '../../../storage/workspaces';
import { getAllCollectionTrees, getAllEnvironments } from '../../../storage/db';

type PostMessage = (msg: unknown) => void;

/** Everything the workspace screen draws, in one message. */
function snapshot() {
  return {
    workspaces: listWorkspaces(),
    activeId: getActiveWorkspaceId(),
    stats: getWorkspaceStats(),
  };
}

export function handleGetWorkspaces(post: PostMessage) {
  post({ type: 'workspacesData', ...snapshot() });
}

/**
 * Switch, and say so loudly.
 *
 * The reply is a signal to every view holding scoped data that it is stale.
 * The webview reloads collections, environments and history off the back of it
 * rather than each view deciding for itself, because "the sidebar refetched but
 * history did not" is a bug nobody would spot until it mattered.
 */
export function handleSwitchWorkspace(msg: Record<string, unknown>, post: PostMessage) {
  const id = String(msg.id ?? '');
  if (!setActiveWorkspaceId(id)) {
    post({ type: 'workspaceError', message: 'That workspace no longer exists.' });
    post({ type: 'workspacesData', ...snapshot() });
    return;
  }
  post({ type: 'workspaceChanged', ...snapshot() });
}

export function handleCreateWorkspace(msg: Record<string, unknown>, post: PostMessage) {
  const created = createWorkspace(String(msg.name ?? ''));
  if (!created) {
    post({ type: 'workspaceError', message: 'Could not create the workspace.' });
    return;
  }
  /* A workspace you have to go and switch to after creating is a workspace you
     created by accident half the time. Creating one moves you into it. */
  setActiveWorkspaceId(created.id);
  post({ type: 'workspaceChanged', ...snapshot(), created: created.id });
}

export function handleRenameWorkspace(msg: Record<string, unknown>, post: PostMessage) {
  const ok = renameWorkspace(String(msg.id ?? ''), String(msg.name ?? ''));
  if (!ok) post({ type: 'workspaceError', message: 'Could not rename that workspace.' });
  post({ type: 'workspacesData', ...snapshot() });
}

export function handleDeleteWorkspace(msg: Record<string, unknown>, post: PostMessage) {
  const result = deleteWorkspace(String(msg.id ?? ''));
  if (!result.ok) {
    post({ type: 'workspaceError', message: result.reason ?? 'Could not delete that workspace.' });
    post({ type: 'workspacesData', ...snapshot() });
    return;
  }
  /* Deleting the active one moves you elsewhere, so this is a switch as much as
     a delete — the scoped views have to reload either way. */
  post({ type: 'workspaceChanged', ...snapshot() });
}

export function handleSaveWorkspaceDocs(msg: Record<string, unknown>, post: PostMessage) {
  const id = String(msg.id ?? getActiveWorkspaceId());
  const ok = setWorkspaceDocs(id, String(msg.docs ?? ''));
  post(ok
    ? { type: 'workspaceDocsSaved', id, workspace: getWorkspace(id) }
    : { type: 'workspaceError', message: 'Could not save the documentation.' });
}

// ── The context an AI draft is written from ──────────────────────────────────

interface TreeNode {
  name: string;
  children?: TreeNode[];
  requests?: { url?: string }[];
}

/**
 * What this workspace is, in names only.
 *
 * Built on the host because the host is the side that has the whole tree — the
 * webview only knows what some panel happened to load, so a draft written from
 * it would describe a fraction of the project and say nothing about the rest.
 *
 * **No values, ever.** Collection and folder names, the hosts the requests
 * call, and environment variable *names*. Not a variable's value, not a request
 * body, not a header. `apiToken` is a fact about the project; what it is set to
 * is a secret, and the standing rule is that nothing which could be one reaches
 * a prompt or the audit metadata. Enforced here rather than in the view so
 * there is one place to check it.
 */
export function handleWorkspaceDocsContext(post: PostMessage) {
  const names: string[] = [];
  const hosts = new Set<string>();

  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      names.push(node.name);
      for (const req of node.requests ?? []) {
        if (!req.url) continue;
        try {
          // A URL that is all template still names its host once resolved; the
          // placeholder keeps it parseable without inventing a value.
          hosts.add(new URL(req.url.replace(/\{\{[^}]*\}\}/g, 'placeholder')).host);
        } catch {
          /* not a URL yet — a half-typed request is not worth mentioning */
        }
      }
      walk(node.children ?? []);
    }
  };

  try {
    walk(getAllCollectionTrees() as unknown as TreeNode[]);
  } catch {
    /* an empty workspace still deserves a draft */
  }

  const variableNames = new Set<string>();
  for (const env of getAllEnvironments()) {
    try {
      for (const v of JSON.parse(env.variables || '[]') as { key?: string }[]) {
        if (v.key) variableNames.add(v.key);
      }
    } catch {
      /* a malformed row is not worth failing the whole draft over */
    }
  }

  post({
    type: 'workspaceDocsContext',
    workspace: getWorkspace(getActiveWorkspaceId())?.name ?? 'this workspace',
    collections: names,
    hosts: [...hosts],
    variableNames: [...variableNames],
  });
}
