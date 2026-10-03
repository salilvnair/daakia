/**
 * The Python tab's and the Scripts screen's message handlers.
 *
 * Thin over `pod-python` (copy, run, remove) and `pod-pdb` (the debugger), the
 * way the terminal handler is thin over `pod-terminal`.
 *
 * ── What crosses the boundary, and what is checked ──
 *
 * A webview message is untrusted input, and four of its fields reach a pod:
 * the names (validated as Kubernetes names, and passed as argv or API
 * parameters), the script text (stdin, never a word on a command line), the
 * arguments (argv, never a shell), and the file name (reduced to a fixed
 * alphabet in `podFileName` before it goes anywhere near the one shell string
 * it appears in).
 *
 * The interpreter is NOT taken from the message. It is decided here, from the
 * container's own answer to `python3 -V`, so a view that has gone stale can
 * never talk this into running a script on Python 2.
 *
 * ── What is left behind ──
 *
 * Nothing, on purpose. Each run removes its file; the folder goes when the tab
 * that made it closes (`py:endSession`) or the panel does (`disposePython`).
 */
import { probeCapabilities } from '../../../services/k8s/pod-classify';
import { probeAccess } from '../../../services/k8s/k8s-access';
import { listNamespaces } from '../../../services/k8s/kube-context';
import { listAppPods } from '../../../services/k8s/pod-mounts';
import { run } from '../../../services/k8s/kubectl';
import {
  buildRunPlan, splitArgs, pythonVerdict, pickBase, parseTraceback, startRun,
  removeScriptDir, killArgs, MAX_SCRIPT_BYTES, type RunHandle, type PythonVerdict,
} from '../../../services/k8s/pod-python';
import {
  PdbConversation, PdbDriver, openPdbChannel, type PdbChannel,
} from '../../../services/k8s/pod-pdb';
import type { PodTarget } from '../../../services/k8s/pod-files';
import { configFor } from './terminal-handler';
import { intelArgs, parseIntel } from '../../../services/k8s/pod-pyintel';
import { checkConnRequest, connArgs, parseConn } from '../../../services/k8s/pod-conn';
import { listScripts, saveScript, deleteScript } from '../../../services/py-scripts';
import { getActiveWorkspaceId } from '../../../storage/workspaces';

type PostMessage = (msg: Record<string, unknown>) => void;

/** RFC 1123 — what Kubernetes enforces on these names. See terminal-handler. */
const DNS_NAME = /^[a-z0-9]([a-z0-9-]{0,251}[a-z0-9])?$/;
/** Ids are ours, but they come back from the webview, so they are checked too. */
const ID = /^[A-Za-z0-9_-]{4,64}$/;

/** A ceiling on live debuggers, for the reason pod-terminal gives for shells. */
const MAX_DEBUG_SESSIONS = 4;

function targetOf(msg: Record<string, unknown>): PodTarget | undefined {
  const context = String(msg.context ?? '');
  const namespace = String(msg.namespace ?? '');
  const pod = String(msg.pod ?? '');
  const container = msg.container ? String(msg.container) : undefined;
  if (!context || !DNS_NAME.test(namespace) || !DNS_NAME.test(pod)) return undefined;
  if (container !== undefined && !DNS_NAME.test(container)) return undefined;
  return { context, namespace, pod, container };
}

const keyOf = (t: PodTarget) => `${t.context}/${t.namespace}/${t.pod}/${t.container ?? ''}`;

// ── What this pod can do ────────────────────────────────────────────────────

export interface PythonProbe {
  verdict: PythonVerdict;
  /** The base a copy goes under, or undefined for stdin mode. */
  base?: string;
  writableDirs: string[];
  python3Version?: string;
  pythonVersion?: string;
  execAllowed: boolean;
  unreachable?: string;
}

async function probePython(t: PodTarget): Promise<PythonProbe> {
  const [caps, access] = await Promise.all([
    probeCapabilities(t.context, t.namespace, t.pod, t.container),
    probeAccess(t.context, t.namespace),
  ]);
  const execAllowed = !(access.probed && !access.exec) && !/pods\/exec/.test(caps.unreachable ?? '');
  const writableDirs = caps.writableDirs ?? [];
  return {
    verdict: caps.unreachable
      ? { ok: false, reason: `Could not look inside the container: ${caps.unreachable}` }
      : pythonVerdict(caps),
    base: pickBase(writableDirs),
    writableDirs,
    python3Version: caps.python3Version,
    pythonVersion: caps.pythonVersion,
    execAllowed,
    unreachable: caps.unreachable,
  };
}

