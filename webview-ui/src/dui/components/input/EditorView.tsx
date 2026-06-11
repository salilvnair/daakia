import Editor, { type OnMount } from '@monaco-editor/react';
import { useCallback } from 'react';
import { useAppTheme } from '../../../hooks/useAppTheme';

export type EditorLanguage =
  | 'javascript' | 'typescript' | 'json' | 'xml' | 'html'
  | 'css' | 'graphql' | 'python' | 'yaml' | 'plaintext';

export interface EditorViewProps {
  value: string;
  onChange?: (value: string) => void;
  language?: EditorLanguage;
  height?: string | number;
  minHeight?: number;
  readOnly?: boolean;
  /** Placeholder shown when value is empty (overlay text) */
  placeholder?: string;
  wordWrap?: boolean;
  fontSize?: number;
  className?: string;
}

export function EditorView({
  value,
  onChange,
  language = 'json',
  height = '200px',
  minHeight,
  readOnly = false,
  placeholder,
  wordWrap = true,
  fontSize = 13,
  className = '',
}: EditorViewProps) {
  const theme = useAppTheme();
  const resolvedHeight = typeof height === 'number' ? `${height}px` : height;
  const containerHeight = minHeight ? `max(${resolvedHeight}, ${minHeight}px)` : resolvedHeight;

  // Force Monaco to recalculate layout after mount — needed when the editor
  // lives inside an overflow:auto flex container where automaticLayout fails silently.
  const handleMount: OnMount = useCallback((editor) => {
    requestAnimationFrame(() => { editor.layout(); });
    setTimeout(() => { editor.layout(); }, 100);
  }, []);

  return (
    <div className={`relative ${className}`} style={{ height: containerHeight, position: 'relative' }}>
      {placeholder && !value && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '60px',
            pointerEvents: 'none',
            zIndex: 1,
            fontSize: `${fontSize}px`,
            color: 'var(--color-text-muted)',
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          }}
        >
          {placeholder}
        </div>
      )}
      <Editor
        height={containerHeight}
        language={language}
        value={value}
        theme={theme === 'light' ? 'daakia-light' : 'daakia-dark'}
        onChange={v => onChange?.(v ?? '')}
        onMount={handleMount}
        options={{
          readOnly,
          fontSize,
          wordWrap: wordWrap ? 'on' : 'off',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          glyphMargin: false,
          folding: true,
          renderLineHighlight: 'none',
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          padding: { top: 8, bottom: 8 },
          tabSize: 2,
          formatOnPaste: true,
          automaticLayout: true,
          scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        }}
      />
    </div>
  );
}
