/**
 * Downloads pulled out of a pod, and what happened to each one.
 *
 * This exists because the first cut of the explorer had no receiver at all:
 * the host streamed the file to disk correctly, posted `files:downloadStarted`
 * and `files:downloadDone`, and nothing in the webview was listening. A
 * download that worked said nothing, and — worse — a download that FAILED said
 * nothing either, so a tar-less container refusing a directory produced a
 * carefully worded message that no one would ever read.
 *
 * A file operation that gives no feedback is indistinguishable from one that
 * silently did nothing, which is why this is a store rather than a toast: the
 * result has to outlive the moment, be findable later, and carry the path.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';

export type DownloadState = 'running' | 'done' | 'failed';

export interface Download {
  /** Destination path, which is unique per download and stable to key on. */
  id: string;
  name: string;
  /** Where it landed, or would have. Printed, because "where did it go" is
   *  the question every download list is eventually asked. */
  dest: string;
  state: DownloadState;
  /** Bytes written. Absent for a directory, which arrives via tar. */
  bytes?: number;
  error?: string;
  /** The kubectl that ran, for the same reason every other dk8s view shows it. */
  command?: string;
  startedAt: number;
  finishedAt?: number;
  /** True for a directory copy — it needs tar and can fail where a file will not. */
  directory?: boolean;
  /**
   * Enough to run it again.
   *
   * A failed download is almost always worth retrying — a container that was
   * mid-restart, a `tar` that was not there yet, a connection that dropped —
   * and without this the only way back was to find the file in the Explorer
   * again. Kept per download rather than derived, because the row outlives the
   * view that started it.
   */
  source?: { context: string; namespace: string; pod: string; container?: string; path: string };
  /** Cancelled by the user rather than failed on its own. */
  cancelled?: boolean;
}

interface FilesStore {
  downloads: Download[];
  /** Unread completions, for the badge on the tab. */
  unseen: number;
  started(d: {
    name: string; dest: string; command?: string; directory?: boolean;
    source?: Download['source'];
  }): void;
  finished(d: { name: string; dest?: string; bytes?: number }): void;
  failed(d: { name: string; error: string; cancelled?: boolean }): void;
  /** Stop one that is still running. The host kills the copy and removes the part-file. */
  cancel(id: string): void;
  /** Run a failed one again, from what it was started with. */
  retry(id: string): void;
  /** Forget one row. */
  dismiss(id: string): void;
  markSeen(): void;
  clearFinished(): void;
}

/**
 * Match by name, newest first.
 *
 * The host reports completion by name rather than by an id it was given, so
 * two downloads of the same file in one session would otherwise be
 * indistinguishable. Newest-first resolution means the second one settles the
 * second row, which is what someone watching the list expects to see.
 */
function resolve(list: Download[], name: string): number {
  for (let i = 0; i < list.length; i++) {
    if (list[i].name === name && list[i].state === 'running') return i;
  }
  return -1;
}

export const useDk8sFilesStore = create<FilesStore>((set) => ({
  downloads: [],
  unseen: 0,

  started: d => set(s => ({
    downloads: [
      {
        id: `${d.dest}#${Date.now()}`,
        name: d.name,
        dest: d.dest,
        state: 'running' as const,
        command: d.command,
        directory: d.directory,
        source: d.source,
        startedAt: Date.now(),
      },
      ...s.downloads,
    ].slice(0, 50),
  })),

  finished: d => set(s => {
    const i = resolve(s.downloads, d.name);
    if (i < 0) return s;
    const next = [...s.downloads];
    next[i] = {
      ...next[i],
      state: 'done',
      bytes: d.bytes,
      dest: d.dest ?? next[i].dest,
      finishedAt: Date.now(),
    };
    return { downloads: next, unseen: s.unseen + 1 };
  }),

  failed: d => set(s => {
    const i = resolve(s.downloads, d.name);
    if (i < 0) return s;
    const next = [...s.downloads];
    next[i] = {
      ...next[i], state: 'failed', error: d.error,
      cancelled: d.cancelled, finishedAt: Date.now(),
    };
    /*
      A failure counts as unseen too.

      The badge exists to pull someone back to the list, and the download they
      most need to look at is the one that did not work.
    */
    return { downloads: next, unseen: s.unseen + 1 };
  }),

  cancel: id => set(s => {
    const d = s.downloads.find(x => x.id === id);
    if (!d || d.state !== 'running') return s;
    // Keyed on the destination, which is what the host registered it under.
    postMsg({ type: 'dk8s:cancel', requestId: `dl:${d.dest}` });
    return s;
  }),

  retry: id => set(s => {
    const d = s.downloads.find(x => x.id === id);
    if (!d?.source) return s;
    /*
      The same message the Explorer sends, from what the row remembers.

      Retrying by replaying the original request rather than by a dedicated
      host path means a retry cannot drift from a first attempt — there is one
      way to start a download and this is it.
    */
    postMsg({
      type: d.directory ? 'files:downloadDir' : 'files:download',
      context: d.source.context, namespace: d.source.namespace,
      pod: d.source.pod, container: d.source.container,
      path: d.source.path, name: d.name,
    });
    // The old row goes: the new one is about to arrive, and two rows for one
    // file with different outcomes is a list that cannot be read.
    return { downloads: s.downloads.filter(x => x.id !== id) };
  }),

  dismiss: id => set(s => ({ downloads: s.downloads.filter(x => x.id !== id) })),

  markSeen: () => set({ unseen: 0 }),

  clearFinished: () => set(s => ({
    downloads: s.downloads.filter(d => d.state === 'running'),
  })),
}));

/**
 * Wire the host's messages to the store, once.
 *
 * Registered at module scope rather than in a component so a download survives
 * navigating away from the Explorer — the copy keeps running on the host, and
 * a list that forgot about it while it was still going would be lying.
 */
let listening = false;

export function listenForDownloads(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (e: MessageEvent) => {
    const m = e.data;
    const s = useDk8sFilesStore.getState();
    if (m?.type === 'files:downloadStarted') {
      s.started({
        name: String(m.name), dest: String(m.dest ?? ''),
        command: m.command ? String(m.command) : undefined,
        directory: !!m.directory,
        // Trusted only as far as it goes: it is echoed straight back to the
        // host on a retry, where every field is validated again.
        source: m.source && typeof m.source === 'object'
          ? m.source as NonNullable<Download['source']> : undefined,
      });
    } else if (m?.type === 'files:downloadDone') {
      s.finished({
        name: String(m.name),
        dest: m.dest ? String(m.dest) : undefined,
        bytes: typeof m.bytes === 'number' ? m.bytes : undefined,
      });
    } else if (m?.type === 'files:downloadFailed') {
      s.failed({
        name: String(m.name), error: String(m.error ?? 'The download failed.'),
        cancelled: !!m.cancelled,
      });
    }
  });
}
