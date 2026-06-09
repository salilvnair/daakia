/**
 * Self-host Monaco Editor — no CDN required.
 * This configures workers inline so the webview CSP doesn't need external access.
 * Also defines a custom "vscode-dark+" theme to match real VS Code colors.
 */
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker&inline';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker&inline';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker&inline';
import {
  javascriptDefaults,
  typescriptDefaults,
  ScriptTarget,
  ModuleKind,
  ModuleResolutionKind,
  JsxEmit,
} from 'monaco-editor/esm/vs/language/typescript/monaco.contribution';

(window as any).MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

// Define VS Code "Dark+" matching theme
monaco.editor.defineTheme('daakia-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    // JSON
    { token: 'string.key.json', foreground: '9CDCFE' },
    { token: 'string.value.json', foreground: 'CE9178' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'keyword.json', foreground: '569CD6' }, // true/false/null
    // General
    { token: 'string', foreground: 'CE9178' },
    { token: 'keyword', foreground: '569CD6' },
    { token: 'comment', foreground: '6A9955' },
    { token: 'type', foreground: '4EC9B0' },
    { token: 'identifier', foreground: '9CDCFE' },
    { token: 'variable', foreground: '9CDCFE' },
    { token: 'constant', foreground: '4FC1FF' },
    // JS/TS
    { token: 'keyword.js', foreground: 'C586C0' },
    { token: 'keyword.ts', foreground: 'C586C0' },
    { token: 'string.js', foreground: 'CE9178' },
    { token: 'string.ts', foreground: 'CE9178' },
    { token: 'number.js', foreground: 'B5CEA8' },
    { token: 'number.ts', foreground: 'B5CEA8' },
    { token: 'regexp', foreground: 'D16969' },
    { token: 'delimiter', foreground: 'D4D4D4' },
    { token: 'delimiter.bracket', foreground: 'FFD700' },
    // XML/HTML
    { token: 'tag', foreground: '569CD6' },
    { token: 'attribute.name', foreground: '9CDCFE' },
    { token: 'attribute.value', foreground: 'CE9178' },
    // GraphQL
    { token: 'keyword.graphql', foreground: 'C586C0' },
    { token: 'keyword.control.graphql', foreground: 'C586C0' },
    { token: 'type.identifier.graphql', foreground: 'E5C07B' },
    { token: 'variable.graphql', foreground: '9CDCFE' },
    { token: 'string.graphql', foreground: 'CE9178' },
    { token: 'comment.graphql', foreground: '6A9955' },
    { token: 'annotation.graphql', foreground: 'DCDCAA' },
    { token: 'operator.graphql', foreground: 'D4D4D4' },
    { token: 'identifier.graphql', foreground: 'D4D4D4' },
  ],
  colors: {
    'editor.background': '#1e1e1e',
    'editor.foreground': '#D4D4D4',
    'editor.lineHighlightBackground': '#2a2a2a',
    'editor.selectionBackground': '#264f78',
    'editor.inactiveSelectionBackground': '#3a3d41',
    'editorLineNumber.foreground': '#858585',
    'editorLineNumber.activeForeground': '#C6C6C6',
    'editorCursor.foreground': '#AEAFAD',
    'editor.selectionHighlightBackground': '#ADD6FF26',
    'editorIndentGuide.background': '#404040',
    'editorIndentGuide.activeBackground': '#707070',
    'editorBracketMatch.background': '#0064001a',
    'editorBracketMatch.border': '#888888',
    'editorGutter.background': '#1e1e1e',
    'editorWidget.background': '#252526',
    'editorSuggestWidget.background': '#252526',
    'editorSuggestWidget.border': '#454545',
    'editorSuggestWidget.selectedBackground': '#04395e',
    'list.hoverBackground': '#2a2d2e',
    'input.background': '#3c3c3c',
    'focusBorder': '#6366f1',
  },
});

// Configure TypeScript/JavaScript language service for full IntelliSense
// allowNonTsExtensions is critical — without it, in-memory models (no .js/.ts extension)
// won't get definition/reference/rename support from the TypeScript worker.
javascriptDefaults.setCompilerOptions({
  target: ScriptTarget.ESNext,
  module: ModuleKind.ESNext,
  allowNonTsExtensions: true,
  allowJs: true,
  checkJs: true,
  strict: false,
  noEmit: true,
  esModuleInterop: true,
  moduleResolution: ModuleResolutionKind.NodeJs,
  jsx: JsxEmit.React,
});

javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: false,
  noSyntaxValidation: false,
});

// Ensure all models are immediately synced to the TypeScript worker
// (required for Go to Definition, Peek, etc. to work)
javascriptDefaults.setEagerModelSync(true);
typescriptDefaults.setEagerModelSync(true);

typescriptDefaults.setCompilerOptions({
  target: ScriptTarget.ESNext,
  module: ModuleKind.ESNext,
  allowNonTsExtensions: true,
  allowJs: true,
  strict: false,
  noEmit: true,
  esModuleInterop: true,
  moduleResolution: ModuleResolutionKind.NodeJs,
  jsx: JsxEmit.React,
});

// Define VS Code "Light+" matching theme
monaco.editor.defineTheme('daakia-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'string.key.json',  foreground: '0451a5' },
    { token: 'string.value.json', foreground: 'a31515' },
    { token: 'number',            foreground: '09885a' },
    { token: 'keyword.json',      foreground: '0000ff' },
    { token: 'string',            foreground: 'a31515' },
    { token: 'keyword',           foreground: '0000ff' },
    { token: 'comment',           foreground: '008000' },
    { token: 'type',              foreground: '267f99' },
    { token: 'identifier',        foreground: '001080' },
    { token: 'variable',          foreground: '001080' },
    { token: 'constant',          foreground: '0070c1' },
    { token: 'keyword.js',        foreground: 'af00db' },
    { token: 'keyword.ts',        foreground: 'af00db' },
    { token: 'string.js',         foreground: 'a31515' },
    { token: 'string.ts',         foreground: 'a31515' },
    { token: 'number.js',         foreground: '09885a' },
    { token: 'number.ts',         foreground: '09885a' },
    { token: 'regexp',            foreground: 'c41a16' },
    { token: 'delimiter',         foreground: '000000' },
    { token: 'delimiter.bracket', foreground: '000000' },
    { token: 'tag',               foreground: '800000' },
    { token: 'attribute.name',    foreground: 'ff0000' },
    { token: 'attribute.value',   foreground: '0451a5' },
    { token: 'keyword.graphql',              foreground: 'af00db' },
    { token: 'type.identifier.graphql',      foreground: '267f99' },
    { token: 'variable.graphql',             foreground: '001080' },
    { token: 'string.graphql',               foreground: 'a31515' },
    { token: 'comment.graphql',              foreground: '008000' },
    { token: 'operator.graphql',             foreground: '000000' },
    { token: 'identifier.graphql',           foreground: '000000' },
  ],
  colors: {
    'editor.background':                   '#ffffff',
    'editor.foreground':                   '#000000',
    'editor.lineHighlightBackground':      '#f5f5f5',
    'editor.selectionBackground':          '#add6ff',
    'editor.inactiveSelectionBackground':  '#e5ebf1',
    'editorLineNumber.foreground':         '#237893',
    'editorLineNumber.activeForeground':   '#0b216f',
    'editorCursor.foreground':             '#000000',
    'editor.selectionHighlightBackground': '#add6ff4d',
    'editorIndentGuide.background1':       '#d3d3d3',
    'editorIndentGuide.activeBackground1': '#939393',
    'editorGutter.background':             '#ffffff',
    'editorWidget.background':             '#f3f3f3',
    'editorSuggestWidget.background':      '#f3f3f3',
    'editorSuggestWidget.border':          '#c8c8c8',
    'editorSuggestWidget.selectedBackground': '#0060c0',
    'list.hoverBackground':                '#f0f0f0',
    'input.background':                    '#ffffff',
    'input.border':                        '#d1d5db',
    'focusBorder':                         '#6366f1',
  },
});

loader.config({ monaco });

// Expose monaco globally for context menu access to editor instances
(window as any).monaco = monaco;

/** Call this whenever the app theme changes to re-theme all open Monaco editors */
export function applyMonacoTheme(theme: 'dark' | 'light') {
  monaco.editor.setTheme(theme === 'dark' ? 'daakia-dark' : 'daakia-light');
}

export { monaco };
