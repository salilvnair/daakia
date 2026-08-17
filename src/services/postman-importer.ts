/**
 * Postman Collection v2.1 Importer
 *
 * Parses a Postman Collection v2.1 JSON file and imports it into Daakia's
 * SQLite collection store (folders + requests).
 */
import { randomUUID } from 'crypto';
import { upsertCollection, upsertCollectionRequest, updateCollectionData, type CollectionRequestRow } from '../storage/db';
import { resolveScript } from './script-resolver';

// ─── Postman v2.1 Types (subset) ─────────────────────────────────────────────

interface PostmanKeyValue {
  key: string;
  value: string;
  disabled?: boolean;
  description?: string;
  type?: string;
}

interface PostmanUrl {
  raw?: string;
  protocol?: string;
  host?: string[];
  path?: string[];
  query?: PostmanKeyValue[];
}

interface PostmanHeader {
  key: string;
  value: string;
  disabled?: boolean;
}

interface PostmanBody {
  mode?: 'raw' | 'urlencoded' | 'formdata' | 'file' | 'graphql';
  raw?: string;
  urlencoded?: PostmanKeyValue[];
  formdata?: PostmanKeyValue[];
  graphql?: { query?: string; variables?: string };
  options?: { raw?: { language?: string } };
}

interface PostmanAuth {
  type?: string;
  bearer?: PostmanKeyValue[];
  basic?: PostmanKeyValue[];
  apikey?: PostmanKeyValue[];
}

interface PostmanRequest {
  method?: string;
  header?: PostmanHeader[];
  body?: PostmanBody;
  url?: string | PostmanUrl;
  auth?: PostmanAuth;
  description?: string;
}

interface PostmanScript {
  exec?: string[];
  type?: string;
}

interface PostmanEvent {
  listen?: 'prerequest' | 'test';
  script?: PostmanScript;
}

interface PostmanItem {
  name?: string;
  item?: PostmanItem[]; // sub-folder
  request?: PostmanRequest;
  event?: PostmanEvent[];
}

