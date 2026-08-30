/**
 * Archived pod logs on a mounted volume.
 *
 * `kubectl logs` can only reach the current container and the one before it.
 * Everything older is gone the moment a pod is replaced — which is exactly the
 * window you want when a pod has been restarting for a day and you are trying
 * to find out why it started. Teams solve that by shipping logs somewhere
 * durable; where that somewhere is a persistent volume mounted on the
 * developer's machine, the files are right there and dk8s can read them.
 *
 * Two ways to find a pod's files, because no two teams lay a volume out the
 * same way:
 *
 *   template  `{root}/{namespace}/{app}/{date}/*.log` — expanded per pod, so
 *             only the directories that can hold that pod's logs are touched.
 *             Fast, and the normal case.
 *   pattern   a regex over every path under the root, with named groups for
 *             namespace/app/pod. Works with any layout, at the cost of a walk.
 *
 * The template is tried first and the pattern picks up whatever it does not
 * cover, so a mostly-regular tree with a few exceptions needs no compromise.
 *
 * Everything here is read-only, and every resolved path is checked to be
 * inside the configured root — a template is user-supplied text, and `..` in
 * one must not turn a log search into a filesystem walk of the whole machine.
 */

import { promises as fs } from 'fs';
import * as path from 'path';

export interface PvLogConfig {
  enabled: boolean;
  /** The mount point. Everything is resolved relative to this. */
  root: string;
  /** `{namespace}/{app}/{date}/*.log`. Relative to root. */
  template?: string;
  /** Regex over the root-relative path, for anything the template misses. */
  pattern?: string;
  /** Only consider files matching these extensions. Empty means all. */
  extensions?: string[];
  /** Skip files older than this. 0 means no limit. */
  maxAgeDays?: number;
}

export interface PvFile {
  /** Absolute path. */
  file: string;
  /** Path relative to the root — what the UI shows. */
  rel: string;
  bytes: number;
  mtime: number;
  /** Whatever the template or pattern could tell us about the owner. */
  namespace?: string;
  app?: string;
  pod?: string;
}

/** Walking a mounted volume is I/O; these keep a search from re-walking it. */
const WALK_TTL_MS = 60_000;
const MAX_FILES = 20_000;
const MAX_DEPTH = 12;

let walkCache: { at: number; root: string; files: PvFile[] } | undefined;

export function clearPvCache(): void {
  walkCache = undefined;
}

/**
 * The application name behind a pod name.
 *
 * `zp-backend-7f9455548d-xm6kc` → `zp-backend`. A volume is almost always laid
 * out per application rather than per pod — a directory per pod would grow
 * without bound — so this is the placeholder that usually matters.
 *
 * Deployments add a ReplicaSet hash and a pod suffix; StatefulSets add an
 * ordinal; DaemonSets add one suffix. Peeling from the right handles all three
 * without needing to ask the API server what owns the pod.
 */
export function appNameOf(pod: string): string {
  let s = pod;
  // Pod suffix: five characters of the same alphabet Kubernetes uses.
  const suffix = /-[a-z0-9]{5}$/;
  // ReplicaSet hash: base-32 without vowels, 6-10 characters.
  const rsHash = /-[a-bcdfghjklmnpqrstvwxz2-9]{6,10}$/;
  const ordinal = /-\d+$/;

  if (ordinal.test(s) && !suffix.test(s)) return s.replace(ordinal, '');
  if (suffix.test(s)) {
    s = s.replace(suffix, '');
    if (rsHash.test(s)) s = s.replace(rsHash, '');
    return s;
  }
  return s;
}

export interface PodRef {
  namespace: string;
  pod: string;
  container?: string;
}

/**
 * Expand a template into concrete path segments.
 *
 * Returns segments rather than a single string so the walker can tell a
 * literal directory from one that has to be globbed.
 */
export function expandTemplate(template: string, ref: PodRef): string {
  return template
    .replace(/\{namespace\}/g, ref.namespace)
    .replace(/\{pod\}/g, ref.pod)
    .replace(/\{app\}/g, appNameOf(ref.pod))
    .replace(/\{container\}/g, ref.container ?? '*')
    // A date placeholder means "any date": pinning today's would miss the
    // rotated file that holds the crash you are looking for.
    .replace(/\{date\}/g, '*');
}

