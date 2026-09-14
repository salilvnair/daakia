/**
 * Resolving Spring's annotation graph, including the ones you wrote.
 *
 * ── Why matching `@RestController` is not enough ──
 *
 * A detector that looks for the literal text `@RestController` misses every
 * codebase with a house style, and a house style is exactly what a mature
 * codebase has. This is real and it is common:
 *
 *     @RestController
 *     @RequestMapping("/test-client")
 *     public @interface TestClientApiController {
 *         @AliasFor(annotation = RequestMapping.class, attribute = "value")
 *         String[] path() default {};
 *     }
 *
 * A class annotated `@TestClientApiController(path = "/orders")` is a
 * controller, its prefix is `/test-client/orders`, and nothing in it says
 * either word. Spring resolves this at runtime by walking the annotation's own
 * annotations; a scanner has to do the same by reading the annotation's source.
 *
 * ── What this module does and does not do ──
 *
 * It resolves annotations declared *in the repository being scanned*, to a
 * bounded depth. An annotation that ships inside a jar has no source to read,
 * and rather than guess, the scan reports it and Settings takes a one-line
 * mapping instead. That escape hatch is the honest end of this: there will
 * always be a jar.
 *
 * Regex, not a Java parser. The shapes here — an annotation on a type, an
 * attribute list — are regular enough to read this way, and a real parser is a
 * dependency and a build step for a feature that must tolerate a file it cannot
 * understand anyway.
 */

import type { RepoRoot, SourceRef } from '../api-detector';

/** The Spring annotations that mean "this type serves HTTP". */
const CONTROLLER_ANNOTATIONS = new Set(['RestController', 'Controller']);

/** Verb annotations, and the method each implies. */
export const VERB_ANNOTATIONS: Record<string, string> = {
  GetMapping: 'GET',
  PostMapping: 'POST',
  PutMapping: 'PUT',
  PatchMapping: 'PATCH',
  DeleteMapping: 'DELETE',
};

/** What a resolved annotation contributes to whatever it is put on. */
export interface AnnotationMeaning {
  /** It makes the type a controller. */
  controller: boolean;
  /** A path prefix the annotation itself carries. */
  prefix?: string;
  /**
   * Attribute renames, from `@AliasFor`: `path` on the custom annotation is
   * `value` on `@RequestMapping`.
   */
  aliases: Record<string, string>;
  /** Where the meaning was established — shown on the review row. */
  at?: SourceRef;
  /** The chain that got here: `@TestClientApiController → @RestController`. */
  via?: string;
}

const EMPTY: AnnotationMeaning = { controller: false, aliases: {} };

/** How deep to follow one annotation onto another. */
const MAX_DEPTH = 4;

/**
 * Strip comments before looking for annotations.
 *
 * Without this, `// @RestController is what we used to use` makes a controller
 * out of a comment, and a javadoc block full of examples makes several.
 *
 * Two rules that are not obvious:
 *
 * Strings are left alone. Every path this module exists to find lives inside
 * one, and blanking them was the first version of this function — it removed
 * the quotes and every prefix silently became undefined.
 *
 * Comments are replaced by the same number of characters, not by one space.
 * Every line number reported by this module is computed by counting newlines up
 * to an offset, so an offset that shifts is a line number that lies.
 */
