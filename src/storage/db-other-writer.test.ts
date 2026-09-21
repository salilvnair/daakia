import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

/* db.ts imports `vscode`; only the settings reader is touched, and it returns defaults. */
vi.mock('vscode', () => ({
  workspace: { getConfiguration: () => ({ get: (_k: string, d?: unknown) => d }) },
  window: {},
  Uri: { file: (p: string) => ({ fsPath: p }) },
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Database as SqlJsDatabase } from 'sql.js';
import {
  initDb, closeDb, upsert, findAll, onDbReloaded, _checkForExternalChange, _saveNowForTest,
  type DbReloadEvent,
} from './db';

/*
  Two Daakias on one file: the VS Code extension and the browser build's local
  server both open ~/.salilvnair/daakia-vsce/db/daakia.db, each with its own
  in-memory copy. This process is one; a second sql.js instance plays the
  other, writing the file the way an older Daakia does — whole, in place.

  What must hold: this process never writes its copy over the other's newer
  one, it picks their changes up, and whatever it has to set aside is kept in
  a file beside the database rather than dropped.
*/

const ROOT = path.resolve(__dirname, '../..');
let SQL: { Database: new (data?: ArrayLike<number> | Buffer | null) => SqlJsDatabase };
let dir: string;
let file: string;
const events: DbReloadEvent[] = [];
const savedEnv = process.env.DAAKIA_TEST_DB_PATH;

/** The other Daakia: load the file as it is now, change it, write it back whole. */
function otherWriter(change: (db: SqlJsDatabase) => void): void {
  const db = new SQL.Database(fs.readFileSync(file));
  change(db);
  fs.writeFileSync(file, Buffer.from(db.export()));
  db.close();
  // Make sure the change is visible as a new mtime even on a coarse clock.
  const later = new Date(Date.now() + 2000);
  fs.utimesSync(file, later, later);
}

function kvIds(db: SqlJsDatabase): string[] {
  const res = db.exec("SELECT id FROM kv WHERE collection = 'probe' ORDER BY id");
  return res.length ? res[0].values.map(v => String(v[0])) : [];
}

function onDisk(): string[] {
  const db = new SQL.Database(fs.readFileSync(file));
  try { return kvIds(db); } finally { db.close(); }
}

function inFile(p: string): string[] {
  const db = new SQL.Database(fs.readFileSync(p));
  try { return kvIds(db); } finally { db.close(); }
}

const mine = () => findAll<{ id: string }>('probe').map(r => r.id).sort();

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const initSqlJs = require('sql.js') as typeof import('sql.js').default;
  SQL = await initSqlJs();
  onDbReloaded(e => events.push(e));
});

beforeEach(async () => {
  closeDb();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daakia-two-writers-'));
  file = path.join(dir, 'daakia.db');
  process.env.DAAKIA_TEST_DB_PATH = file;
  await initDb(ROOT);
  events.length = 0;
});

afterAll(() => {
  closeDb();
  if (savedEnv === undefined) delete process.env.DAAKIA_TEST_DB_PATH;
  else process.env.DAAKIA_TEST_DB_PATH = savedEnv;
});

describe('another Daakia writing the same database file', () => {
  it('leaves its own saves alone', () => {
    upsert('probe', 'a', { id: 'a' });
    _saveNowForTest();
    _checkForExternalChange();
    expect(events).toEqual([]);
    expect(onDisk()).toEqual(['a']);
  });

  it("picks up the other's change, and keeps its own copy beside the file", () => {
    upsert('probe', 'mine', { id: 'mine' });
    _saveNowForTest();
    otherWriter(db => db.run("INSERT INTO kv VALUES ('probe', 'theirs', '{\"id\":\"theirs\"}')"));

    _checkForExternalChange();

    expect(events.map(e => e.reason)).toEqual(['external']);
    expect(mine()).toEqual(['mine', 'theirs']);
    expect(inFile(events[0].backupPath!)).toEqual(['mine']);
  });

  it('keeps what a stale writer overwrote in the before-reload copy', () => {
    // The data-loss case: the other side loaded before our save and writes
    // its older copy back, without our row.
    const stale = fs.readFileSync(file);
    upsert('probe', 'workspace-made-here', { id: 'workspace-made-here' });
    _saveNowForTest();
    fs.writeFileSync(file, stale);
    const later = new Date(Date.now() + 2000);
    fs.utimesSync(file, later, later);

    _checkForExternalChange();

    expect(events.map(e => e.reason)).toEqual(['external']);
    expect(inFile(events[0].backupPath!)).toEqual(['workspace-made-here']);
  });

  it('never saves over a newer file: its unsaved change goes to a conflict file', () => {
    upsert('probe', 'pending', { id: 'pending' }); // queued, not yet written
    otherWriter(db => db.run("INSERT INTO kv VALUES ('probe', 'theirs', '{\"id\":\"theirs\"}')"));

    _saveNowForTest();

    expect(onDisk()).toEqual(['theirs']);
    expect(events.map(e => e.reason)).toEqual(['conflict']);
    expect(path.basename(events[0].backupPath!)).toMatch(/^daakia\.db\.conflict-/);
    expect(inFile(events[0].backupPath!)).toEqual(['pending']);
    expect(mine()).toEqual(['theirs']);
  });

  it('treats a change noticed while a save is waiting as a conflict too', () => {
    upsert('probe', 'pending', { id: 'pending' });
    otherWriter(db => db.run("INSERT INTO kv VALUES ('probe', 'theirs', '{\"id\":\"theirs\"}')"));

    _checkForExternalChange();

    expect(events.map(e => e.reason)).toEqual(['conflict']);
    expect(onDisk()).toEqual(['theirs']);
    expect(inFile(events[0].backupPath!)).toEqual(['pending']);
  });

  it('does not load a file caught half-written', () => {
    upsert('probe', 'kept', { id: 'kept' });
    _saveNowForTest();
    fs.writeFileSync(file, Buffer.alloc(0));
    const later = new Date(Date.now() + 2000);
    fs.utimesSync(file, later, later);

    _checkForExternalChange();

    expect(events).toEqual([]);
    expect(mine()).toEqual(['kept']);
  });

  it('writes by rename, so the file is never seen empty', () => {
    upsert('probe', 'a', { id: 'a' });
    _saveNowForTest();
    expect(fs.readdirSync(dir).filter(f => f.includes('.tmp-'))).toEqual([]);
    expect(onDisk()).toEqual(['a']);
  });
});
