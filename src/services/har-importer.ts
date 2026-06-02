/**
 * HAR (HTTP Archive) Importer
 *
 * Parses a HAR 1.2 JSON file and imports entries as a collection in Daakia's
 * SQLite collection store. Groups requests by domain into folders.
 */
import { randomUUID } from 'crypto';
import { upsertCollection, upsertCollectionRequest, type CollectionRequestRow } from '../storage/db';
import type { ImportResult } from './import-types';

// ─── HAR 1.2 Types (subset) ─────────────────────────────────────────────────

interface HarNameValue {
  name: string;
  value: string;
}

interface HarPostData {
  mimeType?: string;
  text?: string;
  params?: HarNameValue[];
}

interface HarRequest {
  method: string;
  url: string;
  httpVersion?: string;
  headers: HarNameValue[];
  queryString: HarNameValue[];
  postData?: HarPostData;
  cookies?: HarNameValue[];
}

interface HarEntry {
  request: HarRequest;
  response?: {
    status: number;
    statusText?: string;
    headers?: HarNameValue[];
    content?: { size?: number; mimeType?: string; text?: string };
  };
  time?: number;
  startedDateTime?: string;
}

interface HarLog {
  version?: string;
  creator?: { name?: string; version?: string };
  entries: HarEntry[];
  pages?: unknown[];
}

interface HarFile {
  log: HarLog;
}

// ─── Detection ───────────────────────────────────────────────────────────────

/** Returns true if the content looks like a HAR file */
export function isHarFile(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return !!(parsed.log && Array.isArray(parsed.log.entries));
  } catch {
    return false;
  }
}

// ─── Parser ──────────────────────────────────────────────────────────────────

/** Skip common non-API resources */
const SKIP_EXTENSIONS = /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map|webp|avif)(\?|$)/i;
const SKIP_MIMETYPES = /^(image|font|text\/css|text\/javascript|application\/javascript)/i;

function shouldSkipEntry(entry: HarEntry): boolean {
  const url = entry.request.url;
  if (SKIP_EXTENSIONS.test(url)) return true;
  const responseType = entry.response?.content?.mimeType ?? '';
  if (SKIP_MIMETYPES.test(responseType)) return true;
  return false;
}

function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return 'unknown';
  }
}

function getPathName(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname || '/';
  } catch {
    return url;
  }
}

function mapHeaders(headers: HarNameValue[]): { key: string; value: string; enabled: boolean }[] {
  // Skip pseudo-headers and common browser headers
  const skipHeaders = new Set([
    ':method', ':path', ':scheme', ':authority', ':status',
    'accept-encoding', 'connection', 'sec-ch-ua', 'sec-ch-ua-mobile',
    'sec-ch-ua-platform', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site',
    'upgrade-insecure-requests', 'user-agent', 'cookie', 'referer',
  ]);
  return headers
    .filter(h => !skipHeaders.has(h.name.toLowerCase()))
    .map(h => ({ key: h.name, value: h.value, enabled: true }));
}

function mapParams(queryString: HarNameValue[]): { key: string; value: string; enabled: boolean }[] {
  return queryString.map(q => ({ key: q.name, value: q.value, enabled: true }));
}

function mapBody(postData: HarPostData | undefined): { bodyMode: string; bodyRaw: string; bodyFormData: object[]; bodyUrlEncoded: object[] } {
  if (!postData) return { bodyMode: 'none', bodyRaw: '', bodyFormData: [], bodyUrlEncoded: [] };

  const mime = (postData.mimeType ?? '').toLowerCase();

  if (mime.includes('application/json')) {
    return { bodyMode: 'json', bodyRaw: postData.text ?? '', bodyFormData: [], bodyUrlEncoded: [] };
  }

  if (mime.includes('application/x-www-form-urlencoded')) {
    if (postData.params && postData.params.length > 0) {
      return {
        bodyMode: 'x-www-form-urlencoded',
        bodyRaw: '',
        bodyFormData: [],
        bodyUrlEncoded: postData.params.map(p => ({ key: p.name, value: p.value, enabled: true })),
      };
    }
    return { bodyMode: 'x-www-form-urlencoded', bodyRaw: postData.text ?? '', bodyFormData: [], bodyUrlEncoded: [] };
  }

  if (mime.includes('multipart/form-data')) {
    if (postData.params && postData.params.length > 0) {
      return {
        bodyMode: 'form-data',
        bodyRaw: '',
        bodyFormData: postData.params.map(p => ({ key: p.name, value: p.value, type: 'text', enabled: true })),
        bodyUrlEncoded: [],
      };
    }
  }

  if (mime.includes('xml') || mime.includes('text/xml')) {
    return { bodyMode: 'raw', bodyRaw: postData.text ?? '', bodyFormData: [], bodyUrlEncoded: [] };
  }

  // Default: raw
  return { bodyMode: 'raw', bodyRaw: postData.text ?? '', bodyFormData: [], bodyUrlEncoded: [] };
}

