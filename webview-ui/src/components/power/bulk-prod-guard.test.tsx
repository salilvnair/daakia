import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const posted: Record<string, unknown>[] = [];
vi.mock('../../vscode', () => ({
  postMsg: (m: Record<string, unknown>) => { posted.push(m); },
  getVsCodeApi: () => ({ postMessage: () => {}, getState: () => undefined, setState: () => {} }),
}));
vi.mock('../../store/ui-audit-store', () => ({ logUiEvent: () => {} }));

import { BulkUrlTester } from './BulkUrlTester';
import { usePortForwardStore, type ForwardInfo } from '../../store/dk8s-port-forward-store';

const prodFwd = {
  id: 'pf', context: 'com-eastus-zp-prod', namespace: 'com-zp-prod', pod: 'zp-backend-6f5zb',
  ports: [{ local: 18081, remote: 8081 }], address: '127.0.0.1', state: 'forwarding', prod: true,
  startedAt: 1, connections: 0, command: '', reconnects: 0,
} as ForwardInfo;

describe('the Bulk URL Tester on a production forward', () => {
  it('says which URLs reach production, and sends them only when told to', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<BulkUrlTester onClose={() => {}} />));
    act(() => { usePortForwardStore.setState({ forwards: [prodFwd] }); });
    const area = document.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, 'GET http://localhost:18081/actuator/health\nhttps://example.com/');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.body.textContent).toContain('One URL reaches production through a dk8s forward');
    expect(document.body.textContent).toContain('They are listed but not sent.');
    const box = document.querySelector('[role="alert"] input[type="checkbox"]') as HTMLInputElement;
    act(() => { box.click(); });
    const run = [...document.querySelectorAll('button')].find(b => /^Check/.test(b.textContent?.trim() ?? '')) as HTMLButtonElement;
    act(() => { run.click(); });
    expect(posted.find(m => m.type === 'bulk:run')).toMatchObject({ prodConfirmed: true });
    act(() => root.unmount());
  });
});
