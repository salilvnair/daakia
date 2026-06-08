/**
 * HTTPie Session/Collection Importer (5.4.9)
 *
 * Parses HTTPie session JSON files (named sessions) and converts them to
 * Daakia collection requests. Also handles the Daakia HTTPie export format
 * (requests keyed by name with method/url/headers/body).
 *
 * HTTPie named session format:
 * {
 *   "__version__": "2",
 *   "auth": { "type": "bearer", "bearer": "token123" },
 *   "headers": { "Content-Type": "application/json" },
 *   "cookies": {},
 *   "env": { "BASE_URL": "http://localhost" }
 * }
 *
 * Daakia HTTPie export format:
 * {
 *   "__version__": "2",
 *   "requests": {
 *     "Get Users": { "method": "GET", "url": "...", "headers": {...}, "body": "...", "bodyMode": "json" }
 *   }
 * }
 */
import { randomUUID } from 'crypto';
import { upsertCollection, upsertCollectionRequest, type CollectionRequestRow } from '../storage/db';
import type { ImportResult } from './import-types';

// ─── Detection ────────────────────────────────────────────────────────────────

export function isHttpieFile(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    // Daakia HTTPie export or HTTPie named session
    return (
      parsed?.__version__ === '2' &&
      (typeof parsed.requests === 'object' || typeof parsed.headers === 'object' || typeof parsed.env === 'object')
    );
  } catch {
    return false;
  }
}

// ─── Importer ─────────────────────────────────────────────────────────────────

interface HttpieRequest {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: string | null;
  bodyMode?: string;
  auth?: { type?: string; token?: string; username?: string; password?: string; apiKeyName?: string; apiKeyValue?: string };
}

interface HttpieSession {
  __version__?: string;
  __meta__?: Record<string, string>;
  auth?: { type?: string | null; bearer?: string; username?: string; password?: string };
  headers?: Record<string, string>;
  cookies?: Record<string, unknown>;
  env?: Record<string, string>;
  // Daakia export: requests keyed by name
  requests?: Record<string, HttpieRequest>;
}

export function importHttpieCollection(content: string, collectionName = 'Imported HTTPie Collection'): ImportResult {
  let parsed: HttpieSession;
  try {
    parsed = JSON.parse(content) as HttpieSession;
  } catch {
    return { success: false, collectionName: '', requestCount: 0, error: 'Invalid JSON' };
  }

  const colId = randomUUID();
  upsertCollection(colId, collectionName, null, 'rest');
  let requestCount = 0;

  // ── Case 1: Daakia HTTPie export format (has requests object) ──────────────
  if (parsed.requests && typeof parsed.requests === 'object') {
    let i = 0;
    for (const [name, req] of Object.entries(parsed.requests)) {
      try {
        const headers = req.headers
          ? Object.entries(req.headers).map(([key, value]) => ({ key, value, enabled: true, id: randomUUID() }))
          : [];
        const params = req.params
          ? Object.entries(req.params).map(([key, value]) => ({ key, value, enabled: true, id: randomUUID() }))
          : [];

        const bodyMode = req.bodyMode || 'none';
        let authType = 'none';
        const authData: Record<string, string> = {};
        if (req.auth) {
          if (req.auth.type === 'bearer' || req.auth.token) { authType = 'bearer'; authData.token = req.auth.token || ''; }
          else if (req.auth.type === 'basic') { authType = 'basic'; authData.username = req.auth.username || ''; authData.password = req.auth.password || ''; }
          else if (req.auth.type === 'api-key') { authType = 'api-key'; authData.apiKeyName = req.auth.apiKeyName || ''; authData.apiKeyValue = req.auth.apiKeyValue || ''; }
        }

        const row: CollectionRequestRow = {
          id: randomUUID(),
          collection_id: colId,
          name,
          method: (req.method || 'GET').toUpperCase(),
          url: req.url || '',
          data: JSON.stringify({ headers, params, bodyMode, bodyRaw: req.body || '', authType, authData }),
          sort_order: i++,
        };
        upsertCollectionRequest(row);
        requestCount++;
      } catch { /* skip */ }
    }
    return { success: true, collectionName, requestCount };
  }

  // ── Case 2: Simple HTTPie named session (auth+headers, no specific requests) ──
  // Create a single "template" request using the session headers/auth
  const sessionHeaders: { key: string; value: string; enabled: boolean; id: string }[] = [];
  for (const [key, value] of Object.entries(parsed.headers || {})) {
    sessionHeaders.push({ key, value, enabled: true, id: randomUUID() });
  }

  let authType = 'none';
  const authData: Record<string, string> = {};
  if (parsed.auth?.type === 'bearer' && parsed.auth.bearer) {
    authType = 'bearer';
    authData.token = parsed.auth.bearer;
  } else if (parsed.auth?.type === 'basic') {
    authType = 'basic';
    authData.username = parsed.auth.username || '';
    authData.password = parsed.auth.password || '';
  }

  if (sessionHeaders.length > 0 || authType !== 'none') {
    const row: CollectionRequestRow = {
      id: randomUUID(),
      collection_id: colId,
      name: 'Session Request (HTTPie)',
      method: 'GET',
      url: '',
      data: JSON.stringify({ headers: sessionHeaders, params: [], bodyMode: 'none', bodyRaw: '', authType, authData }),
      sort_order: 0,
    };
    upsertCollectionRequest(row);
    requestCount++;
  }

  return { success: requestCount > 0, collectionName, requestCount, error: requestCount === 0 ? 'No requests found in HTTPie session file.' : undefined };
}
