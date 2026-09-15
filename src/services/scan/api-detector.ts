/**
 * What a framework detector has to answer, and what it returns.
 *
 * ── Why an interface at all ──
 *
 * Every framework declares routes its own way, and the differences are not
 * cosmetic: an annotation above a method, a chained call on a router, an object
 * in an array, a file whose *path on disk* is the route. A scanner that knew
 * about all of them would be a pile of special cases with no seam in it.
 *
 * So the scanner knows about none of them. It walks files and asks each
 * registered detector. Adding a framework later is a new file and a line in the
 * registry — nothing in the walk, the review screen or the writer learns about
 * it.
 *
 * ── Why provenance is per FIELD ──
 *
 * A path read verbatim off an annotation and a body invented to satisfy a
 * `@Size(min=3)` are not the same kind of fact, and a screen that shows them
 * identically is lying by omission. Every value a detector produces carries how
 * it came to be known, and the review screen puts that on the row. It is the
 * one thing that makes a generator auditable, which is the difference between
 * one you keep using and one you stop trusting the first time it is wrong.
 *
 * This module is import-free on purpose: the webview reads it through the
 * `@daakia/api-detector` alias rather than keeping a second copy of the shapes.
 */

export type HttpMethod =
  | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export const HTTP_METHODS: readonly HttpMethod[] =
  ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/** Which detector found something. Extend the union, add a file, done. */
export type DetectorId =
  | 'spring' | 'express' | 'hapi' | 'nextjs' | 'fastapi' | 'flask';

/**
 * What each detector is called, in one place.
 *
 * The label lives on the detector object, but a detector imports `fs` and the
 * settings screen has to name all six without running any of them. So the
 * names live here — this module is pure — and each detector reads its own.
 */
export const DETECTOR_LABELS: Record<DetectorId, string> = {
  spring: 'Spring Boot',
  express: 'Express',
  hapi: 'Hapi.js',
  nextjs: 'Next.js',
  fastapi: 'FastAPI',
  flask: 'Flask',
};

/**
 * Directories never worth walking.
 *
 * Here rather than beside the walk because Settings shows the list: without it
 * the box for extra names invites somebody to type `node_modules` into a field
 * that already ignores it, and then to wonder why nothing changed.
 *
 * The same list `src/mcp/open-source.ts` uses, for the same reason — one of
 * these on a large repository is most of the files and none of the routes.
 */
export const SKIP_DIRS: readonly string[] = [
  'node_modules', '.git', '.svn', '.hg', '.idea', '.vscode', '.gradle', '.mvn',
  'target', 'build', 'dist', 'out', 'bin', 'obj', 'vendor', 'coverage',
  '__pycache__', '.venv', 'venv', 'env', '.next', '.nuxt', '.cache', '.terraform',
];

/**
 * A colour per framework, so a list of six is scannable rather than six
 * identical chips in the accent. Brand-adjacent where a framework has a colour
 * worth borrowing (Spring's green, Hapi's orange, Python's blue) and simply
 * distinct where it does not — Express and Next.js are black-and-white.
 *
 * Every one of these is readable on a light and a dark ground; they are used
 * as a text colour over a heavily-mixed version of themselves.
 */
export const DETECTOR_COLORS: Record<DetectorId, string> = {
  spring: '#6DB33F',
  express: '#8A93A8',
  hapi: '#F0932B',
  nextjs: '#A78BFA',
  fastapi: '#0EA5A0',
  flask: '#4B8BBE',
};

/** Every detector id, in the order a list of them should read. */
export const DETECTOR_IDS = Object.keys(DETECTOR_LABELS) as DetectorId[];

/** Where in the source something was read. */
export interface SourceRef {
  /** Repo-relative, forward slashes, so it reads the same on every platform. */
  file: string;
  line: number;
  /** The line itself, trimmed — quoted back on the review screen. */
  snippet?: string;
}

/**
 * How a value came to be known.
 *
 * The order is deliberate: it is also the ranking. When two sources offer the
 * same field, the one earlier in this list wins.
 */
export type Provenance =
  /** Written in the source, verbatim. */
  | { kind: 'read'; at: SourceRef }
  /** Followed through a constant, a mount, or a meta-annotation. */
  | { kind: 'resolved'; at: SourceRef; from: string }
  /** Lifted from a test, a fixture or a spec — a value that demonstrably worked. */
  | { kind: 'example'; at: SourceRef }
  /** Invented, but only ever to satisfy a constraint that was stated. */
  | { kind: 'generated'; rule: string }
  /** Not known, and saying so. */
  | { kind: 'unknown'; why: string };

export const PROVENANCE_RANK: Record<Provenance['kind'], number> = {
  read: 0, example: 1, resolved: 2, generated: 3, unknown: 4,
};

export interface Param {
  name: string;
  /** Empty when nothing better is known — never a plausible-looking invention. */
  value: string;
  required: boolean;
  /** The declared type, for the review screen and for value generation. */
  type?: string;
}

export interface BodyShape {
  mode: 'raw' | 'form' | 'none';
  /** Pretty-printed JSON for `raw`. */
  raw?: string;
  /** The type it was derived from — `CheckoutRequest`, a Pydantic model. */
  from?: string;
}

export interface AuthRequirement {
  scheme: 'none' | 'bearer' | 'basic' | 'apiKey' | 'oauth2' | 'unknown';
  /** The strategy or filter that imposed it, named as the source names it. */
  named?: string;
}

