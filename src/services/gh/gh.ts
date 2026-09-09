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
import { readdir } from 'fs/promises';
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
  /**
   * The credential is gone — expired, revoked, or an SSO session that lapsed.
   *
   * Distinguished from every other failure because it is the only one where
   * retrying is pointless and the fix is somewhere else entirely.
   */
  authFailed?: boolean;
}

/**
 * gh's several ways of saying the credential is no longer good.
 *
 * Matched on the message rather than the exit code: gh exits 1 for everything,
 * so a status code tells you nothing about whether signing in again would help.
 */
const AUTH_GONE = new RegExp([
  'HTTP 401',
  'Bad credentials',
  'authentication required',
  'gh auth login',
  'not logged into',
  'token has expired',
  'SAML enforcement',
  'must be authorized',
].join('|'), 'i');

type AuthFailureListener = (detail: string) => void;
let authListener: AuthFailureListener | undefined;

/**
 * Be told, once, when a call finds the credential gone.
 *
 * It never happens on the sign-in screen — it happens on the third card of a
 * triage session, from whichever call happened to be in flight. A listener here
 * means every path reports it without each one having to remember to.
 */
export function onAuthFailure(fn: AuthFailureListener | undefined): void {
  authListener = fn;
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
function flagAuth(r: RunResult): RunResult {
  if (r.ok) return r;
  const said = `${r.stderr}\n${r.stdout}`;
  if (!AUTH_GONE.test(said)) return r;
  r.authFailed = true;
  /* Told once per call, not per retry — there are no retries here. */
  try { authListener?.(said.trim().slice(0, 300)); } catch { /* a listener must never break a call */ }
  return r;
}

export async function run(args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const bin = await resolveBinary();
  /* Every call in dkgh funnels through here, which is why the credential check
     lives here rather than in each caller that might remember to do it. */
  return flagAuth(await runRaw(bin, args, opts));
}

/**
 * The same, for a response that is not text.
 *
 * There is exactly one of these and it exists for evidence: a screenshot
 * attached to an issue. The webview cannot fetch it itself — its content policy
 * forbids remote images, and widening that to `https:` for a thumbnail would
 * open every panel in the editor to the whole web — and on a private repository
 * the asset needs the credential anyway, which is the one thing the webview must
 * never hold.
 *
 * So the bytes come back through gh, exactly like everything else, and reach the
 * screen as a data URI. `encoding: 'buffer'` rather than the default utf8: a PNG
 * decoded as text is a corrupt PNG, and it corrupts silently.
 */
export async function runBinary(
  args: string[],
  opts: RunOptions = {},
): Promise<{ ok: boolean; code: number | null; data: Buffer; stderr: string; failure?: string }> {
  const bin = await resolveBinary();
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      {
        cwd: opts.cwd,
        env: opts.env ? { ...process.env, ...opts.env } : process.env,
        timeout: opts.timeoutMs ?? 30_000,
        maxBuffer: opts.maxBuffer ?? 16 * 1024 * 1024,
        windowsHide: true,
        signal: opts.signal,
        encoding: 'buffer',
        // No `shell` option here either.
      },
      (err, stdout, stderr) => {
        const e = err as (Error & { code?: number | string }) | null;
        const errText = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr ?? '');
        const data = Buffer.isBuffer(stdout) ? stdout : Buffer.from(String(stdout ?? ''));
        if (e && typeof e.code !== 'number') {
          resolve({ ok: false, code: null, data, stderr: errText, failure: e.message });
          return;
        }
        const code = e ? (e.code as number) : 0;
        resolve({ ok: code === 0, code, data, stderr: errText });
      },
    );
  });
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
  /** `gh issue create` — the composer. */
  issueCreate: boolean;
  /** `gh issue edit` — inline edits, and everything that follows a create. */
  issueEdit: boolean;
  /** `gh issue create --type` — issue types, which otherwise fall back to labels. */
  issueTypes: boolean;
}

/**
 * What this gh can do, asked rather than inferred.
 *
 * Never by comparing the version number. A corporate build can call itself
 * anything, distributions patch features in and out, and `2.14.7-acme3` is not
 * a string any comparison gets right. What matters is whether the command
 * exists and takes the flag, and `--help` answers that in one exit code.
 *
 * The version is still carried, for the reader: a matrix that says "needs 2.28,
 * you have 2.14.7" gives somebody on a locked corporate image a specific
 * conversation to have with whoever owns it, instead of an argument about "the
 * tool wants an upgrade".
 */
