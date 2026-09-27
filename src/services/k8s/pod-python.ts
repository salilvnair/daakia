/**
 * Running a Python script inside a pod.
 *
 * ── How the script gets there ──
 *
 * There is no upload API. The script is piped into `kubectl exec -i … -- sh -c
 * 'mkdir -p /tmp/daakia && cat > /tmp/daakia/x.py'` and then run with a second
 * exec, because a file on disk is what `pdb` needs, what a traceback can name,
 * and what `python3 -m pdb` can set a breakpoint in. `kubectl cp` would work
 * too and is worse: it needs `tar` in the image, and it is tar over the same
 * exec channel anyway.
 *
 * ── What is taken from the webview, and what is not ──
 *
 * The script text crosses as stdin, never as a word on a command line, so it
 * cannot be injected into anything. The file NAME does become part of a shell
 * string (the `cat >` redirect), which is why it is reduced to a fixed
 * alphabet here before it is used anywhere. Arguments go to kubectl as argv —
 * there is no shell between them and python — so they need no quoting at all.
 *
 * ── Where, when /tmp cannot be written ──
 *
 * A pod with `readOnlyRootFilesystem` has a read-only /tmp. The probe reports
 * which directories ARE writable (see `writableDirs` in pod-classify), and the
 * first of /tmp, /dev/shm and $HOME wins. When none is, the script is streamed
 * to `python3 -` on stdin: it runs, but there is no file, so it cannot be
 * debugged — pdb needs the file and the stdin both.
 */
import type { ChildProcess } from 'child_process';
import { run, spawnKubectl } from './kubectl';
import { execArgs, showCommand, shellQuote, type PodTarget } from './pod-files';

/** The folder every copy goes in, under whichever base directory is writable. */
export const SCRIPT_FOLDER = 'daakia';

/** Bases worth trying, in order. $HOME arrives from the probe as a path. */
export const PREFERRED_BASES = ['/tmp', '/dev/shm'];

/**
 * A base directory we are willing to put a folder in and later `rm -rf`.
 *
 * The folder removed is always `<base>/daakia`, so the base itself is never
 * deleted — but it still reaches a shell string, so it is held to an alphabet
 * with no quote, no space and no `..` in it. A HOME that fails this is simply
 * not used.
 */
const BASE_DIR = /^\/[A-Za-z0-9._/-]{0,200}$/;

export function validBaseDir(dir: string | undefined): dir is string {
  return !!dir && dir !== '/' && BASE_DIR.test(dir) && !dir.split('/').includes('..');
}

/** Largest script accepted. A script, not a payload. */
export const MAX_SCRIPT_BYTES = 512 * 1024;

/**
 * The name the copy gets inside the pod.
 *
 * Reduced to letters, digits, `_`, `-` and `.`, so it can sit inside single
 * quotes in the copy command and inside a `case` pattern in the kill command
 * without either being able to misread it. A name with nothing left becomes
 * `script.py`, and `.py` is added when missing because a traceback that names
 * `check_db` reads as a module rather than a file.
 */
export function podFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^[.-]+/, '')
    .slice(0, 64);
  const stem = base.replace(/\.py$/i, '');
  return `${stem || 'script'}.py`;
}

/** Where the folder lives for a base, e.g. `/tmp/daakia`. */
export function scriptDir(base: string): string {
  return `${base.replace(/\/+$/, '')}/${SCRIPT_FOLDER}`;
}

/** `kubectl exec` with stdin attached — `-i`, which `execArgs` leaves out. */
export function execArgsWithStdin(t: PodTarget, cmd: string[]): string[] {
  return [
    '--context', t.context, '-n', t.namespace, 'exec', '-i', t.pod,
    ...(t.container ? ['-c', t.container] : []),
    '--', ...cmd,
  ];
}

// ── The plan for one run ────────────────────────────────────────────────────

export interface RunPlanInput {
  target: PodTarget;
  /** The library name, e.g. `check_db.py`; reduced by `podFileName`. */
  scriptName: string;
  /** Arguments, already split — see `splitArgs`. */
  args: string[];
  /** `python3`, or `python` on an image whose `python` IS 3.x. */
  interpreter: 'python3' | 'python';
  /** A writable base (`/tmp`), or undefined to stream on stdin. */
  base?: string;
  /** For the debugger: `python3 -m pdb` rather than the script directly. */
  debug?: boolean;
}

