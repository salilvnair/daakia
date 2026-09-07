/**
 * Response chaining — a value from this response becomes a variable for the next.
 *
 * ── Why this exists outside the editor ──
 *
 * The panel that edits extractions had an "Apply" button that posted
 * `env:setVars`, a message the extension host has never handled — so the
 * feature was not merely unreachable, its one visible action did nothing. And
 * a chain you have to press a button for is not a chain: the whole point is
 * that a login writes `{{token}}` and the next request already has it.
 *
 * So extraction runs here, on arrival, for every response, and the panel's
 * button calls the same function rather than owning a second copy of the
 * rules.
 *
 * ── Where the value goes ──
 *
 * Into the active environment's `currentValue`, which is the layer the
 * resolver reads and the one Postman calls "current value" — the session's
 * value, not the one committed to the collection. `initialValue` is left
 * alone, so a token pulled out of a response never lands in an export.
 */
import { useTabsStore, type ChainExtraction } from '../../store/tabs-store';
import { useEnvStore, GLOBAL_ENV_ID, type EnvVariable } from '../../store/env-store';

/**
 * Read one extraction out of a response.
 *
 * Exported for the editor's live preview, which shows what each rule would
 * pull from the response on screen before it is saved.
 */
export function extractValue(
  extraction: ChainExtraction,
  body: string,
  headers: Record<string, string>,
  status?: number,
): string | undefined {
  if (extraction.source === 'status') {
    return status === undefined ? undefined : String(status);
  }
  if (extraction.source === 'header') {
    // Header names are case-insensitive, and the casing a server sends is not
    // the casing anyone types into a rule.
    const key = Object.keys(headers).find(k => k.toLowerCase() === extraction.path.toLowerCase());
    return key ? headers[key] : undefined;
  }
  try {
    const parts = extraction.path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    let current: unknown = JSON.parse(body);
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    if (current === undefined || current === null) return undefined;
    // An object would stringify as [object Object] through String(); a chained
    // value is nearly always a scalar, and JSON is the honest reading for the
    // rest.
    return typeof current === 'object' ? JSON.stringify(current) : String(current);
  } catch {
    return undefined;
  }
}

/** What one run of the chain did, so a caller can report it. */
export interface ChainResult {
  applied: { name: string; value: string }[];
  /** Rules that were enabled and complete but found nothing at their path. */
  missed: string[];
}

/**
 * Run a tab's extractions against a response and write the variables.
 *
 * Returns what happened rather than raising a toast itself: the automatic path
 * stays silent unless something is wrong, while the manual button reports
 * either way.
 */
export function applyChainExtractions(
  tabId: string,
  response: { body?: string; headers?: Record<string, string>; status?: number },
): ChainResult {
  const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
  const rules = (tab?.chainExtractions ?? []).filter(e => e.enabled && e.variableName && e.path);
  const out: ChainResult = { applied: [], missed: [] };
  if (rules.length === 0) return out;

  const body = response.body ?? '';
  const headers = response.headers ?? {};
  for (const rule of rules) {
    const value = extractValue(rule, body, headers, response.status);
    if (value === undefined) out.missed.push(rule.variableName);
    else out.applied.push({ name: rule.variableName, value });
  }

  if (out.applied.length > 0) setVariables(Object.fromEntries(out.applied.map(a => [a.name, a.value])));
  return out;
}

/**
 * Set variables by name in the environment a request would actually read.
 *
 * The active environment if there is one, Global otherwise — writing into an
 * inactive environment would leave `{{token}}` unresolved for the very
 * request the chain exists to feed.
 */
function setVariables(values: Record<string, string>): void {
  const env = useEnvStore.getState();
  const envId = env.activeEnvId ?? GLOBAL_ENV_ID;
  const target = env.environments.find(e => e.id === envId);
  if (!target) return;

  const next: EnvVariable[] = target.variables.map(v =>
    v.key in values ? { ...v, currentValue: values[v.key]! } : v);
  for (const [key, value] of Object.entries(values)) {
    if (next.some(v => v.key === key)) continue;
    next.push({
      id: crypto.randomUUID(),
      key,
      // Empty, deliberately: the extracted value belongs to this session, and
      // `initialValue` is what an export carries.
      initialValue: '',
      currentValue: value,
      isSecret: false,
    });
  }
  env.updateVariables(envId, next);
}

