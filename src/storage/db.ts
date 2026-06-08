/**
 * Core SQLite storage layer for Daakia — powered by sql.js (WASM).
 * Zero native compilation required. Same SQL, portable across all platforms.
 * Graceful degradation if init fails.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

type SqlJsDatabase = import('sql.js').Database;

// Module state
let _db: SqlJsDatabase | null = null;
let _sqliteOk = false;
let _sqliteError: string | undefined;
let _dbPath = '';
let _extensionPath = '';
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

// ────────────────────── Initialization ──────────────────────

export async function initDb(extensionPath: string): Promise<void> {
  _extensionPath = extensionPath;
  const configuredPath = ''; // TODO: read from settings
  _dbPath = configuredPath || path.join(os.homedir(), '.salilvnair', 'daakia-vsce', 'db', 'daakia.db');

  try {
    fs.mkdirSync(path.dirname(_dbPath), { recursive: true });

    // Load sql.js with the WASM binary from the extension's dist folder
    const wasmPath = path.join(extensionPath, 'dist', 'sql-wasm.wasm');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const initSqlJs = require('sql.js') as typeof import('sql.js').default;

    const SQL = await initSqlJs({
      locateFile: () => wasmPath,
    });

    // Load existing DB from disk or create new
    if (fs.existsSync(_dbPath)) {
      const buffer = fs.readFileSync(_dbPath);
      _db = new SQL.Database(buffer);
    } else {
      _db = new SQL.Database();
    }

    // Pragmas
    _db.run('PRAGMA journal_mode = WAL');
    _db.run('PRAGMA busy_timeout = 5000');
    _db.run('PRAGMA synchronous = NORMAL');
    _db.run('PRAGMA foreign_keys = ON');

    const hasCollectionsTable = _tableExists(_db, 'collections');

    // Run migrations for existing databases before any schema statements that
    // depend on newly added columns such as collections.parent_id.
    if (hasCollectionsTable) {
      _runMigrations(_db);
    }

    // Create tables and indexes.
    _createSchema(_db);

    if (!hasCollectionsTable) {
      _runMigrations(_db);
    }

    // Initial save
    _saveToDisk();

    _sqliteOk = true;
    _sqliteError = undefined;
  } catch (err: unknown) {
    _sqliteOk = false;
    _sqliteError = err instanceof Error ? err.message : String(err);
    _db = null;
    console.error('[daakia] SQLite init failed:', _sqliteError);
  }
}

export function getSqliteStatus(): { ok: boolean; error?: string } {
  return { ok: _sqliteOk, error: _sqliteError };
}

export function getDbPath(): string {
  return _dbPath;
}

export function getExtensionPath(): string {
  return _extensionPath;
}

export function getRawDb(): SqlJsDatabase | null {
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _saveToDiskSync();
    _db.close();
    _db = null;
    _sqliteOk = false;
  }
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
}

// ────────────────────── Persistence ──────────────────────

/** Debounced save — writes the full DB to disk after 500ms of inactivity */
function _scheduleSave(): void {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => _saveToDisk(), 500);
}

function _saveToDisk(): void {
  if (!_db) return;
  try {
    const data = _db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(_dbPath, buffer);
  } catch (e) {
    console.error('[daakia] Failed to save DB:', e);
  }
}

function _saveToDiskSync(): void {
  if (!_db) return;
  try {
    const data = _db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(_dbPath, buffer);
  } catch (e) {
    console.error('[daakia] Failed to save DB:', e);
  }
}

