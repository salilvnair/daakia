import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

vi.mock('../../../store/ui-audit-store', () => ({ logUiEvent: () => {} }));
vi.mock('../../../vscode', () => ({ postMsg: () => {}, getVsCodeApi: () => ({ postMessage: () => {}, getState: () => undefined, setState: () => {} }) }));
vi.mock('./PyEditor', () => ({ PyEditor: () => null }));

import { PyDebugPanes } from './PyDebugPanes';

/*
  The Python tab opened blank. Its panes read "the watches of the paused
  frame" and "this script's breakpoints" with `?? []`, which is a new array on
  every read: zustand took each one for a change, re-rendered, read again, and
  React gave up with "Maximum update depth exceeded" — taking the whole webview
  with it. This mounts the panes the way a fresh tab has them, with no script
  and no debug session, and asserts they render and stay rendered.
*/

let host: HTMLDivElement;
let root: Root;
let errors: unknown[][];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { errors.push(args); });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('the Python debug panes, before anything has run', () => {
  it('render without looping', () => {
    act(() => root.render(<PyDebugPanes scriptId={undefined} scriptName="" />));
    expect(host.textContent).toContain('WATCH');
    expect(host.textContent).toContain('BREAKPOINTS');
    const loops = errors.filter(e => e.some(a => /Maximum update depth|getSnapshot should be cached/.test(String(a))));
    expect(loops).toEqual([]);
  });

  it('render for a script that has no breakpoints yet', () => {
    act(() => root.render(<PyDebugPanes scriptId="never-saved" scriptName="probe.py" />));
    expect(host.textContent).toContain('Click the gutter to set one');
    const loops = errors.filter(e => e.some(a => /Maximum update depth|getSnapshot should be cached/.test(String(a))));
    expect(loops).toEqual([]);
  });
});

/*
  The whole tab, as PodDetail mounts it for a pod: nothing loaded yet, then a
  library with a script selected. Messages to the host are captured rather
  than sent, and the editor is stood in for — Monaco does not run in jsdom,
  and this is about the tab's own state, not the editor's.
*/
describe('the Python tab, mounted for a pod', () => {
  it('renders empty, then with a script selected, without looping', async () => {
    const { PythonTab } = await import('./PythonTab');
    const { useK8sStore } = await import('../../../store/k8s-store');
    const { usePyStore } = await import('../../../store/dk8s-python-store');
    useK8sStore.setState({
      detail: {
        name: 'orders-7d9f2', namespace: 'test', context: 'no-such-context', uid: 'u', phase: 'Running',
        ready: { current: 1, total: 1 }, restarts: 0, healthy: true, deleting: false,
        containers: [{ name: 'app', ready: true, restarts: 0, image: 'python:3.11' }],
      },
    } as never);

    act(() => root.render(<PythonTab />));
    const loops = () => errors.filter(e => e.some(a => /Maximum update depth|getSnapshot should be cached/.test(String(a))));
    expect(loops()).toEqual([]);
    /* Before the container has said which Python it has, the tab holds —
       no editor drawn only to be swapped for "No Python" a moment later. */
    expect(host.textContent).not.toContain('No script open');

    /* The container answers: it has python3. */
    const { targetKey } = await import('../../../store/dk8s-python-store');
    const key = targetKey({ context: 'no-such-context', namespace: 'test', pod: 'orders-7d9f2', container: 'app' });
    act(() => usePyStore.setState(s => ({
      probes: { ...s.probes, [key]: { busy: false, verdict: { ok: true, interpreter: 'python3', reason: 'python3 is Python 3.11' }, base: '/tmp', writableDirs: ['/tmp'] } },
    }) as never));
    expect(loops()).toEqual([]);
    expect(host.textContent?.length).toBeGreaterThan(0);

    act(() => usePyStore.setState({
      loaded: true,
      scripts: [{ id: 's1', name: 'probe.py', folder: '', source: 'print(1)\n', updatedAt: 1 }],
      selectedId: 's1',
    } as never));
    expect(loops()).toEqual([]);
    expect(host.textContent).toContain('probe.py');
  });
});
