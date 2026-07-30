/** Smoke tests — request-time variable resolution service (env + request var layering). */
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveKV, resolveObj } from '../services/resolve';
import { useEnvStore, type Environment } from '../store/env-store';

function mkEnv(id: string, vars: Record<string, string>, isGlobal = false): Environment {
  return {
    id, name: id, isGlobal,
    variables: Object.entries(vars).map(([key, value], i) => ({
      id: `${id}-v${i}`, key, initialValue: value, currentValue: value, isSecret: false,
    })),
  };
}

describe('resolve service', () => {
  beforeEach(() => {
    useEnvStore.getState().hydrateEnvironments([mkEnv('__global__', { host: 'api.example.com' }, true)], null);
  });

  const resolve = (s: string) => useEnvStore.getState().resolveWithEnv(s, null);

  it('resolveKV resolves keys and values of enabled rows', () => {
    const rows = [
      { key: 'X-Host', value: '{{host}}', enabled: true },
      { key: '{{host}}', value: 'literal', enabled: true },
    ];
    const out = resolveKV(resolve, rows);
    expect(out[0].value).toBe('api.example.com');
    expect(out[1].key).toBe('api.example.com');
  });

  it('resolveObj deep-resolves nested string values only', () => {
    const out = resolveObj(resolve, {
      url: 'https://{{host}}/v1',
      nested: { token: '{{host}}-tok' },
      count: 3,
      flags: [1, 2],
    });
    expect(out.url).toBe('https://api.example.com/v1');
    expect((out.nested as Record<string, unknown>).token).toBe('api.example.com-tok');
    expect(out.count).toBe(3);
    expect(out.flags).toEqual([1, 2]);
  });
});
