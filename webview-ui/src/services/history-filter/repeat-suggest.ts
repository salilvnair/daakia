/**
 * "You have sent this eleven times and it is not in a collection."
 *
 * ── Why there is no model in this file ──
 *
 * Counting how often an endpoint was sent, checking it against the collections
 * and proposing a name from its own path needs arithmetic, not a language
 * model. Building it the other way round would make the feature depend on a
 * provider being configured — and a feature that only works for people who have
 * set up an API key is a feature most people never see.
 *
 * The model layer sits on top: given this card, it can write a better name and
 * pick a better folder. It is asked afterwards, its answer replaces two
 * strings, and when it is absent or wrong the card is still the card. See
 * `ai-suggest.ts`.
 *
 * ── Why it counts endpoints rather than URLs ──
 *
 * Eleven sends to `/orders/8814`, `/orders/8815`, `/orders/8816` is one request
 * you have been iterating on, not three you sent four times each. The grouping
 * key is the normalised endpoint — see `saved-index.ts` for what that means and
 * why the normalising has to be conservative.
 *
 * ── Why it can be told to be quiet ──
 *
 * A suggestion you have said no to is an answer, and asking again is how a
 * helpful prompt becomes an irritation. Dismissals are carried in, keyed by
 * endpoint, and the caller persists them.
 */
import { factsOf, type HistoryRowLike } from './history-facts';
import {
  endpointKey, normaliseUrl, type CollectionNodeLike, type Resolver, type SavedIndex,
} from './saved-index';

/** Sent this many times without being saved before anything is said. */
export const DEFAULT_MIN_SENDS = 5;

export interface SaveSuggestion {
  /** `POST https://api.acme.test/orders` — the grouping key and the dismissal key. */
  key: string;
  method: string;
  /** The endpoint, ids blanked — what the card shows. */
  endpoint: string;
  /** One real URL from history, for the request the Save dialog would open. */
  sampleUrl: string;
  /** The most recent row, which is the one worth saving: it has the latest body. */
  rowId: number;
  count: number;
  /** Distinct calendar days it was sent on — "all afternoon" versus "all week". */
  days: number;
  /** Whether the most recent send was today, which is what the card may say. */
  sentToday: boolean;
  firstAt: number;
  lastAt: number;
  /** A name proposed from the path. Editable; this is a first draft, not a verdict. */
  name: string;
  /** Where its neighbours already live, when it has any. */
  folder?: { id: string; name: string };
  /** Why this is being suggested, in the words the card uses. */
  reason: string;
}

export interface SuggestOptions {
  saved: SavedIndex;
  /** Endpoint keys somebody has already said no to. */
  dismissed?: ReadonlySet<string>;
  minSends?: number;
  /** Now, injected so the wording is testable without waiting for midnight. */
  now?: number;
  resolve?: Resolver;
  /** The collection tree, for proposing a folder. */
  tree?: readonly CollectionNodeLike[];
}

// ── Naming ──────────────────────────────────────────────────────────────────

const VERBS: Record<string, string> = {
  GET: 'Get',
  POST: 'Create',
  PUT: 'Update',
  PATCH: 'Update',
  DELETE: 'Delete',
  HEAD: 'Head',
  OPTIONS: 'Options',
};

/**
 * A name from the path, the way somebody would have typed it.
 *
 * `POST /orders` is "Create order"; `GET /orders` is "List orders"; `GET
 * /orders/:id` is "Get order". The rule is the shape of the path, because that
 * is the convention REST already encodes: a collection path with a POST creates
 * one of the thing, the same path with a GET lists them, and an id on the end
 * means one of them.
 *
 * It is a draft in an editable box. Getting it right most of the time saves
 * typing; getting it wrong costs a correction, which is why nothing here
 * guesses beyond what the path actually says.
 */
