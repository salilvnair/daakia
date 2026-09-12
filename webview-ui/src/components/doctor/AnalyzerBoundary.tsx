/**
 * One analyzer failing must not take the window with it.
 *
 * These views read fields off a parsed artifact — a heap dump, a thread dump, a
 * log — and an artifact is not a contract. A field that is absent on one JVM,
 * a class name shaped in a way the decoder did not expect, a histogram with a
 * zero total: any of them throws during render, and an uncaught throw in React
 * unmounts the whole tree. Twice that has meant the entire webview going blank
 * — not the panel, the window — with nothing on screen to say why, no way back,
 * and the dump still sitting there unread.
 *
 * A boundary makes that a panel-sized problem. The rest of the app keeps
 * working, the other views of the same artifact still open, and the failure
 * arrives as a message naming what broke rather than as an empty window.
 *
 * The fallback is deliberately not a red stack trace. Someone looking at a
 * heap dump is already debugging something else; this one should tell them
 * which view died, let them carry on in the others, and hand them the detail
 * only if they ask for it.
 *
 * It is also built from plain elements and inline styles — no design-system
 * components, no context, no hooks. What this catches may BE a component
 * library failure, and a fallback that renders the broken thing throws while
 * handling the throw, which React treats as unrecoverable and unmounts the
 * tree anyway. The fallback has to be the dumbest code in the file.
 */
import { Component, type ReactNode } from 'react';
import { logUiEvent } from '../../store/ui-audit-store';

/** Plain, so the fallback cannot fail the way the thing it is catching did. */
const BTN: React.CSSProperties = {
  font: 'inherit', fontSize: 11, padding: '3px 10px', borderRadius: 5,
  cursor: 'pointer', color: 'var(--color-text-primary)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-surface-border)',
};

interface Props {
  /** What failed, in the words the tab uses — "Treemap", "Thread Dump". */
  name: string;
  /**
   * Changing this clears the error.
   *
   * A render failure is usually about the artifact being read, so loading a
   * different one has to give the view another chance. Without this the panel
   * stays broken for the rest of the session and the only fix is a reload.
   */
  resetKey?: string | number;
  children: ReactNode;
}

interface State {
  error: Error | null;
  /** The component stack, which is what says WHERE it threw. */
  where: string;
  shown: boolean;
  /** Mirrors `resetKey`, so a change to it can be noticed during render. */
  key: string | number | undefined;
}

export class AnalyzerBoundary extends Component<Props, State> {
  state: State = { error: null, where: '', shown: false, key: undefined };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, shown: false };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.key) {
      return { key: props.resetKey, error: null, where: '', shown: false };
    }
    return null;
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    this.setState({ where: info.componentStack ?? '' });
    /*
      Recorded, not just rendered.

      The whole reason this class exists is that these failures were invisible.
      A boundary that swallows the error into a panel nobody screenshots is the
      same problem one step quieter, so it goes to the console — where a stack
      trace is actually explorable — and to the audit log, which survives the
      session.
    */
    console.error(`[dk8s] ${this.props.name} failed to render`, error, info.componentStack);
    logUiEvent('dk8s.analyzer_error', {
      surface: `analyzer:${this.props.name}`,
      message: error.message,
      stack: (error.stack ?? '').split('\n').slice(0, 8).join('\n'),
    });
  }

  private retry = () => this.setState({ error: null, where: '', shown: false });

  render() {
    const { error, where, shown } = this.state;
    if (!error) return this.props.children;

    const detail = [error.stack ?? `${error.name}: ${error.message}`, where]
      .filter(Boolean).join('\n');

    return (
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
        <div
          className="flex flex-col gap-3 rounded-lg p-4 max-w-[640px]"
          style={{
            border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
            background: 'color-mix(in srgb, var(--color-error) 6%, transparent)',
          }}
        >
          <div className="flex items-center gap-2">
            <span aria-hidden style={{ color: 'var(--color-error)', fontSize: 13 }}>&#9888;</span>
            <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {this.props.name} could not be displayed
            </span>
          </div>

          {/* What this means for them, before what went wrong. The other views
              of the same artifact are still fine, and that is the useful fact. */}
          <p className="text-[11.5px] leading-relaxed m-0"
             style={{ color: 'var(--color-text-secondary)' }}>
            Something in this view threw while rendering, so it has been stopped
            on its own. The rest of {`dk8s`} is unaffected — the other views of this
            artifact still work, and loading a different one clears this.
          </p>

          <p className="text-[11.5px] leading-relaxed m-0 font-mono"
             style={{ color: 'var(--color-error)' }}>
            {error.message || String(error)}
          </p>

          <div className="flex items-center gap-2">
            <button type="button" style={BTN} onClick={this.retry}>Try again</button>
            <button type="button" style={BTN}
                    onClick={() => this.setState(s => ({ shown: !s.shown }))}>
              {shown ? 'Hide details' : 'Show details'}
            </button>
            <button type="button" style={BTN}
                    onClick={() => { void navigator.clipboard?.writeText(detail); }}>
              Copy
            </button>
          </div>

          {shown && (
            <pre
              className="text-[10.5px] leading-relaxed m-0 overflow-x-auto p-2.5 rounded"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-surface-border)',
                color: 'var(--color-text-secondary)',
                maxHeight: 260,
              }}
            >{detail}</pre>
          )}
        </div>
      </div>
    );
  }
}
