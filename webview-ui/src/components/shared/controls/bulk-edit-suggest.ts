/**
 * What to offer on the line being typed in a headers bulk-edit box.
 *
 * Before the colon it is the header: every known name that matches, each
 * with the values people actually send it — the user's own first, from their
 * open tabs and saved requests, then the common ones — so one pick writes a
 * whole `Key: value` line. After the colon it is just the values for that key.
 */
import { HTTP_REQUEST_HEADERS, HEADER_VALUE_SUGGESTIONS } from './http-headers';

export interface BulkSuggestion {
  key: string;
  /** Absent: the header alone, the value still to type. */
  value?: string;
  /** Picked while typing the value: only the value part is new. */
  valueOnly?: boolean;
  /** Seen in the user's own requests, not only in the catalogue. */
  used?: boolean;
}

/** key (lower case) → the casing first seen, and the values used with it, most used first. */
export type UsedHeaders = Map<string, { key: string; values: string[] }>;

export function buildUsedHeaders(pairs: Iterable<{ key?: string; value?: string }>): UsedHeaders {
  const counts = new Map<string, { key: string; values: Map<string, number> }>();
  for (const p of pairs) {
    const key = (p.key || '').trim();
    if (!key || key.startsWith('#')) continue;
    const lower = key.toLowerCase();
    let entry = counts.get(lower);
    if (!entry) { entry = { key, values: new Map() }; counts.set(lower, entry); }
    const value = (p.value || '').trim();
    if (value) entry.values.set(value, (entry.values.get(value) ?? 0) + 1);
  }
  const out: UsedHeaders = new Map();
  for (const [lower, e] of counts) {
    out.set(lower, { key: e.key, values: [...e.values].sort((a, b) => b[1] - a[1]).map(([v]) => v) });
  }
  return out;
}

export interface LineAt {
  /** Where the line starts and ends in the whole text. */
  start: number;
  end: number;
  /** `# ` when the line is a disabled row. */
  prefix: string;
  /** What is typed before the caret, without the prefix. */
  typed: string;
}

export function lineAt(text: string, caret: number): LineAt {
  const start = text.lastIndexOf('\n', caret - 1) + 1;
  let end = text.indexOf('\n', caret);
  if (end < 0) end = text.length;
  const before = text.slice(start, caret);
  const prefix = before.startsWith('# ') ? '# ' : '';
  return { start, end, prefix, typed: before.slice(prefix.length) };
}

const MAX = 10;
const VALUES_PER_KEY = 3;

function rank(name: string, q: string): number {
  const n = name.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  /* "type" finds Content-Type, "len" Content-Length: a word inside the name. */
  if (n.split('-').some(w => w.startsWith(q))) return 2;
  if (n.includes(q)) return 3;
  return -1;
}

/** Keys already written on other lines, so they are not offered twice. */
function keysElsewhere(text: string, line: LineAt): Set<string> {
  const others = text.slice(0, line.start) + '\n' + text.slice(line.end);
  const keys = new Set<string>();
  for (const raw of others.split('\n')) {
    const l = raw.startsWith('# ') ? raw.slice(2) : raw;
    const ci = l.indexOf(':');
    if (ci > 0) keys.add(l.slice(0, ci).trim().toLowerCase());
  }
  return keys;
}

function valuesFor(lower: string, used: UsedHeaders): { value: string; used: boolean }[] {
  const mine = used.get(lower)?.values ?? [];
  const common = HEADER_VALUE_SUGGESTIONS[lower] ?? [];
  const seen = new Set<string>();
  const out: { value: string; used: boolean }[] = [];
  for (const v of mine) if (!seen.has(v)) { seen.add(v); out.push({ value: v, used: true }); }
  for (const v of common) if (!seen.has(v)) { seen.add(v); out.push({ value: v, used: false }); }
  return out;
}

export function suggestFor(text: string, caret: number, used: UsedHeaders): BulkSuggestion[] {
  const line = lineAt(text, caret);
  const colon = line.typed.indexOf(':');

  if (colon >= 0) {
    const key = line.typed.slice(0, colon).trim();
    if (!key) return [];
    const q = line.typed.slice(colon + 1).trimStart().toLowerCase();
    return valuesFor(key.toLowerCase(), used)
      .filter(v => v.value.toLowerCase() !== q && v.value.toLowerCase().includes(q))
      .slice(0, MAX)
      .map(v => ({ key, value: v.value, valueOnly: true, used: v.used }));
  }

  const q = line.typed.trim().toLowerCase();
  if (!q) return [];
  const elsewhere = keysElsewhere(text, line);

  /* Every name worth matching: the user's own first (an X-Tenant-Id the catalogue never heard of), then the catalogue. */
  const names = new Map<string, { key: string; used: boolean }>();
  for (const [lower, e] of used) names.set(lower, { key: e.key, used: true });
  for (const h of HTTP_REQUEST_HEADERS) if (!names.has(h.toLowerCase())) names.set(h.toLowerCase(), { key: h, used: false });

  const ranked = [...names]
    .filter(([lower]) => !elsewhere.has(lower))
    .map(([lower, n]) => ({ lower, ...n, r: rank(n.key, q) }))
    .filter(n => n.r >= 0)
    .sort((a, b) => a.r - b.r || Number(b.used) - Number(a.used) || a.key.length - b.key.length);

  const out: BulkSuggestion[] = [];
  for (const n of ranked) {
    if (out.length >= MAX) break;
    const values = valuesFor(n.lower, used).slice(0, VALUES_PER_KEY);
    if (values.length === 0) { out.push({ key: n.key, used: n.used }); continue; }
    for (const v of values) {
      if (out.length >= MAX) break;
      out.push({ key: n.key, value: v.value, used: v.used });
    }
  }
  return out;
}

/** The text and caret after a pick: the whole line becomes `Key: value`. */
export function applySuggestion(text: string, caret: number, s: BulkSuggestion): { text: string; caret: number } {
  const line = lineAt(text, caret);
  const written = `${line.prefix}${s.key}: ${s.value ?? ''}`;
  return { text: text.slice(0, line.start) + written + text.slice(line.end), caret: line.start + written.length };
}
