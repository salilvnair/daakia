/**
 * Every `gh` invocation in dkgh goes through here.
 *
 * ── The shape is kubectl.ts's, on purpose ──
 *
 * dk8s already solved "drive an external CLI from the extension host" and got
 * the important parts right: an ARGV array with no shell, candidate paths
 * because PATH is unreliable in a GUI-launched editor, and a result type that
 * never throws for a command that merely failed. Repeating that shape means one
 * set of habits covers both tools rather than two subtly different ones.
 *
 * ── Why the shell is never involved ──
 *
 * Arguments here include repository names, issue titles and search queries —
 * text from a repository we do not control, and from whatever somebody typed.
 * `sh -c "gh issue list --search $q"` runs whatever a query of `x; rm -rf ~`
 * decides to be. There is no `shell: true` in this file and a test asserts it.
 *
 * ── What is deliberately absent ──
 *
 * There is no wrapper for `gh auth token` and no code path that reads a
 * credential. dkgh's entire justification for shelling out rather than calling
 * the API itself is that the token stays in the OS keychain where `gh` put it;
 * a helper that fetched it would quietly undo that.
 *
 * Imports nothing from the VS Code API, so it can be driven from a plain test.
 */
import { execFile } from 'child_process';
import { platform, homedir } from 'os';
import { join } from 'path';
import {
  parseGhVersion, parseAuthStatus,
  type GhVersion, type GhAuthStatus,
} from './gh-parse';

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  maxBuffer?: number;
  /** Merged over process.env. */
  env?: Record<string, string>;
  stdin?: string;
  signal?: AbortSignal;
}

export interface RunResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  /** Set when the process could not be started, timed out, or was killed. */
  failure?: string;
}

/** Set from the "Locate gh manually" screen, or by DAAKIA_GH in tests. */
let binaryOverride: string | undefined;
let resolved: string | undefined;

export function setGhPath(path: string | undefined): void {
  binaryOverride = path || undefined;
  resolved = undefined;
}

/** The binary currently in use, or undefined before the first successful probe. */
export function ghBinary(): string | undefined {
  return resolved;
}

/** Drops the memoised path so the next call re-probes — used by "Check again". */
export function forgetGh(): void {
  resolved = undefined;
}

export class GhMissing extends Error {
  readonly tried: string[];
  constructor(tried: string[]) {
    super('gh was not found');
    this.name = 'GhMissing';
    this.tried = tried;
  }
}

/**
 * Candidate locations, in priority order.
 *
 * PATH first, then the places each platform's package managers actually put it.
 * The list exists because a GUI-launched editor inherits a login shell's PATH
 * only sometimes, which is the root of every "works in my terminal but not in
 * the extension" report — and because the machine most likely to reach the
 * install screen is the locked-down one where somebody unpacked a zip.
 */
function candidates(): string[] {
  /*
    Three sources, in order, and the first one that exists wins outright.

      1. DAAKIA_GH        — the environment, for a one-off run
      2. Settings         — the path somebody saved in the Settings tab
      3. PATH, then the usual install locations

    The environment beats the setting deliberately: it is the temporary
    override, set on a single launch to test something, and a saved setting
    that quietly outranked it would make that launch a no-op. A setting is
    what you want most of the time; an env var is what you want right now.

    And a named path is EXCLUSIVE rather than merely first. If somebody points
    at a binary and it does not work, falling back to PATH would find a
    different gh and appear to succeed — the setting looks honoured while
    something else runs, and the next question about it is unanswerable. Named
    and broken is an error worth reporting.
  */
  const explicit = process.env.DAAKIA_GH || binaryOverride;
  if (explicit) return [explicit];

  const list: string[] = [];
  list.push('gh');
  const home = homedir();
  if (platform() === 'win32') {
    list.push(
      'C:\\Program Files\\GitHub CLI\\gh.exe',
      join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Programs', 'GitHub CLI', 'gh.exe'),
      join(home, 'scoop', 'shims', 'gh.exe'),
      'C:\\ProgramData\\chocolatey\\bin\\gh.exe',
    );
  } else {
    list.push(
      '/opt/homebrew/bin/gh',   // Apple silicon
      '/usr/local/bin/gh',      // Intel brew, and most Linux installs
      '/usr/bin/gh',            // apt, dnf, pacman
      '/opt/local/bin/gh',      // MacPorts
      '/snap/bin/gh',
      join(home, '.local', 'bin', 'gh'),
    );
  }
  return list;
}

