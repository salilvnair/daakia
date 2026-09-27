/**
 * The container's own python checks the script. These pin the part that runs
 * here: reading its answer, and refusing to invent one when there is none.
 * The analyser itself is Python and is exercised against a real interpreter
 * when one is on the machine running the tests.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { ANALYZER, INTEL_MARK, parseIntel, intelArgs } from './pod-pyintel';

describe('reading the analyser', () => {
  it('takes the marked line and ignores whatever else the container printed', () => {
    const out = `warning: something\n${INTEL_MARK}${JSON.stringify({ version: '3.12.1', diagnostics: [{ line: 1, col: 1, endCol: 2, message: 'x', severity: 'error' }], modules: {}, aliases: {}, names: [], defined: [] })}\n`;
    const r = parseIntel(out);
    expect('error' in r).toBe(false);
    expect((r as { version: string }).version).toBe('3.12.1');
  });

  it('says why when there is no answer', () => {
    expect(parseIntel('', 'python3: not found\n')).toEqual({ error: 'python3: not found' });
  });

  it('puts the script on stdin, never on the command line', () => {
    const args = intelArgs({ context: 'c', namespace: 'n', pod: 'p', container: 'app' }, 'python3');
    expect(args).toContain('-i');
    expect(args.slice(-3)).toEqual(['python3', '-c', ANALYZER]);
  });
});

/* Only where a python is on the machine; the parsing tests above always run. */
const py = ['python3', 'python'].find(bin => spawnSync(bin, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' }).stdout?.trim() === '3');

describe.runIf(!!py)('the analyser, against a real python', () => {
  const check = (source: string) => {
    const r = spawnSync(py!, ['-c', ANALYZER], { input: JSON.stringify({ source, known: [] }), encoding: 'utf8' });
    return parseIntel(r.stdout, r.stderr) as Exclude<ReturnType<typeof parseIntel>, { error: string }>;
  };

  it('flags an attribute a module does not have, with the one it probably meant', () => {
    const r = check('import os\nprint(os.envhiron.get("HOSTNAME"))\n');
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0].message).toContain("did you mean 'environ'");
    expect(r.diagnostics[0]).toMatchObject({ line: 2, col: 10, endCol: 18 });
  });

  it('flags a syntax error without going further', () => {
    const r = check('def f(:\n  pass\n');
    expect(r.diagnostics[0].message).toMatch(/^SyntaxError/);
  });

  it('flags an import the interpreter cannot satisfy, and an undefined name as a warning', () => {
    const r = check('import no_such_module_here\nprint(nope)\n');
    expect(r.diagnostics.map(d => d.severity)).toEqual(['error', 'warning']);
  });

  it('lists what an imported module has, and keys a submodule by its chain', () => {
    const r = check('import os\n');
    expect(r.modules.os.some(m => m[0] === 'environ')).toBe(true);
    expect(r.modules['os.path'].some(m => m[0] === 'join' && m[1] === 'function')).toBe(true);
  });

  it('leaves a clean script clean', () => {
    expect(check('import json\nx = json.dumps({})\nfor i in range(2):\n    print(i, x)\n').diagnostics).toEqual([]);
  });
});
