/**
 * The script, with a gutter that sets breakpoints — and the help an editor is
 * expected to give while writing it.
 *
 * The shared CodeEditor already draws breakpoints and the paused line for the
 * request-script debugger; this adds what a Python editor needs on top:
 *
 *   - the values beside the paused line, drawn as a Monaco `after` decoration,
 *     and a value on hover for any name or attribute chain while paused;
 *   - IntelliSense from the CONTAINER, not this machine: after a pause in
 *     typing the pod's own python3 parses the script and lists what its
 *     imports really hold (pod-pyintel). Its findings are the squiggles, its
 *     module members the completion list after a dot, and their signatures and
 *     first doc lines the hover;
 *   - AI ghost text, the grey suggestion Tab accepts — and after a comment
 *     line, the code the comment asks for, offered on the next line.
 */
import { useEffect, useRef, useState } from 'react';
import type { EditorOptions } from '@salilvnair/dui';
import { CodeEditor } from '../../shared/editors/CodeEditor';
import { usePyStore, evaluateInDebugger, type PyTarget } from '../../../store/dk8s-python-store';
import {
  usePyIntelStore, intelKey, membersOf, builtinsOf, chainModule, type IntelMember,
} from '../../../store/dk8s-py-intel-store';
import { useAiPromptTemplatesStore } from '../../../store/prompt-template';
import { askOnce } from '../../../services/ai/ai-once';
import { usePyGhost, ghostOn } from './ghost-toggle';
import { inlineValues, hoverExprAt, ghostPrompt, cleanGhost } from './py-view';

/* The selected text of each open script's editor — what Ask AI means by "these lines". */
const selections = new Map<string, () => string>();
export function selectionOf(scriptId: string): string {
  return selections.get(scriptId)?.() ?? '';
}

/** How long typing must pause before the container is asked again. */
const CHECK_AFTER_MS = 900;
/** And before the model is asked for ghost text — shorter, it is what the reader is waiting on. */
const GHOST_AFTER_MS = 450;

/**
 * Passed through dui, which re-applies its options on every keystroke — set
 * with `updateOptions` at mount they were undone by the next character.
 *
 * Quick suggestions only in code, and only for what the container knows (no
 * list of every word in the file): an open suggest list hides ghost text, so
 * a list on every word typed meant the AI's suggestion almost never showed.
 */
const PY_OPTIONS = {
  quickSuggestions: { other: 'on', comments: 'off', strings: 'off' },
} as unknown as EditorOptions;

