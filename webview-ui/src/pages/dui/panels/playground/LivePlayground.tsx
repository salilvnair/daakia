import { useState, useEffect, useRef, useCallback } from 'react';
import MonacoEditor, { type OnMount } from '@monaco-editor/react';
import { CodeIcon, RefreshIcon, PaletteIcon } from '../../../../icons';
import { LiveColorCustomizer } from '../../../../dui';
import type { LiveColorVar } from '../../../../dui';
import { ErrorBoundary } from './ErrorBoundary';
import { buildAndEval } from './buildAndEval';
import * as ReactNS from 'react';

export interface LivePlaygroundProps {
  code: string;
  /** Real React component from the panel — shown when eval fails or not yet run. */
  content: ReactNS.ReactNode;
  themeMode: 'light' | 'dark' | 'system';
  vars?: LiveColorVar[];
}

export function LivePlayground({ code: initialCode, content, themeMode, vars }: LivePlaygroundProps) {
  const [code, setCode] = useState(initialCode);
  const [PreviewComp, setPreviewComp] = useState<ReactNS.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(true);   // open by default
  const [colorsOpen, setColorsOpen] = useState(false);
  const [ebKey, setEbKey] = useState(0);
  // Scoped color overrides — applied ONLY to the preview pane, not the whole page
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const prevErrorRef = useRef(false);

  const handleVarChange = useCallback((cssVar: string, value: string | null) => {
    setColorOverrides(prev => {
      if (value === null) {
        const next = { ...prev };
        delete next[cssVar];
        return next;
      }
      return { ...prev, [cssVar]: value };
    });
  }, []);

  const evaluate = useCallback((src: string, forceKey = false) => {
    const { Component, error: err } = buildAndEval(src);
    const wasError = prevErrorRef.current;
    prevErrorRef.current = !!err;

    setPreviewComp(() => Component as ReactNS.ComponentType | null);
    setError(err);

    // Only remount ErrorBoundary when: explicitly forced (Run button) OR recovering from error
    // This prevents Monaco-inside-EditorView from flashing on every debounced eval
    if (forceKey || (wasError && !err)) {
      setEbKey(k => k + 1);
    }
  }, []);

  // Debounced re-eval on every keystroke (always active when editor is open)
  useEffect(() => {
    if (!editorOpen) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => evaluate(code), 400);
    return () => clearTimeout(debounceRef.current);
  }, [code, evaluate, editorOpen]);

  // Immediate eval when editor opens (so right pane is never blank)
  useEffect(() => {
    if (editorOpen) evaluate(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorOpen]);

  const isDark = themeMode !== 'light';
  const hasVars = (vars?.length ?? 0) > 0;
  const anyOpen = editorOpen || colorsOpen;

  const handleMount: OnMount = (_editor, monaco) => {
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      jsx: monaco.languages.typescript.JsxEmit.React,
      jsxFactory: 'React.createElement',
      reactNamespace: 'React',
      allowSyntheticDefaultImports: true,
      target: monaco.languages.typescript.ScriptTarget.ES2015,
    });
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });
  };

  const btnBase: ReactNS.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 120ms',
    border: '1px solid var(--color-surface-border)',
  };

  // Right pane: show eval'd component if available, fall back to real content on error/null
  const rightPane = error ? (
    <>
      <pre style={{
        color: 'var(--color-error)', fontSize: 10.5, whiteSpace: 'pre-wrap',
        margin: 0, lineHeight: 1.6, padding: '10px 12px', borderRadius: 6,
        background: 'color-mix(in srgb, var(--color-error) 7%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-error) 18%, transparent)',
        width: '100%', boxSizing: 'border-box' as const,
      }}>
        {error}
      </pre>
    </>
  ) : PreviewComp ? (
    <ErrorBoundary key={ebKey}>
      <PreviewComp />
    </ErrorBoundary>
  ) : (
    // Eval not ready yet — show real component as placeholder
    <div style={{ opacity: 0.6 }}>{content}</div>
  );

  return (
    <div style={{ marginBottom: anyOpen ? 20 : 0 }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        marginBottom: anyOpen ? 14 : 0,
      }}>

        {/* Edit & Preview toggle */}
        <button
          type="button"
          onClick={() => setEditorOpen(v => !v)}
          style={{
            ...btnBase,
            background: editorOpen
              ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)'
              : 'var(--color-surface)',
            borderColor: editorOpen
              ? 'color-mix(in srgb, var(--color-primary) 28%, transparent)'
              : 'var(--color-surface-border)',
            color: editorOpen ? 'var(--color-primary)' : 'var(--color-text-muted)',
          }}
        >
          <CodeIcon size={13} />
          {editorOpen ? 'Hide Editor' : 'Edit & Preview'}
        </button>

        {/* Run (only when editor open) */}
        {editorOpen && (
          <button
            type="button"
            onClick={() => evaluate(code, true)}
            style={{
              ...btnBase,
              background: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--color-primary)';
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary) 28%, transparent)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--color-text-muted)';
              e.currentTarget.style.borderColor = 'var(--color-surface-border)';
            }}
          >
            <RefreshIcon size={13} />
            Run
          </button>
        )}

        {/* Customize Colors */}
        {hasVars && (
          <button
            type="button"
            onClick={() => setColorsOpen(v => !v)}
            style={{
              ...btnBase,
              background: colorsOpen
                ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)'
                : 'var(--color-surface)',
              borderColor: colorsOpen
                ? 'color-mix(in srgb, var(--color-primary) 28%, transparent)'
                : 'var(--color-surface-border)',
              color: colorsOpen ? 'var(--color-primary)' : 'var(--color-text-muted)',
            }}
          >
            <PaletteIcon size={12} />
            {colorsOpen ? 'Hide Colors' : 'Customize Colors'}
          </button>
        )}

        {editorOpen && (
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 4 }}>
            Edit JSX → preview updates live
          </span>
        )}
      </div>

      {/* ── Color picker panel — changes scoped to preview pane only ── */}
      {colorsOpen && vars && (
        <div style={{ marginBottom: editorOpen ? 12 : 0 }}>
          <LiveColorCustomizer vars={vars} forceOpen onVarChange={handleVarChange} />
        </div>
      )}

      {/* ── Split pane (Monaco + live preview) ── */}
      {editorOpen && (
        <div style={{
          display: 'flex', flexDirection: 'row',
          border: '1px solid var(--color-surface-border)',
          borderRadius: 10, overflow: 'hidden',
          minHeight: 300,
        }}>

          {/* Monaco — left 50% */}
          <div style={{
            flex: '0 0 50%', maxWidth: '50%', minWidth: 0,
            borderRight: '1px solid var(--color-surface-border)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '6px 12px', flexShrink: 0,
              fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
              textTransform: 'uppercase', color: 'var(--color-text-muted)',
              background: isDark
                ? 'color-mix(in srgb, var(--color-surface) 60%, #000)'
                : 'var(--color-surface)',
              borderBottom: '1px solid var(--color-surface-border)',
            }}>
              JSX
            </div>
            <div style={{ flex: 1 }}>
              <MonacoEditor
                height={340}
                language="typescript"
                value={code}
                onChange={v => setCode(v ?? '')}
                theme={isDark ? 'vs-dark' : 'light'}
                onMount={handleMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineHeight: 19,
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  lineNumbers: 'on',
                  folding: false,
                  renderLineHighlight: 'line',
                  padding: { top: 12, bottom: 12 },
                  automaticLayout: true,
                  tabSize: 2,
                  scrollbar: { vertical: 'auto', horizontal: 'hidden' },
                  suggest: { showKeywords: false },
                  quickSuggestions: false,
                  overviewRulerLanes: 0,
                }}
              />
            </div>
          </div>

          {/* Live preview — right 50% */}
          <div style={{
            flex: '0 0 50%', maxWidth: '50%', minWidth: 0,
            display: 'flex', flexDirection: 'column',
            background: 'var(--color-panel)',
          }}>
            <div style={{
              padding: '6px 12px', flexShrink: 0,
              fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
              textTransform: 'uppercase', color: 'var(--color-text-muted)',
              background: 'var(--color-surface)',
              borderBottom: '1px solid var(--color-surface-border)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              Preview
              {!error && PreviewComp && (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--color-success)',
                  boxShadow: '0 0 0 2px color-mix(in srgb, var(--color-success) 25%, transparent)',
                }} />
              )}
              {error && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-error)' }} />
              )}
            </div>

            {/* colorOverrides applied as scoped inline CSS vars — ONLY this div and its children inherit them */}
            <div style={{
              flex: 1, padding: 20, overflow: 'auto',
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
              ...colorOverrides as React.CSSProperties,
            }}>
              {rightPane}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
