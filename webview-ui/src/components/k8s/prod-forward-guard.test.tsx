import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const posted: Record<string, unknown>[] = [];
vi.mock('../../vscode', () => ({
  postMsg: (m: Record<string, unknown>) => { posted.push(m); },
  getVsCodeApi: () => ({ postMessage: () => {}, getState: () => undefined, setState: () => {} }),
}));
vi.mock('../../store/ui-audit-store', () => ({ logUiEvent: () => {} }));

import { localPortOf, prodForwardFor } from './prod-forward-guard';
import { usePortForwardStore, type ForwardInfo } from '../../store/dk8s-port-forward-store';
import { LoadTester } from '../power/LoadTester';

const fwd = (over: Partial<ForwardInfo>): ForwardInfo => ({
  id: 'pf', context: 'com-eastus-zp-prod', namespace: 'com-zp-prod', pod: 'zp-backend-6f5zb',
  ports: [{ local: 18081, remote: 8081 }], address: '127.0.0.1', state: 'forwarding', prod: true,
  startedAt: 1, connections: 0, command: '', reconnects: 0, ...over,
} as ForwardInfo);

describe('prodForwardFor', () => {
  it('knows the local port a URL reaches', () => {
    expect(localPortOf('http://localhost:18081/x')).toBe(18081);
    expect(localPortOf('http://127.0.0.1/')).toBe(80);
    expect(localPortOf('https://[::1]/')).toBe(443);
    expect(localPortOf('https://api.example.com:18081/')).toBeUndefined();
    expect(localPortOf('{{zp}}/x')).toBeUndefined();
  });

  it('finds an up production forward on that port, and nothing else', () => {
    expect(prodForwardFor('http://localhost:18081/actuator', [fwd({})])?.port).toBe(18081);
    expect(prodForwardFor('http://localhost:18081/actuator', [fwd({ prod: false })])).toBeUndefined();
    expect(prodForwardFor('http://localhost:18081/actuator', [fwd({ state: 'stopped' })])).toBeUndefined();
    expect(prodForwardFor('http://localhost:8080/', [fwd({})])).toBeUndefined();
  });
});

describe('the Load Tester on a production forward', () => {
  beforeEach(() => { posted.length = 0; document.body.innerHTML = ''; });

  it('keeps Run off until production is confirmed for that URL, and says so to the host', () => {
    usePortForwardStore.setState({ forwards: [fwd({})] });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<LoadTester initialUrl="http://localhost:18081/actuator/health" onClose={() => {}} />));
    usePortForwardStore.setState({ forwards: [fwd({})] });

    const run = () => [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Run load test')) as HTMLButtonElement;
    expect(document.body.textContent).toContain('which is production');
    expect(run().disabled).toBe(true);

    const box = document.querySelector('[role="alert"] input[type="checkbox"]') as HTMLInputElement;
    act(() => { box.click(); });
    expect(run().disabled).toBe(false);
    act(() => { run().click(); });
    expect(posted.find(m => m.type === 'load:start')).toMatchObject({ prodConfirmed: true });
    act(() => root.unmount());
  });
});
