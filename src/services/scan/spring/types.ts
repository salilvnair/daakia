/**
 * A request body, from the type that declares it.
 *
 * ── The rule about invented values ──
 *
 * An empty string is honestly empty. `"cartId": "cart_123"` looks like it came
 * from somewhere, and six months later nobody remembers that it did not. So a
 * value is only ever produced when the source states a constraint it has to
 * satisfy — `@Email`, `@Size(min=3)`, `@Pattern`, an enum's members — and when
 * one is produced it is marked `generated` with the rule that produced it.
 *
 * Everything else is the zero value for its type, marked `unknown`.
 *
 * ── Depth ──
 *
 * Nested types are walked, bounded, because a body two levels deep is normal
 * and a cycle is not rare: an `Order` with a `List<OrderLine>` whose line has an
 * `Order` back-reference will happily recurse forever.
 */

import type { Provenance, RepoRoot, SourceRef } from '../api-detector';
import type { BodyShape } from '../api-detector';
import { stripNoise } from './annotations';

const MAX_DEPTH = 3;

const PRIMITIVES = new Set([
  'String', 'CharSequence', 'UUID',
  'int', 'Integer', 'long', 'Long', 'short', 'Short', 'byte', 'Byte',
  'double', 'Double', 'float', 'Float', 'BigDecimal', 'BigInteger',
  'boolean', 'Boolean',
  'Instant', 'LocalDate', 'LocalDateTime', 'OffsetDateTime', 'ZonedDateTime', 'Date',
]);

const NUMERIC = /^(int|Integer|long|Long|short|Short|byte|Byte|double|Double|float|Float|BigDecimal|BigInteger)$/;

/** The element type of `List<X>` / `Set<X>` / `X[]`, if it is one. */
function collectionOf(type: string): string | undefined {
  const g = /^(?:List|Set|Collection|Iterable|ArrayList|HashSet)\s*<\s*(.+?)\s*>$/.exec(type);
  if (g) return g[1];
  const arr = /^(.+?)\[\]$/.exec(type);
  return arr ? arr[1] : undefined;
}

/** `Optional<X>`, `ResponseEntity<X>` and friends wrap the type that matters. */
export function unwrap(type: string): string {
  let t = type.trim();
  for (let i = 0; i < 4; i++) {
    const m = /^(?:Optional|ResponseEntity|Mono|Flux|CompletableFuture|Callable|HttpEntity)\s*<\s*(.+)\s*>$/.exec(t);
    if (!m) break;
    t = m[1].trim();
  }
  return t;
}

interface Field {
  name: string;
  type: string;
  /** The validation annotations written on it, as text. */
  annotations: string;
}

/** Where a type is declared, by the usual one-type-per-file convention. */
function fileOfType(root: RepoRoot, type: string): string | undefined {
  const bare = type.replace(/<.*>$/, '').replace(/\[\]$/, '').split('.').pop();
  if (!bare) return undefined;
  return root.files.find(f => f.endsWith(`/${bare}.java`) || f.endsWith(`/${bare}.kt`));
}

/**
 * The fields of a type: records, classes with fields, and Kotlin data classes.
 *
 * A getter-only class is read through its getters, because a DTO built with
 * Lombok has no visible fields worth reading and every getter is a field.
 */
export function fieldsOf(src: string): Field[] {
  const clean = stripNoise(src);
  const out: Field[] = [];

  /* A record's components are its fields, and they are all on one line. */
  const rec = /\brecord\s+\w+\s*\(([\s\S]*?)\)\s*(?:implements[^{]+)?\{/.exec(clean);
  if (rec) {
    for (const part of splitTop(rec[1])) {
      const m = /(?:((?:@\w+(?:\([^)]*\))?\s*)*))?([\w.<>\[\],\s]+?)\s+(\w+)\s*$/.exec(part.trim());
      if (m) out.push({ annotations: m[1] ?? '', type: m[2].trim(), name: m[3] });
    }
    if (out.length) return out;
  }

  /* Ordinary fields. Statics are constants, not payload. */
  const fieldRe = /((?:@\w+(?:\([^)]*\))?\s*)*)(?:private|protected|public)\s+(?!static)(?:final\s+)?([\w.<>\[\],\s]+?)\s+(\w+)\s*[;=]/g;
  for (const m of clean.matchAll(fieldRe)) {
    out.push({ annotations: m[1] ?? '', type: m[2].trim(), name: m[3] });
  }
  if (out.length) return out;

  /* Kotlin `val x: String`. */
  for (const m of clean.matchAll(/\b(?:val|var)\s+(\w+)\s*:\s*([\w.<>\[\],?\s]+)/g)) {
    out.push({ annotations: '', name: m[1], type: m[2].trim().replace(/\?$/, '') });
  }
  if (out.length) return out;

  /* Lombok, or any class that only exposes getters. */
  for (const m of clean.matchAll(/\bpublic\s+([\w.<>\[\],\s]+?)\s+(?:get|is)([A-Z]\w*)\s*\(\s*\)/g)) {
    const name = m[2].charAt(0).toLowerCase() + m[2].slice(1);
    if (!out.some(f => f.name === name)) out.push({ annotations: '', name, type: m[1].trim() });
  }
  return out;
}

/** Split a parameter or component list on top-level commas only. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '<' || c === '(') depth++;
    else if (c === '>' || c === ')') depth--;
    else if (c === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out.filter(p => p.trim());
}

/**
 * A value for a field, from the constraints its annotations state.
 *
 * Returns `undefined` when nothing was stated — the caller then uses the zero
 * value for the type, and marks it unknown rather than generated.
 */
