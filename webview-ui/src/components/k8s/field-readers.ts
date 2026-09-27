/**
 * The fields a line has beyond what its format named.
 *
 * Four readers make a line's fields, in this order: the layout pattern (the
 * host parses thread, logger and app), the MDC and key=value pairs the format
 * carried, the `{}` holes of the catalogue's patterns, and the keys inside a
 * payload. The first two arrive on the line. This module is the third, and the
 * one a reader can extend: a field the other readers did not find, named once
 * on the Fields settings page, and then present on every line that carries it,
 * on every pod.
 *
 * ── Every pattern, not only the marked ones ──
 *
 * A mark is a highlight — two or three lines somebody wants to see. A pattern
 * is a statement about what a logger writes and what each hole in it is
 * called, and that is true whether or not anybody asked for it to be coloured.
 * So every catalogued pattern contributes its holes as fields; marking only
 * decides the colour.
 *
 * ── What it will not do ──
 *
 * Guess. A custom field is a logger call, a regex, or a value picked out of a
 * real line — each one says exactly which text is the value, and a line where
 * it does not match simply has no such field.
 */
import type { LogLine } from '../../store/k8s-store';
import type { CataloguePattern } from '../../store/dk8s-logger-store';
import {
  compilePattern, matchPattern, fromLoggerCall, type CompiledPattern,
} from './logger-pattern';

/** Where the Fields page keeps them — a ui-state pref, synced with the workspace. */
export const CUSTOM_FIELDS_PREF = 'dk8s.fields.custom';

export type CustomFieldKind = 'call' | 'regex' | 'line';

/** A field the readers did not find, named by somebody who knows the log. */
export interface CustomField {
  id: string;
  /** What it is called. For a logger call with several holes, the holes' own names win. */
  name: string;
  kind: CustomFieldKind;
  /**
   * `call`: the logger call, as pasted.
   * `regex`: a regular expression; named groups are fields, else group 1 is `name`.
   * `line`: a real line with the value in it; `pick` says which text is the value.
   */
  source: string;
  /** `line` only: the text in `source` that is the value. */
  pick?: string;
  added: number;
}

export function parseCustomFields(raw: string | undefined): CustomField[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as CustomField[];
    return Array.isArray(v) ? v.filter(f => f && typeof f.id === 'string' && typeof f.source === 'string') : [];
  } catch {
    return [];
  }
}

/** One reader: a message in, the named values it found out. */
export interface FieldReader {
  id: string;
  /** What the reader is called on screen: the custom field's name or the pattern's template. */
  label: string;
  origin: 'pattern' | 'custom';
  read: (message: string) => Record<string, string> | undefined;
}

