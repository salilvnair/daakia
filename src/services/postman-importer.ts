/**
 * Postman Collection v2.1 Importer
 *
 * Parses a Postman Collection v2.1 JSON file and imports it into Daakia's
 * SQLite collection store (folders + requests).
 */
import { randomUUID } from 'crypto';
import { upsertCollection, upsertCollectionRequest, type CollectionRequestRow } from '../storage/db';
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

function mapBody(body: PostmanBody | undefined): { bodyMode: string; bodyRaw: string; bodyFormData: object[]; bodyUrlEncoded: object[] } {
  if (!body) return { bodyMode: 'none', bodyRaw: '', bodyFormData: [], bodyUrlEncoded: [] };

  switch (body.mode) {
    case 'raw': {
      const lang = body.options?.raw?.language;
      const mode = lang === 'json' ? 'json' : 'raw';
      return { bodyMode: mode, bodyRaw: body.raw ?? '', bodyFormData: [], bodyUrlEncoded: [] };
    }
    case 'urlencoded':
      return {
        bodyMode: 'x-www-form-urlencoded',
        bodyRaw: '',
        bodyFormData: [],
        bodyUrlEncoded: (body.urlencoded ?? []).map(u => ({ key: u.key, value: u.value, enabled: !u.disabled })),
      };
    case 'formdata':
      return {
        bodyMode: 'form-data',
        bodyRaw: '',
        bodyFormData: (body.formdata ?? []).map(f => ({ key: f.key, value: f.value, type: f.type || 'text', enabled: !f.disabled })),
        bodyUrlEncoded: [],
      };
    case 'graphql':
      return {
        bodyMode: 'graphql',
        bodyRaw: JSON.stringify({ query: body.graphql?.query ?? '', variables: body.graphql?.variables ?? '' }),
        bodyFormData: [],
        bodyUrlEncoded: [],
      };
    default:
      return { bodyMode: 'none', bodyRaw: '', bodyFormData: [], bodyUrlEncoded: [] };
  }
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
      const body = mapBody(req.body);
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

    // Create root collection
    upsertCollection(collectionId, collectionName, null);

    // Import all items recursively
    const requestCount = importItems(parsed.item ?? [], collectionId);

    return { success: true, collectionName, requestCount };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown parse error';
    return { success: false, collectionName: '', requestCount: 0, error: message };
  }
}
