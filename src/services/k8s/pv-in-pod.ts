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
/**
 * A windowed read's cap: the window bounds it, so it can hold what ten busy
 * minutes write — what the Window tab asks for — well inside the 32MB a run
 * buffers. At 5,000 a busy pod's ten minutes lost their last few.
 */
export const MAX_WINDOW_LINES = 40000;

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
  /**
   * Only files written to since this moment (epoch ms).
   *
   * grep cannot read a timestamp, so a window used to be applied after the
   * fact — and a busy pattern over sixty rotated files filled the line cap
   * with the oldest files before it reached the one the window was in, and
   * the window came back empty. A file last written before the window began
   * cannot hold a line from it, so it is not read at all.
   */
  sinceMs?: number;
  /**
   * The window as the log writes its times — `YYYY-MM-DDTHH:MM:SS` in the
   * log's own zone. Given, the search reads each file from the window's start
   * and stops past its end, inside the pod, so the line cap is spent on the
   * window. Without it, a file is read from its first line and the cap filled
   * before the window began: a moment ten minutes into a busy file came back
   * with a handful of lines, or none.
   */
  window?: { from: string; to?: string };
}

/**
 * `ms` as `YYYY-MM-DDTHH:MM:SS` in `timeZone` — how an ISO-ish log line spells
 * that moment, for comparing as text inside the pod. UTC when the zone is not
 * one this runtime knows.
 */
export function zoneStamp(ms: number, timeZone = 'UTC'): string {
  const fmt = (tz: string) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  };
  try { return fmt(timeZone); } catch { return fmt('UTC'); }
}

/**
 * The windowed read of one file, in awk: `N:text` for a hit and `N-text` for
 * a context line — grep's own shape, so the output parses the same.
 *
 * A line with an ISO-style time (`2026-10-03T04:57:03`, or with a space for
 * the T) decides whether what follows is in the window; a line without one —
 * a stack frame, a JSON body — goes with the line above it. Before the window
 * nothing is printed, and the first line past it ends the file. A file whose
 * lines carry no such time is read whole, as grep would. The pattern comes in
 * through the environment, not `-v`, which would read its backslashes as
 * escapes and turn `a\.b` into `a.b`.
 */
