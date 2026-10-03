import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../../../../vscode', () => ({
  postMsg: () => {},
  getVsCodeApi: () => ({ postMessage: () => {}, getState: () => undefined, setState: () => {} }),
}));
vi.mock('../../../../store/ui-audit-store', () => ({ logUiEvent: () => {} }));

import { ForwardDemo } from './Dk8sPortForwardView';

const type = (input: HTMLInputElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('the Port Forwarding page demo', () => {
  it('reads a typed command with the app’s parser and shows the forward, its snippets, and production', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<ForwardDemo />));
    expect(host.textContent).toContain('http://localhost:8080');
    expect(host.textContent).toContain('ZP_BACKEND');

    const [cmd, ctx] = [...host.querySelectorAll('input')] as HTMLInputElement[];
    type(cmd, 'kubectl port-forward pod/postgres-0 15432:5432');
    expect(host.textContent).toContain('postgres');
    expect(host.textContent).toContain('15432');
    expect(host.textContent).not.toContain('Production');

    type(ctx, 'com-eastus-zp-prod');
    expect(host.textContent).toContain('Production');

    type(cmd, 'kubectl get pods');
    expect(host.textContent).toContain('Not a port-forward dk8s can read');
    act(() => root.unmount());
  });
});
