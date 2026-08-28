/**
 * Heap dump handler — owns the forked parse worker.
 *
 * The extension host never parses a dump itself. It forks dist/heap-worker.js
 * with a raised heap ceiling, relays progress, and can kill it outright, so a
 * multi-gigabyte parse can neither exhaust the host's memory nor take VS Code
 * down when a malformed file makes it throw.
 *
 * One parse at a time: a second request cancels the first, because two
 * concurrent 8 GB workers is a way to wedge the machine.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { readFileSync } from 'fs';
import { fork, type ChildProcess } from 'child_process';

type PostMessage = (msg: unknown) => void;

let active: ChildProcess | null = null;

function killActive() {
  if (!active) return;
  try { active.kill(); } catch { /* already gone */ }
  active = null;
}

/** Ask the user for a dump, then hand it to the worker. */
export async function handleHeapOpen(postMessage: PostMessage, extensionRoot: string) {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    title: 'Open heap dump',
    openLabel: 'Analyze',
    filters: { 'Heap dumps': ['hprof'], 'All files': ['*'] },
  });
  if (!picked?.[0]) return;
  handleHeapAnalyze({ path: picked[0].fsPath }, postMessage, extensionRoot);
}

export function handleHeapAnalyze(msg: Record<string, unknown>, postMessage: PostMessage, extensionRoot: string) {
  const dumpPath = msg.path as string;
  if (!dumpPath) {
    postMessage({ type: 'heap:error', message: 'No heap dump path was provided.' });
    return;
  }

  killActive();

  const workerPath = path.join(extensionRoot, 'dist', 'heap-worker.js');
  const child = fork(workerPath, [], {
    // The ceiling the plan calls for. Without it a real dump dies in pass A
    // with an out-of-memory that looks like a parser bug.
    execArgv: ['--max-old-space-size=8192'],
    silent: true,
  });
  active = child;

  postMessage({ type: 'heap:started', path: dumpPath, name: path.basename(dumpPath) });

  child.on('message', (m: Record<string, unknown>) => {
    if (m.type === 'progress') {
      postMessage({ type: 'heap:progress', pass: m.pass, bytesRead: m.bytesRead, totalBytes: m.totalBytes });
    } else if (m.type === 'done') {
      // Deliberately NOT killed: the exploration views query the resident index,
      // and re-parsing per view would cost minutes each time. It is disposed when
      // another dump is opened, on cancel, or when the panel goes away.
      postMessage({ type: 'heap:done', path: dumpPath, name: path.basename(dumpPath), summary: m.summary });
    } else if (m.type === 'baselineSet') {
      postMessage({ type: 'heap:baselineSet', name: m.name, hasBaseline: m.hasBaseline });
    } else if (m.type === 'queryResult') {
      postMessage({ type: 'heap:queryResult', requestId: m.requestId, result: m.result });
    } else if (m.type === 'queryError') {
      postMessage({ type: 'heap:queryError', requestId: m.requestId, message: m.message });
    } else if (m.type === 'cancelled') {
      postMessage({ type: 'heap:cancelled' });
      killActive();
    } else if (m.type === 'error') {
      postMessage({ type: 'heap:error', message: m.message });
      killActive();
    }
  });

  // A worker that dies without reporting is still a failure the UI must show,
  // otherwise the progress bar spins forever.
  child.on('exit', (code, signal) => {
    if (active !== child) return;
    active = null;
    if (code !== 0) {
      postMessage({
        type: 'heap:error',
        message: signal
          ? `Heap worker stopped (${signal}) — the dump may be larger than the 8 GB ceiling.`
          : `Heap worker exited with code ${code}.`,
      });
    }
  });

  child.stderr?.on('data', (d: Buffer) => console.error('[heap-worker]', d.toString().trim()));

  child.send({ type: 'parse', path: dumpPath });
}

/**
 * Resolve a heap class name to a file in the open workspace.
 *
 * This is the thing MAT structurally cannot do: it has no workspace, so a leak
 * suspect is a string in a report rather than somewhere you can go.
 *
 * Binding is by class name, not by allocation site. A standard dumpHeap HPROF
 * assigns every instance a stack-trace serial but records only a handful of
 * real traces — they are the live thread stacks, not per-object allocation
 * sites — so allocation-site binding would resolve almost nothing while looking
 * like it should work.
 */
export async function handleHeapLocateClass(msg: Record<string, unknown>, postMessage: PostMessage) {
  const requestId = msg.requestId as string;
  const raw = String(msg.className ?? '');

  const reply = (files: { path: string; relative: string }[], note?: string) =>
    postMessage({ type: 'heap:locateResult', requestId, className: raw, files, note });

  // Arrays, primitives and JDK-internal types are never in the user's workspace.
  if (!raw || raw.startsWith('[')) return reply([], 'Array types have no source file.');
  if (/^(java|javax|jdk|sun|com\.sun)\./.test(raw)) return reply([], 'JDK class — not part of this workspace.');

  // Foo$Bar and Foo$1 both live in Foo.java; lambdas carry a generated suffix.
  const binary = raw.split('$')[0].split('/')[0];
  const parts = binary.split('.');
  const simpleName = parts[parts.length - 1];
  const packagePath = parts.slice(0, -1).join('/');
  if (!simpleName) return reply([]);

  try {
    const found = await vscode.workspace.findFiles(
      `**/${simpleName}.{java,kt,scala,groovy}`,
      '**/{node_modules,build,out,target,dist,.git}/**',
      50,
    );
    // Prefer a file whose directory matches the package — several modules can
    // legitimately contain a same-named class.
    const scored = found
      .map(uri => {
        const p = uri.fsPath.split(path.sep).join('/');
        return { uri, p, exact: packagePath ? p.includes(`/${packagePath}/`) : false };
      })
      .sort((a, b) => Number(b.exact) - Number(a.exact));

    reply(
      scored.map(f => ({
        path: f.uri.fsPath,
        relative: vscode.workspace.asRelativePath(f.uri),
      })),
      scored.length === 0 ? 'No matching source file in this workspace.' : undefined,
    );
  } catch (err) {
    reply([], err instanceof Error ? err.message : String(err));
  }
}

