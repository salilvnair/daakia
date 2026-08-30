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

/**
 * One mounted volume.
 *
 * There is a list of these rather than a single root because a PersistentVolume
 * is usually claimed per application per environment — `zp-backend-prod-pvc`
 * and `zp-backend-dev-pvc` are two different volumes holding the same app's
 * logs for two different clusters. A single root cannot express that, and
 * worse, searching one flat root would answer a question about a production
 * pod with a line from the dev volume.
 *
 * `context` and `namespace` are how a mount stays scoped to the cluster it
 * belongs to. Left blank, the mount is searched for every pod.
 */
export interface PvMount {
  /** Where it is mounted on this machine. */
  path: string;
  /** Shown in the settings list and on results. Optional. */
  label?: string;
  /** Only use this mount for pods in this context. Substring, case-insensitive. */
  context?: string;
  /** Only use this mount for pods in this namespace. Substring. */
  namespace?: string;
  /** Overrides the shared template for this mount alone. */
  template?: string;
}

export interface PvLogConfig {
  enabled: boolean;
  /**
   * The volumes to search.
   *
   * `root` is the older single-mount field and is still read, so a config
   * written before this keeps working rather than silently searching nothing.
   */
  mounts?: PvMount[];
  /** @deprecated superseded by `mounts`; still honoured on read. */
  root?: string;
  /** `{namespace}/{app}/{date}/*.log`. Relative to each mount. */
  template?: string;
  /** Regex over the mount-relative path, for anything the template misses. */
  pattern?: string;
  /** Only consider files matching these extensions. Empty means all. */
  extensions?: string[];
  /** Skip files older than this. 0 means no limit. */
  maxAgeDays?: number;
  /**
   * What `{env}` means, per context.
   *
   * A claim is usually named after the workload and the environment it runs
   * in — `zp-backend-prod-pvc`, holding `zp-backend-prod-logs`. Both halves
   * are derivable: the app from the pod name, the environment from which
   * cluster you are looking at. Kubernetes has no notion of "environment", so
   * the mapping is the one thing that has to be stated.
   *
   * Keys are matched as case-insensitive substrings of the context name, so
   * `prod` covers `aks-prod-eu` and `prod-01` without listing either.
   *
   * Unmapped, `{env}` expands to `*`. That still finds the files — it just
   * cannot tell a prod claim from a dev one, so it may find both.
   */
  envByContext?: Record<string, string>;
  /**
   * What `{app}` means, for pods the derivation gets wrong.
   *
   * Almost never needed: a pod's owner is authoritative and Kubernetes hands
   * it to us. This is for the two cases it cannot cover — a bare pod with no
   * owning workload, and a claim whose directory is named something other
   * than the workload (`payments-api` writing into `payments/`).
   *
   * Keys are matched as case-insensitive substrings of the pod name, longest
   * first.
   */
  appByPod?: Record<string, string>;
  /**
   * A path straight from a pod name, for volumes the template cannot describe.
   *
   * `{app}`/`{env}` assume the claim is named after the workload and the
   * environment. Plenty of them are not — a share laid out by team, a path
   * inherited from before the cluster, one service written somewhere else
   * entirely. Rather than bending the shared template until it covers the
   * exception and stops describing the rule, name the exception.
   *
   * Keys match the pod name: a glob when the key contains `*` or `?`
   * (`zp-backend-*`), otherwise a case-insensitive substring, which is how
   * `appByPod` already behaves. Longest key wins, so a specific pod beats a
   * family of them.
   *
   * Values are templates, so `{app}`, `{env}`, `{date}` and globs all still
   * work — this replaces which template a matching pod uses, not the fact that
   * it is a template.
   */
  pathByPod?: Record<string, string>;
}

/**
 * The mounts a config actually has, old shape or new.
 *
 * One place does the migration so nothing downstream has to know `root` ever
 * existed.
 */
export function mountsOf(cfg: PvLogConfig): PvMount[] {
  const list = (cfg.mounts ?? []).filter(m => m.path?.trim());
  if (list.length) return list;
  return cfg.root?.trim() ? [{ path: cfg.root }] : [];
}

/** Does this mount apply to this pod? Blank fields mean "any". */
export function mountApplies(m: PvMount, ref: PodRef): boolean {
  const has = (rule: string | undefined, value: string | undefined) => {
    const r = rule?.trim().toLowerCase();
    if (!r) return true;
    return (value ?? '').toLowerCase().includes(r);
  };
  return has(m.context, ref.context) && has(m.namespace, ref.namespace);
}

