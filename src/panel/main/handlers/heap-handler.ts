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

export function handleHeapCancel(postMessage: PostMessage) {
  if (!active) return;
  // Ask first so the worker can unwind cleanly; kill on the way out regardless.
  try { active.send({ type: 'cancel' }); } catch { /* already gone */ }
  setTimeout(() => { if (active) { killActive(); postMessage({ type: 'heap:cancelled' }); } }, 250);
}

export function disposeHeapHandler() {
  killActive();
}
