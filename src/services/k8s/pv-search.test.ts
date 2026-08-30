import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { searchPvForPod } from './pv-search';
import { clearPvCache, type PvLogConfig } from './pv-logs';
import { DEFAULT_SEARCH } from './k8s-log-search';

let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dk8s-pvs-'));
  const write = async (rel: string, body: string) => {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  };

  // The oldest file holds the original failure — the thing kubectl logs can no
  // longer reach once a pod has restarted a few hundred times.
  await write('dk8s-test/zp-backend/2026-08-28/app.log', [
    '2026-08-28T10:00:00Z INFO starting',
    '2026-08-28T10:00:01Z INFO connecting to db',
    '2026-08-28T10:00:02Z ERROR Connection refused to postgres:5432',
    '2026-08-28T10:00:03Z INFO retrying',
    '2026-08-28T10:00:04Z INFO gave up',
  ].join('\n') + '\n');

  await write('dk8s-test/zp-backend/2026-08-30/app.log', [
    '2026-08-30T06:00:00Z INFO started',
    '2026-08-30T06:00:01Z WARN slow query 1200ms',
  ].join('\n') + '\n');

  await write('dk8s-test/other-app/2026-08-30/app.log',
    '2026-08-30T06:00:00Z ERROR Connection refused elsewhere\n');
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

beforeEach(() => clearPvCache());

const cfg: PvLogConfig = {
  enabled: true,
  root: '',
  template: '{namespace}/{app}/{date}/*.log*',
  extensions: ['.log'],
};

const opts = (over = {}) => ({
  ...DEFAULT_SEARCH, query: 'Connection refused', contextLines: 1, ...over,
});

const ref = { namespace: 'dk8s-test', pod: 'zp-backend-7f9455548d-xm6kc' };
const live = () => ({ cancelled: false });

describe('searchPvForPod', () => {
  it('finds a hit in a rotated file that kubectl logs can no longer reach', async () => {
    const { result, matches } = await searchPvForPod(
      { ...cfg, root }, ref, opts(), live(),
    );
    expect(result.matched).toBe(1);
    expect(matches[0].text).toMatch(/Connection refused to postgres/);
    expect(matches[0].source).toBe('archive');
    expect(matches[0].rel).toBe('dk8s-test/zp-backend/2026-08-28/app.log');
    // Parsed off the line, so archive hits sort against live ones by time.
    expect(matches[0].ts).toBe(Date.parse('2026-08-28T10:00:02Z'));
    expect(matches[0].level).toBe('error');
  });

  it('carries context either side, so a hit reads in situ', async () => {
    const { matches } = await searchPvForPod({ ...cfg, root }, ref, opts(), live());
    expect(matches[0].before).toEqual(['2026-08-28T10:00:01Z INFO connecting to db']);
    expect(matches[0].after).toEqual(['2026-08-28T10:00:03Z INFO retrying']);
  });

  it('lists only the files that actually matched', async () => {
    const { result } = await searchPvForPod({ ...cfg, root }, ref, opts(), live());
    // The 08-30 file was scanned but had no hit, so it is not in the list —
    // a file list of everything scanned is noise.
    expect(result.files.map(f => f.rel)).toEqual(['dk8s-test/zp-backend/2026-08-28/app.log']);
    expect(result.files[0].matched).toBe(1);
    expect(result.files[0].bytes).toBeGreaterThan(0);
  });

  it('scans every file for the pod, not just the one that matched', async () => {
    const { result } = await searchPvForPod({ ...cfg, root }, ref, opts(), live());
    expect(result.scanned).toBe(7);   // 5 lines + 2 lines
  });

  it('does not reach another application', async () => {
    const { result } = await searchPvForPod({ ...cfg, root }, ref, opts(), live());
    expect(result.files.some(f => f.rel.includes('other-app'))).toBe(false);
  });

  it('supports regex, and reports a cap without losing the count', async () => {
    const { result, matches } = await searchPvForPod(
      { ...cfg, root }, ref,
      opts({ query: 'INFO|WARN', regex: true, maxMatchesPerPod: 2 }),
      live(),
    );
    expect(matches).toHaveLength(2);
    // Counting continues past the cap, so the total stays honest.
    expect(result.matched).toBeGreaterThan(2);
    expect(result.capped).toBe(true);
  });

  it('stops when cancelled', async () => {
    const signal = { cancelled: true };
    const { result } = await searchPvForPod({ ...cfg, root }, ref, opts(), signal);
    expect(result.scanned).toBe(0);
  });

  it('returns nothing for a pod with no archive, without erroring', async () => {
    const { result, matches } = await searchPvForPod(
      { ...cfg, root }, { namespace: 'nope', pod: 'ghost-abcdef1234-xxxxx' }, opts(), live(),
    );
    expect(result.error).toBeUndefined();
    expect(result.matched).toBe(0);
    expect(matches).toEqual([]);
  });
});