export function valueFromConstraints(f: Field): { value: unknown; rule: string } | undefined {
  const a = f.annotations;

  if (/@Email\b/.test(a)) return { value: 'user@example.com', rule: '@Email' };

  const pattern = /@Pattern\s*\(\s*regexp\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(a);
  if (pattern) {
    const v = fromRegex(pattern[1]);
    if (v !== undefined) return { value: v, rule: `@Pattern(${pattern[1]})` };
  }

  const size = /@Size\s*\(([^)]*)\)/.exec(a);
  if (size && /^(String|CharSequence)$/.test(f.type)) {
    const min = Number(/min\s*=\s*(\d+)/.exec(size[1])?.[1] ?? 0);
    if (min > 0) return { value: 'x'.repeat(min), rule: `@Size(min=${min})` };
  }

  if (NUMERIC.test(f.type)) {
    const min = /@Min\s*\(\s*(?:value\s*=\s*)?(\d+)/.exec(a)?.[1]
      ?? /@DecimalMin\s*\(\s*(?:value\s*=\s*)?"(\d+)/.exec(a)?.[1];
    if (min) return { value: Number(min), rule: `@Min(${min})` };
    if (/@Positive\b/.test(a)) return { value: 1, rule: '@Positive' };
  }

  if (/@NotBlank\b|@NotEmpty\b/.test(a) && /^(String|CharSequence)$/.test(f.type)) {
    return { value: 'x', rule: '@NotBlank' };
  }

  return undefined;
}

/** A string that satisfies a simple regex. Anything clever is left alone. */
function fromRegex(re: string): string | undefined {
  const simple = /^\^?\[([A-Za-z0-9-]+)\]\{(\d+)(?:,\d*)?\}\$?$/.exec(re);
  if (!simple) return undefined;
  const set = simple[1];
  const first = /A-Z/.test(set) ? 'A' : /a-z/.test(set) ? 'a' : /0-9/.test(set) ? '0' : set[0];
  return first.repeat(Number(simple[2]));
}

/** The first member of an enum, which is a real value rather than an invention. */
function enumFirstMember(src: string): string | undefined {
  const clean = stripNoise(src);
  const m = /\benum\s+\w+[^{]*\{\s*([A-Z][A-Z0-9_]*)/.exec(clean);
  return m?.[1];
}

function zeroFor(type: string): unknown {
  if (NUMERIC.test(type)) return 0;
  if (/^(boolean|Boolean)$/.test(type)) return false;
  return '';
}

interface Built { json: unknown; generated: string[] }

function build(root: RepoRoot, type: string, depth: number, seen: Set<string>): Built {
  const t = unwrap(type);
  const generated: string[] = [];

  const el = collectionOf(t);
  if (el) {
    const inner = build(root, el, depth, seen);
    return { json: [inner.json], generated: inner.generated };
  }

  const bare = t.replace(/<.*>$/, '').split('.').pop() ?? t;
  if (PRIMITIVES.has(bare)) return { json: zeroFor(bare), generated };
  if (/^Map\s*</.test(t)) return { json: {}, generated };
  if (depth >= MAX_DEPTH || seen.has(bare)) return { json: {}, generated };

  const file = fileOfType(root, bare);
  const src = file ? root.read(file) : undefined;
  if (!src) return { json: {}, generated };

  const member = enumFirstMember(src);
  if (member) return { json: member, generated: [`enum ${bare} — first member`] };

  const next = new Set(seen).add(bare);
  const obj: Record<string, unknown> = {};
  for (const f of fieldsOf(src)) {
    const constrained = valueFromConstraints(f);
    if (constrained) {
      obj[f.name] = constrained.value;
      generated.push(`${f.name}: ${constrained.rule}`);
      continue;
    }
    const inner = build(root, f.type, depth + 1, next);
    obj[f.name] = inner.json;
    generated.push(...inner.generated.map(g => `${f.name}.${g}`));
  }
  return { json: obj, generated };
}

/**
 * The body for a `@RequestBody` type.
 *
 * `provenance` is `read` when nothing had to be invented — the shape came
 * straight off the type — and `generated` the moment any field's value was
 * produced from a constraint, naming the rules that produced them.
 */
export function bodyFromType(
  root: RepoRoot,
  type: string,
): { shape: BodyShape; provenance: Provenance } | undefined {
  const t = unwrap(type);
  const bare = t.replace(/<.*>$/, '').replace(/\[\]$/, '').split('.').pop() ?? t;

  /* A body declared as a String or a Map has no shape to read. */
  if (PRIMITIVES.has(bare) || /^Map\s*</.test(t)) {
    return {
      shape: { mode: 'raw', raw: '', from: t },
      provenance: { kind: 'unknown', why: `${t} has no fields to read` },
    };
  }

  const file = fileOfType(root, bare);
  if (!file) {
    return {
      shape: { mode: 'raw', raw: '', from: t },
      provenance: { kind: 'unknown', why: `no source for ${bare} in this repository` },
    };
  }

  const built = build(root, t, 0, new Set());
  const at: SourceRef = { file, line: 1 };
  return {
    shape: { mode: 'raw', raw: JSON.stringify(built.json, null, 2), from: bare },
    provenance: built.generated.length
      ? { kind: 'generated', rule: built.generated.slice(0, 4).join(', ') }
      : { kind: 'read', at },
  };
}
