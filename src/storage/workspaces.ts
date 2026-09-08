/**
 * Workspaces — the box above collections.
 *
 * ── What a workspace owns ──
 *
 * Collections, environments, and the history of requests sent from them. That
 * is the whole list. It deliberately does not own what you test *with*: mock
 * servers bind real ports on this machine and two workspaces both wanting
 * :4010 is a conflict this model cannot resolve; dk8s points at real
 * infrastructure, which is not a project; provider keys are yours rather than
 * the project's. The rule underneath all three is that a workspace scopes what
 * you are testing, never what you are testing it with.
 *
 * ── How scoping works ──
 *
 * One workspace is active at a time, held here and persisted in app_settings.
 * The scoped queries in db.ts read it rather than taking a parameter, because
 * threading a workspace id through every handler and call site would mean
 * dozens of chances to forget one — and a query that forgets shows another
 * project's requests, which is worse than one that fails.
 *
 * `workspaceScope()` is the single place that clause is written;
 * `workspace-scope.test.ts` asserts every SELECT against the three scoped
 * tables goes through it.
 */
import { getDb, scheduleSave, getSetting, setSetting, DEFAULT_WORKSPACE_ID } from './db';

export interface WorkspaceRow {
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
  /** Rows in this workspace's history, every protocol. */
  history: number;
}

const ACTIVE_KEY = 'activeWorkspaceId';

let _active: string | undefined;

/** The workspace everything is read and written against right now. */
export function getActiveWorkspaceId(): string {
  if (_active) return _active;
  const stored = getSetting<string>(ACTIVE_KEY);
  /* A stored id can name a workspace that has since been deleted — by another
     window, or by a restore from an older database. Falling back to the default
     is better than scoping every query to a workspace that is not there, which
     reads as "all your collections are gone". */
  _active = stored && _exists(stored) ? stored : DEFAULT_WORKSPACE_ID;
  return _active;
}

export function setActiveWorkspaceId(id: string): boolean {
  if (!_exists(id)) return false;
  _active = id;
  setSetting(ACTIVE_KEY, id);
  const db = getDb();
  db?.run(
    `UPDATE workspaces SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    [id],
  );
  scheduleSave();
  return true;
}

/**
 * The clause every scoped query appends, and the value that goes with it.
 *
 * Written once so the three tables cannot drift apart, and so a test can assert
 * that nothing queries them without it.
 */
export function workspaceScope(alias = ''): { sql: string; value: string } {
  const col = alias ? `${alias}.workspace_id` : 'workspace_id';
  return { sql: `${col} = ?`, value: getActiveWorkspaceId() };
}

function _exists(id: string): boolean {
  const db = getDb();
  if (!db) return false;
  const stmt = db.prepare('SELECT 1 FROM workspaces WHERE id = ?');
  stmt.bind([id]);
  const found = stmt.step();
  stmt.free();
  return found;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export function listWorkspaces(): WorkspaceRow[] {
  const db = getDb();
  if (!db) return [];
  const stmt = db.prepare(
    `SELECT id, name, path, color, docs, sort_order, created_at, last_used_at
       FROM workspaces ORDER BY sort_order, name`,
  );
  const rows: WorkspaceRow[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as unknown as WorkspaceRow);
  stmt.free();
  return rows;
}

export function getWorkspace(id: string): WorkspaceRow | undefined {
  return listWorkspaces().find(w => w.id === id);
}

export function createWorkspace(name: string, opts: { path?: string; color?: string } = {}): WorkspaceRow | undefined {
  const db = getDb();
  if (!db) return undefined;
  const clean = name.trim() || 'Untitled Workspace';
  const id = `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const next = listWorkspaces().length;
  db.run(
    `INSERT INTO workspaces (id, name, path, color, sort_order) VALUES (?, ?, ?, ?, ?)`,
    [id, clean, opts.path ?? null, opts.color ?? null, next],
  );
  scheduleSave();
  return getWorkspace(id);
}

export function renameWorkspace(id: string, name: string): boolean {
  const db = getDb();
  const clean = name.trim();
  if (!db || !clean || !_exists(id)) return false;
  db.run('UPDATE workspaces SET name = ? WHERE id = ?', [clean, id]);
  scheduleSave();
  return true;
}

export function setWorkspaceDocs(id: string, docs: string): boolean {
  const db = getDb();
  if (!db || !_exists(id)) return false;
  db.run('UPDATE workspaces SET docs = ? WHERE id = ?', [docs, id]);
  scheduleSave();
  return true;
}

/**
 * Delete a workspace and everything scoped to it.
 *
 * The last workspace cannot go: there is always exactly one active, and an app
 * with none has nowhere to put the next collection. Deleting the active one
 * moves you to whichever remains rather than leaving the pointer dangling.
 */
export function deleteWorkspace(id: string): { ok: boolean; reason?: string } {
  const db = getDb();
  if (!db) return { ok: false, reason: 'no database' };
  const all = listWorkspaces();
  if (all.length <= 1) return { ok: false, reason: 'This is the only workspace.' };
  if (!all.some(w => w.id === id)) return { ok: false, reason: 'No such workspace.' };

  for (const table of ['collections', 'environments', 'request_history']) {
    db.run(`DELETE FROM ${table} WHERE workspace_id = ?`, [id]);
  }
  db.run('DELETE FROM workspaces WHERE id = ?', [id]);

  if (getActiveWorkspaceId() === id) {
    const next = all.find(w => w.id !== id)!;
    _active = undefined;
    setActiveWorkspaceId(next.id);
  }
  scheduleSave();
  return { ok: true };
}

/**
 * The three numbers on the Overview.
 *
 * Not four: a running mock server was on that strip in an early draft and does
 * not belong, because mocks are common and the figure would read the same on
 * every workspace.
 */
export function getWorkspaceStats(id = getActiveWorkspaceId()): WorkspaceStats {
  const db = getDb();
  const zero: WorkspaceStats = { collections: 0, environments: 0, requests: 0, history: 0 };
  if (!db) return zero;

  const count = (sql: string): number => {
    try {
      const res = db.exec(sql, [id] as never);
      return res.length > 0 ? Number(res[0].values[0][0]) : 0;
    } catch {
      return 0;
    }
  };

  return {
    collections: count('SELECT COUNT(*) FROM collections WHERE workspace_id = ? AND parent_id IS NULL'),
    environments: count('SELECT COUNT(*) FROM environments WHERE workspace_id = ?'),
    requests: count(
      `SELECT COUNT(*) FROM collection_requests r
        WHERE EXISTS (SELECT 1 FROM collections c
                       WHERE c.id = r.collection_id AND c.workspace_id = ?)`,
    ),
    history: count('SELECT COUNT(*) FROM request_history WHERE workspace_id = ?'),
  };
}

/** Testing seam: forget the cached active id so the next read re-resolves it. */
export function _resetActiveWorkspaceCache(): void {
  _active = undefined;
}
