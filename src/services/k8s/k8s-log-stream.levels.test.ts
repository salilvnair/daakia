/**
 * The Errors window: a stream asked for some levels sends only those, and a
 * stack trace stays with the error above it.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { LogLine } from './k8s-log-stream';

let child: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void; exitCode: number | null };
vi.mock('./kubectl', () => ({
  spawnKubectl: async () => {
    const pipe = () => Object.assign(new EventEmitter(), { setEncoding: () => undefined });
    child = Object.assign(new EventEmitter(), {
      stdout: pipe(), stderr: pipe(), exitCode: null as number | null,
      kill: () => undefined,
    });
    return child;
  },
}));

import { streamLogs } from './k8s-log-stream';

const tick = () => new Promise(r => setTimeout(r, 0));

async function read(levels: ('error' | 'warn')[] | undefined, raw: string[]): Promise<LogLine[]> {
  const got: LogLine[] = [];
  let ended!: () => void;
  const done = new Promise<void>(r => { ended = r; });
  streamLogs('c', 'n', 'p', { levels, fromIso: '2026-10-01T10:00:00Z', toMs: Date.parse('2026-10-01T11:00:00Z') }, {
    onLines: lines => got.push(...lines),
    onStatus: s => { if (s === 'ended') ended(); },
    onDropped: () => undefined,
    onFormat: () => undefined,
  });
  await tick(); await tick();
  child.stdout.emit('data', Buffer.from(raw.join('\n') + '\n'));
  child.exitCode = 0;
  child.emit('close', 0);
  child.emit('exit', 0);
  await Promise.race([done, new Promise(r => setTimeout(r, 1500))]);
  return got;
}

const at = (s: number) => `2026-10-01T10:00:${String(s).padStart(2, '0')}.000Z`;
const LOG = [
  `${at(1)} 2026-10-01 10:00:01.000 INFO 1 --- [main] c.z.App : started`,
  `${at(2)} 2026-10-01 10:00:02.000 ERROR 1 --- [exec-1] c.z.Rules : request failed`,
  `${at(2)} java.net.SocketTimeoutException: Read timed out`,
  `${at(2)} \tat java.net.Socket.read(Socket.java:42)`,
  `${at(3)} 2026-10-01 10:00:03.000 WARN 1 --- [exec-2] c.z.Pool : slow`,
  `${at(4)} 2026-10-01 10:00:04.000 INFO 1 --- [exec-3] c.z.Api : GET /ok 200`,
];

describe('a stream asked for errors only', () => {
  it('sends the error with its trace, and nothing else', async () => {
    const lines = await read(['error'], LOG);
    expect(lines.map(l => l.text.trim())).toEqual([
      expect.stringContaining('ERROR 1 --- [exec-1] c.z.Rules : request failed'),
      'java.net.SocketTimeoutException: Read timed out',
      'at java.net.Socket.read(Socket.java:42)',
    ]);
    expect(lines.every(l => l.level === 'error')).toBe(true);
  });

  it('sends everything when no levels are asked for', async () => {
    expect(await read(undefined, LOG)).toHaveLength(6);
  });
});
