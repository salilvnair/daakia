/**
 * `{{` inside an editor, where the popup cannot go.
 *
 * Monaco draws its own text and owns its own completion widget, so the global
 * popup deliberately skips it (see editable-target.ts) — a list positioned
 * over the field would sit in the wrong place and fight the widget Monaco
 * already shows. It gets a real completion provider instead, offering exactly
 * the same vocabulary, so a body and a header field behave the same way.
 *
 * Registered once per Monaco instance, for every language a request body or
 * script is ever edited in.
 */
import { TEMPLATE_HELPERS } from '@daakia/template-catalog';
import { useEnvStore } from '../../store/env-store';
import { useCollectionsStore } from '../../store/collections-store';
import { useTabsStore } from '../../store/tabs-store';
import { useDynamicVarsStore } from '../../store/dynamic-vars-store';
import { openBraces, suggestionsFor, type VarSources } from './var-suggest';

/* eslint-disable @typescript-eslint/no-explicit-any */

const LANGUAGES = ['json', 'xml', 'html', 'javascript', 'typescript', 'graphql', 'plaintext', 'yaml'];

/*
  Which Monaco instances have been told, remembered on `window`.

  A provider registered twice offers every suggestion twice, and this has two
  callers — the root component and every CodeEditor mount — so the guard has
  to be real. It cannot live on the Monaco object: `window.monaco` is an ES
  module namespace, which is sealed, and assigning to it throws — silently
  killing the registration inside the retry loop below, which is exactly what
  it did. A module-level flag would not survive the dev server instantiating
  this file twice, so the set lives where both copies can see it.
*/
const REGISTERED = '__daakiaVarCompletionTargets';

function alreadyRegistered(monaco: unknown): boolean {
  const w = window as any;
  const seen: Set<unknown> = w[REGISTERED] ?? (w[REGISTERED] = new Set());
  if (seen.has(monaco)) return true;
  seen.add(monaco);
  return false;
}

/**
 * The sources, read at the moment the list opens rather than captured.
 *
 * A provider registered once would otherwise hold whichever environment was
 * active when the first editor mounted, and go on offering it after you
 * switched — a stale list that looks like the feature guessing.
 */
function currentSources(): VarSources {
  const { environments, activeEnvId } = useEnvStore.getState();
  const active = environments.find(e => e.id === activeEnvId);
  const global = environments.find(e => e.isGlobal);

  const seen = new Set<string>();
  const env: VarSources['env'] = [];
  for (const e of [active, global]) {
    for (const v of e?.variables ?? []) {
      if (!v.key || seen.has(v.key)) continue;
      seen.add(v.key);
      env.push({ key: v.key, value: v.currentValue || v.initialValue, isSecret: v.isSecret });
    }
  }

  const { tabs, activeTabId } = useTabsStore.getState();
  const tab = tabs.find(t => t.id === activeTabId);
  const collection = tab?.collectionId
    ? useCollectionsStore.getState().getVariables(tab.collectionId)
      .filter(v => v.key)
      .map(v => ({ key: v.key, value: v.value }))
    : [];

  return {
    env,
    collection,
    dynamic: useDynamicVarsStore.getState().variables,
    helpers: TEMPLATE_HELPERS,
  };
}

/**
 * Register against whichever Monaco the app loaded, without asking each editor.
 *
 * Roughly thirty components mount `EditorView` directly rather than through
 * the shared `CodeEditor`, so hooking the wrapper alone would give `{{`
 * completion in some editors and not others — and the ones it missed would
 * look exactly like the feature being broken. Monaco publishes itself on
 * `window`, and a provider is registered per language rather than per editor,
 * so one registration covers every editor that exists now or later.
 *
 * `CodeEditor` also calls `registerVarCompletions` on mount. That is not a
 * second mechanism: the flag below makes the first call win, and the mount
 * path is what covers the case where the global is not published.
 */
export function installVarCompletions(timeoutMs = 20000): void {
  const started = Date.now();
  const tick = () => {
    const monaco = (window as any).monaco;
    if (monaco?.languages?.registerCompletionItemProvider) {
      registerVarCompletions(monaco);
      return;
    }
    if (Date.now() - started < timeoutMs) setTimeout(tick, 250);
  };
  tick();
}

/** Has the Monaco the app is using been given the `{{` provider yet? */
export function varCompletionsRegistered(): boolean {
  const monaco = (window as any).monaco;
  return !!monaco && !!(window as any)[REGISTERED]?.has(monaco);
}

export function registerVarCompletions(monaco: any): void {
  if (!monaco?.languages?.registerCompletionItemProvider) return;
  if (alreadyRegistered(monaco)) return;

  for (const language of LANGUAGES) {
    monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ['{'],
      provideCompletionItems: (model: any, position: any) => {
        const line: string = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const open = openBraces(line);
        if (!open) return { suggestions: [] };

        /*
          The range starts at the braces, so accepting a suggestion replaces
          `{{ran` rather than appending to it. Monaco's own word-based range
          would stop at the `{`, which is how you end up with `{{ran{{random}}`.
        */
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: open.start + 1,
          endColumn: position.column,
        };

        const after: string = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: model.getLineMaxColumn(position.lineNumber),
        });
        const closing = /^\s*\}\}/.test(after) ? '' : '}}';

        return {
          suggestions: suggestionsFor(open.query, currentSources()).map((s, i) => ({
            label: s.label,
            kind: s.kind === 'helper'
              ? monaco.languages.CompletionItemKind.Function
              : monaco.languages.CompletionItemKind.Variable,
            detail: s.detail,
            documentation: s.group,
            insertText: `{{${s.insert}${closing}`,
            range,
            /* Preserve the order suggestionsFor decided on — Monaco sorts
               alphabetically otherwise, which buries your own variables. */
            sortText: String(i).padStart(4, '0'),
          })),
        };
      },
    });
  }
}
