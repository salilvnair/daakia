/** Smoke tests — the Documentation Generator prompt carries real request detail. */
import { describe, it, expect } from 'vitest';
import { describeCollectionRequests } from '../services/collections/request-detail';
import type { CollectionTreeNode } from '../services/collections/tree-helpers';

function node(requests: CollectionTreeNode['requests'], children: CollectionTreeNode[] = []): CollectionTreeNode {
  return { id: 'c1', name: 'API', parent_id: null, sort_order: 0, children, requests };
}

describe('describeCollectionRequests', () => {
  it('includes headers, query params, auth scheme and body', () => {
    const out = describeCollectionRequests(node([{
      id: 'r1', collection_id: 'c1', name: 'Create user', method: 'POST', url: 'https://api.test/users',
      data: JSON.stringify({
        headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
        params: [{ key: 'dryRun', value: 'true', enabled: true }],
        authType: 'bearer', authData: { token: 'literal-secret' },
        bodyMode: 'json', bodyRaw: '{"name":"ada"}',
      }),
    }]));

    expect(out).toContain('[POST] Create user — https://api.test/users');
    expect(out).toContain('Content-Type: application/json');
    expect(out).toContain('dryRun=true');
    expect(out).toContain('Auth: bearer');
    expect(out).toContain('{"name":"ada"}');
  });

  it('drops disabled headers and params', () => {
    const out = describeCollectionRequests(node([{
      id: 'r1', collection_id: 'c1', name: 'Get', method: 'GET', url: '/x',
      data: JSON.stringify({
        headers: [{ key: 'X-Off', value: 'no', enabled: false }, { key: 'X-On', value: 'yes', enabled: true }],
      }),
    }]));
    expect(out).toContain('X-On: yes');
    expect(out).not.toContain('X-Off');
  });

  it('redacts literal credentials but keeps {{variable}} references', () => {
    const out = describeCollectionRequests(node([{
      id: 'r1', collection_id: 'c1', name: 'Get', method: 'GET', url: '/x',
      data: JSON.stringify({
        headers: [
          { key: 'Authorization', value: 'Bearer eyJhbGciOi.secret', enabled: true },
          { key: 'X-Api-Key', value: '{{apiKey}}', enabled: true },
        ],
        authType: 'basic', authData: { username: 'ada', password: 'hunter2' },
      }),
    }]));
    expect(out).toContain('Authorization: <redacted>');
    expect(out).not.toContain('eyJhbGciOi.secret');
    expect(out).toContain('X-Api-Key: {{apiKey}}');
    expect(out).toContain('username=ada');
    expect(out).toContain('password=<redacted>');
  });

  it('reads the History-shaped body key as well as the collection one', () => {
    const out = describeCollectionRequests(node([{
      id: 'h1', collection_id: '', name: 'Replayed', method: 'POST', url: '/x',
      data: JSON.stringify({ bodyMode: 'json', body: '{"from":"history"}' }),
    }]));
    expect(out).toContain('{"from":"history"}');
  });

  it('preserves folder structure and reports an empty collection', () => {
    const child: CollectionTreeNode = { id: 'c2', name: 'Users', parent_id: 'c1', sort_order: 0, children: [], requests: [
      { id: 'r2', collection_id: 'c2', name: 'List', method: 'GET', url: '/users' },
    ] };
    expect(describeCollectionRequests(node([], [child]))).toContain('Folder: Users');
    expect(describeCollectionRequests(node([]))).toBe('(this collection has no saved requests)');
  });
});
