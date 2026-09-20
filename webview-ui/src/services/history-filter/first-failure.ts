/**
 * "This was fine until 13:41. Here is the one thing that changed."
 *
 * ── Why Daakia finds this, not a model ──
 *
 * The boundary is arithmetic: walk an endpoint's runs in time order, find where
 * the status crosses from good to bad, and take the run either side. The diff
 * is a comparison of two stored requests. Neither needs judgement, and a model
 * asked to do it would be guessing at facts that are sitting right there —
 * which is exactly the kind of "AI feature" that is wrong occasionally and
 * therefore useless permanently.
 *
 * What a model *is* good for here is the sentence after the diff: why a
 * lowercase currency code would produce a 500. That is the existing Response
 * Diff Analyzer, asked from History, and it is a button.
 *
 * ── Why the most recent break ──
 *
 * An endpoint can break and recover several times. The interesting boundary is
 * the last one, because that is the one still costing you something — an
 * endpoint that broke in March and works now is history in both senses.
 *
 * ── Why the diff is redacted ──
 *
 * The two runs are shown side by side and one of the fields most likely to have
 * changed is the token. Printing "your Authorization header changed from X to
 * Y" into a panel somebody screen-shares is how a card meant to help leaks a
 * credential, so values on secret-ish fields are reported as changed without
 * being shown.
 */
import { factsOf, type HeaderPair, type HistoryRowLike } from './history-facts';
import { endpointKey, type Resolver } from './saved-index';

/** Statuses that mean the request did not do what it was asked. */
export function isFailure(status: number): boolean {
  return status === 0 || status >= 400;
}

export function isSuccess(status: number): boolean {
  return status >= 200 && status < 400;
}

export type DiffWhere = 'header' | 'body' | 'auth' | 'query' | 'url';

export interface DiffEntry {
  where: DiffWhere;
  /** Header name, query parameter, or a label like `body`. */
  key: string;
  before: string;
  after: string;
  /** True when the values were withheld because the field carries a secret. */
  redacted: boolean;
}

export interface FailureBoundary {
  endpoint: string;
  method: string;
  /** The last run that worked, and the first that did not. */
  lastGood: { rowId: number; at: number; status: number };
  firstBad: { rowId: number; at: number; status: number };
  /** How many consecutive failures followed, up to the present. */
  failuresSince: number;
  changes: DiffEntry[];
  /** The key a dismissal is stored under. */
  key: string;
}

const SECRET_FIELDS = /^(authorization|proxy-authorization|cookie|x-api-key|api-key|x-auth-token|x-access-token|token|password|secret|client[-_]?secret)$/i;

function pairsToMap(pairs: readonly HeaderPair[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of pairs) out.set(p.key, p.value);
  return out;
}

function diffMaps(
  before: Map<string, string>,
  after: Map<string, string>,
  where: DiffWhere,
): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(key) ?? '';
    const b = after.get(key) ?? '';
    if (a === b) continue;
    const redacted = SECRET_FIELDS.test(key);
    out.push({
      where,
      key,
      before: redacted ? (a ? '(a value)' : '') : a,
      after: redacted ? (b ? '(a different value)' : '') : b,
      redacted,
    });
  }
  return out;
}

function queryMap(url: string): Map<string, string> {
  const out = new Map<string, string>();
  const at = url.indexOf('?');
  if (at < 0) return out;
  for (const part of url.slice(at + 1).split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = eq < 0 ? part : part.slice(0, eq);
    out.set(decodeSafely(key), eq < 0 ? '' : decodeSafely(part.slice(eq + 1)));
  }
  return out;
}

