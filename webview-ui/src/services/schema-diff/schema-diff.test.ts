/**
 * The parts of Schema Diff that can be wrong quietly.
 *
 * The modal is checked by looking at it. These are not: an LCS that reports a
 * whole file as changed because one column moved, a severity that calls a
 * dropped column "info", or a parser that loses a function to the semicolons
 * inside its own body — all of them produce a screen that looks entirely
 * plausible and is wrong.
 *
 * DDL fixtures are built with `sql()` rather than written with escapes, because
 * these tests are about where the line breaks fall and a `\n` buried in a
 * string literal is the one detail nobody re-reads.
 */
import { describe, it, expect } from 'vitest';
import { diffLines, tally } from './lcs';
import {
  parseDdl, compareDdl, compareSchemas, fromComparePayload, analysisDigest,
} from './schema-diff';
import { buildMarkdownReport, buildMigrationSql } from './report';

/** Join lines into a statement, so the fixtures read as the SQL they are. */
const sql = (...lines: string[]) => lines.join('\n');

describe('diffLines', () => {
  it('marks one inserted line as one addition, not everything after it', () => {
    const t = tally(diffLines(sql('a', 'b', 'c'), sql('a', 'b', 'NEW', 'c')));
    expect(t).toEqual({ added: 1, removed: 0, same: 3 });
  });

  it('reports nothing for identical text', () => {
    expect(tally(diffLines(sql('x', 'y'), sql('x', 'y')))).toEqual({ added: 0, removed: 0, same: 2 });
  });

  it('ignores trailing whitespace when matching but keeps the original text', () => {
    const out = diffLines(sql('a  ', 'b'), sql('a', 'b'));
    expect(tally(out)).toEqual({ added: 0, removed: 0, same: 2 });
    expect(out[0].text).toBe('a  ');
  });

  it('handles an empty side', () => {
    expect(tally(diffLines('', sql('a', 'b')))).toEqual({ added: 2, removed: 0, same: 0 });
    expect(tally(diffLines(sql('a', 'b'), ''))).toEqual({ added: 0, removed: 2, same: 0 });
    expect(diffLines('', '')).toEqual([]);
  });

  it('numbers lines against the side they belong to', () => {
    const out = diffLines(sql('keep', 'gone'), sql('keep', 'new'));
    const removed = out.find(l => l.op === 'remove')!;
    const added = out.find(l => l.op === 'add')!;
    expect(removed.sourceLine).toBe(2);
    expect(removed.targetLine).toBeNull();
    expect(added.targetLine).toBe(2);
    expect(added.sourceLine).toBeNull();
  });
});

describe('parseDdl', () => {
  it('reads the object type and name off each CREATE', () => {
    const objs = parseDdl(sql(
      'CREATE TABLE public.users (id int);',
      'CREATE OR REPLACE VIEW active_users AS SELECT 1;',
      'CREATE UNIQUE INDEX idx_users_email ON users(email);',
      'CREATE MATERIALIZED VIEW mv_stats AS SELECT 1;',
    ));
    expect(objs.map(o => [o.type, o.name])).toEqual([
      ['table', 'public.users'],
      ['view', 'active_users'],
      ['index', 'idx_users_email'],
      ['materialized view', 'mv_stats'],
    ]);
  });

  it('does not split a function on the semicolons inside its body', () => {
    const objs = parseDdl(sql(
      'CREATE FUNCTION bump() RETURNS void AS $$',
      'BEGIN',
      '  UPDATE t SET n = n + 1;',
      "  RAISE NOTICE 'done';",
      'END;',
      '$$ LANGUAGE plpgsql;',
      'CREATE TABLE after_it (id int);',
    ));
    expect(objs).toHaveLength(2);
    expect(objs[0].type).toBe('function');
    expect(objs[0].name).toBe('bump');
    expect(objs[1].name).toBe('after_it');
  });

  it('keeps a statement it cannot parse rather than dropping it', () => {
    const objs = parseDdl('GRANT SELECT ON users TO reader;');
    expect(objs).toHaveLength(1);
    expect(objs[0].type).toBe('other');
  });

  it('strips quoting and a function argument list from the name', () => {
    const objs = parseDdl('CREATE FUNCTION "my_fn"(a int, b int) RETURNS int AS $$ SELECT 1 $$;');
    expect(objs[0].name).toBe('my_fn');
  });

  it('returns nothing for an empty dump', () => {
    expect(parseDdl('   ')).toEqual([]);
  });
});