export async function handlePyProbe(msg: Record<string, unknown>, post: PostMessage): Promise<void> {
  const t = targetOf(msg);
  if (!t) return;
  const probe = await probePython(t);
  post({ type: 'py:probed', key: keyOf(t), ...t, ...probe });
}

/** Namespaces in a context, and the pods in one — the Scripts screen's pickers. */
export async function handlePyPods(msg: Record<string, unknown>, post: PostMessage): Promise<void> {
  const context = String(msg.context ?? '');
  const namespace = String(msg.namespace ?? '');
  if (!context) return;
  const ns = await listNamespaces(context);
  const pods = namespace && DNS_NAME.test(namespace)
    ? await listAppPods(context, namespace)
    : { pods: [], command: '' };
  post({
    type: 'py:pods', context, namespace,
    namespaces: ns.namespaces.length ? ns.namespaces : (ns.fallback ? [ns.fallback] : []),
    namespacesError: ns.forbidden ? 'Not allowed to list namespaces here.' : ns.error,
    pods: pods.pods,
    podsError: 'error' in pods ? pods.error : undefined,
  });
}

// ── Where copies went, so they can be swept ─────────────────────────────────

const touched = new Map<string, Map<string, { target: PodTarget; dir: string }>>();

function remember(sessionId: string, t: PodTarget, dir: string | undefined): void {
  if (!dir || !ID.test(sessionId)) return;
  const m = touched.get(sessionId) ?? new Map();
  m.set(`${keyOf(t)}:${dir}`, { target: t, dir });
  touched.set(sessionId, m);
}

async function sweep(sessionId: string): Promise<string[]> {
  const m = touched.get(sessionId);
  touched.delete(sessionId);
  if (!m) return [];
  const removed: string[] = [];
  await Promise.all([...m.values()].map(async ({ target, dir }) => {
    if (await removeScriptDir(target, dir)) removed.push(`${target.pod}:${dir}`);
  }));
  return removed;
}

export async function handlePyEndSession(msg: Record<string, unknown>, post: PostMessage): Promise<void> {
  const sessionId = String(msg.sessionId ?? '');
  if (!ID.test(sessionId)) return;
  /* A debugger still open for this session goes first — its file is in the
     folder about to be removed. */
  for (const [id, d] of debuggers) if (d.sessionId === sessionId) stopDebugger(id, post);
  const removed = await sweep(sessionId);
  post({ type: 'py:sessionEnded', sessionId, removed });
}

// ── Run ─────────────────────────────────────────────────────────────────────

const runs = new Map<string, RunHandle>();

export async function handlePyRun(msg: Record<string, unknown>, post: PostMessage): Promise<void> {
  const runId = String(msg.runId ?? '');
  const sessionId = String(msg.sessionId ?? '');
  if (!ID.test(runId)) return;
  const exit = (extra: Record<string, unknown>) => post({ type: 'py:runExit', runId, ...extra });

  const t = targetOf(msg);
  if (!t) { exit({ code: null, refused: 'That pod, namespace or container name is not a valid Kubernetes name.' }); return; }
  const source = typeof msg.source === 'string' ? msg.source : '';
  if (Buffer.byteLength(source, 'utf8') > MAX_SCRIPT_BYTES) {
    exit({ code: null, refused: `The script is larger than ${MAX_SCRIPT_BYTES / 1024} KB.` });
    return;
  }

  const probe = await probePython(t);
  if (!probe.verdict.ok || !probe.verdict.interpreter) {
    // Refused before anything touched the pod — see pythonVerdict.
    exit({ code: null, refused: probe.verdict.reason });
    return;
  }

  const plan = buildRunPlan({
    target: t,
    scriptName: String(msg.scriptName ?? 'script.py'),
    args: splitArgs(String(msg.args ?? '')),
    interpreter: probe.verdict.interpreter,
    base: probe.base,
  });
  post({
    type: 'py:runStarted', runId, ...t,
    path: plan.path, base: probe.base, mode: plan.copy ? 'file' : 'stdin',
    command: plan.run.display,
    version: probe.verdict.version?.text,
  });
  remember(sessionId, t, plan.dir);

  const handle = startRun(plan, source, t, {
    onOutput: (stream, text) => post({ type: 'py:runOutput', runId, stream, text }),
  });
  runs.set(runId, handle);
  const outcome = await handle.done;
  runs.delete(runId);
  exit({
    code: outcome.code,
    durationMs: outcome.durationMs,
    stopped: outcome.stopped,
    failedAt: outcome.failedAt,
    removed: outcome.removed,
    problems: parseTraceback(outcome.stderr, plan.path ?? '-'),
  });
}