interface PostmanCollection {
  info?: {
    name?: string;
    schema?: string;
    _postman_id?: string;
  };
  item?: PostmanItem[];
  variable?: PostmanKeyValue[];
  auth?: PostmanAuth;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

function resolveUrl(url: string | PostmanUrl | undefined): string {
  if (!url) return '';
  if (typeof url === 'string') return url;
  return url.raw ?? '';
}

function mapHeaders(headers: PostmanHeader[] | undefined): { key: string; value: string; enabled: boolean }[] {
  if (!headers) return [];
  return headers.map(h => ({ key: h.key, value: h.value, enabled: !h.disabled }));
}

function mapParams(url: string | PostmanUrl | undefined): { key: string; value: string; enabled: boolean }[] {
  if (!url || typeof url === 'string') return [];
  return (url.query ?? []).map(q => ({ key: q.key, value: q.value, enabled: !q.disabled }));
}

type MappedBody = { bodyMode: string; bodyRaw: string; bodyContentType: string; bodyFormData: object[]; bodyUrlEncoded: object[] };

const EMPTY_BODY: MappedBody = { bodyMode: 'none', bodyRaw: '', bodyContentType: 'application/json', bodyFormData: [], bodyUrlEncoded: [] };

/** Postman's `options.raw.language` → our body mode + wire Content-Type. */
const RAW_LANGUAGE_MAP: Record<string, { mode: string; contentType: string }> = {
  json:       { mode: 'json', contentType: 'application/json' },
  xml:        { mode: 'raw',  contentType: 'application/xml' },
  html:       { mode: 'raw',  contentType: 'text/html' },
  javascript: { mode: 'raw',  contentType: 'application/javascript' },
  graphql:    { mode: 'json', contentType: 'application/json' },
  text:       { mode: 'raw',  contentType: 'text/plain' },
};

function looksLikeJson(raw: string): boolean {
  const t = raw.trim();
  if (!(t.startsWith('{') && t.endsWith('}')) && !(t.startsWith('[') && t.endsWith(']'))) return false;
  try { JSON.parse(t); return true; } catch { return false; }
}

/**
 * @param headers the request's own headers — an explicit `Content-Type` there is the
 *        strongest signal of intent and beats every guess below.
 */
function mapBody(body: PostmanBody | undefined, headers: { key: string; value: string }[] = []): MappedBody {
  if (!body) return { ...EMPTY_BODY };

  const declaredType = headers.find(h => h.key?.toLowerCase() === 'content-type')?.value?.split(';')[0]?.trim();

  switch (body.mode) {
    case 'raw': {
      const raw = body.raw ?? '';
      const lang = body.options?.raw?.language?.toLowerCase();
      const mapped = lang ? RAW_LANGUAGE_MAP[lang] : undefined;

      // Order matters. Exports produced by older Postman versions, by `newman`, or by
      // hand very often carry NO options.raw.language at all — the previous code sent
      // every one of those as bodyMode 'raw' + Content-Type text/plain, so a perfectly
      // good JSON payload arrived at the server as plain text and came back rejected
      // ("cannot consume", 415, 422 Unprocessable Entity). Trust, in order:
      //   1. an explicit Content-Type header on the request
      //   2. Postman's declared raw language
      //   3. what the payload actually parses as
      let mode: string;
      let contentType: string;
      if (declaredType) {
        contentType = declaredType;
        mode = declaredType.includes('json') ? 'json' : 'raw';
      } else if (mapped) {
        mode = mapped.mode;
        contentType = mapped.contentType;
      } else if (looksLikeJson(raw)) {
        mode = 'json';
        contentType = 'application/json';
      } else {
        mode = 'raw';
        contentType = 'text/plain';
      }
      return { bodyMode: mode, bodyRaw: raw, bodyContentType: contentType, bodyFormData: [], bodyUrlEncoded: [] };
    }
    case 'urlencoded':
      return {
        bodyMode: 'x-www-form-urlencoded',
        bodyRaw: '',
        bodyContentType: 'application/x-www-form-urlencoded',
        bodyFormData: [],
        bodyUrlEncoded: (body.urlencoded ?? []).map(u => ({ id: randomUUID(), key: u.key, value: u.value, enabled: !u.disabled })),
      };
    case 'formdata':
      return {
        bodyMode: 'form-data',
        bodyRaw: '',
        bodyContentType: 'multipart/form-data',
        bodyFormData: (body.formdata ?? []).map(f => ({ id: randomUUID(), key: f.key, value: f.value, type: f.type || 'text', enabled: !f.disabled })),
        bodyUrlEncoded: [],
      };
    case 'graphql':
      // Imported as JSON, not as bodyMode 'graphql'. Postman collections land in a REST
      // collection, and the REST executor has no 'graphql' branch — it left `data`
      // undefined, so the request went out with no entity body at all. A GraphQL POST is
      // an ordinary application/json request carrying {query, variables}, which is
      // exactly what this produces and exactly what Postman puts on the wire.
      return {
        bodyMode: 'json',
        bodyRaw: JSON.stringify({ query: body.graphql?.query ?? '', variables: parseGraphqlVariables(body.graphql?.variables) }, null, 2),
        bodyContentType: 'application/json',
        bodyFormData: [],
        bodyUrlEncoded: [],
      };
    // 'file' is intentionally not mapped: Postman stores only a local path
    // (body.file.src) from the exporting machine, which by definition does not exist
    // here. Fabricating a binary body from a dead path would fail at send time with a
    // far more confusing error than an empty body.
    default:
      return { ...EMPTY_BODY };
  }
}

/** Postman stores graphql variables as a JSON *string*; emit a real object when it parses. */
function parseGraphqlVariables(vars: string | undefined): unknown {
  if (!vars || !vars.trim()) return {};
  try { return JSON.parse(vars); } catch { return vars; }
}

function mapAuth(auth: PostmanAuth | undefined): { authType: string; authData: Record<string, string> } {
  if (!auth || !auth.type || auth.type === 'noauth') return { authType: 'none', authData: {} };

  switch (auth.type) {
    case 'bearer': {
      const token = auth.bearer?.find(k => k.key === 'token')?.value ?? '';
      return { authType: 'bearer', authData: { token } };
    }
    case 'basic': {
      const username = auth.basic?.find(k => k.key === 'username')?.value ?? '';
      const password = auth.basic?.find(k => k.key === 'password')?.value ?? '';
      return { authType: 'basic', authData: { username, password } };
    }
    case 'apikey': {
      const key = auth.apikey?.find(k => k.key === 'key')?.value ?? '';
      const value = auth.apikey?.find(k => k.key === 'value')?.value ?? '';
      const inHeader = auth.apikey?.find(k => k.key === 'in')?.value ?? 'header';
      return { authType: 'api-key', authData: { key, value, addTo: inHeader } };
    }
    default:
      return { authType: 'none', authData: {} };
  }
}

function importItems(items: PostmanItem[], parentId: string): number {
  let count = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const name = item.name || 'Untitled';

    if (item.item && item.item.length > 0) {
      // It's a folder
      const folderId = randomUUID();
      upsertCollection(folderId, name, parentId);
      count += importItems(item.item, folderId);
    } else if (item.request) {
      // It's a request
      const req = item.request;
      const method = (req.method ?? 'GET').toUpperCase();
      const url = resolveUrl(req.url);
      const headers = mapHeaders(req.header);
      const params = mapParams(req.url);
      const body = mapBody(req.body, headers);
      const auth = mapAuth(req.auth);

      // Extract scripts from events and convert pm.* → dk.*
      const rawPreScript = item.event
        ?.find(e => e.listen === 'prerequest')
        ?.script?.exec?.join('\n') ?? '';
      const rawPostScript = item.event
        ?.find(e => e.listen === 'test')
        ?.script?.exec?.join('\n') ?? '';
      const preRequestScript = resolveScript(rawPreScript, 'postman');
      const postResponseScript = resolveScript(rawPostScript, 'postman');

      const requestRow: CollectionRequestRow = {
        id: randomUUID(),
        collection_id: parentId,
        name,
        method,
        url,
        data: JSON.stringify({
          headers,
          params,
          ...body,
          ...auth,
          preRequestScript,
          postResponseScript,
        }),
        sort_order: i,
      };
      upsertCollectionRequest(requestRow);
      count++;
    }
  }
  return count;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type { ImportResult } from './import-types';
import type { ImportResult } from './import-types';

/**
 * Parse and import a Postman Collection v2.1 JSON string into the database.
 * Returns the result including collection name and request count.
 */
export function importPostmanCollection(jsonContent: string): ImportResult {
  try {
    const parsed: PostmanCollection = JSON.parse(jsonContent);

    // Validate it's a Postman collection
    const schema = parsed.info?.schema ?? '';
    if (!schema.includes('collection') && !parsed.item) {
      return { success: false, collectionName: '', requestCount: 0, error: 'Not a valid Postman Collection v2.1 file' };
    }

    const collectionName = parsed.info?.name ?? 'Imported Collection';
    const collectionId = randomUUID();

    // Create root collection — Postman collections are always REST-shaped.
    upsertCollection(collectionId, collectionName, null, 'rest');

    // Collection-level variables and auth. `parsed.variable` / `parsed.auth` were being
    // parsed into the interface and then silently dropped, so a collection whose requests
    // all point at {{baseUrl}} imported with nothing to resolve it — every request then
    // fired at a literal "{{baseUrl}}/path" URL and came back as a server-side error.
    // Shape must match CollectionPropsCache in webview-ui/src/store/collections-store.ts,
    // which is what `getCollectionProperties` reads back.
    const collectionAuth = mapAuth(parsed.auth);
    updateCollectionData(collectionId, JSON.stringify({
      headers: [],
      authType: collectionAuth.authType,
      authData: collectionAuth.authData,
      variables: (parsed.variable ?? []).map(v => ({ key: v.key, value: v.value ?? '', enabled: !v.disabled })),
      preRequestScript: '',
      postResponseScript: '',
    }));

    // Import all items recursively
    const requestCount = importItems(parsed.item ?? [], collectionId);

    return { success: true, collectionName, requestCount };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown parse error';
    return { success: false, collectionName: '', requestCount: 0, error: message };
  }
}
