import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const posted: Record<string, unknown>[] = [];
vi.mock('../../../vscode', () => ({
  postMsg: (m: Record<string, unknown>) => { posted.push(m); },
  getVsCodeApi: () => ({ postMessage: () => {}, getState: () => undefined, setState: () => {} }),
}));
vi.mock('../../../store/ui-audit-store', () => ({ logUiEvent: () => {} }));
import { usePyStore } from '../../../store/dk8s-python-store';
import { ScriptMenu } from './ScriptHeader';

const click = (el: Element | null | undefined) => act(() => { (el as HTMLElement).click(); });
/* The innermost element with that text — a click there bubbles to the item. */
const byText = (t: string) => [...document.querySelectorAll('body *')]
  .filter(b => b.textContent?.trim().startsWith(t)).pop();

describe('the script ⋯ menu', () => {
  it('Save as… opens its form and saves a copy under the new name', () => {
    usePyStore.setState({ scripts: [{ id: 's1', name: 'probe.py', source: 'print(1)' }], drafts: {} });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<ScriptMenu scriptId="s1" />));

    click(host.querySelector('[aria-label="Script actions"]'));
    const item = byText('Save as');
    click(item);

    const input = document.querySelector('input[aria-label="New script name"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(input!.value).toBe('probe-copy.py');

    click(byText('Save copy'));
    expect(posted.some(m => m.type === 'py:scripts:save'
      && (m.script as { name: string }).name === 'probe-copy.py')).toBe(true);
    expect(document.querySelector('input[aria-label="New script name"]')).toBeNull();
    act(() => root.unmount());
  });
});
