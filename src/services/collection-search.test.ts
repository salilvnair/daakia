/**
 * Searching every collection at once.
 *
 * The two questions this exists for are "which request sends this header" and
 * "where does this staging host still appear" — neither of which a per-panel
 * name-and-URL filter can answer. So the tests are mostly about reaching into
 * the places those answers hide: headers, bodies, params, docs.
 */
import { describe, it, expect } from 'vitest';
import { searchTree, compileQuery, type SearchNode } from './collection-search';

const req = (over: Partial<SearchNode['requests'][number]> & { id: string; name: string }) => ({
  method: 'GET', url: '', data: '{}', ...over,
});

const tree = (): SearchNode[] => [{
  id: 'c1', name: 'Payments', children: [
    {
      id: 'f1', name: 'Staging checks', children: [], requests: [
        req({ id: 'r3', name: 'Ping', url: 'https://staging.pay.test/ping' }),
      ],
    },
  ],
  requests: [
    req({
      id: 'r1', name: 'Create charge', method: 'POST', url: 'https://api.pay.test/charges',
      data: JSON.stringify({
        headers: [{ key: 'X-Tenant', value: 'eu-west', enabled: true }],
        params: [{ key: 'dry_run', value: 'true', enabled: true }],
        bodyRaw: '{"amount":100,"currency":"gbp"}',
        docs: '## Charges\nNeeds an idempotency key.',
      }),
    }),
    req({ id: 'r2', name: 'List charges', url: 'https://api.pay.test/charges' }),
  ],
}];

describe('where a match can be found', () => {
  it('finds a request by name', () => {
    const [hit] = searchTree(tree(), 'create charge');
    expect(hit).toMatchObject({ id: 'r1', field: 'name' });
  });

  /* The migration question: which requests still point at staging. */
  it('finds a host in a URL', () => {
    const hits = searchTree(tree(), 'staging.pay.test');
    expect(hits.map(h => h.id)).toEqual(['r3']);
    expect(hits[0]!.field).toBe('url');
  });

  /* The question no sidebar filter could answer. */
  it('finds a header, by key or by value', () => {
    expect(searchTree(tree(), 'X-Tenant')[0]).toMatchObject({ id: 'r1', field: 'header' });
    expect(searchTree(tree(), 'eu-west')[0]).toMatchObject({ id: 'r1', field: 'header' });
  });

  it('finds a query parameter', () => {
    expect(searchTree(tree(), 'dry_run')[0]).toMatchObject({ id: 'r1', field: 'param' });
  });

  it('finds text in a body', () => {
    expect(searchTree(tree(), 'currency')[0]).toMatchObject({ id: 'r1', field: 'body' });
  });

  it('finds text in the documentation', () => {
    expect(searchTree(tree(), 'idempotency')[0]).toMatchObject({ id: 'r1', field: 'docs' });
  });

  /* An empty folder called `staging` is part of the answer to "where does
     staging appear". */
  it('finds a folder by its own name', () => {
    const hit = searchTree(tree(), 'Staging checks').find(h => h.kind === 'folder');
    expect(hit).toMatchObject({ id: 'f1', field: 'folder' });
  });

  it('says which collection a hit belongs to, and the path to it', () => {
    const [hit] = searchTree(tree(), 'Ping');
    expect(hit).toMatchObject({ collectionId: 'c1', path: 'Payments / Staging checks' });
  });
});

describe('how it matches', () => {
  it('is case-insensitive for plain text', () => {
    expect(searchTree(tree(), 'CHARGES').length).toBeGreaterThan(0);
  });

  it('takes /pattern/ as a regular expression', () => {
    const hits = searchTree(tree(), '/^https:\\/\\/api\\./');
    expect(hits.map(h => h.id).sort()).toEqual(['r1', 'r2']);
  });

  /* Someone still typing `/user(` should see the literal text they typed
     match, not an exception. */
  it('falls back to literal text for an unfinished regex', () => {
    expect(() => searchTree(tree(), '/charge(')).not.toThrow();
  });

  /* A stateful `lastIndex` between calls makes the same text match or not
     depending on what was tested before it. */
  it('drops the global flag so results do not depend on call order', () => {
    const test = compileQuery('/charge/g')!;
    expect(test('charges')).toBe(0);
    expect(test('charges')).toBe(0);
  });

  it('has no answer for an empty query', () => {
    expect(searchTree(tree(), '   ')).toEqual([]);
    expect(compileQuery('')).toBeNull();
  });
});

describe('the shape of the results', () => {
  /* A request that matches in four places is one row, not four — a list with
     the same request repeated is a list nobody can scan. */
  it('reports a request once, on its first matching field', () => {
    const hits = searchTree(tree(), 'charge').filter(h => h.id === 'r1');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.field).toBe('name');
  });

  it('carries a short context window rather than the whole body', () => {
    const long = 'x'.repeat(400) + 'NEEDLE' + 'y'.repeat(400);
    const nodes: SearchNode[] = [{
      id: 'c1', name: 'C', children: [],
      requests: [req({ id: 'r1', name: 'r', data: JSON.stringify({ bodyRaw: long }) })],
    }];
    const [hit] = searchTree(nodes, 'NEEDLE');
    expect(hit!.context.length).toBeLessThan(120);
    expect(hit!.context).toContain('…');
  });

  it('stops at the limit', () => {
    expect(searchTree(tree(), 'a', { limit: 2 })).toHaveLength(2);
  });

  /* The blob is JSON from older versions, hand edits and merges. */
  it('survives a request whose data will not parse', () => {
    const nodes: SearchNode[] = [{
      id: 'c1', name: 'C', children: [],
      requests: [req({ id: 'r1', name: 'Broken', url: 'https://x.test', data: '{not json' })],
    }];
    expect(searchTree(nodes, 'x.test')[0]).toMatchObject({ id: 'r1', field: 'url' });
  });
});
