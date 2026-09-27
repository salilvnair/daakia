/**
 * The Python scripts library — the dk8s Scripts screen and the pod Python tab
 * read and write the same list.
 *
 * ── Why the workspace, when dk8s is not in one ──
 *
 * `workspaces.ts` says dk8s is what you test WITH, and so belongs to no
 * workspace. A pod list is; a script is not. `check_db.py` is written for one
 * project's services and is useless against another's, which is exactly the
 * line a workspace draws — and it means Git Sync carries scripts between your
 * machines the same way it carries the collections beside them.
 *
 * ── Where they live ──
 *
 * The generic kv table, one row per script, each stamped with the workspace it
 * belongs to. Not a new table: the kv rows already survive a database reload,
 * and a table would need a migration for what is a list of small documents.
 * Git Sync writes each workspace's scripts to `scripts.daakia.json` in that
 * workspace's folder (see git-sync.ts), beside its collections.
 *
 * ── Why a delete leaves a row behind ──
 *
 * A sync imports by "newer wins". A script deleted here and simply removed
 * would come straight back from the other machine's copy of the file, which
 * still has it — a delete that undoes itself at the next sync. So a delete
 * writes a tombstone with its own time, the tombstone is synced like any
 * edit, and the newer of the two wins on both sides.
 */
import { randomUUID } from 'crypto';
import { findAll, upsert, findById } from '../storage/db';

export const SCRIPTS_KV = 'dk8s_py_script';

export interface PyScript {
  id: string;
  /** `check_db.py`. Also the name the copy gets inside the pod. */
  name: string;
  /** The library heading it sits under — `orders`, `diagnostics`. Optional. */
  folder?: string;
  source: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  /** A tombstone: never listed, only synced. See the note above. */
  deleted?: boolean;
}

/** Same ceiling the run applies; a script bigger than this is not a script. */
const MAX_SOURCE = 512 * 1024;

/**
 * A name somebody typed, made into one worth keeping.
 *
 * `.py` is added because the library, the tab strip and the pod all show it,
 * and a name with no extension reads as a folder. Slashes are folded because
 * the folder is its own field, and a name with a path in it would put the copy
 * somewhere other than /tmp/daakia.
 */
export function normaliseScriptName(name: string): string {
  const trimmed = String(name ?? '').trim().replace(/[\\/]+/g, '_').slice(0, 80);
  if (!trimmed) return 'untitled.py';
  return /\.py$/i.test(trimmed) ? trimmed : `${trimmed}.py`;
}

export function normaliseFolder(folder: unknown): string | undefined {
  const f = typeof folder === 'string' ? folder.trim().slice(0, 40) : '';
  return f || undefined;
}

function rows(workspaceId: string): PyScript[] {
  return findAll<PyScript>(SCRIPTS_KV).filter(s => s && s.workspaceId === workspaceId);
}

export function listScripts(workspaceId: string): PyScript[] {
  return rows(workspaceId)
    .filter(s => !s.deleted)
    .sort((a, b) => (a.folder ?? '').localeCompare(b.folder ?? '') || a.name.localeCompare(b.name));
}

export interface ScriptInput {
  id?: string;
  name: string;
  folder?: string;
  source: string;
}

export function saveScript(workspaceId: string, input: ScriptInput): PyScript {
  const now = new Date().toISOString();
  const existing = input.id ? findById<PyScript>(SCRIPTS_KV, input.id) : undefined;
  /* A script from another workspace is never overwritten by id. The id came
     from the webview, and an edit made in one project landing in another's
     library is the kind of mistake nobody notices until the sync. */
  const keep = existing && existing.workspaceId === workspaceId && !existing.deleted ? existing : undefined;
  const script: PyScript = {
    id: keep?.id ?? randomUUID(),
    name: normaliseScriptName(input.name),
    folder: normaliseFolder(input.folder),
    source: String(input.source ?? '').slice(0, MAX_SOURCE),
    workspaceId,
    createdAt: keep?.createdAt ?? now,
    updatedAt: now,
  };
  upsert(SCRIPTS_KV, script.id, script);
  return script;
}

export function deleteScript(workspaceId: string, id: string): boolean {
  const existing = findById<PyScript>(SCRIPTS_KV, id);
  if (!existing || existing.workspaceId !== workspaceId || existing.deleted) return false;
  upsert<PyScript>(SCRIPTS_KV, id, {
    id, name: existing.name, source: '', workspaceId,
    createdAt: existing.createdAt, updatedAt: new Date().toISOString(), deleted: true,
  });
  return true;
}

/** What Git Sync writes: the scripts and tombstones, without the local workspace stamp. */
export interface SyncedScript {
  id: string;
  name: string;
  folder?: string;
  source: string;
  createdAt?: string;
  updatedAt?: string;
  deleted?: boolean;
}

export function scriptsForSync(workspaceId: string): SyncedScript[] {
  return rows(workspaceId).map(({ workspaceId: _ws, ...rest }) => rest);
}

/**
 * Bring synced scripts into a workspace. Returns how many changed.
 *
 * Newer wins, by `updatedAt`. The file is your other machine's export of the
 * same library, so an older copy of a script edited here since must not roll
 * the edit back — which is what a plain upsert would do on every sync.
 */
export function importSyncedScripts(workspaceId: string, scripts: unknown): number {
  if (!Array.isArray(scripts)) return 0;
  let n = 0;
  for (const raw of scripts) {
    const s = raw as Partial<SyncedScript>;
    if (!s || typeof s.id !== 'string' || !s.id || typeof s.source !== 'string') continue;
    const local = findById<PyScript>(SCRIPTS_KV, s.id);
    if (local && local.workspaceId !== workspaceId) continue;
    if (local && (local.updatedAt ?? '') >= (s.updatedAt ?? '')) continue;
    const now = new Date().toISOString();
    upsert<PyScript>(SCRIPTS_KV, s.id, {
      id: s.id,
      name: normaliseScriptName(s.name ?? ''),
      folder: normaliseFolder(s.folder),
      source: s.deleted ? '' : s.source.slice(0, MAX_SOURCE),
      workspaceId,
      createdAt: s.createdAt ?? now,
      updatedAt: s.updatedAt ?? now,
      ...(s.deleted ? { deleted: true } : {}),
    });
    n++;
  }
  return n;
}
