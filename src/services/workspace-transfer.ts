/**
 * Workspaces on and off disk.
 *
 * ── The format ──
 *
 * One file holding the whole workspace: its name, its documentation, every
 * collection with its requests, and every environment. It reuses the native
 * Daakia collection shape rather than inventing a second one, so a workspace
 * export and a collection export describe requests identically and the same
 * importer reads both.
 *
 * ── Secrets ──
 *
 * A variable marked secret leaves as `REDACTED`. The key survives so whoever
 * opens the file knows the variable exists and has to be filled in; the value
 * never goes anywhere. That is the same rule every other export path in Daakia
 * follows, applied here rather than trusted to the caller.
 *
 * ── Open vs Import ──
 *
 * Import reads a file. Open picks a folder and reads the workspace file inside
 * it, remembering the folder on the workspace so it can be written back to the
 * same place. Neither writes into the workspace you are in: both create a new
 * one and switch to it, because merging somebody else's project into yours by
 * accident is not a thing you can undo.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  getAllCollectionTrees, getAllEnvironments, upsertEnvironment,
  type CollectionTreeNode,
} from '../storage/db';
import {
  createWorkspace, setActiveWorkspaceId, setWorkspaceDocs, getActiveWorkspaceId,
  getWorkspace, deleteWorkspace, type WorkspaceRow,
} from '../storage/workspaces';
import { importDaakiaCollection } from './daakia-importer';

/** The file name Open looks for inside a folder. */
export const WORKSPACE_FILE = 'daakia-workspace.json';

interface EnvVariable {
  key: string;
  initialValue?: string;
  currentValue?: string;
  isSecret?: boolean;
  [k: string]: unknown;
}

export interface WorkspaceDoc {
  version: string;
  kind: 'daakia-workspace';
  workspace: { name: string; docs?: string | null };
  collections: unknown[];
  environments: { name: string; variables: EnvVariable[] }[];
}

/**
 * Redact before anything is written.
 *
 * Applied to the value on its way out, not to a copy the caller might forget to
 * use — a secret that leaks because an export path skipped a helper is exactly
 * the failure this exists to prevent.
 */
function redact(variables: EnvVariable[]): EnvVariable[] {
  return variables.map(v => (v.isSecret
    ? { ...v, initialValue: 'REDACTED', currentValue: 'REDACTED' }
    : v));
}

// ── Out ──────────────────────────────────────────────────────────────────────

/** Everything in the active workspace, as a document ready to write. */
export function buildWorkspaceDoc(): WorkspaceDoc {
  const ws = getWorkspace(getActiveWorkspaceId());

  const environments = getAllEnvironments().map(row => {
    let variables: EnvVariable[] = [];
    try {
      variables = JSON.parse(row.variables || '[]') as EnvVariable[];
    } catch {
      /* a malformed row exports as an environment with no variables rather
         than failing the whole export */
    }
    return { name: row.name, variables: redact(variables) };
  });

  return {
    version: '1.0',
    kind: 'daakia-workspace',
    workspace: { name: ws?.name ?? 'Workspace', docs: ws?.docs ?? null },
    collections: getAllCollectionTrees() as unknown as CollectionTreeNode[],
    environments,
  };
}

export function writeWorkspaceFile(filePath: string): { name: string } {
  const doc = buildWorkspaceDoc();
  fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), 'utf8');
  return { name: doc.workspace.name };
}

// ── In ───────────────────────────────────────────────────────────────────────

export interface ImportOutcome {
  ok: boolean;
  error?: string;
  workspace?: WorkspaceRow;
  collections?: number;
  requests?: number;
  environments?: number;
}

function parse(raw: string): WorkspaceDoc | undefined {
  try {
    const doc = JSON.parse(raw) as WorkspaceDoc;
    if (!doc || doc.kind !== 'daakia-workspace' || !Array.isArray(doc.collections)) return undefined;
    return doc;
  } catch {
    return undefined;
  }
}

/**
 * Read a workspace file into a workspace of its own.
 *
 * Creating and switching first is what makes the rest of it safe: the
 * collection importer writes into whichever workspace is active, so with the
 * switch in place it lands in the new one and cannot touch the project you were
 * in. If anything below fails the workspace is deleted again — a half-imported
 * shell in the switcher is worse than no workspace at all, because it looks
 * like it worked.
 */
export function importWorkspaceFile(filePath: string, opts: { folder?: string } = {}): ImportOutcome {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not read the file.' };
  }

  const doc = parse(raw);
  if (!doc) return { ok: false, error: 'That is not a Daakia workspace file.' };

  const created = createWorkspace(doc.workspace?.name || path.basename(filePath, '.json'), {
    path: opts.folder,
  });
  if (!created) return { ok: false, error: 'Could not create the workspace.' };

  const previous = getActiveWorkspaceId();
  setActiveWorkspaceId(created.id);

  try {
    const result = importDaakiaCollection(JSON.stringify({
      version: doc.version,
      collections: doc.collections,
    }));
    if (!result.success) {
      abandon(created.id, previous);
      return { ok: false, error: result.error || 'The collections in that file could not be read.' };
    }

    let environments = 0;
    for (const env of doc.environments ?? []) {
      upsertEnvironment({
        id: `env-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: env.name || 'Imported',
        variables: JSON.stringify(env.variables ?? []),
        is_active: 0,
      });
      environments++;
    }

    if (doc.workspace?.docs) setWorkspaceDocs(created.id, doc.workspace.docs);

    return {
      ok: true,
      workspace: getWorkspace(created.id),
      collections: doc.collections.length,
      requests: result.requestCount,
      environments,
    };
  } catch (err) {
    abandon(created.id, previous);
    return { ok: false, error: err instanceof Error ? err.message : 'The import failed.' };
  }
}

/**
 * Undo a half-finished import.
 *
 * Switch back first: deleting the active workspace would move the pointer
 * somewhere of its own choosing, and where you were is a better answer than
 * whichever row happens to be next.
 */
function abandon(created: string, previous: string): void {
  setActiveWorkspaceId(previous);
  deleteWorkspace(created);
}

/** Open a folder that holds a workspace file. */
export function openWorkspaceFolder(folder: string): ImportOutcome {
  const file = path.join(folder, WORKSPACE_FILE);
  if (!fs.existsSync(file)) {
    return { ok: false, error: `No ${WORKSPACE_FILE} in that folder.` };
  }
  return importWorkspaceFile(file, { folder });
}