export interface Step {
  args: string[];
  /** What the Output panel echoes. Display only, never re-parsed. */
  display: string;
}

export interface RunPlan {
  /** Absent in stdin mode, where there is nothing to copy. */
  copy?: Step;
  run: Step & {
    /** True when the script itself is the process's stdin. */
    scriptOnStdin: boolean;
    /**
     * The argv inside the container, without kubectl around it — what the
     * debugger hands the exec API, which takes a command rather than a
     * kubectl line.
     */
    command: string[];
  };
  /** Removes the one file after the run. Absent in stdin mode. */
  cleanup?: Step;
  /** Where the copy lives in the pod, for the "copied to" line. */
  path?: string;
  /** Where the folder lives, for the end-of-session sweep. */
  dir?: string;
}

/**
 * The commands for one run, built without running anything.
 *
 * Kept apart from the running so the one thing worth checking — that the path,
 * the quoting and the flags are what they should be — can be checked by a
 * test that never touches a cluster.
 */
export function buildRunPlan(p: RunPlanInput): RunPlan {
  const file = podFileName(p.scriptName);
  /* `-u`: unbuffered. Without a TTY python block-buffers stdout, and the
     Output panel sat empty until the script ended — a long script looked
     hung for exactly as long as it was working. */
  const py = p.debug ? [p.interpreter, '-u', '-m', 'pdb'] : [p.interpreter, '-u'];

  if (!validBaseDir(p.base)) {
    /* Nowhere to write: python reads the program from stdin. pdb cannot —
       it needs stdin for its own commands — so a debug plan with no base is
       a plain run, and the caller refuses to offer Debug before it gets here. */
    const command = [p.interpreter, '-u', '-', ...p.args];
    const args = execArgsWithStdin(p.target, command);
    return { run: { args, display: showCommand(args), scriptOnStdin: true, command } };
  }

  const dir = scriptDir(p.base);
  const path = `${dir}/${file}`;
  const copyArgs = execArgsWithStdin(p.target, [
    'sh', '-c', `mkdir -p ${shellQuote(dir)} && cat > ${shellQuote(path)}`,
  ]);
  const command = [...py, path, ...p.args];
  const runArgs = execArgs(p.target, command);
  const cleanupArgs = execArgs(p.target, ['rm', '-f', path]);
  return {
    copy: { args: copyArgs, display: showCommand(copyArgs) },
    run: { args: runArgs, display: showCommand(runArgs), scriptOnStdin: false, command },
    cleanup: { args: cleanupArgs, display: showCommand(cleanupArgs) },
    path,
    dir,
  };
}

/**
 * The end-of-session sweep: the whole `daakia` folder, and nothing else.
 *
 * Refuses anything that does not end in `/daakia`, so a mistake upstream can
 * never widen this into removing a directory we did not create.
 */
export function sessionCleanupArgs(t: PodTarget, dir: string): string[] | undefined {
  const base = dir.replace(new RegExp(`/${SCRIPT_FOLDER}$`), '');
  if (!dir.endsWith(`/${SCRIPT_FOLDER}`) || !validBaseDir(base)) return undefined;
  return execArgs(t, ['rm', '-rf', dir]);
}

/**
 * Ending the process, not only the connection to it.
 *
 * Killing the local kubectl closes the stream, and without a TTY the far end
 * is not told — a python in a loop keeps running in the container until it
 * next writes to the pipe, which for a quiet script is never. So the stop
 * finds it by the path it was started with, reading /proc because slim images
 * have no `ps` or `pkill`. `$$` is skipped: this shell's own command line
 * contains the path too, and killing itself first would be a stop that
 * stopped nothing.
 */
export function killArgs(t: PodTarget, path: string): string[] {
  const script = [
    'for p in /proc/[0-9]*; do',
    '  [ "${p#/proc/}" = "$$" ] && continue;',
    '  c=$(cat "$p/cmdline" 2>/dev/null) || continue;',
    `  case "$c" in *${path}*) kill "\${p#/proc/}" 2>/dev/null;; esac;`,
    'done 2>/dev/null',
    'true',
  ].join('\n');
  return execArgs(t, ['sh', '-c', script]);
}

// ── Arguments ───────────────────────────────────────────────────────────────

/**
 * The Args field, split the way a shell would split it — quotes and all.
 *
 * Split here rather than by a shell because there is no shell: the words go to
 * kubectl as argv. So `--name "two words"` must become two arguments, the
 * second with a space in it, which is what somebody typing it expects.
 */
