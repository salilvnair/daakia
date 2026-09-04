import { describe, it, expect, beforeEach } from 'vitest';
import { useDk8sFilesStore } from './dk8s-files-store';

const reset = () => useDk8sFilesStore.setState({ downloads: [], unseen: 0 });
const s = () => useDk8sFilesStore.getState();

describe('the downloads store', () => {
  beforeEach(reset);

  it('records a download the moment it starts, not when it ends', () => {
    /*
      A 1.4 GB copy takes minutes. A list that only shows finished downloads
      leaves the reader with nothing on screen while the thing they asked for
      is actually happening, which reads as "the click did nothing".
    */
    s().started({ name: 'snapshot.db', dest: '/tmp/x/snapshot.db' });
    expect(s().downloads).toHaveLength(1);
    expect(s().downloads[0].state).toBe('running');
  });

  it('settles a download that finishes', () => {
    s().started({ name: 'a.csv', dest: '/tmp/a.csv' });
    s().finished({ name: 'a.csv', bytes: 4404019 });
    expect(s().downloads[0]).toMatchObject({ state: 'done', bytes: 4404019 });
  });

  it('keeps the reason a download failed', () => {
    /*
      The bug this store was written for. The host produces a good message —
      "this container has no tar" — and before there was a listener it went
      nowhere at all.
    */
    s().started({ name: 'audit', dest: '/tmp/audit', directory: true });
    s().failed({ name: 'audit', error: 'This container has no tar…' });
    expect(s().downloads[0]).toMatchObject({ state: 'failed' });
    expect(s().downloads[0].error).toMatch(/no tar/);
  });

  it('counts a failure as worth looking at, not just a success', () => {
    // The badge pulls someone back to the list, and the download they most
    // need to see is the one that did not work.
    s().started({ name: 'x', dest: '/tmp/x' });
    s().failed({ name: 'x', error: 'nope' });
    expect(s().unseen).toBe(1);
  });

  it('settles the oldest running download of that name', () => {
    /*
      The host reports by name rather than by an id it was handed, so two
      downloads of one file are otherwise indistinguishable. Resolving the
      first still-running row means the first completion settles the first
      request, which is the order someone watching would expect.
    */
    s().started({ name: 'dup.txt', dest: '/tmp/1/dup.txt' });
    s().started({ name: 'dup.txt', dest: '/tmp/2/dup.txt' });
    s().finished({ name: 'dup.txt', bytes: 10 });

    const done = s().downloads.filter(d => d.state === 'done');
    const running = s().downloads.filter(d => d.state === 'running');
    expect(done).toHaveLength(1);
    expect(running).toHaveLength(1);
  });

  it('ignores a completion for something it never saw start', () => {
    // A stray message must not invent a row that claims a file is on disk.
    s().finished({ name: 'ghost', bytes: 1 });
    expect(s().downloads).toHaveLength(0);
  });

  it('never settles the same row twice', () => {
    s().started({ name: 'a', dest: '/tmp/a' });
    s().finished({ name: 'a', bytes: 5 });
    s().finished({ name: 'a', bytes: 999 });
    expect(s().downloads[0].bytes).toBe(5);
    expect(s().unseen).toBe(1);
  });

  it('clears finished rows but leaves work in progress alone', () => {
    // Clearing a running download would hide a copy that is still writing.
    s().started({ name: 'done', dest: '/tmp/done' });
    s().finished({ name: 'done', bytes: 1 });
    s().started({ name: 'busy', dest: '/tmp/busy' });
    s().clearFinished();
    expect(s().downloads.map(d => d.name)).toEqual(['busy']);
  });

  it('keeps the newest downloads when the list grows long', () => {
    for (let i = 0; i < 60; i++) s().started({ name: `f${i}`, dest: `/tmp/f${i}` });
    expect(s().downloads).toHaveLength(50);
    expect(s().downloads[0].name).toBe('f59');
  });

  it('marks the badge read without touching the rows', () => {
    s().started({ name: 'a', dest: '/tmp/a' });
    s().finished({ name: 'a', bytes: 1 });
    s().markSeen();
    expect(s().unseen).toBe(0);
    expect(s().downloads).toHaveLength(1);
  });
});
