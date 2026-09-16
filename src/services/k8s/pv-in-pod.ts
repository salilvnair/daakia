/**
 * Archived logs on a volume that is inside the cluster.
 *
 * ── Why this exists next to `pv-logs` ──
 *
 * `pv-logs` reads an archive with Node's `fs`, which means the volume has to
 * be mounted on the machine dk8s is running on — an SMB or NFS share on your
 * own laptop. `pod-files` already says the quiet part:
 *
 *   "That path is faster and richer when it applies and applies almost never
 *    — the volume is usually only inside the cluster."
 *
 * It is the common case, not the rare one. A PersistentVolumeClaim mounted at
 * `/prodapp-prod-pvc/prodapp_prod_logs` exists on a node in Azure, and nothing
 * on your desk can `stat` it. Worse, asking Node to resolve that path on
 * Windows produces `C:\prodapp-prod-pvc\prodapp_prod_logs` — so the error came
 * back naming a drive letter nobody typed, about a machine that was never
 * involved.
 *
 * So this reads the same archive the only way it can be read: through the pod
 * that has it mounted.
 *
 * ── One exec, not one per directory ──
 *
 * A dated archive is a directory per day, and walking it a directory at a time
 * would be an exec per day — each one a round trip to the API server and a row
 * in the audit. `find` does the whole walk in one call and is in busybox and
 * coreutils alike; `ls -lAn` on the results gives size and mtime in the format
 * `pod-files` already parses.
 *
 * Everything here is read-only. Nothing is written into the container and no
 * binary is installed.
 */
import { run } from './kubectl';
import { execArgs, showCommand, type PodTarget } from './pod-files';

export interface PvInPodFile {
  /** Absolute, inside the container. */
  path: string;
  /** Relative to the root that was searched — what a result list shows. */
  rel: string;
  bytes: number;
  /** Epoch ms, when `find` could report it. */
  mtime?: number;
}

export interface PvInPodListing {
  root: string;
  files: PvInPodFile[];
  /** Every command this ran, for the panel that shows what it did. */
  commands: string[];
  /** Set when the root could not be read at all. */
  error?: string;
  /** True when the cap stopped the walk before the tree ran out. */
  capped?: boolean;
}

/** A walk has to stop somewhere; an archive of ten years is not a listing. */
export const MAX_FILES = 2000;

/** Names worth treating as a log by default. */
export const DEFAULT_GLOBS = ['*.log', '*.log.*', '*.gz', '*.txt'];

export interface PvInPodOptions {
  /** Filename patterns; `DEFAULT_GLOBS` when absent. */
  globs?: string[];
  maxFiles?: number;
  /** Only files modified at or after this, when the container can tell us. */
  sinceMs?: number;
}

/**
 * A `find` that busybox understands.
 *
 * `-printf` is GNU-only and absent from busybox, which is most sidecars and a
 * good share of application images — so the format comes from `ls` instead,
 * via `-exec ... +`. `-name` is repeated inside a `\( ... -o ... \)` group
 * because that is the only portable way to say "any of these".
 */
export function findArgs(root: string, globs: string[], maxFiles: number): string[] {
  const names: string[] = [];
  globs.forEach((g, i) => {
    if (i > 0) names.push('-o');
    names.push('-name', g);
  });

  return [
    'find', root,
    /* A symlinked archive directory is normal; a loop through one is not, and
       `find` without a depth bound will happily walk it forever. */
    '-maxdepth', '6',
    '-type', 'f',
    ...(names.length ? ['(', ...names, ')'] : []),
    /* Numeric owner for the same reason `pod-files` uses it: a name is not a
       uid and cannot be compared to one. */
    '-exec', 'ls', '-lAnd', '{}', '+',
  ].concat(maxFiles > 0 ? [] : []);
}

/**
 * `-rw-r--r-- 1 0 0 152 Sep 16 02:47 /path/to/file.log`
 *
 * The same shape `pod-files.parseLsLine` reads, except that `find -exec ls`
 * prints the full path rather than a bare name — so the path is whatever is
 * left after the date, spaces and all.
 */
