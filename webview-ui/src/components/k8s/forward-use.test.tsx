import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

/* The host, faked: every post is kept, and `answer` replies to the ones it knows. */
const posted: Record<string, unknown>[] = [];
let answer: (m: Record<string, unknown>) => Record<string, unknown> | undefined = () => undefined;
vi.mock('../../vscode', () => ({
  postMsg: (m: Record<string, unknown>) => {
    posted.push(m);
    const r = answer(m);
    if (r) setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data: { type: m.type, reqId: m.reqId, ...r } })), 0);
  },
  getVsCodeApi: () => ({ postMessage: () => {}, getState: () => undefined, setState: () => {} }),
}));
vi.mock('../../store/ui-audit-store', () => ({ logUiEvent: () => {} }));

import { usePortForwardStore, type ForwardInfo } from '../../store/dk8s-port-forward-store';
import { useEnvStore, GLOBAL_ENV_ID } from '../../store/env-store';
import { useTabsStore } from '../../store/tabs-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { parseLinks, candidatePorts, formatMeasurement, findActuator } from './actuator';
import { bind, unbind, syncBindings, parseBindings, suggestKey, PF_BINDINGS_PREF } from './forward-bindings';
import { openRequestHere, ForwardMenuButton } from './ForwardMenu';
import { useLiveLevels, type Live } from './LiveLevels';

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); });

function fwd(patch: Partial<ForwardInfo> = {}): ForwardInfo {
  return {
    id: 'pf-1', context: 'kind-dk8s-lab', namespace: 'n', pod: 'zp-backend-1', workload: { kind: 'Deployment', name: 'zp-backend' },
    ports: [{ local: 8080, remote: 8080, role: 'http' }, { local: 18081, remote: 8081, role: 'actuator' }],
    address: '127.0.0.1', state: 'forwarding', prod: false, startedAt: 1, connections: 0, reconnects: 0, command: 'kubectl port-forward …',
    ...patch,
  };
}