export function handlePyStop(msg: Record<string, unknown>): void {
  const runId = String(msg.runId ?? '');
  if (!ID.test(runId)) return;
  runs.get(runId)?.stop();
}

// ── Debug ───────────────────────────────────────────────────────────────────

interface Debugger {
  sessionId: string;
  target: PodTarget;
  path: string;
  cleanup: string[];
  driver: PdbDriver;
  conv: PdbConversation;
  channel?: PdbChannel;
  ended: boolean;
}

const debuggers = new Map<string, Debugger>();

export async function handlePyDebugStart(msg: Record<string, unknown>, post: PostMessage): Promise<void> {
  const debugId = String(msg.debugId ?? '');
  const sessionId = String(msg.sessionId ?? '');
  if (!ID.test(debugId)) return;
  const fail = (error: string) => post({ type: 'py:debug:ended', debugId, reason: error, failed: true });

  if (debuggers.size >= MAX_DEBUG_SESSIONS) {
    fail(`${MAX_DEBUG_SESSIONS} debuggers are already open. Stop one first — each is a process in a container.`);
    return;
  }
  const t = targetOf(msg);
  /* The exec API takes a container by name and has no "default" to fall back
     on for a pod with a sidecar, so the debugger insists on one. */
  if (!t || !t.container) { fail('That pod, namespace or container name is not a valid Kubernetes name.'); return; }
  const source = typeof msg.source === 'string' ? msg.source : '';
  if (Buffer.byteLength(source, 'utf8') > MAX_SCRIPT_BYTES) { fail('The script is too large to debug.'); return; }

  const probe = await probePython(t);
  if (!probe.verdict.ok || !probe.verdict.interpreter) { fail(probe.verdict.reason); return; }
  if (!probe.base) {
    fail('Nothing in this container is writable — not /tmp, /dev/shm or $HOME — so there is no file for pdb '
      + 'to open. Run still works: it streams the script to python on stdin.');
    return;
  }

  const plan = buildRunPlan({
    target: t,
    scriptName: String(msg.scriptName ?? 'script.py'),
    args: splitArgs(String(msg.args ?? '')),
    interpreter: probe.verdict.interpreter,
    base: probe.base,
    debug: true,
  });
  if (!plan.copy || !plan.path) { fail('Could not work out where to put the script.'); return; }

  const consoleOut = (text: string) => post({ type: 'py:debug:console', debugId, text });
  consoleOut(`$ ${plan.copy.display}\n`);
  const copied = await run(plan.copy.args, { stdin: source, timeoutMs: 30_000 });
  if (!copied.ok) { fail((copied.stderr || copied.failure || 'The copy failed.').trim()); return; }
  remember(sessionId, t, plan.dir);
  consoleOut(`$ ${plan.run.display}\n`);

  const path = plan.path;
  let channel: PdbChannel | undefined;
  const conv = new PdbConversation(line => channel?.write(line));
  const driver = new PdbDriver(conv, path, {
    state: s => post({ type: 'py:debug:state', debugId, path, state: s }),
    console: consoleOut,
    output: text => post({ type: 'py:debug:output', debugId, text }),
  });
  const d: Debugger = {
    sessionId, target: t, path, cleanup: plan.cleanup?.args ?? [], driver, conv, ended: false,
  };
  debuggers.set(debugId, d);
  post({
    type: 'py:debug:started', debugId, path, command: plan.run.display,
    version: probe.verdict.version?.text, startedAt: Date.now(),
  });

  try {
    const kc = await configFor(t.context);
    channel = await openPdbChannel(kc, { ...t, container: t.container }, plan.run.command, {
      stdout: s => conv.feed(s),
      // The program's stderr: a traceback, a warning. Both belong where it can be read.
      stderr: s => { consoleOut(s); post({ type: 'py:debug:output', debugId, text: s, stream: 'stderr' }); },
      exit: reason => finishDebugger(debugId, reason, post),
    });
    d.channel = channel;
    const bps = Array.isArray(msg.breakpoints) ? (msg.breakpoints as unknown[]).map(Number).filter(n => Number.isInteger(n) && n > 0) : [];
    const watches = Array.isArray(msg.watches) ? (msg.watches as unknown[]).map(String).slice(0, 20) : [];
    await driver.start(bps, watches);
  } catch (err) {
    finishDebugger(debugId, err instanceof Error ? err.message : String(err), post);
  }
}

