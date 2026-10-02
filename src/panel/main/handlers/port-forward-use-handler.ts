/**
 * Using a forward from Daakia — phase 3 of port forwarding.
 *
 *   dk8s:pf:call    — a request to the forwarded port: the actuator's health,
 *                     info, metrics, thread dump, loggers; a POST only to set
 *                     a logger's level.
 *   dk8s:pf:attach  — VS Code's debugger onto a forwarded JDWP or debugpy port.
 *   dk8s:pf:dump    — the actuator's thread or heap dump, saved with the
 *                     Doctor's artifacts and handed to its analyzer.
 *   dk8s:pf:openapi — the pod's OpenAPI document, imported as a collection.
 *
 * Every call names the forward and the local port, and goes nowhere unless a
 * running forward holds that port (see forwardHolding).
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import { join } from 'path';
import { callLocal, downloadLocal } from '../../../services/k8s/local-http';
import { SPEC_PATHS, pointSpecAt } from '../../../services/k8s/forward-openapi';
import { artifactName } from '../../../services/k8s/k8s-artifacts';
import { importAnyCollection } from '../../../services/import-any';
import { getCollectionTree } from '../../../storage/db';
import { forwardHolding } from './port-forward-handler';
import { artifactDir, handleDk8sAnalyze } from './k8s-handler';

type PostMessage = (msg: unknown) => void;

/** A path on the forwarded port: absolute, no `..`, no scheme or host. */
const PATH = /^\/(?!.*\.\.)[A-Za-z0-9._~!$&'()*+,;=:@%/?-]{0,400}$/;
/** The one write a forward allows: `…/loggers/<name>` — a logger's level. */
const LOGGER_POST = /(^|\/)loggers\/[A-Za-z0-9_.$-]{1,300}$/;
const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL', 'OFF', null];

export async function handlePfCall(msg: Record<string, unknown>, post: PostMessage): Promise<void> {
  const reqId = String(msg.reqId ?? '');
  const reply = (v: Record<string, unknown>) => post({ type: 'dk8s:pf:call', reqId, ...v });
  const port = Number(msg.port), path = String(msg.path ?? '');
  const f = forwardHolding(String(msg.id ?? ''), port);
  if (!f) { reply({ status: 0, error: 'That forward is not up any more.' }); return; }
  if (!PATH.test(path)) { reply({ status: 0, error: 'That path does not look right.' }); return; }

  if (msg.method === 'POST') {
    const level = (msg.json as { configuredLevel?: unknown } | undefined)?.configuredLevel;
    if (!LOGGER_POST.test(path.split('?')[0]) || !LEVELS.includes(level as string | null)) {
      reply({ status: 0, error: 'Only a logger level can be changed through a forward.' });
      return;
    }
    /* The page asked first on production; a message that skipped that is refused here too. */
    if (f.prod && msg.confirmed !== true) { reply({ status: 0, error: 'Changing a production logger needs confirming first.' }); return; }
    const key = `${f.id}:${path}`;
    const pending = reverts.get(key); if (pending) { clearTimeout(pending); reverts.delete(key); }
    const res = await callLocal({ port, path, method: 'POST', json: { configuredLevel: level }, timeoutMs: 10_000 });
    const revertMs = Number(msg.revertMs);
    let revertAt: number | undefined;
    if (res.status >= 200 && res.status < 300 && revertMs >= 60_000 && revertMs <= 3_600_000) {
      const previous = LEVELS.includes(msg.previous as string | null) ? (msg.previous as string | null) : null;
      revertAt = Date.now() + revertMs;
      const t = setTimeout(() => { reverts.delete(key); void revertLogger(f.id, port, path, previous, post); }, revertMs);
      (t as { unref?: () => void }).unref?.();
      reverts.set(key, t);
    }
    reply({ ...res, revertAt });
    return;
  }

  const accept = typeof msg.accept === 'string' && /^[\w/*.+;=, -]{1,120}$/.test(msg.accept) ? msg.accept : undefined;
  reply({ ...(await callLocal({ port, path, accept, timeoutMs: 15_000, maxBytes: 8 * 1024 * 1024 })) });
}

/** Logger levels waiting to go back, by `forward:path` — a new set on the same logger replaces its revert. */
const reverts = new Map<string, ReturnType<typeof setTimeout>>();

async function revertLogger(id: string, port: number, path: string, previous: string | null, post: PostMessage) {
  const logger = decodeURIComponent(path.split('/').pop() ?? '');
  if (!forwardHolding(id, port)) {
    post({ type: 'dk8s:pf:loggerReverted', id, logger, level: previous, error: 'The forward was down, so the level could not be put back.' });
    return;
  }
  const r = await callLocal({ port, path, method: 'POST', json: { configuredLevel: previous }, timeoutMs: 10_000 });
  post({ type: 'dk8s:pf:loggerReverted', id, logger, level: previous, error: r.status >= 200 && r.status < 300 ? undefined : r.error ?? `The pod answered ${r.status}.` });
}

/** The debugger extension each kind needs. */
const DEBUGGERS = {
  java: { ext: 'vscjava.vscode-java-debug', name: 'Debugger for Java' },
  python: { ext: 'ms-python.debugpy', name: 'Python Debugger' },
} as const;

export async function handlePfAttach(msg: Record<string, unknown>, post: PostMessage): Promise<void> {
  const reqId = String(msg.reqId ?? '');
  const reply = (v: Record<string, unknown>) => post({ type: 'dk8s:pf:attach', reqId, ...v });
  const port = Number(msg.port);
  const kind = msg.kind === 'python' ? 'python' : 'java';
  const f = forwardHolding(String(msg.id ?? ''), port);
  if (!f) { reply({ ok: false, error: 'That forward is not up any more.' }); return; }

  /* The browser build's vscode shim has no debugger to start. */
  const v = vscode as unknown as {
    debug?: { startDebugging: (folder: unknown, config: Record<string, unknown>) => Thenable<boolean> };
    extensions?: { getExtension: (id: string) => unknown };
  };
  if (!v.debug?.startDebugging) {
    reply({ ok: false, error: `Attaching starts a VS Code debug session, so it works in the extension. Here, point your IDE's remote debugger at localhost:${port}.` });
    return;
  }
  const d = DEBUGGERS[kind];
  if (v.extensions && !v.extensions.getExtension(d.ext)) {
    reply({ ok: false, error: `Install "${d.name}" (${d.ext}) to attach — or point any debugger at localhost:${port}.` });
    return;
  }
  const name = `${f.workload?.name ?? f.pod} :${port} (dk8s)`;
  const config = kind === 'java'
    ? { type: 'java', request: 'attach', name, hostName: 'localhost', port }
    : { type: 'debugpy', request: 'attach', name, connect: { host: 'localhost', port }, justMyCode: false };
  try {
    const ok = await v.debug.startDebugging(vscode.workspace.workspaceFolders?.[0], config);
    reply(ok ? { ok: true, name } : { ok: false, error: 'VS Code did not start the debug session — is the pod started with a debug agent on that port?' });
  } catch (e) {
    reply({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * The actuator's thread dump or heap dump, saved where the Doctor keeps what
 * it collects, then opened in the matching analyzer — the same hand-off a
 * jcmd dump gets. A heap dump pauses the JVM while it is written; the page
 * says so and asks first.
 */
export async function handlePfDump(msg: Record<string, unknown>, post: PostMessage, extensionRoot: string): Promise<void> {
  const reqId = String(msg.reqId ?? '');
  const reply = (v: Record<string, unknown>) => post({ type: 'dk8s:pf:dump', reqId, ...v });
  const port = Number(msg.port);
  const kind = msg.kind === 'heapdump' ? 'heapdump' : 'threaddump';
  const base = String(msg.base ?? '/actuator').replace(/\/+$/, '');
  const f = forwardHolding(String(msg.id ?? ''), port);
  if (!f) { reply({ error: 'That forward is not up any more.' }); return; }
  if (!PATH.test(`${base}/${kind}`)) { reply({ error: 'That path does not look right.' }); return; }
  if (kind === 'heapdump' && msg.confirmed !== true) { reply({ error: 'A heap dump pauses the JVM — it needs confirming first.' }); return; }

  const dir = artifactDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = join(dir, artifactName(f.pod, kind, kind === 'heapdump' ? 'hprof' : 'txt'));
  if (kind === 'threaddump') {
    const r = await callLocal({ port, path: `${base}/threaddump`, accept: 'text/plain', timeoutMs: 30_000, maxBytes: 64 * 1024 * 1024 });
    if (r.status !== 200 || !r.body.trim()) { reply({ error: r.error ?? `The pod answered ${r.status} to ${base}/threaddump.` }); return; }
    fs.writeFileSync(file, r.body, 'utf8');
    reply({ file, bytes: Buffer.byteLength(r.body) });
  } else {
    let last = 0;
    const r = await downloadLocal({
      port, path: `${base}/heapdump`, dest: file, accept: 'application/octet-stream',
      onProgress: bytes => { if (bytes - last >= 8 * 1024 * 1024) { last = bytes; post({ type: 'dk8s:pf:dumpProgress', reqId, bytes }); } },
    });
    if (r.status !== 200 || r.error || !r.bytes) {
      try { fs.unlinkSync(file); } catch { /* never written */ }
      reply({ error: r.error ?? `The pod answered ${r.status} to ${base}/heapdump.` });
      return;
    }
    reply({ file, bytes: r.bytes });
  }
  await handleDk8sAnalyze({ file, kind }, post, extensionRoot);
}

/**
 * The OpenAPI document a running service publishes, found at the usual
 * places on the forward's HTTP ports, pointed at the forward and imported as
 * a REST collection.
 */
export async function handlePfOpenApi(msg: Record<string, unknown>, post: PostMessage): Promise<void> {
  const reqId = String(msg.reqId ?? '');
  const reply = (v: Record<string, unknown>) => post({ type: 'dk8s:pf:openapi', reqId, ...v });
  const ports = (Array.isArray(msg.ports) ? msg.ports : []).map(Number).slice(0, 6);
  const id = String(msg.id ?? '');
  const held = ports.filter(p => forwardHolding(id, p));
  if (!held.length) { reply({ error: 'That forward is not up any more.' }); return; }

  const tried: string[] = [];
  for (const port of held) {
    for (const path of SPEC_PATHS) {
      tried.push(`:${port}${path}`);
      const r = await callLocal({ port, path, accept: 'application/json, application/yaml;q=0.9, */*;q=0.5', timeoutMs: 8_000, maxBytes: 8 * 1024 * 1024 });
      if (r.status !== 200 || r.truncated || !/"(openapi|swagger)"\s*:|^\s*(openapi|swagger)\s*:/m.test(r.body)) continue;
      const pointed = pointSpecAt(r.body, port);
      const result = importAnyCollection(pointed.text);
      if (!result.success) { reply({ error: `Found ${path} on :${port}, but it could not be imported: ${result.error}` }); return; }
      post({ type: 'collectionsData', protocol: 'rest', collections: getCollectionTree('rest') });
      reply({ ok: true, port, path, name: result.collectionName, count: result.requestCount, pointed: pointed.pointed });
      return;
    }
  }
  reply({ error: `No OpenAPI document at ${tried.slice(0, 4).join(', ')}${tried.length > 4 ? ` and ${tried.length - 4} more` : ''}.` });
}
