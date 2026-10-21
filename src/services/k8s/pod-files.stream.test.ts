/**
 * A file search is read as `find` prints it.
 *
 * It used to wait for the whole walk and answer once. On an Azure pod with big
 * volumes a walk of `/` runs for minutes after the file turns up, so the screen
 * sat empty, a 30-second timer gave up, and the reader got nothing for a file
 * the terminal showed at once. These run `searchFiles` against a kubectl that
 * prints slowly and never finishes on its own.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  kill() {
    if (this.killed) return true;
    this.killed = true;
    setTimeout(() => this.emit('close', null), 0);
    return true;
  }
}

let child: FakeChild;
vi.mock('./kubectl', () => ({
  run: vi.fn(),
  spawnKubectl: vi.fn(async () => child),
}));

import { searchFiles } from './pod-files';

const pod = { context: 'c', namespace: 'n', pod: 'p' };
const ls = (path: string) => `-rw-r--r-- 1 0 0 120 Oct 20 10:00 ${path}\n`;
const tick = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => { child = new FakeChild(); });

describe('a file search, as it walks', () => {
  it('hands over hits while the walk is still going', async () => {
    const seen: string[] = [];
    const done = searchFiles(pod, { root: '/', pattern: 'application.properties' },
      hits => seen.push(...hits.map(h => h.path)));
    await tick();
    child.stdout.write(ls('/app/config/application.properties'));
    await new Promise(r => setTimeout(r, 200));
    // Nothing has ended — the hit is already out.
    expect(seen).toEqual(['/app/config/application.properties']);
    expect(child.killed).toBe(false);

    child.stdout.end();
    child.emit('close', 0);
    const r = await done;
    expect(r.hits.map(h => h.name)).toEqual(['application.properties']);
    expect(r.error).toBeUndefined();
  });

  it('ends the walk at the cap and says it was capped', async () => {
    const done = searchFiles(pod, { root: '/', pattern: '*.yml', limit: 2 });
    await tick();
    child.stdout.write(ls('/a.yml') + ls('/b.yml') + ls('/c.yml'));
    const r = await done;
    expect(child.killed).toBe(true);
    expect(r.capped).toBe(true);
    expect(r.hits).toHaveLength(2);
  });

  it('stops on the signal and keeps what it found', async () => {
    const ac = new AbortController();
    const done = searchFiles(pod, { root: '/', pattern: 'x', signal: ac.signal });
    await tick();
    child.stdout.write(ls('/opt/x.conf'));
    await tick();
    ac.abort();
    const r = await done;
    expect(child.killed).toBe(true);
    expect(r.hits.map(h => h.path)).toEqual(['/opt/x.conf']);
    expect(r.error).toBeUndefined();
  });

  it('says why when the pod could not be searched at all', async () => {
    const done = searchFiles(pod, { root: '/', pattern: 'x' });
    await tick();
    child.stderr.write('Error from server (Forbidden): pods "p" is forbidden');
    await tick();
    child.emit('close', 1);
    const r = await done;
    expect(r.error).toMatch(/Not allowed to exec/);
  });
});