function runRaw(bin: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = execFile(
      bin,
      args,
      {
        cwd: opts.cwd,
        env: opts.env ? { ...process.env, ...opts.env } : process.env,
        timeout: opts.timeoutMs ?? 30_000,
        maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024,
        windowsHide: true,
        signal: opts.signal,
        // No `shell` option. Not for globs, not for convenience, not ever.
      },
      (err, stdout, stderr) => {
        const e = err as (Error & { code?: number | string; killed?: boolean }) | null;
        if (e && typeof e.code !== 'number') {
          // Could not spawn, or timed out — distinct from "ran and failed".
          resolve({ ok: false, code: null, stdout, stderr, failure: e.message });
          return;
        }
        const code = e ? (e.code as number) : 0;
        resolve({ ok: code === 0, code, stdout, stderr });
      },
    );
    if (opts.stdin !== undefined) child.stdin?.end(opts.stdin);
  });
}

/** Resolve gh once, by asking each candidate for its version. */
export async function resolveBinary(): Promise<string> {
  if (resolved) return resolved;
  const tried: string[] = [];
  for (const candidate of candidates()) {
    tried.push(candidate);
    const r = await runRaw(candidate, ['--version'], { timeoutMs: 10_000 });
    /* A binary that answers --version with something mentioning gh. The name
       check keeps a `gh` on PATH that happens to be something else entirely
       from being adopted silently. */
    if (r.ok && /gh version/i.test(r.stdout)) {
      resolved = candidate;
      return candidate;
    }
  }
  throw new GhMissing(tried);
}

/** Run gh and collect its output. Never throws for a command that merely failed. */
export async function run(args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const bin = await resolveBinary();
  return runRaw(bin, args, opts);
}

/**
 * Which features this gh can do.
 *
 * Asked by capability rather than computed from a version number: a corporate
 * build can carry any version string it likes, and what actually matters is
 * whether the subcommand exists. `--help` on a missing subcommand exits
 * non-zero, which is the whole test.
 */
export interface GhCapabilities {
  /** `gh project` — Status, Priority, Start and ETA all live here. */
  project: boolean;
  /** `gh issue list --json` — the board cannot work without it. */
  issueJson: boolean;
  /** `gh search issues` — used only past the loaded page. */
  searchIssues: boolean;
}

async function probeCapabilities(): Promise<GhCapabilities> {
  const [project, issueJson, searchIssues] = await Promise.all([
    run(['project', '--help'], { timeoutMs: 10_000 }),
    run(['issue', 'list', '--help'], { timeoutMs: 10_000 }),
    run(['search', 'issues', '--help'], { timeoutMs: 10_000 }),
  ]);
  return {
    project: project.ok,
    /* The subcommand has existed forever; the --json flag has not. */
    issueJson: issueJson.ok && /--json/.test(issueJson.stdout + issueJson.stderr),
    searchIssues: searchIssues.ok,
  };
}

/**
 * Everything the first-run screens need, in one call.
 *
 * Deliberately one call: screens 01, 02 and 03 are three states of one
 * question, and asking three times invites them to disagree with each other on
 * a slow machine.
 */
export interface GhEnv {
  present: boolean;
  binary?: string;
  version?: GhVersion;
  capabilities?: GhCapabilities;
  auth?: GhAuthStatus;
  platform: string;
  /** Set when gh was not found — the paths looked in, for the install screen. */
  triedPaths?: string[];
  error?: string;
}

export async function probeEnvironment(): Promise<GhEnv> {
  let bin: string;
  try {
    bin = await resolveBinary();
  } catch (err) {
    const missing = err as GhMissing;
    return {
      present: false,
      platform: platform(),
      triedPaths: missing.tried,
      error: missing.message,
    };
  }

  const version = parseGhVersion((await run(['--version'], { timeoutMs: 10_000 })).stdout);

  /*
    Both streams, concatenated. gh has printed auth status to stdout or to
    stderr depending on version and on whether it considered "not logged in" an
    error — and it exits non-zero when signed out, which is a state rather than
    a failure. Reading only stdout reports signed-out on a working machine.
  */
  const authRun = await run(['auth', 'status'], { timeoutMs: 15_000 });
  const auth = parseAuthStatus(`${authRun.stdout}\n${authRun.stderr}`);

  return {
    present: true,
    binary: bin,
    version,
    capabilities: await probeCapabilities(),
    auth,
    platform: platform(),
  };
}

/**
 * Check one specific path, for "Locate gh manually".
 *
 * Verified by running it rather than by trusting the filename — a file called
 * `gh.exe` is not evidence of anything.
 */
export async function verifyGhPath(path: string): Promise<{ ok: boolean; version?: GhVersion; error?: string }> {
  const r = await runRaw(path, ['--version'], { timeoutMs: 10_000 });
  if (!r.ok) return { ok: false, error: r.failure || r.stderr.trim() || `exited with ${r.code}` };
  if (!/gh version/i.test(r.stdout)) {
    return { ok: false, error: 'That runs, but it does not look like the GitHub CLI.' };
  }
  return { ok: true, version: parseGhVersion(r.stdout) };
}