export interface PvFile {
  /** Absolute path. */
  file: string;
  /** Path relative to its mount — what the UI shows. */
  rel: string;
  /** Which mount it came from, so a hit can say which volume it is on. */
  mount?: string;
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

const walkCache = new Map<string, { at: number; files: PvFile[] }>();

export function clearPvCache(): void {
  walkCache.clear();
}

/**
 * The application name guessed from a pod name.
 *
 * `zp-backend-7f9455548d-xm6kc` → `zp-backend`. Deployments add a ReplicaSet
 * hash and a pod suffix; StatefulSets add an ordinal; DaemonSets add one
 * suffix, and peeling from the right handles all three.
 *
 * It is a guess, and only the last resort — see `appOf`. A pod named
 * `test-abc` has a three-character tail that is not a Kubernetes suffix, and
 * this returns `test-abc`; an application whose own name ends in something
 * hash-shaped loses a segment it should have kept. Neither is knowable from
 * the string alone, which is why the owner is asked first.
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
  /** Used to pick which mounts apply, and to resolve `{env}`. */
  context?: string;
  /**
   * The owning workload's name, straight from the pod's ownerReferences.
   *
   * This is what `{app}` should be whenever we have it. Kubernetes knows the
   * answer — a Deployment's pods carry a reference to their ReplicaSet, which
   * carries one to the Deployment — so deriving the name from the pod string
   * is guesswork we only need when there is no owner at all.
   */
  workload?: string;
}

/**
 * Expand a template into concrete path segments.
 *
 * Returns segments rather than a single string so the walker can tell a
 * literal directory from one that has to be globbed.
 */
export function expandTemplate(
  template: string, ref: PodRef, env = '*', app = appNameOf(ref.pod),
): string {
  return template
    .replace(/\{namespace\}/g, ref.namespace)
    .replace(/\{pod\}/g, ref.pod)
    .replace(/\{app\}/g, app)
    .replace(/\{env\}/g, env)
    .replace(/\{container\}/g, ref.container ?? '*')
    // A date placeholder means "any date": pinning today's would miss the
    // rotated file that holds the crash you are looking for.
    .replace(/\{date\}/g, '*');
}

/**
 * The environment token for a pod's context.
 *
 * Longest key first, so `prod` in the map does not shadow a more specific
 * `preprod` — substring matching would otherwise pick whichever was declared
 * first, which is not something a user can see or reason about.
 */
/**
 * What `{app}` expands to, in order of how much it is trusted.
 *
 *   1. an explicit mapping, because the user knows their own layout
 *   2. the owning workload, because Kubernetes knows the answer
 *   3. the pod name with its hash peeled off, because something is better
 *      than nothing for a bare pod
 */
export function appOf(cfg: PvLogConfig, ref: PodRef): string {
  const pod = ref.pod.toLowerCase();
  const keys = Object.keys(cfg.appByPod ?? {}).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (k.trim() && pod.includes(k.trim().toLowerCase())) return cfg.appByPod![k];
  }
  if (ref.workload?.trim()) return ref.workload.trim();
  return appNameOf(ref.pod);
}

/**
 * Does this mapping key claim this pod?
 *
 * Two forms because two habits: people write `zp-backend` meaning "anything
 * with this in the name", and `zp-backend-*` meaning a pattern. Guessing
 * between them by looking for glob characters is unambiguous — a key without
 * `*` or `?` cannot have been meant as a glob.
 */
export function podKeyMatches(key: string, pod: string): boolean {
  const k = key.trim();
  if (!k) return false;
  if (k.includes('*') || k.includes('?')) return globToRegExp(k).test(pod);
  return pod.toLowerCase().includes(k.toLowerCase());
}

/**
 * The template a pod's files should be looked for with.
 *
 * Most specific first: a path named for this pod, then the mount's own
 * override, then the shared template. Returns '' when there is nothing to go
 * on, which the caller treats as "this mount has no opinion about this pod".
 */
export function templateForPod(cfg: PvLogConfig, ref: PodRef, mount?: PvMount): string {
  const keys = Object.keys(cfg.pathByPod ?? {}).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const v = (cfg.pathByPod![k] ?? '').trim();
    if (v && podKeyMatches(k, ref.pod)) return v;
  }
  return (mount?.template ?? cfg.template ?? '').trim();
}

export function envFor(cfg: PvLogConfig, ref: PodRef): string {
  const ctx = (ref.context ?? '').toLowerCase();
  if (!ctx) return '*';
  const keys = Object.keys(cfg.envByContext ?? {}).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (k.trim() && ctx.includes(k.trim().toLowerCase())) return cfg.envByContext![k];
  }
  return '*';
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
  cfg: PvLogConfig, rootPath: string, now = Date.now(),
): Promise<PvFile[]> {
  const hit = walkCache.get(rootPath);
  if (hit && now - hit.at < WALK_TTL_MS) return hit.files;

  const out: PvFile[] = [];
  const root = path.resolve(rootPath);

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
  walkCache.set(rootPath, { at: now, files: out });
  return out;
}