export function proposeName(method: string, endpoint: string): string {
  const path = endpoint.replace(/^[a-z]+:\/\/[^/]*/i, '');
  const segments = path.split('/').filter(Boolean);
  const verb = VERBS[method.toUpperCase()] ?? method.toUpperCase();

  const last = segments[segments.length - 1];
  const isOne = last === ':id';
  /* The noun is the last segment that is not an id — `/orders/:id/items/:id`
     is about items, not about orders. */
  const named = [...segments].reverse().find(s => s !== ':id');
  /*
    A URL with no path at all still has a name in it: the host.

    GraphQL and RPC endpoints are a bare origin, and every one of them was
    coming out as "Create request" — a name that says nothing and that
    everybody would have to retype. The first label of the host is what people
    call that service ("countries", "payments"), and `www` and `api` are
    skipped because neither is the name of anything.
  */
  const host = named ? undefined : hostLabel(endpoint);
  const words = humanise(named ?? host ?? 'request');

  /*
    A host is a proper noun, so it is never singularised.

    `countries.trevorblades.com` came out as "Create trevorblade" — the plural
    rule is about resource paths, where a trailing `s` means "the collection of
    these", and applying it to somebody's name just misspells it.
  */
  const one = host ? words : singular(words);

  if (method.toUpperCase() === 'GET' && !isOne && !host) return `List ${words}`;
  return `${verb} ${one}`;
}

/** The part of a host somebody would say out loud: `api.countries.dev` → `countries`. */
function hostLabel(endpoint: string): string | undefined {
  const host = endpoint.replace(/^[a-z]+:\/\//i, '').split('/')[0].split(':')[0];
  const parts = host.split('.').filter(p => p && !['www', 'api', 'localhost'].includes(p));
  /* The last label is the TLD and the one before it is the name — except on a
     single-label host like `orders-service`, where there is only the name. */
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return parts[parts.length - 2];
}

/** `user-profiles` and `userProfiles` both become `user profiles`. */
function humanise(segment: string): string {
  return segment
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase()
    .trim() || 'request';
}

/*
  English plurals, only where they are unambiguous.

  `statuses` → `status` and `orders` → `order` are safe; `news` and `data` are
  not, so anything that does not end in a plain `s` is left alone. A name is a
  draft in a text box — a wrong guess here costs one correction, and being
  clever about irregulars would cost more of them.
*/
function singular(words: string): string {
  if (/(ss|us|is|as)$/i.test(words)) return words;
  if (/ies$/i.test(words)) return words.replace(/ies$/i, 'y');
  if (/(ch|sh|x|z|s)es$/i.test(words)) return words.replace(/es$/i, '');
  if (/s$/i.test(words)) return words.replace(/s$/i, '');
  return words;
}

// ── Where it would go ───────────────────────────────────────────────────────

/**
 * The collection its neighbours are already in.
 *
 * Measured by shared path prefix against every saved request on the same host,
 * so `POST /orders` is offered the folder that holds `GET /orders/:id` rather
 * than whichever collection happens to be first. No host in common means no
 * proposal at all — an arbitrary folder is worse than an empty box, because it
 * is the kind of wrong that gets accepted by reflex.
 */
export function proposeFolder(
  endpoint: string,
  tree: readonly CollectionNodeLike[] | undefined,
  resolve?: Resolver,
): { id: string; name: string } | undefined {
  if (!tree?.length) return undefined;
  const target = endpoint.split('/').filter(Boolean);
  let best: { id: string; name: string; score: number } | undefined;

  const walk = (nodes: readonly CollectionNodeLike[]) => {
    for (const node of nodes) {
      for (const request of node.requests ?? []) {
        const other = normaliseUrl(request.url ?? '', resolve).split('/').filter(Boolean);
        let score = 0;
        while (score < target.length && score < other.length && target[score] === other[score]) score++;
        /* The first two parts are the scheme and the host; sharing only those
           is not a neighbourhood. */
        if (score >= 2 && (!best || score > best.score)) {
          best = { id: node.id, name: node.name, score };
        }
      }
      if (node.children?.length) walk(node.children);
    }
  };
  walk(tree);

  return best ? { id: best.id, name: best.name } : undefined;
}

// ── The suggestions ─────────────────────────────────────────────────────────

interface Bucket {
  key: string;
  method: string;
  endpoint: string;
  sampleUrl: string;
  rowId: number;
  count: number;
  firstAt: number;
  lastAt: number;
  days: Set<string>;
}

function bucketise(
  rows: readonly HistoryRowLike[],
  options: SuggestOptions,
): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();
  for (const row of rows) {
    const facts = factsOf(row);
    if (!facts.url) continue;
    const key = endpointKey({ method: facts.method, url: facts.url }, options.resolve);
    const at = Number.isFinite(facts.at) ? facts.at : 0;
    const day = at ? new Date(at).toISOString().slice(0, 10) : 'unknown';
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        key,
        method: facts.method,
        endpoint: normaliseUrl(facts.url, options.resolve),
        sampleUrl: facts.url,
        rowId: facts.id,
        count: 1,
        firstAt: at,
        lastAt: at,
        days: new Set([day]),
      });
      continue;
    }
    existing.count++;
    existing.days.add(day);
    if (at && at < existing.firstAt) existing.firstAt = at;
    if (at >= existing.lastAt) {
      /* The newest send is the one to save: it has the body and headers as they
         ended up, after whatever was being iterated on. */
      existing.lastAt = at;
      existing.sampleUrl = facts.url;
      existing.rowId = facts.id;
    }
  }
  return buckets;
}

