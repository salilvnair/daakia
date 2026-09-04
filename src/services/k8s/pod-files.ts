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
  /** The mode string, kept so the UI can explain an unreadable entry. */
  mode?: string;
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

  const [, mode, , , , sizeText, modified, rest] = m;
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

/** `/var/lib/app` becomes the crumb segments the UI walks back through. */
export function crumbsOf(path: string): { name: string; path: string }[] {
  const out = [{ name: '/', path: '/' }];
  let at = '';
  for (const part of path.split('/').filter(Boolean)) {
    at += `/${part}`;
    out.push({ name: part, path: at });
  }
  return out;
}

export interface ListResult {
  path: string;
  entries: FileEntry[];
  command: string;
  error?: string;
}

export async function listDirectory(t: PodTarget, path: string): Promise<ListResult> {
  const args = execArgs(t, ['ls', '-lA', path]);
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
  return { path, entries, command };
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

export interface SearchResult {
  hits: { path: string; name: string }[];
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
export async function searchFiles(t: PodTarget, o: SearchOptions): Promise<SearchResult> {
  const limit = o.limit ?? 500;
  const depth = o.maxDepth ?? 8;
  const pattern = o.pattern.includes('*') ? o.pattern : `*${o.pattern}*`;
  const nameFlag = o.caseSensitive ? '-name' : '-iname';
  const typeArgs = o.kind === 'dir' ? ['-type', 'd']
    : o.kind === 'any' ? []
      : ['-type', 'f'];

  /*
    Run through `sh -c` so the redirect and the pipe are the shell's, not
    arguments handed to `find`. Without it `2>/dev/null` is a path to search.
  */
  const script = [
    'find', shellQuote(o.root), '-maxdepth', String(depth),
    nameFlag, shellQuote(pattern), ...typeArgs,
    '2>/dev/null', '|', 'head', '-n', String(limit + 1),
  ].join(' ');

  const args = execArgs(t, ['sh', '-c', script]);
  const command = showCommand(args);
  const r = await run(args);

  if (r.code !== 0 && !r.stdout.trim()) {
    return { hits: [], capped: false, command, error: explainExecFailure(r.stderr, o.root) };
  }

  const lines = r.stdout.split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean);
  const capped = lines.length > limit;
  return {
    hits: lines.slice(0, limit).map(path => ({
      path,
      name: path.slice(path.lastIndexOf('/') + 1),
    })),
    capped,
    command,
  };
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
