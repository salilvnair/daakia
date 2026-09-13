/**
 * Every kubectl invocation in dk8s goes through here.
 *
 * Arguments are passed as an ARGV ARRAY and the shell is never involved. Pod,
 * namespace and container names come off a cluster we do not control, and are
 * attacker-influenced in exactly the way a URL is — `sh -c "kubectl ... $name"`
 * would run whatever a pod called `x; rm -rf ~` decided to be called. There is
 * no `shell: true` in this directory, and a test asserts that.
 *
 * This module deliberately imports nothing from the VS Code API so it can be
 * bundled and driven from a plain Node test, the same way request-executor and
 * proxy-config are.
 */
import { execFile, spawn, type ChildProcess } from 'child_process';
import { platform } from 'os';

export interface RunOptions {
  /** Working directory — the kubectl cp drive-letter workaround needs this. */
  cwd?: string;
  timeoutMs?: number;
  maxBuffer?: number;
  /** Merged over process.env. */
  env?: Record<string, string>;
  stdin?: string;
  /**
   * Kills the child when it fires.
   *
   * The only way to actually stop a long `kubectl exec` — a loop that stops
   * awaiting still leaves `find` walking the container's filesystem. See
   * `cancel.ts` for why cancellation is a signal rather than a flag.
   */
  signal?: AbortSignal;
}

export interface RunResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  /** Set when the process could not be started or was killed by a signal. */
  failure?: string;
}

/** Overridden by settings, or by DAAKIA_KUBECTL in tests. */
let binaryOverride: string | undefined;
let resolved: string | undefined;

export function setKubectlPath(path: string | undefined): void {
  binaryOverride = path || undefined;
  resolved = undefined;
}

/** The binary currently in use, or undefined before the first successful probe. */
export function kubectlBinary(): string | undefined {
  return resolved;
}

export class KubectlMissing extends Error {
  readonly tried: string[];
  constructor(tried: string[]) {
    super('kubectl was not found');
    this.name = 'KubectlMissing';
    this.tried = tried;
  }
}

/**
 * Candidate locations, in priority order.
 *
 * PATH alone is not enough: on macOS a GUI-launched editor inherits a login
 * shell's PATH only sometimes, which is the root of every "works in my terminal
 * but not in the extension" report for tools like this.
 */
function candidates(): string[] {
  const explicit = binaryOverride ?? process.env.DAAKIA_KUBECTL;
  const list = explicit ? [explicit] : [];
  list.push('kubectl');
  if (platform() === 'win32') {
    list.push(
      'C:\\Program Files\\Docker\\Docker\\resources\\bin\\kubectl.exe',
      'C:\\Program Files\\Kubernetes\\Minikube\\kubectl.exe',
    );
  } else {
    list.push('/usr/local/bin/kubectl', '/opt/homebrew/bin/kubectl', '/usr/bin/kubectl');
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
        timeout: opts.timeoutMs ?? 60_000,
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
    if (opts.stdin !== undefined) {
      child.stdin?.end(opts.stdin);
    }
  });
}

/** Resolve kubectl once, by asking each candidate for its version. */
export async function resolveBinary(): Promise<string> {
  if (resolved) return resolved;
  const tried: string[] = [];
  for (const candidate of candidates()) {
    tried.push(candidate);
    const r = await runRaw(candidate, ['version', '--client', '-o', 'json'], { timeoutMs: 10_000 });
    if (r.ok) {
      resolved = candidate;
      return candidate;
    }
  }
  throw new KubectlMissing(tried);
}

/** Run kubectl and collect its output. */
/**
 * Verbs that are about kubectl itself rather than about a cluster.
 *
 * `config` reads and writes the kubeconfig, `version --client` asks the binary
 * what it is, and `completion`/`help` never touch a server. Everything else
 * talks to a cluster and must say which one.
 */
const CLUSTERLESS = new Set(['config', 'version', 'completion', 'help', 'options', 'plugin']);