function decodeSafely(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/**
 * The difference between two runs of the same endpoint.
 *
 * Bodies are compared as text rather than parsed, because the change that
 * broke something is as often a stray character as a restructured object, and
 * a parsed comparison would silently normalise exactly that away.
 */
export function diffRuns(good: HistoryRowLike, bad: HistoryRowLike): DiffEntry[] {
  const a = factsOf(good);
  const b = factsOf(bad);
  const out: DiffEntry[] = [
    ...diffMaps(pairsToMap(a.headers), pairsToMap(b.headers), 'header'),
    ...diffMaps(queryMap(a.url), queryMap(b.url), 'query'),
    ...diffMaps(pairsToMap(a.auth.fields), pairsToMap(b.auth.fields), 'auth'),
  ];

  if (a.auth.type !== b.auth.type) {
    out.push({ where: 'auth', key: 'type', before: a.auth.type, after: b.auth.type, redacted: false });
  }
  if (a.body !== b.body) {
    out.push({ where: 'body', key: 'body', before: a.body, after: b.body, redacted: false });
  }
  /* The path without the query — the query is already reported field by field,
     and reporting it twice would make one change look like two. */
  const pathA = a.url.split('?')[0];
  const pathB = b.url.split('?')[0];
  if (pathA !== pathB) {
    out.push({ where: 'url', key: 'path', before: pathA, after: pathB, redacted: false });
  }
  return out;
}

export interface FailureOptions {
  resolve?: Resolver;
  dismissed?: ReadonlySet<string>;
  /** Boundaries older than this are not worth a card. Default: 14 days. */
  maxAgeMs?: number;
  now?: number;
}

const FOURTEEN_DAYS = 14 * 86_400_000;

/**
 * Every endpoint that is currently broken and used to work, newest break first.
 *
 * "Currently" is load-bearing: a boundary only counts when the runs after it
 * are still failing. An endpoint that broke and recovered has nothing for
 * anybody to do, and a card about it is a card that trains people to close
 * cards.
 */
export function findFailureBoundaries(
  rows: readonly HistoryRowLike[],
  options: FailureOptions = {},
): FailureBoundary[] {
  const now = options.now ?? Date.now();
  const maxAge = options.maxAgeMs ?? FOURTEEN_DAYS;

  const byEndpoint = new Map<string, HistoryRowLike[]>();
  for (const row of rows) {
    const facts = factsOf(row);
    if (!facts.url) continue;
    const key = endpointKey({ method: facts.method, url: facts.url }, options.resolve);
    const list = byEndpoint.get(key);
    if (list) list.push(row); else byEndpoint.set(key, [row]);
  }

  const out: FailureBoundary[] = [];
  for (const [key, list] of byEndpoint) {
    if (options.dismissed?.has(key)) continue;
    /* Oldest first, so "the run before" is the previous element. History
       arrives newest-first, and reading it in that order would report the
       recovery as the break. */
    const ordered = [...list].sort((a, b) => stamp(a) - stamp(b));

    const newest = factsOf(ordered[ordered.length - 1]);
    if (!isFailure(newest.status)) continue;

    /* Walk back to the last run that worked. Everything after it is failing,
       which is what makes this a break rather than a bad patch. */
    let boundary = -1;
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (isSuccess(factsOf(ordered[i]).status)) { boundary = i; break; }
    }
    if (boundary < 0 || boundary === ordered.length - 1) continue;

    const good = ordered[boundary];
    const bad = ordered[boundary + 1];
    const badFacts = factsOf(bad);
    if (now - badFacts.at > maxAge) continue;

    const goodFacts = factsOf(good);
    out.push({
      endpoint: key.slice(key.indexOf(' ') + 1),
      method: badFacts.method,
      lastGood: { rowId: goodFacts.id, at: goodFacts.at, status: goodFacts.status },
      firstBad: { rowId: badFacts.id, at: badFacts.at, status: badFacts.status },
      failuresSince: ordered.length - 1 - boundary,
      changes: diffRuns(good, bad),
      key,
    });
  }

  return out.sort((a, b) => b.firstBad.at - a.firstBad.at);
}

function stamp(row: HistoryRowLike): number {
  const at = factsOf(row).at;
  /* A row with no usable timestamp sorts oldest rather than throwing the whole
     ordering out — it cannot be the boundary, which is the safe outcome. */
  return Number.isFinite(at) ? at : 0;
}

/** `13:41` — the time the card puts in its sentence. */
export function clockTime(at: number): string {
  if (!Number.isFinite(at)) return '';
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The one change most likely to be the cause, for the card's two lines.
 *
 * A body edit beats a header edit beats everything else, because a body is what
 * people were changing when it broke. The rest stay available behind "n more" —
 * ranking is not hiding, and a card that showed all eleven would be a wall.
 */
const CAUSE_RANK: Record<DiffWhere, number> = { body: 0, query: 1, url: 2, header: 3, auth: 4 };

export function likeliestChange(changes: readonly DiffEntry[]): DiffEntry | undefined {
  return [...changes].sort((a, b) => CAUSE_RANK[a.where] - CAUSE_RANK[b.where])[0];
}

/**
 * The changed part of two strings, with a little either side.
 *
 * A 4 KB body whose only difference is one character is not a diff anybody can
 * read; the common prefix and suffix are dropped so the card shows the change
 * rather than the document.
 */
export function narrow(before: string, after: string, context = 30): { before: string; after: string } {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let end = 0;
  while (end < max - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;

  const from = Math.max(0, start - context);
  const cut = (s: string) => {
    const to = Math.max(from, s.length - end + context);
    return (from > 0 ? '…' : '') + s.slice(from, to) + (to < s.length ? '…' : '');
  };
  return { before: cut(before), after: cut(after) };
}
