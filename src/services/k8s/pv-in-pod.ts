/**
 * Archived logs on a volume that is inside the cluster.
 *
 * ── Why this exists next to `pv-logs` ──
 *
 * `pv-logs` reads an archive with Node's `fs`, which means the volume has to
 * be mounted on the machine dk8s runs on — an SMB or NFS share on your own
 * laptop. `pod-files` already says the quiet part:
 *
 *   "That path is faster and richer when it applies and applies almost never
 *    — the volume is usually only inside the cluster."
 *
 * It is the common case, not the rare one. A PersistentVolumeClaim mounted at
 * `/prodapp-prod-pvc/prodapp_prod_logs` lives on a node in Azure and nothing
 * on your desk can `stat` it. Worse, asking Node to resolve that path on
 * Windows produces `C:\prodapp-prod-pvc\prodapp_prod_logs` — so the error came
 * back naming a drive letter nobody typed, about a machine that was never
 * involved.
 *
 * ── The matching happens in the pod ──
 *
 * `kubectl logs` has no server-side search, so searching a container's stdout
 * means pulling lines and matching them here; there is no other mechanism and
 * `kubectl logs | grep` is the same thing. Files are different. `grep` runs on
 * the node, reads the volume at local disk speed, and only the matching lines
 * cross the wire — so a gigabyte of archive costs a few kilobytes of answer
 * instead of a gigabyte of transfer.
 *
 * Everything here is read-only. Nothing is written into the container and no
 * binary is installed.
 */
import { run } from './kubectl';
import { execArgs, showCommand, shellQuote, type PodTarget } from './pod-files';

export interface PvInPodFile {
  /** Absolute, inside the container. */
  path: string;
  /** Relative to the root that was searched — what a result list shows. */
  rel: string;
  bytes: number;
  /** Epoch ms, when `ls` could report it. */
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
/** And a search has to return something a panel can hold. */
export const MAX_MATCH_LINES = 5000;

/** Names worth treating as a log by default. */
export const DEFAULT_GLOBS = ['*.log', '*.log.*', '*.txt'];

export interface PvInPodOptions {
  /** Filename patterns; `DEFAULT_GLOBS` when absent. */
  globs?: string[];
  maxFiles?: number;
}

/**
 * A `find` that busybox understands.
 *
 * `-printf` is GNU-only and absent from busybox, which is most sidecars and a
 * good share of application images — so the format comes from `ls` instead,
 * via `-exec … +`. `-name` is repeated inside a `( … -o … )` group because
 * that is the only portable way to say "any of these".
 */
export function findScript(root: string, globs: string[], maxFiles: number): string {
  const names = globs.flatMap((g, i) => (i > 0 ? ['-o'] : []).concat(['-name', shellQuote(g)]));
  return [
    'find', shellQuote(root),
    /* A symlinked archive directory is normal; a loop through one is not, and
       `find` without a depth bound walks it until something gives out. */
    '-maxdepth', '6',
    '-type', 'f',
    ...(names.length ? ['\\(', ...names, '\\)'] : []),
    '2>/dev/null',
    '|', 'head', '-n', String(maxFiles),
    /* Then `ls` what survived, for size and time. `-L` so a symlinked file
       reports what it points at rather than the link. */
    '|', 'xargs', '-r', 'ls', '-lLnd', '2>/dev/null',
  ].join(' ');
}

/**
 * `-rw-r--r-- 1 0 0 152 Sep 16 02:47 /path/to/file.log`
 *
 * The path is whatever follows the three date fields — taken by position
 * rather than by matching a date format, because busybox and coreutils print
 * different ones and a path may contain spaces.
 */
export function parseLsLine(line: string, root: string): PvInPodFile | undefined {
  const t = line.trim();
  if (!t || t.startsWith('total ')) return undefined;

  const m = /^([bcdlps-][rwxSsTt-]{9})[+.]?\s+\d+\s+\d+\s+\d+\s+(\d+)\s+(\S+\s+\S+\s+\S+)\s+(.+)$/.exec(t);
  if (!m) return undefined;
  if (t[0] === 'd') return undefined;            // directories are not results

  const path = m[4].trim();
  if (!path.startsWith('/')) return undefined;   // a relative path is not ours

  const bytes = Number(m[2]);
  return {
    path,
    rel: relativeTo(root, path),
    bytes: Number.isFinite(bytes) ? bytes : 0,
    mtime: parseLsDate(m[3]),
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
 * Undefined rather than a guess when it cannot be read. A wrong timestamp on
 * an archived log is worse than none: it decides which file a "last 6 hours"
 * search opens.
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
    No year means "within the last six months", which is why `ls` prints a
    clock instead. A date later than today is therefore last year — without
    that, every December file reads as being from the future for the first
    weeks of January.
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
  const cleanRoot = cleanPath(root);
  if (!cleanRoot) {
    return { root, files: [], commands: [], error: absoluteOnly(root) };
  }

  const maxFiles = opts.maxFiles ?? MAX_FILES;
  const script = findScript(cleanRoot, opts.globs ?? DEFAULT_GLOBS, maxFiles);
  const args = execArgs(t, ['sh', '-c', script]);
  const command = showCommand(args);
  const r = await run(args, { timeoutMs: 30_000 });

  /*
    `find` exits non-zero when any path was unreadable, having still printed
    everything it could — so the output is worth more than the exit code. Only
    a run that produced nothing at all is reported as a failure.
  */
  const files: PvInPodFile[] = [];
  for (const line of (r.stdout ?? '').split('\n')) {
    if (files.length >= maxFiles) break;
    const f = parseLsLine(line, cleanRoot);
    if (f) files.push(f);
  }

  if (!files.length && r.code !== 0) {
    return { root: cleanRoot, files: [], commands: [command], error: explain(r.stderr, cleanRoot) };
  }

  /* Newest first: an archive is read from the end. */
  files.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0) || a.rel.localeCompare(b.rel));

