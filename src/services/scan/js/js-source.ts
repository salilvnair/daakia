/**
 * The small amount of JavaScript reading the JS detectors share.
 *
 * Not a parser. Route declarations in Express, Hapi and Next.js are shallow
 * shapes — a call with a string first argument, an object literal with three
 * known keys — and the cost of a real parser is a dependency, a build step and
 * a class of failure where one unusual file takes the whole scan down with it.
 *
 * What is NOT guessed: anything whose value is computed. A path assembled from
 * variables is reported as unresolved rather than approximated, because a
 * request to a path that does not exist is worse than being told there is an
 * endpoint here that could not be named.
 */

import type { SourceRef } from '../api-detector';

/** Comments out, offsets preserved, strings left alone — see spring/annotations. */
export function stripComments(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    /* `[^:"'`\\]` so a URL inside a string is not read as a comment. */
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, pre: string) => pre + blank(m.slice(pre.length)));
}

export const lineOf = (src: string, index: number): number =>
  src.slice(0, Math.max(0, index)).split('\n').length;

export function refAt(file: string, src: string, index: number, snippet?: string): SourceRef {
  return {
    file,
    line: lineOf(src, index),
    snippet: snippet ?? src.slice(index, src.indexOf('\n', index) === -1 ? undefined : src.indexOf('\n', index)).trim().slice(0, 120),
  };
}

/**
 * The text between a bracket at `open` and its match.
 *
 * Bracket-aware and string-aware: a `)` inside a string literal must not close
 * a call, and `app.get('/a)b', h)` is a real if unpleasant path.
 */
export function balanced(src: string, open: number): string | undefined {
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const close = pairs[src[open]];
  if (!close) return undefined;

  let depth = 0;
  let quote: string | undefined;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = undefined;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === src[open]) depth++;
    else if (c === close) { depth--; if (depth === 0) return src.slice(open + 1, i); }
  }
  return undefined;
}

/** Split on top-level commas — arguments, or the members of an object literal. */
export function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  let quote: string | undefined;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = undefined;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out.map(x => x.trim()).filter(Boolean);
}

/**
 * A string literal, if that is what this expression is.
 *
 * A template literal counts only when it has no substitutions: `` `/api/v1` ``
 * is a string, and `` `${base}/users` `` is a computed value and has to be
 * reported as one.
 */
export function literal(expr: string): string | undefined {
  const t = expr.trim();
  const quoted = /^(['"])((?:[^\\]|\\.)*?)\1$/.exec(t);
  if (quoted) return quoted[2];
  const tpl = /^`([^`]*)`$/.exec(t);
  if (tpl && !tpl[1].includes('${')) return tpl[1];
  return undefined;
}

/** A property out of an object literal's text: `method: 'GET'` → `'GET'`. */
export function property(objectBody: string, key: string): string | undefined {
  for (const part of splitArgs(objectBody)) {
    const m = new RegExp(`^(?:['"\`]?)${key}(?:['"\`]?)\\s*:\\s*([\\s\\S]+)$`).exec(part);
    if (m) return m[1].trim();
  }
  return undefined;
}

/**
 * Constants declared in this file, so a path written as one can be followed.
 *
 * Only literal assignments — `const BASE = '/api/v1'`. A constant whose value
 * is itself computed stays unknown, which is the honest answer.
 */
export function fileConstants(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`][^'"`\n]*['"`])/g)) {
    const v = literal(m[2]);
    if (v !== undefined) out.set(m[1], v);
  }
  return out;
}

/** Resolve an expression to a path, following this file's own constants. */
export function resolvePath(expr: string, constants: Map<string, string>): string | undefined {
  const direct = literal(expr);
  if (direct !== undefined) return direct;

  const ident = /^[A-Za-z_$][\w$]*$/.exec(expr.trim());
  if (ident && constants.has(expr.trim())) return constants.get(expr.trim());

  /* `` `${BASE}/search` `` — resolvable when every substitution is a constant
     this file declares. Anything else is genuinely computed. */
  const tpl = /^`([^`]*)`$/.exec(expr.trim());
  if (tpl) {
    let ok = true;
    const filled = tpl[1].replace(/\$\{([^}]*)\}/g, (_, inner: string) => {
      const v = constants.get(inner.trim());
      if (v === undefined) { ok = false; return ''; }
      return v;
    });
    if (ok) return filled;
  }
  return undefined;
}

/** Which manifest dependencies a repository declares. */
export function packageDeps(text: string): Set<string> {
  try {
    const json = JSON.parse(text) as Record<string, Record<string, string>>;
    return new Set([
      ...Object.keys(json.dependencies ?? {}),
      ...Object.keys(json.devDependencies ?? {}),
      ...Object.keys(json.peerDependencies ?? {}),
    ]);
  } catch {
    return new Set();
  }
}
