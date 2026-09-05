/**
 * Browsing, searching and reading the filesystem inside a running pod.
 *
 * There is no filesystem API in Kubernetes — no `ls` endpoint, no download
 * URL. Everything here is `kubectl exec` running a command that the container
 * may not have, so the capability ladder is not defensive plumbing, it is the
 * feature: `pod-classify` already reports the shell and `tar`, and this adds
 * the rest.
 *
 * Note this is NOT `pv-logs` / `pv-search`, which read a volume mounted on
 * THIS machine with `fs`. That path is faster and richer when it applies and
 * applies almost never — the volume is usually only inside the cluster. This
 * one goes through the pod, and the two share nothing but the subject.
 */
import { run } from './kubectl';

export interface PodTarget {
  context: string;
  namespace: string;
  pod: string;
  container?: string;
}

export interface FileEntry {
  name: string;
  /** Always absolute — see the note on `kubectl cp` in `download`. */
  path: string;
  kind: 'file' | 'dir' | 'link' | 'other';
  /** Bytes for a file; undefined for anything whose size is meaningless. */
  size?: number;
  /** `2026-09-04 06:02`, exactly as the container reported it. */
  modified?: string;
  /** Where a symlink points, when `ls` told us. */
  linkTarget?: string;
  /**
   * What the symlink resolves to.
   *
   * A link is not a kind of thing, it is a pointer at one, and the difference
   * decides what can be done with it: `/bin -> usr/bin` offered "view" and ran
   * `cat /bin`, which fails with "Is a directory" — an error the reader can do
   * nothing with, about a row that should have opened as a folder. Absent when
   * the link is broken, which is also the honest answer for one.
   */
  linkKind?: FileEntry['kind'];
  /** The mode string, kept so the UI can explain an unreadable entry. */
  mode?: string;
  /** Owner and group as `ls` printed them — a name, or a number if unresolved. */
  owner?: string;
  group?: string;
  /**
   * We can see it in the listing but cannot read it.
   *
   * Kept in the list rather than dropped: a volume that silently shows one
   * fewer file than it holds is worse than one that shows a locked row.
   */
  denied?: boolean;
}

function execArgs(t: PodTarget, cmd: string[]): string[] {
  return [
    '--context', t.context, '-n', t.namespace, 'exec', t.pod,
    ...(t.container ? ['-c', t.container] : []),
    '--', ...cmd,
  ];
}

