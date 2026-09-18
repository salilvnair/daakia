import { describe, it, expect, beforeEach } from 'vitest';
import { registerVarCompletions, varCompletionsRegistered } from './monaco-var-completions';
import { useEnvStore } from '../../store/env-store';
import { useDynamicVarsStore } from '../../store/dynamic-vars-store';

/*
  The provider is exercised against a stub Monaco rather than a real editor:
  what is worth testing here is the range arithmetic and where the suggestions
  come from, and neither needs a canvas.
*/
interface Provider {
  triggerCharacters: string[];
  provideCompletionItems: (model: unknown, position: unknown) => {
    suggestions: { label: string; insertText: string; range: { startColumn: number }; sortText: string }[];
  };
}

function stubMonaco() {
  const providers: Record<string, Provider> = {};
  return {
    providers,
    monaco: {
      languages: {
        CompletionItemKind: { Function: 1, Variable: 4 },
        registerCompletionItemProvider: (lang: string, p: Provider) => { providers[lang] = p; },
      },
    },
  };
}

function modelFor(line: string) {
  return {
    getValueInRange: ({ startColumn, endColumn }: { startColumn: number; endColumn: number }) =>
      line.slice(startColumn - 1, endColumn - 1),
    getLineMaxColumn: () => line.length + 1,
  };
}

function complete(providers: Record<string, Provider>, line: string, column = line.length + 1) {
  return providers.json.provideCompletionItems(modelFor(line), { lineNumber: 1, column }).suggestions;
}

describe('{{ inside an editor', () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).__daakiaVarCompletionTargets = new Set();
    useEnvStore.setState({
      environments: [{ id: 'e1', name: 'Dev', variables: [
        { id: 'v1', key: 'base-url', initialValue: '', currentValue: 'https://api.test', isSecret: false },
      ] }],
      activeEnvId: 'e1',
    } as never);
    useDynamicVarsStore.setState({
      variables: [{ name: 'randomUUID', description: 'A random UUID', category: 'identity' }],
    });
  });

  it('registers for every language a body or script is edited in', () => {
    const { providers, monaco } = stubMonaco();
    registerVarCompletions(monaco);
    expect(Object.keys(providers)).toEqual(
      ['json', 'xml', 'html', 'javascript', 'typescript', 'graphql', 'plaintext', 'yaml'],
    );
    expect(providers.json.triggerCharacters).toEqual(['{']);
  });

  it('registers once, however many editors mount', () => {
    /*
      Two callers — the root component and every CodeEditor mount — and a
      provider registered twice offers every suggestion twice.
    */
    const { providers, monaco } = stubMonaco();
    let count = 0;
    monaco.languages.registerCompletionItemProvider = (lang: string, p: Provider) => {
      count++; providers[lang] = p;
    };
    registerVarCompletions(monaco);
    registerVarCompletions(monaco);
    registerVarCompletions(monaco);
    expect(count).toBe(8);
  });

  it('survives a Monaco namespace that cannot be written to', () => {
    /*
      `window.monaco` is an ES module namespace object — sealed. An earlier
      version kept the "already registered" flag on it, and the assignment
      threw inside the retry loop, so completion worked in every plain input
      and never in an editor.
    */
    const { monaco } = stubMonaco();
    const sealed = Object.freeze(monaco);
    expect(() => registerVarCompletions(sealed)).not.toThrow();
  });

  it('offers nothing when the caret is not inside braces', () => {
    const { providers, monaco } = stubMonaco();
    registerVarCompletions(monaco);
    expect(complete(providers, '{"token":"abc')).toEqual([]);
    expect(complete(providers, '{"token":"{{done}}"')).toEqual([]);
  });

  it('replaces from the braces, not from the word', () => {
    // Monaco's own word-based range stops at the `{`, which is how you get
    // `{{ran{{randomUUID}}`.
    const { providers, monaco } = stubMonaco();
    registerVarCompletions(monaco);
    const line = '{"token":"{{ran';
    const [first] = complete(providers, line);
    expect(first.range.startColumn).toBe(line.indexOf('{{') + 1);
    expect(first.insertText.startsWith('{{')).toBe(true);
  });

  it('closes the braces, unless the line already does', () => {
    const { providers, monaco } = stubMonaco();
    registerVarCompletions(monaco);
    expect(complete(providers, '"{{base')[0].insertText).toBe('{{base-url}}');
    const closed = '"{{base}}"';
    expect(complete(providers, closed, closed.indexOf('}}') + 1)[0].insertText).toBe('{{base-url');
  });

  it('offers the environment, the dynamic values and the helpers together', () => {
    const { providers, monaco } = stubMonaco();
    registerVarCompletions(monaco);
    const labels = complete(providers, '"{{').map(s => s.label);
    expect(labels).toContain('base-url');
    expect(labels).toContain('$randomUUID');
    expect(labels).toContain('randomInt');
  });

  it('keeps its own ordering instead of Monaco s alphabetical one', () => {
    const { providers, monaco } = stubMonaco();
    registerVarCompletions(monaco);
    const items = complete(providers, '"{{');
    expect(items[0].label).toBe('base-url');
    expect(items.map(s => s.sortText)).toEqual([...items.map(s => s.sortText)].sort());
  });

  it('reads the environment at the moment the list opens', () => {
    /*
      Registered once, for the life of the app — so capturing the environment
      at registration would go on offering whichever one was active when the
      first editor mounted.
    */
    const { providers, monaco } = stubMonaco();
    registerVarCompletions(monaco);
    expect(complete(providers, '"{{').map(s => s.label)).toContain('base-url');

    useEnvStore.setState({
      environments: [{ id: 'e2', name: 'Prod', variables: [
        { id: 'v2', key: 'prod-url', initialValue: '', currentValue: 'https://api.prod', isSecret: false },
      ] }],
      activeEnvId: 'e2',
    } as never);

    const after = complete(providers, '"{{').map(s => s.label);
    expect(after).toContain('prod-url');
    expect(after).not.toContain('base-url');
  });

  it('reports whether the app s own Monaco has been told', () => {
    expect(varCompletionsRegistered()).toBe(false);
    const { monaco } = stubMonaco();
    (window as unknown as Record<string, unknown>).monaco = monaco;
    registerVarCompletions(monaco);
    expect(varCompletionsRegistered()).toBe(true);
  });
});