export function PyEditor({ scriptId, readOnly, reveal, target, pythonVersion }: {
  scriptId: string;
  readOnly?: boolean;
  /** A line to scroll to — from Problems. `n` makes a second click on the same line count. */
  reveal?: { line: number; n: number };
  /** The container that checks it and that the ghost text is written for. Absent: no checks. */
  target?: PyTarget;
  pythonVersion?: string;
}) {
  const source = usePyStore(s => s.drafts[scriptId]?.source ?? s.scripts.find(x => x.id === scriptId)?.source ?? '');
  const editSource = usePyStore(s => s.editSource);
  const breakpoints = usePyStore(s => s.breakpoints[scriptId]);
  const disabled = usePyStore(s => s.disabledBreakpoints[scriptId]);
  const toggle = usePyStore(s => s.toggleBreakpoint);
  const debug = usePyStore(s => s.debug);
  const intel = usePyIntelStore(s => s.byScript[scriptId]);
  const analyze = usePyIntelStore(s => s.analyze);

  /* Paused here only when the debugger is in THIS script, at a line of this
     file — a step into the standard library is paused somewhere else. */
  const mine = debug && !debug.ended && debug.scriptId === scriptId;
  const loc = mine && debug.state.status === 'paused' ? debug.state.location : undefined;
  const pausedLine = loc && debug && (!debug.path || loc.file === debug.path) ? loc.line : null;

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decoRef = useRef<any>(null);
  const disposers = useRef<{ dispose: () => void }[]>([]);
  /* The providers are registered once per editor and read these at call time. */
  const live = useRef({ scriptId, target, pythonVersion });
  live.current = { scriptId, target, pythonVersion };
  /* Bumped when Monaco hands over an editor; the effect below registers the
     providers against it. */
  const [mounted, setMounted] = useState(0);

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

  /* Ask the container again after a pause in typing — never on every key. */
  const tKey = target ? intelKey(target) : '';
  useEffect(() => {
    if (!target || readOnly) return;
    const timer = setTimeout(() => analyze(target, scriptId, source), CHECK_AFTER_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, tKey, scriptId, readOnly]);

  /* Its findings, as squiggles. Stale ones go when the container has no answer. */
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!monaco || !model) return;
    const diags = intel && intel.key === tKey ? intel.diagnostics : [];
    monaco.editor.setModelMarkers(model, 'pod-python', diags
      .filter(d => d.line <= model.getLineCount())
      .map(d => ({
        startLineNumber: d.line, startColumn: d.col,
        endLineNumber: d.line, endColumn: Math.max(d.endCol, d.col + 1),
        message: d.message,
        source: `python ${intel?.version ?? ''} in the pod`.replace('  ', ' '),
        severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      })));
  }, [intel, tKey]);

  const templates = useAiPromptTemplatesStore(s => s.resolve);
  const resolveRef = useRef(templates);
  resolveRef.current = templates;

  /*
    The hover, completion and ghost-text providers, registered from an effect
    and not from Monaco's mount callback. Registered at mount and disposed by
    an unmount effect, they were lost for good whenever React ran that
    cleanup without a new mount — every hot reload, and StrictMode's second
    pass — and ghost text silently stopped. An effect's cleanup is always
    followed by its setup again, so here they come back.
  */
  const register = (editor: any, monaco: any) => {
    decoRef.current = editor.createDecorationsCollection([]);
    selections.set(live.current.scriptId, () => {
      const sel = editor.getSelection();
      const model = editor.getModel();
      return sel && model && !sel.isEmpty() ? model.getValueInRange(sel) : '';
    });
    for (const d of disposers.current) d.dispose();
    disposers.current = [];
    /* Not among the options dui re-applies, so set once here they stay set. */
    editor.updateOptions({
      inlineSuggest: {
        enabled: true, showToolbar: 'onHover',
        /* Monaco hides ghost text while the suggest list is open; with the
           list opening as names are typed, the AI's line almost never showed.
           Both at once, as in VS Code with Copilot. */
        experimental: { showOnSuggestConflict: 'always' },
      },
      wordBasedSuggestions: 'off',
    });

    const ours = (model: any) => model === editor.getModel();
    const intelNow = () => {
      const { scriptId: id, target: t } = live.current;
      const i = usePyIntelStore.getState().byScript[id];
      return t && i && i.key === intelKey(t) ? i : undefined;
    };

    /*
      Values and docs on hover. While paused: the value in the paused frame —
      a plain name from the variables already read, an attribute chain asked
      of pdb once per stop. Otherwise: what the container says the member is.
    */
    disposers.current.push(monaco.languages.registerHoverProvider('python', {
      provideHover: async (model: any, position: any) => {
        if (!ours(model)) return null;
        const at = hoverExprAt(model.getLineContent(position.lineNumber), position.column);
        if (!at) return null;
        const range = new monaco.Range(position.lineNumber, at.start, position.lineNumber, at.end);
        const fence = (t: string) => ['```python', t, '```'].join('\n');
        const d = usePyStore.getState().debug;
        if (d && !d.ended && d.scriptId === live.current.scriptId && d.state.status === 'paused') {
          const known = !at.expr.includes('.')
            ? [...d.state.locals, ...d.state.globals].find(v => v.name === at.expr)
            : undefined;
          const r = known ? { type: known.type, value: known.value } : await evaluateInDebugger(at.expr);
          if (r.error === 'not paused' || r.error === 'busy') return null;
          return {
            range,
            contents: r.error
              ? [{ value: `**${at.expr}** — ${r.error}` }]
              : [{ value: `**${at.expr}** \`${r.type ?? ''}\`` }, { value: fence(r.value ?? '') }],
          };
        }
        const i = intelNow();
        if (!i || !live.current.target) return null;
        const m = memberAt(at.expr, i.aliases, intelKey(live.current.target));
        if (!m) return null;
        const [name, kind, sig, doc] = m;
        return {
          range,
          contents: [
            { value: fence(kind === 'function' || kind === 'class' ? `${kind === 'class' ? 'class ' : 'def '}${name}${sig}` : `${name}: ${doc}`) },
            ...(kind !== 'variable' && doc ? [{ value: doc }] : []),
            { value: `_from python ${i.version ?? ''} in the pod_` },
          ],
        };
      },
    }));

    /* Completion: after a dot, the module's real members; otherwise names, builtins, keywords. */
    const KIND: Record<string, number> = {
      module: monaco.languages.CompletionItemKind.Module,
      class: monaco.languages.CompletionItemKind.Class,
      function: monaco.languages.CompletionItemKind.Function,
      variable: monaco.languages.CompletionItemKind.Variable,
      keyword: monaco.languages.CompletionItemKind.Keyword,
    };
    disposers.current.push(monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.'],
      provideCompletionItems: (model: any, position: any) => {
        if (!ours(model)) return { suggestions: [] };
        const i = intelNow();
        const t = live.current.target;
        if (!i || !t) return { suggestions: [] };
        const key = intelKey(t);
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
        const dotted = /([A-Za-z_][\w.]*)\.$/.exec(before);
        const item = (m: IntelMember, sort: string) => ({
          label: m[0],
          kind: KIND[m[1]] ?? KIND.variable,
          detail: m[1] === 'function' || m[1] === 'class' ? `${m[0]}${m[2]}` : m[3],
          documentation: m[1] === 'function' || m[1] === 'class' ? m[3] : undefined,
          insertText: m[0],
          range,
          sortText: `${sort}${m[0].startsWith('_') ? 'z' : 'a'}${m[0]}`,
        });
        if (dotted) {
          const mod = chainModule(dotted[1], i.aliases);
          const list = mod ? membersOf(key, mod) : undefined;
          return { suggestions: (list ?? []).map(m => item(m, '0')) };
        }
        const own: IntelMember[] = [
          ...Object.keys(i.aliases).map(a => [a, 'module', '', i.aliases[a]] as IntelMember),
          ...i.defined.filter(n => !(n in i.aliases)).map(n => [n, 'variable', '', ''] as IntelMember),
        ];
        return { suggestions: [...own.map(m => item(m, '0')), ...builtinsOf(key).map(m => item(m, '1'))] };
      },
    }));

    /*
      Ghost text. Asked after a short pause, with the code either side of the
      cursor; Monaco cancels the request the moment the reader types on, and
      the answer is dropped. An empty line right after a comment counts — that
      is where "write the code this comment describes" happens.
    */
    let lastAsk: { key: string; text: Promise<string> } | undefined;
    disposers.current.push(monaco.languages.registerInlineCompletionsProvider('python', {
      provideInlineCompletions: async (model: any, position: any, _ctx: any, token: any) => {
        if (!ours(model) || readOnly || !ghostOn()) return { items: [] };
        const d = usePyStore.getState().debug;
        if (d && !d.ended && d.state.status === 'paused') return { items: [] };
        const line = model.getLineContent(position.lineNumber);
        const after = line.slice(position.column - 1);
        /* Mid-line, with code after the cursor, a suggestion would have to rewrite it. */
        if (after.trim() && !/^[)\]}'":,\s]*$/.test(after)) return { items: [] };
        const prompt = ghostPrompt(model.getValue(), model.getOffsetAt(position));
        if (!prompt) return { items: [] };
        await new Promise(r => setTimeout(r, GHOST_AFTER_MS));
        if (token.isCancellationRequested) return { items: [] };
        const i = intelNow();
        const key = `${prompt.prefix}\u0000${prompt.suffix}`;
        if (lastAsk?.key !== key) {
          const resolve = resolveRef.current;
          const vars = {
            pythonVersion: live.current.pythonVersion ?? 'the container’s',
            container: live.current.target?.container ?? 'the pod’s default container',
          };
          const ask = askOnce({
            stage: 'dk8s.python.complete',
            screen: 'dk8s · Python',
            systemPrompts: [resolve('dk8s.python.complete.system', vars)],
            userPrompt: resolve('dk8s.python.complete', {
              prefix: prompt.prefix,
              suffix: prompt.suffix || '(end of file)',
              imports: i ? Object.entries(i.aliases).map(([a, m]) => (a === m ? m : `${a} = ${m}`)).join(', ') || 'none' : 'unknown',
            }),
            /* No thinking: a thinking model spent all 300 tokens reasoning
               and answered with nothing, so no ghost text ever showed. */
            settings: { temperature: 0.1, maxTokens: 300, responseFormat: 'text', thinking: 'off' },
          }, 15_000);
          token.onCancellationRequested?.(() => ask.cancel());
          lastAsk = { key, text: ask.text };
        }
        let text = '';
        try { text = await lastAsk.text; } catch { lastAsk = undefined; return { items: [] }; }
        if (token.isCancellationRequested) return { items: [] };
        const insert = cleanGhost(text, line.slice(0, position.column - 1));
        if (!insert) return { items: [] };
        return {
          items: [{
            insertText: insert,
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
          }],
        };
      },
      /* Monaco 0.55 calls `disposeInlineCompletions`; without it the call throws
         when a suggestion is about to show, and the ghost text never appears.
         `freeInlineCompletions` is the older name, kept for older builds. */
      disposeInlineCompletions: () => {},
      freeInlineCompletions: () => {},
    }));

    /* Switched off: the suggestion on screen goes with it. */
    const unsub = usePyGhost.subscribe(s => { if (!s.on) editor.trigger('ghost', 'editor.action.inlineSuggest.hide', {}); });
    disposers.current.push({ dispose: unsub });

    /* Enter after a comment: ask straight away for the code it describes. */
    disposers.current.push(editor.onDidChangeModelContent((e: any) => {
      if (!e.changes?.some((c: any) => c.text.includes('\n'))) return;
      const pos = editor.getPosition();
      const model = editor.getModel();
      if (!pos || !model || pos.lineNumber < 2) return;
      if (ghostOn() && /^\s*#/.test(model.getLineContent(pos.lineNumber - 1))) {
        setTimeout(() => editor.trigger('comment', 'editor.action.inlineSuggest.trigger', {}), 0);
      }
    }));
  };

  const onMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setMounted(n => n + 1);
  };

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    register(editor, monaco);
    return () => { for (const d of disposers.current) d.dispose(); disposers.current = []; };
    // Once per editor: `register` reads what changes through `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

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
      onEditorMount={onMount}
      /* Monaco's own right-click menu off: the tab's dui menu (py-menu.tsx)
         answers instead, with Find, Replace and the rest in it. */
      contextMenuMode="none"
      editorOptions={PY_OPTIONS}
    />
  );
}

/** What the container says a name or chain is: `os.environ` → the `environ` member of `os`. */
function memberAt(expr: string, aliases: Record<string, string>, key: string): IntelMember | undefined {
  const parts = expr.split('.');
  if (parts.length === 1) {
    const mod = aliases[expr];
    return mod ? [expr, 'module', '', mod] : undefined;
  }
  const owner = chainModule(parts.slice(0, -1).join('.'), aliases);
  if (!owner) return undefined;
  return membersOf(key, owner)?.find(m => m[0] === parts[parts.length - 1]);
}
