/**
 * Every kubectl dk8s runs, written down.
 *
 * ── Why ──
 *
 * dk8s's whole claim is that it runs commands you could have typed yourself.
 * Until now you had to take that on trust: when a screen said "the cluster says
 * you cannot read logs here" and the same `kubectl logs` worked in a terminal
 * two seconds later, there was no way to see which of the two was lying, or
 * what dk8s had actually passed. A tool that shells out and does not say what
 * it shelled out with is asking to be believed.
 *
 * So one row per invocation: the command line as you would type it, how long it
 * took, what it exited with, and the first line of anything it complained
 * about. That answers all three of the questions people actually have —
 * *what did it run*, *why is it slow*, and *what did the cluster say* — and the
 * rows sit in the same audit log as everything else.
 *
 * ── What is not written ──
 *
 * Output. `kubectl logs` returns somebody's production log and `get -o json`
 * returns their whole pod spec; keeping either would turn an audit trail into a
 * data capture. Sizes and durations are kept, because those are what a slow
 * cluster looks like.
 *
 * Credentials are redacted from the line itself — a kubeconfig should never put
 * a token on a command line, but `--token` exists and somebody's wrapper may
 * use it.
 *
 * ── Why this file writes nothing ──
 *
 * It records and it notifies; where a row lands is the host's business. kubectl
 * runs in a module that deliberately imports nothing from the VS Code API so it
 * stays testable, and reaching the database from here would drag `vscode` into
 * every test that touches a cluster call. The host subscribes — see
 * `installKubectlAudit` in the dk8s handler.
 */

export interface KubectlEvent {
  /** The command as you would type it, redacted. */
  command: string;
  /** Just the verb and resource — `get pods`, `auth can-i` — for grouping. */
  what: string;
  context?: string;
  namespace?: string;
  /** `run` for a call that completes, `stream` for a long-lived process. */
  kind: 'run' | 'stream';
  /** Absent while a stream is still open. */
  ms?: number;
  ok?: boolean;
  code?: number | null;
  /** First line of stderr, when there was any. Never the output itself. */
  said?: string;
  bytes?: number;
  at: number;
}

import { redact, REDACTED } from './redact';

/** What a masked value looks like. */
const MASK = '******';

/**
 * `redact` marks what it removes with its own marker, which belongs to the AI
 * evidence panel that explains it. Here the mask is the whole explanation.
 *
 * It is deliberately conservative — see redact.ts: things secret by
 * construction only. Contexts, namespaces, pod names and paths are the
 * diagnosis and stay exactly as they were.
 */
function masked(text: string): string {
  return redact(text).text.split(REDACTED).join(MASK);
}

/** Flags whose value is a credential rather than a name. */
const SECRET_FLAGS = new Set(['--token', '--password', '--client-key', '--client-key-data']);

/** The command line, as a person would type it, with credentials taken out. */
export function commandLine(bin: string, args: string[]): string {
  const shown: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (SECRET_FLAGS.has(arg)) {
      shown.push(arg, MASK);
      i++;                                  // and skip its value
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq > 0 && SECRET_FLAGS.has(arg.slice(0, eq))) {
      shown.push(`${arg.slice(0, eq)}=${MASK}`);
      continue;
    }
    /* Quoted only where a shell would need it, so the line can be pasted. */
    shown.push(/[\s"']/.test(arg) ? JSON.stringify(arg) : arg);
  }
  /* The binary by its name, not its path: `kubectl get pods` is the line
     somebody would type, and an absolute path is noise unless it is the point
     — and when it is, the setup screen and the settings page both show it. */
  const name = /[\\/]/.test(bin) ? bin.split(/[\\/]/).pop() || bin : bin;
  /* And once more over the whole line: a credential can arrive somewhere no
     flag list anticipates — inside a `--server` URL, in a plugin's argument. */
  return masked([name, ...shown].join(' '));
}

/** The verb and resource, for reading a list of these at a glance. */
export function describeArgs(args: string[]): string {
  const words = args.filter(a => !a.startsWith('-'));
  /* Skip the values of the flags that take one — `--context prod` would
     otherwise read as the verb. */
  const skip = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('-') && args[i + 1] && !args[i + 1].startsWith('-')) {
      skip.add(args[i + 1]);
    }
  }
  return words.filter(w => !skip.has(w)).slice(0, 3).join(' ') || 'kubectl';
}

/** `--context x` / `-n y` back out of the argv, for the audit's own columns. */
function flagValue(args: string[], ...names: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (names.includes(args[i])) return args[i + 1];
    for (const n of names) {
      if (args[i].startsWith(`${n}=`)) return args[i].slice(n.length + 1);
    }
  }
  return undefined;
}

/**
 * First line of what the cluster complained about, capped and masked.
 *
 * An API server error quotes back what it was given, which is how a token ends
 * up in a message about a token being rejected.
 */
function firstLine(text: string | undefined): string | undefined {
  const line = (text ?? '').split('\n').map(s => s.trim()).find(Boolean);
  return line ? masked(line.slice(0, 400)) : undefined;
}

type Listener = (event: KubectlEvent) => void;
const listeners = new Set<Listener>();

/**
 * Watch commands as they run.
 *
 * The panel subscribes so a loading state can say what it is waiting on — a
 * spinner that names the command it is blocked on is the difference between
 * "this is slow" and "this is broken".
 */
export function onKubectl(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The last few, for a screen that opens after the commands have run. */
const recent: KubectlEvent[] = [];
const KEEP = 60;

export function recentKubectl(): KubectlEvent[] {
  return [...recent];
}

export function recordKubectl(event: KubectlEvent): void {
  recent.push(event);
  if (recent.length > KEEP) recent.shift();

  for (const l of listeners) {
    try { l(event); } catch { /* a listener must not break the command */ }
  }

}

/** Build the event for one finished call. */
export function kubectlEvent(
  bin: string,
  args: string[],
  outcome: { ok?: boolean; code?: number | null; stderr?: string; failure?: string; bytes?: number },
  ms: number | undefined,
  kind: 'run' | 'stream' = 'run',
): KubectlEvent {
  return {
    command: commandLine(bin, args),
    what: describeArgs(args),
    context: flagValue(args, '--context'),
    namespace: flagValue(args, '-n', '--namespace'),
    kind,
    ms,
    ok: outcome.ok,
    code: outcome.code ?? null,
    said: firstLine(outcome.stderr) ?? firstLine(outcome.failure),
    bytes: outcome.bytes,
    at: Date.now(),
  };
}
