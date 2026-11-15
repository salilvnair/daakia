/**
 * What a request is sent with: its folder's own settings over what the
 * folders above give it. An imported OpenAPI collection keeps {{baseUrl}} and
 * its API key on the root and its requests in tag folders — without this, none
 * of them resolved.
 */
import { describe, it, expect } from 'vitest';
import { withInherited, type CollectionPropsCache } from './collections-store';

const own = (over: Partial<CollectionPropsCache> = {}): CollectionPropsCache => ({
  headers: [], authType: 'none', authData: {}, variables: [], preRequestScript: '', postResponseScript: '', ...over,
});

describe('a folder with what it inherits', () => {
  it('gets the root\'s variables, headers and auth when it sets none', () => {
    const got = withInherited(own(), {
      variables: [{ key: 'baseUrl', value: 'https://api', enabled: true }],
      headers: [{ key: 'X-Trace', value: 'on', enabled: true }],
      authType: 'api-key', authData: { apiKeyName: 'api_key', apiKeyValue: '{{apiKey}}' },
    });
    expect(got.variables).toEqual([{ key: 'baseUrl', value: 'https://api', enabled: true }]);
    expect(got.headers).toHaveLength(1);
    expect(got).toMatchObject({ authType: 'api-key', authData: { apiKeyName: 'api_key' } });
  });

  it('keeps its own where it has them — by key, headers case-insensitive', () => {
    const got = withInherited(
      own({
        variables: [{ key: 'baseUrl', value: 'http://localhost', enabled: true }],
        headers: [{ key: 'x-trace', value: 'mine', enabled: true }],
        authType: 'bearer', authData: { token: 't' },
      }),
      { variables: [{ key: 'baseUrl', value: 'https://api', enabled: true }, { key: 'petId', value: '10', enabled: true }], headers: [{ key: 'X-Trace', value: 'root', enabled: true }], authType: 'api-key', authData: {} },
    );
    expect(got.variables.map(v => `${v.key}=${v.value}`)).toEqual(['petId=10', 'baseUrl=http://localhost']);
    expect(got.headers).toEqual([{ key: 'x-trace', value: 'mine', enabled: true }]);
    expect(got.authType).toBe('bearer');
  });

  it('keeps its own scripts only', () => {
    expect(withInherited(own({ preRequestScript: 'mine' }), {}).preRequestScript).toBe('mine');
  });
});
