/**
 * The walk, and the detectors run over it.
 *
 * Knows nothing about any framework. It walks a directory once, hands each
 * detector the files that detector asked for, and collects what comes back.
 *
 * ── Why the walk is done once ──
 *
 * Six detectors each walking the tree is six walks. The file list is gathered
 * once and shared through `RepoRoot`, and file contents are read lazily and
 * cached — most files are opened by one detector, some by none, and a few (a
 * shared annotation, a config file) by all of them.
 *
 * ── Why a cap ──
 *
 * A repository nobody meant to scan is the usual reason a scan runs long: a
 * home directory, a mono-repo, a folder with a `node_modules` that the ignore
 * list did not catch. The cap is a stop, not a guess, and the result says it
 * was hit.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import type {
  ApiDetector, BaseUrl, DetectorId, Finding, RepoRoot, Unresolved,
} from './api-detector';
import { springDetector } from './spring/spring-detector';
import { expressDetector } from './js/express-detector';

/** Every detector that ships. Adding one is a line here and a file beside it. */
export const DETECTORS: readonly ApiDetector[] = [
  springDetector,
  expressDetector,
];

/**
 * Directories never worth walking.
 *
 * The same list `src/mcp/open-source.ts` uses, for the same reason — one of
 * these on a large repository is most of the files and none of the routes.
 */
export const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '.idea', '.vscode', '.gradle', '.mvn',
  'target', 'build', 'dist', 'out', 'bin', 'obj', 'vendor', 'coverage',
  '__pycache__', '.venv', 'venv', 'env', '.next', '.nuxt', '.cache', '.terraform',
]);

/** Extensions worth opening at all. A detector narrows further. */
const EXTENSIONS = new Set([
  '.java', '.kt', '.kts', '.groovy',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py',
  '.yml', '.yaml', '.properties', '.json', '.xml', '.gradle', '.toml', '.env',
  '.graphql', '.graphqls', '.gql', '.proto', '.wsdl',
]);

/** Files that are worth reading whatever their extension says. */
const ALWAYS = new Set(['pom.xml', 'build.gradle', 'build.gradle.kts', 'package.json', 'requirements.txt', 'pyproject.toml']);

export interface ScanOptions {
  /** Stop after this many files. */
  maxFiles?: number;
  /** Extra directory names to skip, from Settings. */
  ignore?: string[];
  /** Which detectors to run; all of them when absent. */
  only?: DetectorId[];
  /** Which Spring profile's configuration to believe. */
  profile?: string;
  /** Called as the walk proceeds, so a screen can say where it is. */
  onProgress?: (p: ScanProgress) => void;
}

export interface ScanProgress {
  file: string;
  filesWalked: number;
  found: number;
}

export interface ScanResult {
  root: string;
  findings: Finding[];
  unresolved: Unresolved[];
  baseUrl?: BaseUrl;
  /** Which detectors recognised the repository, and what said so. */
  detected: { id: DetectorId; label: string }[];
  filesWalked: number;
  /** True when the cap stopped the walk before the tree ran out. */
  capped: boolean;
  ms: number;
}

/** Repo-relative, forward slashes, so a path reads the same on every platform. */
function rel(root: string, abs: string): string {
  return relative(root, abs).split(sep).join('/');
}

/**
 * Every file worth opening, breadth-first.
 *
 * Breadth-first on purpose: when the cap stops a walk, what has been seen is
 * the top of the tree rather than the whole of whichever branch happened to
 * sort first — and configuration and manifests live at the top.
 */
