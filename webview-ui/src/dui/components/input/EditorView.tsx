import Editor, { type OnMount } from '@monaco-editor/react';
import { useRef, useMemo, useEffect } from 'react';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { getDkCompletions, DK_TYPE_DEFS } from '../../../services/dk-repl';
import { initGraphQLCompletionProvider } from '../../../services/graphql-completion';
import type { DuiSize } from '../../core/DuiTypes';
import { useEditorBase } from '../../core/EditorBase';

// ─── Debug-only imports — only loaded when debugSupported=true ─────────────────
import { useBreakpointGutter } from '../../../hooks/useBreakpointGutter';
import { useDebugVariableHover } from '../../../hooks/useDebugVariableHover';
import { useDebugStore } from '../../../store/debug-store';

export type EditorLanguage =
  | 'javascript' | 'typescript' | 'json' | 'xml' | 'html'
  | 'css' | 'graphql' | 'python' | 'yaml' | 'plaintext' | 'markdown';

let dkLibRegistered = false;

const EXT_MAP: Partial<Record<EditorLanguage, string>> = {
  javascript: '.js', typescript: '.ts', json: '.json', xml: '.xml',
  html: '.html', css: '.css', graphql: '.graphql', python: '.py',
  yaml: '.yaml', markdown: '.md', plaintext: '.txt',
};

function formatXml(xml: string): string {
  const INDENT = '  ';
  let depth = 0;
  let result = '';
  const tokens = xml.replace(/>\s*</g, '><').split(/(?<=>)(?=<)/);
  for (const token of tokens) {
    const isClosing = /^<\//.test(token);
    const isSelfClosing = /\/>$/.test(token) || /^<!/.test(token) || /^<\?/.test(token);
    if (isClosing) depth = Math.max(0, depth - 1);
    result += INDENT.repeat(depth) + token.trim() + '\n';
    if (!isClosing && !isSelfClosing && /^<[^/!?]/.test(token)) depth++;
  }
  return result.trimEnd();
}

export interface EditorViewProps {
  value: string;
  onChange?: (value: string) => void;
  language?: EditorLanguage;
  height?: string | number;
  minHeight?: number;
  readOnly?: boolean;
  /** Placeholder shown when value is empty */
  placeholder?: string;
  wordWrap?: boolean;
  /**
   * DUI size token — sets editor font size via EDITOR_FONT_SIZE scale (md=12, lg=13, xl=14…).
   * Ignored when `fontSize` is provided explicitly.
   */
  size?: DuiSize;
  /** Explicit font size in px — takes precedence over `size`. Defaults to 12 (md). */
  fontSize?: number;
  className?: string;
  /** Adds a rounded border matching CodeEditor appearance */
  bordered?: boolean;
  /**
   * Opt-in to full debug feature set: breakpoint gutter, variable hover,
   * navigate-to-line from RunAndDebugPanel, dk/console completions.
   * When false (default) none of these hooks or store subscriptions are active.
   */
  debugSupported?: boolean;
  // ─── Debug props — only used when debugSupported=true ──────────────────────
  breakpoints?: number[];
  disabledBreakpoints?: number[];
  conditionalBreakpointLines?: number[];
  /** Currently paused line — shows yellow highlight */
  pausedLine?: number | null;
  onToggleBreakpoint?: (line: number) => void;
  onGlyphContextMenu?: (line: number, pos: { x: number; y: number }) => void;
  /** Receives editor + monaco instances after mount (e.g. for AI autocomplete) */
  onEditorMount?: (editor: any, monaco: any) => void;
}

// ─── Simple variant — no debug hooks at all ───────────────────────────────────

