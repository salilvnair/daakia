import { describe, it, expect } from 'vitest';
import { blankVolatile, buildSavedIndex, endpointKey, normaliseUrl } from './saved-index';

const resolve = (s: string) => s.replace(/\{\{baseUrl\}\}/g, 'https://api.acme.test');

describe('what makes two requests the same request', () => {
  it('resolves variables so a saved URL reaches the host history recorded', () => {
    expect(normaliseUrl('{{baseUrl}}/orders', resolve)).toBe('https://api.acme.test/orders');
  });

  it('drops the query, because a page number is an argument not an endpoint', () => {
    expect(normaliseUrl('https://a.test/orders?page=2&q=x')).toBe('https://a.test/orders');
    expect(normaliseUrl('https://a.test/orders#top')).toBe('https://a.test/orders');
  });

  it('blanks an id segment so /orders/8814 and /orders/8815 are one endpoint', () => {
    expect(normaliseUrl('https://a.test/orders/8814')).toBe('https://a.test/orders/:id');
    expect(normaliseUrl('https://a.test/orders/8815')).toBe('https://a.test/orders/:id');
  });

  it('keeps an API version, which is part of the endpoint', () => {
    // `v2` starts with no digit; `2024` would be an id. This is the line the
    // whole normaliser turns on, and getting it wrong merges two APIs.
    expect(normaliseUrl('https://a.test/v2/users')).toBe('https://a.test/v2/users');
    expect(blankVolatile('v2')).toBe('v2');
    expect(blankVolatile('2024')).toBe(':id');
  });

  it('blanks uuids, long hex and unresolved placeholders alike', () => {
    expect(blankVolatile('3f1d2c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f')).toBe(':id');
    expect(blankVolatile('a3f19c02bd77e4')).toBe(':id');
    expect(blankVolatile('{{orderId}}')).toBe(':id');
    expect(blankVolatile(':orderId')).toBe(':id');
  });

  it('does not let a token in the query become a path id', () => {
    // The query is stripped first precisely so this cannot happen.
    expect(normaliseUrl('https://a.test/orders?token={{secret}}')).toBe('https://a.test/orders');
  });

  it('lower-cases the host but not the path, because paths are case-sensitive', () => {
    expect(normaliseUrl('HTTPS://API.Acme.Test/Orders')).toBe('https://api.acme.test/orders');
  });

  it('treats a trailing slash as punctuation but keeps the root', () => {
    expect(normaliseUrl('https://a.test/orders/')).toBe('https://a.test/orders');
    expect(normaliseUrl('https://a.test/')).toBe('https://a.test');
  });

  it('puts the method in the key, because GET and DELETE are not the same request', () => {
    expect(endpointKey({ method: 'get', url: 'https://a.test/x' }))
      .not.toBe(endpointKey({ method: 'delete', url: 'https://a.test/x' }));
  });
});

describe('the saved index', () => {
  const tree = [{
    id: 'c1',
    name: 'Orders',
    requests: [
      { method: 'GET', url: '{{baseUrl}}/orders/{{orderId}}' },
      { method: 'POST', url: '{{baseUrl}}/orders' },
    ],
    children: [{
      id: 'c2',
      name: 'Admin',
      requests: [{ method: 'DELETE', url: '{{baseUrl}}/orders/{{orderId}}' }],
    }],
  }];

  const index = buildSavedIndex(tree, resolve);

  it('recognises a history row as already saved through the variables', () => {
    expect(index.has({ method: 'GET', url: 'https://api.acme.test/orders/8814' })).toBe(true);
  });

  it('does not claim a different method is saved', () => {
    expect(index.has({ method: 'PATCH', url: 'https://api.acme.test/orders/8814' })).toBe(false);
  });

  it('finds requests nested in child collections', () => {
    expect(index.has({ method: 'DELETE', url: 'https://api.acme.test/orders/1' })).toBe(true);
  });

  it('says which collection a request already lives in', () => {
    const home = index.homeOf.get(endpointKey({ method: 'POST', url: 'https://api.acme.test/orders' }));
    expect(home?.name).toBe('Orders');
  });

  it('reports an unsaved request as unsaved', () => {
    expect(index.has({ method: 'GET', url: 'https://api.acme.test/invoices' })).toBe(false);
  });
});
