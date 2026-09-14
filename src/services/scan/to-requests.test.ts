/**
 * Turning a finding into a request.
 *
 * The rule with teeth is the last one: a scan reads a repository, and a
 * repository is full of test fixtures containing real-looking credentials.
 * Copying one into a collection takes a secret out of a file somebody was
 * careful with and puts it somewhere they were not expecting.
 */
import { describe, it, expect } from 'vitest';
import {
  toRequest, folderOf, identityOf, maskSecrets, authTypeOf, nameOf,
  collectionVariables, fingerprint,
} from './to-requests';
import type { Finding } from './api-detector';

const finding = (over: Partial<Finding> = {}): Finding => ({
  method: 'GET', path: '/api/checkout/{id}', name: 'Get checkout',
  pathParams: [{ name: 'id', value: '', required: true }],
  queryParams: [], headers: [], provenance: {}, detector: 'spring',
  source: { file: 'src/main/java/CheckoutController.java', line: 48 },
  ...over,
});

describe('the URL', () => {
  it('is written against the collection variable', () => {
    expect(toRequest(finding()).url).toBe('{{baseUrl}}/api/checkout/{id}');
  });

  it('leaves path parameters as parameters', () => {
    /* Substituting one produces a URL that looks ready and is not — and the id
       you are testing with is the first thing anybody edits. */
    expect(toRequest(finding()).url).toContain('{id}');
  });
});

describe('parameters', () => {
  it('ticks the required ones and lists the rest', () => {
    const r = toRequest(finding({
      queryParams: [
        { name: 'page', value: '0', required: true },
        { name: 'status', value: '', required: false },
      ],
    }));
    expect(r.params).toEqual([
      { key: 'page', value: '0', enabled: true },
      { key: 'status', value: '', enabled: false },
    ]);
  });
});

describe('secrets', () => {
  it('never copies a credential out of the source', () => {
    for (const key of ['password', 'apiKey', 'api_key', 'X-Auth-Token', 'Authorization', 'clientSecret']) {
      expect(maskSecrets(key, 'hunter2')).toMatch(/^\{\{.+\}\}$/);
    }
  });

  it('leaves an ordinary value alone', () => {
    expect(maskSecrets('page', '0')).toBe('0');
    expect(maskSecrets('Content-Type', 'application/json')).toBe('application/json');
  });

  it('applies to headers and parameters alike', () => {
    const r = toRequest(finding({
      headers: [{ name: 'Authorization', value: 'Bearer eyJhbGciOi', required: true }],
      queryParams: [{ name: 'api_key', value: 'sk_live_1234', required: true }],
    }));
    expect(r.headers[0].value).not.toContain('eyJhbGciOi');
    expect(r.params[0].value).not.toContain('sk_live');
  });
});

describe('auth', () => {
  it('inherits by default, so the collection can carry the scheme', () => {
    expect(authTypeOf(finding())).toBe('inherit');
  });

  it('is set per request only where the source said something different', () => {
    expect(authTypeOf(finding({ auth: { scheme: 'bearer' } }))).toBe('bearer');
    expect(authTypeOf(finding({ auth: { scheme: 'basic' } }))).toBe('basic');
  });
});

describe('folders', () => {
  it('are the source file, which is what makes the provenance legible', () => {
    expect(folderOf(finding())).toBe('CheckoutController');
  });
});

describe('the name', () => {
  it('is the handler', () => {
    expect(nameOf(finding())).toBe('Get checkout');
  });

  it('carries the discriminator only when there is one', () => {
    expect(nameOf(finding({ discriminator: 'multipart' }))).toBe('Get checkout — multipart');
  });
});

describe('the scan stamp', () => {
  it('identifies by route, not by name', () => {
    expect(identityOf(finding())).toBe('GET /api/checkout/{id}');
  });

  it('hashes what it wrote, so a later scan can tell an edit from a change', () => {
    const a = toRequest(finding());
    const b = toRequest(finding({ body: { mode: 'raw', raw: '{"x":1}' } }));
    expect(a.scan.written).not.toBe(b.scan.written);
  });

  it('is stable for the same input', () => {
    const at = new Date('2026-09-14T00:00:00Z');
    expect(toRequest(finding(), at).scan.written).toBe(toRequest(finding(), at).scan.written);
  });

  it('records where it came from', () => {
    expect(toRequest(finding()).scan.source).toBe('src/main/java/CheckoutController.java:48');
  });

  it('keeps the provenance, so the request still says so months later', () => {
    const f = finding({ provenance: { body: { kind: 'generated', rule: '@Email' } } });
    expect(toRequest(f).scan.provenance.body).toEqual({ kind: 'generated', rule: '@Email' });
  });
});

describe('collection variables', () => {
  it('carry the base URL the scan worked out', () => {
    expect(collectionVariables({ url: 'http://localhost:8443/api', parts: {} as never }))
      .toEqual([{ key: 'baseUrl', value: 'http://localhost:8443/api' }]);
  });

  it('fall back to something runnable', () => {
    expect(collectionVariables()[0].value).toBe('http://localhost:8080');
  });
});

describe('the hash', () => {
  it('is stable and differs on difference', () => {
    expect(fingerprint('a')).toBe(fingerprint('a'));
    expect(fingerprint('a')).not.toBe(fingerprint('b'));
  });
});
