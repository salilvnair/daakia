/**
 * The disclosure list has to be true.
 *
 * Screen 02E promises "every command it will ever run". A hand-maintained list
 * drifts the first time somebody adds a call and forgets, and a disclosure that
 * is quietly wrong is worse than no disclosure at all — so this reads the
 * source of every module in this directory and checks that each `run([...])`
 * has a row describing it.
 *
 * When this fails the fix is almost always to add the row, not to loosen the
 * test. The one exception is a genuinely new verb, which needs a row AND a
 * sentence about when it happens.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { GH_COMMANDS } from './commands';

/**
 * `run(['issue', 'list', ...])` -> `issue list`.
 *
 * Matches any call whose first argument is an argv literal — `run`,
 * `runBinary`, and whatever local helper a module wraps them in. Matching by
 * function name went stale the first time somebody added a wrapper, which is
 * exactly the drift this file exists to catch.
 */
function invocationsIn(source: string): string[] {
  const out: string[] = [];
  /* Only the leading string literals: the verb and subcommand are always
     literal, and everything after them is an argument we do not disclose. A
     call whose array does not begin with a bare lowercase string — an array of
     objects, `Promise.all([...])` — yields no verbs and is skipped. */
  const call = /\b[A-Za-z_$][\w$]*(?:<[^<>()]*>)?\(\s*\[([^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = call.exec(source))) {
    const verbs: string[] = [];
    for (const part of m[1].split(',')) {
      const lit = part.trim().match(/^'([a-z][a-z-]*)'$/);
      if (!lit) break;
      verbs.push(lit[1]);
      if (verbs.length === 2) break;
    }
    if (verbs.length) out.push(verbs.join(' '));
  }
  return out;
}

describe('the command disclosure', () => {
  const dir = __dirname;
  const sources = readdirSync(dir)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map(f => ({ file: f, text: readFileSync(join(dir, f), 'utf8') }));

  it('actually finds invocations, or it is passing vacuously', () => {
    expect(sources.length).toBeGreaterThan(3);
    const all = sources.flatMap(s => invocationsIn(s.text));
    /* The two the board cannot work without. If the scanner stops seeing these
       it has broken, and every other assertion here is meaningless. */
    expect(all).toContain('issue list');
    expect(all).toContain('repo view');
    expect(all.length).toBeGreaterThan(6);
  });

  it('would notice an undisclosed command', () => {
    const declared = GH_COMMANDS.map(c => c.command);
    const invented = invocationsIn("run(['secret', 'thing'], {})");
    expect(invented).toEqual(['secret thing']);
    expect(declared.some(d => d.startsWith('gh secret thing'))).toBe(false);
  });

  it('has a row for every gh invocation in this directory', () => {
    const declared = GH_COMMANDS.map(c => c.command);
    const missing: string[] = [];

    for (const { file, text } of sources) {
      for (const invocation of invocationsIn(text)) {
        const covered = declared.some(d => d.startsWith(`gh ${invocation}`))
          /* `--help` is disclosed once as a shape rather than per subcommand. */
          || declared.some(d => d.includes('--help'))
          && text.includes(`'${invocation.split(' ')[0]}', `)
          && text.includes("'--help'");
        if (!covered) missing.push(`${file}: gh ${invocation}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('never discloses a way to read the credential, because there is not one', () => {
    /* The whole justification for shelling out is that the token stays in the
       keychain. A row here would mean that had stopped being true. */
    expect(GH_COMMANDS.some(c => /auth token/.test(c.command))).toBe(false);
    for (const { text } of sources) expect(text).not.toMatch(/'auth',\s*'token'/);
  });

  it('gives every write a screen that shows it first', () => {
    /* The rule the composer's review step, the bulk bar and the labels push all
       exist to keep: no write happens that was not read first. */
    for (const row of GH_COMMANDS.filter(c => c.kind === 'write')) {
      expect(row.confirmedBy, `${row.command} has no confirming screen`).toBeTruthy();
    }
  });

  it('marks which rows are live, so the list is not a wish', () => {
    expect(GH_COMMANDS.some(c => c.live)).toBe(true);
    expect(GH_COMMANDS.some(c => !c.live)).toBe(true);
  });
});
