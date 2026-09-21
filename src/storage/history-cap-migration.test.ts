import { describe, it, expect, beforeAll, vi } from 'vitest';

/* db.ts imports `vscode`, which only resolves inside a real extension host.
   Nothing this migration touches uses it. */
vi.mock('vscode', () => ({
  workspace: { getConfiguration: () => ({ get: (_k: string, d?: unknown) => d }) },
  window: {},
  Uri: { file: (p: string) => ({ fsPath: p }) },
}));
import type { Database as SqlJsDatabase } from 'sql.js';
import { _raiseLegacyHistoryCapForTest } from './db';

/*
  The Settings panel saves the whole `general` object whenever anything in it
  changes, so the old default of 500 ended up stored as if somebody had chosen
  it — and a stored value wins over the default. These pin the one-time repair.
*/

let SQL: { Database: new () => SqlJsDatabase };

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const initSqlJs = require('sql.js') as typeof import('sql.js').default;
  SQL = await initSqlJs();
});

function dbWith(general?: Record<string, unknown>): SqlJsDatabase {
  const db = new SQL.Database();
  db.run('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT)');
  if (general) db.run('INSERT INTO app_settings VALUES (?, ?)', ['general', JSON.stringify(general)]);
  return db;
}

function cap(db: SqlJsDatabase): unknown {
  const rows = db.exec("SELECT value FROM app_settings WHERE key = 'general'");
  return JSON.parse(rows[0].values[0][0] as string).maxHistoryEntries;
}

describe('the history-cap migration', () => {
  it('raises the stored old default to the new one', () => {
    const db = dbWith({ maxHistoryEntries: 500, timeout: 0 });
    _raiseLegacyHistoryCapForTest(db);
    expect(cap(db)).toBe(2000);
  });

  it('keeps everything else in the settings object', () => {
    const db = dbWith({ maxHistoryEntries: 500, timeout: 30, proxy: { mode: 'none' } });
    _raiseLegacyHistoryCapForTest(db);
    const rows = db.exec("SELECT value FROM app_settings WHERE key = 'general'");
    const general = JSON.parse(rows[0].values[0][0] as string);
    expect(general.timeout).toBe(30);
    expect(general.proxy).toEqual({ mode: 'none' });
  });

  it('leaves a number somebody chose alone', () => {
    const db = dbWith({ maxHistoryEntries: 750 });
    _raiseLegacyHistoryCapForTest(db);
    expect(cap(db)).toBe(750);
  });

  it('runs once — a 500 chosen afterwards stays 500', () => {
    const db = dbWith({ maxHistoryEntries: 500 });
    _raiseLegacyHistoryCapForTest(db);
    db.run("UPDATE app_settings SET value = ? WHERE key = 'general'",
      [JSON.stringify({ maxHistoryEntries: 500 })]);
    _raiseLegacyHistoryCapForTest(db);
    expect(cap(db)).toBe(500);
  });

  it('does nothing harmful on a fresh install with no settings saved', () => {
    const db = dbWith();
    expect(() => _raiseLegacyHistoryCapForTest(db)).not.toThrow();
    expect(db.exec("SELECT value FROM app_settings WHERE key = 'general'")).toEqual([]);
  });
});
