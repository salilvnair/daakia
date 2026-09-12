/**
 * Saved response examples.
 *
 * ── What was missing ──
 *
 * A request stored exactly one response: the last one. So "what does this
 * look like when the token has expired", "what did it return before the
 * migration" and "what should the mock send back" had nowhere to live, and
 * the docs export had nothing to show but a URL and a payload.
 *
 * ── Why the request's own blob, again ──
 *
 * Same reason as the Docs tab: `collection_requests.data` is free-form JSON,
 * so examples round-trip through save, git sync and every export with no
 * migration. That comes with a real constraint — the blob is one column read
 * whole — so this module is mostly about keeping it small.
 *
 * ── What is deliberately not stored ──
 *
 * Script logs, test results, sub-requests and timing. An example is what the
 * server said, not what happened around it; keeping the rest would triple the
 * size for information nobody reads out of an example.
 */
import type { ResponseData } from '../../store/tabs-store';

/** One saved response. */
export interface ResponseExample {
  id: string;
  name: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  contentType: string;
  /** ISO timestamp — when it was saved, not when the request ran. */
  savedAt: string;
  /** Set when the body was cut to fit; the UI says so rather than lying. */
  truncated?: boolean;
}

/**
 * Caps, chosen so a request's blob stays in the tens of kilobytes.
 *
 * A single response can be megabytes, and this column is read whole on every
 * collection load — an uncapped example store would make opening the sidebar
 * slower for everybody who ever pressed Save once on a large response.
 */
export const MAX_EXAMPLE_BODY = 64 * 1024;
export const MAX_EXAMPLES_PER_REQUEST = 20;
/** Headers worth keeping: the ones that describe the body or the outcome. */
const KEPT_HEADERS = [
  'content-type', 'content-length', 'content-encoding', 'cache-control',
  'etag', 'location', 'retry-after', 'x-request-id',
];

/**
 * A name that says what the example is, without being typed.
 *
 * `200 OK`, `404 Not Found` — the status is what people actually look for in
 * a list of examples. Duplicates get a counter rather than being rejected:
 * two different 200s is the normal case, not a mistake.
 */
export function defaultName(response: { status: number; statusText: string }, existing: ResponseExample[]): string {
  const base = `${response.status} ${response.statusText || ''}`.trim() || 'Example';
  if (!existing.some(e => e.name === base)) return base;
  let n = 2;
  while (existing.some(e => e.name === `${base} (${n})`)) n++;
  return `${base} (${n})`;
}

/** Only the headers that tell you something about the body or the outcome. */
function trimHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (KEPT_HEADERS.includes(k.toLowerCase())) out[k] = v;
  }
  return out;
}

/** Turn a live response into something small enough to keep. */
export function toExample(response: ResponseData, name: string): ResponseExample {
  const body = response.body ?? '';
  const truncated = body.length > MAX_EXAMPLE_BODY;
  return {
    id: crypto.randomUUID(),
    name,
    status: response.status,
    statusText: response.statusText ?? '',
    headers: trimHeaders(response.headers),
    body: truncated ? body.slice(0, MAX_EXAMPLE_BODY) : body,
    contentType: response.contentType ?? '',
    savedAt: new Date().toISOString(),
    ...(truncated ? { truncated: true } : {}),
  };
}

/**
 * Add one, newest first, within the cap.
 *
 * The oldest goes when the cap is reached rather than the save being refused:
 * a click that silently does nothing is worse than a list that forgets its
 * least recent entry, and the entry you just saved is the one you want.
 */
export function addExample(existing: ResponseExample[], example: ResponseExample): ResponseExample[] {
  return [example, ...existing].slice(0, MAX_EXAMPLES_PER_REQUEST);
}

export function renameExample(existing: ResponseExample[], id: string, name: string): ResponseExample[] {
  const trimmed = name.trim();
  if (!trimmed) return existing;
  return existing.map(e => (e.id === id ? { ...e, name: trimmed } : e));
}

export function removeExample(existing: ResponseExample[], id: string): ResponseExample[] {
  return existing.filter(e => e.id !== id);
}

/**
 * Read what was stored, defensively.
 *
 * The blob is JSON written by a previous version of this app, hand-edited
 * files, and git merges — so a malformed entry is a normal thing to meet, and
 * dropping one bad example is better than throwing on the whole request.
 */
export function parseExamples(raw: unknown): ResponseExample[] {
  if (!Array.isArray(raw)) return [];
  const out: ResponseExample[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    if (typeof e.id !== 'string' || typeof e.name !== 'string') continue;
    out.push({
      id: e.id,
      name: e.name,
      status: typeof e.status === 'number' ? e.status : 0,
      statusText: typeof e.statusText === 'string' ? e.statusText : '',
      headers: e.headers && typeof e.headers === 'object' ? e.headers as Record<string, string> : {},
      body: typeof e.body === 'string' ? e.body.slice(0, MAX_EXAMPLE_BODY) : '',
      contentType: typeof e.contentType === 'string' ? e.contentType : '',
      savedAt: typeof e.savedAt === 'string' ? e.savedAt : '',
      ...(e.truncated === true ? { truncated: true as const } : {}),
    });
    if (out.length >= MAX_EXAMPLES_PER_REQUEST) break;
  }
  return out;
}

/**
 * An example as a response the panel can render.
 *
 * Size and time are of the example, not of a request that did not happen: the
 * body's length is a fact, and the time is zero because nothing was sent.
 */
export function toResponseData(example: ResponseExample): ResponseData {
  return {
    status: example.status,
    statusText: example.statusText,
    headers: example.headers,
    body: example.body,
    size: example.body.length,
    time: 0,
    contentType: example.contentType,
    cookies: [],
  };
}
