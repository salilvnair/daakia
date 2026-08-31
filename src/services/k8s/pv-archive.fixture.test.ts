/**
 * Archive search, against a real PersistentVolume layout on disk.
 *
 * dk8s could search archives before this and nothing had ever pointed it at a
 * volume — the code was covered by unit tests over synthetic paths, which
 * proves the walker walks and proves nothing about whether the feature works.
 *
 * The fixture is generated rather than committed, and laid out the way a claim
 * is actually mounted:
 *
 *     <app>-<env>-pvc/
 *       <app>.log                       the file being written now
 *       archived/
 *         <app>-2026-08-30.log          rotated, one per day
 *         <app>-2026-08-29.log
 *
 * The first version of this test used `{namespace}/{app}/{date}/*.log`, which
 * was invented rather than observed — a layout nobody mounts. It passed, which
 * is the point: a test built on a made-up shape proves the code handles the
 * made-up shape. The structure above is the one in use, and the live file
 * sitting beside an `archived/` directory is the part that matters, because it
 * is what makes `**` necessary in the template.
 *
 * Ground truth for every assertion is counted from the generated text.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
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

/** `rel` is relative to the mount, and mirrors a real claim's layout. */
const FILES = [
  // The live file, at the root of the claim.
  { app: 'pv-checkout', day: '2026-08-31', count: 2000, seed: 5,
    rel: 'pv-checkout-prod-pvc/pv-checkout.log' },
  // Rotated, under `archived/`, named with the day they cover.
  { app: 'pv-checkout', day: '2026-08-30', count: 6000, seed: 22,
    rel: 'pv-checkout-prod-pvc/archived/pv-checkout-2026-08-30.log' },
  { app: 'pv-checkout', day: '2026-08-29', count: 4000, seed: 11,
    rel: 'pv-checkout-prod-pvc/archived/pv-checkout-2026-08-29.log' },
  { app: 'pv-billing', day: '2026-08-31', count: 1500, seed: 7,
    rel: 'pv-billing-prod-pvc/pv-billing.log' },
  { app: 'pv-billing', day: '2026-08-30', count: 3000, seed: 33,
    rel: 'pv-billing-prod-pvc/archived/pv-billing-2026-08-30.log' },
];

/**
 * Counted from the written files, totalled per app.
 *
 * Per app rather than per file because that is the unit every assertion works
 * in: a search is for a pod, and a pod's answer spans its live file and all
 * its rotated ones.
 */
const truth: Record<string, { lines: number; failures: number; files: number }> = {};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'dk8s-pv-'));
  for (const f of FILES) {
    const file = join(root, ...f.rel.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, makeLog(f.app, f.day, f.count, f.seed));

    const text = readFileSync(file, 'utf8');
    const acc = truth[f.app] ?? { lines: 0, failures: 0, files: 0 };
    acc.lines += text.split('\n').filter(Boolean).length;
    acc.failures += (text.match(/ledger post failed/g) ?? []).length;
    acc.files += 1;
    truth[f.app] = acc;
  }
  clearPvCache();
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const cfg = (): PvLogConfig => ({
  enabled: true,
  mounts: [{ path: root, label: 'test-pv' }],
  /*
    `**` matches zero directories as well as many, which is what lets one
    template cover the live file at the claim's root and the rotated ones
    under `archived/`. A template without it finds only one of the two, and
    which one it misses depends on where you put the wildcard.
  */
  template: '{app}-{env}-pvc/**/{app}*.log',
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
    expect(result.matched).toBe(truth['pv-checkout']!.failures);
    // The live file and both rotated ones.
    expect(result.files).toHaveLength(truth['pv-checkout']!.files);
  });

  it('scans every line of those files', async () => {
    const { result } = await search('pv-checkout', { query: 'ledger post failed' });
    expect(result.scanned).toBe(truth['pv-checkout']!.lines);
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
    expect(result.matched).toBe(truth['pv-billing']!.failures);
    expect(result.files).toHaveLength(truth['pv-billing']!.files);
    expect(matches.every(m => m.rel.includes('pv-billing'))).toBe(true);
  });

  it('reports which files the hits came from', async () => {
    const { result } = await search('pv-checkout', { query: 'ledger post failed' });
    expect(result.files.map(f => f.rel).sort()).toEqual([
      'pv-checkout-prod-pvc/archived/pv-checkout-2026-08-29.log',
      'pv-checkout-prod-pvc/archived/pv-checkout-2026-08-30.log',
      'pv-checkout-prod-pvc/pv-checkout.log',
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
    // Orders 100000-100009 appear once in every one of the pod's files, live
    // and archived alike — derived rather than hardcoded, so adding a rotated
    // file to the fixture does not silently make this assertion wrong.
    expect(result.matched).toBe(10 * truth['pv-checkout']!.files);
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
    expect(result.scanned).toBeLessThan(truth['pv-checkout']!.lines / 10);
  });

  it('still finds everything when no range is set', async () => {
    const { result } = await search('pv-checkout', {
      query: 'ledger post failed', maxMatchesPerPod: 100_000, maxMatchesTotal: 100_000,
    });
    expect(result.matched).toBe(truth['pv-checkout']!.failures);
  });

  it('reports no files rather than an error for an app with no volume', async () => {
    const { result } = await search('pv-nothing', { query: 'order' });
    expect(result.files).toHaveLength(0);
    expect(result.matched).toBe(0);
    expect(result.error).toBeUndefined();
  });
});
