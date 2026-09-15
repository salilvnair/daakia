/**
 * The small amount of Python reading the two Python detectors share.
 *
 * Decorators are the whole of it: `@app.get("/x")`, `@bp.route("/y",
 * methods=["POST"])`. They are a call with a string first argument and some
 * keyword arguments, which is regular enough to read without a parser — and a
 * parser for Python is a much larger commitment than one for a route file.
 *
 * As everywhere else here: a value that is computed is reported, never
 * approximated.
 */

import type { SourceRef } from '../api-detector';

/** Comments out, offsets preserved. Strings stay — every path lives in one. */
export function stripComments(src: string): string {
  const out = src.split('\n').map(line => {
    /* A `#` inside a string is not a comment, so only strip one that is
       outside quotes. Cheap scan, and Python has no block comments. */
    let quote: string | undefined;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (c === '\\') { i++; continue; }
        if (c === quote) quote = undefined;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '#') return line.slice(0, i) + ' '.repeat(line.length - i);
    }
    return line;
  });
  return out.join('\n');
}

export const lineOf = (src: string, index: number): number =>
  src.slice(0, Math.max(0, index)).split('\n').length;

export function refAt(file: string, src: string, index: number, snippet?: string): SourceRef {
  const nl = src.indexOf('\n', index);
  return {
    file,
    line: lineOf(src, index),
    snippet: snippet ?? src.slice(index, nl === -1 ? undefined : nl).trim().slice(0, 120),
  };
}

/** The text between `(` at `open` and its match, quote-aware. */
export function balanced(src: string, open: number): string | undefined {
  if (src[open] !== '(' && src[open] !== '[' && src[open] !== '{') return undefined;
  const close = { '(': ')', '[': ']', '{': '}' }[src[open]]!;
  let depth = 0;
  let quote: string | undefined;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = undefined;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === src[open]) depth++;
    else if (c === close) { depth--; if (depth === 0) return src.slice(open + 1, i); }
  }
  return undefined;
}

/** Split on top-level commas. */
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
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out.map(x => x.trim()).filter(Boolean);
}

/** A string literal, including the triple-quoted and f-string spellings. */
export function literal(expr: string): string | undefined {
  const t = expr.trim();
  /* An f-string with a substitution is a computed value; one without is not.
     `f"/api/v1"` is legal and means exactly `/api/v1`. */
  const f = /^[fF](['"])([\s\S]*?)\1$/.exec(t);
  if (f) return f[2].includes('{') ? undefined : f[2];
  const triple = /^(?:[rbu]?)("""|''')([\s\S]*?)\1$/.exec(t);
  if (triple) return triple[2];
  const plain = /^(?:[rbu]?)(['"])((?:[^\\]|\\.)*?)\1$/.exec(t);
  return plain ? plain[2] : undefined;
}

/** A keyword argument's value: `methods=["GET"]` → `["GET"]`. */
export function keyword(args: string, name: string): string | undefined {
  for (const part of splitArgs(args)) {
    const m = new RegExp(`^${name}\\s*=\\s*([\\s\\S]+)$`).exec(part);
    if (m) return m[1].trim();
  }
  return undefined;
}

/** The first positional argument, if there is one. */
export function positional(args: string): string | undefined {
  const parts = splitArgs(args);
  const first = parts.find(p => !/^[A-Za-z_]\w*\s*=/.test(p));
  return first;
}

/** A list of string literals: `["GET", "POST"]` → `['GET','POST']`. */
export function stringList(expr: string | undefined): string[] {
  if (!expr) return [];
  const t = expr.trim();
  const one = literal(t);
  if (one !== undefined) return [one];
  if (!/^[[(]/.test(t)) return [];
  const inner = balanced(t, 0);
  if (inner === undefined) return [];
  return splitArgs(inner).map(literal).filter((x): x is string => x !== undefined);
}

/**
 * Module-level string constants, so a path written as one can be followed.
 *
 * Only literal assignments at the left margin — an indented one is inside a
 * function and not reliably in scope where a decorator uses it.
 */
export function moduleConstants(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of src.matchAll(/^([A-Za-z_]\w*)\s*(?::\s*\w+\s*)?=\s*(['"][^'"\n]*['"])/gm)) {
    const v = literal(m[2]);
    if (v !== undefined) out.set(m[1], v);
  }
  return out;
}

/** Resolve a path expression, following this module's own constants. */
export function resolvePath(expr: string, constants: Map<string, string>): string | undefined {
  const direct = literal(expr);
  if (direct !== undefined) return direct;
  const name = expr.trim();
  if (/^[A-Za-z_]\w*$/.test(name) && constants.has(name)) return constants.get(name);

  /* `f"{BASE}/orders"` — resolvable when every substitution is a constant. */
  const f = /^[fF](['"])([\s\S]*?)\1$/.exec(name);
  if (f) {
    let ok = true;
    const filled = f[2].replace(/\{([^}]*)\}/g, (_, inner: string) => {
      const v = constants.get(inner.trim());
      if (v === undefined) { ok = false; return ''; }
      return v;
    });
    if (ok) return filled;
  }
  return undefined;
}

/** Does a requirements/pyproject file name this package? */
export function declaresPackage(text: string, pkg: string): boolean {
  const re = new RegExp(`(^|[\\s"'\\[])${pkg}(\\[[^\\]]*\\])?\\s*(==|>=|<=|~=|>|<|"|'|$|\\s)`, 'im');
  return re.test(text);
}

/**
 * The decorators immediately above a `def`, innermost last.
 *
 * Returns their offsets so the caller can read each one's arguments and report
 * a line number that points at the decorator rather than at the function.
 */
export function decoratorsAbove(src: string, defIndex: number): { at: number; text: string }[] {
  const out: { at: number; text: string }[] = [];
  let i = src.lastIndexOf('\n', Math.max(0, defIndex - 1)) + 1;
  while (i > 0) {
    const lineStart = src.lastIndexOf('\n', i - 2) + 1;
    const line = src.slice(lineStart, i - 1);
    const trimmed = line.trim();
    if (trimmed === '') { i = lineStart; continue; }
    if (!trimmed.startsWith('@')) break;
    out.push({ at: lineStart + line.indexOf('@'), text: trimmed });
    i = lineStart;
  }
  return out.reverse();
}
