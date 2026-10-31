/**
 * The explorer's message handlers.
 *
 * Thin on purpose: every decision worth arguing about — the `ls` parsing, the
 * caps, what a failure means — lives in `pod-files`, where it is testable
 * without a cluster. This wires those to the panel and puts files on disk.
 */
import * as path from 'path';
import { createWriteStream, mkdirSync } from 'fs';
import { rm } from 'fs/promises';
import { begin, end, cancel } from '../../../services/k8s/cancel';
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

/*
  One pod's search, streamed.

  Hits go out as `files:search:hits` while `find` is still walking, and the
  whole answer as `files:search` when it ends — by itself, at the cap, or by
  `dk8s:cancel` on this request id. A search from `/` on a pod with big volumes
  can walk for minutes after the file is found; the reader sees it when the
  terminal would have.
*/
export async function handleFilesSearch(msg: Record<string, unknown>, post: PostMessage) {
  const requestId = msg.requestId as string;
  const op = begin(requestId, 'files:search');
  try {
    const r = await searchFiles(targetOf(msg), {
      root: String(msg.root ?? '/'),
      pattern: String(msg.pattern ?? ''),
      maxDepth: typeof msg.maxDepth === 'number' ? msg.maxDepth : undefined,
      limit: typeof msg.limit === 'number' ? msg.limit : undefined,
      caseSensitive: !!msg.caseSensitive,
      kind: msg.kind === 'dir' || msg.kind === 'any' ? msg.kind : 'file',
      signal: op.signal,
    }, hits => post({ type: 'files:search:hits', requestId, hits }));
    post({ type: 'files:search', requestId, ...r, stopped: op.cancelled() });
  } catch (err) {
    post({
      type: 'files:search', requestId, hits: [], capped: false, command: '',
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    end(requestId);
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

/*
  Where a download goes: asked, as every other save in Daakia asks.

  Explorer downloads went straight to a temp folder with no dialog, while log
  exports opened a folder picker — so the same Download button meant "pick a
  place" on one screen and "somewhere under %TEMP%" on the next, and the file
  was only findable through the Downloads tab. Now a file opens a Save dialog
  and a folder a folder picker, starting in the user's Downloads folder.

  A retry from the Downloads tab names the path it used the first time, so it
  does not ask again. Cancelling the dialog starts nothing.
*/
async function askFileDest(name: string, pod: string): Promise<string | undefined> {
  try {
    const vscode = await import('vscode');
    const picked = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(userDownloads(), name)),
      saveLabel: 'Download',
      title: `Download ${name} from ${pod}`,
    });
    return picked?.fsPath;
  } catch {
    // No VS Code API (a test, a host without dialogs): the old place.
    return path.join(downloadDir(pod), name);
  }
}

async function askDirDest(name: string, pod: string): Promise<string | undefined> {
  try {
    const vscode = await import('vscode');
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
      defaultUri: vscode.Uri.file(userDownloads()),
      openLabel: 'Download here',
      title: `Download the folder ${name} from ${pod} into…`,
    });
    return picked?.[0] ? path.join(picked[0].fsPath, name) : undefined;
  } catch {
    return path.join(downloadDir(pod), name);
  }
}

function userDownloads(): string {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
  return home ? path.join(home, 'Downloads') : downloadDir('');
}

