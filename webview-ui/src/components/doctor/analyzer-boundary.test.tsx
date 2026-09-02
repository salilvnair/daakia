import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { AnalyzerBoundary } from './AnalyzerBoundary';

/*
  The audit store opens the extension bridge on import, which in jsdom is a
  real WebSocket to nothing. Mocking it keeps the run clean and, more usefully,
  turns "it records the failure" into a direct assertion rather than one made
  through console output.
*/
const logged: { id: string; meta?: Record<string, unknown> }[] = [];
vi.mock('../../store/ui-audit-store', () => ({
  logUiEvent: (id: string, meta?: Record<string, unknown>) => { logged.push({ id, meta }); },
}));

/*
  The failure this exists to prevent is not "a view showed an error" — it is
  the whole webview going blank. So the tests assert the two things that
  actually matter: the throw is contained, and a sibling rendered beside it
  is still there afterwards.

  Rendered rather than unit-tested against the statics, because React decides
  when a boundary catches, and a class that gets `getDerivedStateFromError`
  right while being mounted somewhere React never calls it would pass every
  static test and still blank the window.
*/

function Boom({ when = true }: { when?: boolean }) {
  if (when) throw new Error('bad field: cannot read totalBytes of undefined');
  return <div>fine</div>;
}

let host: HTMLDivElement;
let root: Root;
let errors: unknown[][];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  // React writes the caught error to console.error by design; capturing keeps
  // the run readable and lets a test assert the boundary logged as well.
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a); });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

const render = (ui: React.ReactNode) => act(() => { root.render(ui); });

describe('AnalyzerBoundary', () => {
  it('contains a throw instead of unmounting the tree', () => {
    render(
      <div>
        <AnalyzerBoundary name="Treemap"><Boom /></AnalyzerBoundary>
        <span>sibling</span>
      </div>,
    );
    expect(host.textContent).toContain('Treemap could not be displayed');
    // The point of the whole exercise: everything else is still on screen.
    expect(host.textContent).toContain('sibling');
  });

  it('names the view that failed, not a generic error', () => {
    render(<AnalyzerBoundary name="Retention"><Boom /></AnalyzerBoundary>);
    expect(host.textContent).toContain('Retention could not be displayed');
  });

  it('shows the message, and the detail only when asked', () => {
    render(<AnalyzerBoundary name="Histogram"><Boom /></AnalyzerBoundary>);
    expect(host.textContent).toContain('cannot read totalBytes');
    expect(host.querySelector('pre')).toBeNull();

    const show = [...host.querySelectorAll('button')]
      .find(b => /Show details/.test(b.textContent ?? ''));
    act(() => { show!.click(); });
    expect(host.querySelector('pre')).not.toBeNull();
  });

  it('clears when a different artifact is loaded', () => {
    render(<AnalyzerBoundary name="Treemap" resetKey="dump-a"><Boom /></AnalyzerBoundary>);
    expect(host.textContent).toContain('could not be displayed');

    // A new dump into the same view: the previous failure was about the old
    // one, so it must not be carried across.
    render(<AnalyzerBoundary name="Treemap" resetKey="dump-b"><Boom when={false} /></AnalyzerBoundary>);
    expect(host.textContent).toBe('fine');
  });

  it('stays failed while the same artifact is still loaded', () => {
    render(<AnalyzerBoundary name="Treemap" resetKey="dump-a"><Boom /></AnalyzerBoundary>);
    render(<AnalyzerBoundary name="Treemap" resetKey="dump-a"><Boom /></AnalyzerBoundary>);
    expect(host.textContent).toContain('could not be displayed');
  });

  it('renders its children untouched when nothing throws', () => {
    render(<AnalyzerBoundary name="Verdict"><Boom when={false} /></AnalyzerBoundary>);
    expect(host.textContent).toBe('fine');
  });

  it('records the failure rather than only drawing it', () => {
    logged.length = 0;
    render(<AnalyzerBoundary name="Growth"><Boom /></AnalyzerBoundary>);
    // A boundary that swallows the error into a panel nobody screenshots is
    // the same invisibility one step quieter. It goes to the audit log, which
    // outlives the session, and to the console, where a stack is explorable.
    const audited = logged.find(e => e.id === 'dk8s.analyzer_error');
    expect(audited).toBeDefined();
    expect(audited!.meta).toMatchObject({ surface: 'analyzer:Growth' });
    expect(String(audited!.meta!.message)).toContain('totalBytes');
    expect(errors.some(a => String(a[0]).includes('[dk8s] Growth failed to render'))).toBe(true);
  });
});
