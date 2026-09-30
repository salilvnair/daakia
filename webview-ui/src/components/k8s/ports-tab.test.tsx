import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const posted: Record<string, unknown>[] = [];
vi.mock('../../vscode', () => ({
  postMsg: (m: Record<string, unknown>) => { posted.push(m); },
  getVsCodeApi: () => ({ postMessage: () => {}, getState: () => undefined, setState: () => {} }),
}));
vi.mock('../../store/ui-audit-store', () => ({ logUiEvent: () => {} }));
import { useK8sStore, type PodSummary } from '../../store/k8s-store';
import { usePortForwardStore, isProdContext, forwardsFor, localAddress, type ForwardInfo } from '../../store/dk8s-port-forward-store';
import { PortsTab } from './PortsTab';

const reply = (data: Record<string, unknown>) => act(async () => { window.dispatchEvent(new MessageEvent('message', { data })); await Promise.resolve(); });
const last = (type: string) => [...posted].reverse().find(m => m.type === type)!;
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const byText = (t: string) => [...document.querySelectorAll('body *')].filter(e => e.textContent?.trim().startsWith(t)).pop() as HTMLElement | undefined;

function pod(context: string): PodSummary {
  return {
    name: 'zp-backend-79879f65f7-6f5zb', namespace: 'com-zp-dev', context, uid: 'u1', phase: 'Running',
    ready: { current: 1, total: 1 }, restarts: 0, containers: [], healthy: true, deleting: false,
    workload: { kind: 'Deployment', name: 'zp-backend' },
  } as unknown as PodSummary;
}

async function mount(context: string) {
  posted.length = 0;
  document.body.innerHTML = '';
  usePortForwardStore.setState({ forwards: [], loaded: true });
  useK8sStore.setState({ detail: pod(context) });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<PortsTab />));
  const ask = last('dk8s:pf:ports');
  expect(ask).toMatchObject({ context, namespace: 'com-zp-dev', pod: 'zp-backend-79879f65f7-6f5zb' });
  await reply({
    type: 'dk8s:pf:ports', reqId: ask.reqId, phase: 'Running',
    ports: [
      { container: 'app', name: 'http', port: 8080, protocol: 'TCP', role: 'http' },
      { container: 'app', name: 'management', port: 8081, protocol: 'TCP', role: 'actuator' },
    ],
    services: [{ service: 'zp-backend', type: 'ClusterIP', port: 80, targetPort: 'http', containerPort: 8080 }],
  });
  return { host, root };
}

describe('the store', () => {
  beforeEach(() => { posted.length = 0; });
  it('knows production, addresses and which forwards are a pod\'s', () => {
    expect(isProdContext('com-eastus-zp-prod')).toBe(true);
    expect(isProdContext('kind-dk8s-lab')).toBe(false);
    expect(localAddress({ local: 8080, remote: 8080, role: 'http' })).toBe('http://localhost:8080');
    expect(localAddress({ local: 15432, remote: 5432, role: 'postgres' })).toBe('localhost:15432');
    const f = { id: 'a', pod: 'p', namespace: 'n', context: 'c', state: 'forwarding', startedAt: 1 } as ForwardInfo;
    expect(forwardsFor([f], { name: 'p', namespace: 'n', context: 'c' })).toHaveLength(1);
    expect(forwardsFor([f], { name: 'q', namespace: 'n', context: 'c' })).toHaveLength(0);
  });
  it('takes the list the host pushes', async () => {
    usePortForwardStore.getState().refresh();
    await reply({ type: 'dk8s:pf:list', forwards: [{ id: 'x', pod: 'p', namespace: 'n', context: 'c', state: 'forwarding', ports: [], startedAt: 1 }] });
    expect(usePortForwardStore.getState().forwards).toHaveLength(1);
  });
});

describe('Pod → Ports', () => {
  it('lists declared ports with their role and the Service that routes to them', async () => {
    await mount('kind-dk8s-lab');
    const text = document.body.textContent ?? '';
    expect(text).toContain('HTTP API');
    expect(text).toContain('actuator');
    expect(text).toContain('svc/zp-backend');
    /* The Service has its own Forward — kubectl picks the pod behind it. */
    expect([...document.querySelectorAll('button')].filter(b => b.textContent?.trim() === 'Forward')).toHaveLength(3);
  });

  it('starts straight away when the local port is free and the cluster is not production', async () => {
    await mount('kind-dk8s-lab');
    const forward = [...document.querySelectorAll('button')].filter(b => b.textContent?.trim() === 'Forward')[0];
    act(() => { forward.click(); });
    const check = last('dk8s:pf:check');
    expect(check.ports).toEqual([8080]);
    await reply({ type: 'dk8s:pf:check', reqId: check.reqId, results: [{ port: 8080, free: true, suggestion: 8080 }] });
    await flush();
    expect(last('dk8s:pf:start')).toMatchObject({ spec: { pod: 'zp-backend-79879f65f7-6f5zb', ports: [{ local: 8080, remote: 8080, name: 'http', role: 'http' }] } });
  });

  it('offers the next free port, and who holds the one asked for', async () => {
    await mount('kind-dk8s-lab');
    const forward = [...document.querySelectorAll('button')].filter(b => b.textContent?.trim() === 'Forward')[0];
    act(() => { forward.click(); });
    const check = last('dk8s:pf:check');
    await reply({ type: 'dk8s:pf:check', reqId: check.reqId, results: [{ port: 8080, free: false, suggestion: 8082, holder: { pid: 29948, name: 'node.exe' } }] });
    await flush();
    expect(document.body.textContent).toContain('node.exe');
    expect(posted.some(m => m.type === 'dk8s:pf:start')).toBe(false);
    act(() => { byText('Forward on 8082')!.click(); });
    expect(last('dk8s:pf:start')).toMatchObject({ spec: { ports: [{ local: 8082, remote: 8080 }] } });
  });

  it('asks before forwarding into production', async () => {
    await mount('com-eastus-zp-prod');
    const forward = [...document.querySelectorAll('button')].filter(b => b.textContent?.trim() === 'Forward')[0];
    act(() => { forward.click(); });
    const check = last('dk8s:pf:check');
    await reply({ type: 'dk8s:pf:check', reqId: check.reqId, results: [{ port: 8080, free: true, suggestion: 8080 }] });
    await flush();
    expect(document.body.textContent).toContain('Forward to production?');
    expect(posted.some(m => m.type === 'dk8s:pf:start')).toBe(false);
    act(() => { byText('Forward to production')!.click(); });
    expect(last('dk8s:pf:start')).toBeTruthy();
  });
});