export function stripNoise(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    /* `[^:"]` so `"http://x"` is not read as the start of a comment. */
    .replace(/(^|[^:"])\/\/[^\n]*/g, (m, pre: string) => pre + blank(m.slice(pre.length)));
}

/**
 * The text inside an annotation's parentheses, if it has any.
 *
 * Counts nested parens and braces so `@RequestMapping(value = {"/a", "/b"})`
 * comes back whole rather than cut at the first inner bracket.
 */
export function annotationArgs(src: string, atIndex: number): string | undefined {
  let i = atIndex;
  while (i < src.length && src[i] !== '(' && src[i] !== '\n') {
    /* Anything other than whitespace between the name and a paren means this
       annotation has no arguments — `@RestController public class`. */
    if (!/\s/.test(src[i]) && src[i] !== '(') return undefined;
    i++;
  }
  if (src[i] !== '(') return undefined;
  let depth = 0;
  const start = i + 1;
  for (; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) return src.slice(start, i); }
  }
  return undefined;
}

/**
 * One attribute out of an annotation's arguments.
 *
 * `@GetMapping("/x")` has no attribute name at all — a lone value is `value`,
 * which is the spelling most annotations in the wild use.
 */
export function attribute(args: string | undefined, name: string): string | undefined {
  if (args === undefined) return undefined;
  const named = new RegExp(`\\b${name}\\s*=\\s*(\\{[^}]*\\}|"(?:[^"\\\\]|\\\\.)*"|[\\w.]+)`).exec(args);
  const raw = named ? named[1] : (name === 'value' && !/=/.test(args) ? args.trim() : undefined);
  if (raw === undefined) return undefined;

  /* `{"/a", "/b"}` — Spring allows several and takes them all; a scan takes
     the first, because a request has one URL and the others are aliases. */
  const first = /"((?:[^"\\]|\\.)*)"/.exec(raw);
  if (first) return first[1];
  /* An unquoted identifier is a constant reference; the caller folds it. */
  return raw.trim() === '' ? undefined : raw.trim();
}

/** The index of the first character on `index`'s own line. */
function startOfLine(src: string, index: number): number {
  return src.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
}

/**
 * Every `@Name` on the lines immediately above `index`, innermost first.
 *
 * Walks from the start of `index`'s OWN line, not from `index` — a declaration
 * is usually `public @interface Foo`, and walking back from the `@` would read
 * the word `public` as the first non-annotation line and stop before it had
 * looked at anything.
 */
export function annotationsAbove(src: string, index: number): { name: string; at: number }[] {
  const out: { name: string; at: number }[] = [];
  /* Walk backwards over the annotation block, stopping at the first line that
     is neither blank nor an annotation. */
  let i = startOfLine(src, index);
  while (i > 0) {
    const lineStart = src.lastIndexOf('\n', i - 1) + 1;
    const line = src.slice(lineStart, i).trim();
    if (line === '') { i = lineStart - 1; continue; }
    const m = /^@(\w+)/.exec(line);
    if (!m) break;
    out.push({ name: m[1], at: lineStart + line.indexOf('@' + m[1]) + m[1].length + 1 });
    i = lineStart - 1;
  }
  return out;
}

/** Where an annotation's own `.java` would live, by convention. */
function sourceOfAnnotation(root: RepoRoot, name: string): string | undefined {
  const suffix = `/${name}.java`;
  return root.files.find(f => f.endsWith(suffix));
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}

/**
 * What one annotation means, following it onto its own annotations.
 *
 * Memoised across a scan: a house annotation is used by every controller in the
 * codebase, and reading its source once per controller would be the slowest
 * thing here.
 */
