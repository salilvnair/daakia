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
  listDirectory, searchFiles, readFile, showCommand, directorySize,
  explainExecFailure, type PodTarget,
} from '../../../services/k8s/pod-files';
import { podMounts } from '../../../services/k8s/pod-mounts';
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

/**
 * What is mounted where, from the pod spec rather than from inside it.
 *
 * A `get pod`, not an exec, so it answers on images where nothing else in the
 * Explorer does — on a distroless pod the mount list is the only thing this
 * tab can tell you, and that is better than an empty screen.
 */
export async function handleFilesMounts(msg: Record<string, unknown>, post: PostMessage) {
  const requestId = msg.requestId as string;
  try {
    const r = await podMounts(
      String(msg.context ?? ''), String(msg.namespace ?? ''), String(msg.pod ?? ''),
    );
    post({ type: 'files:mounts', requestId, ...r });
  } catch (err) {
    post({
      type: 'files:mounts', requestId, mounts: [], command: '',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** How big a directory really is — one `du`, asked for deliberately. */
export async function handleFilesDirSize(msg: Record<string, unknown>, post: PostMessage) {
  const requestId = msg.requestId as string;
  try {
    const r = await directorySize(targetOf(msg), String(msg.path ?? '/'));
    post({ type: 'files:dirSize', requestId, ...r });
  } catch (err) {
    post({
      type: 'files:dirSize', requestId, path: msg.path, command: '',
      error: err instanceof Error ? err.message : String(err),
    });
  }
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
  const folder = downloadDir(t.pod);
  const dest = path.join(folder, name);

  /*
    The destination goes in RELATIVE, from a working directory.

    `kubectl cp` decides which side is remote by splitting each argument on
    `:` and reading what is before it as `[namespace/]pod`. A Windows path
    begins `C:\`, so it reads `C` as a pod, concludes both arguments are
    remote and fails with "one of src or dest must be a local file
    specification" — a message that names neither the colon nor the drive
    letter, on a path the user can see is plainly local.

    Passing the bare name from a cwd of the download folder removes the colon
    entirely. It costs nothing on platforms that never had the problem, and it
    is the only fix that does not involve parsing kubectl's argument grammar
    ourselves.
  */
  mkdirSync(folder, { recursive: true });

  const args = [
    '--context', t.context, '-n', t.namespace,
    'cp', `${t.namespace}/${t.pod}:${remote}`, name,
    ...(t.container ? ['-c', t.container] : []),
  ];

  post({ type: 'files:downloadStarted', name, dest, directory: true, command: showCommand(args) });

  try {
    const r = await run(args, { timeoutMs: 10 * 60_000, cwd: folder });
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

/**
 * Open the downloads folder in the system file manager.
 *
 * The panel prints the path too, because a reveal that silently does nothing —
 * a headless host, a folder the shell will not open — leaves the reader with
 * no way to find the file at all.
 */
export async function handleFilesReveal(msg: Record<string, unknown>, post: PostMessage) {
  const dir = String(msg.path ?? '');
  if (!dir) return;
  try {
    const vscode = await import('vscode');
    await vscode.env.openExternal(vscode.Uri.file(dir));
  } catch {
    // The browser path has no VS Code API. Saying so beats a dead button.
    post({ type: 'files:revealUnavailable', path: dir });
  }
}

/**
 * Search many pods' filesystems at once, for the Quick Search panel.
 *
 * The log search reads streams on this machine; this one asks each pod to walk
 * its own filesystem, which is the only way it can be done — there is no
 * filesystem API to query. So the shape is different from log search in one
 * way that matters: a pod that cannot answer is a RESULT, not a failure. A
 * distroless sidecar in a list of twelve should report "no shell" beside the
 * eleven that worked, rather than taking the search down with it.
 */
export async function handleFilesSearchMany(msg: Record<string, unknown>, post: PostMessage) {
  const requestId = msg.requestId as string;
  const pattern = String(msg.pattern ?? '');
  const root = String(msg.root ?? '/');
  const pods = Array.isArray(msg.pods) ? msg.pods as Record<string, unknown>[] : [];

  let scanned = 0;
  let matched = 0;
  const podsWithHits = new Set<string>();

  post({ type: 'files:searchMany:start', requestId, total: pods.length });

  for (const raw of pods) {
    const t = targetOf(raw);
    try {
      const r = await searchFiles(t, {
        root,
        pattern,
        limit: typeof msg.limit === 'number' ? msg.limit : 200,
        maxDepth: typeof msg.maxDepth === 'number' ? msg.maxDepth : undefined,
        caseSensitive: !!msg.caseSensitive,
      });
      scanned++;
      if (r.hits.length) {
        matched += r.hits.length;
        podsWithHits.add(t.pod);
      }
      post({
        type: 'files:searchMany:pod',
        requestId,
        pod: t.pod,
        namespace: t.namespace,
        context: t.context,
        hits: r.hits,
        capped: r.capped,
        command: r.command,
        error: r.error,
      });
    } catch (err) {
      scanned++;
      post({
        type: 'files:searchMany:pod', requestId,
        pod: t.pod, namespace: t.namespace, context: t.context,
        hits: [], capped: false, command: '',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  post({
    type: 'files:searchMany:done', requestId,
    scanned, matched, podsWithHits: podsWithHits.size,
  });
}
