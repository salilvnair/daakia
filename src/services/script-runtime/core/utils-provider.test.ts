/**
 * What a script can use without require(): the language, and the web-standard
 * helpers that cannot reach the network, the disk or a timer.
 *
 * A token request's form body is the case that asked for this: in a browser it
 * is `new URLSearchParams({...}).toString()`, and until these were added that
 * line threw "URLSearchParams is not defined" inside a Daakia script.
 */
import { describe, it, expect } from 'vitest';
import { runScript } from '../runner';
import type { ScriptContext } from '../types';

function ctx(url = 'https://api.example.com/orders?page=2&size=10'): ScriptContext {
  return {
    request: { method: 'GET', url, headers: {}, body: '' },
    environmentVariables: {},
    collectionVariables: {},
    globalVariables: {},
  };
}

async function run(script: string) {
  const c = ctx();
  const result = await runScript(script, c);
  return { result, env: result.updatedEnvironmentVars };
}

describe('web-standard globals in a script', () => {
  it('builds a form body with URLSearchParams', async () => {
    const { result, env } = await run(`
      dk.env.set('body', new URLSearchParams({ grant_type: 'client_credentials', scope: 'api://x/.default' }).toString());
    `);
    expect(result.errors).toEqual([]);
    expect(env.body).toBe('grant_type=client_credentials&scope=api%3A%2F%2Fx%2F.default');
  });

  it('reads the request URL with URL', async () => {
    const { env } = await run(`
      const u = new URL(dk.request.url);
      dk.env.set('host', u.host);
      dk.env.set('page', u.searchParams.get('page'));
    `);
    expect(env).toMatchObject({ host: 'api.example.com', page: '2' });
  });

  it('turns text into bytes and back, and copies objects deeply', async () => {
    const { result, env } = await run(`
      const bytes = new TextEncoder().encode('héllo');
      dk.env.set('len', String(bytes.length));
      dk.env.set('back', new TextDecoder().decode(bytes));
      const a = { n: { deep: 1 } };
      const b = structuredClone(a);
      b.n.deep = 2;
      dk.env.set('orig', String(a.n.deep));
    `);
    expect(result.errors).toEqual([]);
    expect(env).toMatchObject({ len: '6', back: 'héllo', orig: '1' });
  });

  it('still keeps fetch and timers out', async () => {
    const { env } = await run(`
      dk.env.set('types', [typeof fetch, typeof setTimeout, typeof setInterval].join(','));
    `);
    expect(env.types).toBe('undefined,undefined,undefined');
  });
});
