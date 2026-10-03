/**
 * A collection request whose URL, once its variables are filled in, is a
 * production pod through a dk8s forward is not sent unless the run allows it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({ workspace: {} }));
const sent: string[] = [];
vi.mock('../http/request-executor', () => ({
  executeRequest: async (p: { url: string; tabId: string }) => {
    sent.push(p.url);
    return { tabId: p.tabId, response: { status: 200, statusText: 'OK', headers: {}, body: '', size: 0, time: 1, contentType: '', cookies: [] } };
  },
}));
vi.mock('../storage/db', () => ({
  getCollectionTree: () => [{
    id: 'c1', name: 'zp', parent_id: null, sort_order: 0, children: [],
    requests: [
      { id: 'r1', collection_id: 'c1', name: 'health', method: 'GET', url: '{{zp}}/actuator/health' },
      { id: 'r2', collection_id: 'c1', name: 'public', method: 'GET', url: 'https://example.com/' },
    ],
  }],
  getCollectionData: () => JSON.stringify({ variables: [{ key: 'zp', value: 'http://localhost:18081', enabled: true }] }),
  getAllEnvironments: () => [],
  getSetting: () => undefined,
}));
vi.mock('./vault', () => ({ decryptIfNeeded: (v: string) => v }));

import { runCollection } from './collection-runner';

beforeEach(() => { sent.length = 0; });

const refuseUrl = (url: string) => (url.startsWith('http://localhost:18081') ? 'Not sent: production' : undefined);

describe('a collection run and a production forward', () => {
  it('does not send the request that resolves to it, and sends the rest', async () => {
    const r = await runCollection({ collectionId: 'c1', delay: 0, stopOnError: false, refuseUrl });
    const health = r.results.find(x => x.name === 'health')!;
    expect(health).toMatchObject({ statusText: 'Not sent', passed: false, error: 'Not sent: production' });
    expect(sent.some(u => u.includes('18081'))).toBe(false);
    expect(sent).toContain('https://example.com/');
  });

  it('sends it when the run allows production forwards', async () => {
    await runCollection({ collectionId: 'c1', delay: 0, stopOnError: false });
    expect(sent.some(u => u.startsWith('http://localhost:18081'))).toBe(true);
  });
});
