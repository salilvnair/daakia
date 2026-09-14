/**
 * Scan a repository for endpoints, on the host where the filesystem is.
 *
 * Everything interesting is in `services/scan` and is pure; this is the part
 * that has a directory to read and a webview to talk to. It does three things:
 * picks a folder, reports what config it can see before committing to a scan,
 * and runs one.
 *
 * ── Why the scan does not stream ──
 *
 * A scan of a large repository takes a couple of seconds, and progress is
 * reported as it goes — but the result is posted once, whole. Streaming
 * findings would put a list on screen that reorders itself while somebody is
 * reading it, and the review screen's whole job is to be read.
 *
 * ── Read-only, and that is a guarantee ──
 *
 * Nothing here writes into the repository, runs a build, or installs anything.
 * A scan of a repository you have just cloned is as safe as reading it, which
 * is the only basis on which anybody should point this at code they did not
 * write.
 */

import * as vscode from 'vscode';
/* Declared locally, the way every other handler in here does it. */
type PostMessage = (msg: unknown) => void;
import { scanRepository, walk, repoRoot, DETECTORS } from '../../../services/scan/scanner';
import { profiles } from '../../../services/scan/spring/base-url';
import { toRequest, collectionVariables } from '../../../services/scan/to-requests';

/** Ask for a folder. The webview cannot open a dialog; the host can. */
export async function handleScanPickFolder(
  _msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  /*
    The browser preview has no dialog to open — the same guard
    `handleOpenWorkspace` carries, and for the same reason: without it the
    button does nothing at all and looks broken.
  */
  if (!vscode.window?.showOpenDialog) {
    postMessage({
      type: 'scan:error',
      message: 'Choosing a folder needs the desktop app. Paste the path instead.',
    });
    return;
  }

  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Scan this repository',
    title: 'Scan code for requests',
  });
  const dir = picked?.[0]?.fsPath;
  if (!dir) return;                      // cancelled: not an error, not a message

  postMessage({ type: 'scan:folderPicked', dir });
}

/**
 * What can be known about a folder without committing to a scan.
 *
 * Which detectors recognise it, and which profiles its configuration offers —
 * both from the manifests alone, so this is cheap enough to run as somebody
 * finishes typing a path.
 */
export async function handleScanInspect(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const dir = String(msg.dir ?? '');
  if (!dir) return;

  try {
    /* A small cap: this is a look, not a scan. Manifests and configuration are
       near the top of a tree, and the walk is breadth-first for exactly this. */
    const { files } = walk(dir, { maxFiles: 600 });
    const root = repoRoot(dir, files);

    const detected = DETECTORS
      .filter(d => { try { return d.present(root); } catch { return false; } })
      .map(d => ({ id: d.id, label: d.label }));

    postMessage({
      type: 'scan:inspected',
      dir,
      detected,
      profiles: profiles(root),
      /* Named so the screen can say what it recognised it BY, rather than
         claiming a framework and leaving somebody to wonder how it knows. */
      manifests: files.filter(f => /(^|\/)(pom\.xml|build\.gradle(\.kts)?|package\.json|requirements\.txt|pyproject\.toml)$/.test(f)),
    });
  } catch (e) {
    postMessage({
      type: 'scan:error',
      message: e instanceof Error ? e.message : 'That folder could not be read.',
    });
  }
}

/** Run the scan and post everything it found, once. */
export async function handleScanRun(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const dir = String(msg.dir ?? '');
  if (!dir) {
    postMessage({ type: 'scan:error', message: 'No folder to scan.' });
    return;
  }

  const profile = msg.profile ? String(msg.profile) : undefined;
  const maxFiles = Number(msg.maxFiles) || 2000;
  const ignore = Array.isArray(msg.ignore) ? (msg.ignore as string[]) : undefined;

  try {
    /*
      Progress is throttled to something a person can read. A walk reports a
      file every few milliseconds, and posting each one makes a name that
      flickers rather than a name you can see.
    */
    let lastPost = 0;
    const result = scanRepository(dir, {
      profile, maxFiles, ignore,
      onProgress: (p) => {
        const now = Date.now();
        if (now - lastPost < 90) return;
        lastPost = now;
        postMessage({ type: 'scan:progress', ...p });
      },
    });

    postMessage({
      type: 'scan:result',
      dir,
      detected: result.detected,
      baseUrl: result.baseUrl,
      variables: collectionVariables(result.baseUrl),
      /* Findings go over as REQUESTS, already in the shape the collection
         writer wants — the webview should not have to know what a Finding is
         to render a review of one. The provenance rides along inside `scan`. */
      requests: result.findings.map(f => toRequest(f)),
      unresolved: result.unresolved,
      filesWalked: result.filesWalked,
      capped: result.capped,
      ms: result.ms,
    });
  } catch (e) {
    postMessage({
      type: 'scan:error',
      message: e instanceof Error ? e.message : 'The scan could not be completed.',
    });
  }
}