export function walk(dir: string, opts: ScanOptions = {}): { files: string[]; capped: boolean } {
  const max = opts.maxFiles ?? 2000;
  const skip = new Set([...SKIP_DIRS, ...(opts.ignore ?? [])]);
  const files: string[] = [];
  const queue: string[] = [dir];
  let capped = false;

  while (queue.length) {
    const current = queue.shift()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;                       // unreadable directory: not a failed scan
    }
    for (const e of entries) {
      const abs = join(current, e.name);
      if (e.isDirectory()) {
        if (!skip.has(e.name) && !e.name.startsWith('.')) queue.push(abs);
        continue;
      }
      if (!e.isFile()) continue;
      const dot = e.name.lastIndexOf('.');
      const ext = dot < 0 ? '' : e.name.slice(dot);
      if (!ALWAYS.has(e.name) && !EXTENSIONS.has(ext)) continue;
      if (files.length >= max) { capped = true; return { files, capped }; }
      files.push(rel(dir, abs));
    }
  }
  return { files, capped };
}

/** A RepoRoot backed by the filesystem, reading lazily and remembering. */
export function repoRoot(dir: string, files: string[]): RepoRoot {
  const cache = new Map<string, string | undefined>();
  return {
    dir,
    files,
    read(relPath) {
      if (cache.has(relPath)) return cache.get(relPath);
      let text: string | undefined;
      try {
        const abs = join(dir, relPath);
        /* A 5MB minified bundle is not a controller, and reading it costs more
           than every real source file put together. */
        if (statSync(abs).size <= 2_000_000) text = readFileSync(abs, 'utf8');
      } catch { text = undefined; }
      cache.set(relPath, text);
      return text;
    },
  };
}

/**
 * Scan a directory.
 *
 * Never throws for anything a repository can do to it: an unreadable file, a
 * file that is not what its extension claims, a detector that trips over a
 * syntax nobody anticipated. One bad file must not cost the other four hundred.
 */
export function scanRepository(dir: string, opts: ScanOptions = {}): ScanResult {
  const started = Date.now();
  const { files, capped } = walk(dir, opts);
  const root = repoRoot(dir, files);

  const active = DETECTORS
    .filter(d => !opts.only || opts.only.includes(d.id))
    .filter(d => { try { return d.present(root); } catch { return false; } });

  const findings: Finding[] = [];
  const unresolved: Unresolved[] = [];
  let walked = 0;

  for (const detector of active) {
    let index = {};
    try { index = detector.index?.(root) ?? {}; } catch { index = {}; }

    let candidates: string[] = [];
    try { candidates = detector.candidates(root); } catch { candidates = []; }

    for (const path of candidates) {
      const text = root.read(path);
      walked++;
      opts.onProgress?.({ file: path, filesWalked: walked, found: findings.length });
      if (!text) continue;
      try {
        const r = detector.detect({ path, text }, index, root);
        findings.push(...r.findings);
        unresolved.push(...r.unresolved);
      } catch {
        /* A file this detector could not read is a file with no endpoints. */
      }
    }
  }

  let baseUrl: BaseUrl | undefined;
  for (const d of active) {
    try {
      baseUrl = d.baseUrl?.(root, opts.profile) ?? baseUrl;
      if (baseUrl) break;
    } catch { /* a config file it could not read is not a failed scan */ }
  }

  return {
    root: dir,
    findings: markDiscriminators(findings),
    unresolved,
    baseUrl,
    detected: active.map(d => ({ id: d.id, label: d.label })),
    filesWalked: walked,
    capped,
    ms: Date.now() - started,
  };
}

/**
 * A discriminator is only worth showing when something needs discriminating.
 *
 * A detector marks every mapping that declares a `consumes`, because from
 * inside one file it cannot know whether another handler shares the path. Here,
 * with all of them in hand, the ones that turn out to be alone lose the suffix —
 * otherwise every JSON endpoint in the codebase would be named "… — json".
 */
export function markDiscriminators(findings: Finding[]): Finding[] {
  const count = new Map<string, number>();
  for (const f of findings) {
    const k = `${f.method} ${f.path}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  return findings.map(f =>
    count.get(`${f.method} ${f.path}`)! > 1 ? f : { ...f, discriminator: undefined });
}
