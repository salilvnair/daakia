/**
 * DebugCodeView — Displays source code with a breakpoint gutter and current-line highlighting.
 *
 * Features:
 * - Click line numbers to toggle breakpoints
 * - Red dots for active breakpoints
 * - Yellow highlight for current paused line
 * - Syntax-agnostic (plain text with line numbers)
 */
import { useMemo } from 'react';
import { useDebugStore } from '../../../store/debug-store';
import { useTabsStore } from '../../../store/tabs-store';
import './DebugCodeView.css';

interface DebugCodeViewProps {
  source: string;
}

export function DebugCodeView({ source }: DebugCodeViewProps) {
  const lines = useMemo(() => source.split('\n'), [source]);
  const { pausedLine, status } = useDebugStore();
  const activeTabId = useTabsStore(s => s.activeTabId);

  // Determine which script phase from the parent context
  const phase = useDebugStore(s => s.phase) || 'pre-request';
  const breakpoints = useDebugStore(s => s.getBreakpoints(activeTabId || '', phase));

  const handleLineClick = (lineNo: number) => {
    if (!activeTabId) return;
    useDebugStore.getState().toggleBreakpoint(activeTabId, phase, lineNo);
  };

  return (
    <div className="debug-code-view">
      <div className="debug-code-view__lines">
        {lines.map((line, idx) => {
          const lineNo = idx + 1;
          const isPaused = status === 'paused' && pausedLine === lineNo;
          const hasBreakpoint = breakpoints.includes(lineNo);

          return (
            <div
              key={lineNo}
              className={`debug-code-view__line ${isPaused ? 'debug-code-view__line--paused' : ''}`}
            >
              <div
                className="debug-code-view__gutter"
                onClick={() => handleLineClick(lineNo)}
                title={hasBreakpoint ? 'Remove breakpoint' : 'Add breakpoint'}
              >
                <span className="debug-code-view__linenum">{lineNo}</span>
                {hasBreakpoint && <span className="debug-code-view__bp-dot" />}
                {isPaused && !hasBreakpoint && <span className="debug-code-view__arrow">▶</span>}
              </div>
              <pre className="debug-code-view__code">{line || ' '}</pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
