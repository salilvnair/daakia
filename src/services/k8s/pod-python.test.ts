/**
 * The Python tab's commands, checked without a cluster.
 *
 * Everything here is about what WOULD be sent — the path, the quoting, the
 * flags — because those are the parts that can be wrong in a way nobody sees
 * until a script lands in the wrong directory of somebody's production pod.
 */
import { describe, it, expect } from 'vitest';
import {
  buildRunPlan, podFileName, splitArgs, parsePythonVersion, pythonVerdict, pickBase,
  parseTraceback, sessionCleanupArgs, killArgs, validBaseDir,
} from './pod-python';

const T = { context: 'prod-eu-1', namespace: 'orders', pod: 'orders-api-7d9f8c4b-x2k9p', container: 'orders-api' };

describe('podFileName', () => {
  it('keeps an ordinary name', () => {
    expect(podFileName('check_db.py')).toBe('check_db.py');
  });
  it('adds .py when missing', () => {
    expect(podFileName('check_db')).toBe('check_db.py');
  });
  it('strips anything that could escape the quotes or the folder', () => {
    expect(podFileName("x'; rm -rf #.py")).toBe('x___rm_-rf__.py');
    expect(podFileName('../../etc/passwd')).toBe('passwd.py');
    expect(podFileName('a b$(c).py')).toBe('a_b__c_.py');
  });
  it('never produces a hidden or empty name', () => {
    expect(podFileName('.bashrc')).toBe('bashrc.py');
    expect(podFileName('')).toBe('script.py');
    expect(podFileName('///')).toBe('script.py');
  });
});

describe('buildRunPlan — file mode', () => {
  const plan = buildRunPlan({
    target: T, scriptName: 'check_db.py', args: ['--pool', '--json'], interpreter: 'python3', base: '/tmp',
  });

  it('copies over stdin into /tmp/daakia with -i and a quoted path', () => {
    expect(plan.copy?.args).toEqual([
      '--context', 'prod-eu-1', '-n', 'orders', 'exec', '-i', 'orders-api-7d9f8c4b-x2k9p', '-c', 'orders-api',
      '--', 'sh', '-c', "mkdir -p '/tmp/daakia' && cat > '/tmp/daakia/check_db.py'",
    ]);
  });

  it('runs the copy with python3, unbuffered, arguments as argv', () => {
    expect(plan.run.args).toEqual([
      '--context', 'prod-eu-1', '-n', 'orders', 'exec', 'orders-api-7d9f8c4b-x2k9p', '-c', 'orders-api',
      '--', 'python3', '-u', '/tmp/daakia/check_db.py', '--pool', '--json',
    ]);
    expect(plan.run.scriptOnStdin).toBe(false);
    expect(plan.run.command).toEqual(['python3', '-u', '/tmp/daakia/check_db.py', '--pool', '--json']);
  });

  it('echoes a command someone could paste', () => {
    expect(plan.run.display).toBe(
      'kubectl --context prod-eu-1 -n orders exec orders-api-7d9f8c4b-x2k9p -c orders-api -- '
      + 'python3 -u /tmp/daakia/check_db.py --pool --json',
    );
  });

  it('removes exactly the one file afterwards', () => {
    expect(plan.cleanup?.args.slice(-4)).toEqual(['--', 'rm', '-f', '/tmp/daakia/check_db.py']);
    expect(plan.path).toBe('/tmp/daakia/check_db.py');
    expect(plan.dir).toBe('/tmp/daakia');
  });

  it('leaves -c out when no container was named', () => {
    const p = buildRunPlan({ target: { ...T, container: undefined }, scriptName: 'a.py', args: [], interpreter: 'python3', base: '/tmp' });
    expect(p.run.args).not.toContain('-c');
  });

  it('falls back to another writable base', () => {
    const p = buildRunPlan({ target: T, scriptName: 'a.py', args: [], interpreter: 'python3', base: '/dev/shm' });
    expect(p.path).toBe('/dev/shm/daakia/a.py');
  });

  it('runs under pdb for Debug', () => {
    const p = buildRunPlan({ target: T, scriptName: 'a.py', args: ['x'], interpreter: 'python3', base: '/tmp', debug: true });
    expect(p.run.command).toEqual(['python3', '-u', '-m', 'pdb', '/tmp/daakia/a.py', 'x']);
  });
});

describe('buildRunPlan — stdin mode', () => {
  it('streams the script to python - when nothing is writable', () => {
    const p = buildRunPlan({ target: T, scriptName: 'a.py', args: ['--x'], interpreter: 'python3', base: undefined });
    expect(p.copy).toBeUndefined();
    expect(p.cleanup).toBeUndefined();
    expect(p.run.scriptOnStdin).toBe(true);
    expect(p.run.args).toContain('-i');
    expect(p.run.command).toEqual(['python3', '-u', '-', '--x']);
  });

  it('refuses a base with a quote or .. in it, rather than quoting it', () => {
    expect(validBaseDir("/home/o'brien")).toBe(false);
    expect(validBaseDir('/tmp/../etc')).toBe(false);
    expect(validBaseDir('/')).toBe(false);
    const p = buildRunPlan({ target: T, scriptName: 'a.py', args: [], interpreter: 'python3', base: "/x'y" });
    expect(p.run.scriptOnStdin).toBe(true);
  });
});

