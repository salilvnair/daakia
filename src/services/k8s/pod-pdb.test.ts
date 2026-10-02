/**
 * pdb, parsed and driven — against a fake pdb, never a pod.
 *
 * The fake answers each command with what Python 3.11's pdb prints for the
 * script in the plan (`check_db.py`), so the driver is checked against pdb's
 * real phrasing: breakpoints before the first `c`, a stop that refreshes the
 * panes, a finished program quit rather than restarted.
 */
import { describe, it, expect } from 'vitest';
import {
  PdbConversation, PdbDriver, parseLocation, parseWhere, parseVars, parseMarked, pdbError,
  classifyStop, varsCommand, watchCommand, MARK, PROMPT, type DebugState,
} from './pod-pdb';

const PATH = '/tmp/daakia/check_db.py';

const WHERE_AT_12 = [
  '  /usr/lib/python3.11/bdb.py(600)run()',
  '-> exec(cmd, globals, locals)',
  '  <string>(1)<module>()',
  `  ${PATH}(16)<module>()`,
  '-> print(socket.gethostname(), json.dumps(pool(), indent=2))',
  `> ${PATH}(12)pool()`,
  '-> return data["components"]["db"]["details"]',
].join('\n');

describe('parseLocation', () => {
  it('reads the last > line and the source under it', () => {
    expect(parseLocation(`> ${PATH}(12)pool()\n-> return data["x"]\n`)).toEqual({
      file: PATH, line: 12, fn: 'pool', source: 'return data["x"]',
    });
  });
  it('names module level', () => {
    expect(parseLocation(`> ${PATH}(1)<module>()\n-> import json`)?.fn).toBe('<module>');
  });
  it('is undefined when pdb said nothing about where it is', () => {
    expect(parseLocation("'UP'\n")).toBeUndefined();
  });
});

describe('parseWhere', () => {
  it('drops bdb and <string>, innermost first', () => {
    expect(parseWhere(WHERE_AT_12)).toEqual([
      { file: PATH, line: 12, fn: 'pool', current: true },
      { file: PATH, line: 16, fn: '<module>', current: false },
    ]);
  });
});

describe('marked output', () => {
  it('reads variables with children', () => {
    const rows = [
      ['data', 'dict', "{'status': 'UP', 'components': {...}}", 2,
        [['status', 'str', "'UP'"], ['components', 'dict', '{...}']]],
      ['n', 'int', '4', -1, []],
    ];
    const block = `${MARK}locals@@ ${JSON.stringify(rows)}\n`;
    const vars = parseVars(block, 'locals');
    expect(vars).toHaveLength(2);
    expect(vars[0]).toMatchObject({ name: 'data', type: 'dict', size: 2 });
    expect(vars[0].children?.[0]).toEqual({ name: 'status', type: 'str', value: "'UP'" });
    expect(vars[1].children).toBeUndefined();
  });
  it('is empty when the query failed', () => {
    expect(parseVars("*** NameError: name 'json' is not defined\n", 'locals')).toEqual([]);
    expect(pdbError("*** NameError: name 'x' is not defined\n")).toBe("NameError: name 'x' is not defined");
    expect(parseMarked(`${MARK}watch@@ not json`, 'watch')).toBeUndefined();
  });
  it('asks for locals in the enclosing scope, one line, no newline', () => {
    const cmd = varsCommand('locals');
    expect(cmd.startsWith('!print(')).toBe(true);
    expect(cmd).toContain('list(locals().items())');
    expect(cmd).not.toContain('\n');
    expect(varsCommand('globals')).toContain('not callable(v)');
    expect(watchCommand('len(data)')).toContain('(len(data))');
  });
});