/**
 * Every cluster call names its context. No exceptions, no silent default.
 *
 * ── Why this is a hard guard and not a convention ──
 *
 * Call sites spelled it `ctx ? ['--context', ctx] : []` — pass it when we have
 * it, quietly leave it out when we do not. That looks harmless and is the
 * single worst thing this code can do, because kubectl always has an answer:
 *
 *   No current-context set   -> it talks to localhost:8080 and the refusal is
 *                               instant, which is indistinguishable from the
 *                               cluster being down. This is what produced
 *                               "connection refused" against a cluster that was
 *                               fine, and a padlock on a pod for somebody with
 *                               full access.
 *   A current-context set    -> worse. It silently runs against whatever
 *                               cluster kubectl happens to be pointing at, so
 *                               you read one cluster's logs believing they are
 *                               another's, and nothing anywhere says so.
 *
 * k9s does not have this class of bug because it names the context on every
 * call. So does this, now, and the guard is here rather than at each call site
 * because there are fifty-three of them and the next one has not been written
 * yet.
 *
 * A missing context is a programming error, so it fails loudly and without
 * running anything — the message says exactly what was about to happen, which
 * is the one thing a silent fallback never does.
 */
function requireContext(args: string[]): RunResult | undefined {
  const verb = args.find(a => !a.startsWith('-'));
  if (verb && CLUSTERLESS.has(verb)) return undefined;
  /*
    Present AND non-empty. `--context ''` is not a context: kubectl treats an
    empty value as unset and falls straight back to the default, so checking
    only for the flag would wave through the exact failure this exists to stop.
  */
  const at = args.indexOf('--context');
  if (at >= 0 && (args[at + 1] ?? '').trim() !== '') return undefined;

  const shown = args.slice(0, 6).join(' ');
  return {
    ok: false,
    code: null,
    stdout: '',
    stderr: '',
    failure:
      `dk8s refused to run \`kubectl ${shown}\` without --context. Without one, `
      + 'kubectl uses whichever cluster it is pointing at — or localhost:8080 when '
      + 'that is nothing — and the result would be a different cluster\'s answer '
      + 'presented as this one\'s. This is a bug in dk8s, not a problem with your '
      + 'cluster or your access.',
  };
}

export async function run(args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const refusal = requireContext(args);
  if (refusal) {
    /* Loud in development, and carried to the caller in production. A context
       that went missing is worth a stack trace while there is still somebody
       around to read it. */
    console.error('[dk8s]', refusal.failure, new Error('missing --context').stack);
    return refusal;
  }
  const bin = await resolveBinary();
  return runRaw(bin, args, opts);
}

/** Long-lived kubectl (watch, logs --follow, cp). The caller owns the process. */
export async function spawnKubectl(args: string[], opts: RunOptions = {}): Promise<ChildProcess> {
  const bin = await resolveBinary();
  return spawn(bin, args, {
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    windowsHide: true,
  });
}

export interface KubectlEnv {
  present: boolean;
  binary?: string;
  clientVersion?: string;
  /** Server version, only when a context is reachable. */
  serverVersion?: string;
  platform: string;
  triedPaths?: string[];
  error?: string;
}

/** What the setup guide needs to know before showing anything. */
export async function probeEnvironment(): Promise<KubectlEnv> {
  try {
    const bin = await resolveBinary();
    const r = await run(['version', '--client', '-o', 'json'], { timeoutMs: 10_000 });
    let clientVersion: string | undefined;
    try {
      clientVersion = JSON.parse(r.stdout)?.clientVersion?.gitVersion;
    } catch {
      // A kubectl too old for -o json still counts as present.
      clientVersion = r.stdout.trim().split('\n')[0] || undefined;
    }
    return { present: true, binary: bin, clientVersion, platform: platform() };
  } catch (err) {
    const missing = err as KubectlMissing;
    return {
      present: false,
      platform: platform(),
      triedPaths: missing.tried,
      error: missing.message,
    };
  }
}

/**
 * Split a stream of concatenated JSON objects.
 *
 * `kubectl get -o json --watch` emits one object after another with no
 * separator and no enclosing array, and objects routinely span many chunks. A
 * naive split on newlines tears an object in half the moment a pod has a long
 * status block, which is the kind of bug that only shows up under load.
 *
 * Tracks brace depth, and ignores braces inside strings and escapes.
 */
export function createJsonObjectSplitter(onObject: (value: unknown) => void): (chunk: string) => void {
  let buffer = '';
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  return (chunk: string) => {
    buffer += chunk;
    for (let i = buffer.length - chunk.length; i < buffer.length; i++) {
      const ch = buffer[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          const text = buffer.slice(start, i + 1);
          try {
            onObject(JSON.parse(text));
          } catch {
            // A malformed object is dropped rather than killing the stream —
            // one bad event must not end a watch that is otherwise healthy.
          }
          buffer = buffer.slice(i + 1);
          i = -1;
          start = -1;
        }
      }
    }
    // Guard against a runaway buffer if we somehow never close a brace.
    if (depth === 0 && buffer.length > 1_000_000) buffer = '';
  };
}