function EditorViewSimple({
  value, onChange, language = 'json', height = '200px', minHeight,
  readOnly = false, placeholder, wordWrap = true, size, fontSize,
  className = '', bordered = false, onEditorMount,
}: EditorViewProps) {
  const base = useEditorBase(size);
  const resolvedFontSize = fontSize ?? base.fontSize;
  const theme = useAppTheme();
  const editorRef = useRef<any>(null);
  const disposablesRef = useRef<any[]>([]);
  const modelPath = useMemo(
    () => `inmemory://daakia/${crypto.randomUUID()}${EXT_MAP[language] || '.txt'}`,
    [language],
  );
  const resolvedHeight = typeof height === 'number' ? `${height}px` : height;
  const containerHeight = minHeight ? `max(${resolvedHeight}, ${minHeight}px)` : resolvedHeight;

  useEffect(() => {
    return () => {
      disposablesRef.current.forEach(d => d?.dispose?.());
      disposablesRef.current = [];
      const editor = editorRef.current;
      if (editor) { const m = editor.getModel(); if (m) m.dispose(); }
    };
  }, []);

  useEffect(() => {
    if (!readOnly) return;
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model || model.getValue() === value) return;
    model.setValue(value);
  }, [value, readOnly]);

  const handleMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor;
    disposablesRef.current = [];
    mountCommon(editor, monacoInstance, { language, value, placeholder, onEditorMount });
  };

  return (
    <EditorShell bordered={bordered} containerHeight={containerHeight}>
      <Editor
        height="100%"
        language={language}
        path={modelPath}
        value={value}
        theme={theme === 'light' ? 'daakia-light' : 'daakia-dark'}
        onChange={v => onChange?.(v ?? '')}
        onMount={handleMount}
        options={buildOptions({ readOnly, fontSize: resolvedFontSize, wordWrap, glyphMargin: false })}
      />
    </EditorShell>
  );
}

// ─── Debug variant — subscribes to debug store + breakpoint hooks ─────────────

function EditorViewDebug({
  value, onChange, language = 'json', height = '200px', minHeight,
  readOnly = false, placeholder, wordWrap = true, size, fontSize,
  className = '', bordered = false,
  breakpoints, disabledBreakpoints, conditionalBreakpointLines, pausedLine,
  onToggleBreakpoint, onGlyphContextMenu, onEditorMount,
}: EditorViewProps) {
  const base = useEditorBase(size);
  const resolvedFontSize = fontSize ?? base.fontSize;
  const theme = useAppTheme();
  const editorRef = useRef<any>(null);
  const disposablesRef = useRef<any[]>([]);
  const modelPath = useMemo(
    () => `inmemory://daakia/${crypto.randomUUID()}${EXT_MAP[language] || '.txt'}`,
    [language],
  );
  const resolvedHeight = typeof height === 'number' ? `${height}px` : height;
  const containerHeight = minHeight ? `max(${resolvedHeight}, ${minHeight}px)` : resolvedHeight;

  // Debug hooks — always called here (React rules), never called in Simple variant
  const { attach: attachBreakpointGutter } = useBreakpointGutter({
    breakpoints, disabledBreakpoints, conditionalBreakpointLines, pausedLine,
    onToggleBreakpoint, onGlyphContextMenu,
  });
  const { attach: attachDebugHover } = useDebugVariableHover();
  const navigateLine = useDebugStore(s => s.navigateLine);

  useEffect(() => {
    return () => {
      disposablesRef.current.forEach(d => d?.dispose?.());
      disposablesRef.current = [];
      const editor = editorRef.current;
      if (editor) { const m = editor.getModel(); if (m) m.dispose(); }
    };
  }, []);

  useEffect(() => {
    if (!readOnly) return;
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model || model.getValue() === value) return;
    model.setValue(value);
  }, [value, readOnly]);

  useEffect(() => {
    if (!navigateLine || !editorRef.current || !breakpoints) return;
    editorRef.current.revealLineInCenter(navigateLine);
    editorRef.current.setPosition({ lineNumber: navigateLine, column: 1 });
    useDebugStore.getState().setNavigateLine(null);
  }, [navigateLine, breakpoints]);

  const handleMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor;
    disposablesRef.current = [];
    // Attach debug features
    attachBreakpointGutter(editor, monacoInstance);
    attachDebugHover(editor, monacoInstance);
    mountCommon(editor, monacoInstance, { language, value, placeholder, onEditorMount });
  };

  return (
    <EditorShell bordered={bordered} containerHeight={containerHeight}>
      <Editor
        height="100%"
        language={language}
        path={modelPath}
        value={value}
        theme={theme === 'light' ? 'daakia-light' : 'daakia-dark'}
        onChange={v => onChange?.(v ?? '')}
        onMount={handleMount}
        options={buildOptions({ readOnly, fontSize: resolvedFontSize, wordWrap, glyphMargin: !!onToggleBreakpoint })}
      />
    </EditorShell>
  );
}

// ─── Public export — dispatcher ───────────────────────────────────────────────

export function EditorView({ debugSupported = false, className = '', ...rest }: EditorViewProps) {
  if (debugSupported) return <EditorViewDebug className={className} {...rest} />;
  return <EditorViewSimple className={className} {...rest} />;
}