describe('classifyStop', () => {
  it('a breakpoint, with the program output split from pdb chrome', () => {
    const s = classifyStop(`orders-api-x2k9p ready\n> ${PATH}(12)pool()\n-> return data\n`);
    expect(s.kind).toBe('paused');
    expect(s.location?.line).toBe(12);
    expect(s.output).toBe('orders-api-x2k9p ready');
  });
  it('the program ran off the end', () => {
    const s = classifyStop([
      '{"active": 4}',
      'The program finished and will be restarted',
      `> ${PATH}(1)<module>()`,
      '-> import json, os, socket',
    ].join('\n'));
    expect(s.kind).toBe('finished');
    expect(s.output).toBe('{"active": 4}');
  });
  it('an uncaught exception', () => {
    const s = classifyStop([
      'Traceback (most recent call last):',
      '  File "/usr/lib/python3.11/pdb.py", line 1774, in main',
      "KeyError: 'db'",
      'Uncaught exception. Entering post mortem debugging',
      "Running 'cont' or 'step' will restart the program",
      `> ${PATH}(12)pool()`,
      '-> return data["components"]["db"]["details"]',
    ].join('\n'));
    expect(s.kind).toBe('post-mortem');
    expect(s.exception).toBe("KeyError: 'db'");
    expect(s.location?.line).toBe(12);
  });
  it('--Return-- after a step out', () => {
    const s = classifyStop(`--Return--\n> ${PATH}(12)pool()->{'a': 1}\n-> return x`);
    expect(s.returning).toBe(true);
    expect(s.location).toMatchObject({ line: 12, fn: 'pool' });
    expect(s.output).toBe('');
  });
});

describe('PdbConversation', () => {
  it('writes one command at a time and pairs each answer with its question', async () => {
    const written: string[] = [];
    const conv = new PdbConversation(l => written.push(l));
    const ready = conv.ready();
    conv.feed(`> ${PATH}(1)<module>()\n-> import json\n`);
    conv.feed(PROMPT);
    expect(await ready).toContain('(1)<module>()');

    const a = conv.send('p 1');
    const b = conv.send('p 2');
    expect(written).toEqual(['p 1\n']);
    conv.feed('1\n(Pd');
    conv.feed('b) ');
    expect(await a).toBe('1\n');
    expect(written).toEqual(['p 1\n', 'p 2\n']);
    conv.feed(`2\n${PROMPT}`);
    expect(await b).toBe('2\n');
  });

  it('folds a newline into one command', () => {
    const written: string[] = [];
    const conv = new PdbConversation(l => written.push(l));
    conv.feed(PROMPT);
    void conv.send('p 1\nimport os');
    expect(written).toEqual(['p 1 import os\n']);
  });

  it('resolves everything waiting when closed', async () => {
    const conv = new PdbConversation(() => undefined);
    conv.feed(PROMPT);
    const a = conv.send('c');
    const b = conv.send('where');
    conv.close();
    expect(await a).toBe('');
    expect(await b).toBe('');
  });
});

/**
 * A pdb that answers from a script: the next block for each command, keyed by
 * the command's first word.
 */
function fakePdb(answers: (cmd: string) => string) {
  const log: string[] = [];
  let conv!: PdbConversation;
  conv = new PdbConversation((line) => {
    const cmd = line.trim();
    log.push(cmd);
    // Answer on a later tick, the way a socket would.
    queueMicrotask(() => conv.feed(`${answers(cmd)}${PROMPT}`));
  });
  return { conv, log };
}

const LOCALS = `${MARK}locals@@ ${JSON.stringify([['data', 'dict', "{'status': 'UP'}", 1, [['status', 'str', "'UP'"]]]])}\n`;
const GLOBALS = `${MARK}globals@@ ${JSON.stringify([['BASE', 'str', "'http://orders:8080'", -1, []]])}\n`;

function answers(cmd: string): string {
  if (cmd.startsWith('b ')) return `Breakpoint 1 at ${cmd.slice(2)}\n`;
  if (cmd === 'c') return `> ${PATH}(12)pool()\n-> return data["components"]["db"]["details"]\n`;
  if (cmd === 'where') return `${WHERE_AT_12}\n`;
  if (cmd.includes('locals()')) return LOCALS;
  if (cmd.includes('globals()')) return GLOBALS;
  if (cmd.includes(`${MARK}watch@@`)) {
    return cmd.includes('nope') ? "*** NameError: name 'nope' is not defined\n" : `${MARK}watch@@ "1"\n`;
  }
  return '';
}

