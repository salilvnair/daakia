/** Smoke tests — environment variable resolution ({{var}}, ${var}, escapes, layering). */
import { describe, it, expect, beforeEach } from 'vitest';
import { useEnvStore, type Environment } from '../store/env-store';

const GLOBAL_ENV_ID = '__global__';

function mkEnv(id: string, name: string, vars: Record<string, string>, isGlobal = false): Environment {
  return {
    id,
    name,
    isGlobal,
    variables: Object.entries(vars).map(([key, value], i) => ({
      id: `${id}-v${i}`, key, initialValue: value, currentValue: value, isSecret: false,
    })),
  };
}

describe('env-store resolveWithEnv', () => {
  beforeEach(() => {
    useEnvStore.getState().hydrateEnvironments(
      [
        mkEnv(GLOBAL_ENV_ID, 'Globals', { baseUrl: 'https://global.example.com', shared: 'from-global' }, true),
        mkEnv('env1', 'Dev', { baseUrl: 'https://dev.example.com', token: 'dev-token' }),
      ],
      'env1',
    );
  });

  it('resolves {{var}} from the active environment', () => {
    const out = useEnvStore.getState().resolveWithEnv('{{baseUrl}}/users', 'env1');
    expect(out).toBe('https://dev.example.com/users');
  });

  it('resolves ${var} syntax too', () => {
    const out = useEnvStore.getState().resolveWithEnv('${token}', 'env1');
    expect(out).toBe('dev-token');
  });

  it('falls back to the global environment when var missing in active env', () => {
    const out = useEnvStore.getState().resolveWithEnv('{{shared}}', 'env1');
    expect(out).toBe('from-global');
  });

  it('leaves unknown variables untouched', () => {
    const out = useEnvStore.getState().resolveWithEnv('{{nope}}/x', 'env1');
    expect(out).toBe('{{nope}}/x');
  });

  it('extra layers take priority over environments', () => {
    const out = useEnvStore.getState().resolveWithEnv('{{baseUrl}}', 'env1', [[{ key: 'baseUrl', value: 'https://request.example.com' }]]);
    expect(out).toBe('https://request.example.com');
  });

  it('escape syntax $daakia_{var}_$ yields literal {{var}}', () => {
    const out = useEnvStore.getState().resolveWithEnv('$daakia_{baseUrl}_$', 'env1');
    expect(out).toBe('{{baseUrl}}');
  });
});