/** For the "what this actually ran" line. Display only, never re-parsed. */
export function showCommand(args: string[]): string {
  return ['kubectl', ...args].map(a => (/[\s"'*?]/.test(a) ? JSON.stringify(a) : a)).join(' ');
}

// ── Listing ─────────────────────────────────────────────────────────────────

/**
 * One line of `ls -lA`, pulled apart.
 *
 * The format is fixed at eight fields and then the name:
 *
 *   -rw-r--r--    1 app      app          4312 Aug 30 11:20 application.properties
 *   drwxr-xr-x    2 app      app          4096 Sep  1 03:14 2026-08
 *   lrwxrwxrwx    1 root     root            7 Jan  1 00:00 sh -> busybox
 *
 * Split on the first eight and treat the remainder as the name, because a
 * filename with spaces is common and splitting the whole line loses it. The
 * date is three fields (`Aug 30 11:20` or `Aug 30  2025`), which is why the
 * count is eight rather than the six it looks like.
 *
 * A name containing a NEWLINE defeats this, and that is a stated limitation:
 * the alternative is a `stat` loop whose flags differ between busybox and
 * coreutils in exactly the way `ls -lA` does not.
 */
export function parseLsLine(line: string, dir: string): FileEntry | undefined {
  const trimmed = line.replace(/\r$/, '');
  if (!trimmed.trim()) return undefined;
  // `total 24` — busybox and coreutils both emit it for -l.
  if (/^total\s+\d+$/.test(trimmed.trim())) return undefined;

  const m = /^([bcdlpsSt\-][rwxsStT\-]{9}[.+@]?)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+\s+\d+\s+\S+)\s+(.*)$/
    .exec(trimmed);
  if (!m) return undefined;

  const [, mode, , owner, group, sizeText, modified, rest] = m;
  let name = rest;
  let linkTarget: string | undefined;
  if (mode.startsWith('l')) {
    const arrow = rest.indexOf(' -> ');
    if (arrow >= 0) {
      name = rest.slice(0, arrow);
      linkTarget = rest.slice(arrow + 4);
    }
  }
  if (!name || name === '.' || name === '..') return undefined;

  const kind: FileEntry['kind'] =
    mode.startsWith('d') ? 'dir'
      : mode.startsWith('l') ? 'link'
        : mode.startsWith('-') ? 'file'
          : 'other';

  return {
    name,
    path: joinPath(dir, name),
    kind,
    size: kind === 'file' ? Number(sizeText) : undefined,
    modified,
    linkTarget,
    mode,
    owner,
    group,
  };
}

/**
 * Join, without ever producing a relative path.
 *
 * Every path this module hands out is absolute, because `kubectl cp` strips a
 * leading `/` and resolves what is left against the container's WORKDIR — a
 * bug this repo already shipped once, on every image whose WORKDIR was not `/`
 * (Jetty, Tomcat, every Spring Boot image).
 */
export function joinPath(dir: string, name: string): string {
  if (name.startsWith('/')) return name;
  return dir === '/' ? `/${name}` : `${dir.replace(/\/+$/, '')}/${name}`;
}

/** The containing directory of an absolute path. `/` is its own parent. */
export function parentOf(path: string): string {
  const clean = path.replace(/\/+$/, '');
  const cut = clean.lastIndexOf('/');
  return cut <= 0 ? '/' : clean.slice(0, cut);
}

export interface ListResult {
  path: string;
  entries: FileEntry[];
  command: string;
  error?: string;
}

/**
 * Who the container runs as.
 *
 * Needed because "cannot read this" is a fact about a mode AND an identity,
 * and a listing only carries the mode. `ls` will happily show a root-owned
 * `0600` keystore to a process running as uid 1000, which then cannot open it
 * — and a volume mounted root-owned under a non-root container looks exactly
 * like an empty one until somebody says otherwise.
 *
 * `id` is in coreutils and busybox alike. An image without it simply gets no
 * permission marking, which is the right failure: an unmarked row is a row we
 * are not claiming anything about.
 */
export interface PodIdentity {
  uid: number;
  gid: number;
  groups: number[];
}

const identityCache = new Map<string, PodIdentity | null>();

export function clearIdentityCache(): void {
  identityCache.clear();
}

export async function podIdentity(t: PodTarget): Promise<PodIdentity | null> {
  const key = `${t.context}/${t.namespace}/${t.pod}/${t.container ?? ''}`;
  const hit = identityCache.get(key);
  if (hit !== undefined) return hit;

  // One exec for all three, and no shell needed — `id` prints them itself.
  const r = await run(execArgs(t, ['id']));
  const parsed = r.code === 0 ? parseId(r.stdout) : null;
  identityCache.set(key, parsed);
  return parsed;
}

/**
 * `uid=1000(app) gid=1000(app) groups=1000(app),27(sudo)`
 *
 * Parsed rather than run three times, because `id` prints all of it in one
 * line on every implementation this will meet.
 */
export function parseId(out: string): PodIdentity | null {
  const uid = /uid=(\d+)/.exec(out);
  const gid = /gid=(\d+)/.exec(out);
  if (!uid || !gid) return null;
  const groupsText = /groups=([^\n]*)/.exec(out)?.[1] ?? '';
  const groups = [...groupsText.matchAll(/(\d+)/g)].map(m => Number(m[1]));
  return {
    uid: Number(uid[1]),
    gid: Number(gid[1]),
    groups: groups.length ? groups : [Number(gid[1])],
  };
}

/**
 * Can this identity read this entry, going by the mode alone?
 *
 * Unix picks ONE class and stops: owner, else group, else other. It does not
 * fall through, so a `0067` file is genuinely unreadable by its owner and
 * readable by everyone else — which is why this cannot be written as three
 * ORed checks, however much it looks like it should be.
 *
 * root reads everything regardless, which is not a special case so much as the
 * reason most containers never see this at all.
 *
 * `ls` prints names when it can resolve them and numbers when it cannot, so a
 * numeric owner is compared numerically and a named one is not compared at all
 * — we cannot map a name to a uid from here, and guessing would produce
 * exactly the confident-and-wrong marking this is meant to avoid.
 */
export function readableBy(
  e: { mode?: string; owner?: string; group?: string }, id: PodIdentity | null,
): boolean {
  const mode = e.mode;
  if (!mode || mode.length < 10 || !id) return true;
  if (id.uid === 0) return true;

  const ownerNum = /^\d+$/.test(e.owner ?? '') ? Number(e.owner) : undefined;
  const groupNum = /^\d+$/.test(e.group ?? '') ? Number(e.group) : undefined;
  if (ownerNum === undefined && groupNum === undefined) return true;

  if (ownerNum !== undefined && ownerNum === id.uid) return mode[1] === 'r';
  if (groupNum !== undefined && id.groups.includes(groupNum)) return mode[4] === 'r';
  // Not the owner and not in the group — but only if we could tell.
  if (ownerNum === undefined || groupNum === undefined) return true;
  return mode[7] === 'r';
}

export async function listDirectory(t: PodTarget, path: string): Promise<ListResult> {
  /*
    `-n` for numeric owner and group.

    Names are what `ls` prints by default and are exactly the thing we cannot
    use: "can this identity read this file" is a comparison against a uid, and
    `root` is not a uid. Resolving a name to a number from out here is not
    possible, so the marking simply never fired on any image whose /etc/passwd
    could resolve its own owners — which is all of them except the slimmest.
    `-n` is in busybox and coreutils alike, and the names were never displayed.
  */
  const args = execArgs(t, ['ls', '-lAn', path]);
  const command = showCommand(args);
  const r = await run(args);

  if (r.code !== 0) {
    return { path, entries: [], command, error: explainExecFailure(r.stderr, path) };
  }

  const entries: FileEntry[] = [];
  for (const line of r.stdout.split('\n')) {
    const e = parseLsLine(line, path);
    if (e) entries.push(e);
  }
  /*
    Directories first, then by name — the order a file manager is read in.
    `ls` sorts by name alone, which scatters folders through the files and
    makes "what is in here" a scan rather than a glance.
  */
  entries.sort((a, b) => {
    const ad = a.kind === 'dir' ? 0 : 1;
    const bd = b.kind === 'dir' ? 0 : 1;
    return ad - bd || a.name.localeCompare(b.name);
  });

  await resolveLinks(t, path, entries);

  /*
    Mark what we can see but cannot open.

    Kept in the list rather than dropped, because a volume that silently shows
    one fewer file than it holds is worse than one that shows a locked row: the
    first is a wrong answer, the second is an answer with a reason attached.
  */
  const id = await podIdentity(t);
  if (id) for (const e of entries) if (!readableBy(e, id)) e.denied = true;

  return { path, entries, command };
}

/**
 * What a directory actually holds, when somebody asks.
 *
 * `ls` reports 4096 for a directory — the size of the directory ENTRY, not of
 * its contents — which is true of every Unix and has nothing to do with
 * Kubernetes. The real number needs `du`, and `du` walks the whole subtree.
 *
 * So it is never part of a listing. A directory of forty folders would be
 * forty subtree walks to draw one column, and on a PersistentVolume that is
 * the same runaway the search caps exist to prevent. It is offered per
 * directory, on request, by someone who has decided this one is worth it.
 *
 * `-k` rather than `-h`: kilobytes parse, "6.1M" has to be un-rounded first.
 */
export interface DirSizeResult {
  path: string;
  bytes?: number;
  command: string;
  error?: string;
}

export async function directorySize(t: PodTarget, path: string): Promise<DirSizeResult> {
  const args = execArgs(t, ['du', '-sk', path]);
  const command = showCommand(args);
  const r = await run(args);

  if (r.code !== 0 && !r.stdout.trim()) {
    return { path, command, error: explainExecFailure(r.stderr, path) };
  }

  // `du -sk` prints "6184\t/var/lib/dpkg", and on a subtree with unreadable
  // corners it prints the total it COULD reach plus warnings on stderr. The
  // number is still the honest answer to "how much of this can I see".
  const first = r.stdout.split('\n')[0] ?? '';
  const kb = /^(\d+)/.exec(first.trim());
  if (!kb) return { path, command, error: 'du did not answer with a size.' };
  return { path, bytes: Number(kb[1]) * 1024, command };
}

/**
 * Follow every symlink far enough to know what it IS.
 *
 * `ls -l` reports a symlink's own size, which is the length of the target
 * STRING — 29 bytes for a link to a 4 KB properties file. Showing that would
 * be worse than showing nothing, so the parser drops it, and the column read
 * as a dash for every link in the listing.
 *
 * That is not a rare case. A ConfigMap mount projects every key as a symlink
 * into a timestamped directory, so an entire /config — the most interesting
 * directory in a Spring Boot pod — had no sizes at all.
 *
 * `-L` makes `ls` stat the target instead. It runs as a SECOND exec rather
 * than replacing the first, for two reasons: the first listing is what knows a
 * link is a link and what it points at, which `-L` hides; and this way the
 * extra round trip only happens in directories that actually contain links.
 * It runs without a shell, like the listing itself, so an image with `ls` and
 * no `sh` keeps working.
 *
 * A broken link stays sizeless. `ls -L` cannot stat what is not there, and a
 * dash is the honest answer for a link that leads nowhere.
 */
async function resolveLinks(
  t: PodTarget, path: string, entries: FileEntry[],
): Promise<void> {
  if (!entries.some(e => e.kind === 'link')) return;

  const r = await run(execArgs(t, ['ls', '-lLAn', path]));
  if (r.code !== 0 && !r.stdout.trim()) return;

  const resolved = new Map<string, FileEntry>();
  for (const line of r.stdout.split('\n')) {
    const e = parseLsLine(line, path);
    if (e) resolved.set(e.name, e);
  }
  for (const e of entries) {
    if (e.kind !== 'link') continue;
    const to = resolved.get(e.name);
    if (!to) continue;
    e.linkKind = to.kind;
    // Only a link to a regular file has a size worth showing; the size `ls`
    // reports for a directory is the size of the directory entry itself.
    if (to.kind === 'file' && e.size === undefined) e.size = to.size;
  }
}

/**
 * Turn an exec failure into something with a cause in it.
 *
 * The raw messages name an executable or a syscall and nobody connects those
 * to "this image is distroless" or "you are uid 1000". Each of these is a
 * different thing to do next, which is the only reason to tell them apart.
 */
export function explainExecFailure(stderr: string, path: string): string {
  const s = (stderr || '').trim();
  if (/executable file not found|no such file or directory.*exec|OCI runtime exec/i.test(s)
      && /"ls"|"find"|"cat"|"sh"/.test(s)) {
    return 'This container has no shell or coreutils — nothing can list a path inside it. '
      + 'Distroless and scratch images look like this.';
  }
  if (/permission denied/i.test(s)) {
    return `Permission denied reading ${path}. The container runs as a user that cannot see it — `
      + 'a root-owned volume under a non-root container looks exactly like this.';
  }
  /*
    The container is not running.

    `unable to upgrade connection: container not found` is what kubectl says
    when the pod exists but the container is starting, crash-looping or already
    gone — and it reads like a networking fault, which sends people to look at
    the wrong thing entirely.
  */
  const missing = /container not found \("([^"]+)"\)/.exec(s);
  if (missing) {
    return `The container "${missing[1]}" is not running, so there is nothing to exec into. `
      + 'A pod that is starting, crash-looping or terminating looks like this — '
      + 'check the pod status before the filesystem.';
  }
  if (/unable to upgrade connection/i.test(s)) {
    return 'Could not open an exec session to this pod. It is usually a container that is '
      + 'not running yet, or a node that has stopped answering.';
  }
  if (/no such file or directory/i.test(s)) return `No such directory: ${path}`;
  if (/not found/i.test(s) && /pods?\s/i.test(s)) return 'That pod is gone.';
  if (/forbidden/i.test(s)) {
    return 'Not allowed to exec into this pod. That is an RBAC decision on pods/exec, '
      + 'not something dk8s can work around.';
  }
  return s || 'The command failed with no output.';
}

// ── Search ──────────────────────────────────────────────────────────────────

export interface SearchOptions {
  /** Where to start. Absolute. */
  root: string;
  /** A glob as `find -name` understands it. `*` is added when absent. */
  pattern: string;
  maxDepth?: number;
  limit?: number;
  /** Directories are worth finding too when someone is hunting a mount. */
  kind?: 'file' | 'dir' | 'any';
  caseSensitive?: boolean;
}

export interface SearchHit {
  path: string;
  name: string;
  /** From the stat pass; absent when `ls` could not reach the file. */
  size?: number;
  modified?: string;
}

export interface SearchResult {
  hits: SearchHit[];
  /** True when the cap stopped us, so the UI can say "showing the first N". */
  capped: boolean;
  command: string;
  error?: string;
}

/**
 * `find`, capped three ways, and every cap is load-bearing.
 *
 * A PersistentVolume can hold millions of files and an uncapped `find /` on a
 * pod that is already struggling is a real way to make an incident worse.
 * `2>/dev/null` is not tidiness either: on any volume with mixed ownership the
 * permission-denied lines outnumber the hits.
 */
/**
 * Characters that only ever mean something in a regex.
 *
 * `?` alone cannot decide: it is a glob wildcard AND the commonest regex
 * quantifier, and reading it as a glob sent `\.ya?ml$` to `find -iname`,
 * which matched nothing. So a pattern is a glob only when it has `*` or `?`
 * and nothing that would be meaningless outside a regex. `.` is deliberately
 * absent — it appears in almost every filename, and treating `*.pdf` as a
 * regex would be the more surprising reading by far.
 */
export const REGEX_ONLY = /[\\\[\]()+^$|{}]/;

export async function searchFiles(t: PodTarget, o: SearchOptions): Promise<SearchResult> {
  const limit = o.limit ?? 500;
  const depth = o.maxDepth ?? 8;
  const typeArgs = o.kind === 'dir' ? ['-type', 'd']
    : o.kind === 'any' ? []
      : ['-type', 'f'];

  /*
    Glob or regex, decided by the pattern rather than by a checkbox.

    `*` and `?` are glob metacharacters and almost never what someone means in
    a regex typed into a file-search box, so a pattern containing either goes
    to `find -iname` exactly as it always did — `*.pdf` and `*invoice*` keep
    working, and nothing anyone has already typed changes meaning.

    Everything else goes through `grep -E`, which makes the box a regex box by
    default: `inv[0-9]+\.pdf`, `\.ya?ml$`, `^/etc` all work, and a bare word
    still behaves as the substring search it was, because a word is its own
    regex. The trade is that grep matches the whole PATH where `-iname`
    matched the basename, which is why the anchors are worth having.
  */
  const isGlob = /[*?]/.test(o.pattern) && !REGEX_ONLY.test(o.pattern);
  const nameFlag = o.caseSensitive ? '-name' : '-iname';

  /*
    Run through `sh -c` so the redirect and the pipe are the shell's, not
    arguments handed to `find`. Without it `2>/dev/null` is a path to search.
  */
  const script = [
    'find', shellQuote(o.root), '-maxdepth', String(depth),
    ...(isGlob ? [nameFlag, shellQuote(o.pattern)] : []),
    ...typeArgs,
    '2>/dev/null',
    ...(isGlob ? [] : ['|', 'grep', o.caseSensitive ? '-E' : '-Ei', '--', shellQuote(o.pattern)]),
    '|', 'head', '-n', String(limit + 1),
    /*
      Then stat what survived the cap, so a hit can show its size.

      `find` cannot print a size portably — `-printf` is GNU-only and would
      break on the Alpine and busybox images this mostly meets — so the paths
      go back through `ls -lLd` and return as listing lines the parser already
      understands and is tested against. `-L` so a symlinked hit reports what
      it points at.

      The cap comes FIRST, deliberately. `-exec ls {} +` batches more neatly
      but would stat everything `find` turned up before anything was capped,
      which on a large volume is exactly the runaway the caps exist to stop.
      A `while read` loop rather than `xargs`, because xargs splits on spaces
      unless given flags busybox does not have, and a path with a space in it
      is not an edge case.
    */
    '|', 'while', 'IFS=', 'read', '-r', 'f;', 'do', 'ls', '-lLd', '"$f"', '2>/dev/null;', 'done',
  ].join(' ');

  const args = execArgs(t, ['sh', '-c', script]);
  const command = showCommand(args);
  const r = await run(args);

  if (r.code !== 0 && !r.stdout.trim()) {
    return { hits: [], capped: false, command, error: explainExecFailure(r.stderr, o.root) };
  }

  const lines = r.stdout.split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean);
  const capped = lines.length > limit;

  /*
    Every line is now an `ls -l` line whose name field is the full path, so
    there is no directory to join on — the parser is given an empty one.
  */
  const hits: SearchHit[] = [];
  for (const line of lines.slice(0, limit)) {
    const e = parseLsLine(line, '');
    if (!e) continue;
    hits.push({
      path: e.name,
      name: e.name.slice(e.name.lastIndexOf('/') + 1),
      size: e.size,
      modified: e.modified,
    });
  }
  return { hits, capped, command };
}