// ─── Shared render shell ──────────────────────────────────────────────────────

function EditorShell({
  bordered, containerHeight, children,
}: {
  bordered: boolean;
  containerHeight: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative${bordered ? ' rounded border border-[var(--color-surface-border)]' : ''}`}
      style={{ height: containerHeight, width: '100%', position: 'relative' }}
    >
      {children}
    </div>
  );
}

// ─── Shared Monaco options builder ───────────────────────────────────────────

function buildOptions({ readOnly, fontSize, wordWrap, glyphMargin }: {
  readOnly: boolean; fontSize: number; wordWrap: boolean; glyphMargin: boolean;
}) {
  return {
    readOnly, fontSize,
    wordWrap: wordWrap ? ('on' as const) : ('off' as const),
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    lineNumbers: 'on' as const,
    glyphMargin,
    folding: true,
    renderLineHighlight: (glyphMargin ? 'line' : 'none') as 'line' | 'none',
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    padding: { top: 8, bottom: 8 },
    tabSize: 2,
    formatOnPaste: true,
    formatOnType: true,
    automaticLayout: true,
    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    bracketPairColorization: { enabled: true },
    fixedOverflowWidgets: true,
    copyWithSyntaxHighlighting: true,
    autoClosingBrackets: 'always' as const,
    autoClosingQuotes: 'always' as const,
    autoClosingDelete: 'always' as const,
    autoIndent: 'full' as const,
    autoSurround: 'languageDefined' as const,
    suggest: { showKeywords: true, showSnippets: true, showValues: true, showProperties: true },
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: 'on' as const,
    matchBrackets: 'always' as const,
    guides: { bracketPairs: true, indentation: true },
    colorDecorators: true,
    linkedEditing: true,
    renderWhitespace: 'selection' as const,
    contextmenu: true,
  };
}

// ─── Shared mount logic (everything that isn't debug-specific) ────────────────

function mountCommon(
  editor: any,
  monacoInstance: any,
  { language, value, placeholder, onEditorMount }: {
    language: EditorLanguage;
    value: string;
    placeholder?: string;
    onEditorMount?: (editor: any, monaco: any) => void;
  },
) {
  // Layout fixes for flex/overflow containers
  const relayout = () => editor.layout();
  relayout();
  requestAnimationFrame(relayout);
  setTimeout(relayout, 50);
  setTimeout(relayout, 200);
  const parent = editor.getContainerDomNode().parentElement;
  if (parent) {
    const ro = new ResizeObserver(relayout);
    ro.observe(parent);
    editor.onDidDispose(() => ro.disconnect());
  }

  editor.updateOptions({
    autoClosingBrackets: 'always', autoClosingQuotes: 'always',
    autoClosingDelete: 'always', autoSurround: 'languageDefined', autoIndent: 'full',
  });

  // Clipboard overrides — modern Clipboard API (webview-compatible)
  const KM = monacoInstance.KeyMod;
  const KC = monacoInstance.KeyCode;

  editor.addAction({
    id: 'daakia.clipboard.copy', label: 'Copy',
    keybindings: [KM.CtrlCmd | KC.KeyC],
    run: (ed: any) => {
      const sel = ed.getSelection();
      if (sel && !sel.isEmpty()) {
        navigator.clipboard.writeText(ed.getModel()?.getValueInRange(sel) || '');
      } else {
        const pos = ed.getPosition();
        if (pos) navigator.clipboard.writeText((ed.getModel()?.getLineContent(pos.lineNumber) || '') + '\n');
      }
    },
  });

  editor.addAction({
    id: 'daakia.clipboard.cut', label: 'Cut',
    keybindings: [KM.CtrlCmd | KC.KeyX],
    run: (ed: any) => {
      const sel = ed.getSelection();
      if (sel && !sel.isEmpty()) {
        navigator.clipboard.writeText(ed.getModel()?.getValueInRange(sel) || '');
        ed.executeEdits('cut', [{ range: sel, text: '' }]);
      } else {
        const pos = ed.getPosition();
        if (pos) {
          const model = ed.getModel();
          if (model) {
            navigator.clipboard.writeText(model.getLineContent(pos.lineNumber) + '\n');
            ed.executeEdits('cut', [{ range: new monacoInstance.Range(pos.lineNumber, 1, pos.lineNumber + 1, 1), text: '' }]);
          }
        }
      }
    },
  });

  editor.addAction({
    id: 'daakia.clipboard.paste', label: 'Paste',
    keybindings: [KM.CtrlCmd | KC.KeyV],
    run: async (ed: any) => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          const sel = ed.getSelection();
          if (sel) ed.executeEdits('paste', [{ range: sel, text, forceMoveMarkers: true }]);
        }
      } catch { /* clipboard permission denied */ }
    },
  });

  editor.addAction({
    id: 'daakia.clipboard.selectAll', label: 'Select All',
    keybindings: [KM.CtrlCmd | KC.KeyA],
    run: (ed: any) => { const m = ed.getModel(); if (m) ed.setSelection(m.getFullModelRange()); },
  });

  // Format Document — Shift+Alt+F
  editor.addAction({
    id: 'daakia.format.document', label: 'Format Document',
    keybindings: [KM.Shift | KM.Alt | KC.KeyF],
    contextMenuGroupId: 'modification', contextMenuOrder: 1.5,
    run: async (ed: any) => {
      const model = ed.getModel();
      if (!model) return;
      const langId = model.getLanguageId();
      if (langId === 'xml' || langId === 'html') {
        try {
          const raw = model.getValue();
          const formatted = formatXml(raw);
          if (formatted !== raw) ed.executeEdits('daakia.format', [{ range: model.getFullModelRange(), text: formatted }]);
        } catch { /* malformed XML */ }
      } else {
        await ed.getAction('editor.action.formatDocument')?.run();
      }
    },
  });

  // Find & Replace — Ctrl+Shift+H
  editor.addAction({
    id: 'daakia.findAndReplace', label: 'Find and Replace',
    keybindings: [KM.CtrlCmd | KM.Shift | KC.KeyH],
    contextMenuGroupId: 'navigation', contextMenuOrder: 1.5,
    run: () => editor.getAction('editor.action.startFindReplaceAction')?.run(),
  });

  // Auto-closing config per language
  const model = editor.getModel();
  if (model) {
    const langId = model.getLanguageId();
    if (langId === 'xml' || langId === 'html') {
      monacoInstance.languages.setLanguageConfiguration(langId, {
        autoClosingPairs: [
          { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
          { open: '"', close: '"', notIn: ['string'] },
          { open: "'", close: "'", notIn: ['string', 'comment'] },
          { open: '<', close: '>', notIn: ['string'] },
        ],
        brackets: [['{', '}'], ['[', ']'], ['(', ')'], ['<', '>']],
        surroundingPairs: [
          { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
          { open: '"', close: '"' }, { open: "'", close: "'" }, { open: '<', close: '>' },
        ],
        onEnterRules: [
          {
            beforeText: /<([_:\w][_:\w\-.\d]*)([^/>]*(?!\/)>)\s*$/i,
            afterText: /^<\/([_:\w][_:\w\-.\d]*)\s*>$/i,
            action: { indentAction: monacoInstance.languages.IndentAction.IndentOutdent },
          },
          {
            beforeText: /<([_:\w][_:\w\-.\d]*)([^/>]*(?!\/)>)\s*$/i,
            action: { indentAction: monacoInstance.languages.IndentAction.Indent },
          },
        ],
        wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
      });
      monacoInstance.languages.registerCompletionItemProvider(langId, {
        triggerCharacters: ['/'],
        provideCompletionItems: (mdl: any, position: any) => {
          const textUntilPosition = mdl.getValueInRange({
            startLineNumber: 1, startColumn: 1,
            endLineNumber: position.lineNumber, endColumn: position.column,
          });
          const match = textUntilPosition.match(/<\/\s*$/);
          if (match) {
            const openTags: string[] = [];
            const tagRegex = /<\/?([_:\w][_:\w\-.\d]*)[^>]*\/?>/g;
            let m;
            while ((m = tagRegex.exec(textUntilPosition.slice(0, -2))) !== null) {
              if (m[0].startsWith('</')) openTags.pop();
              else if (!m[0].endsWith('/>')) openTags.push(m[1]);
            }
            const lastOpen = openTags[openTags.length - 1];
            if (lastOpen) {
              return {
                suggestions: [{
                  label: `/${lastOpen}>`,
                  kind: monacoInstance.languages.CompletionItemKind.Keyword,
                  insertText: `${lastOpen}>`,
                  range: {
                    startLineNumber: position.lineNumber, startColumn: position.column,
                    endLineNumber: position.lineNumber, endColumn: position.column,
                  },
                }],
              };
            }
          }
          return { suggestions: [] };
        },
      });
    } else {
      monacoInstance.languages.setLanguageConfiguration(langId, {
        autoClosingPairs: [
          { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
          { open: '"', close: '"', notIn: ['string'] },
          { open: "'", close: "'", notIn: ['string', 'comment'] },
        ],
        brackets: [['{', '}'], ['[', ']'], ['(', ')']],
        surroundingPairs: [
          { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
          { open: '"', close: '"' }, { open: "'", close: "'" },
        ],
      });
    }
  }

  // GraphQL tokenizer + completion
  const langs = monacoInstance.languages.getLanguages();
  if (!langs.some((l: any) => l.id === 'graphql')) {
    monacoInstance.languages.register({ id: 'graphql' });
    monacoInstance.languages.setMonarchTokensProvider('graphql', {
      keywords: ['type', 'input', 'enum', 'union', 'interface', 'scalar', 'schema', 'query', 'mutation', 'subscription', 'fragment', 'on', 'extend', 'implements', 'directive', 'repeatable'],
      typeKeywords: ['String', 'Int', 'Float', 'Boolean', 'ID'],
      operators: ['!', '=', '|', '&', '...'],
      symbols: /[=!|&]+/,
      tokenizer: {
        root: [
          [/#.*$/, 'comment'], [/"([^"\\]|\\.)*"/, 'string'], [/"""[\s\S]*?"""/, 'string'],
          [/\b(type|input|enum|union|interface|scalar|schema|extend|implements|directive|repeatable)\b/, 'keyword'],
          [/\b(query|mutation|subscription|fragment|on)\b/, 'keyword.control'],
          [/\b(String|Int|Float|Boolean|ID)\b/, 'type.identifier'],
          [/\b[A-Z][a-zA-Z0-9_]*\b/, 'type.identifier'],
          [/\b[a-z_][a-zA-Z0-9_]*(?=\s*[:(])/, 'variable'],
          [/\b[a-z_][a-zA-Z0-9_]*\b/, 'identifier'],
          [/[{}()\[\]]/, '@brackets'], [/[!:=|&]/, 'operator'],
          [/\$[a-zA-Z_]\w*/, 'variable'], [/@[a-zA-Z_]\w*/, 'annotation'],
        ],
      },
    } as any);
  }
  if (language === 'graphql') initGraphQLCompletionProvider(monacoInstance);

  // dk + console intellisense — JavaScript editors only
  if (language === 'javascript') {
    if (!dkLibRegistered) {
      monacoInstance.languages.typescript.javascriptDefaults.addExtraLib(DK_TYPE_DEFS, 'dk-globals.d.ts');
      dkLibRegistered = true;
    }
    monacoInstance.languages.registerCompletionItemProvider('javascript', {
      triggerCharacters: ['.'],
      provideCompletionItems: (mdl: any, pos: any) => {
        const textUntilPosition = mdl.getValueInRange({
          startLineNumber: pos.lineNumber, startColumn: 1,
          endLineNumber: pos.lineNumber, endColumn: pos.column,
        });
        const suggestions = getDkCompletions(textUntilPosition, monacoInstance, pos);
        if (suggestions.length > 0) return { suggestions };
        const range = { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: pos.column, endColumn: pos.column };
        if (/\bconsole\.\s*$/.test(textUntilPosition)) {
          return {
            suggestions: [
              { label: 'log', kind: monacoInstance.languages.CompletionItemKind.Function, insertText: 'log(${1})', insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Log output', range },
              { label: 'info', kind: monacoInstance.languages.CompletionItemKind.Function, insertText: 'info(${1})', insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Info output', range },
              { label: 'warn', kind: monacoInstance.languages.CompletionItemKind.Function, insertText: 'warn(${1})', insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Warning output', range },
              { label: 'error', kind: monacoInstance.languages.CompletionItemKind.Function, insertText: 'error(${1})', insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Error output', range },
              { label: 'debug', kind: monacoInstance.languages.CompletionItemKind.Function, insertText: 'debug(${1})', insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Debug output', range },
            ],
          };
        }
        return { suggestions: [] };
      },
    });
  }

  if (!value && placeholder) editor.updateOptions({ placeholder });
  onEditorMount?.(editor, monacoInstance);
  editor.updateOptions({ contextmenu: true });
}