function _tableExists(db: SqlJsDatabase, tableName: string): boolean {
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1");
  stmt.bind([tableName]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

// ────────────────────── Schema ──────────────────────

function _createSchema(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS kv (
      collection TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS request_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id    TEXT,
      method        TEXT    NOT NULL,
      url           TEXT    NOT NULL,
      status        INTEGER,
      status_text   TEXT,
      response_time INTEGER,
      response_size INTEGER,
      request_data  TEXT,
      response_data TEXT,
      protocol      TEXT    NOT NULL DEFAULT 'rest',
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_history_created ON request_history(created_at DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_history_method  ON request_history(method)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_history_protocol ON request_history(protocol)`);

  // ── Collections table ──
  db.run(`
    CREATE TABLE IF NOT EXISTS collections (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      parent_id  TEXT REFERENCES collections(id) ON DELETE CASCADE,
      protocol   TEXT NOT NULL DEFAULT 'rest',
      data       TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_collections_parent ON collections(parent_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_collections_protocol ON collections(protocol)`);

  // ── Collection requests table ──
  db.run(`
    CREATE TABLE IF NOT EXISTS collection_requests (
      id            TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL,
      name          TEXT NOT NULL,
      method        TEXT NOT NULL DEFAULT 'GET',
      url           TEXT NOT NULL DEFAULT '',
      data          TEXT NOT NULL DEFAULT '{}',
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_colreq_collection ON collection_requests(collection_id)`);

  // ── Environments table ──
  db.run(`
    CREATE TABLE IF NOT EXISTS environments (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      variables  TEXT NOT NULL DEFAULT '[]',
      is_active  INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);

  // ── Settings table ──
  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '{}'
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS ce_audit (
      audit_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id  TEXT    NOT NULL,
      stage            TEXT    NOT NULL,
      model            TEXT,
      system_prompt    TEXT,
      user_prompt      TEXT,
      request_payload  TEXT,
      response_payload TEXT,
      headers          TEXT,
      meta             TEXT,
      duration_ms      INTEGER,
      error            TEXT,
      created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_conv  ON ce_audit(conversation_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_stage ON ce_audit(stage)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS prompt_library (
      scenario      TEXT    PRIMARY KEY,
      system_prompt TEXT    NOT NULL,
      user_prompt   TEXT,
      agent_name    TEXT,
      updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS mock_request_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      mock_server_id  TEXT    NOT NULL,
      method          TEXT    NOT NULL,
      path            TEXT    NOT NULL,
      query_params    TEXT,
      headers         TEXT,
      body            TEXT,
      matched_endpoint_id TEXT,
      response_status INTEGER,
      response_time   INTEGER,
      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_mock_log_server ON mock_request_log(mock_server_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_mock_log_time   ON mock_request_log(created_at DESC)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS cookies (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      domain    TEXT    NOT NULL,
      path      TEXT    NOT NULL DEFAULT '/',
      name      TEXT    NOT NULL,
      value     TEXT    NOT NULL,
      expires   TEXT,
      http_only INTEGER NOT NULL DEFAULT 0,
      secure    INTEGER NOT NULL DEFAULT 0,
      same_site TEXT,
      created_at TEXT   NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(domain, path, name)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS script_console_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id  TEXT    NOT NULL,
      phase       TEXT    NOT NULL,
      level       TEXT    NOT NULL,
      message     TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id           TEXT    PRIMARY KEY,
      title        TEXT    NOT NULL DEFAULT 'Untitled Conversation',
      provider     TEXT    NOT NULL DEFAULT '',
      model        TEXT    NOT NULL DEFAULT '',
      messages     TEXT    NOT NULL DEFAULT '[]',
      message_count INTEGER NOT NULL DEFAULT 0,
      token_total  INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);
}

// ────────────────────── Migrations ──────────────────────

function _runMigrations(db: SqlJsDatabase): void {
  // Migration 1: Add parent_id to collections (for existing DBs without it)
  try {
    const info = db.exec("PRAGMA table_info(collections)");
    if (info.length > 0) {
      const cols = info[0].values.map(row => row[1]);
      if (!cols.includes('parent_id')) {
        db.run('ALTER TABLE collections ADD COLUMN parent_id TEXT REFERENCES collections(id) ON DELETE CASCADE');
        db.run('CREATE INDEX IF NOT EXISTS idx_collections_parent ON collections(parent_id)');
      }
      // Migration 2: Add protocol column to collections
      if (!cols.includes('protocol')) {
        db.run("ALTER TABLE collections ADD COLUMN protocol TEXT NOT NULL DEFAULT 'rest'");
        db.run('CREATE INDEX IF NOT EXISTS idx_collections_protocol ON collections(protocol)');
      }
    }
  } catch {
    // table doesn't exist yet — schema will handle it
  }

  // Migration 3: Add protocol column to request_history
  try {
    const info = db.exec("PRAGMA table_info(request_history)");
    if (info.length > 0) {
      const cols = info[0].values.map(row => row[1]);
      if (!cols.includes('protocol')) {
        db.run("ALTER TABLE request_history ADD COLUMN protocol TEXT NOT NULL DEFAULT 'rest'");
        db.run('CREATE INDEX IF NOT EXISTS idx_history_protocol ON request_history(protocol)');
      }
    }
  } catch {
    // table doesn't exist yet — schema will handle it
  }
}

// ────────────────────── Generic KV CRUD ──────────────────────

export function upsert<T>(collection: string, id: string, record: T): T {
  if (!_db) { return record; }
  _db.run(
    'INSERT OR REPLACE INTO kv (collection, id, data) VALUES (?, ?, ?)',
    [collection, id, JSON.stringify(record)]
  );
  _scheduleSave();
  return record;
}

export function remove(collection: string, id: string): void {
  if (!_db) { return; }
  _db.run('DELETE FROM kv WHERE collection = ? AND id = ?', [collection, id]);
  _scheduleSave();
}

export function findAll<T>(collection: string): T[] {
  if (!_db) { return []; }
  const stmt = _db.prepare('SELECT data FROM kv WHERE collection = ?');
  stmt.bind([collection]);
  const results: T[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { data: string };
    results.push(JSON.parse(row.data) as T);
  }
  stmt.free();
  return results;
}

export function findById<T>(collection: string, id: string): T | undefined {
  if (!_db) { return undefined; }
  const stmt = _db.prepare('SELECT data FROM kv WHERE collection = ? AND id = ?');
  stmt.bind([collection, id]);
  let result: T | undefined;
  if (stmt.step()) {
    const row = stmt.getAsObject() as { data: string };
    result = JSON.parse(row.data) as T;
  }
  stmt.free();
  return result;
}

export function readCollection<T>(collection: string): Record<string, T> {
  if (!_db) { return {}; }
  const stmt = _db.prepare('SELECT id, data FROM kv WHERE collection = ?');
  stmt.bind([collection]);
  const result: Record<string, T> = {};
  while (stmt.step()) {
    const row = stmt.getAsObject() as { id: string; data: string };
    result[row.id] = JSON.parse(row.data) as T;
  }
  stmt.free();
  return result;
}

export function writeCollection<T>(collection: string, data: Record<string, T>): void {
  if (!_db) { return; }
  _db.run('DELETE FROM kv WHERE collection = ?', [collection]);
  for (const [id, record] of Object.entries(data)) {
    _db.run(
      'INSERT INTO kv (collection, id, data) VALUES (?, ?, ?)',
      [collection, id, JSON.stringify(record)]
    );
  }
  _scheduleSave();
}

// ────────────────────── History ──────────────────────

export interface HistoryRow {
  id?: number;
  request_id?: string;
  method: string;
  url: string;
  status?: number;
  status_text?: string;
  response_time?: number;
  response_size?: number;
  request_data?: string;
  response_data?: string;
  protocol?: string;
  created_at?: string;
}

export function insertHistory(entry: HistoryRow): void {
  if (!_db) { return; }
  _db.run(`
    INSERT INTO request_history (request_id, method, url, status, status_text, response_time, response_size, request_data, response_data, protocol)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    entry.request_id ?? null,
    entry.method,
    entry.url,
    entry.status ?? null,
    entry.status_text ?? null,
    entry.response_time ?? null,
    entry.response_size ?? null,
    entry.request_data ?? null,
    entry.response_data ?? null,
    entry.protocol ?? 'rest',
  ]);
  _scheduleSave();
}

export function getHistory(limit = 100, offset = 0, protocol?: string): HistoryRow[] {
  if (!_db) { return []; }
  const sql = protocol
    ? 'SELECT * FROM request_history WHERE protocol = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    : 'SELECT * FROM request_history ORDER BY created_at DESC LIMIT ? OFFSET ?';
  const stmt = _db.prepare(sql);
  stmt.bind(protocol ? [protocol, limit, offset] : [limit, offset]);
  const results: HistoryRow[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as HistoryRow);
  }
  stmt.free();
  return results;
}

export function clearHistory(protocol?: string): void {
  if (!_db) { return; }
  if (protocol) {
    _db.run('DELETE FROM request_history WHERE protocol = ?', [protocol]);
  } else {
    _db.run('DELETE FROM request_history');
  }
  _scheduleSave();
}

export function deleteHistoryById(id: number): void {
  if (!_db) { return; }
  _db.run('DELETE FROM request_history WHERE id = ?', [id]);
  _scheduleSave();
}

export function trimHistory(maxEntries: number): void {
  if (!_db || maxEntries <= 0) { return; }
  _db.run(
    `DELETE FROM request_history WHERE id NOT IN (
      SELECT id FROM request_history ORDER BY created_at DESC LIMIT ?
    )`,
    [maxEntries]
  );
  _scheduleSave();
}

// ────────────────────── Audit ──────────────────────

export interface CeAuditEntry {
  audit_id?: number;
  conversation_id: string;
  stage: string;
  model?: string;
  system_prompt?: string;
  user_prompt?: string;
  request_payload?: string;
  response_payload?: string;
  headers?: string;
  meta?: string;
  duration_ms?: number;
  error?: string;
  created_at?: string;
}

export function insertAudit(entry: CeAuditEntry): void {
  if (!_db) { return; }
  _db.run(`
    INSERT INTO ce_audit (conversation_id, stage, model, system_prompt, user_prompt, request_payload, response_payload, headers, meta, duration_ms, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    entry.conversation_id,
    entry.stage,
    entry.model ?? null,
    entry.system_prompt ?? null,
    entry.user_prompt ?? null,
    entry.request_payload ?? null,
    entry.response_payload ?? null,
    entry.headers ?? null,
    entry.meta ?? null,
    entry.duration_ms ?? null,
    entry.error ?? null,
  ]);
  _scheduleSave();
}

export function getAuditEntries(limit = 50): CeAuditEntry[] {
  if (!_db) { return []; }
  const stmt = _db.prepare(
    'SELECT * FROM ce_audit ORDER BY created_at DESC LIMIT ?'
  );
  stmt.bind([limit]);
  const results: CeAuditEntry[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as CeAuditEntry);
  }
  stmt.free();
  return results;
}

export function deleteAuditEntry(auditId: number): void {
  if (!_db) { return; }
  _db.run('DELETE FROM ce_audit WHERE audit_id = ?', [auditId]);
  _scheduleSave();
}

export function deleteAuditEntries(auditIds: number[]): void {
  if (!_db || !auditIds.length) { return; }
  const placeholders = auditIds.map(() => '?').join(',');
  _db.run(`DELETE FROM ce_audit WHERE audit_id IN (${placeholders})`, auditIds);
  _scheduleSave();
}

export function clearAuditEntries(): void {
  if (!_db) { return; }
  _db.run('DELETE FROM ce_audit');
  _scheduleSave();
}

// ────────────────────── Prompt Library ──────────────────────

export interface PromptRow {
  scenario: string;
  system_prompt: string;
  user_prompt?: string;
  agent_name?: string;
  updated_at?: string;
}

export function getCustomPrompt(scenario: string): PromptRow | undefined {
  if (!_db) { return undefined; }
  const stmt = _db.prepare('SELECT * FROM prompt_library WHERE scenario = ?');
  stmt.bind([scenario]);
  let result: PromptRow | undefined;
  if (stmt.step()) {
    result = stmt.getAsObject() as unknown as PromptRow;
  }
  stmt.free();
  return result;
}

export function upsertPrompt(scenario: string, prompt: PromptRow): void {
  if (!_db) { return; }
  _db.run(`
    INSERT OR REPLACE INTO prompt_library (scenario, system_prompt, user_prompt, agent_name, updated_at)
    VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `, [scenario, prompt.system_prompt, prompt.user_prompt ?? null, prompt.agent_name ?? null]);
  _scheduleSave();
}

export function resetPrompt(scenario: string): void {
  if (!_db) { return; }
  _db.run('DELETE FROM prompt_library WHERE scenario = ?', [scenario]);
  _scheduleSave();
}

export function getAllPrompts(): PromptRow[] {
  if (!_db) { return []; }
  const stmt = _db.prepare('SELECT * FROM prompt_library ORDER BY updated_at DESC');
  const results: PromptRow[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as PromptRow);
  }
  stmt.free();
  return results;
}

// ────────────────────── Collections (dedicated table) ──────────────────────

export interface CollectionRow {
  id: string;
  name: string;
  parent_id: string | null;
  data?: string;
  sort_order?: number;
}

export interface CollectionRequestRow {
  id: string;
  collection_id: string;
  name: string;
  method: string;
  url: string;
  data?: string;
  sort_order?: number;
}

export interface CollectionTreeNode {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  children: CollectionTreeNode[];
  requests: CollectionRequestRow[];
}

/** Get flat list of all collections */
export function getAllCollections(): CollectionRow[] {
  if (!_db) { return []; }
  const stmt = _db.prepare('SELECT id, name, parent_id, sort_order FROM collections ORDER BY sort_order, name');
  const results: CollectionRow[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as CollectionRow);
  }
  stmt.free();
  return results;
}

/** Get full nested tree of collections with their requests */
export function getCollectionTree(protocol?: string): CollectionTreeNode[] {
  if (!_db) { return []; }

  // Get collections filtered by protocol
  const colSql = protocol
    ? 'SELECT id, name, parent_id, sort_order FROM collections WHERE protocol = ? ORDER BY sort_order, name'
    : 'SELECT id, name, parent_id, sort_order FROM collections ORDER BY sort_order, name';
  const colStmt = _db.prepare(colSql);
  if (protocol) { colStmt.bind([protocol]); }
  const flatList: CollectionTreeNode[] = [];
  while (colStmt.step()) {
    const row = colStmt.getAsObject() as { id: string; name: string; parent_id: string | null; sort_order: number };
    flatList.push({ ...row, children: [], requests: [] });
  }
  colStmt.free();

  // Get all requests
  const reqStmt = _db.prepare('SELECT id, collection_id, name, method, url, data, sort_order FROM collection_requests ORDER BY sort_order');
  while (reqStmt.step()) {
    const req = reqStmt.getAsObject() as unknown as CollectionRequestRow;
    const parent = flatList.find(c => c.id === req.collection_id);
    if (parent) { parent.requests.push(req); }
  }
  reqStmt.free();

  // Build tree
  const map = new Map<string, CollectionTreeNode>();
  for (const node of flatList) { map.set(node.id, node); }

  const roots: CollectionTreeNode[] = [];
  for (const node of flatList) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** Get direct children of a folder (or root if parentId is null) */
export function getCollectionChildren(parentId: string | null): { folders: CollectionRow[]; requests: CollectionRequestRow[] } {
  if (!_db) { return { folders: [], requests: [] }; }

  const folders: CollectionRow[] = [];
  const folderStmt = parentId
    ? _db.prepare('SELECT id, name, parent_id, sort_order FROM collections WHERE parent_id = ? ORDER BY sort_order, name')
    : _db.prepare('SELECT id, name, parent_id, sort_order FROM collections WHERE parent_id IS NULL ORDER BY sort_order, name');
  if (parentId) { folderStmt.bind([parentId]); }
  while (folderStmt.step()) {
    folders.push(folderStmt.getAsObject() as unknown as CollectionRow);
  }
  folderStmt.free();

  const requests: CollectionRequestRow[] = [];
  if (parentId) {
    const reqStmt = _db.prepare('SELECT id, collection_id, name, method, url, data, sort_order FROM collection_requests WHERE collection_id = ? ORDER BY sort_order');
    reqStmt.bind([parentId]);
    while (reqStmt.step()) {
      requests.push(reqStmt.getAsObject() as unknown as CollectionRequestRow);
    }
    reqStmt.free();
  }

  return { folders, requests };
}

/** Get breadcrumb path from root to a given collection */
export function getCollectionBreadcrumb(id: string): { id: string; name: string }[] {
  if (!_db) { return []; }
  const path: { id: string; name: string }[] = [];
  let currentId: string | null = id;

  while (currentId) {
    const stmt = _db.prepare('SELECT id, name, parent_id FROM collections WHERE id = ?');
    stmt.bind([currentId]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as { id: string; name: string; parent_id: string | null };
      path.unshift({ id: row.id, name: row.name });
      currentId = row.parent_id;
    } else {
      currentId = null;
    }
    stmt.free();
  }
  return path;
}

/** Create or update a collection/folder */
export function upsertCollection(id: string, name: string, parentId?: string | null, protocol?: string): void {
  if (!_db) { return; }
  if (protocol) {
    _db.run(
      `INSERT INTO collections (id, name, parent_id, protocol, updated_at) VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, parent_id = excluded.parent_id, protocol = excluded.protocol, updated_at = excluded.updated_at`,
      [id, name, parentId ?? null, protocol]
    );
  } else {
    _db.run(
      `INSERT INTO collections (id, name, parent_id, updated_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, parent_id = excluded.parent_id, updated_at = excluded.updated_at`,
      [id, name, parentId ?? null]
    );
  }
  _scheduleSave();
}

/** Move a collection to a new parent */
export function moveCollection(id: string, newParentId: string | null): void {
  if (!_db) { return; }
  _db.run(
    `UPDATE collections SET parent_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    [newParentId, id]
  );
  _scheduleSave();
}

/** Reorder collections within a parent (set sort_order for each id in order) */
export function reorderCollections(ids: string[]): void {
  if (!_db) { return; }
  for (let i = 0; i < ids.length; i++) {
    _db.run('UPDATE collections SET sort_order = ? WHERE id = ?', [i, ids[i]]);
  }
  _scheduleSave();
}

/** Move a request to a different collection */
export function moveRequest(requestId: string, newCollectionId: string): void {
  if (!_db) { return; }
  _db.run('UPDATE collection_requests SET collection_id = ? WHERE id = ?', [newCollectionId, requestId]);
  _scheduleSave();
}

/** Reorder requests within a collection */
export function reorderRequests(ids: string[]): void {
  if (!_db) { return; }
  for (let i = 0; i < ids.length; i++) {
    _db.run('UPDATE collection_requests SET sort_order = ? WHERE id = ?', [i, ids[i]]);
  }
  _scheduleSave();
}

/** Get collection data (properties JSON) */
export function getCollectionData(id: string): string {
  if (!_db) { return '{}'; }
  const stmt = _db.prepare('SELECT data FROM collections WHERE id = ?');
  stmt.bind([id]);
  let result = '{}';
  if (stmt.step()) {
    const row = stmt.getAsObject() as { data: string };
    result = row.data || '{}';
  }
  stmt.free();
  return result;
}

/** Update collection data (properties JSON) */
export function updateCollectionData(id: string, data: string): void {
  if (!_db) { return; }
  _db.run(
    `UPDATE collections SET data = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    [data, id]
  );
  _scheduleSave();
}

/** Duplicate a collection (with children and requests) */
export function duplicateCollection(id: string): string | null {
  if (!_db) { return null; }

  // Get source collection
  const stmt = _db.prepare('SELECT id, name, parent_id, data, sort_order FROM collections WHERE id = ?');
  stmt.bind([id]);
  if (!stmt.step()) { stmt.free(); return null; }
  const source = stmt.getAsObject() as { id: string; name: string; parent_id: string | null; data: string; sort_order: number };
  stmt.free();

  // Create new collection with " Copy" suffix
  const newId = crypto.randomUUID();
  _db.run(
    `INSERT INTO collections (id, name, parent_id, data, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    [newId, `${source.name} Copy`, source.parent_id, source.data, source.sort_order + 1]
  );

  // Copy all requests
  const reqStmt = _db.prepare('SELECT id, name, method, url, data, sort_order FROM collection_requests WHERE collection_id = ? ORDER BY sort_order');
  reqStmt.bind([id]);
  while (reqStmt.step()) {
    const req = reqStmt.getAsObject() as { id: string; name: string; method: string; url: string; data: string; sort_order: number };
    const newReqId = crypto.randomUUID();
    _db!.run(
      `INSERT INTO collection_requests (id, collection_id, name, method, url, data, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
      [newReqId, newId, req.name, req.method, req.url, req.data, req.sort_order]
    );
  }
  reqStmt.free();

  // Recursively duplicate child collections
  const childStmt = _db.prepare('SELECT id FROM collections WHERE parent_id = ?');
  childStmt.bind([id]);
  const childIds: string[] = [];
  while (childStmt.step()) {
    childIds.push((childStmt.getAsObject() as { id: string }).id);
  }
  childStmt.free();

  for (const childId of childIds) {
    _duplicateCollectionRecursive(childId, newId);
  }

  _scheduleSave();
  return newId;
}

function _duplicateCollectionRecursive(sourceId: string, newParentId: string): void {
  if (!_db) { return; }
  const stmt = _db.prepare('SELECT id, name, data, sort_order FROM collections WHERE id = ?');
  stmt.bind([sourceId]);
  if (!stmt.step()) { stmt.free(); return; }
  const source = stmt.getAsObject() as { id: string; name: string; data: string; sort_order: number };
  stmt.free();

  const newId = crypto.randomUUID();
  _db.run(
    `INSERT INTO collections (id, name, parent_id, data, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    [newId, source.name, newParentId, source.data, source.sort_order]
  );

  // Copy requests
  const reqStmt = _db.prepare('SELECT name, method, url, data, sort_order FROM collection_requests WHERE collection_id = ? ORDER BY sort_order');
  reqStmt.bind([sourceId]);
  while (reqStmt.step()) {
    const req = reqStmt.getAsObject() as { name: string; method: string; url: string; data: string; sort_order: number };
    _db!.run(
      `INSERT INTO collection_requests (id, collection_id, name, method, url, data, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
      [crypto.randomUUID(), newId, req.name, req.method, req.url, req.data, req.sort_order]
    );
  }
  reqStmt.free();

  // Recurse into children
  const childStmt = _db.prepare('SELECT id FROM collections WHERE parent_id = ?');
  childStmt.bind([sourceId]);
  const childIds: string[] = [];
  while (childStmt.step()) {
    childIds.push((childStmt.getAsObject() as { id: string }).id);
  }
  childStmt.free();

  for (const childId of childIds) {
    _duplicateCollectionRecursive(childId, newId);
  }
}

/** Duplicate a single request */
export function duplicateCollectionRequest(requestId: string): string | null {
  if (!_db) { return null; }
  const stmt = _db.prepare('SELECT collection_id, name, method, url, data, sort_order FROM collection_requests WHERE id = ?');
  stmt.bind([requestId]);
  if (!stmt.step()) { stmt.free(); return null; }
  const req = stmt.getAsObject() as { collection_id: string; name: string; method: string; url: string; data: string; sort_order: number };
  stmt.free();

  const newId = crypto.randomUUID();
  _db.run(
    `INSERT INTO collection_requests (id, collection_id, name, method, url, data, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    [newId, req.collection_id, `${req.name} Copy`, req.method, req.url, req.data, req.sort_order + 1]
  );
  _scheduleSave();
  return newId;
}

/** Delete a collection and all its children (cascade) + requests */
export function deleteCollection(id: string): void {
  if (!_db) { return; }
  // Recursively collect all descendant collection IDs
  const idsToDelete: string[] = [];
  const collectIds = (parentId: string) => {
    idsToDelete.push(parentId);
    const stmt = _db!.prepare('SELECT id FROM collections WHERE parent_id = ?');
    stmt.bind([parentId]);
    while (stmt.step()) {
      const child = stmt.getAsObject() as { id: string };
      collectIds(child.id);
    }
    stmt.free();
  };
  collectIds(id);

  // Delete requests for all collected IDs
  for (const cid of idsToDelete) {
    _db.run('DELETE FROM collection_requests WHERE collection_id = ?', [cid]);
  }
  // Delete collections (children first due to FK, but we'll just delete all)
  for (const cid of [...idsToDelete].reverse()) {
    _db.run('DELETE FROM collections WHERE id = ?', [cid]);
  }
  _scheduleSave();
}

export function upsertCollectionRequest(req: CollectionRequestRow): void {
  if (!_db) { return; }
  _db.run(
    `INSERT INTO collection_requests (id, collection_id, name, method, url, data)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, method = excluded.method, url = excluded.url, data = excluded.data`,
    [req.id, req.collection_id, req.name, req.method, req.url, req.data ?? '{}']
  );
  _scheduleSave();
}

export function deleteCollectionRequest(id: string): void {
  if (!_db) { return; }
  _db.run('DELETE FROM collection_requests WHERE id = ?', [id]);
  _scheduleSave();
}

export function renameCollectionRequest(id: string, name: string): void {
  if (!_db) { return; }
  _db.run('UPDATE collection_requests SET name = ? WHERE id = ?', [name, id]);
  _scheduleSave();
}

// ────────────────────── Environments (dedicated table) ──────────────────────

export interface EnvironmentRow {
  id: string;
  name: string;
  variables: string; // JSON array
  is_active: number;
}

export function getAllEnvironments(): EnvironmentRow[] {
  if (!_db) { return []; }
  const stmt = _db.prepare('SELECT id, name, variables, is_active FROM environments ORDER BY name');
  const results: EnvironmentRow[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as EnvironmentRow);
  }
  stmt.free();
  return results;
}

export function upsertEnvironment(env: { id: string; name: string; variables: string; is_active: number }): void {
  if (!_db) { return; }
  _db.run(
    `INSERT INTO environments (id, name, variables, is_active, updated_at)
     VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, variables = excluded.variables, is_active = excluded.is_active, updated_at = excluded.updated_at`,
    [env.id, env.name, env.variables, env.is_active]
  );
  _scheduleSave();
}

export function deleteEnvironment(id: string): void {
  if (!_db) { return; }
  _db.run('DELETE FROM environments WHERE id = ?', [id]);
  _scheduleSave();
}

export function setActiveEnvironment(envId: string | null): void {
  if (!_db) { return; }
  _db.run('UPDATE environments SET is_active = 0');
  if (envId) {
    _db.run('UPDATE environments SET is_active = 1 WHERE id = ?', [envId]);
  }
  _scheduleSave();
}

// ────────────────────── App Settings (dedicated table) ──────────────────────

export function getSetting<T>(key: string): T | undefined {
  if (!_db) { return undefined; }
  const stmt = _db.prepare('SELECT value FROM app_settings WHERE key = ?');
  stmt.bind([key]);
  let result: T | undefined;
  if (stmt.step()) {
    const row = stmt.getAsObject() as { value: string };
    result = JSON.parse(row.value) as T;
  }
  stmt.free();
  return result;
}

export function setSetting<T>(key: string, value: T): void {
  if (!_db) { return; }
  _db.run(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
    [key, JSON.stringify(value)]
  );
  _scheduleSave();
}

// ────────────────────── Cookies ──────────────────────

export interface CookieRow {
  id?: number;
  domain: string;
  path: string;
  name: string;
  value: string;
  expires?: string;
  http_only?: number;
  secure?: number;
  same_site?: string;
  created_at?: string;
}

export function getCookies(domain: string): CookieRow[] {
  if (!_db) { return []; }
  const stmt = _db.prepare('SELECT * FROM cookies WHERE domain = ?');
  stmt.bind([domain]);
  const results: CookieRow[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as CookieRow);
  }
  stmt.free();
  return results;
}

export function upsertCookie(cookie: CookieRow): void {
  if (!_db) { return; }
  _db.run(`
    INSERT OR REPLACE INTO cookies (domain, path, name, value, expires, http_only, secure, same_site)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    cookie.domain,
    cookie.path || '/',
    cookie.name,
    cookie.value,
    cookie.expires ?? null,
    cookie.http_only ?? 0,
    cookie.secure ?? 0,
    cookie.same_site ?? null,
  ]);
  _scheduleSave();
}

export function deleteCookie(domain: string, name: string): void {
  if (!_db) { return; }
  _db.run('DELETE FROM cookies WHERE domain = ? AND name = ?', [domain, name]);
  _scheduleSave();
}

export function clearCookies(): void {
  if (!_db) { return; }
  _db.run('DELETE FROM cookies');
  _scheduleSave();
}

// ────────────────────── Mock Log ──────────────────────

export interface MockLogRow {
  id?: number;
  mock_server_id: string;
  method: string;
  path: string;
  query_params?: string;
  headers?: string;
  body?: string;
  matched_endpoint_id?: string;
  response_status?: number;
  response_time?: number;
  created_at?: string;
}

export function insertMockLog(entry: MockLogRow): void {
  if (!_db) { return; }
  _db.run(`
    INSERT INTO mock_request_log (mock_server_id, method, path, query_params, headers, body, matched_endpoint_id, response_status, response_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    entry.mock_server_id,
    entry.method,
    entry.path,
    entry.query_params ?? null,
    entry.headers ?? null,
    entry.body ?? null,
    entry.matched_endpoint_id ?? null,
    entry.response_status ?? null,
    entry.response_time ?? null,
  ]);
  _scheduleSave();
}

export function getMockLogs(serverId: string, limit = 100): MockLogRow[] {
  if (!_db) { return []; }
  const stmt = _db.prepare(
    'SELECT * FROM mock_request_log WHERE mock_server_id = ? ORDER BY created_at DESC LIMIT ?'
  );
  stmt.bind([serverId, limit]);
  const results: MockLogRow[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as MockLogRow);
  }
  stmt.free();
  return results;
}

// ────────────────────── AI Provider Keys ──────────────────────

/** Store an API key for a provider (uses KV table, collection 'ai_keys') */
export function setAiKey(providerId: string, token: string): void {
  upsert('ai_keys', providerId, { token });
}

/** Retrieve stored API key for a provider */
export function getAiKey(providerId: string): string | undefined {
  const record = findById<{ token: string }>('ai_keys', providerId);
  return record?.token;
}

/** Delete stored API key for a provider */
export function deleteAiKey(providerId: string): void {
  remove('ai_keys', providerId);
}

/** Get all stored API keys as a map of providerId → token */
export function getAllAiKeys(): Record<string, string> {
  const all = readCollection<{ token: string }>('ai_keys');
  return Object.fromEntries(Object.entries(all).map(([id, v]) => [id, v.token]));
}

// ────────────────────── AI Chat Sessions ──────────────────────

export interface AiChatSession {
  id: string;
  title: string;
  provider: string;
  model: string;
  messages: string; // JSON-serialized AiMessage[]
  created_at?: string;
  updated_at?: string;
}

export function saveAiChatSession(session: Omit<AiChatSession, 'created_at' | 'updated_at'>): void {
  upsert('ai_chat_sessions', session.id, session);
}

export function loadAiChatSessions(limit = 50): AiChatSession[] {
  if (!_db) { return []; }
  const all = findAll<AiChatSession>('ai_chat_sessions');
  return all.slice(0, limit);
}

export function deleteAiChatSession(id: string): void {
  remove('ai_chat_sessions', id);
}

export function searchAiChatSessions(query: string): AiChatSession[] {
  const all = findAll<AiChatSession>('ai_chat_sessions');
  const q = query.toLowerCase();
  return all.filter(s =>
    s.title.toLowerCase().includes(q) ||
    s.provider.toLowerCase().includes(q) ||
    s.model.toLowerCase().includes(q)
  );
}

// ────────────────────── AI Feature Flags ──────────────────────

export interface AiFeatureFlags {
  masterAgent: boolean;
  errorDiagnosis: boolean;
  responseExplainer: boolean;
  headerAutocomplete: boolean;
  bodyGenerator: boolean;
  requestNamer: boolean;
  scriptAutocomplete: boolean;
  inlineAssist: boolean;
}

export const DEFAULT_AI_FEATURES: AiFeatureFlags = {
  masterAgent: true,
  errorDiagnosis: true,
  responseExplainer: true,
  headerAutocomplete: true,
  bodyGenerator: true,
  requestNamer: true,
  scriptAutocomplete: true,
  inlineAssist: true,
};

export function getAiFeatures(): AiFeatureFlags {
  const stored = getSetting<Partial<AiFeatureFlags>>('aiFeatures');
  return { ...DEFAULT_AI_FEATURES, ...(stored || {}) };
}

export function setAiFeatures(flags: AiFeatureFlags): void {
  setSetting('aiFeatures', flags);
}

// ────────────────────── AI Prompt Templates ──────────────────────

export function getAiPromptTemplates(): Record<string, string> {
  return getSetting<Record<string, string>>('aiPromptTemplates') ?? {};
}

export function setAiPromptTemplates(templates: Record<string, string>): void {
  setSetting('aiPromptTemplates', templates);
}

// ────────────────────── Daakia AI Conversation ──────────────────────

export interface AiConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export function saveAiConversation(messages: AiConversationMessage[]): void {
  setSetting('aiConversation', messages);
}

export function loadAiConversation(): AiConversationMessage[] {
  return getSetting<AiConversationMessage[]>('aiConversation') ?? [];
}

export function clearAiConversation(): void {
  setSetting('aiConversation', []);
}

// ────────────────────── Table Info (Dev Tools) ──────────────────────

export interface TableInfo {
  name: string;
  count: number;
}

export function getTableList(): TableInfo[] {
  if (!_db) { return []; }
  const stmt = _db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  const tables: string[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { name: string };
    tables.push(row.name);
  }
  stmt.free();

  return tables.map(name => {
    const cStmt = _db!.prepare(`SELECT COUNT(*) as count FROM "${name}"`);
    cStmt.step();
    const row = cStmt.getAsObject() as { count: number };
    cStmt.free();
    return { name, count: row.count };
  });
}

export function getTableRows(tableName: string, limit = 100, offset = 0): unknown[] {
  if (!_db) { return []; }
  // Sanitize table name to prevent SQL injection
  const validTables = getTableList().map(t => t.name);
  if (!validTables.includes(tableName)) { return []; }
  const stmt = _db.prepare(`SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`);
  stmt.bind([limit, offset]);
  const results: unknown[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export function deleteRows(tableName: string, ids: number[]): void {
  if (!_db || ids.length === 0) { return; }
  const validTables = getTableList().map(t => t.name);
  if (!validTables.includes(tableName)) { return; }
  const placeholders = ids.map(() => '?').join(',');
  _db.run(`DELETE FROM "${tableName}" WHERE id IN (${placeholders})`, ids);
  _scheduleSave();
}

// ────────────────────── AI Conversations ──────────────────────

export interface AiConversationRow {
  id: string;
  title: string;
  provider: string;
  model: string;
  messages: string; // JSON stringified AiMessage[]
  message_count: number;
  token_total: number;
  created_at: string;
  updated_at: string;
}

export function upsertAiConversation(row: Omit<AiConversationRow, 'created_at' | 'updated_at'>): void {
  if (!_db) { return; }
  _db.run(
    `INSERT INTO ai_conversations (id, title, provider, model, messages, message_count, token_total, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(id) DO UPDATE SET
       title         = excluded.title,
       provider      = excluded.provider,
       model         = excluded.model,
       messages      = excluded.messages,
       message_count = excluded.message_count,
       token_total   = excluded.token_total,
       updated_at    = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    [row.id, row.title, row.provider, row.model, row.messages, row.message_count, row.token_total]
  );
  _scheduleSave();
}

export function getAiConversations(limit = 50): AiConversationRow[] {
  if (!_db) { return []; }
  const stmt = _db.prepare(
    `SELECT id, title, provider, model, message_count, token_total, created_at, updated_at
     FROM ai_conversations ORDER BY updated_at DESC LIMIT ?`
  );
  stmt.bind([limit]);
  const rows: AiConversationRow[] = [];
  while (stmt.step()) {
    const r = stmt.getAsObject() as unknown as AiConversationRow;
    r.messages = '[]'; // don't send full messages in list — loaded on demand
    rows.push(r);
  }
  stmt.free();
  return rows;
}

export function getAiConversationById(id: string): AiConversationRow | null {
  if (!_db) { return null; }
  const stmt = _db.prepare('SELECT * FROM ai_conversations WHERE id = ?');
  stmt.bind([id]);
  const row = stmt.step() ? (stmt.getAsObject() as unknown as AiConversationRow) : null;
  stmt.free();
  return row;
}

export function deleteAiConversation(id: string): void {
  if (!_db) { return; }
  _db.run('DELETE FROM ai_conversations WHERE id = ?', [id]);
  _scheduleSave();
}

export function clearAiConversations(): void {
  if (!_db) { return; }
  _db.run('DELETE FROM ai_conversations');
  _scheduleSave();
}