/** Every candidate file across every mount that applies to this pod. */
export async function walkMounts(
  cfg: PvLogConfig, ref?: PodRef, now = Date.now(),
): Promise<PvFile[]> {
  const out: PvFile[] = [];
  for (const m of mountsOf(cfg)) {
    if (ref && !mountApplies(m, ref)) continue;
    for (const f of await walkRoot(cfg, m.path, now)) {
      out.push({ ...f, mount: m.label ?? m.path });
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
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

  for (const m of mountsOf(cfg)) {
    // A mount scoped to another cluster or namespace is skipped entirely —
    // this is what stops a question about a production pod being answered
    // with a line from the dev volume.
    if (!mountApplies(m, ref)) continue;

    const root = path.resolve(m.path);
    const template = templateForPod(cfg, ref, m);
    if (!template) continue;

    const expanded = expandTemplate(template, ref, envFor(cfg, ref), appOf(cfg, ref));
    for (const f of await matchTemplate(cfg, root, expanded, now)) {
      found.set(f.file, {
        ...f, mount: m.label ?? m.path,
        namespace: ref.namespace, pod: ref.pod, app: appOf(cfg, ref),
      });
    }
  }

  if (cfg.pattern?.trim()) {
    const app = appOf(cfg, ref);
    for (const f of applyPattern(await walkMounts(cfg, ref, now), cfg.pattern.trim())) {
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
export interface PvSampleFile {
  rel: string;
  bytes: number;
  mtime: number;
}

/** What one mount holds. */
export interface PvMountProbe {
  ok: boolean;
  error?: string;
  path: string;
  label?: string;
  /** The absolute path it resolved to, which is what a typo shows up in. */
  resolved: string;
  /** Directories directly under it, as a sanity check on the mount. */
  topLevel: string[];
  fileCount: number;
  totalBytes: number;
  newest?: number;
  oldest?: number;
  /** Real paths, so a template can be checked by eye. */
  sample: PvSampleFile[];
}

export interface PvProbe {
  /** True when at least one mount is readable. */
  ok: boolean;
  error?: string;
  mounts: PvMountProbe[];
  fileCount: number;
  totalBytes: number;
  newest?: number;
  oldest?: number;
  sample: PvSampleFile[];
}

export async function probePv(cfg: PvLogConfig, now = Date.now()): Promise<PvProbe> {
  const mounts = mountsOf(cfg);
  if (!mounts.length) {
    return { ok: false, error: 'No mount path set.', mounts: [], fileCount: 0, totalBytes: 0, sample: [] };
  }

  // Every mount is probed, not just the first: a config with a working prod
  // volume and a mistyped dev one should say exactly that, rather than
  // reporting "ok" and quietly searching half of what was asked for.
  const reports: PvMountProbe[] = [];
  for (const m of mounts) {
    reports.push(await probeMount(cfg, m, now));
  }

  const all = reports.flatMap(r => r.sample);
  all.sort((a, b) => b.mtime - a.mtime);

  return {
    ok: reports.some(r => r.ok),
    mounts: reports,
    fileCount: reports.reduce((n, r) => n + r.fileCount, 0),
    totalBytes: reports.reduce((n, r) => n + r.totalBytes, 0),
    newest: reports.map(r => r.newest).filter((x): x is number => !!x).sort((a, b) => b - a)[0],
    oldest: reports.map(r => r.oldest).filter((x): x is number => !!x).sort((a, b) => a - b)[0],
    sample: all.slice(0, 12),
  };
}

async function probeMount(cfg: PvLogConfig, m: PvMount, now: number): Promise<PvMountProbe> {
  const root = path.resolve(m.path || '');
  const base: PvMountProbe = {
    ok: false, path: m.path, label: m.label, resolved: root,
    topLevel: [], fileCount: 0, totalBytes: 0, sample: [],
  };

  if (!m.path?.trim()) return { ...base, error: 'No path set.' };
  try {
    const st = await fs.stat(root);
    if (!st.isDirectory()) return { ...base, error: 'That path is not a directory.' };
  } catch {
    return { ...base, error: 'That path does not exist, or is not readable from here.' };
  }

  let topLevel: string[] = [];
  try {
    topLevel = (await fs.readdir(root, { withFileTypes: true }))
      .filter(e => e.isDirectory()).map(e => e.name).slice(0, 200);
  } catch { /* readable root with unreadable listing — leave it empty */ }

  const files = await walkRoot(cfg, m.path, now);
  return {
    ...base,
    ok: true,
    topLevel,
    fileCount: files.length,
    totalBytes: files.reduce((n, f) => n + f.bytes, 0),
    newest: files[0]?.mtime,
    oldest: files[files.length - 1]?.mtime,
    sample: files.slice(0, 8).map(f => ({ rel: f.rel, bytes: f.bytes, mtime: f.mtime })),
  };
}