/**
 * What could come next in a path, given the response on screen.
 *
 * Typing `data.` should offer the keys of `data`, and `[0].` the keys of the
 * first element — the same thing an editor does with a symbol table, except
 * the table here is a response somebody actually received. Without it a path
 * is written by reading the JSON in another tab and typing what you saw,
 * which is how `data.user.id` becomes `data.users.id` and the rule silently
 * extracts nothing.
 *
 * Pure, and returns the whole replacement text rather than a fragment: the
 * caller sets the input's value and moves on, with no cursor arithmetic to
 * get wrong.
 */
export interface PathSuggestion {
  /** What to show in the list. */
  label: string;
  /** What the input becomes when this is chosen. */
  value: string;
  /** A short rendering of what lives there, so the choice is informed. */
  preview: string;
}

/** `users[`, `users[1` — a path whose last token is an index being typed. */
const INDEX_TAIL = new RegExp('^(.*)\\[(\\d*)$');
const TRAILING_DOT = new RegExp('\\.$');

/** Objects wider than this are a map, not a shape; listing them all helps nobody. */
const MAX_SUGGESTIONS = 40;
/** How much of a value to show beside its key. */
const PREVIEW_CHARS = 28;

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === 'object') return `{${Object.keys(value as object).length} keys}`;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text;
}

/** Walk a dotted/indexed path, returning the node it names. */
function nodeAt(root: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current: unknown = root;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function pathSuggestions(body: string, text: string): PathSuggestion[] {
  let root: unknown;
  try { root = JSON.parse(body || ''); } catch { return []; }
  if (root === null || typeof root !== 'object') return [];

  /*
    An open bracket at the very end asks for an index, wherever it sits.

    Checked before anything else, because the fragment it belongs to is a KEY
    plus a bracket — `users[` — which the key logic below looks up as a key
    called "users[" and finds nothing. That was the first version, and it went
    quiet at exactly the moment an array was reached.
  */
  const indexTail = text.match(INDEX_TAIL);
  if (indexTail) {
    const base = indexTail[1] ?? '';
    const typed = indexTail[2] ?? '';
    const node = base ? nodeAt(root, base) : root;
    if (!Array.isArray(node)) return [];
    return node.slice(0, MAX_SUGGESTIONS)
      .map((item, i) => ({ i: String(i), item }))
      .filter(({ i }) => !typed || i.startsWith(typed))
      .map(({ i, item }) => ({ label: `[${i}]`, value: `${base}[${i}]`, preview: describe(item) }));
  }

  /*
    Otherwise the boundary is the last separator: `data.us` means "inside
    data, keys starting with us", `data.` means "inside data, everything",
    and `data` means "at the root, keys starting with data".
  */
  const cut = Math.max(text.lastIndexOf('.'), text.lastIndexOf(']'));
  const settled = cut >= 0 ? text.slice(0, cut + 1) : '';
  const fragment = cut >= 0 ? text.slice(cut + 1) : text;

  const base = settled.replace(TRAILING_DOT, '');
  const node = base ? nodeAt(root, base) : root;
  if (node === null || node === undefined || typeof node !== 'object' || Array.isArray(node)) return [];

  const needle = fragment.toLowerCase();
  return Object.keys(node as Record<string, unknown>)
    .filter(key => !needle || key.toLowerCase().startsWith(needle))
    .slice(0, MAX_SUGGESTIONS)
    .map(key => ({
      label: key,
      // A dot before the key, unless the path already ends in one or this is
      // the first segment.
      value: settled && !settled.endsWith('.') ? `${settled}.${key}` : `${settled}${key}`,
      preview: describe((node as Record<string, unknown>)[key]),
    }));
}