export function splitArgs(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inWord = false;
  let quote: '"' | "'" | undefined;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = undefined;
      else if (ch === '\\' && quote === '"' && i + 1 < text.length && /["\\$`]/.test(text[i + 1])) cur += text[++i];
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; inWord = true; continue; }
    if (ch === '\\' && i + 1 < text.length) { cur += text[++i]; inWord = true; continue; }
    if (/\s/.test(ch)) {
      if (inWord) { out.push(cur); cur = ''; inWord = false; }
      continue;
    }
    cur += ch;
    inWord = true;
  }
  if (inWord) out.push(cur);
  return out;
}

// ── Versions ────────────────────────────────────────────────────────────────

export interface PythonVersion {
  major: number;
  minor: number;
  patch?: number;
  /** `3.11.6` — what the header badge shortens to `python 3.11`. */
  text: string;
}

/** `Python 3.11.6`, `Python 2.7.18`, `Python 3.12.0rc1` → the numbers. */
export function parsePythonVersion(out: string | undefined): PythonVersion | undefined {
  const m = /Python\s+(\d+)\.(\d+)(?:\.(\d+))?([A-Za-z0-9+]*)/i.exec(out ?? '');
  if (!m) return undefined;
  const patch = m[3] !== undefined ? Number(m[3]) : undefined;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch,
    text: `${m[1]}.${m[2]}${m[3] !== undefined ? `.${m[3]}` : ''}${m[4] ?? ''}`,
  };
}

export interface PythonVerdict {
  ok: boolean;
  interpreter?: 'python3' | 'python';
  version?: PythonVersion;
  /** The sentence the tab shows, whichever way it went. */
  reason: string;
}

/**
 * Whether this container can run a Python 3 script, and with what.
 *
 * Python 2 is refused outright rather than attempted. A 3.x script on 2.7
 * fails with a SyntaxError on the first f-string, pointing at the script — the
 * reader goes looking for a bug in code that is fine. Saying "this image has
 * Python 2.7" before anything runs is the true answer, and it is not one a
 * run can give.
 */
export function pythonVerdict(v: { python3Version?: string; pythonVersion?: string }): PythonVerdict {
  const p3 = parsePythonVersion(v.python3Version);
  const p = parsePythonVersion(v.pythonVersion);
  if (p3 && p3.major >= 3) {
    return { ok: true, interpreter: 'python3', version: p3, reason: `python3 is Python ${p3.text}` };
  }
  if (p3 && p3.major < 3) {
    return {
      ok: false, version: p3,
      reason: `python3 in this image is Python ${p3.text}. Scripts here are Python 3, so nothing was run.`,
    };
  }
  if (p && p.major >= 3) {
    return { ok: true, interpreter: 'python', version: p, reason: `no python3, but python is Python ${p.text}` };
  }
  if (p) {
    return {
      ok: false, version: p,
      reason: `Only Python ${p.text} in this container, and no python3. Scripts here are Python 3, so nothing will be run.`,
    };
  }
  return { ok: false, reason: 'No Python in this container — neither python3 nor python is on its PATH.' };
}

/** The first writable base worth using, or undefined for stdin mode. */
export function pickBase(writable: string[] | undefined): string | undefined {
  const dirs = (writable ?? []).filter(validBaseDir);
  for (const want of PREFERRED_BASES) if (dirs.includes(want)) return want;
  return dirs[0];
}

// ── Problems ────────────────────────────────────────────────────────────────

export interface Problem {
  line: number;
  message: string;
  /** The function the frame was in, when the traceback said. */
  fn?: string;
}

/**
 * The line a traceback blames, in OUR file.
 *
 * A traceback names every frame from the entry point down, most of them in the
 * standard library. The one worth a squiggle is the deepest frame in the
 * script that was run, paired with the exception line at the bottom. A
 * SyntaxError has no `in fn` and a caret block instead, and is read the same.
 */