  return { root: cleanRoot, files, commands: [command], capped: files.length >= maxFiles };
}

// ── Searching ───────────────────────────────────────────────────────────────

export interface PvMatch {
  /** Absolute path inside the container. */
  file: string;
  rel: string;
  /** Line number in that file, as `grep -n` reports it. */
  line: number;
  text: string;
  /** True for a line kept because of a hit nearby rather than for itself. */
  context?: boolean;
}

export interface PvSearchResult {
  root: string;
  matches: PvMatch[];
  /** What this actually ran, so a screen can show it. */
  commands: string[];
  /** Files that had at least one hit. */
  files: number;
  error?: string;
  /** True when the cap cut the output short. */
  capped?: boolean;
}

export interface PvSearchOptions {
  /** Lines either side of a hit. */
  contextLines?: number;
  caseSensitive?: boolean;
  /** Treat the pattern as a regular expression rather than literal text. */
  regex?: boolean;
  maxLines?: number;
  globs?: string[];
}

/**
 * The search, as one shell line inside the container.
 *
 * `grep -r` walks and matches in one pass on the node. busybox and GNU grep
 * agree on `-r -n -E -i` and on `-C`, which is the whole vocabulary needed.
 *
 * `--include` is NOT used: busybox grep does not have it. Narrowing by name
 * would mean `find … | xargs grep`, which costs a second process and gains
 * nothing here — a log directory is log files.
 */
export function grepScript(
  root: string, pattern: string, o: PvSearchOptions,
): string {
  const ctx = Math.max(0, Math.round(o.contextLines ?? 0));
  const limit = Math.max(1, Math.min(o.maxLines ?? MAX_MATCH_LINES, MAX_MATCH_LINES));
  return [
    'grep', '-rn',
    o.caseSensitive ? '-E' : '-Ei',
    ...(ctx > 0 ? ['-C', String(ctx)] : []),
    /* `-e` so a pattern beginning with `-` is a pattern and not a flag. */
    '-e', shellQuote(o.regex ? pattern : escapeRegex(pattern)),
    shellQuote(root),
    '2>/dev/null',
    '|', 'head', '-n', String(limit),
  ].join(' ');
}