/** A glob segment to a regex. `**` is handled by the walker, not here. */
function globToRegExp(seg: string): RegExp {
  return new RegExp('^' + seg
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/\\\\]*')
    .replace(/\?/g, '.') + '$', 'i');
}

/** Is `p` genuinely inside `root`, after symlinks and `..` are resolved? */
export async function isInsideRoot(root: string, p: string): Promise<boolean> {
  try {
    const realRoot = await fs.realpath(root);
    const realPath = await fs.realpath(p);
    const rel = path.relative(realRoot, realPath);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  } catch {
    return false;
  }
}

function wanted(cfg: PvLogConfig, name: string, mtime: number, now: number): boolean {
  const exts = cfg.extensions?.filter(Boolean) ?? [];
  if (exts.length) {
    const lower = name.toLowerCase();
    // `.log.1` and `app.log.2026-08-30` are logs too, so this is a contains
    // check on the extension rather than a strict suffix.
    if (!exts.some(e => lower.includes(e.toLowerCase().replace(/^\./, '.')))) return false;
  }
  if (cfg.maxAgeDays && cfg.maxAgeDays > 0) {
    if (now - mtime > cfg.maxAgeDays * 86_400_000) return false;
  }
  return true;
}

/**
 * Every candidate file under the root.
 *
 * Bounded on both depth and count: a mount can be someone's entire log estate,
 * and an unbounded walk of it would hang the extension host rather than
 * failing in a way anyone can act on.
 */
export async function walkRoot(
  cfg: PvLogConfig, now = Date.now(),
): Promise<PvFile[]> {
  if (walkCache && walkCache.root === cfg.root && now - walkCache.at < WALK_TTL_MS) {
    return walkCache.files;
  }

  const out: PvFile[] = [];
  const root = path.resolve(cfg.root);

  async function visit(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;   // unreadable directory: skip it, do not fail the search
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await visit(full, depth + 1);
      } else if (e.isFile()) {
        let st;
        try { st = await fs.stat(full); } catch { continue; }
        if (!wanted(cfg, e.name, st.mtimeMs, now)) continue;
        out.push({
          file: full,
          rel: path.relative(root, full).replace(/\\/g, '/'),
          bytes: st.size,
          mtime: st.mtimeMs,
        });
      }
    }
  }

  await visit(root, 0);
  out.sort((a, b) => b.mtime - a.mtime);
  walkCache = { at: now, root: cfg.root, files: out };
  return out;
}

/** Attach namespace/app/pod from a pattern's named groups, where it matches. */
export function applyPattern(files: PvFile[], pattern: string): PvFile[] {
  let rx: RegExp;
  try {
    rx = new RegExp(pattern, 'i');
  } catch {
    return files;   // a half-typed regex in settings must not break a search
  }
  return files.map(f => {
    const m = rx.exec(f.rel);
    if (!m) return f;
    const g = (m.groups ?? {}) as Record<string, string>;
    return { ...f, namespace: g.namespace ?? f.namespace, app: g.app ?? f.app, pod: g.pod ?? f.pod };
  });
}

/**
 * The files that belong to one pod.
 *
 * Template first — it names the directories directly, so a well-laid-out
 * volume needs no walk at all. The pattern then adds anything the template
 * missed, which is what makes a mostly-regular tree with exceptions workable.
 */