function fromPattern(id: string, label: string, compiled: CompiledPattern, origin: FieldReader['origin']): FieldReader {
  return {
    id, label, origin,
    read: (message) => {
      if (!compiled.holes.length) return undefined;
      const hit = matchPattern(compiled, message);
      return hit && Object.keys(hit.fields).length ? hit.fields : undefined;
    },
  };
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A custom field as a reader, or why it cannot be one.
 *
 * The why is the point for the page that builds these: "that regex does not
 * compile" and "that call has no `{}` in it" are the two things somebody gets
 * wrong, and each needs saying in words rather than as a field that never
 * appears.
 */
export function compileCustom(f: Pick<CustomField, 'id' | 'name' | 'kind' | 'source' | 'pick'>):
{ reader?: FieldReader; problem?: string } {
  const name = f.name.trim() || 'value';
  if (f.kind === 'call') {
    const pattern = fromLoggerCall(f.source);
    if (!pattern) return { problem: 'That is not a logger call Daakia can read — paste the whole call, from the logger to the closing bracket.' };
    if (!pattern.holes.length) return { problem: 'That call has no {} in it, so it names no value.' };
    return { reader: fromPattern(f.id, name, compilePattern(pattern), 'custom') };
  }
  if (f.kind === 'regex') {
    let re: RegExp;
    try {
      re = new RegExp(f.source);
    } catch (e) {
      return { problem: `The regex does not compile: ${(e as Error).message}` };
    }
    return {
      reader: {
        id: f.id, label: name, origin: 'custom',
        read: (message) => {
          const m = re.exec(message);
          if (!m) return undefined;
          if (m.groups && Object.keys(m.groups).length) {
            const out: Record<string, string> = {};
            for (const [k, v] of Object.entries(m.groups)) if (v !== undefined && v !== '') out[k] = v;
            return Object.keys(out).length ? out : undefined;
          }
          const v = m[1] ?? m[0];
          return v ? { [name]: v } : undefined;
        },
      },
    };
  }
  /* `line`: the text around the picked value is kept exactly, and the value is
     the hole — the same shape a logger call makes, learned from its output. */
  const pick = f.pick ?? '';
  const at = pick ? f.source.indexOf(pick) : -1;
  if (at < 0) return { problem: 'Pick the value in the line — select the part that changes from line to line.' };
  const before = f.source.slice(Math.max(0, at - 40), at);
  const after = f.source.slice(at + pick.length, at + pick.length + 40);
  if (!before.trim() && !after.trim()) return { problem: 'The value is the whole line, so nothing around it says where it is.' };
  /* Anchored on the fixed text either side, trimmed to the nearest word so a
     timestamp or an id next to the value does not have to repeat. */
  const lead = before.replace(/^.*?(\S+\s*)$/, '$1');
  const tail = after.replace(/^(\s*\S+).*$/, '$1');
  const re = new RegExp(`${escapeRe(lead)}(.+?)${tail ? escapeRe(tail) : '$'}`);
  return {
    reader: {
      id: f.id, label: name, origin: 'custom',
      read: (message) => {
        const m = re.exec(message);
        return m?.[1] ? { [name]: m[1].trim() } : undefined;
      },
    },
  };
}

/** Every reader for a set of patterns and custom fields — built once, used per line. */
export function readersOf(patterns: CataloguePattern[], custom: CustomField[]): FieldReader[] {
  const out: FieldReader[] = [];
  for (const f of custom) {
    const { reader } = compileCustom(f);
    if (reader) out.push(reader);
  }
  for (const p of patterns) {
    if (!p.holes.length) continue;
    out.push(fromPattern(p.id, p.template, compilePattern(p), 'pattern'));
  }
  return out;
}

export interface ReadField { key: string; value: string; origin: 'pattern' | 'custom'; reader: string }

/**
 * What the readers find on one line, first claim wins.
 *
 * Custom fields are asked first: somebody named that one on purpose, and a
 * pattern's hole that happens to share the name is the weaker statement.
 */
export function readFields(line: Pick<LogLine, 'text' | 'message'>, readers: FieldReader[]): ReadField[] {
  const message = line.message ?? line.text;
  const out: ReadField[] = [];
  const taken = new Set<string>();
  for (const r of readers) {
    const got = r.read(message) ?? (message !== line.text ? r.read(line.text) : undefined);
    if (!got) continue;
    for (const [key, value] of Object.entries(got)) {
      if (taken.has(key) || !value) continue;
      taken.add(key);
      out.push({ key, value, origin: r.origin, reader: r.label });
    }
  }
  return out;
}

/**
 * One field's value on a line, from wherever it comes.
 *
 * The format's slots and the MDC first — those are the pod's own words — then
 * the readers. This is what Follow compares, so "exact" means the same thing
 * for a thread and for a hole: the value in that slot equals this one, never
 * "the text mentions it".
 */
export function valueOf(
  line: Pick<LogLine, 'text' | 'message' | 'thread' | 'logger' | 'app' | 'fields'>,
  key: string,
  readers: FieldReader[] = [],
): string | undefined {
  if (key === 'thread') return line.thread;
  if (key === 'logger') return line.logger;
  if (key === 'app') return line.app;
  const mdc = line.fields?.[key];
  if (mdc !== undefined) return String(mdc);
  if (key === 'pod') return (line as { pod?: string }).pod;
  if (!readers.length) return undefined;
  return readFields(line, readers).find(f => f.key === key)?.value;
}

/**
 * How a custom field does against lines already on hand.
 *
 * "Matches 214 lines on 2 pods · 2 fields", plus a few of the lines, so the
 * person writing it sees it work (or not) before it is saved.
 */
export function testReader(
  reader: FieldReader,
  lines: (Pick<LogLine, 'text' | 'message'> & { pod?: string })[],
  samples = 3,
): { lines: number; pods: number; fields: string[]; examples: { text: string; values: Record<string, string> }[] } {
  let n = 0;
  const pods = new Set<string>();
  const fields = new Set<string>();
  const examples: { text: string; values: Record<string, string> }[] = [];
  for (const line of lines) {
    const message = line.message ?? line.text;
    const got = reader.read(message);
    if (!got) continue;
    n++;
    if (line.pod) pods.add(line.pod);
    for (const k of Object.keys(got)) fields.add(k);
    if (examples.length < samples) examples.push({ text: message, values: got });
  }
  return { lines: n, pods: pods.size, fields: [...fields], examples };
}