export function parseFindLine(line: string, root: string): PvInPodFile | undefined {
  const t = line.trim();
  if (!t || t.startsWith('total ')) return undefined;

  /* mode links uid gid size <date fields> path. The date is three fields and
     its shape differs between busybox and coreutils, so the path is taken as
     "everything after the fifth field plus three date fields" rather than by
     matching a date format that varies. */
  const m = /^([bcdlps-][rwxSsTt-]{9})[+.]?\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\S+)\s+(.+)$/.exec(t);
  if (!m) return undefined;

  const kind = m[1][0];
  if (kind === 'd') return undefined;           // directories are not results

  const bytes = Number(m[5]);
  const path = m[7].trim();
  if (!path.startsWith('/')) return undefined;  // a relative path is not ours

  return {
    path,
    rel: relativeTo(root, path),
    bytes: Number.isFinite(bytes) ? bytes : 0,
    mtime: parseLsDate(m[6]),
  };
}

/** `/root/a/b.log` under `/root` → `a/b.log`. */
export function relativeTo(root: string, path: string): string {
  const r = root.replace(/\/+$/, '');
  return path.startsWith(r + '/') ? path.slice(r.length + 1) : path;
}

/**
 * `Sep 16 02:47` or `Sep 16 2025` — what `ls` prints, in the container's zone.
 *
 * Returns undefined rather than a guess when it cannot be read. A wrong
 * timestamp on an archived log is worse than none: it decides which file a
 * "last 6 hours" search opens.
 */
export function parseLsDate(field: string, now = Date.now()): number | undefined {
  const m = /^(\w{3})\s+(\d{1,2})\s+(?:(\d{4})|(\d{2}):(\d{2}))$/.exec(field.trim());
  if (!m) return undefined;

  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m[1]);
  if (month < 0) return undefined;

  const day = Number(m[2]);
  if (m[3]) return Date.UTC(Number(m[3]), month, day);

  /*
    No year means "within the last six months", which is how `ls` decides to
    print a clock instead. A date later than today is therefore last year —
    without that, every December file looks like it is from the future for the
    first weeks of January.
  */
  const today = new Date(now);
  const guess = Date.UTC(today.getUTCFullYear(), month, day, Number(m[4]), Number(m[5]));
  return guess > now + 86_400_000
    ? Date.UTC(today.getUTCFullYear() - 1, month, day, Number(m[4]), Number(m[5]))
    : guess;
}

/** Every log file under a root, read through the pod that has it mounted. */
export async function listInPod(
  t: PodTarget, root: string, opts: PvInPodOptions = {},
): Promise<PvInPodListing> {
  const cleanRoot = root.trim().replace(/\/+$/, '');
  if (!cleanRoot.startsWith('/')) {
    return {
      root, files: [], commands: [],
      error: 'A path inside a container is absolute — it starts with "/".',
    };
  }

  const maxFiles = opts.maxFiles ?? MAX_FILES;
  const args = execArgs(t, findArgs(cleanRoot, opts.globs ?? DEFAULT_GLOBS, maxFiles));
  const command = showCommand(args);
  const r = await run(args, { timeoutMs: 30_000 });

  /*
    `find` exits non-zero when any path was unreadable, having still printed
    everything it could — so output is worth more than the exit code. Only a
    run that produced nothing at all is reported as a failure.
  */
  const lines = (r.stdout ?? '').split('\n');
  const files: PvInPodFile[] = [];
  for (const line of lines) {
    if (files.length >= maxFiles) break;
    const f = parseFindLine(line, cleanRoot);
    if (!f) continue;
    if (opts.sinceMs !== undefined && f.mtime !== undefined && f.mtime < opts.sinceMs) continue;
    files.push(f);
  }

  if (!files.length && r.code !== 0) {
    return { root: cleanRoot, files: [], commands: [command], error: explain(r.stderr, cleanRoot) };
  }

  /* Newest first: an archive is read from the end. */
  files.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0) || a.rel.localeCompare(b.rel));

  return {
    root: cleanRoot,
    files,
    commands: [command],
    capped: files.length >= maxFiles,
  };
}

/** What went wrong, in words that name the thing to do about it. */
export function explain(stderr: string, root: string): string {
  const s = (stderr || '').trim();
  if (/no such file or directory/i.test(s)) {
    return `Nothing is mounted at ${root} in this container.`;
  }
  if (/permission denied/i.test(s)) {
    return `This container cannot read ${root}. It is mounted, but not for the user the container runs as.`;
  }
  if (/executable file not found|not found/i.test(s) && /find/i.test(s)) {
    return 'This image has no `find`, so its volume cannot be walked from here.';
  }
  if (/cannot exec|container not found|unable to upgrade connection/i.test(s)) {
    return 'This container could not be exec\u2019d into — it may not be running.';
  }
  return s.split('\n')[0]?.slice(0, 200) || `Could not read ${root}.`;
}
