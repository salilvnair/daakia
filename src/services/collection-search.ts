/**
 * One search across every collection, in every protocol.
 *
 * ── The question this answers ──
 *
 * Each sidebar panel filters its own protocol's tree by name and URL, which
 * answers "where is the request I am thinking of". It cannot answer the two
 * questions people actually arrive with before a migration:
 *
 *   - which request, anywhere, sends this header?
 *   - where does this staging host still appear?
 *
 * Those are the questions that decide whether a four-hundred-request
 * collection is maintainable, and the answer was previously "open them".
 *
 * ── What counts as a match ──
 *
 * A request matches if the query appears in its name, URL, a header or
 * parameter (key or value), its body, or its documentation — and the hit says
 * which, because "found in the body" and "found in the URL" send you to
 * different places. A collection or folder matches on its own name too: an
 * empty folder called `staging` is part of the answer to "where does staging
 * appear".
 *
 * ── Regex, in the same clothes as everywhere else ──
 *
 * `/pattern/` is a regular expression, plain text is a substring, both
 * case-insensitive unless the regex says otherwise. That is the convention
 * the log filter and the file search already use; a second convention for the
 * same idea would be one to remember.
 */

/** Where in a request the query was found. */
export type MatchField = 'name' | 'url' | 'header' | 'param' | 'body' | 'docs' | 'folder';

export interface SearchHit {
  /** Request id, or collection id for a folder hit. */
  id: string;
  kind: 'request' | 'folder';
  name: string;
  method?: string;
  url?: string;
  /** `Collection / Folder`, without the request's own name. */
  path: string;
  /** The collection the request lives in, for opening it. */
  collectionId: string;
  field: MatchField;
  /** A short window around the match, for the row to show. */
  context: string;
}

/** What the tree looks like — the shape `getCollectionTree()` returns. */
export interface SearchNode {
  id: string;
  name: string;
  children: SearchNode[];
  requests: { id: string; name: string; method?: string; url?: string; data?: string }[];
}

export interface SearchOptions {
  /** Stop after this many hits. A query of `e` matches everything. */
  limit?: number;
}

const DEFAULT_LIMIT = 300;
/** How much of the surrounding text a hit carries back. */
const CONTEXT_WINDOW = 60;

/**
 * Compile a query into a test.
 *
 * Returns null for an empty query rather than a matcher that matches
 * everything: "search for nothing" has no useful answer, and a list of every
 * request in every collection is not it.
 */
export function compileQuery(query: string): ((text: string) => number) | null {
  const q = query.trim();
  if (!q) return null;

  const asRegex = q.match(/^\/(.+)\/([gimsuy]*)$/);
  if (asRegex) {
    try {
      // `g` is dropped deliberately: a stateful `lastIndex` between calls
      // makes the same text match or not depending on what was tested before.
      const re = new RegExp(asRegex[1]!, asRegex[2]!.replace(/g/g, '') || 'i');
      return (text: string) => {
        const m = re.exec(text);
        return m ? m.index : -1;
      };
    } catch {
      // An unfinished regex — someone still typing `/user(` — falls back to
      // the literal text, which is what they see in the box.
    }
  }

  const needle = q.toLowerCase();
  return (text: string) => text.toLowerCase().indexOf(needle);
}

/** A window around the match, with the ends marked when it was cut. */
function contextAt(text: string, index: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= CONTEXT_WINDOW) return flat;
  const start = Math.max(0, index - CONTEXT_WINDOW / 3);
  const end = Math.min(flat.length, start + CONTEXT_WINDOW);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}

interface Field { field: MatchField; text: string }

/** Everything about a request that is worth searching, as flat text. */
function fieldsOf(request: SearchNode['requests'][number]): Field[] {
  const out: Field[] = [
    { field: 'name', text: request.name || '' },
    { field: 'url', text: request.url || '' },
  ];

  let data: Record<string, unknown> = {};
  try { data = request.data ? JSON.parse(request.data) as Record<string, unknown> : {}; } catch { /* unreadable blob */ }

  const rows = (key: string, field: MatchField) => {
    const list = data[key];
    if (!Array.isArray(list)) return;
    for (const row of list as { key?: string; value?: string; enabled?: boolean }[]) {
      if (!row || row.enabled === false) continue;
      const text = `${row.key ?? ''}: ${row.value ?? ''}`.trim();
      if (text !== ':') out.push({ field, text });
    }
  };
  rows('headers', 'header');
  rows('params', 'param');

  for (const key of ['bodyRaw', 'soapEnvelope', 'grpcMessage', 'aiUserPrompt']) {
    const v = data[key];
    if (typeof v === 'string' && v) out.push({ field: 'body', text: v });
  }
  if (typeof data.docs === 'string' && data.docs) out.push({ field: 'docs', text: data.docs });

  return out;
}

/**
 * Search a tree.
 *
 * One hit per request at most — the first field that matches, in the order
 * above, so a query that appears in both the URL and the body reports the URL.
 * A list with the same request four times is a list nobody can scan.
 */
export function searchTree(nodes: SearchNode[], query: string, options: SearchOptions = {}): SearchHit[] {
  const test = compileQuery(query);
  if (!test) return [];
  const limit = options.limit ?? DEFAULT_LIMIT;
  const hits: SearchHit[] = [];

  const walk = (node: SearchNode, path: string[], rootId: string) => {
    if (hits.length >= limit) return;
    const here = [...path, node.name];

    const folderAt = test(node.name);
    if (folderAt >= 0) {
      hits.push({
        id: node.id, kind: 'folder', name: node.name, path: path.join(' / '),
        collectionId: rootId, field: 'folder', context: node.name,
      });
    }

    for (const request of node.requests) {
      if (hits.length >= limit) return;
      for (const { field, text } of fieldsOf(request)) {
        const at = test(text);
        if (at < 0) continue;
        hits.push({
          id: request.id, kind: 'request', name: request.name,
          method: request.method, url: request.url,
          path: here.join(' / '), collectionId: rootId,
          field, context: contextAt(text, at),
        });
        break;   // First field only.
      }
    }

    for (const child of node.children) walk(child, here, rootId);
  };

  for (const root of nodes) walk(root, [], root.id);
  return hits;
}
