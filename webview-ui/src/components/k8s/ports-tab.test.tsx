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
    expect(text).toContain('same port as above');
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