describe('phase 2 — Services, replicas, sets, settings, restore', () => {
  it('forwards through the Service when asked', async () => {
    await mount('kind-dk8s-lab');
    const buttons = [...document.querySelectorAll('button')].filter(b => b.textContent?.trim() === 'Forward');
    act(() => { buttons[2].click(); });
    const check = last('dk8s:pf:check');
    await reply({ type: 'dk8s:pf:check', reqId: check.reqId, results: [{ port: 8080, free: true, suggestion: 8080 }] });
    await flush();
    expect(last('dk8s:pf:start')).toMatchObject({ spec: { service: 'zp-backend', ports: [{ remote: 80 }] } });
  });

  it('forwards each replica of the workload on its own local port', async () => {
    const other = { ...pod('kind-dk8s-lab'), name: 'zp-backend-79879f65f7-zzzzz', uid: 'u2' };
    useK8sStore.setState({ pods: [pod('kind-dk8s-lab'), other] as PodSummary[] });
    await mount('kind-dk8s-lab');
    expect(document.body.textContent).toContain('has 2 replicas');
    act(() => { byText('Each replica')!.click(); });
    const check = last('dk8s:pf:check');
    expect(check.ports).toEqual([8080, 8081]);
    await reply({ type: 'dk8s:pf:check', reqId: check.reqId, results: [{ port: 8080, free: true, suggestion: 8080 }, { port: 8081, free: true, suggestion: 8081 }] });
    await flush();
    const starts = posted.filter(m => m.type === 'dk8s:pf:start').map(m => (m.spec as { pod: string; ports: { local: number }[] }));
    expect(starts.map(s => [s.pod, s.ports[0].local])).toEqual([
      ['zp-backend-79879f65f7-6f5zb', 8080], ['zp-backend-79879f65f7-zzzzz', 8081],
    ]);
    useK8sStore.setState({ pods: [] });
  });

  it('carries the Settings into every start', async () => {
    const { useUiStateStore } = await import('../../store/ui-state-store');
    useUiStateStore.getState().setPref('dk8s.pf.tries', '3');
    useUiStateStore.getState().setPref('dk8s.pf.follow', 'off');
    useUiStateStore.getState().setPref('dk8s.pf.idleMinutes', '0');
    posted.length = 0;
    usePortForwardStore.getState().start({ context: 'c', namespace: 'n', pod: 'p', ports: [{ local: 1, remote: 1 }] });
    expect(last('dk8s:pf:start')).toMatchObject({ spec: { reconnectTries: 3, follow: false, idleMs: null } });
  });
});

describe('saved sets and the restore offer', () => {
  it('saves a forward into a new set, then into the same one without doubling it', async () => {
    const { addToSet, parseSets, PF_SETS_PREF } = await import('./port-forward-prefs');
    const { useUiStateStore } = await import('../../store/ui-state-store');
    useUiStateStore.getState().setPref(PF_SETS_PREF, '[]');
    const item = { context: 'c', namespace: 'n', pod: 'pg-1', workload: { kind: 'Deployment', name: 'postgres' }, ports: [{ local: 15432, remote: 5432 }] };
    const [set] = addToSet(item, { name: 'backend local dev' });
    addToSet({ ...item, pod: 'pg-2' }, { id: set.id });
    const sets = parseSets(useUiStateStore.getState().prefs[PF_SETS_PREF]);
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ name: 'backend local dev', items: [{ pod: 'pg-2' }] });
  });

  it('offers the forwards that were open last time — never production, and not when some survived', async () => {
    const { useUiStateStore } = await import('../../store/ui-state-store');
    const lastOpen = [{ context: 'kind-dk8s-lab', namespace: 'n', pod: 'p', ports: [{ local: 8080, remote: 8080 }] }];
    useUiStateStore.getState().setPref('dk8s.pf.lastOpen', JSON.stringify(lastOpen));
    usePortForwardStore.setState({ loaded: false, restorable: [] });
    await reply({ type: 'dk8s:pf:list', forwards: [] });
    expect(usePortForwardStore.getState().restorable).toHaveLength(1);

    const upProd = { id: 'x', context: 'com-eastus-zp-prod', namespace: 'n', pod: 'q', state: 'forwarding', prod: true, ports: [{ local: 9, remote: 9 }], startedAt: 1, connections: 0, reconnects: 0 };
    await reply({ type: 'dk8s:pf:list', forwards: [upProd] });
    expect(usePortForwardStore.getState().restorable).toHaveLength(0);
    expect(JSON.parse(useUiStateStore.getState().prefs['dk8s.pf.lastOpen'])).toEqual([]);
  });
});