function toSuggestion(b: Bucket, options: SuggestOptions, now = Date.now()): SaveSuggestion {
  const days = b.days.size;
  /*
    "Today" has to mean today.

    One distinct day is not the same as the current one: a burst of eleven
    sends last Tuesday is still one day, and a card that called it "today"
    would be plainly wrong to anybody reading the timestamps underneath it.
  */
  const sentToday = new Date(b.lastAt).toDateString() === new Date(now).toDateString();
  return {
    key: b.key,
    method: b.method,
    endpoint: b.endpoint,
    sampleUrl: b.sampleUrl,
    rowId: b.rowId,
    count: b.count,
    days,
    firstAt: b.firstAt,
    lastAt: b.lastAt,
    name: proposeName(b.method, b.endpoint),
    folder: proposeFolder(b.endpoint, options.tree, options.resolve),
    sentToday,
    reason: days > 1
      ? `Sent ${b.count} times across ${days} days, never saved`
      : sentToday
        ? `Sent ${b.count} times today, never saved`
        : `Sent ${b.count} times, never saved`,
  };
}

/**
 * Every endpoint worth offering to save, most-sent first.
 *
 * An endpoint already in a collection is never offered, and neither is one
 * somebody has dismissed — those two checks are what separate a useful nudge
 * from the assistant that asks the same question every morning.
 */
export function suggestSaves(
  rows: readonly HistoryRowLike[],
  options: SuggestOptions,
): SaveSuggestion[] {
  const min = options.minSends ?? DEFAULT_MIN_SENDS;
  const out: SaveSuggestion[] = [];
  for (const bucket of bucketise(rows, options).values()) {
    if (bucket.count < min) continue;
    if (options.dismissed?.has(bucket.key)) continue;
    if (options.saved.has({ method: bucket.method, url: bucket.sampleUrl })) continue;
    out.push(toSuggestion(bucket, options, options.now));
  }
  return out.sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);
}

/**
 * The card for the request that has just been sent, or nothing.
 *
 * Separate from the list because the moment matters: this is the one shown on
 * send, and it must be about the request in front of you rather than the
 * busiest one in the table.
 */
export function suggestionForSend(
  sent: { method: string; url: string },
  rows: readonly HistoryRowLike[],
  options: SuggestOptions,
): SaveSuggestion | undefined {
  const key = endpointKey(sent, options.resolve);
  if (options.dismissed?.has(key)) return undefined;
  if (options.saved.has(sent)) return undefined;
  const bucket = bucketise(rows, options).get(key);
  if (!bucket || bucket.count < (options.minSends ?? DEFAULT_MIN_SENDS)) return undefined;
  return toSuggestion(bucket, options, options.now);
}