/** A literal search must not be read as a regex — `c.a.Service` is not a wildcard. */
export function escapeRegex(s: string): string {
  return s.replace(/[.[\]{}()*+?^$|\\]/g, '\\$&');
}

/**
 * `path:12:matched` and `path-11-context`.
 *
 * Only the punctuation separates a hit from its context, and BOTH characters
 * occur in real paths and real log lines — so neither a greedy nor a lazy
 * split is safe. The live archive proved it: greedy on the dash matched the
 * `-09-` inside the date in `… archived day 2026-09-14`, and the file came
 * back as `archive/prodapp-2026-09-14.log-1-2026-09-14 INFO …`.
 *
 * So the file is not guessed. A hit carries a colon, which paths seldom do, so
 * hits parse on their own — and every context line belongs to a file that has
 * a hit, so `known` is matched as a prefix instead. Longest first, because one
 * path can be a prefix of another.
 */
export function parseGrepLine(
  line: string, root: string, known?: Iterable<string>,
): PvMatch | undefined {
  if (!line || line === '--') return undefined;

  const hit = /^(.+?):(\d+):(.*)$/.exec(line);
  if (hit && hit[1].startsWith('/')) {
    return {
      file: hit[1],
      rel: relativeTo(root, hit[1]),
      line: Number(hit[2]),
      text: hit[3],
    };
  }

  for (const file of [...(known ?? [])].sort((a, b) => b.length - a.length)) {
    if (!line.startsWith(file + '-')) continue;
    const rest = line.slice(file.length + 1);
    const m = /^(\d+)-(.*)$/.exec(rest);
    if (!m) continue;
    return {
      file,
      rel: relativeTo(root, file),
      line: Number(m[1]),
      text: m[2],
      context: true,
    };
  }

  return undefined;
}

/**
 * Search a volume where it lives.
 *
 * Only the matching lines come back. A gigabyte of archive costs a few
 * kilobytes of answer, which is the whole reason not to do this from here.
 */
export async function searchInPod(
  t: PodTarget, root: string, pattern: string, o: PvSearchOptions = {},
): Promise<PvSearchResult> {
  const cleanRoot = cleanPath(root);
  if (!cleanRoot) {
    return { root, matches: [], commands: [], files: 0, error: absoluteOnly(root) };
  }
  if (!pattern.trim()) {
    return { root: cleanRoot, matches: [], commands: [], files: 0, error: 'Nothing to search for.' };
  }

  const script = grepScript(cleanRoot, pattern, o);
  const args = execArgs(t, ['sh', '-c', script]);
  const command = showCommand(args);
  const r = await run(args, { timeoutMs: 60_000 });

  /*
    Two passes, because a context line cannot be parsed on its own.

    The first collects the files that had a hit — those parse unambiguously,
    on the colon. The second resolves every context line against that set by
    prefix, which is exact where a regex over the punctuation is not.
  */
  const out = (r.stdout ?? '').split('\n');
  const known = new Set<string>();
  for (const line of out) {
    const h = parseGrepLine(line, cleanRoot);
    if (h && !h.context) known.add(h.file);
  }

  const matches: PvMatch[] = [];
  for (const line of out) {
    const m = parseGrepLine(line, cleanRoot, known);
    if (m) matches.push(m);
  }

  /*
    grep exits 1 when it matched nothing, which is an answer rather than a
    failure — only a non-zero exit with nothing on stdout AND something on
    stderr is a problem worth reporting.
  */
  if (!matches.length && r.code !== 0 && (r.stderr ?? '').trim()) {
    return { root: cleanRoot, matches: [], commands: [command], files: 0, error: explain(r.stderr, cleanRoot) };
  }

  const limit = Math.max(1, Math.min(o.maxLines ?? MAX_MATCH_LINES, MAX_MATCH_LINES));
  return {
    root: cleanRoot,
    matches,
    commands: [command],
    files: new Set(matches.filter(m => !m.context).map(m => m.file)).size,
    capped: matches.length >= limit,
  };
}