async function probeCapabilities(): Promise<GhCapabilities> {
  const [project, issueJson, searchIssues, create, edit] = await Promise.all([
    run(['project', '--help'], { timeoutMs: 10_000 }),
    run(['issue', 'list', '--help'], { timeoutMs: 10_000 }),
    run(['search', 'issues', '--help'], { timeoutMs: 10_000 }),
    run(['issue', 'create', '--help'], { timeoutMs: 10_000 }),
    run(['issue', 'edit', '--help'], { timeoutMs: 10_000 }),
  ]);
  const createHelp = create.stdout + create.stderr;
  return {
    project: project.ok,
    /* The subcommand has existed forever; the --json flag has not. */
    issueJson: issueJson.ok && /--json/.test(issueJson.stdout + issueJson.stderr),
    searchIssues: searchIssues.ok,
    issueCreate: create.ok,
    issueEdit: edit.ok,
    issueTypes: create.ok && /--type\b/.test(createHelp),
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

export interface GhDiagnostic {
  /** The command as invoked, argv joined for reading. */
  command: string;
  ok: boolean;
  /** Trimmed and capped — a page of HTML from a captive portal helps nobody. */
  output: string;
  ms: number;
}

export interface GhReachability {
  reachable: boolean;
  /** True when the failure looks like a timeout rather than a refusal. */
  timedOut: boolean;
  steps: GhDiagnostic[];
  /**
   * A proxy in the environment, when there is one.
   *
   * Worth naming either way. The extension host does not inherit a login
   * shell's profile, so a proxy somebody "set" in .bashrc is invisible here —
   * and one that IS in the environment may still not be reaching gh, which
   * reads its own config rather than the environment for some transports.
   */
  envProxy?: string;
}

const PROXY_VARS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];

/**
 * Can gh actually reach the API?
 *
 * Run when calls start failing, never on every probe — it is two more round
 * trips and the answer is almost always yes.
 *
 * What it produces is a transcript. A timeout with no transcript is
 * indistinguishable from a bug in Daakia, and the person who has to fix a
 * corporate proxy is usually not the person looking at the screen; the
 * transcript is what gets pasted into a ticket for whoever owns it.
 *
 * It diagnoses and never configures. Writing a proxy address into somebody's
 * gh config is a change to a tool they use outside Daakia, so the command is
 * shown and they run it.
 */
export async function probeReachability(): Promise<GhReachability> {
  const steps: GhDiagnostic[] = [];

  steps.push(await timed(['auth', 'status'], 15_000));
  const rate = await timed(['api', 'rate_limit'], 30_000);
  steps.push(rate);

  return {
    reachable: rate.ok,
    timedOut: /timeout|timed out|ETIMEDOUT|i\/o timeout|deadline exceeded/i.test(rate.output),
    steps,
    envProxy: PROXY_VARS.map(v => process.env[v]).find(Boolean),
  };

  async function timed(args: string[], timeoutMs: number): Promise<GhDiagnostic> {
    const at = Date.now();
    const r = await run(args, { timeoutMs });
    return {
      command: `gh ${args.join(' ')}`,
      ok: r.ok,
      output: (r.failure || r.stderr.trim() || r.stdout.trim()).slice(0, 400),
      ms: Date.now() - at,
    };
  }
}

/**
 * Where a portable archive actually lands.
 *
 * For "Search common locations". Asking somebody to remember where they
 * unzipped something six months ago is a poor use of their afternoon, and the
 * list of plausible places is short.
 *
 * Every hit is verified by running it, so what comes back is a list of working
 * binaries rather than a list of files with the right name.
 */
export async function searchCommonLocations(): Promise<{ path: string; version?: string }[]> {
  const home = homedir();
  const win = platform() === 'win32';
  const exe = win ? 'gh.exe' : 'gh';
  const roots = win
    ? [
        'C:\\Program Files\\GitHub CLI',
        join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Programs', 'GitHub CLI'),
        join(home, 'scoop', 'shims'),
        'C:\\ProgramData\\chocolatey\\bin',
        'C:\\tools',
        join(home, 'bin'),
        join(home, 'Downloads'),
      ]
    : [
        '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/opt/local/bin', '/snap/bin',
        join(home, '.local', 'bin'), join(home, 'bin'), '/opt',
      ];

  const seen = new Set<string>();
  const found: { path: string; version?: string }[] = [];

  for (const root of roots) {
    /* One level down as well as the root: an archive unpacks to
       C:\tools\gh_2.63.2\bin\gh.exe, which no flat list would ever find. */
    const candidates = [join(root, exe), ...(await oneLevel(root, exe))];
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      const check = await verifyGhPath(candidate);
      if (check.ok) found.push({ path: candidate, version: check.version?.version });
    }
  }
  return found;
}

/** One directory deep, and its bin subfolder — how portable archives unpack. */
async function oneLevel(root: string, exe: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .flatMap(e => [join(root, e.name, exe), join(root, e.name, 'bin', exe)]);
  } catch {
    /* Missing or unreadable is the ordinary case for most of the list. */
    return [];
  }
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