/** The toolbar: continue, step over, step into, step out, restart. */
export function handlePyDebugCmd(msg: Record<string, unknown>): void {
  const d = debuggers.get(String(msg.debugId ?? ''));
  if (!d || d.ended || d.conv.busy) return;
  switch (msg.cmd) {
    case 'continue': void d.driver.resume('c'); break;
    case 'next': void d.driver.resume('n'); break;
    case 'step': void d.driver.resume('s'); break;
    case 'return': void d.driver.resume('r'); break;
    case 'restart': void d.driver.restart(); break;
  }
}

/**
 * A line typed into the Debug console.
 *
 * Passed to pdb as typed — it is a pdb prompt, and `p`, `pp`, `display`, `!x
 * = 1` are all things somebody debugging means to do. Not logged: like the
 * terminal, what is typed here can be a secret.
 */
export function handlePyDebugConsole(msg: Record<string, unknown>): void {
  const d = debuggers.get(String(msg.debugId ?? ''));
  const line = String(msg.line ?? '').slice(0, 4000);
  if (!d || d.ended || !line.trim() || d.conv.busy) return;
  void d.driver.console(line);
}

export function handlePyDebugBreakpoints(msg: Record<string, unknown>): void {
  const d = debuggers.get(String(msg.debugId ?? ''));
  if (!d || d.ended) return;
  const lines = Array.isArray(msg.lines) ? (msg.lines as unknown[]).map(Number).filter(n => Number.isInteger(n) && n > 0) : [];
  void d.driver.setBreakpoints(lines);
}

export function handlePyDebugWatches(msg: Record<string, unknown>): void {
  const d = debuggers.get(String(msg.debugId ?? ''));
  if (!d || d.ended) return;
  const exprs = Array.isArray(msg.exprs) ? (msg.exprs as unknown[]).map(String).filter(e => e.trim()).slice(0, 20) : [];
  void d.driver.setWatches(exprs);
}

/**
 * A hover in the editor: one name or attribute chain, evaluated in the paused
 * frame. Answered by `reqId`, and answered even when it cannot be — a hover
 * waiting on a reply that never comes is a spinner that never stops.
 */
export function handlePyDebugEval(msg: Record<string, unknown>, post: PostMessage): void {
  const debugId = String(msg.debugId ?? '');
  const reqId = String(msg.reqId ?? '');
  const d = debuggers.get(debugId);
  const reply = (r: { type?: string; value?: string; error?: string }) =>
    post({ type: 'py:debug:evalResult', debugId, reqId, valueType: r.type, value: r.value, error: r.error });
  if (!d || d.ended) { reply({ error: 'no session' }); return; }
  if (d.conv.busy) { reply({ error: 'busy' }); return; }
  void d.driver.evaluate(String(msg.expr ?? '')).then(reply, err => reply({ error: err instanceof Error ? err.message : String(err) }));
}

/**
 * IntelliSense from the container: the script parsed (never run) by the pod's
 * own python3, and the members of what it imports — see pod-pyintel.
 *
 * Answered by `reqId`, always: an editor waiting on squiggles that never come
 * is an editor that looks like it approves of the code.
 */
export async function handlePyIntel(msg: Record<string, unknown>, post: PostMessage): Promise<void> {
  const reqId = String(msg.reqId ?? '');
  const reply = (r: Record<string, unknown>) => post({ type: 'py:intel', reqId, scriptId: msg.scriptId, ...r });
  const t = targetOf(msg);
  if (!t) { reply({ error: 'not a valid pod' }); return; }
  const source = typeof msg.source === 'string' ? msg.source : '';
  if (Buffer.byteLength(source, 'utf8') > MAX_SCRIPT_BYTES) { reply({ error: 'script too large to check' }); return; }
  const probe = await probePython(t);
  if (!probe.verdict.ok || !probe.verdict.interpreter) { reply({ error: probe.verdict.reason ?? 'no python here' }); return; }
  const known = Array.isArray(msg.known) ? (msg.known as unknown[]).map(String).slice(0, 200) : [];
  const r = await run(intelArgs(t, probe.verdict.interpreter), {
    stdin: JSON.stringify({ source, known }),
    timeoutMs: 15_000,
  });
  const parsed = parseIntel(r.stdout, r.failure ?? r.stderr);
  reply({ ...parsed, key: keyOf(t) });
}