/** An actuator on :18081 that lists `links` and answers the loggers endpoint. */
function actuatorHost(links: string[], loggers: Record<string, unknown> = {}) {
  answer = m => {
    if (m.type !== 'dk8s:pf:call') return undefined;
    if (m.method === 'POST') return { status: 204, revertAt: m.revertMs ? 123 : undefined };
    if (m.port === 18081 && m.path === '/actuator') return { status: 200, body: JSON.stringify({ _links: Object.fromEntries(['self', ...links].map(k => [k, { href: '' }])) }) };
    if (m.path === '/actuator/loggers') return { status: 200, body: JSON.stringify({ levels: ['OFF', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'], loggers }) };
    return { status: 404, body: '' };
  };
}

beforeEach(() => { posted.length = 0; answer = () => undefined; document.body.innerHTML = ''; });

describe('the actuator, through a forward', () => {
  it('reads an index, ranks the ports to ask, and formats a measurement', () => {
    expect(parseLinks(JSON.stringify({ _links: { self: {}, health: {}, 'health-path': {}, loggers: {} } }))).toEqual(['health', 'loggers']);
    expect(parseLinks('{"status":"UP"}')).toBeUndefined();
    expect(candidatePorts(fwd({ ports: [{ local: 15432, remote: 5432, role: 'postgres' }, { local: 8080, remote: 8080, role: 'http' }, { local: 18081, remote: 8081, role: 'actuator' }] })).map(p => p.local))
      .toEqual([18081, 8080]);
    expect(formatMeasurement(52_428_800, 'bytes')).toBe('50.0 MB');
    expect(formatMeasurement(0.0123, 'seconds')).toBe('12.3 ms');
  });

  it('finds it on the management port before the HTTP one', async () => {
    actuatorHost(['health', 'loggers']);
    let found: unknown;
    await act(async () => { found = await findActuator(fwd()); });
    expect(found).toEqual({ port: 18081, base: '/actuator', links: ['health', 'loggers'] });
  });

  it('says where it looked when nothing answers', async () => {
    answer = m => (m.type === 'dk8s:pf:call' ? { status: 404 } : undefined);
    let found: { error?: string } = {};
    await act(async () => { found = (await findActuator(fwd())) as { error?: string }; });
    expect(found.error).toContain(':18081/actuator');
    expect(found.error).toContain(':8080/manage');
  });
});

describe('binding a forward to an environment variable', () => {
  beforeEach(() => {
    useUiStateStore.getState().setPref(PF_BINDINGS_PREF, '[]');
    useEnvStore.setState({ environments: [{ id: GLOBAL_ENV_ID, name: 'Global', isGlobal: true, variables: [] }, { id: 'dev', name: 'dev', variables: [] }], activeEnvId: 'dev' });
  });

  it('sets the variable now, and moves it when the forward comes back elsewhere', () => {
    const f = fwd();
    expect(suggestKey(f, f.ports[0])).toBe('zp_backend');
    expect(suggestKey(f, f.ports[1])).toBe('zp_backend_management');
    bind(f, f.ports[0], 'dev', 'zp_backend');
    const value = () => useEnvStore.getState().environments.find(e => e.id === 'dev')!.variables.find(v => v.key === 'zp_backend')?.currentValue;
    expect(value()).toBe('http://localhost:8080');

    /* Started again on 8090 — the same workload's 8080, so the same binding. */
    syncBindings([fwd({ id: 'pf-2', pod: 'zp-backend-2', ports: [{ local: 8090, remote: 8080, role: 'http' }] })]);
    expect(value()).toBe('http://localhost:8090');
    /* Another workload's 8080, or a forward that is down, leaves it alone. */
    syncBindings([fwd({ id: 'pf-3', workload: { kind: 'Deployment', name: 'other' }, ports: [{ local: 9999, remote: 8080 }] })]);
    syncBindings([fwd({ id: 'pf-4', state: 'reconnecting', ports: [{ local: 7777, remote: 8080 }] })]);
    expect(value()).toBe('http://localhost:8090');

    const [b] = parseBindings(useUiStateStore.getState().prefs[PF_BINDINGS_PREF]);
    expect(b).toMatchObject({ envId: 'dev', key: 'zp_backend', workload: 'zp-backend', remote: 8080 });
    unbind(b);
    expect(parseBindings(useUiStateStore.getState().prefs[PF_BINDINGS_PREF])).toEqual([]);
  });
});

describe('a request tab on the forward', () => {
  it('opens REST through the variable when bound, GraphQL and WebSocket on the address', () => {
    const f = fwd();
    openRequestHere(f, f.ports[0], 'rest', { envId: 'dev', key: 'zp_backend', context: f.context, namespace: 'n', workload: 'zp-backend', remote: 8080 });
    let tab = useTabsStore.getState().tabs.find(t => t.id === useTabsStore.getState().activeTabId)!;
    expect(tab).toMatchObject({ protocol: 'rest', url: '{{zp_backend}}/', envId: 'dev', name: 'zp-backend :8080' });
    expect(useTabsStore.getState().activeProtocol).toBe('rest');

    openRequestHere(f, f.ports[0], 'graphql');
    tab = useTabsStore.getState().tabs.find(t => t.id === useTabsStore.getState().activeTabId)!;
    expect(tab).toMatchObject({ protocol: 'graphql', url: 'http://localhost:8080/graphql', bodyMode: 'graphql' });

    openRequestHere(f, f.ports[0], 'websocket');
    tab = useTabsStore.getState().tabs.find(t => t.id === useTabsStore.getState().activeTabId)!;
    expect(tab).toMatchObject({ protocol: 'websocket', url: 'ws://localhost:8080/' });
  });
});

describe('the ⋯ menu', () => {
  it('offers what this forward can do — a debugger only where a debug port is', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<ForwardMenuButton f={fwd()} />));
    act(() => { (host.querySelector('button[aria-label="Use this forward"]') as HTMLButtonElement).click(); });
    await flush();
    const text = document.body.textContent ?? '';
    for (const label of ['New request here', 'Bind to an environment variable', 'Import its OpenAPI as a collection', 'Actuator', 'Copy as', 'Save to a set', 'Restart the tunnel']) {
      expect(text).toContain(label);
    }
    expect(text).not.toContain('Attach VS Code debugger');
    act(() => root.unmount());

    const debugRoot = createRoot(host);
    act(() => debugRoot.render(<ForwardMenuButton f={fwd({ ports: [{ local: 5005, remote: 5005, role: 'debug' }] })} />));
    act(() => { (host.querySelector('button[aria-label="Use this forward"]') as HTMLButtonElement).click(); });
    await flush();
    expect(document.body.textContent).toContain('Attach VS Code debugger');
    act(() => debugRoot.unmount());
  });

  it('restarts the tunnel through the host', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<ForwardMenuButton f={fwd()} />));
    act(() => { (host.querySelector('button[aria-label="Use this forward"]') as HTMLButtonElement).click(); });
    await flush();
    const item = [...document.querySelectorAll('body *')].filter(e => e.textContent?.trim().startsWith('Restart the tunnel')).pop() as HTMLElement;
    act(() => { item.click(); });
    expect(posted.find(m => m.type === 'dk8s:pf:restart')).toEqual({ type: 'dk8s:pf:restart', id: 'pf-1' });
    act(() => root.unmount());
  });
});

