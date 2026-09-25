/**
 * A whole pod log in a temporary file: written in time order, paged without
 * loading it, filtered as the view filters, found by time, cut at the cap —
 * and gone when it is closed.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

const { home } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os') as typeof import('os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path') as typeof import('path');
  return { home: nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'daakia-capture-')) };
});
vi.mock('os', async (orig) => {
  const real = await orig<typeof import('os')>();
  return { ...real, default: { ...real, homedir: () => home }, homedir: () => home };
});

/* What each kubectl call answers: `logs` gets the live log, `exec … cat <f>` the archive file. */
const answers: { live: string; files: Record<string, string> } = { live: '', files: {} };
vi.mock('./kubectl', () => ({
  spawnKubectl: async (args: string[]) => {
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill: () => void };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    let killed = false;
    child.kill = () => { killed = true; };
    const body = args.includes('logs') ? answers.live : answers.files[args[args.length - 1]] ?? '';
    setImmediate(() => {
      for (let i = 0; i < body.length && !killed; i += 64) child.stdout.write(body.slice(i, i + 64));
      child.stdout.end();
      setImmediate(() => child.emit('close', 0));
    });
    return child;
  },
}));
vi.mock('./pv-in-pod', () => ({
  listInPod: async () => ({
    root: '/var/log/app', commands: [],
    files: Object.keys(answers.files).map((p, i) => ({ path: p, rel: path.basename(p), bytes: answers.files[p].length, mtime: 1000 + i })),
  }),
}));

import {
  startCapture, readPage, filterCapture, locate, closeCapture, captureRoot,
  appTimestamp, pickArchiveFiles, type CaptureInfo,
} from './log-capture';

const target = { context: 'c', namespace: 'n', pod: 'zp-backend-big-one-7f-abc' };
const appLine = (t: string, thread: string, msg: string) => `2026-09-25T${t}Z  INFO 1 --- [zp] [${thread}] c.z.X : ${msg}`;
const liveLine = (t: string, thread: string, msg: string) => `2026-09-25T${t}.000000000Z ${appLine(t, thread, msg)}`;

function capture(id: string, extra: Partial<Parameters<typeof startCapture>[0]> = {}): Promise<CaptureInfo> {
  return new Promise((resolve, reject) => {
    void startCapture({ id, target, archiveRoots: ['/var/log/app'], ...extra }, {
      onProgress: () => {}, onReady: resolve, onError: e => reject(new Error(e)),
    });
  });
}

beforeEach(() => {
  answers.files = {
    '/var/log/app/zp.1.log': [appLine('01:00:00', 'exec-1', 'old one'), appLine('01:00:01', 'exec-2', 'old two')].join('\n') + '\n',
    '/var/log/app/zp.2.log': [appLine('02:00:00', 'exec-1', 'newer'), '\tat frame.one(X.java:1)', appLine('03:00:00', 'exec-1', 'overlaps live')].join('\n') + '\n',
  };
  answers.live = [
    liveLine('03:00:00', 'exec-1', 'overlaps live'),
    liveLine('03:00:01', 'exec-2', 'requestDataId=9363 calling contract'),
    liveLine('03:00:02', 'exec-1', 'read timed out for requestDataId=9363'),
  ].join('\n') + '\n';
});

afterAll(() => { fs.rmSync(home, { recursive: true, force: true }); });

describe('downloading', () => {
  it('writes archive then live, in time order, without the overlap, and indexes every line', async () => {
    const info = await capture('t1');
    const page = readPage('t1', 0, 100)!;
    expect(page.total).toBe(info.lines);
    expect(page.lines.map(l => l.text.split(' : ')[1] ?? l.text.trim())).toEqual([
      'old one', 'old two', 'newer', 'at frame.one(X.java:1)',
      'overlaps live', 'requestDataId=9363 calling contract', 'read timed out for requestDataId=9363',
    ]);
    expect(info.archive.files).toBe(2);
    expect(fs.existsSync(path.join(captureRoot(), 't1.log'))).toBe(true);
    closeCapture('t1');
  });

  it('pages without reading the rest, keeping line numbers stable', async () => {
    await capture('t2');
    const p = readPage('t2', 4, 2)!;
    expect(p.from).toBe(4);
    expect(p.lines.map(l => l.seq)).toEqual([4, 5]);
    closeCapture('t2');
  });

  it('stops at the cap, on a whole line, and says so', async () => {
    answers.live = Array.from({ length: 30000 }, (_, i) => liveLine('03:00:00', 'exec-1', `line ${i} ${'x'.repeat(40)}`)).join('\n') + '\n';
    const info = await capture('t3', { capBytes: 1024 * 1024, archiveRoots: [] });
    expect(info.capped).toBe(true);
    expect(info.bytes).toBeLessThanOrEqual(1024 * 1024);
    const last = readPage('t3', info.lines - 1, 1)!.lines[0];
    expect(last.text).toMatch(/x{40}$/);
    closeCapture('t3');
  });
});

describe('the whole-file filter', () => {
  it('finds every line of a request across the file, and pages over just those', async () => {
    await capture('t4');
    let done = false;
    await filterCapture('t4', { query: 'requestDataId=9363', levels: [] }, p => { done = p.done; });
    expect(done).toBe(true);
    const p = readPage('t4', 0, 50)!;
    expect(p.filtered).toBe(true);
    expect(p.total).toBe(2);
    expect(p.lines.map(l => l.seq)).toEqual([5, 6]);
    await filterCapture('t4', { query: '', levels: [] }, () => {});
    expect(readPage('t4', 0, 50)!.filtered).toBe(false);
    closeCapture('t4');
  });
});

describe('finding a line', () => {
  it('by time, and by text nearest that time', async () => {
    await capture('t5');
    expect(locate('t5', { ts: Date.parse('2026-09-25T02:00:00Z') })).toBe(2);
    expect(locate('t5', { ts: Date.parse('2026-09-25T03:00:02Z'), text: 'read timed out' })).toBe(6);
    closeCapture('t5');
  });
});

describe('closing', () => {
  it('deletes the file', async () => {
    await capture('t6');
    const file = path.join(captureRoot(), 't6.log');
    expect(fs.existsSync(file)).toBe(true);
    closeCapture('t6');
    expect(fs.existsSync(file)).toBe(false);
    expect(readPage('t6', 0, 1)).toBeUndefined();
  });
});

describe('small pieces', () => {
  it('reads an app timestamp with or without a zone', () => {
    expect(appTimestamp('2026-09-25T02:40:45.703Z ERROR x')).toBe(Date.parse('2026-09-25T02:40:45.703Z'));
    expect(appTimestamp('2026-09-25 02:40:45,703 ERROR x')).toBe(Date.parse('2026-09-25T02:40:45.703Z'));
    expect(appTimestamp('\tat frame')).toBeUndefined();
  });

  it('takes the newest archive files that fit, oldest first, and only the app\'s own on a shared volume', () => {
    const f = (rel: string, bytes: number, mtime: number) => ({ path: `/v/${rel}`, rel, bytes, mtime });
    const { take } = pickArchiveFiles([f('zp.1.log', 10, 1), f('zp.2.log', 10, 2), f('zp.3.log', 10, 3), f('other.log', 10, 4)], 20, 'zp');
    expect(take.map(x => x.rel)).toEqual(['zp.2.log', 'zp.3.log']);
  });
});
