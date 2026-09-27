/**
 * The script, with a gutter that sets breakpoints.
 *
 * The shared CodeEditor already draws breakpoints and the paused line for the
 * request-script debugger; this adds only what pdb gives that one does not:
 * the values beside the paused line, drawn as a Monaco `after` decoration so
 * they sit on the line without being part of the text.
 */
import { useEffect, useRef } from 'react';
import { CodeEditor } from '../../shared/editors/CodeEditor';
import { usePyStore } from '../../../store/dk8s-python-store';
import { inlineValues } from './py-view';

export function PyEditor({ scriptId, readOnly, reveal }: {
  scriptId: string;
  readOnly?: boolean;
  /** A line to scroll to — from Problems. `n` makes a second click on the same line count. */
  reveal?: { line: number; n: number };
}) {
  const source = usePyStore(s => s.drafts[scriptId]?.source ?? s.scripts.find(x => x.id === scriptId)?.source ?? '');
  const editSource = usePyStore(s => s.editSource);
  const breakpoints = usePyStore(s => s.breakpoints[scriptId]);
  const disabled = usePyStore(s => s.disabledBreakpoints[scriptId]);
  const toggle = usePyStore(s => s.toggleBreakpoint);
  const debug = usePyStore(s => s.debug);

  /* Paused here only when the debugger is in THIS script, at a line of this
     file — a step into the standard library is paused somewhere else. */
  const mine = debug && !debug.ended && debug.scriptId === scriptId;
  const loc = mine && debug.state.status === 'paused' ? debug.state.location : undefined;
  const pausedLine = loc && debug && (!debug.path || loc.file === debug.path) ? loc.line : null;

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decoRef = useRef<any>(null);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    decoRef.current ??= editor.createDecorationsCollection([]);
    if (!pausedLine || !debug) { decoRef.current.set([]); return; }
    const model = editor.getModel();
    if (!model || pausedLine > model.getLineCount()) { decoRef.current.set([]); return; }
    const text = inlineValues(model.getLineContent(pausedLine), [...debug.state.locals, ...debug.state.globals]);
    if (!text) { decoRef.current.set([]); return; }
    const col = model.getLineMaxColumn(pausedLine);
    decoRef.current.set([{
      range: new monaco.Range(pausedLine, col, pausedLine, col),
      options: { after: { content: text, inlineClassName: 'dk-py-inline-value' } },
    }]);
  }, [pausedLine, debug]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !reveal) return;
    editor.revealLineInCenter(reveal.line);
    editor.setPosition({ lineNumber: reveal.line, column: 1 });
    editor.focus();
  }, [reveal]);

  return (
    <CodeEditor
      value={source}
      onChange={readOnly ? undefined : (v) => editSource(scriptId, v)}
      language="python"
      readOnly={readOnly}
      height="100%"
      fontSize={12.5}
      breakpoints={breakpoints ?? []}
      disabledBreakpoints={disabled ?? []}
      pausedLine={pausedLine}
      onToggleBreakpoint={(line) => toggle(scriptId, line)}
      onEditorMount={(editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        decoRef.current = editor.createDecorationsCollection([]);
      }}
    />
  );
}
