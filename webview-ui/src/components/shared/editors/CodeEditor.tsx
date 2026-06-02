import Editor, { OnMount } from '@monaco-editor/react';
import { useRef, useMemo, useEffect, useState } from 'react';
import { getDkCompletions } from '../../../services/dk-repl';
import { initGraphQLCompletionProvider } from '../../../services/graphql-completion';
import { useBreakpointGutter } from '../../../hooks/useBreakpointGutter';
import { useDebugVariableHover } from '../../../hooks/useDebugVariableHover';
import { useDebugStore } from '../../../store/debug-store';


export type CodeLanguage = 'javascript' | 'json' | 'xml' | 'python' | 'text' | 'html' | 'typescript' | 'java' | 'graphql' | 'plaintext';

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
}

const LANG_MAP: Record<CodeLanguage, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  json: 'json',
  xml: 'xml',
  python: 'python',
  html: 'html',
  java: 'java',
  graphql: 'graphql',
  plaintext: 'plaintext',
  text: 'plaintext',
};

const EXT_MAP: Record<CodeLanguage, string> = {
  javascript: '.js',
  typescript: '.ts',
  json: '.json',
  xml: '.xml',
  python: '.py',
  html: '.html',
  java: '.java',
  graphql: '.graphql',
  plaintext: '.txt',
  text: '.txt',
};

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
}: Props) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const disposablesRef = useRef<any[]>([]);
  // Stable unique path with correct extension so the TypeScript worker identifies the script kind
  const modelPath = useMemo(() => `inmemory://daakia/${crypto.randomUUID()}${EXT_MAP[language] || '.txt'}`, [language]);

  // Breakpoint gutter logic (decorations, hover, click handlers, paused-line highlight) — externalized
  const { attach: attachBreakpointGutter } = useBreakpointGutter({
    breakpoints,
    disabledBreakpoints,
    conditionalBreakpointLines,
    pausedLine,
    onToggleBreakpoint,
    onGlyphContextMenu,
  });

  // Variable hover during debug — shows values on hover over identifiers
  const { attach: attachDebugHover } = useDebugVariableHover();

  // Cleanup on unmount — dispose listeners and model to prevent leaks
  useEffect(() => {
    return () => {
      disposablesRef.current.forEach(d => d?.dispose?.());
      disposablesRef.current = [];
      const editor = editorRef.current;
      if (editor) {
        const model = editor.getModel();
        if (model) model.dispose();
      }
    };
  }, []);

  // Navigate to line when breakpoint is clicked in RunAndDebugPanel
  const navigateLine = useDebugStore(s => s.navigateLine);
  useEffect(() => {
    if (navigateLine && editorRef.current && breakpoints) {
      editorRef.current.revealLineInCenter(navigateLine);
      editorRef.current.setPosition({ lineNumber: navigateLine, column: 1 });
      useDebugStore.getState().setNavigateLine(null);
    }
  }, [navigateLine, breakpoints]);

  const handleMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    disposablesRef.current = [];

    // Attach breakpoint gutter interactions (click, context menu, hover)
    attachBreakpointGutter(editor, monacoInstance);

    // Attach debug variable hover (shows variable values on hover during debug)
    attachDebugHover(editor, monacoInstance);

    // Force auto-closing options after mount to ensure they take effect
    editor.updateOptions({
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      autoClosingDelete: 'always',
      autoSurround: 'languageDefined',
      autoIndent: 'full',
    });

    // Override clipboard keybindings to use modern Clipboard API (webview-compatible)
    const KM = monacoInstance.KeyMod;
    const KC = monacoInstance.KeyCode;

    editor.addAction({
      id: 'daakia.clipboard.copy',
      label: 'Copy',
      keybindings: [KM.CtrlCmd | KC.KeyC],
      run: (ed) => {
        const sel = ed.getSelection();
        if (sel && !sel.isEmpty()) {
          const text = ed.getModel()?.getValueInRange(sel) || '';
          navigator.clipboard.writeText(text);
        } else {
          // Copy entire line if no selection (Monaco default behavior)
          const pos = ed.getPosition();
          if (pos) {
            const line = ed.getModel()?.getLineContent(pos.lineNumber) || '';
            navigator.clipboard.writeText(line + '\n');
          }
        }
      },
    });

    editor.addAction({
      id: 'daakia.clipboard.cut',
      label: 'Cut',
      keybindings: [KM.CtrlCmd | KC.KeyX],
      run: (ed) => {
        const sel = ed.getSelection();
        if (sel && !sel.isEmpty()) {
          const text = ed.getModel()?.getValueInRange(sel) || '';
          navigator.clipboard.writeText(text);
          ed.executeEdits('cut', [{ range: sel, text: '' }]);
        } else {
          // Cut entire line if no selection
          const pos = ed.getPosition();
          if (pos) {
            const model = ed.getModel();
            if (model) {
              const line = model.getLineContent(pos.lineNumber) + '\n';
              navigator.clipboard.writeText(line);
              const range = new monacoInstance.Range(pos.lineNumber, 1, pos.lineNumber + 1, 1);
              ed.executeEdits('cut', [{ range, text: '' }]);
            }
          }
        }
      },
    });

    editor.addAction({
      id: 'daakia.clipboard.paste',
      label: 'Paste',
      keybindings: [KM.CtrlCmd | KC.KeyV],
      run: async (ed) => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            const sel = ed.getSelection();
            if (sel) {
              ed.executeEdits('paste', [{ range: sel, text, forceMoveMarkers: true }]);
            }
          }
        } catch { /* clipboard permission denied */ }
      },
    });

    editor.addAction({
      id: 'daakia.clipboard.selectAll',
      label: 'Select All',
      keybindings: [KM.CtrlCmd | KC.KeyA],
      run: (ed) => {
        const model = ed.getModel();
        if (model) {
          ed.setSelection(model.getFullModelRange());
        }
      },
    });

    // Ensure the language model has correct config for bracket pairs
    const model = editor.getModel();
    if (model) {
      const langId = model.getLanguageId();

      if (langId === 'xml' || langId === 'html') {
        monacoInstance.languages.setLanguageConfiguration(langId, {
          autoClosingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"', notIn: ['string'] },
            { open: "'", close: "'", notIn: ['string', 'comment'] },
            { open: '<', close: '>', notIn: ['string'] },
          ],
          brackets: [
            ['{', '}'],
            ['[', ']'],
            ['(', ')'],
            ['<', '>'],
          ],
          surroundingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"' },
            { open: "'", close: "'" },
            { open: '<', close: '>' },
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

        // Register XML auto-closing tag completion provider
        monacoInstance.languages.registerCompletionItemProvider(langId, {
          triggerCharacters: ['/'],
          provideCompletionItems: (mdl: any, position: any) => {
            const textUntilPosition = mdl.getValueInRange({
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            });

            // Match </ and suggest closing tag
            const match = textUntilPosition.match(/<\/\s*$/);
            if (match) {
              // Find last unclosed tag
              const openTags: string[] = [];
              const tagRegex = /<\/?([_:\w][_:\w\-.\d]*)[^>]*\/?>/g;
              let m;
              while ((m = tagRegex.exec(textUntilPosition.slice(0, -2))) !== null) {
                const fullMatch = m[0];
                const tagName = m[1];
                if (fullMatch.startsWith('</')) {
                  openTags.pop();
                } else if (!fullMatch.endsWith('/>')) {
                  openTags.push(tagName);
                }
              }
              const lastOpen = openTags[openTags.length - 1];
              if (lastOpen) {
                return {
                  suggestions: [{
                    label: `/${lastOpen}>`,
                    kind: monacoInstance.languages.CompletionItemKind.Keyword,
                    insertText: `${lastOpen}>`,
                    range: {
                      startLineNumber: position.lineNumber,
                      startColumn: position.column,
                      endLineNumber: position.lineNumber,
                      endColumn: position.column,
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
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"', notIn: ['string'] },
            { open: "'", close: "'", notIn: ['string', 'comment'] },
          ],
          brackets: [
            ['{', '}'],
            ['[', ']'],
            ['(', ')'],
          ],
          surroundingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"' },
            { open: "'", close: "'" },
          ],
        });
      }
    }

    // Register GraphQL language if not already registered
    const languages = monacoInstance.languages.getLanguages();
    if (!languages.some((l: any) => l.id === 'graphql')) {
      monacoInstance.languages.register({ id: 'graphql' });
      monacoInstance.languages.setMonarchTokensProvider('graphql', {
        keywords: ['type', 'input', 'enum', 'union', 'interface', 'scalar', 'schema', 'query', 'mutation', 'subscription', 'fragment', 'on', 'extend', 'implements', 'directive', 'repeatable'],
        typeKeywords: ['String', 'Int', 'Float', 'Boolean', 'ID'],
        operators: ['!', '=', '|', '&', '...'],
        symbols: /[=!|&]+/,
        tokenizer: {
          root: [
            [/#.*$/, 'comment'],
            [/"([^"\\]|\\.)*"/, 'string'],
            [/"""[\s\S]*?"""/, 'string'],
            [/\b(type|input|enum|union|interface|scalar|schema|extend|implements|directive|repeatable)\b/, 'keyword'],
            [/\b(query|mutation|subscription|fragment|on)\b/, 'keyword.control'],
            [/\b(String|Int|Float|Boolean|ID)\b/, 'type.identifier'],
            [/\b[A-Z][a-zA-Z0-9_]*\b/, 'type.identifier'],
            [/\b[a-z_][a-zA-Z0-9_]*(?=\s*[:(])/, 'variable'],
            [/\b[a-z_][a-zA-Z0-9_]*\b/, 'identifier'],
            [/[{}()\[\]]/, '@brackets'],
            [/[!:=|&]/, 'operator'],
            [/\$[a-zA-Z_]\w*/, 'variable'],
            [/@[a-zA-Z_]\w*/, 'annotation'],
          ],
        },
      } as any);
    }

    // Register GraphQL schema-based completion provider (once globally)
    if (language === 'graphql') {
      initGraphQLCompletionProvider(monacoInstance);
    }

    // Register dk/console intellisense for JavaScript editors (script editors)
    if (language === 'javascript') {
      monacoInstance.languages.registerCompletionItemProvider('javascript', {
        triggerCharacters: ['.'],
        provideCompletionItems: (mdl: any, pos: any) => {
          const textUntilPosition = mdl.getValueInRange({
            startLineNumber: pos.lineNumber,
            startColumn: 1,
            endLineNumber: pos.lineNumber,
            endColumn: pos.column,
          });
          const suggestions = getDkCompletions(textUntilPosition, monacoInstance, pos);
          if (suggestions.length > 0) return { suggestions };

          // console. completions
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

    // Show placeholder if empty
    if (!value && placeholder) {
      editor.updateOptions({ placeholder });
    }
  };

  return (
    <div className={`rounded border border-[var(--color-surface-border)] ${className}`} style={{ height }}>
      <Editor
        height="100%"
        language={LANG_MAP[language] || 'plaintext'}
        path={modelPath}
        value={value}
        onChange={(val) => onChange?.(val ?? '')}
        onMount={handleMount}
        theme="daakia-dark"
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize,
          lineNumbers: 'on',
          glyphMargin: !!onToggleBreakpoint,
          scrollBeyondLastLine: false,
          wordWrap: wordWrap ? 'on' : 'off',
          tabSize: 2,
          renderLineHighlight: 'line',
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          padding: { top: 8, bottom: 8 },
          folding: true,
          bracketPairColorization: { enabled: true },
          automaticLayout: true,
          contextmenu: false,
          fixedOverflowWidgets: true,
          // Let Monaco handle clipboard internally
          copyWithSyntaxHighlighting: true,
          formatOnPaste: true,
          formatOnType: true,
          // VS Code-like auto features
          autoClosingBrackets: 'always',
          autoClosingQuotes: 'always',
          autoClosingDelete: 'always',
          autoIndent: 'full',
          autoSurround: 'languageDefined',
          suggest: {
            showKeywords: true,
            showSnippets: true,
            showValues: true,
            showProperties: true,
          },
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          matchBrackets: 'always',
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          colorDecorators: true,
          linkedEditing: true,
          renderWhitespace: 'selection',
        }}
      />
    </div>
  );
}
