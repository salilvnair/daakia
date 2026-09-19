/**
 * `{{variable}}` drawn as a token inside a Monaco editor.
 *
 * Every other field in the app renders one as a coloured chip — the URL bars
 * and, now, every key/value cell — because they share DUI's highlighted
 * editor. A JSON body is the one place the same string stayed plain grey
 * text, which made the body look like the odd one out rather than like the
 * same request.
 *
 * Monaco has no idea what a Daakia template is and no tokenizer for it: the
 * body is JSON, the script is JavaScript, and a `{{…}}` is a syntax error in
 * both. So this decorates instead of tokenizing — a range per match, restyled
 * by CSS class, applied on every content change.
 *
 * Decorations, not a custom language, because a body is still JSON and should
 * still be validated, folded and formatted as JSON. A language that tolerated
 * `{{…}}` would have to give all of that up.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const VAR = /\{\{[^{}\n]*\}\}/g;

/** The class index.css styles. Named for where it comes from, not its colour. */
const CLASS = 'dk-monaco-var';

const WATCHED = '__daakiaVarDecoratedEditors';

/**
 * Follow one editor for the life of its model.
 *
 * The collection is held per editor rather than recomputed from scratch:
 * `deltaDecorations` needs the previous ids to replace them, and forgetting
 * them leaves every old decoration behind on top of the new ones.
 */
function follow(editor: any): void {
  let ids: string[] = [];

  const paint = () => {
    const model = editor.getModel?.();
    if (!model) { ids = []; return; }

    const text: string = model.getValue();
    /* Nothing to do is the common case — a body with no template at all
       should not pay for a full scan of its own text on every keystroke. */
    if (!text.includes('{{')) {
      if (ids.length) ids = editor.deltaDecorations(ids, []);
      return;
    }

    const next: unknown[] = [];
    VAR.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = VAR.exec(text)) !== null) {
      const start = model.getPositionAt(m.index);
      const end = model.getPositionAt(m.index + m[0].length);
      next.push({
        range: {
          startLineNumber: start.lineNumber, startColumn: start.column,
          endLineNumber: end.lineNumber, endColumn: end.column,
        },
        options: { inlineClassName: CLASS, stickiness: 1 },
      });
      /* A zero-length match would spin here; `{{}}` is two characters wide so
         it cannot happen, but the guard costs nothing and the alternative is
         a frozen editor. */
      if (m.index === VAR.lastIndex) VAR.lastIndex++;
    }
    ids = editor.deltaDecorations(ids, next);
  };

  paint();
  editor.onDidChangeModelContent?.(paint);
  editor.onDidChangeModel?.(() => { ids = []; paint(); });
}

/**
 * Decorate every editor this Monaco has, and every one it makes later.
 *
 * Per editor rather than per language, because a decoration belongs to an
 * editor — unlike the completion provider, which is registered once for a
 * language and serves them all.
 */
export function installVarDecorations(monaco: any): void {
  if (!monaco?.editor?.getEditors) return;

  const w = window as any;
  const seen: Set<unknown> = w[WATCHED] ?? (w[WATCHED] = new Set());

  const start = (editor: any) => {
    if (!editor || seen.has(editor)) return;
    seen.add(editor);
    follow(editor);
  };

  for (const editor of monaco.editor.getEditors()) start(editor);
  monaco.editor.onDidCreateEditor?.(start);
}
