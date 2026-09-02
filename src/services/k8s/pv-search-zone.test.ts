import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { searchPvForPod } from './pv-search';
import { DEFAULT_SEARCH } from './k8s-log-search';
import type { PvLogConfig } from './pv-logs';

/*
  A log that writes its timestamps without a zone.

  Very common — Spring Boot, Python's logging module and friends all print a
  bare `2026-08-30 06:32:25` by default. Reading one requires knowing the zone
  it was written in, and until that was configurable the reader's own was
  assumed: a UTC pod read from CST put every line five hours out, so a window
  over the right hour returned nothing and a window over the wrong one
  returned everything.
*/

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'dk8s-zone-'));
  mkdirSync(join(root, 'zoned-prod-pvc'), { recursive: true });
  // 06:00 through 06:04, no zone named anywhere in the file.
  const lines = Array.from({ length: 5 }, (_, i) =>
    `2026-08-30 06:0${i}:00 INFO 1 --- [zoned] target line ${i}`).join('\n');
  writeFileSync(join(root, 'zoned-prod-pvc', 'zoned.log'), lines + '\n');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const cfg = (logTimeZone: string): PvLogConfig => ({
  enabled: true,
  mounts: [{ path: root, label: 'zone-test' }],
  template: '{app}-{env}-pvc/**/{app}*.log*',
  extensions: ['.log'],
  logTimeZone,
});

const ref = { namespace: 'ns', pod: 'zoned-abc-123', workload: 'zoned' } as never;

const search = (logTimeZone: string, fromMs: number, toMs: number) => searchPvForPod(
  cfg(logTimeZone), ref,
  { ...DEFAULT_SEARCH, query: 'target line', fromMs, toMs,
    maxMatchesPerPod: 1000, maxMatchesTotal: 1000 } as never,
  { cancelled: false });

describe('a log whose timestamps name no zone', () => {
  it('lands where the configured zone says, not where the reader is', async () => {
    // 06:00–06:04 written by a UTC server is 06:00–06:04 UTC.
    const utc = await search('UTC',
      Date.parse('2026-08-30T06:00:00Z'), Date.parse('2026-08-30T06:04:59Z'));
    expect(utc.result.matched).toBe(5);
  });

  it('shifts by the offset when the log is written somewhere else', async () => {
    // The same readings from a Chicago server are 11:00–11:04 UTC, so the
    // window above now holds none of them...
    const missed = await search('America/Chicago',
      Date.parse('2026-08-30T06:00:00Z'), Date.parse('2026-08-30T06:04:59Z'));
    expect(missed.result.matched).toBe(0);
    // ...and the window five hours later holds all of them.
    const found = await search('America/Chicago',
      Date.parse('2026-08-30T11:00:00Z'), Date.parse('2026-08-30T11:04:59Z'));
    expect(found.result.matched).toBe(5);
  });

  it('finds every line when no window is asked for, whatever the zone', async () => {
    for (const zone of ['UTC', 'America/Chicago', 'Asia/Kolkata']) {
      const { result } = await searchPvForPod(
        cfg(zone), ref,
        { ...DEFAULT_SEARCH, query: 'target line', maxMatchesPerPod: 1000 } as never,
        { cancelled: false });
      expect(result.matched).toBe(5);
    }
  });
});
