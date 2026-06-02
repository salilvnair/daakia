import { useRef, useEffect, useCallback, MutableRefObject } from 'react';

export interface BreakpointGutterOptions {
  breakpoints?: number[];
  disabledBreakpoints?: number[];
  conditionalBreakpointLines?: number[];
  /** Currently paused line (1-based) — shows yellow highlight */
  pausedLine?: number | null;
  onToggleBreakpoint?: (line: number) => void;
  onGlyphContextMenu?: (line: number, pos: { x: number; y: number }) => void;
}

/**
 * Encapsulates all breakpoint gutter logic for a Monaco editor:
 * - Line validation (only skips empty lines)
 * - Breakpoint dot decorations (red/disabled/conditional)
 * - Glyph margin click & context-menu handlers
 * - Hover hint (faded dot on valid, non-breakpointed lines)
 *
 * Returns `attach(editor, monaco)` to be called in onMount,
 * and handles cleanup/decoration updates via effects.
 */
export function useBreakpointGutter(options: BreakpointGutterOptions) {
  const {
    breakpoints,
    disabledBreakpoints,
    conditionalBreakpointLines,
    pausedLine,
    onToggleBreakpoint,
    onGlyphContextMenu,
  } = options;

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const pausedDecoRef = useRef<string[]>([]);
  const hoverDecoRef = useRef<string[]>([]);
  const disposablesRef = useRef<any[]>([]);

  const isBreakpointableLine = useCallback((lineNo: number): boolean => {
    const editor = editorRef.current;
    if (!editor) return true;
    const model = editor.getModel();
    if (!model || lineNo > model.getLineCount()) return false;
    const lineContent = model.getLineContent(lineNo).trim();
    return !!lineContent;
  }, []);

  // Sync breakpoint decorations when breakpoints change
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const decos: any[] = [];

    if (breakpoints) {
      for (const line of breakpoints) {
        // Skip breakpoint glyph on the paused line — the arrow "gulps" it
        if (pausedLine && line === pausedLine) continue;

        const isDisabled = disabledBreakpoints?.includes(line);
        const isConditional = conditionalBreakpointLines?.includes(line);
        let glyphClass = 'daakia-bp-glyph';
        if (isDisabled) glyphClass = 'daakia-bp-glyph--disabled';
        else if (isConditional) glyphClass = 'daakia-bp-glyph--conditional';

        decos.push({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: isDisabled ? '' : 'daakia-bp-line',
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            glyphMarginClassName: glyphClass,
            glyphMarginHoverMessage: {
              value: isConditional ? 'Conditional Breakpoint' : isDisabled ? 'Disabled Breakpoint' : 'Breakpoint',
            },
          },
        });
      }
    }

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decos);
  }, [breakpoints, disabledBreakpoints, conditionalBreakpointLines, pausedLine]);

  // Sync paused-line highlight (yellow background + arrow in glyph margin)
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    if (pausedLine) {
      // Use combined class when paused line is also a breakpoint line
      const isOnBreakpoint = breakpoints?.includes(pausedLine);
      const glyphClass = isOnBreakpoint
        ? 'daakia-paused-line__arrow daakia-paused-line__arrow--with-bp'
        : 'daakia-paused-line__arrow';

      pausedDecoRef.current = editor.deltaDecorations(pausedDecoRef.current, [{
        range: new monaco.Range(pausedLine, 1, pausedLine, 1),
        options: {
          isWholeLine: true,
          className: 'daakia-paused-line',
          glyphMarginClassName: glyphClass,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      }]);
      // Scroll to the paused line
      editor.revealLineInCenter(pausedLine);
    } else {
      pausedDecoRef.current = editor.deltaDecorations(pausedDecoRef.current, []);
    }
  }, [pausedLine, breakpoints]);

  // Cleanup disposables on unmount
  useEffect(() => {
    return () => {
      disposablesRef.current.forEach(d => d?.dispose?.());
      disposablesRef.current = [];
    };
  }, []);

  /**
   * Call this inside Monaco's onMount handler to attach all gutter interactions.
   * Returns the disposables (also tracked internally for auto-cleanup).
   */
  const attach = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Mark the entire margin container so RightClickMenu can detect gutter clicks
    const domNode = editor.getDomNode();
    if (domNode) {
      const marginContainer = domNode.querySelector('.margin');
      if (marginContainer) marginContainer.setAttribute('data-daakia-bp-gutter', '');
    }

    // Left-click to toggle breakpoint (right-click is handled separately for context menu)
    if (onToggleBreakpoint) {
      const d1 = editor.onMouseDown((e: any) => {
        if (e.event.leftButton && e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
          const line = e.target.position?.lineNumber;
          if (line && isBreakpointableLine(line)) onToggleBreakpoint(line);
        }
      });
      disposablesRef.current.push(d1);
    }

    // Right-click context menu — use DOM-level listener to intercept BEFORE Monaco shows its own menu
    if (onGlyphContextMenu) {
      let glyphRightClick: { line: number; x: number; y: number } | null = null;

      // Detect right-click on any gutter zone (glyph margin, line numbers, line decorations)
      const d2a = editor.onMouseDown((e: any) => {
        if (
          e.event.rightButton &&
          (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
           e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
           e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS)
        ) {
          const line = e.target.position?.lineNumber;
          if (line && isBreakpointableLine(line)) {
            glyphRightClick = { line, x: e.event.posx, y: e.event.posy };
          }
        }
      });
      disposablesRef.current.push(d2a);

      // DOM-level contextmenu intercept — prevents Monaco's built-in menu on gutter area
      const domNode = editor.getDomNode();
      if (domNode) {
        const domHandler = (ev: MouseEvent) => {
          if (glyphRightClick) {
            ev.preventDefault();
            ev.stopPropagation();
            onGlyphContextMenu(glyphRightClick.line, { x: glyphRightClick.x, y: glyphRightClick.y });
            glyphRightClick = null;
          } else if ((ev.target as HTMLElement).closest('[data-daakia-bp-gutter]')) {
            // Fallback: block Monaco's default menu for any gutter right-click
            ev.preventDefault();
            ev.stopPropagation();
          }
        };
        domNode.addEventListener('contextmenu', domHandler, true); // capture phase
        disposablesRef.current.push({ dispose: () => domNode.removeEventListener('contextmenu', domHandler, true) });
      }
    }

    // Hover hint: faded dot on valid non-breakpointed lines
    if (onToggleBreakpoint) {
      const d3 = editor.onMouseMove((e: any) => {
        if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
          const line = e.target.position?.lineNumber;
          if (line && isBreakpointableLine(line)) {
            const model = editor.getModel();
            if (model) {
              const lineDecos = model.getLineDecorations(line);
              const hasBpDeco = lineDecos?.some((d: any) =>
                d.options?.glyphMarginClassName?.startsWith('daakia-bp-glyph') &&
                !d.options?.glyphMarginClassName?.includes('hover')
              );
              if (!hasBpDeco) {
                hoverDecoRef.current = editor.deltaDecorations(hoverDecoRef.current, [{
                  range: new monaco.Range(line, 1, line, 1),
                  options: {
                    isWholeLine: false,
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                    glyphMarginClassName: 'daakia-bp-glyph--hover',
                    glyphMarginHoverMessage: { value: 'Left-click to add a breakpoint' },
                  },
                }]);
                return;
              }
            }
          }
        }
        // Clear hover when not on glyph margin
        if (hoverDecoRef.current.length) {
          hoverDecoRef.current = editor.deltaDecorations(hoverDecoRef.current, []);
        }
      });
      disposablesRef.current.push(d3);

      const d4 = editor.onMouseLeave(() => {
        if (hoverDecoRef.current.length) {
          hoverDecoRef.current = editor.deltaDecorations(hoverDecoRef.current, []);
        }
      });
      disposablesRef.current.push(d4);
    }

    // Apply breakpoint decorations immediately after attach (fixes disappearing on remount)
    if (breakpoints) {
      const decos: any[] = [];
      for (const line of breakpoints) {
        const isDisabled = disabledBreakpoints?.includes(line);
        const isConditional = conditionalBreakpointLines?.includes(line);
        let glyphClass = 'daakia-bp-glyph';
        if (isDisabled) glyphClass = 'daakia-bp-glyph--disabled';
        else if (isConditional) glyphClass = 'daakia-bp-glyph--conditional';

        decos.push({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: isDisabled ? '' : 'daakia-bp-line',
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            glyphMarginClassName: glyphClass,
            glyphMarginHoverMessage: {
              value: isConditional ? 'Conditional Breakpoint' : isDisabled ? 'Disabled Breakpoint' : 'Breakpoint',
            },
          },
        });
      }
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decos);
    }
  }, [onToggleBreakpoint, onGlyphContextMenu, isBreakpointableLine, breakpoints, disabledBreakpoints, conditionalBreakpointLines]);

  return { attach };
}