describe('compareSchemas', () => {
  const SOURCE = sql(
    'CREATE TABLE users (id int, email text, created_at timestamptz);',
    'CREATE TABLE orders (id int);',
    'CREATE VIEW v_active AS SELECT 1;',
  );
  const TARGET = sql(
    'CREATE TABLE users (id int, created_at timestamptz);',
    'CREATE TABLE orders (id int);',
    'CREATE TABLE audit_log (id int);',
  );

  it('sorts an object the target is missing to the top and calls it critical', () => {
    const first = compareDdl(SOURCE, TARGET).anomalies[0];
    expect(first.status).toBe('missing');
    expect(first.severity).toBe('critical');
    expect(first.name).toBe('v_active');
  });

  it('treats a dropped column as critical and an added one as a warning', () => {
    /* Dropping the LAST column also rewrites the line above it — the trailing
       comma goes — so this is two removals and one addition, not one removal.
       Asserted as it is rather than as it feels: a diff that quietly hid the
       comma would be understating what has to be reviewed. */
    const dropped = compareDdl(
      sql('CREATE TABLE t (', ' id int,', ' email text', ');'),
      sql('CREATE TABLE t (', ' id int', ');'),
    ).anomalies[0];
    expect(dropped.status).toBe('drift');
    expect(dropped.severity).toBe('critical');
    expect(dropped.linesRemoved).toBe(2);
    expect(dropped.linesAdded).toBe(1);

    /* Adding a column in the middle touches nothing else. */
    const added = compareDdl(
      sql('CREATE TABLE t (', ' id int,', ' last text', ');'),
      sql('CREATE TABLE t (', ' id int,', ' email text,', ' last text', ');'),
    ).anomalies[0];
    expect(added.severity).toBe('warning');
    expect(added.linesAdded).toBe(1);
    expect(added.linesRemoved).toBe(0);
  });

  it('counts identical objects as in sync and keeps them for the graph', () => {
    const c = compareDdl(SOURCE, TARGET);
    expect(c.inSync).toBe(1);
    expect(c.anomalies.some(a => a.name === 'orders' && a.status === 'in-sync')).toBe(true);
    expect(c.total).toBe(c.anomalies.length);
  });

  it('reports an object only the target has', () => {
    const extra = compareDdl(SOURCE, TARGET).anomalies.find(a => a.name === 'audit_log')!;
    expect(extra.status).toBe('target-only');
    expect(extra.severity).toBe('warning');
    expect(extra.sourceDdl).toBe('');
  });

  it('does not count in-sync objects towards any severity', () => {
    const c = compareDdl('CREATE TABLE t (id int);', 'CREATE TABLE t (id int);');
    expect(c.counts).toEqual({ critical: 0, warning: 0, info: 0 });
    expect(c.inSync).toBe(1);
  });

  it('gives every object a key that is stable across runs and unique', () => {
    const a = compareDdl(SOURCE, TARGET).anomalies.map(x => x.key);
    const b = compareDdl(SOURCE, TARGET).anomalies.map(x => x.key);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it('separates two objects that share a name but not a type', () => {
    const c = compareSchemas(
      [{ name: 'thing', type: 'table', ddl: 'a' }, { name: 'thing', type: 'view', ddl: 'b' }],
      [{ name: 'thing', type: 'table', ddl: 'a' }],
    );
    expect(c.anomalies.find(a => a.type === 'view')!.status).toBe('missing');
    expect(c.anomalies.find(a => a.type === 'table')!.status).toBe('in-sync');
  });
});

describe('fromComparePayload', () => {
  it('adopts the tool payload without re-deriving it', () => {
    const c = fromComparePayload({
      only_in_left: { tables: ['dropped_table'] },
      only_in_right: { views: [{ name: 'extra_view', ddl: 'CREATE VIEW extra_view AS SELECT 1;' }] },
      both_different: { tables: [{ name: 'users', left: sql('a', 'b'), right: 'a' }] },
      both_same: { tables: ['orders'] },
    });
    const by = (n: string) => c.anomalies.find(a => a.name === n)!;
    expect(by('dropped_table').status).toBe('missing');
    expect(by('extra_view').status).toBe('target-only');
    expect(by('extra_view').type).toBe('view');
    expect(by('users').status).toBe('drift');
    expect(by('users').severity).toBe('critical');
    expect(c.inSync).toBe(1);
  });

  it('accepts source/target as aliases for left/right', () => {
    const c = fromComparePayload({
      both_different: { tables: [{ name: 't', source: sql('x', 'y'), target: 'x' }] },
    });
    expect(c.anomalies[0].linesRemoved).toBe(1);
  });

  it('survives an empty payload', () => {
    const c = fromComparePayload({});
    expect(c.anomalies).toEqual([]);
    expect(c.total).toBe(0);
  });
});

describe('analysisDigest', () => {
  it('sends the model the facts without the DDL bodies', () => {
    const c = compareDdl(
      sql('CREATE TABLE t (', ' id int,', ' gone text', ');'),
      sql('CREATE TABLE t (', ' id int', ');'),
    );
    const digest = analysisDigest(c);
    expect(digest).toContain('table "t" — drift, critical');
    expect(digest).toContain('1 with differences');
    expect(digest).not.toContain('CREATE TABLE');
  });

  it('leaves the database names to the prompt that wraps it', () => {
    /* The prompt states them, and it is user-editable. Saying them twice reads
       to a model as emphasis that nobody intended. */
    const digest = analysisDigest(compareDdl('CREATE TABLE t (id int);', ''));
    expect(digest).not.toContain('Source:');
    expect(digest).not.toContain('Target:');
  });
});

describe('buildMarkdownReport', () => {
  const NOW = new Date('2026-09-08T00:00:00.000Z');

  it('leads with the two databases and the severity counts', () => {
    const c = compareDdl('CREATE TABLE a (id int);', 'CREATE TABLE b (id int);');
    const md = buildMarkdownReport(c, { sourceLabel: 'ST', targetLabel: 'PROD', now: NOW });
    expect(md).toContain('**Source** `ST`');
    expect(md).toContain('**Target** `PROD`');
    expect(md).toContain('2026-09-08T00:00:00.000Z');
    expect(md).toContain('| Critical | 1 |');
  });

  it('writes a diff body for a drifted object and a plain body for a missing one', () => {
    const c = compareDdl(
      sql('CREATE TABLE t (', ' id int,', ' gone text', ');', 'CREATE VIEW v AS SELECT 1;'),
      sql('CREATE TABLE t (', ' id int', ');'),
    );
    const md = buildMarkdownReport(c, { sourceLabel: 'a', targetLabel: 'b', now: NOW });
    expect(md).toContain('```diff');
    expect(md).toContain('- gone text');
    expect(md).toContain('Present on the source, absent on the target');
  });

  it('says so plainly when the schemas match', () => {
    const c = compareDdl('CREATE TABLE t (id int);', 'CREATE TABLE t (id int);');
    const md = buildMarkdownReport(c, { sourceLabel: 'a', targetLabel: 'b', now: NOW });
    expect(md).toContain('None — the two schemas match.');
  });

  it('includes the migration only once it has been generated', () => {
    const c = compareDdl('CREATE TABLE t (id int);', '');
    const without = buildMarkdownReport(c, { sourceLabel: 'a', targetLabel: 'b', now: NOW });
    expect(without).not.toContain('## Migration');

    const withMigration = buildMarkdownReport(c, {
      sourceLabel: 'a', targetLabel: 'b', now: NOW,
      migration: { deploy: 'CREATE TABLE t (id int);', verify: 'SELECT 1;', revert: 'DROP TABLE t;' },
    });
    expect(withMigration).toContain('## Migration');
    expect(withMigration).toContain('### revert.sql');
  });
});

describe('buildMigrationSql', () => {
  it('keeps the three scripts in one file, in order, and says it has not been run', () => {
    const out = buildMigrationSql(
      { deploy: 'A;', verify: 'B;', revert: 'C;' },
      { sourceLabel: 'ST', targetLabel: 'PROD', now: new Date('2026-09-08T00:00:00.000Z') },
    );
    expect(out).toContain('-- Source: ST');
    expect(out).toContain('has not been executed');
    expect(out.indexOf('A;')).toBeLessThan(out.indexOf('B;'));
    expect(out.indexOf('B;')).toBeLessThan(out.indexOf('C;'));
  });
});