export function parseTraceback(text: string, path: string): Problem[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: Problem[] = [];
  let frame: { line: number; fn?: string } | undefined;
  let inTrace = false;
  const esc = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const frameRe = new RegExp(`^\\s*File "(?:${esc}|<stdin>|-)", line (\\d+)(?:, in (.+))?$`);
  for (const line of lines) {
    if (/^Traceback \(most recent call last\):/.test(line)) { inTrace = true; frame = undefined; continue; }
    const f = frameRe.exec(line);
    if (f) { inTrace = true; frame = { line: Number(f[1]), fn: f[2]?.trim() }; continue; }
    if (!inTrace) continue;
    const ex = /^([A-Za-z_][\w.]*(?:Error|Exception|Exit|Interrupt|Warning)|[A-Z][A-Za-z_]*Error)(?::\s*(.*))?$/.exec(line.trim());
    if (ex && !/^\s/.test(line)) {
      if (frame) {
        out.push({ line: frame.line, fn: frame.fn, message: ex[2] ? `${ex[1]}: ${ex[2]}` : ex[1] });
      }
      inTrace = false;
      frame = undefined;
    }
  }
  return out;
}

// ── Running ─────────────────────────────────────────────────────────────────

export interface RunCallbacks {
  onOutput: (stream: 'stdout' | 'stderr' | 'meta', text: string) => void;
}

export interface RunOutcome {
  code: number | null;
  durationMs: number;
  /** Set when a step before the run failed, so nothing ran. */
  failedAt?: 'copy';
  stopped?: boolean;
  removed?: string;
  stderr: string;
}

export interface RunHandle {
  done: Promise<RunOutcome>;
  stop: () => void;
}

/**
 * Copy, run, remove — streaming the middle step.
 *
 * The run is a spawned kubectl rather than `run()`, because `run()` collects
 * output until the process exits and a script's whole value is often in what
 * it prints while it works. Removal happens whatever the outcome, including a
 * stop: a copy left behind is exactly the residue this feature promises not
 * to leave.
 */
export function startRun(plan: RunPlan, source: string, target: PodTarget, cb: RunCallbacks): RunHandle {
  let child: ChildProcess | undefined;
  let stopped = false;

  const stop = () => {
    stopped = true;
    try { child?.kill(); } catch { /* already gone */ }
    if (plan.path) void run(killArgs(target, plan.path), { timeoutMs: 15_000 });
  };

  const done = (async (): Promise<RunOutcome> => {
    const started = Date.now();
    let stderr = '';

    if (plan.copy) {
      cb.onOutput('meta', `$ ${plan.copy.display}\n`);
      const c = await run(plan.copy.args, { stdin: source, timeoutMs: 30_000 });
      if (!c.ok) {
        const why = (c.stderr || c.failure || `exit ${c.code}`).trim();
        cb.onOutput('stderr', `${why}\n`);
        return { code: c.code, durationMs: Date.now() - started, failedAt: 'copy', stderr: why };
      }
    }
    if (stopped) return { code: null, durationMs: Date.now() - started, stopped: true, stderr };

    cb.onOutput('meta', `$ ${plan.run.display}\n`);
    const runStarted = Date.now();
    const code = await new Promise<number | null>((resolve) => {
      void spawnKubectl(plan.run.args).then((p) => {
        child = p;
        if (stopped) { try { p.kill(); } catch { /* gone */ } }
        p.stdout?.on('data', (d: Buffer) => cb.onOutput('stdout', d.toString('utf8')));
        p.stderr?.on('data', (d: Buffer) => {
          const s = d.toString('utf8');
          stderr += s;
          cb.onOutput('stderr', s);
        });
        p.on('error', (e) => { cb.onOutput('stderr', `${e.message}\n`); resolve(null); });
        p.on('close', (c) => resolve(typeof c === 'number' ? c : null));
        if (plan.run.scriptOnStdin) p.stdin?.end(source);
        else p.stdin?.end();
      }, (e: Error) => {
        cb.onOutput('stderr', `${e.message}\n`);
        resolve(null);
      });
    });
    const durationMs = Date.now() - runStarted;

    let removed: string | undefined;
    if (plan.cleanup && plan.path) {
      const r = await run(plan.cleanup.args, { timeoutMs: 15_000 });
      if (r.ok) removed = plan.path;
    }
    return { code, durationMs, stopped, removed, stderr };
  })();

  return { done, stop };
}

/** Sweep a folder we created. Fire and forget — the session is ending. */
export async function removeScriptDir(target: PodTarget, dir: string): Promise<boolean> {
  const args = sessionCleanupArgs(target, dir);
  if (!args) return false;
  const r = await run(args, { timeoutMs: 15_000 });
  return r.ok;
}
