/**
 * Writing generated requests into a collection.
 *
 * Two things here are load-bearing and neither is obvious from the call site:
 * `data` is a whitelist, so anything not copied into it is lost the moment the
 * request is stored; and the folders the review screen shows have to be the
 * folders that get written, or the collection disagrees with the screen that
 * proposed it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const posted: Record<string, unknown>[] = [];
vi.mock('../../vscode', () => ({ postMsg: (m: Record<string, unknown>) => { posted.push(m); } }));

import { toCollectionRequest, importRequestsAsCollection } from './import-to-collection';

beforeEach(() => { posted.length = 0; });

const stamp = { detector: 'spring', source: 'X.java:1', identity: 'GET /a', written: 'abc', at: 'now', provenance: {} };

describe('the stored envelope', () => {
  it('carries a scan stamp', () => {
    /* Without this the second scan of a repository finds nothing to reconcile
       against and quietly builds a second collection beside the first. */
    const row = toCollectionRequest({ name: 'A', method: 'GET', url: '/a', scan: stamp });
    expect((row.data as Record<string, unknown>).scan).toEqual(stamp);
  });

  it('has no scan key when a person made the request', () => {
    const row = toCollectionRequest({ name: 'A', method: 'GET', url: '/a' });
    expect('scan' in (row.data as Record<string, unknown>)).toBe(false);
  });
});

describe('folders', () => {
  const requests = [
    { name: 'A', method: 'GET', url: '/a', folder: 'CheckoutController' },
    { name: 'B', method: 'POST', url: '/b', folder: 'CheckoutController' },
    { name: 'C', method: 'GET', url: '/c', folder: 'OrderController' },
  ];

  it('makes one per distinct name, before anything is filed under it', async () => {
    await importRequestsAsCollection({ name: 'repo', protocol: 'rest', requests, useFolders: true });
    const folders = posted.filter(m => m.type === 'createFolder');
    expect(folders.map(f => f.name)).toEqual(['CheckoutController', 'OrderController']);

    const firstSave = posted.findIndex(m => m.type === 'saveRequestToCollection');
    const lastFolder = posted.map(m => m.type).lastIndexOf('createFolder');
    expect(lastFolder).toBeLessThan(firstSave);
  });

  it('files each request in its own folder', async () => {
    await importRequestsAsCollection({ name: 'repo', protocol: 'rest', requests, useFolders: true });
    const byName = new Map(posted.filter(m => m.type === 'createFolder').map(m => [m.name, m.id]));
    const saves = posted.filter(m => m.type === 'saveRequestToCollection');
    expect(saves.map(s => s.collectionId)).toEqual([
      byName.get('CheckoutController'), byName.get('CheckoutController'), byName.get('OrderController'),
    ]);
  });

  it('writes flat unless asked, which is what every other importer wants', async () => {
    await importRequestsAsCollection({ name: 'repo', protocol: 'rest', requests });
    expect(posted.filter(m => m.type === 'createFolder')).toHaveLength(0);
    const collection = posted.find(m => m.type === 'createCollection')!.id;
    for (const s of posted.filter(m => m.type === 'saveRequestToCollection')) {
      expect(s.collectionId).toBe(collection);
    }
  });

  it('leaves a request with no folder at the top level', async () => {
    await importRequestsAsCollection({
      name: 'repo', protocol: 'rest', useFolders: true,
      requests: [{ name: 'A', method: 'GET', url: '/a' }],
    });
    const collection = posted.find(m => m.type === 'createCollection')!.id;
    expect(posted.filter(m => m.type === 'createFolder')).toHaveLength(0);
    expect(posted.find(m => m.type === 'saveRequestToCollection')!.collectionId).toBe(collection);
  });
});
