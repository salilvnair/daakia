import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const posted: Record<string, unknown>[] = [];
vi.mock('../../../vscode', () => ({
  postMsg: (m: Record<string, unknown>) => { posted.push(m); },
  getVsCodeApi: () => ({ postMessage: () => {}, getState: () => undefined, setState: () => {} }),
}));
const audited: unknown[] = [];
vi.mock('../../../store/ui-audit-store', () => ({ logUiEvent: (...a: unknown[]) => { audited.push(a); } }));

import { ConnTestDialog } from './ConnTest';
import { useUiStateStore } from '../../../store/ui-state-store';
import { CONN_RECENT_PREF, parseRecent } from '../../../store/dk8s-conn-store';

const target = { context: 'kind-dk8s-lab', namespace: 'com-zp-dev', pod: 'zp-python-0' };
const reply = (data: unknown) => act(async () => { window.dispatchEvent(new MessageEvent('message', { data })); });
const type = (input: HTMLInputElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const button = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(label)) as HTMLButtonElement;

describe('the connectivity test', () => {
  beforeEach(() => {
    posted.length = 0; audited.length = 0; document.body.innerHTML = '';
    useUiStateStore.setState(s => ({ prefs: { ...s.prefs, [CONN_RECENT_PREF]: '' } }));
  });

  it('asks the pod, shows each step, remembers the test, and never audits the URL', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<ConnTestDialog target={target} onClose={() => {}} />));
    const [url, proxy] = [...document.querySelectorAll('input')] as HTMLInputElement[];
    type(url, 'https://billing.internal/health');
    type(proxy, 'http://proxy.internal:3128');
    await act(async () => { button('Test').click(); });

    const sent = posted.find(m => m.type === 'py:conn')!;
    expect(sent).toMatchObject({ ...target, url: 'https://billing.internal/health', proxy: 'http://proxy.internal:3128' });
    expect(JSON.stringify(audited)).not.toContain('billing.internal');

    await reply({ type: 'py:conn', reqId: sent.reqId, result: {
      url: 'https://billing.internal/health', proxy: 'http://proxy.internal:3128', proxyFrom: 'given', ok: false,
      dns: { ok: true, ms: 4, host: 'proxy.internal', addresses: ['10.0.0.9'] },
      tcp: { ok: false, ms: 3001, to: 'proxy.internal:3128', error: 'timed out' },
      http: { ok: false },
    } });
    expect(document.body.textContent).toContain('Not reached — failed at TCP · proxy');
    expect(document.body.textContent).toContain('timed out');
    expect(document.body.textContent).toContain('skipped');
    expect(parseRecent(useUiStateStore.getState().prefs[CONN_RECENT_PREF])).toEqual([
      { url: 'https://billing.internal/health', proxy: 'http://proxy.internal:3128' },
    ]);
    expect(document.body.textContent).toContain('billing.internal/health');
    act(() => root.unmount());
  });

  it('runs a recent test again from its chip', async () => {
    useUiStateStore.setState(s => ({ prefs: { ...s.prefs, [CONN_RECENT_PREF]: JSON.stringify([{ url: 'http://wiremock:8080/__admin' }]) } }));
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<ConnTestDialog target={target} onClose={() => {}} />));
    await act(async () => { button('wiremock:8080/__admin').click(); });
    expect(posted.find(m => m.type === 'py:conn')).toMatchObject({ url: 'http://wiremock:8080/__admin' });
    act(() => root.unmount());
  });

  it('sends a POST with its headers and body, and labels a JSON body', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<ConnTestDialog target={target} onClose={() => {}} />));
    await act(async () => { button('POST').click(); });
    const [url] = [...document.querySelectorAll('input')] as HTMLInputElement[];
    type(url, 'https://orders.internal/v1/orders');
    await act(async () => { button('Body').click(); });
    const body = document.querySelector('textarea[aria-label="Request body"]') as HTMLTextAreaElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(body, '{"id":1}');
      body.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { button('Test').click(); });
    const sent = posted.find(m => m.type === 'py:conn')!;
    expect(sent).toMatchObject({ url: 'https://orders.internal/v1/orders', method: 'POST', body: '{"id":1}', headers: [{ key: 'Content-Type', value: 'application/json' }] });
    expect(JSON.stringify(audited)).not.toContain('orders.internal');
    expect(JSON.stringify(audited)).toContain('POST');
    act(() => root.unmount());
  });

  it('opens a TCP connection and shows the TLS handshake', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<ConnTestDialog target={target} onClose={() => {}} />));
    await act(async () => { button('TCP connection').click(); });
    const [hp] = [...document.querySelectorAll('input[type="text"], input:not([type])')] as HTMLInputElement[];
    type(hp, 'postgres.db:5432');
    await act(async () => { button('Test').click(); });
    const sent = posted.find(m => m.type === 'py:conn')!;
    expect(sent).toMatchObject({ kind: 'tcp', url: 'postgres.db:5432' });
    expect(sent).not.toHaveProperty('method');
    await reply({ type: 'py:conn', reqId: sent.reqId, result: {
      kind: 'tcp', url: 'postgres.db:5432', ok: true,
      dns: { ok: true, ms: 2, host: 'postgres.db', addresses: ['10.1.2.3'] },
      tcp: { ok: true, ms: 4, to: 'postgres.db:5432' },
      http: { ok: false },
    } });
    expect(document.body.textContent).toContain('Connected to postgres.db:5432');
    expect(document.body.textContent).toContain('TCPok4 ms');
    expect(document.body.textContent).not.toContain('HTTPok');
    act(() => root.unmount());
  });
});
