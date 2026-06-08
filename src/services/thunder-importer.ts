/**
 * Thunder Client Collection Importer (6B.16)
 *
 * Parses a Thunder Client JSON export file and imports it into Daakia's
 * SQLite collection store (folders + requests).
 *
 * Thunder Client export structure:
 * {
 *   clientName: "Thunder Client",
 *   collectionName: string,
 *   folders: [{ _id, name, containerId }],
 *   requests: [{ _id, containerId, name, url, method, headers, params, body, auth }]
 * }
 */
import { randomUUID } from 'crypto';
import { upsertCollection, upsertCollectionRequest, type CollectionRequestRow } from '../storage/db';
import type { ImportResult } from './import-types';

// ─── Thunder Client Types ─────────────────────────────────────────────────────

interface TcFolder {
  _id: string;
  name: string;
  containerId?: string;
  sortNum?: number;
}

interface TcHeader {
  name: string;
  value: string;
  isDisabled?: boolean;
}

interface TcParam {
  name: string;
  value: string;
  isDisabled?: boolean;
}

interface TcBodyForm {
  name: string;
  value: string;
  isDisabled?: boolean;
  isFile?: boolean;
}

interface TcBody {
  type?: 'none' | 'json' | 'xml' | 'text' | 'graphql' | 'formdata' | 'formencoded' | 'binary';
  raw?: string;
  form?: TcBodyForm[];
}

interface TcAuth {
  type?: 'none' | 'basic' | 'bearer' | 'apikey' | 'oauth2';
  bearer?: string;
  username?: string;
  password?: string;
  key?: string;
  value?: string;
  addTo?: 'header' | 'params';
}

interface TcRequest {
  _id: string;
  colId?: string;
  containerId?: string;
  name: string;
  url: string;
  method?: string;
  sortNum?: number;
  headers?: TcHeader[];
  params?: TcParam[];
  body?: TcBody;
  auth?: TcAuth;
  preReqScript?: string;
  tests?: string;
}

interface TcCollection {
  clientName?: string;
  collectionName?: string;
  folders?: TcFolder[];
  requests?: TcRequest[];
}

// ─── Detection ────────────────────────────────────────────────────────────────

export function isThunderClientCollection(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return parsed?.clientName === 'Thunder Client';
  } catch {
    return false;
  }
}

// ─── Importer ─────────────────────────────────────────────────────────────────

export function importThunderClientCollection(content: string): ImportResult {
  let parsed: TcCollection;
  try {
    parsed = JSON.parse(content) as TcCollection;
  } catch {
    return { success: false, collectionName: '', requestCount: 0, error: 'Invalid JSON' };
  }

  if (parsed?.clientName !== 'Thunder Client') {
    return { success: false, collectionName: '', requestCount: 0, error: 'Not a Thunder Client export file' };
  }

  const collectionName = parsed.collectionName || 'Imported Thunder Client Collection';
  const collectionId = randomUUID();

  // Create root collection
  upsertCollection(collectionId, collectionName, null, 'rest');

  // Map Thunder folder IDs → Daakia collection IDs
  const folderIdMap = new Map<string, string>();

  // Create folders (parent-first order assumed; if not, second pass would be needed)
  for (const folder of (parsed.folders || [])) {
    const folderId = randomUUID();
    folderIdMap.set(folder._id, folderId);

    const parentId = folder.containerId && folder.containerId !== ''
      ? (folderIdMap.get(folder.containerId) ?? collectionId)
      : collectionId;

    upsertCollection(folderId, folder.name, parentId, 'rest');
  }

  let requestCount = 0;

  for (const req of (parsed.requests || [])) {
    try {
      const parentCollectionId = req.containerId && req.containerId !== ''
        ? (folderIdMap.get(req.containerId) ?? collectionId)
        : collectionId;

      // Headers
      const headers = (req.headers || [])
        .filter(h => !h.isDisabled)
        .map(h => ({ key: h.name, value: h.value, enabled: true, id: randomUUID() }));

      // Query params
      const params = (req.params || [])
        .filter(p => !p.isDisabled)
        .map(p => ({ key: p.name, value: p.value, enabled: true, id: randomUUID() }));

      // Body
      let bodyMode = 'none';
      let bodyRaw = '';
      let bodyContentType = '';
      const bodyFormData: { key: string; value: string; enabled: boolean; id: string }[] = [];
      const bodyUrlEncoded: { key: string; value: string; enabled: boolean; id: string }[] = [];

      if (req.body) {
        switch (req.body.type) {
          case 'json':
            bodyMode = 'json';
            bodyRaw = req.body.raw || '';
            bodyContentType = 'application/json';
            break;
          case 'xml':
            bodyMode = 'raw';
            bodyRaw = req.body.raw || '';
            bodyContentType = 'application/xml';
            break;
          case 'text':
            bodyMode = 'raw';
            bodyRaw = req.body.raw || '';
            bodyContentType = 'text/plain';
            break;
          case 'graphql':
            bodyMode = 'graphql';
            bodyRaw = req.body.raw || '';
            bodyContentType = 'application/json';
            break;
          case 'formdata':
            bodyMode = 'form-data';
            for (const f of (req.body.form || [])) {
              bodyFormData.push({ key: f.name, value: f.value, enabled: !f.isDisabled, id: randomUUID() });
            }
            break;
          case 'formencoded':
            bodyMode = 'x-www-form-urlencoded';
            for (const f of (req.body.form || [])) {
              bodyUrlEncoded.push({ key: f.name, value: f.value, enabled: !f.isDisabled, id: randomUUID() });
            }
            break;
        }
      }

      // Auth
      let authType = 'none';
      const authData: Record<string, string> = {};

      if (req.auth) {
        switch (req.auth.type) {
          case 'bearer':
            authType = 'bearer';
            authData.token = req.auth.bearer || '';
            break;
          case 'basic':
            authType = 'basic';
            authData.username = req.auth.username || '';
            authData.password = req.auth.password || '';
            break;
          case 'apikey':
            authType = 'api-key';
            authData.apiKeyName = req.auth.key || 'X-API-Key';
            authData.apiKeyValue = req.auth.value || '';
            authData.apiKeyIn = req.auth.addTo === 'params' ? 'query' : 'header';
            break;
        }
      }

      const requestRow: CollectionRequestRow = {
        id: randomUUID(),
        collection_id: parentCollectionId,
        name: req.name || req.url,
        method: (req.method || 'GET').toUpperCase(),
        url: req.url || '',
        data: JSON.stringify({
          headers,
          params,
          bodyMode,
          bodyRaw,
          bodyContentType,
          bodyFormData,
          bodyUrlEncoded,
          authType,
          authData,
          preRequestScript: req.preReqScript || '',
          postResponseScript: req.tests || '',
        }),
        sort_order: req.sortNum ?? requestCount,
      };

      upsertCollectionRequest(requestRow);
      requestCount++;
    } catch { /* skip malformed request */ }
  }

  return { success: true, collectionName, requestCount };
}
