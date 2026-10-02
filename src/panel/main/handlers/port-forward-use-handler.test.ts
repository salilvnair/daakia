import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* No VS Code here — like the browser build, there is no debugger to start. */
vi.mock('vscode', () => ({ workspace: {}, debug: undefined, extensions: undefined }));

const held = { id: 'pf-1', pod: 'zp-backend-1', prod: false, ports: [{ local: 8080, remote: 8080 }], workload: { kind: 'Deployment', name: 'zp-backend' } };
let holding: Record<string, unknown> | undefined = held;
vi.mock('./port-forward-handler', () => ({ forwardHolding: (id: string, port: number) => (holding && id === holding.id && port === 8080 ? holding : undefined) }));

const calls: Record<string, unknown>[] = [];
let respond: (r: Record<string, unknown>) => Record<string, unknown> = () => ({ status: 200, body: '' });
vi.mock('../../../services/k8s/local-http', () => ({
  callLocal: async (r: Record<string, unknown>) => { calls.push(r); return { contentType: '', body: '', ms: 1, ...respond(r) }; },
  downloadLocal: async () => ({ status: 200, bytes: 0 }),
}));
const imported: string[] = [];
vi.mock('../../../services/import-any', () => ({
  importAnyCollection: (text: string) => { imported.push(text); return { success: true, collectionName: 'zp', requestCount: 3 }; },
}));
vi.mock('../../../storage/db', () => ({ getCollectionTree: () => [] }));
vi.mock('./k8s-handler', () => ({ artifactDir: () => '/tmp', handleDk8sAnalyze: async () => undefined }));

import { handlePfCall, handlePfAttach, handlePfOpenApi } from './port-forward-use-handler';

const run = async (fn: (m: Record<string, unknown>, post: (m: unknown) => void) => Promise<void>, msg: Record<string, unknown>) => {
  const out: Record<string, unknown>[] = [];
  await fn({ reqId: 'r1', id: 'pf-1', port: 8080, ...msg }, m => out.push(m as Record<string, unknown>));
  return out;
};

beforeEach(() => { calls.length = 0; imported.length = 0; holding = held; respond = () => ({ status: 200, body: '' }); });
afterEach(() => { vi.useRealTimers(); });

describe('using a forward from the host', () => {
  it('reaches only a port a running forward holds, on a plain path', async () => {
    expect((await run(handlePfCall, { port: 9999, path: '/actuator' }))[0]).toMatchObject({ status: 0, error: 'That forward is not up any more.' });
    expect((await run(handlePfCall, { path: '/../etc/passwd' }))[0]).toMatchObject({ error: 'That path does not look right.' });
    expect((await run(handlePfCall, { path: 'http://elsewhere/' }))[0]).toMatchObject({ error: 'That path does not look right.' });
    expect(calls).toHaveLength(0);
    expect((await run(handlePfCall, { path: '/actuator/health' }))[0]).toMatchObject({ type: 'dk8s:pf:call', reqId: 'r1', status: 200 });
    expect(calls[0]).toMatchObject({ port: 8080, path: '/actuator/health' });
  });

  it('writes nothing but a logger level, and a production one only when confirmed', async () => {
    expect((await run(handlePfCall, { method: 'POST', path: '/actuator/shutdown', json: { configuredLevel: 'DEBUG' } }))[0])
      .toMatchObject({ error: 'Only a logger level can be changed through a forward.' });
    expect((await run(handlePfCall, { method: 'POST', path: '/actuator/loggers/com.x', json: { configuredLevel: 'LOUD' } }))[0])
      .toMatchObject({ error: 'Only a logger level can be changed through a forward.' });
    holding = { ...held, prod: true };
    expect((await run(handlePfCall, { method: 'POST', path: '/actuator/loggers/com.x', json: { configuredLevel: 'DEBUG' } }))[0])
      .toMatchObject({ error: 'Changing a production logger needs confirming first.' });
    expect(calls).toHaveLength(0);
    respond = () => ({ status: 204 });
    expect((await run(handlePfCall, { method: 'POST', path: '/actuator/loggers/com.x', json: { configuredLevel: 'DEBUG' }, confirmed: true }))[0]).toMatchObject({ status: 204 });
    expect(calls[0]).toMatchObject({ method: 'POST', json: { configuredLevel: 'DEBUG' } });
  });

  it('puts a level back when its time is up', async () => {
    vi.useFakeTimers();
    respond = () => ({ status: 204 });
    const out: Record<string, unknown>[] = [];
    await handlePfCall({ reqId: 'r1', id: 'pf-1', port: 8080, method: 'POST', path: '/actuator/loggers/com.x', json: { configuredLevel: 'DEBUG' }, revertMs: 600_000, previous: 'WARN' },
      m => out.push(m as Record<string, unknown>));
    expect(out[0].revertAt).toBeGreaterThan(Date.now());
    await vi.advanceTimersByTimeAsync(600_000);
    expect(calls[1]).toMatchObject({ method: 'POST', path: '/actuator/loggers/com.x', json: { configuredLevel: 'WARN' } });
    expect(out[1]).toMatchObject({ type: 'dk8s:pf:loggerReverted', id: 'pf-1', logger: 'com.x', level: 'WARN' });
  });

  it('finds the OpenAPI document, points it at the forward and imports it', async () => {
    const spec = { openapi: '3.0.1', info: { title: 'zp' }, servers: [{ url: 'http://zp-backend:8080/api' }], paths: {} };
    respond = r => (r.path === '/v2/api-docs' ? { status: 200, body: JSON.stringify(spec) } : { status: 404, body: '' });
    const out = await run(handlePfOpenApi, { ports: [8080] });
    expect(calls.map(c => c.path)).toEqual(['/v3/api-docs', '/v2/api-docs']);
    expect(JSON.parse(imported[0]).servers[0].url).toBe('http://localhost:8080/api');
    expect(out.map(m => m.type)).toEqual(['collectionsData', 'dk8s:pf:openapi']);
    expect(out[1]).toMatchObject({ ok: true, path: '/v2/api-docs', name: 'zp', count: 3, pointed: true });
  });

  it('says plainly where a debugger cannot be started from', async () => {
    const [r] = await run(handlePfAttach, { kind: 'java' });
    expect(r).toMatchObject({ ok: false });
    expect(String(r.error)).toContain('localhost:8080');
  });
});