/** Single-quote for `sh -c`, the only form with no escapes inside it. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** Above this a file is offered as a download instead of rendered. */
export const VIEW_LIMIT_BYTES = 2 * 1024 * 1024;

export interface ReadResult {
  path: string;
  text?: string;
  bytes: number;
  /** True when the content is not text and should not be rendered. */
  binary?: boolean;
  /** True when the file is over the cap and was not read at all. */
  tooLarge?: boolean;
  command: string;
  error?: string;
}

export async function readFile(
  t: PodTarget, path: string, sizeHint?: number,
): Promise<ReadResult> {
  if (sizeHint !== undefined && sizeHint > VIEW_LIMIT_BYTES) {
    return {
      path, bytes: sizeHint, tooLarge: true,
      command: '', // nothing ran; saying otherwise would be a lie
    };
  }

  const args = execArgs(t, ['cat', path]);
  const command = showCommand(args);
  const r = await run(args, { maxBuffer: VIEW_LIMIT_BYTES * 2 });

  if (r.code !== 0) {
    return { path, bytes: 0, command, error: explainExecFailure(r.stderr, path) };
  }

  const text = r.stdout;
  return {
    path,
    bytes: Buffer.byteLength(text, 'utf8'),
    // A NUL in the first few KB is the cheapest reliable way to tell a binary
    // from a text file whatever the extension claims.
    binary: looksBinary(text),
    text: looksBinary(text) ? undefined : text,
    command,
  };
}

