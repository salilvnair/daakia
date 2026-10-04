import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../../../../vscode', () => ({
  postMsg: () => {},
  getVsCodeApi: () => ({ postMessage: () => {}, getState: () => undefined, setState: () => {} }),
}));
vi.mock('../../../../store/ui-audit-store', () => ({ logUiEvent: () => {} }));

import { PatternDemo } from './Dk8sLoggersView';

const type = (input: HTMLInputElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('the Loggers page demo', () => {
  it('turns a call into a pattern with named holes, and reads them off a line', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<PatternDemo />));
    expect(host.textContent).toContain('{reqId}');
    expect(host.textContent).toContain('R-88213');
    expect(host.textContent).toContain('3120');

    const [call, line] = [...host.querySelectorAll('input')] as HTMLInputElement[];
    type(call, 'log.info("settling batch {} for merchant {}", batchId, merchantId);');
    type(line, 'settling batch B-771 for merchant M-12');
    expect(host.textContent).toContain('{batchId}');
    expect(host.textContent).toContain('B-771');
    expect(host.textContent).toContain('M-12');

    type(line, 'something else entirely');
    expect(host.textContent).toContain('the line does not match');
    act(() => root.unmount());
  });
});