/** Where downloads landed before they asked, and still do with no dialog to ask in. */
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
  const dest = typeof msg.dest === 'string' && msg.dest ? msg.dest : await askFileDest(name, t.pod);
  if (!dest) return;
  /*
    Keyed by destination, which is what the webview already has.

    A download's id has to be something both sides can name without a round
    trip, and the destination path is unique per download and already on every
    row. The same registry the searches use, so Stop means one thing.
  */
  const op = begin(`dl:${dest}`, 'files:download');

  const args = [
    '--context', t.context, '-n', t.namespace, 'exec', t.pod,
    ...(t.container ? ['-c', t.container] : []),
    '--', 'cat', remote,
  ];

  post({
    type: 'files:downloadStarted', name, dest, command: showCommand(args),
    // Echoed so the row can start it again without the Explorer that opened it.
    source: { context: t.context, namespace: t.namespace, pod: t.pod, container: t.container, path: remote },
  });

  try {
    const child = await spawnKubectl(args);
    const out = createWriteStream(dest);
    let bytes = 0;
    let stderr = '';

    /*
      Cancelling kills the copy rather than only forgetting about it.

      `cat` on a multi-gigabyte file keeps streaming whatever the panel thinks,
      and a download nobody wants is still a download filling a disk. The
      partial file goes too: half a tarball on disk under the name of a whole
      one is worse than no file, because the next person to open it has no way
      to tell.
    */
    op.signal.addEventListener('abort', () => {
      child.kill();
      out.destroy();
      void rm(dest, { force: true }).catch(() => {});
      post({ type: 'files:downloadFailed', name, error: 'Cancelled.', cancelled: true });
    }, { once: true });

    child.stdout?.on('data', (c: Buffer) => { bytes += c.length; });
    child.stdout?.pipe(out);
    child.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });

    child.on('close', code => {
      out.end();
      end(`dl:${dest}`);
      if (op.cancelled()) return;
      if (code === 0) post({ type: 'files:downloadDone', name, dest, bytes });
      else post({ type: 'files:downloadFailed', name, error: explainExecFailure(stderr, remote) });
    });
  } catch (err) {
    end(`dl:${dest}`);
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
  const dest = typeof msg.dest === 'string' && msg.dest ? msg.dest : await askDirDest(name, t.pod);
  if (!dest) return;
  const folder = path.dirname(dest);

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

  post({
    type: 'files:downloadStarted', name, dest, directory: true, command: showCommand(args),
    source: { context: t.context, namespace: t.namespace, pod: t.pod, container: t.container, path: remote },
  });

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

  /*
    Stoppable, in both of the ways it has to be.

    `cancelled()` between pods keeps the sweep from starting the next one, and
    the signal kills the `find` already running inside the current one — which
    is the half that matters, because the pod someone presses Stop during is
    the slow pod. Without the signal, Stop still meant waiting out a `find` over
    /sys and /proc.
  */
  const op = begin(requestId, 'files:searchMany');

  post({ type: 'files:searchMany:start', requestId, total: pods.length });

  try {
  for (const raw of pods) {
    if (op.cancelled()) break;
    const t = targetOf(raw);
    try {
      const r = await searchFiles(t, {
        root,
        pattern,
        limit: typeof msg.limit === 'number' ? msg.limit : 200,
        maxDepth: typeof msg.maxDepth === 'number' ? msg.maxDepth : undefined,
        caseSensitive: !!msg.caseSensitive,
        signal: op.signal,
      }, hits => {
        /* As they are found, so a slow pod shows its file before its walk ends. */
        if (!op.cancelled()) post({ type: 'files:searchMany:hits', requestId, pod: t.pod, namespace: t.namespace, context: t.context, hits });
      });
      /*
        A pod killed by Stop is not a pod that failed.

        An aborted exec surfaces as a spawn failure, which this loop otherwise
        reports as "that pod could not be searched" — so a cancelled sweep would
        end in a column of red rows blaming the user's own Stop.
      */
      if (op.cancelled()) break;
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
      if (op.cancelled()) break;
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
    // Said, not inferred: "27 of 34" with no reason reads as a search that
    // lost seven pods rather than one that was stopped.
    cancelled: op.cancelled(),
    total: pods.length,
  });
  } finally {
    end(requestId);
  }
}

/**
 * Stop whatever that request id is doing.
 *
 * One handler for every long dk8s operation rather than one per feature — see
 * `cancel.ts`. It answers either way: a request that had already finished is
 * not a failure, and the view should not report one.
 */
export function handleDk8sCancel(msg: Record<string, unknown>, post: PostMessage): void {
  const requestId = String(msg.requestId ?? '');
  if (!requestId) return;
  const stopped = cancel(requestId);
  post({ type: 'dk8s:cancelled', requestId, stopped });
}
