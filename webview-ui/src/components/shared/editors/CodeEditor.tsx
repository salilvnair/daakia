import { EditorView } from '@salilvnair/dui';

export type CodeLanguage = 'javascript' | 'json' | 'xml' | 'python' | 'text' | 'html' | 'typescript' | 'java' | 'graphql' | 'plaintext' | 'yaml';

interface Props {
  value: string;
  onChange?: (value: string) => void;
  language?: CodeLanguage;
  readOnly?: boolean;
  placeholder?: string;
  height?: string;
  className?: string;
  wordWrap?: boolean;
  fontSize?: number;
  /** Line numbers with active breakpoints (1-based) */
  breakpoints?: number[];
  /** Line numbers with disabled breakpoints */
  disabledBreakpoints?: number[];
  /** Line numbers with conditional breakpoints (shown as orange dot) */
  conditionalBreakpointLines?: number[];
  /** Currently paused line (yellow highlight) */
  pausedLine?: number | null;
  /** Callback when user clicks glyph margin to toggle a breakpoint */
  onToggleBreakpoint?: (line: number) => void;
  /** Callback when user right-clicks glyph margin */
  onGlyphContextMenu?: (line: number, pos: { x: number; y: number }) => void;
  /** Optional callback to receive editor + monaco instances after mount (e.g. for AI autocomplete) */
  onEditorMount?: (editor: any, monaco: any) => void;
}

// dui's EditorLanguage doesn't have a 'text' value — it's an alias for 'plaintext' here.
const LANG_MAP: Record<CodeLanguage, Exclude<CodeLanguage, 'text'>> = {
  javascript: 'javascript', typescript: 'typescript', json: 'json', xml: 'xml',
  python: 'python', html: 'html', java: 'java', graphql: 'graphql',
  plaintext: 'plaintext',
  yaml: 'yaml', text: 'plaintext',
};

/**
 * Thin wrapper around dui's EditorView — kept as its own component (rather
 * than switching every call site to EditorView directly) so this file's
 * exported CodeLanguage type and always-on debug-hook behavior (breakpoint
 * gutter, variable hover, navigate-to-line) stay exactly as they were when
 * this used to own its Monaco setup directly.
 */
export function CodeEditor({
  value,
  onChange,
  language = 'text',
  readOnly = false,
  placeholder,
  height = '200px',
  className = '',
  wordWrap = false,
  fontSize = 12,
  breakpoints,
  disabledBreakpoints,
  conditionalBreakpointLines,
  pausedLine,
  onToggleBreakpoint,
  onGlyphContextMenu,
  onEditorMount,
}: Props) {
  return (
    <EditorView
      debugSupported
      bordered
      className={className}
      value={value}
      onChange={onChange}
      language={LANG_MAP[language]}
      readOnly={readOnly}
      placeholder={placeholder}
      height={height}
      wordWrap={wordWrap}
      fontSize={fontSize}
      breakpoints={breakpoints}
      disabledBreakpoints={disabledBreakpoints}
      conditionalBreakpointLines={conditionalBreakpointLines}
      pausedLine={pausedLine}
      onToggleBreakpoint={onToggleBreakpoint}
      onGlyphContextMenu={onGlyphContextMenu}
      onEditorMount={onEditorMount}
      editorOptions={{
        // CodeEditor always highlighted the current line and used an 8px
        // scrollbar regardless of whether breakpoints were wired up —
        // dui's defaults are conditional on glyphMargin, so pin them explicitly.
        renderLineHighlight: 'line',
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      }}
    />
  );
}