/**
 * A connectivity test from inside the pod — see pod-conn. Answered by `reqId`,
 * always, with the steps or the reason there are none.
 */
export async function handlePyConn(msg: Record<string, unknown>, post: PostMessage): Promise<void> {
  const reqId = String(msg.reqId ?? '');
  const reply = (r: Record<string, unknown>) => post({ type: 'py:conn', reqId, ...r });
  const t = targetOf(msg);
  if (!t) { reply({ error: 'Not a valid pod.' }); return; }
  const req = checkConnRequest(msg);
  if ('error' in req) { reply({ error: req.error }); return; }
  const probe = await probePython(t);
  if (!probe.verdict.ok || !probe.verdict.interpreter) { reply({ error: probe.verdict.reason ?? 'No python in this container.' }); return; }
  const r = await run(connArgs(t, probe.verdict.interpreter), {
    stdin: JSON.stringify(req),
    /* The check's own steps time out first; this is for a pod that never answers. */
    timeoutMs: (req.timeoutSeconds * 3 + 15) * 1000,
  });
  const parsed = parseConn(r.stdout, r.failure ?? r.stderr);
  reply('error' in parsed ? { error: parsed.error } : { result: parsed });
}

export function handlePyDebugStop(msg: Record<string, unknown>, post: PostMessage): void {
  stopDebugger(String(msg.debugId ?? ''), post);
}

function stopDebugger(debugId: string, post: PostMessage): void {
  const d = debuggers.get(debugId);
  if (!d || d.ended) return;
  d.driver.quit();
  /* `q` first so pdb can leave cleanly, then the channel and — because a
     program mid-run is not at pdb's prompt and never reads the `q` — the
     process itself, found by its path. */
  setTimeout(() => {
    d.channel?.close();
    void run(killArgs(d.target, d.path), { timeoutMs: 15_000 });
  }, 250);
  finishDebugger(debugId, 'Stopped.', post);
}

function finishDebugger(debugId: string, reason: string, post: PostMessage): void {
  const d = debuggers.get(debugId);
  if (!d || d.ended) return;
  d.ended = true;
  debuggers.delete(debugId);
  d.driver.markEnded();
  d.conv.close();
  void (async () => {
    let removed: string | undefined;
    if (d.cleanup.length) {
      const r = await run(d.cleanup, { timeoutMs: 15_000 });
      if (r.ok) removed = d.path;
    }
    post({ type: 'py:debug:ended', debugId, reason, removed });
  })();
}

// ── The library ─────────────────────────────────────────────────────────────

function sendScripts(post: PostMessage, extra: Record<string, unknown> = {}): void {
  post({ type: 'py:scripts', scripts: listScripts(getActiveWorkspaceId()), ...extra });
}

export function handlePyScriptsList(_msg: Record<string, unknown>, post: PostMessage): void {
  sendScripts(post);
}

export function handlePyScriptsSave(msg: Record<string, unknown>, post: PostMessage): void {
  const s = (msg.script ?? {}) as Record<string, unknown>;
  const saved = saveScript(getActiveWorkspaceId(), {
    id: typeof s.id === 'string' ? s.id : undefined,
    name: String(s.name ?? ''),
    folder: typeof s.folder === 'string' ? s.folder : undefined,
    source: String(s.source ?? ''),
  });
  sendScripts(post, { savedId: saved.id, clientId: msg.clientId });
}

export function handlePyScriptsDelete(msg: Record<string, unknown>, post: PostMessage): void {
  deleteScript(getActiveWorkspaceId(), String(msg.id ?? ''));
  sendScripts(post);
}

/**
 * Everything, when the panel goes away.
 *
 * Runs are stopped, debuggers quit, and every folder any session made is
 * removed — best effort, since the window is closing and nobody is left to
 * read a failure.
 */
export function disposePython(): void {
  for (const r of runs.values()) r.stop();
  runs.clear();
  const noop = () => { /* the panel is gone */ };
  for (const id of [...debuggers.keys()]) stopDebugger(id, noop);
  for (const id of [...touched.keys()]) void sweep(id);
}
