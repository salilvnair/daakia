/**
 * The windowed archive read, run for real in a shell against files on disk —
 * where there is a shell and an awk to run it (Git Bash, Linux, macOS).
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { grepScript, parseMarkedGrep, zoneStamp } from './pv-in-pod';

const hasShell = spawnSync('sh', ['-c', 'command -v awk'], { encoding: 'utf8' }).status === 0;

/* 600 lines a minute for an hour — a busy file, where the window sits deep inside it. */
function busyLog(dir: string): string {
  const f = path.join(dir, 'app.2026-10-03.27.log');
  const lines: string[] = [];
  const start = Date.UTC(2026, 9, 3, 4, 0, 0);
  for (let i = 0; i < 36000; i++) {
    const t = new Date(start + i * 100).toISOString();
    const thread = i % 3 === 0 ? 'scheduling-2' : 'nio-8104-exec-1';
    lines.push(`${t} INFO 1 --- [ ${thread}] c.z.Job : line ${i}`);
    if (i === 34200) lines.push('\tat com.zaxxer.Pool.get(Pool.java:12)');
  }
  fs.writeFileSync(f, lines.join('\n') + '\n');
  return f;
}

describe.skipIf(!hasShell)('the windowed archive read, in a real shell', () => {
  it('spends the line cap on the window, not on the start of the file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-pv-'));
    busyLog(dir);
    const from = Date.UTC(2026, 9, 3, 4, 57, 0);
    const to = Date.UTC(2026, 9, 3, 4, 58, 0);
    const script = grepScript(dir.split(path.sep).join('/'), '.', {
      regex: true, maxLines: 5000,
      sinceMs: Date.now() - 60 * 60_000,
      window: { from: zoneStamp(from), to: zoneStamp(to) },
    });
    const out = spawnSync('sh', ['-c', script], { encoding: 'utf8' }).stdout.split('\n');
    const hits = parseMarkedGrep(out, dir).filter(m => !m.context);
    /* 600 lines in the minute — all of them, though the file holds 36,000. */
    expect(hits.length).toBeGreaterThanOrEqual(600);
    expect(hits.length).toBeLessThan(700);
    expect(hits[0].text).toContain('2026-10-03T04:57:00');
    expect(hits[hits.length - 1].text.startsWith('2026-10-03T04:58:00') || hits[hits.length - 1].text.startsWith('\tat')).toBe(true);
    /* Line numbers are the file's own, so a link to the line still lands on it. */
    expect(hits[0].line).toBe(34201);
  });

  it('a literal pattern stays literal, and a frame goes with the line above it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-pv-'));
    busyLog(dir);
    const from = Date.UTC(2026, 9, 3, 4, 57, 0);
    const to = Date.UTC(2026, 9, 3, 4, 57, 1);
    const script = grepScript(dir.split(path.sep).join('/'), 'Pool.get', {
      maxLines: 5000, contextLines: 1,
      sinceMs: Date.now() - 60 * 60_000,
      window: { from: zoneStamp(from), to: zoneStamp(to) },
    });
    const out = spawnSync('sh', ['-c', script], { encoding: 'utf8' }).stdout.split('\n');
    const all = parseMarkedGrep(out, dir);
    expect(all.filter(m => !m.context).map(m => m.text)).toEqual(['\tat com.zaxxer.Pool.get(Pool.java:12)']);
    expect(all.filter(m => m.context).length).toBe(2);
  });
});

describe('zoneStamp', () => {
  it('spells a moment the way an ISO log line does, in the log’s zone', () => {
    const ms = Date.UTC(2026, 9, 3, 4, 57, 13);
    expect(zoneStamp(ms)).toBe('2026-10-03T04:57:13');
    expect(zoneStamp(ms, 'America/Chicago')).toBe('2026-10-02T23:57:13');
    expect(zoneStamp(ms, 'Not/AZone')).toBe('2026-10-03T04:57:13');
  });
});