/** Open a located file, focused on the class declaration where we can find it. */
export async function handleHeapOpenSource(msg: Record<string, unknown>) {
  const filePath = msg.path as string;
  const className = String(msg.className ?? '');
  if (!filePath) return;

  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
  const simple = className.split('.').pop()?.split('$').pop() ?? '';
  // Jump to the declaration rather than dumping the user at line 1.
  let line = 0;
  if (simple) {
    const safe = simple.replace(/[^A-Za-z0-9_]/g, '');
    const re = new RegExp(String.raw`\b(class|interface|enum|record|object)\s+` + safe + String.raw`\b`);
    for (let i = 0; i < doc.lineCount; i++) {
      if (re.test(doc.lineAt(i).text)) { line = i; break; }
    }
  }
  const pos = new vscode.Position(line, 0);
  await vscode.window.showTextDocument(doc, {
    selection: new vscode.Range(pos, pos),
    preview: false,
    viewColumn: vscode.ViewColumn.Beside,
  });
}

/** Relay a view's query to the resident worker. */
export function handleHeapQuery(msg: Record<string, unknown>, postMessage: PostMessage) {
  const requestId = msg.requestId as string;
  if (!active) {
    postMessage({ type: 'heap:queryError', requestId, message: 'No heap dump is loaded.' });
    return;
  }
  try {
    active.send({ type: 'query', requestId, query: msg.query });
  } catch {
    postMessage({ type: 'heap:queryError', requestId, message: 'The heap worker is no longer running.' });
  }
}

/**
 * Thread dumps are text and small, so they are parsed in the extension host
 * rather than forked out. The heap worker exists because a 45M-object graph
 * needs its own heap ceiling; a 2,000-thread text file does not.
 */
export async function handleThreadsOpen(postMessage: PostMessage, extensionRoot: string) {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    title: 'Open thread dump',
    openLabel: 'Analyze',
    filters: { 'Thread dumps': ['txt', 'tdump', 'log', 'jstack'], 'All files': ['*'] },
  });
  if (!picked?.[0]) return;
  handleThreadsAnalyze({ path: picked[0].fsPath }, postMessage, extensionRoot);
}

export function handleThreadsAnalyze(msg: Record<string, unknown>, postMessage: PostMessage, extensionRoot: string) {
  const dumpPath = msg.path as string;
  if (!dumpPath) {
    postMessage({ type: 'threads:error', message: 'No thread dump path was provided.' });
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const worker = require(path.join(extensionRoot, 'dist', 'heap-worker.js'));
    const text = readFileSync(dumpPath, 'utf8');
    const dump = worker.parseThreadDump(text);
    if (!dump.threads.length) {
      postMessage({
        type: 'threads:error',
        message: 'No threads were found in that file. A thread dump looks like the output of `jstack <pid>` or `jcmd <pid> Thread.print`.',
      });
      return;
    }
    postMessage({
      type: 'threads:done',
      name: path.basename(dumpPath),
      dump: { timestamp: dump.timestamp, jvm: dump.jvm, unparsedLines: dump.unparsedLines },
      verdict: worker.analyzeThreadDump(dump),
      threads: dump.threads.map((t: Record<string, unknown>) => ({
        name: t.name, state: t.state, daemon: t.daemon, cpuMs: t.cpuMs,
        status: t.status, stateDetail: t.stateDetail,
        frames: (t.frames as { raw: string; jdk: boolean }[]).slice(0, 40),
        waitingToLock: t.waitingToLock, locked: t.locked, parkingOn: t.parkingOn,
      })),
    });
  } catch (err) {
    postMessage({ type: 'threads:error', message: err instanceof Error ? err.message : String(err) });
  }
}

/** Snapshot the loaded dump's per-class totals for a later comparison. */
export function handleHeapSetBaseline(postMessage: PostMessage) {
  if (!active) {
    postMessage({ type: 'heap:error', message: 'No heap dump is loaded.' });
    return;
  }
  try { active.send({ type: 'setBaseline' }); }
  catch { postMessage({ type: 'heap:error', message: 'The heap worker is no longer running.' }); }
}

export function handleHeapCancel(postMessage: PostMessage) {
  if (!active) return;
  // Ask first so the worker can unwind cleanly; kill on the way out regardless.
  try { active.send({ type: 'cancel' }); } catch { /* already gone */ }
  setTimeout(() => { if (active) { killActive(); postMessage({ type: 'heap:cancelled' }); } }, 250);
}

export function disposeHeapHandler() {
  killActive();
}