describe('session cleanup', () => {
  it('removes only a folder called daakia', () => {
    expect(sessionCleanupArgs(T, '/tmp/daakia')?.slice(-4)).toEqual(['--', 'rm', '-rf', '/tmp/daakia']);
    expect(sessionCleanupArgs(T, '/tmp')).toBeUndefined();
    expect(sessionCleanupArgs(T, '/daakia')).toBeUndefined();
    expect(sessionCleanupArgs(T, '/tmp/other')).toBeUndefined();
  });

  it('kills by path and skips its own shell', () => {
    const args = killArgs(T, '/tmp/daakia/a.py');
    const script = args[args.length - 1];
    expect(script).toContain('*/tmp/daakia/a.py*');
    expect(script).toContain('"$$"');
  });
});

describe('splitArgs', () => {
  it('splits on whitespace', () => {
    expect(splitArgs('--pool  --json')).toEqual(['--pool', '--json']);
  });
  it('keeps quoted words together', () => {
    expect(splitArgs(`--name "two words" --q 'a b'`)).toEqual(['--name', 'two words', '--q', 'a b']);
  });
  it('keeps an empty quoted argument', () => {
    expect(splitArgs(`--x ""`)).toEqual(['--x', '']);
  });
  it('passes shell characters through untouched — there is no shell', () => {
    expect(splitArgs('$(id) ; rm')).toEqual(['$(id)', ';', 'rm']);
  });
  it('is empty for an empty field', () => {
    expect(splitArgs('   ')).toEqual([]);
  });
});

describe('python versions', () => {
  it('parses 3.x and 2.x', () => {
    expect(parsePythonVersion('Python 3.11.6')).toEqual({ major: 3, minor: 11, patch: 6, text: '3.11.6' });
    expect(parsePythonVersion('Python 2.7.18')?.major).toBe(2);
    expect(parsePythonVersion('Python 3.13.0rc1')?.text).toBe('3.13.0rc1');
    expect(parsePythonVersion('sh: python3: not found')).toBeUndefined();
  });

  it('accepts python3 that is 3.x', () => {
    const v = pythonVerdict({ python3Version: 'Python 3.11.6' });
    expect(v.ok).toBe(true);
    expect(v.interpreter).toBe('python3');
  });

  it('refuses python3 that is really 2.x', () => {
    const v = pythonVerdict({ python3Version: 'Python 2.7.18' });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/2\.7\.18/);
  });

  it('refuses when only Python 2 is there, and says so', () => {
    const v = pythonVerdict({ pythonVersion: 'Python 2.7.18' });
    expect(v.ok).toBe(false);
    expect(v.interpreter).toBeUndefined();
    expect(v.reason).toMatch(/Only Python 2\.7\.18/);
  });

  it('uses python when it is 3.x and python3 is missing', () => {
    expect(pythonVerdict({ pythonVersion: 'Python 3.9.2' }).interpreter).toBe('python');
  });

  it('refuses when there is no Python at all', () => {
    expect(pythonVerdict({}).ok).toBe(false);
  });
});

describe('pickBase', () => {
  it('prefers /tmp, then /dev/shm, then whatever else', () => {
    expect(pickBase(['/home/app', '/dev/shm', '/tmp'])).toBe('/tmp');
    expect(pickBase(['/home/app', '/dev/shm'])).toBe('/dev/shm');
    expect(pickBase(['/home/app'])).toBe('/home/app');
    expect(pickBase([])).toBeUndefined();
    expect(pickBase(undefined)).toBeUndefined();
  });
});

describe('parseTraceback', () => {
  const path = '/tmp/daakia/check_db.py';

  it('blames the deepest frame in the script', () => {
    const text = [
      'Traceback (most recent call last):',
      '  File "/tmp/daakia/check_db.py", line 16, in <module>',
      '    print(pool())',
      '  File "/tmp/daakia/check_db.py", line 12, in pool',
      '    return data["components"]["db"]["details"]',
      'KeyError: \'db\'',
    ].join('\n');
    expect(parseTraceback(text, path)).toEqual([{ line: 12, fn: 'pool', message: "KeyError: 'db'" }]);
  });

  it('keeps the script frame when the error is raised inside the library', () => {
    const text = [
      'Traceback (most recent call last):',
      '  File "/tmp/daakia/check_db.py", line 7, in health',
      '    with urllib.request.urlopen(url) as r:',
      '  File "/usr/lib/python3.11/urllib/request.py", line 216, in urlopen',
      '    return opener.open(url, data, timeout)',
      'urllib.error.URLError: <urlopen error [Errno 111] Connection refused>',
    ].join('\n');
    const [p] = parseTraceback(text, path);
    expect(p.line).toBe(7);
    expect(p.message).toMatch(/^urllib\.error\.URLError/);
  });

  it('reads a SyntaxError, which has no function', () => {
    const text = [
      '  File "/tmp/daakia/check_db.py", line 3',
      '    def x(',
      '         ^',
      'SyntaxError: \'(\' was never closed',
    ].join('\n');
    expect(parseTraceback(text, path)).toEqual([{ line: 3, fn: undefined, message: "SyntaxError: '(' was never closed" }]);
  });

  it('finds nothing in ordinary output', () => {
    expect(parseTraceback('all good\n', path)).toEqual([]);
  });
});
