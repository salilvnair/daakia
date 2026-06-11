import { Component, type ReactNode } from 'react';

interface EBState { error: string | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) {
      return (
        <pre style={{
          color: 'var(--color-error)', fontSize: 11, whiteSpace: 'pre-wrap', margin: 0,
          lineHeight: 1.5, padding: '8px 10px', borderRadius: 6,
          background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-error) 20%, transparent)',
        }}>
          Render error: {this.state.error}
        </pre>
      );
    }
    return this.props.children;
  }
}