export async function filesForPod(
  cfg: PvLogConfig, ref: PodRef, now = Date.now(),
): Promise<PvFile[]> {
  const found = new Map<string, PvFile>();
  const root = path.resolve(cfg.root);

  if (cfg.template?.trim()) {
    const expanded = expandTemplate(cfg.template.trim(), ref);
    for (const f of await matchTemplate(cfg, root, expanded, now)) {
      found.set(f.file, { ...f, namespace: ref.namespace, pod: ref.pod, app: appNameOf(ref.pod) });
    }
  }

  if (cfg.pattern?.trim()) {
    const app = appNameOf(ref.pod);
    for (const f of applyPattern(await walkRoot(cfg, now), cfg.pattern.trim())) {
      if (found.has(f.file)) continue;
      // A pattern with no groups cannot say who a file belongs to, so fall
      // back to the pod or app name appearing in the path — which is how these
      // trees are named in practice.
      const claims = (f.pod && f.pod === ref.pod)
        || (f.app && f.app === app)
        || (!f.pod && !f.app && (f.rel.includes(ref.pod) || f.rel.includes(app)));
      if (claims) found.set(f.file, f);
    }
  }

  const list = [...found.values()];
  list.sort((a, b) => b.mtime - a.mtime);
  return list;
}

/** Walk only the directories an expanded template can reach. */
async function matchTemplate(
  cfg: PvLogConfig, root: string, expanded: string, now: number,
): Promise<PvFile[]> {
  const segs = expanded.split(/[/\\]/).filter(Boolean);
  const out: PvFile[] = [];

  async function step(dir: string, i: number, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;

    // Past the last segment there is nothing more to match.
    if (i >= segs.length) return;
    const seg = segs[i];
    const last = i === segs.length - 1;

    // `**` matches any number of directories, so try both consuming it and not.
    if (seg === '**') {
      await step(dir, i + 1, depth);
      let subs;
      try { subs = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of subs) {
        if (e.isDirectory()) await step(path.join(dir, e.name), i, depth + 1);
      }
      return;
    }

    const rx = globToRegExp(seg);
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }

    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      if (!rx.test(e.name)) continue;
      const full = path.join(dir, e.name);
      if (last && e.isFile()) {
        let st;
        try { st = await fs.stat(full); } catch { continue; }
        if (!wanted(cfg, e.name, st.mtimeMs, now)) continue;
        if (!(await isInsideRoot(root, full))) continue;
        out.push({
          file: full,
          rel: path.relative(root, full).replace(/\\/g, '/'),
          bytes: st.size,
          mtime: st.mtimeMs,
        });
      } else if (!last && e.isDirectory()) {
        await step(full, i + 1, depth + 1);
      }
    }
  }

  await step(root, 0, 0);
  return out;
}

/**
 * What the settings page shows to prove the configuration works.
 *
 * Confirming a template against a real tree before running a search is the
 * difference between "no matches because nothing matched" and "no matches
 * because the path was wrong", and those look identical from the results.
 */
export interface PvProbe {
  ok: boolean;
  error?: string;
  root: string;
  /** Directories directly under the root, as a sanity check on the mount. */
  topLevel: string[];
  fileCount: number;
  totalBytes: number;
  newest?: number;
  oldest?: number;
  /** A handful of real paths, so the template can be checked by eye. */
  sample: { rel: string; bytes: number; mtime: number }[];
}

export async function probePv(cfg: PvLogConfig, now = Date.now()): Promise<PvProbe> {
  const root = path.resolve(cfg.root || '');
  const empty: PvProbe = { ok: false, root, topLevel: [], fileCount: 0, totalBytes: 0, sample: [] };

  if (!cfg.root?.trim()) return { ...empty, error: 'No path set.' };
  try {
    const st = await fs.stat(root);
    if (!st.isDirectory()) return { ...empty, error: 'That path is not a directory.' };
  } catch {
    return { ...empty, error: 'That path does not exist, or is not readable from here.' };
  }

  let topLevel: string[] = [];
  try {
    topLevel = (await fs.readdir(root, { withFileTypes: true }))
      .filter(e => e.isDirectory()).map(e => e.name).slice(0, 200);
  } catch { /* readable root with unreadable listing — leave it empty */ }

  const files = await walkRoot(cfg, now);
  const totalBytes = files.reduce((n, f) => n + f.bytes, 0);
  return {
    ok: true,
    root,
    topLevel,
    fileCount: files.length,
    totalBytes,
    newest: files[0]?.mtime,
    oldest: files[files.length - 1]?.mtime,
    sample: files.slice(0, 12).map(f => ({ rel: f.rel, bytes: f.bytes, mtime: f.mtime })),
  };
}
