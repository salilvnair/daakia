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
import { installVarDecorations } from './monaco-var-decorations';
import { installVarMarkerFilter } from './monaco-var-markers';

/* eslint-disable @typescript-eslint/no-explicit-any */

const LANGUAGES = ['json', 'xml', 'html', 'javascript', 'typescript', 'graphql', 'plaintext', 'yaml'];

/**
 * How each kind is shown, as close to the popup as Monaco's widget allows.
 *
 * The widget has no section headings — it is one flat list and there is no
 * API for a divider in it. What it does have is three slots per row and an
 * icon, so the grouping is carried by those instead: a different icon per
 * kind, the popup's own short word (`var`, `secret`, `dyn`, `fn`) right after
 * the name, and the value or summary right-aligned. Same information, same
 * reading order, one list.
 *
 * The icons are Monaco's own, chosen for how they read rather than for what
 * they are named: a variable is a variable, a secret is a constant you should
 * not look at, a dynamic value is a value, a helper is a function.
 */
const KIND_ICON: Record<string, string> = {
  variable: 'Variable',
  secret: 'Constant',
  dynamic: 'Value',
  helper: 'Function',
};

const KIND_WORD: Record<string, string> = {
  variable: 'var',
  secret: 'secret',
  dynamic: 'dyn',
  helper: 'fn',
};

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
      /* The other half of the same job: offering `{{` and then drawing what
         it produced the way every other field draws it. */
      installVarDecorations(monaco);
      /* And stop the JSON service calling a template a syntax error. */
      installVarMarkerFilter(monaco);
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
          The range starts AFTER the braces, and this is load bearing.

          Monaco filters what a provider returns against the text inside the
          replace range. With the range starting at `{{`, the filter text was
          `{{ran` — which no label contains — so every item was thrown away
          and the widget said "No suggestions" while the provider was
          returning fifty. Starting after the braces makes the filter text
          `ran`, which is what the labels are meant to be matched against.

          The braces are therefore left in place and the insert text does not
          repeat them.
        */
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: open.start + 3,
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
            /*
              The three-part label is what gets this close to the popup:
              `label` is the name, `detail` sits against it in a dimmer weight,
              and `description` is right-aligned at the end of the row.
            */
            label: {
              label: s.label,
              detail: `  ${KIND_WORD[s.kind]}`,
              description: s.detail,
            },
            kind: monaco.languages.CompletionItemKind[KIND_ICON[s.kind]],
            detail: s.detail,
            documentation: { value: `**${s.group}** — ${s.detail}` },
            insertText: `${s.insert}${closing}`,
            /* What Monaco matches the typed text against — the name without
               its braces, which is what somebody is typing. */
            filterText: s.insert,
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
