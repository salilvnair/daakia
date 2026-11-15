/**
 * The script editor's checker, told what the runtime does.
 *
 * Daakia runs a script as the body of an async function. Checked as a plain
 * file, `await dk.sendRequest(...)`, an early `return` and
 * `require('querystring')` were all underlined red — in code that runs.
 */
import { describe, it, expect } from 'vitest';
import { registerDkLanguageSupport, DK_TYPE_DEFS, SCRIPT_BODY_DIAGNOSTICS } from './dk-repl';

function fakeMonaco() {
  const calls = { libs: [] as string[], diagnostics: [] as Record<string, unknown>[] };
  const monaco = {
    languages: {
      typescript: {
        javascriptDefaults: {
          addExtraLib: (content: string) => { calls.libs.push(content); },
          getDiagnosticsOptions: () => ({ noSemanticValidation: false, diagnosticCodesToIgnore: [6133] }),
          setDiagnosticsOptions: (o: Record<string, unknown>) => { calls.diagnostics.push(o); },
        },
      },
      registerCompletionItemProvider: () => ({ dispose() {} }),
    },
  };
  return { monaco, calls };
}

describe('the script editor', () => {
  it('does not mark top-level await or return as errors, and keeps what was already set', () => {
    const { monaco, calls } = fakeMonaco();
    registerDkLanguageSupport(monaco);
    expect(calls.diagnostics).toHaveLength(1);
    const opts = calls.diagnostics[0];
    expect(opts.noSemanticValidation).toBe(false);
    expect(opts.diagnosticCodesToIgnore).toEqual(expect.arrayContaining([6133, 1108, 1375, ...SCRIPT_BODY_DIAGNOSTICS]));
  });

  it('knows the modules require() can load, and only those', () => {
    for (const m of ['crypto', 'buffer', 'url', 'querystring', 'path', 'util']) {
      /* Shorthand, so a destructured require — { stringify } — checks too. */
      expect(DK_TYPE_DEFS).toContain(`declare module '${m}';`);
    }
    expect(DK_TYPE_DEFS).not.toContain(`declare module 'fs'`);
  });
});