export interface ResponseShape {
  status: number;
  raw?: string;
  from?: string;
}

/**
 * One endpoint, however it was found.
 *
 * `provenance` is keyed by field name — `path`, `body`, `auth`, `params.page` —
 * so a single finding can be part read and part guessed, which is the normal
 * case rather than an edge one.
 */
export interface Finding {
  method: HttpMethod;
  /** Joined and normalised: `{id}` braces, single leading slash, no trailing. */
  path: string;
  /** What to call the request. Derived from the handler, not the path. */
  name: string;
  pathParams: Param[];
  queryParams: Param[];
  headers: Param[];
  body?: BodyShape;
  auth?: AuthRequirement;
  response?: ResponseShape;
  provenance: Record<string, Provenance>;
  source: SourceRef;
  detector: DetectorId;
  /**
   * What tells this apart from another handler on the same path — a
   * `consumes`, a `produces`, a `params=` condition.
   *
   * Set only when there IS another: a lone endpoint does not need a suffix,
   * and adding one to every request would be noise on the usual case.
   */
  discriminator?: string;
}

/** An endpoint that is known to exist and could not be named. */
export interface Unresolved {
  /** The expression that defeated the parser, as written. */
  expression: string;
  why: string;
  source: SourceRef;
  detector: DetectorId;
}

export interface BaseUrl {
  /** The whole thing, ready to be a collection variable. */
  url: string;
  /** Each part, with where it was read from — the screen shows the working. */
  parts: { scheme: Provenance; port: Provenance; contextPath?: Provenance };
}

/** A file handed to a detector: read once by the walker, parsed by whoever wants it. */
export interface SourceFile {
  /** Repo-relative, forward slashes. */
  path: string;
  text: string;
}

export interface RepoRoot {
  /** Absolute, as the host sees it. */
  dir: string;
  /** Every candidate file's repo-relative path — the walk is done once, shared. */
  files: readonly string[];
  /** Read a file by repo-relative path. Returns undefined if it cannot. */
  read(rel: string): string | undefined;
}

/**
 * Anything that changes how OTHER files are read, gathered before any of them
 * are.
 *
 * Three of the six detectors need this: the Express mount that gives a router
 * its prefix, the Spring security config that says which paths are guarded, and
 * the custom annotation that means `@RestController`. One pass, run once.
 */
export interface DetectorIndex {
  [key: string]: unknown;
}

export interface DetectResult {
  findings: Finding[];
  unresolved: Unresolved[];
}

export interface ApiDetector {
  id: DetectorId;
  /** Shown in the UI: "Spring Boot", "Hapi.js". */
  label: string;

  /**
   * Cheap first pass — is this framework here at all?
   *
   * Reads the manifest only (pom.xml, package.json, requirements.txt), so a
   * repository that has never heard of Hapi costs one file read rather than a
   * tree walk. Six detectors on a repo that uses one should cost about what one
   * costs.
   */
  present(root: RepoRoot): boolean;

  /** Which of the walked files this detector wants to look at. */
  candidates(root: RepoRoot): string[];

  /** Gathered before `detect` runs; passed back to it. */
  index?(root: RepoRoot): DetectorIndex;

  /**
   * The routes in one file.
   *
   * Never throws. A file it cannot parse is a file with no endpoints, not a
   * failed scan — one unparseable file must not cost you the other four hundred.
   */
  detect(file: SourceFile, index: DetectorIndex, root: RepoRoot): DetectResult;

  /** Where this app would serve from, when the source says. */
  baseUrl?(root: RepoRoot, profile?: string): BaseUrl | undefined;
}

// ── Path joining ────────────────────────────────────────────────────────────

/**
 * Join route segments the way a framework would.
 *
 * Every detector needs this and every one of them would get the double-slash
 * case slightly differently, so it lives here. `''` and `'/'` are both "no
 * segment", which is what an empty `@RequestMapping` means.
 */
export function joinPath(...parts: (string | undefined)[]): string {
  const cleaned = parts
    .filter((p): p is string => typeof p === 'string')
    .map(p => p.trim())
    .filter(p => p !== '' && p !== '/')
    .map(p => p.replace(/^\/+/, '').replace(/\/+$/, ''))
    .filter(p => p !== '');
  return '/' + cleaned.join('/');
}

/**
 * One spelling for a path parameter, whatever the framework wrote.
 *
 * Express and FastAPI say `:id`, Spring and Flask say `{id}`, Next.js says
 * `[id]`. daakia's own URLs use braces, and a collection with three spellings
 * in it reads as three different tools' output.
 */
export function normalisePathParams(path: string): string {
  return path
    /* `:id` — but not a port, which is why it must be preceded by a slash. */
    .replace(/\/:([A-Za-z_][\w]*)/g, '/{$1}')
    /* `[...slug]` before `[slug]`, or the first would eat the dots. */
    .replace(/\[\.\.\.([\w]+)\]/g, '{$1}')
    .replace(/\[([\w]+)\]/g, '{$1}')
    /* Spring allows `{id:[0-9]+}`; the regex is not part of the name. */
    .replace(/\{(\w+)\s*:[^}]+\}/g, '{$1}');
}

/** Every `{name}` in a path, in order, without duplicates. */
export function pathParamNames(path: string): string[] {
  const out: string[] = [];
  for (const m of path.matchAll(/\{(\w+)\}/g)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}