export function looksBinary(text: string): boolean {
  return text.slice(0, 8192).includes('\0');
}

// ── What can be shown ───────────────────────────────────────────────────────

/**
 * Extension to a highlighting mode.
 *
 * Deliberately generous: refusing to open a readable file is a worse failure
 * than opening one that renders plainly, and the NUL check above is the real
 * gate. Names with no extension — most of `/etc` — fall through to `text`,
 * which is right for nearly all of them.
 */
const BY_EXTENSION: Record<string, string> = {
  properties: 'properties', conf: 'properties', cfg: 'properties', ini: 'properties',
  env: 'properties',
  yaml: 'yaml', yml: 'yaml',
  json: 'json',
  xml: 'xml', xsd: 'xml', xsl: 'xml', html: 'xml', htm: 'xml',
  csv: 'csv', tsv: 'csv',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql',
  md: 'markdown',
  log: 'log', out: 'log', err: 'log',
  txt: 'text', text: 'text',
  java: 'code', kt: 'code', scala: 'code', groovy: 'code',
  py: 'code', rb: 'code', go: 'code', rs: 'code',
  js: 'code', ts: 'code', tsx: 'code', jsx: 'code', mjs: 'code', cjs: 'code',
  c: 'code', h: 'code', cpp: 'code', hpp: 'code', cs: 'code', php: 'code',
  toml: 'properties',
};

export interface FileKind {
  /** How to colour it, or undefined when nothing here can render it. */
  mode?: string;
  /** The short badge the row shows: `csv`, `properties`, `binary`. */
  label: string;
  viewable: boolean;
}

export function kindOf(name: string, size?: number): FileKind {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const mode = BY_EXTENSION[ext];

  if (size !== undefined && size > VIEW_LIMIT_BYTES) {
    // Type is irrelevant past the cap; the only honest label is why.
    return { label: 'too large', viewable: false };
  }
  if (mode) return { mode, label: ext, viewable: true };
  // No extension at all is usually a config file, and usually readable.
  if (!ext) return { mode: 'text', label: 'file', viewable: true };
  return { label: ext || 'binary', viewable: false };
}
