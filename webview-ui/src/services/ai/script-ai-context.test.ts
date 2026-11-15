import { describe, it, expect } from 'vitest';
import { parseScriptBlocks, proseOf, appendScript, scriptExamples, dialectTables, DK_SCRIPT_API } from './script-ai-context';

const FENCE = '```';

describe('parseScriptBlocks', () => {
  it('reads where each block goes from its fence', () => {
    const answer = `Gets a token first.\n\n${FENCE}pre-request\nconst t = 1;\n${FENCE}\n\nThen checks it.\n\n${FENCE}post-response\ndk.test("ok", () => {});\n${FENCE}`;
    expect(parseScriptBlocks(answer, 'post-response')).toEqual([
      { target: 'pre-request', code: 'const t = 1;' },
      { target: 'post-response', code: 'dk.test("ok", () => {});' },
    ]);
  });

  it('puts a plain javascript block in the script the user is on', () => {
    expect(parseScriptBlocks(`${FENCE}javascript\ndk.env.set("a", "b");\n${FENCE}`, 'post-response'))
      .toEqual([{ target: 'post-response', code: 'dk.env.set("a", "b");' }]);
  });

  it('finds nothing in an answer with no code', () => {
    expect(parseScriptBlocks('I cannot help with that.', 'pre-request')).toEqual([]);
  });
});

describe('the rest', () => {
  it('keeps the explanation and drops the code', () => {
    expect(proseOf(`Does a thing.\n\n${FENCE}pre-request\nx()\n${FENCE}\n\nSet these variables: a`)).toBe('Does a thing.\n\nSet these variables: a');
  });

  it('appends after a blank line, and starts an empty script cleanly', () => {
    expect(appendScript('a();\n\n', 'b();')).toBe('a();\n\nb();\n');
    expect(appendScript('', 'b();')).toBe('b();\n');
  });

  it('tells the model the runtime as it is', () => {
    expect(DK_SCRIPT_API).toContain('dk.globals.get');
    expect(DK_SCRIPT_API).toContain('await');
    expect(dialectTables()).toContain('dk.globals.get/set');
    expect(dialectTables()).not.toMatch(/dk\.global\./);
    expect(scriptExamples()).toContain('dk.test(');
  });
});