describe('live logger levels', () => {
  function harness(f: ForwardInfo) {
    usePortForwardStore.setState({ forwards: [f], loaded: true });
    useUiStateStore.getState().setPref('dk8s.pf.levelRevertMinutes', '10');
    const out: { live?: Live; status?: string; confirm?: React.ReactNode } = {};
    function H() { const r = useLiveLevels({ name: f.pod, namespace: f.namespace, context: f.context }); Object.assign(out, r); return <>{r.confirm}</>; }
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<H />));
    return { out, root };
  }

  it('turns on when the forward reaches an actuator with loggers, and sets a level that goes back on its own', async () => {
    actuatorHost(['health', 'loggers'], { 'com.zp.Rules': { configuredLevel: null, effectiveLevel: 'INFO' } });
    const { out, root } = harness(fwd());
    await flush();
    expect(out.status).toBe('on');
    expect(out.live!.loggers['com.zp.Rules'].effectiveLevel).toBe('INFO');

    await act(async () => { out.live!.set('com.zp.Rules', 'DEBUG'); });
    await flush();
    expect(posted.find(m => m.method === 'POST')).toMatchObject({
      path: '/actuator/loggers/com.zp.Rules', json: { configuredLevel: 'DEBUG' }, revertMs: 600_000, previous: null, confirmed: false,
    });
    expect(out.live!.revertAt['com.zp.Rules']).toBe(123);
    act(() => root.unmount());
  });

  it('asks first on production', async () => {
    actuatorHost(['loggers'], { 'com.zp.Rules': { configuredLevel: null, effectiveLevel: 'INFO' } });
    const { out, root } = harness(fwd({ prod: true, context: 'com-eastus-zp-prod' }));
    await flush();
    act(() => { out.live!.set('com.zp.Rules', 'DEBUG'); });
    await flush();
    expect(posted.some(m => m.method === 'POST')).toBe(false);
    expect(document.body.textContent).toContain('Change a production logger?');
    const go = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Change it')!;
    await act(async () => { go.click(); });
    await flush();
    expect(posted.find(m => m.method === 'POST')).toMatchObject({ confirmed: true });
    act(() => root.unmount());
  });

  it('stays off without an actuator that lists loggers', async () => {
    actuatorHost(['health']);
    const { out, root } = harness(fwd());
    await flush();
    expect(out.status).toBe('none');
    expect(out.live).toBeUndefined();
    act(() => root.unmount());
  });
});
