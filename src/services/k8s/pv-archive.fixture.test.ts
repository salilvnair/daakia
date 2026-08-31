/**
 * Archive search, against a real PersistentVolume layout on disk.
 *
 * dk8s could search archives before this and nothing had ever pointed it at a
 * volume — the code was covered by unit tests over synthetic paths, which
 * proves the walker walks and proves nothing about whether the feature works.
 *
 * The fixture is generated rather than committed: three rotated Spring Boot
 * logs, ~2.3MB, laid out the way a claim actually mounts —
 * `{namespace}/{app}/{date}/*.log` — with stack traces scattered through them
 * so continuation handling is exercised too. Ground truth for every assertion
 * is counted from the generated text, not asserted from memory.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { searchPvForPod } from './pv-search';
import { clearPvCache, type PvLogConfig } from './pv-logs';
import { DEFAULT_SEARCH } from './k8s-log-search';

let root: string;

const TRACE = [
  'org.postgresql.util.PSQLException: The connection attempt failed.',
  '\tat org.postgresql.Driver.makeConnection(Driver.java:434) ~[postgresql-42.7.4.jar!/:42.7.4]',
  '\tat java.base/java.net.Socket.connect(Socket.java:751) ~[na:na]',
  '\t... 20 common frames omitted',
];

/** Deterministic: the same file every run, so the counts below are stable. */
function makeLog(app: string, day: string, count: number, seed: number): string {
  const lines: string[] = [];
  let r = seed;
  const rand = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
  const threads = ['main', 'http-nio-8080-exec-1', 'http-nio-8080-exec-2'];

  for (let i = 0; i < count; i++) {
    const t = new Date(Date.parse(`${day}T06:00:00.000Z`) + i * 1000);
    const thread = threads[Math.floor(rand() * threads.length)]!;
    const isErr = rand() < 0.1;
    const level = isErr ? 'ERROR' : 'INFO ';
    const logger = isErr
      ? 'o.h.engine.jdbc.spi.SqlExceptionHelper'
      : `com.acme.${app.replace('pv-', '')}.OrderController`;
    const msg = isErr
      ? `ledger post failed for order ${100000 + i}`
      : `received order ${100000 + i} for customer ${41000 + (i % 300)}`;
    lines.push(
      `${t.toISOString()} ${level} 1 --- [${app}] [${thread.padStart(15)}] `
      + `${logger.padEnd(40)} : ${msg}`);
    if (isErr) lines.push(...TRACE);
  }
  return lines.join('\n') + '\n';
}

const FILES = [
  { app: 'pv-checkout', day: '2026-08-29', count: 4000, seed: 11 },
  { app: 'pv-checkout', day: '2026-08-30', count: 6000, seed: 22 },
  { app: 'pv-billing', day: '2026-08-30', count: 3000, seed: 33 },
];

/** Counted from the written files — the assertions below compare against this. */
const truth: Record<string, { lines: number; failures: number }> = {};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'dk8s-pv-'));
  for (const f of FILES) {
    const dir = join(root, 'dk8s-test', f.app, f.day);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'app.log');
    writeFileSync(file, makeLog(f.app, f.day, f.count, f.seed));

    const text = readFileSync(file, 'utf8');
    truth[`${f.app}/${f.day}`] = {
      lines: text.split('\n').filter(Boolean).length,
      failures: (text.match(/ledger post failed/g) ?? []).length,
    };
  }
  clearPvCache();
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const cfg = (): PvLogConfig => ({
  enabled: true,
  mounts: [{ path: root, label: 'test-pv' }],
  template: '{namespace}/{app}/{date}/*.log',
  extensions: ['.log'],
});

const ref = (app: string) => ({
  namespace: 'dk8s-test',
  pod: `${app}-659d7c6c8f-jl2hw`,
  workload: app,
}) as never;

const search = (app: string, over: Partial<typeof DEFAULT_SEARCH> = {}) =>
  searchPvForPod(cfg(), ref(app), { ...DEFAULT_SEARCH, ...over }, { cancelled: false });

