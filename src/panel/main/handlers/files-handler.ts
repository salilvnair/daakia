/**
 * The explorer's message handlers.
 *
 * Thin on purpose: every decision worth arguing about — the `ls` parsing, the
 * caps, what a failure means — lives in `pod-files`, where it is testable
 * without a cluster. This wires those to the panel and puts files on disk.
 */
import * as path from 'path';
import { createWriteStream, mkdirSync } from 'fs';
import {
  listDirectory, searchFiles, readFile, showCommand,
  explainExecFailure, type PodTarget,
} from '../../../services/k8s/pod-files';
import { run, spawnKubectl } from '../../../services/k8s/kubectl';

type PostMessage = (msg: Record<string, unknown>) => void;

function targetOf(msg: Record<string, unknown>): PodTarget {
  return {
    context: String(msg.context ?? ''),
    namespace: String(msg.namespace ?? ''),
    pod: String(msg.pod ?? ''),
    container: msg.container ? String(msg.container) : undefined,
  };
}

export async function handleFilesList(msg: Record<string, unknown>, post: PostMessage) {
  const requestId = msg.requestId as string;
  try {
    const r = await listDirectory(targetOf(msg), String(msg.path ?? '/'));
    post({ type: 'files:list', requestId, ...r });
  } catch (err) {
    post({
      type: 'files:list', requestId, path: msg.path, entries: [], command: '',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function handleFilesSearch(msg: Record<string, unknown>, post: PostMessage) {
  const requestId = msg.requestId as string;
  try {
    const r = await searchFiles(targetOf(msg), {
      root: String(msg.root ?? '/'),
      pattern: String(msg.pattern ?? ''),
      maxDepth: typeof msg.maxDepth === 'number' ? msg.maxDepth : undefined,
      limit: typeof msg.limit === 'number' ? msg.limit : undefined,
    });
    post({ type: 'files:search', requestId, ...r });
  } catch (err) {
    post({
      type: 'files:search', requestId, hits: [], capped: false, command: '',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function handleFilesRead(msg: Record<string, unknown>, post: PostMessage) {
  const requestId = msg.requestId as string;
  try {
    const r = await readFile(
      targetOf(msg),
      String(msg.path ?? ''),
      typeof msg.size === 'number' ? msg.size : undefined,
    );
    post({ type: 'files:read', requestId, ...r });
  } catch (err) {
    post({
      type: 'files:read', requestId, path: msg.path, bytes: 0, command: '',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Where downloads land, beside the artifacts dk8s already collects. */
export function downloadDir(pod: string): string {
  const base = path.join(
    process.env.TEMP ?? process.env.TMPDIR ?? '/tmp',
    'daakia-dk8s', 'files', pod,
  );
  mkdirSync(base, { recursive: true });
  return base;
}

/**
 * One file, streamed to disk.
 *
 * `cat` rather than `kubectl cp`, and that is the whole point: `cp` is tar over
 * the exec channel and fails outright on a container without tar, while `cat`
 * needs nothing but `cat`. Without a TTY the channel does not touch the bytes,
 * so this is byte-exact for a binary too.
 *
 * Streamed rather than buffered because the files worth downloading are the
 * ones too big to hold — a 1.4 GB database through a string is an out-of-memory
 * crash in the extension host.
 */
export async function handleFilesDownload(msg: Record<string, unknown>, post: PostMessage) {
  const t = targetOf(msg);
  const remote = String(msg.path ?? '');
  const name = String(msg.name ?? (path.basename(remote) || 'download'));
  const dest = path.join(downloadDir(t.pod), name);

  const args = [
    '--context', t.context, '-n', t.namespace, 'exec', t.pod,
    ...(t.container ? ['-c', t.container] : []),
    '--', 'cat', remote,
  ];

  post({ type: 'files:downloadStarted', name, dest, command: showCommand(args) });

  try {
    const child = await spawnKubectl(args);
    const out = createWriteStream(dest);
    let bytes = 0;
    let stderr = '';

    child.stdout?.on('data', (c: Buffer) => { bytes += c.length; });
    child.stdout?.pipe(out);
    child.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });

    child.on('close', code => {
      out.end();
      if (code === 0) post({ type: 'files:downloadDone', name, dest, bytes });
      else post({ type: 'files:downloadFailed', name, error: explainExecFailure(stderr, remote) });
    });
  } catch (err) {
    post({
      type: 'files:downloadFailed', name,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * A directory, via `kubectl cp` — the one operation that genuinely needs tar.
 *
 * The remote path keeps its leading slash here and `cp` strips it, resolving
 * what is left against the container's WORKDIR. That is a bug this repo has
 * already shipped once: it broke on every image whose WORKDIR was not `/`,
 * which is Jetty, Tomcat and every Spring Boot image. Passing the path with the
 * slash and letting `cp` do its own thing is what the artifacts code learned to
 * do, and this follows it.
 */
export async function handleFilesDownloadDir(msg: Record<string, unknown>, post: PostMessage) {
  const t = targetOf(msg);
  const remote = String(msg.path ?? '');
  const name = String(msg.name ?? (path.basename(remote) || 'directory'));
  const dest = path.join(downloadDir(t.pod), name);

  const args = [
    '--context', t.context, '-n', t.namespace,
    'cp', `${t.namespace}/${t.pod}:${remote}`, dest,
    ...(t.container ? ['-c', t.container] : []),
  ];

  post({ type: 'files:downloadStarted', name, dest, command: showCommand(args) });

  try {
    const r = await run(args, { timeoutMs: 10 * 60_000 });
    if (r.code === 0) {
      post({ type: 'files:downloadDone', name, dest, bytes: 0 });
      return;
    }
    /*
      The tar-less case, named.

      `kubectl cp` fails here with an executable-lookup error that nobody
      connects to this cause, and the useful next step — copy the files one at
      a time, which needs only `cat` — is not something the raw message hints
      at.
    */
    const noTar = /executable file not found|"tar"/.test(r.stderr);
    post({
      type: 'files:downloadFailed', name,
      error: noTar
        ? 'This container has no tar, and copying a directory needs it. '
          + 'Individual files still download — those go over cat and need nothing.'
        : explainExecFailure(r.stderr, remote),
    });
  } catch (err) {
    post({
      type: 'files:downloadFailed', name,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