export function resolveAnnotation(
  root: RepoRoot,
  name: string,
  cache: Map<string, AnnotationMeaning> = new Map(),
  depth = 0,
): AnnotationMeaning {
  const hit = cache.get(name);
  if (hit) return hit;
  if (depth > MAX_DEPTH) return EMPTY;

  /* Spring's own, known without reading anything. */
  if (CONTROLLER_ANNOTATIONS.has(name)) {
    const m: AnnotationMeaning = { controller: true, aliases: {} };
    cache.set(name, m);
    return m;
  }
  if (name === 'RequestMapping') {
    const m: AnnotationMeaning = { controller: false, aliases: {} };
    cache.set(name, m);
    return m;
  }

  const file = sourceOfAnnotation(root, name);
  if (!file) { cache.set(name, EMPTY); return EMPTY; }
  const text = root.read(file);
  if (!text) { cache.set(name, EMPTY); return EMPTY; }

  const src = stripNoise(text);
  /* It must actually be an annotation declaration; a class of the same name is
     not one. */
  const decl = new RegExp(`@interface\\s+${name}\\b`).exec(src);
  if (!decl) { cache.set(name, EMPTY); return EMPTY; }

  const meaning: AnnotationMeaning = { controller: false, aliases: {} };

  /* Everything above the declaration is a meta-annotation. */
  for (const a of annotationsAbove(src, decl.index)) {
    const inner = resolveAnnotation(root, a.name, cache, depth + 1);
    if (inner.controller || CONTROLLER_ANNOTATIONS.has(a.name)) {
      meaning.controller = true;
      meaning.at = { file, line: lineOf(src, a.at), snippet: `@${a.name}` };
      meaning.via = meaning.via ? `${meaning.via} → @${a.name}` : `@${name} → @${a.name}`;
    }
    if (a.name === 'RequestMapping' || inner.prefix) {
      const own = a.name === 'RequestMapping'
        ? attribute(annotationArgs(src, a.at), 'value') ?? attribute(annotationArgs(src, a.at), 'path')
        : inner.prefix;
      if (own) meaning.prefix = own;
    }
  }

  /*
    @AliasFor — the attribute rename.

    `String[] path()` annotated `@AliasFor(annotation = RequestMapping.class,
    attribute = "value")` means `path = "/orders"` on a usage IS
    `@RequestMapping("/orders")`. Without this the prefix silently disappears.
  */
  for (const m of src.matchAll(/@AliasFor\s*\(([^)]*)\)\s*(?:[\w<>\[\],\s]+?)\s+(\w+)\s*\(/g)) {
    const args = m[1];
    const attr = /attribute\s*=\s*"(\w+)"/.exec(args)?.[1]
      ?? /^\s*"(\w+)"\s*$/.exec(args)?.[1];
    const method = m[2];
    if (attr) meaning.aliases[method] = attr;
  }

  cache.set(name, meaning);
  return meaning;
}

export interface ControllerInfo {
  isController: boolean;
  /** The class-level prefix, already joined from annotation and usage. */
  prefix?: string;
  at?: SourceRef;
  /** `@TestClientApiController → @RestController`, for the review row. */
  via?: string;
}

/**
 * Is this type a controller, and what prefix does it carry?
 *
 * Reads the class declaration's annotations, resolves each one (which may be
 * yours), and joins a prefix the annotation brought with a prefix the usage
 * supplied — in that order, because that is the order Spring composes them.
 */
export function readController(
  root: RepoRoot,
  file: string,
  src: string,
  cache?: Map<string, AnnotationMeaning>,
): ControllerInfo {
  const cleaned = stripNoise(src);
  const cls = /\b(?:public\s+|final\s+|abstract\s+)*class\s+\w+/.exec(cleaned);
  if (!cls) return { isController: false };

  const out: ControllerInfo = { isController: false };
  const prefixes: string[] = [];

  for (const a of annotationsAbove(cleaned, cls.index).reverse()) {
    const args = annotationArgs(cleaned, a.at);
    const meaning = resolveAnnotation(root, a.name, cache);

    if (meaning.controller || CONTROLLER_ANNOTATIONS.has(a.name)) {
      out.isController = true;
      if (meaning.via) {
        out.via = meaning.via;
        out.at = meaning.at;
      } else {
        out.at = { file, line: lineOf(cleaned, a.at), snippet: `@${a.name}` };
      }
    }

    /* The prefix the annotation itself carries — `/test-client`. */
    if (meaning.prefix) prefixes.push(meaning.prefix);

    /* The prefix the usage supplies — `path = "/orders"`, via @AliasFor. */
    if (a.name === 'RequestMapping') {
      const v = attribute(args, 'value') ?? attribute(args, 'path');
      if (v) prefixes.push(v);
    } else {
      for (const [attr, target] of Object.entries(meaning.aliases)) {
        if (target !== 'value' && target !== 'path') continue;
        const v = attribute(args, attr);
        if (v) prefixes.push(v);
      }
    }
  }

  if (prefixes.length) out.prefix = prefixes.join('/').replace(/\/{2,}/g, '/');
  return out;
}