describe('searching a mounted volume', () => {
  it('finds every occurrence across a pod’s rotated files', async () => {
    const { result } = await search('pv-checkout', {
      query: 'ledger post failed', maxMatchesPerPod: 100_000, maxMatchesTotal: 100_000,
    });
    const expected = truth['pv-checkout/2026-08-29']!.failures
      + truth['pv-checkout/2026-08-30']!.failures;
    expect(result.matched).toBe(expected);
    expect(result.files).toHaveLength(2);
  });

  it('scans every line of those files', async () => {
    const { result } = await search('pv-checkout', { query: 'ledger post failed' });
    const expected = truth['pv-checkout/2026-08-29']!.lines
      + truth['pv-checkout/2026-08-30']!.lines;
    expect(result.scanned).toBe(expected);
  });

  /*
    The scoping that matters: a claim is per application, and answering a
    question about checkout with a line from billing is the failure this
    template exists to prevent.
  */
  it('does not answer for one app with another app’s volume', async () => {
    const { result, matches } = await search('pv-billing', {
      query: 'ledger post failed', maxMatchesPerPod: 100_000, maxMatchesTotal: 100_000,
    });
    expect(result.matched).toBe(truth['pv-billing/2026-08-30']!.failures);
    expect(result.files).toHaveLength(1);
    expect(matches.every(m => m.rel.includes('pv-billing'))).toBe(true);
  });

  it('reports which files the hits came from', async () => {
    const { result } = await search('pv-checkout', { query: 'ledger post failed' });
    expect(result.files.map(f => f.rel).sort()).toEqual([
      'dk8s-test/pv-checkout/2026-08-29/app.log',
      'dk8s-test/pv-checkout/2026-08-30/app.log',
    ]);
    for (const f of result.files) expect(f.matched).toBeGreaterThan(0);
  });

  it('marks hits as archive so they render apart from live ones', async () => {
    const { matches } = await search('pv-checkout', { query: 'ledger post failed' });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every(m => m.source === 'archive')).toBe(true);
  });

  it('caps what it keeps while still counting everything', async () => {
    // The count is the truth; the kept matches are a page of it.
    const { result, matches } = await search('pv-checkout', {
      query: 'ledger post failed', maxMatchesPerPod: 50, maxMatchesTotal: 50,
    });
    expect(matches.length).toBeLessThanOrEqual(50);
    expect(result.matched).toBeGreaterThan(matches.length);
    expect(result.capped).toBe(true);
  });

  it('returns context lines around a hit', async () => {
    const { matches } = await search('pv-checkout', {
      query: 'ledger post failed', contextLines: 2,
    });
    expect(matches[0]!.before.length).toBeGreaterThan(0);
    expect(matches[0]!.after.length).toBeGreaterThan(0);
  });

  /*
    A matched stack frame belongs to the event that printed it. Searching for a
    frame's text and getting back an unlevelled line would lose the one thing
    that says how bad it is.
  */
  it('gives a matched stack frame the level of its event', async () => {
    const { matches } = await search('pv-checkout', { query: 'PSQLException' });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every(m => m.level === 'error')).toBe(true);
  });

  it('finds nothing for a term that is not there, without failing', async () => {
    const { result } = await search('pv-checkout', { query: 'zzz-not-in-any-log' });
    expect(result.matched).toBe(0);
    expect(result.error).toBeUndefined();
    expect(result.scanned).toBeGreaterThan(0);
  });

  it('supports a regex query', async () => {
    const { result } = await search('pv-checkout', {
      query: 'order 10000[0-9]\\b', regex: true,
      maxMatchesPerPod: 100_000, maxMatchesTotal: 100_000,
    });
    expect(result.matched).toBe(20);   // 100000-100009 in each of two files
  });

  it('stops when cancelled', async () => {
    const signal = { cancelled: true };
    const { result } = await searchPvForPod(
      cfg(), ref('pv-checkout'), { ...DEFAULT_SEARCH, query: 'order' }, signal);
    expect(result.scanned).toBe(0);
  });

  /*
    A date range must narrow what is READ, not just what is reported.

    Before this the archive was streamed from byte 0 every time and the range
    filtered afterwards, so the expensive half happened regardless — a filter
    that cost the same as no filter.
  */
  it('reads only the tail of a file for a recent time range', async () => {
    // Every fixture line is dated 2026-08-29/30, so a one-hour window ending
    // now contains none of them: the seek should land at the end and the scan
    // should walk almost nothing.
    const { result } = await search('pv-checkout', {
      query: 'ledger post failed', sinceSeconds: 3600,
    });
    const whole = truth['pv-checkout/2026-08-29']!.lines
      + truth['pv-checkout/2026-08-30']!.lines;
    expect(result.scanned).toBeLessThan(whole / 10);
  });

  it('still finds everything when no range is set', async () => {
    const { result } = await search('pv-checkout', {
      query: 'ledger post failed', maxMatchesPerPod: 100_000, maxMatchesTotal: 100_000,
    });
    expect(result.matched).toBe(
      truth['pv-checkout/2026-08-29']!.failures + truth['pv-checkout/2026-08-30']!.failures);
  });

  it('reports no files rather than an error for an app with no volume', async () => {
    const { result } = await search('pv-nothing', { query: 'order' });
    expect(result.files).toHaveLength(0);
    expect(result.matched).toBe(0);
    expect(result.error).toBeUndefined();
  });
});