function awkWindow(caseSensitive: boolean | undefined, ctx: number): string {
  const prog = [
    'BEGIN{p=ENVIRON["DK_PAT"]; if(!CS) p=tolower(p); w=1; a=0; n=0}',
    '{ if (match($0, /[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]/)) {',
    '    t=substr($0, RSTART, 19); sub(/ /, "T", t);',
    '    if (t < F) w=0; else if (T != "" && t > T) exit; else w=1 }',
    '  if (!w) next;',
    '  s = CS ? $0 : tolower($0);',
    '  if (s ~ p) { for (i=0; i<n; i++) print bn[i] "-" bt[i]; n=0; print NR ":" $0; a=C; next }',
    '  if (a > 0) { print NR "-" $0; a--; next }',
    '  if (C > 0) { if (n == C) { for (i=1; i<n; i++) { bn[i-1]=bn[i]; bt[i-1]=bt[i] } n-- } bn[n]=NR; bt[n]=$0; n++ } }',
  ].join(' ');
  return ['awk', '-v', `CS=${caseSensitive ? 1 : 0}`, '-v', `C=${ctx}`, '-v', 'F="$DK_FROM"', '-v', 'T="$DK_TO"', shellQuote(prog), '"$f"'].join(' ');
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
  const cap = o.window ? MAX_WINDOW_LINES : MAX_MATCH_LINES;
  const limit = Math.max(1, Math.min(o.maxLines ?? cap, cap));
  if (o.sinceMs !== undefined) {
    /*
      Oldest file first, so the output runs in time order and the cap cuts
      what came AFTER the window rather than the window itself — find lists
      files in directory order, which put the newest first and let their
      lines use up the cap. busybox and GNU both have find -mmin, ls -1tr and
      read -r; -H keeps the file name on every line, as -r does, so the
      output parses the same.
    */
    const minutes = Math.max(1, Math.ceil((Date.now() - o.sinceMs) / 60_000) + 1);
    const grepFile = [
      'grep', '-n',
      o.caseSensitive ? '-E' : '-Ei',
      ...(ctx > 0 ? ['-C', String(ctx)] : []),
      '-e', shellQuote(o.regex ? pattern : escapeRegex(pattern)),
      '"$f"',
    ].join(' ');
    /* With a window, awk reads each file from the window's start — see
       `window` — where the image has awk; grep, as before, where it has not. */
    const readFile = o.window
      ? `$(if [ -n "$DK_AWK" ]; then ${awkWindow(o.caseSensitive, ctx)}; else ${grepFile}; fi)`
      : `$(${grepFile})`;
    const env = o.window
      ? [
        `DK_PAT=${shellQuote(o.regex ? pattern : escapeRegex(pattern))}`,
        `DK_FROM=${shellQuote(o.window.from)}`,
        `DK_TO=${shellQuote(o.window.to ?? '')}`,
        'DK_AWK=$(command -v awk 2>/dev/null);',
        'export DK_PAT DK_FROM DK_TO;',
      ]
      : [];
    /*
      Each file's lines come under a line naming it, and grep prints only
      `N:text` and `N-text`. With the name in front of every line, a context
      line whose text holds a colon — every timestamp does — read as a hit in
      a "file" called `app.log-3-2026-09-26T00`; and when `head` cut a file
      off before its hit, nothing was left to tell the two apart.
    */
    return [
      ...env,
      'find', shellQuote(root), '-type', 'f', '-mmin', `-${minutes}`,
      '-exec', 'ls', '-1tr', '{}', '+', '2>/dev/null',
      '|', 'while', 'IFS=', 'read', '-r', 'f;', 'do',
      `o=${readFile};`,
      '[', '-n', '"$o"', ']', '&&', 'printf', `'${FILE_MARK}%s\\n%s\\n'`, '"$f"', '"$o";', 'done',
      '2>/dev/null',
      '|', 'head', '-n', String(limit),
    ].join(' ');
  }
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

/** The line the windowed script prints before each file's matches. */
export const FILE_MARK = '@@daakia-file@@';

/**
 * Output where each file's lines follow a `FILE_MARK` line naming it — so a
 * line is `N:text` (a hit) or `N-text` (context), and never has to be split
 * from a path. Lines before the first mark, and `--`, are nobody's.
 */
export function parseMarkedGrep(out: string[], root: string): PvMatch[] {
  const matches: PvMatch[] = [];
  let file: string | undefined;
  for (const line of out) {
    if (line.startsWith(FILE_MARK)) { file = line.slice(FILE_MARK.length); continue; }
    if (!file || !line || line === '--') continue;
    const m = /^(\d+)([:-])(.*)$/.exec(line);
    if (!m) continue;
    matches.push({
      file, rel: relativeTo(root, file), line: Number(m[1]), text: m[3],
      ...(m[2] === '-' ? { context: true } : {}),
    });
  }
  return matches;
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
 * So the file is not guessed. A hit carries a colon, which paths seldom do —
 * but a log line does: the context line `app.log-3-2026-09-26T00:09:12 …`
 * splits on the colons of its own timestamp into the "file"
 * `app.log-3-2026-09-26T00`, line 9. So a colon split is only a candidate
 * until `realFiles` has seen them all; given `known`, a candidate that is not
 * one of them is read as context instead. Every context line belongs to a file
 * that has a hit, so `known` is matched as a prefix. Longest first, because
 * one path can be a prefix of another.
 */
export function parseGrepLine(
  line: string, root: string, known?: Iterable<string>,
): PvMatch | undefined {
  if (!line || line === '--') return undefined;

  const files = known ? [...known] : undefined;
  const hit = /^(.+?):(\d+):(.*)$/.exec(line);
  if (hit && hit[1].startsWith('/') && (!files || files.includes(hit[1]))) {
    return {
      file: hit[1],
      rel: relativeTo(root, hit[1]),
      line: Number(hit[2]),
      text: hit[3],
    };
  }

  for (const file of [...(files ?? [])].sort((a, b) => b.length - a.length)) {
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
 * The files that really had a hit, out of every colon split's guess.
 *
 * A context line misread as a hit names a "file" that is a real one followed
 * by `-<line>-` and the start of its text. Context is only printed around a
 * hit in the same file, so the real file is among the candidates too — and
 * that is what gives the fake one away.
 */
export function realFiles(candidates: Iterable<string>): Set<string> {
  const all = [...candidates];
  return new Set(all.filter(f => !all.some(g => g !== f
    && f.startsWith(g + '-') && /^\d+-/.test(f.slice(g.length + 1)))));
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
  let matches: PvMatch[];
  if (o.sinceMs !== undefined) {
    /* The windowed script names each file itself: nothing to guess. */
    matches = parseMarkedGrep(out, cleanRoot);
  } else {
    const candidates = new Set<string>();
    for (const line of out) {
      const h = parseGrepLine(line, cleanRoot);
      if (h && !h.context) candidates.add(h.file);
    }
    const known = realFiles(candidates);
    matches = [];
    for (const line of out) {
      const m = parseGrepLine(line, cleanRoot, known);
      if (m) matches.push(m);
    }
  }

  /*
    grep exits 1 when it matched nothing, which is an answer rather than a
    failure — only a non-zero exit with nothing on stdout AND something on
    stderr is a problem worth reporting.
  */
  if (!matches.length && r.code !== 0 && (r.stderr ?? '').trim()) {
    return { root: cleanRoot, matches: [], commands: [command], files: 0, error: explain(r.stderr, cleanRoot) };
  }

  const cap = o.window ? MAX_WINDOW_LINES : MAX_MATCH_LINES;
  const limit = Math.max(1, Math.min(o.maxLines ?? cap, cap));
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