async function settle(): Promise<void> {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

describe('PdbDriver', () => {
  it('sets breakpoints, continues, and fills every pane at the stop', async () => {
    const { conv, log } = fakePdb(answers);
    const states: DebugState[] = [];
    const consoleText: string[] = [];
    const driver = new PdbDriver(conv, PATH, {
      state: s => states.push(s), console: t => consoleText.push(t), output: () => undefined,
    });
    const started = driver.start([8, 12], ['len(data)', 'nope']);
    conv.feed(`> ${PATH}(1)<module>()\n-> import json\n${PROMPT}`);
    await started;
    await settle();

    expect(log.slice(0, 3)).toEqual([`b ${PATH}:8`, `b ${PATH}:12`, 'c']);
    const last = states[states.length - 1];
    expect(last.status).toBe('paused');
    expect(last.reason).toBe('breakpoint');
    expect(last.location?.line).toBe(12);
    expect(last.frames.map(f => f.fn)).toEqual(['pool', '<module>']);
    expect(last.locals[0].name).toBe('data');
    expect(last.globals[0].name).toBe('BASE');
    expect(last.watches).toEqual([
      { expr: 'len(data)', value: '1' },
      { expr: 'nope', error: "NameError: name 'nope' is not defined" },
    ]);
    // Our own queries stay out of the console; the reader's commands do not.
    const transcript = consoleText.join('');
    expect(transcript).toContain(`${PROMPT}c`);
    expect(transcript).not.toContain(MARK);
  });

  it('quits when the program finishes, instead of letting pdb restart it', async () => {
    const { conv, log } = fakePdb((cmd) => cmd === 'c'
      ? `done\nThe program finished and will be restarted\n> ${PATH}(1)<module>()\n-> import json\n`
      : '');
    const states: DebugState[] = [];
    const out: string[] = [];
    const driver = new PdbDriver(conv, PATH, { state: s => states.push(s), console: () => undefined, output: t => out.push(t) });
    const started = driver.start([], []);
    conv.feed(PROMPT);
    await started;
    await settle();
    expect(states[states.length - 1].status).toBe('finished');
    expect(log).toContain('q');
    expect(out.join('')).toBe('done\n');
  });

  it('steps with n, s and r', async () => {
    const { conv, log } = fakePdb(answers);
    const driver = new PdbDriver(conv, PATH, { state: () => undefined, console: () => undefined, output: () => undefined });
    const started = driver.start([], []);
    conv.feed(PROMPT);
    await started;
    await settle();
    await driver.resume('n');
    await driver.resume('s');
    await driver.resume('r');
    expect(log.filter(c => c.length === 1)).toEqual(['c', 'n', 's', 'r']);
  });

  it('brings breakpoints in line with the gutter at a stop', async () => {
    const { conv, log } = fakePdb(answers);
    const driver = new PdbDriver(conv, PATH, { state: () => undefined, console: () => undefined, output: () => undefined });
    const started = driver.start([8], []);
    conv.feed(PROMPT);
    await started;
    await settle();
    await driver.setBreakpoints([12]);
    expect(log).toContain(`cl ${PATH}:8`);
    expect(log).toContain(`b ${PATH}:12`);
  });
});

describe('hover evaluation', () => {
  it('asks pdb only for names and attribute chains, never calls or writes', async () => {
    const { isHoverExpr, evalCommand } = await import('./pod-pdb');
    expect(isHoverExpr('socket')).toBe(true);
    expect(isHoverExpr('os.environ')).toBe(true);
    expect(isHoverExpr('self.pool.size')).toBe(true);
    expect(isHoverExpr('socket.gethostname()')).toBe(false);
    expect(isHoverExpr('x = 1')).toBe(false);
    expect(isHoverExpr('d["k"]')).toBe(false);
    expect(isHoverExpr('__import__')).toBe(true);
    expect(evalCommand('os.environ')).toContain('type(os.environ).__name__');
  });
});