// ── Shared ──────────────────────────────────────────────────────────────────

/** An absolute container path, or undefined. Trailing slashes are noise. */
export function cleanPath(p: string): string | undefined {
  const t = (p ?? '').trim().replace(/\/+$/, '');
  return t.startsWith('/') ? t : undefined;
}

function absoluteOnly(given: string): string {
  return `“${given.trim()}” is not a path inside a container. Those start with “/” — `
    + 'this is a path on a node in the cluster, not on this machine.';
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
  if (/not found/i.test(s) && /\b(find|grep|xargs|sh)\b/i.test(s)) {
    return 'This image has no shell or no grep, so its volume cannot be searched from here.';
  }
  if (/cannot exec|container not found|unable to upgrade connection/i.test(s)) {
    return 'This container could not be exec\u2019d into \u2014 it may not be running.';
  }
  return s.split('\n')[0]?.slice(0, 200) || `Could not read ${root}.`;
}

/* ── Fetching one file out ──────────────────────────────────────────────── */

/**
 * How much of an archived file is worth pulling over an exec.
 *
 * This exists to be read, and nobody reads a gigabyte. Past this the tail is
 * taken rather than the head, because a log's newest lines are the ones a
 * search was about — and the caller is told, so a truncated file never passes
 * for a whole one.
 */
export const MAX_FETCH_BYTES = 8 * 1024 * 1024;

export interface PvFetched {
  path: string;
  text: string;
  command: string;
  /** True when only the last `MAX_FETCH_BYTES` came back. */
  truncated?: boolean;
  /** Roughly how many lines the truncation dropped off the front. */
  droppedLines?: number;
  error?: string;
}

/**
 * Read one file out of the pod.
 *
 * Opening an archived hit used to hand its path straight to the editor, which
 * is right only when the volume is on this machine: `/prodapp-prod-pvc/…`
 * either failed to open or, on Windows, resolved against a drive letter. The
 * file is inside the container, so it is fetched from there.
 */
export async function fetchFromPod(t: PodTarget, file: string): Promise<PvFetched> {
  const clean = cleanPath(file);
  if (!clean) return { path: file, text: '', command: '', error: absoluteOnly(file) };

  /* Size first, so a file too big to be worth fetching is tailed rather than
     streamed whole and then mostly thrown away. One extra exec, against the
     chance of pulling a gigabyte nobody asked for. */
  const sizeArgs = execArgs(t, ['sh', '-c', `wc -c < ${shellQuote(clean)} 2>/dev/null`]);
  const sizeRun = await run(sizeArgs, { timeoutMs: 20_000 });
  const bytes = Number((sizeRun.stdout ?? '').trim()) || 0;
  const big = bytes > MAX_FETCH_BYTES;

  const script = big
    ? `tail -c ${MAX_FETCH_BYTES} ${shellQuote(clean)}`
    : `cat ${shellQuote(clean)}`;
  const args = execArgs(t, ['sh', '-c', script]);
  const command = showCommand(args);
  const r = await run(args, { timeoutMs: 120_000 });

  if (!r.ok && !(r.stdout ?? '').length) {
    return { path: clean, text: '', command, error: explain(r.stderr ?? '', clean) };
  }

  let text = r.stdout ?? '';
  let droppedLines: number | undefined;
  if (big) {
    /* A byte-bounded tail lands mid-line. Dropping that fragment costs one
       line and keeps every line in the file a real one. */
    const nl = text.indexOf('\n');
    if (nl >= 0) text = text.slice(nl + 1);
    const perLine = Math.max(1, text.length / Math.max(1, text.split('\n').length));
    droppedLines = Math.max(0, Math.round((bytes - MAX_FETCH_BYTES) / perLine));
  }

  return { path: clean, text, command, truncated: big || undefined, droppedLines };
}
