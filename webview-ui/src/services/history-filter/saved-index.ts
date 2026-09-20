/**
 * Is this request already in a collection?
 *
 * ── Why this is computed rather than stored ──
 *
 * A history row carries the id of the *tab* it was sent from, not of a saved
 * request, and nothing writes back to it when you later save that request. So
 * "never saved" cannot be read off a column; it is a question about two lists,
 * answered here.
 *
 * ── Why the comparison is normalised ──
 *
 * The saved request says `{{baseUrl}}/orders/{{orderId}}`. The history row says
 * `https://api.acme.test/orders/8814`. Compared as text those are two different
 * requests, and the panel would offer to save something you saved last week —
 * which is the one mistake that would make people turn the suggestion off.
 *
 * So both sides go through the same three steps:
 *
 * 1. **Resolve** `{{vars}}` through the active environment, so the saved side
 *    reaches the same host the history side recorded.
 * 2. **Strip** the query and fragment. `?page=2` is an argument, not an
 *    endpoint; two requests that differ only there are the same request sent
 *    twice.
 * 3. **Blank the volatile segments.** A path segment that is all digits, a
 *    UUID, a long hex string or a still-unresolved `{{placeholder}}` becomes
 *    `:id`. That is what makes `/orders/8814` and `/orders/8815` one endpoint —
 *    and it is the step that has to be conservative, because collapsing a
 *    segment that was really a name would merge two endpoints into one and
 *    under-report.
 *
 * The method is part of the key: `GET /orders/:id` and `DELETE /orders/:id` are
 * emphatically not the same request to offer to save.
 */

/** Anything with a `method` and a `url` — a saved request or a history row. */
export interface EndpointLike {
  method?: string;
  url?: string;
}

export type Resolver = (input: string) => string;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX = /^[0-9a-f]{12,}$/i;
const TEMPLATE = /^\{\{[^}]*\}\}$/;
const COLON_PARAM = /^:[A-Za-z_]/;

/**
 * One path segment, blanked if it looks like an identifier rather than a name.
 *
 * `24` and `v2` both start with a digit; only the first is an id. The test is
 * "all digits", not "starts with one", precisely so `/v2/users` keeps its
 * version — an API version is part of the endpoint's identity and merging two
 * of them would be wrong in the direction nobody notices.
 */
export function blankVolatile(segment: string): string {
  if (!segment) return segment;
  if (/^\d+$/.test(segment)) return ':id';
  if (UUID.test(segment)) return ':id';
  if (LONG_HEX.test(segment)) return ':id';
  if (TEMPLATE.test(segment)) return ':id';
  if (COLON_PARAM.test(segment)) return ':id';
  return segment.toLowerCase();
}

/**
 * The endpoint two requests share, or do not.
 *
 * Returns the URL only; `endpointKey` adds the method. Split out because the
 * suggestion card wants to show the normalised URL on its own.
 */
export function normaliseUrl(url: string, resolve?: Resolver): string {
  let text = (url ?? '').trim();
  if (!text) return '';
  if (resolve) {
    try { text = resolve(text); } catch { /* an unresolvable variable is left as it is */ }
  }

  /* Query and fragment go first, so a `{{token}}` in a query string never
     reaches the segment pass and turns into a spurious `:id`. */
  text = text.split('#')[0].split('?')[0];

  const scheme = text.match(/^([a-z][a-z0-9+.-]*:\/\/)/i);
  let rest = scheme ? text.slice(scheme[1].length) : text;
  const origin = scheme ? scheme[1].toLowerCase() : '';

  const slash = rest.indexOf('/');
  const host = (slash < 0 ? rest : rest.slice(0, slash)).toLowerCase();
  const path = slash < 0 ? '' : rest.slice(slash);

  const segments = path.split('/').map(blankVolatile);
  let normalised = `${origin}${host}${segments.join('/')}`;
  /* A trailing slash is punctuation, not a different endpoint — but `/` on its
     own is the root and losing it would make every host one key. */
  if (normalised.length > 1 && normalised.endsWith('/')) normalised = normalised.slice(0, -1);
  return normalised;
}

export function endpointKey(item: EndpointLike, resolve?: Resolver): string {
  const method = (item.method || 'GET').toUpperCase();
  return `${method} ${normaliseUrl(item.url || '', resolve)}`;
}

// ── The index ───────────────────────────────────────────────────────────────

/** A collection tree, shallow enough that this module need not know the rest. */
export interface CollectionNodeLike {
  id: string;
  name: string;
  children?: CollectionNodeLike[];
  requests?: EndpointLike[];
}

export interface SavedIndex {
  /** Every endpoint key a collection holds. */
  keys: Set<string>;
  /** Which collection each key was found in, for "save it next to the others". */
  homeOf: Map<string, { id: string; name: string }>;
  has(item: EndpointLike): boolean;
}

export function buildSavedIndex(
  tree: readonly CollectionNodeLike[],
  resolve?: Resolver,
): SavedIndex {
  const keys = new Set<string>();
  const homeOf = new Map<string, { id: string; name: string }>();

  const walk = (nodes: readonly CollectionNodeLike[]) => {
    for (const node of nodes) {
      for (const request of node.requests ?? []) {
        const key = endpointKey(request, resolve);
        keys.add(key);
        /* First one wins. A request saved in two places has a home either way,
           and the first in tree order is the one nearest the top of the
           sidebar, which is where somebody would look for it. */
        if (!homeOf.has(key)) homeOf.set(key, { id: node.id, name: node.name });
      }
      if (node.children?.length) walk(node.children);
    }
  };
  walk(tree);

  return {
    keys,
    homeOf,
    has: (item) => keys.has(endpointKey(item, resolve)),
  };
}

export const EMPTY_SAVED_INDEX: SavedIndex = {
  keys: new Set(),
  homeOf: new Map(),
  has: () => false,
};
