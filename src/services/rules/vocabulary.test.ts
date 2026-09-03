import { describe, it, expect, afterEach } from 'vitest';
import {
  BUILTIN_PACK, compileVocabulary, matchesCategory, parsePack,
  setUserPack, vocabulary, type RulePack,
} from './vocabulary';

/*
  The point of moving the vocabulary out of the bundle is that somebody can
  teach the rules a framework we have never heard of without waiting for a
  release. These tests are about that promise holding: a user pack ADDS, a bad
  pattern does not take the engine down, and disabling is explicit.
*/

afterEach(() => setUserPack());   // back to the built-ins

const pack = (over: Partial<RulePack> = {}): RulePack =>
  ({ version: '9.9.9', frames: {}, ...over });

describe('the built-in pack', () => {
  it('knows the frameworks the shipped rules were written against', () => {
    const v = compileVocabulary([BUILTIN_PACK]);
    expect(matchesCategory(v, 'txOpen',
      'org.springframework.transaction.interceptor.TransactionInterceptor.invoke')).toBe(true);
    expect(matchesCategory(v, 'blockingIo', 'okhttp3.internal.http2.Http2Stream.read')).toBe(true);
    expect(matchesCategory(v, 'dbCall', 'org.postgresql.jdbc.PgStatement.execute')).toBe(true);
    expect(matchesCategory(v, 'eventLoop', 'reactor-http-nio-2')).toBe(true);
  });

  it('does not match ordinary application code', () => {
    // A false positive tells someone their transaction boundary is wrong when
    // it is not, and they move code to fix something that was never broken.
    const v = compileVocabulary([BUILTIN_PACK]);
    for (const cat of ['txOpen', 'blockingIo', 'dbCall'] as const) {
      expect(matchesCategory(v, cat, 'com.acme.order.OrderService.submit')).toBe(false);
    }
    expect(matchesCategory(v, 'eventLoop', 'http-nio-exec-3')).toBe(false);
  });
});

describe('a user pack', () => {
  it('teaches the rules a framework the built-ins never heard of', () => {
    const v = setUserPack(pack({
      frames: { dbCall: [{ id: 'db.acme', pattern: '^com\\.acme\\.jdbc\\.' }] },
    }));
    expect(matchesCategory(v, 'dbCall', 'com.acme.jdbc.AcmeStatement.execute')).toBe(true);
  });

  it('adds to the built-ins rather than replacing them', () => {
    /*
      The failure this prevents is silent. Replacing would mean that teaching
      the tool one new JDBC driver quietly stops it recognising Postgres,
      MySQL, Oracle and the rest — and nothing on screen would say so.
    */
    const v = setUserPack(pack({
      frames: { dbCall: [{ id: 'db.acme', pattern: '^com\\.acme\\.jdbc\\.' }] },
    }));
    expect(matchesCategory(v, 'dbCall', 'org.postgresql.jdbc.PgStatement.execute')).toBe(true);
    expect(matchesCategory(v, 'dbCall', 'com.acme.jdbc.X.execute')).toBe(true);
  });

  it('can switch off a built-in it disagrees with, by id', () => {
    const v = setUserPack(pack({ disable: ['db.oracle'] }));
    expect(matchesCategory(v, 'dbCall', 'oracle.jdbc.driver.T4CStatement.execute')).toBe(false);
    expect(matchesCategory(v, 'dbCall', 'org.postgresql.jdbc.PgStatement.execute')).toBe(true);
  });

  it('reports a pattern that will not compile instead of throwing', () => {
    /*
      One bad line in someone's pack must not take every rule down with it. And
      a rule engine that silently stops matching is indistinguishable from an
      application with no problems, so the bad pattern is reported.
    */
    const v = setUserPack(pack({
      frames: {
        dbCall: [
          { id: 'db.broken', pattern: '^com\\.acme\\.(unclosed' },
          { id: 'db.fine', pattern: '^com\\.acme\\.jdbc\\.' },
        ],
      },
    }));
    expect(v.problems).toHaveLength(1);
    expect(v.problems[0].id).toBe('db.broken');
    // The good pattern beside it still works, and so do the built-ins.
    expect(matchesCategory(v, 'dbCall', 'com.acme.jdbc.X.execute')).toBe(true);
    expect(matchesCategory(v, 'dbCall', 'com.mysql.cj.jdbc.X.execute')).toBe(true);
  });

  it('is undone by installing nothing', () => {
    setUserPack(pack({ frames: { dbCall: [{ id: 'db.acme', pattern: '^com\\.acme\\.' }] } }));
    const back = setUserPack();
    expect(matchesCategory(back, 'dbCall', 'com.acme.X.go')).toBe(false);
    expect(matchesCategory(vocabulary(), 'dbCall', 'com.mysql.cj.jdbc.X.execute')).toBe(true);
  });
});

describe('parsePack', () => {
  it('accepts a well-formed pack', () => {
    const { pack: p, error } = parsePack(JSON.stringify({
      version: '1.0.0',
      frames: { dbCall: [{ id: 'db.acme', pattern: '^com\\.acme\\.' }] },
    }));
    expect(error).toBeUndefined();
    expect(p?.version).toBe('1.0.0');
  });

  it('says what is wrong rather than failing to load', () => {
    // Each of these is a mistake someone will make by hand, and each gets a
    // sentence naming it rather than a stack trace.
    expect(parsePack('{ not json').error).toMatch(/not valid JSON/);
    expect(parsePack('{}').error).toMatch(/needs a "version"/);
    expect(parsePack('{"version":"1","frames":{"nope":[]}}').error).toMatch(/Unknown frame category/);
    expect(parsePack('{"version":"1","frames":{"dbCall":{}}}').error).toMatch(/must be a list/);
    expect(parsePack('{"version":"1","frames":{"dbCall":[{"id":"x"}]}}').error)
      .toMatch(/needs an "id" and a "pattern"/);
  });
});