function extractAuth(headers: HarNameValue[]): { authType: string; authData: Record<string, string> } {
  const authHeader = headers.find(h => h.name.toLowerCase() === 'authorization');
  if (!authHeader) return { authType: 'none', authData: {} };

  const value = authHeader.value;
  if (value.toLowerCase().startsWith('bearer ')) {
    return { authType: 'bearer', authData: { token: value.slice(7) } };
  }
  if (value.toLowerCase().startsWith('basic ')) {
    try {
      const decoded = Buffer.from(value.slice(6), 'base64').toString('utf-8');
      const [username, ...rest] = decoded.split(':');
      return { authType: 'basic', authData: { username, password: rest.join(':') } };
    } catch {
      return { authType: 'bearer', authData: { token: value.slice(6) } };
    }
  }

  return { authType: 'none', authData: {} };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse and import a HAR JSON string into the database as a collection.
 * Groups requests by domain into folders. Skips static assets.
 */
export function importHarFile(jsonContent: string): ImportResult {
  try {
    const parsed: HarFile = JSON.parse(jsonContent);

    if (!parsed.log || !Array.isArray(parsed.log.entries)) {
      return { success: false, collectionName: '', requestCount: 0, error: 'Not a valid HAR file (missing log.entries)' };
    }

    // Filter out static assets
    const entries = parsed.log.entries.filter(e => !shouldSkipEntry(e));

    if (entries.length === 0) {
      return { success: false, collectionName: '', requestCount: 0, error: 'No API requests found in HAR file (only static assets)' };
    }

    // Collection name from creator or generic
    const creatorName = parsed.log.creator?.name ?? 'Browser';
    const collectionName = `HAR Import (${creatorName})`;
    const collectionId = randomUUID();
    upsertCollection(collectionId, collectionName, null);

    // Group entries by domain
    const domainMap = new Map<string, HarEntry[]>();
    for (const entry of entries) {
      const domain = getDomain(entry.request.url);
      if (!domainMap.has(domain)) domainMap.set(domain, []);
      domainMap.get(domain)!.push(entry);
    }

    let requestCount = 0;

    // Create folders per domain if multiple domains, otherwise flat
    if (domainMap.size > 1) {
      let folderOrder = 0;
      for (const [domain, domainEntries] of domainMap) {
        const folderId = randomUUID();
        upsertCollection(folderId, domain, collectionId);
        folderOrder++;

        for (let i = 0; i < domainEntries.length; i++) {
          importEntry(domainEntries[i], folderId, i);
          requestCount++;
        }
      }
    } else {
      // Single domain — flat structure
      for (let i = 0; i < entries.length; i++) {
        importEntry(entries[i], collectionId, i);
        requestCount++;
      }
    }

    return { success: true, collectionName, requestCount };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, collectionName: '', requestCount: 0, error: `HAR parse error: ${msg}` };
  }
}

function importEntry(entry: HarEntry, parentId: string, sortOrder: number): void {
  const req = entry.request;
  const method = req.method.toUpperCase();
  const url = req.url;
  const name = `${method} ${getPathName(url)}`;
  const headers = mapHeaders(req.headers);
  const params = mapParams(req.queryString);
  const body = mapBody(req.postData);
  const auth = extractAuth(req.headers);

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
      preRequestScript: '',
      postResponseScript: '',
    }),
    sort_order: sortOrder,
  };
  upsertCollectionRequest(requestRow);
}
