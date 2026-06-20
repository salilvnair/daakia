/**
 * DebugEditorView — DUI Monaco editor with full debug feature set enabled.
 *
 * Wraps EditorView (debugSupported=true) and exposes an adapter interface so
 * any consumer can wire in their own breakpoint and debug-store logic without
 * importing daakia-specific stores.
 */
import { EditorView, type EditorViewProps } from './EditorView';

// ── Public adapter interface ───────────────────────────────────────────────────

/** Abstract debug adapter — consumer provides the implementation. */
export interface DebugEditorAdapter {
  /** Called when user clicks in the breakpoint gutter to toggle a breakpoint. */
  onToggleBreakpoint?: (line: number) => void;
  /** Called when user right-clicks a glyph in the breakpoint gutter. */
  onGlyphContextMenu?: (line: number, pos: { x: number; y: number }) => void;
  /** Called after Monaco mounts — use to attach AI autocomplete or other plugins. */
  onEditorMount?: (editor: unknown, monaco: unknown) => void;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DebugEditorViewProps extends Omit<EditorViewProps, 'debugSupported' | 'onToggleBreakpoint' | 'onGlyphContextMenu' | 'onEditorMount'> {
  /** Pluggable debug adapter — consumer supplies all callbacks. */
  adapter?: DebugEditorAdapter;
  /** Active breakpoint line numbers. */
  breakpoints?: number[];
  /** Line numbers whose breakpoints are disabled (greyed out). */
  disabledBreakpoints?: number[];
  /** Line numbers with conditional breakpoints (shown in amber). */
  conditionalBreakpointLines?: number[];
  /** Currently paused line — rendered with a yellow highlight bar. */
  pausedLine?: number | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DebugEditorView({
  adapter,
  breakpoints,
  disabledBreakpoints,
  conditionalBreakpointLines,
  pausedLine,
  ...rest
}: DebugEditorViewProps) {
  return (
    <EditorView
      {...rest}
      debugSupported
      breakpoints={breakpoints}
      disabledBreakpoints={disabledBreakpoints}
      conditionalBreakpointLines={conditionalBreakpointLines}
      pausedLine={pausedLine}
      onToggleBreakpoint={adapter?.onToggleBreakpoint}
      onGlyphContextMenu={adapter?.onGlyphContextMenu}
      onEditorMount={adapter?.onEditorMount}
    />
  );
}
