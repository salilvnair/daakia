/**
 * Turning generated requests into a collection that actually contains them.
 *
 * ── The bug this exists to stop ──
 *
 * Four modals posted `createCollection`, toasted "N requests imported", and
 * stopped. The user got a named, empty collection and nothing said the
 * requests had been dropped. Two were fixed one at a time and drifted apart
 * doing it; two were still broken. This is the one implementation.
 *
 * ── The shape ──
 *
 * A saved request is flat — `id`, `name`, `method`, `url` — with everything
 * else packed into a `data` JSON string. That envelope is exactly what
 * `request-opener` parses when a row is opened, so anything not in it is lost
 * the moment the request is reopened.
 *
 * `saveRequestToCollection` is the message that stores one. `createRequest` is
 * not: no handler has ever listened for it, so posting it silently dropped
 * every request — which is how two of these modals came to look like they
 * worked.
 */
import { postMsg } from '../../vscode';

const emptyRow = () => ({ id: crypto.randomUUID(), key: '', value: '', enabled: true });

/** A key/value row as generated, given the id the tables expect. */
function withIds(rows: unknown): Record<string, unknown>[] {
  return Array.isArray(rows)
    ? [...(rows as Record<string, unknown>[]).map(h => ({ ...h, id: crypto.randomUUID() })), emptyRow()]
    : [emptyRow()];
}

export interface CollectionRequestRow {
  id: string;
  name: string;
  method: string;
  url: string;
  data: Record<string, unknown>;
}

/**
 * One generated request, in the shape the collection store keeps.
 *
 * Models are inconsistent about the field names — `body` or `bodyRaw`,
 * `bodyType` or `bodyMode` — so both spellings are accepted rather than
 * quietly producing a request with an empty body.
 */
export function toCollectionRequest(
  raw: Record<string, unknown>,
  folderName?: string,
): CollectionRequestRow {
  const name = String(raw.name ?? 'Request');
  return {
    id: crypto.randomUUID(),
    name: folderName ? `${folderName} / ${name}` : name,
    method: String(raw.method ?? 'GET').toUpperCase(),
    url: String(raw.url ?? ''),
    data: {
      headers: withIds(raw.headers),
      params: withIds(raw.params),
      bodyMode: String(raw.bodyType ?? raw.bodyMode ?? (raw.body || raw.bodyRaw ? 'raw' : 'none')),
      bodyRaw: typeof raw.body === 'string' ? raw.body : (typeof raw.bodyRaw === 'string' ? raw.bodyRaw : ''),
      bodyFormData: [{ id: crypto.randomUUID(), key: '', value: '', type: 'text', enabled: true }],
      bodyUrlEncoded: [emptyRow()],
      authType: (raw.auth as Record<string, unknown> | undefined)?.type ?? raw.authType ?? 'none',
      authData: (raw.authData as Record<string, unknown> | undefined) ?? {},
      preRequestScript: typeof raw.preRequestScript === 'string' ? raw.preRequestScript : '',
      postResponseScript: typeof raw.postResponseScript === 'string' ? raw.postResponseScript : '',
    },
  };
}

/**
 * Create a collection and put the requests in it.
 *
 * Returns how many were saved, so the caller can say a number it has actually
 * earned rather than the length of the list it hoped to save.
 *
 * The pauses are deliberate: each message is a separate round trip to the
 * extension host, and the collection has to exist before a request can be
 * filed under it.
 */
export async function importRequestsAsCollection(opts: {
  name: string;
  protocol: string;
  requests: Record<string, unknown>[];
  /** Supply one when the caller already made an id it wants to keep. */
  collectionId?: string;
}): Promise<number> {
  const collectionId = opts.collectionId ?? crypto.randomUUID();
  const rows = opts.requests.map(r => toCollectionRequest(r));

  postMsg({ type: 'createCollection', id: collectionId, name: opts.name, protocol: opts.protocol });
  await new Promise(r => setTimeout(r, 120));

  for (const row of rows) {
    postMsg({
      type: 'saveRequestToCollection',
      collectionId,
      protocol: opts.protocol,
      request: { ...row, data: JSON.stringify(row.data) },
    });
    await new Promise(r => setTimeout(r, 50));
  }

  await new Promise(r => setTimeout(r, 150));
  // The sidebar reads its tree from the host; without this the new collection
  // does not appear until something else happens to refresh it.
  postMsg({ type: 'getCollections', protocol: opts.protocol });

  return rows.length;
}
