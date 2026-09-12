/**
 * Insomnia v4 importer.
 *
 * Daakia could already *export* Insomnia v4 and not read it back, which is the
 * kind of asymmetry nobody notices until they try to move in the other
 * direction. This is the other half.
 *
 * Insomnia exports a flat `resources` array where the tree is expressed by
 * `parentId` pointing at another resource's `_id`, so the folders have to be
 * created before the requests that live in them — hence the two passes below.
 *
 * ```
 * {
 *   _type: "export",
 *   __export_format: 4,
 *   resources: [
 *     { _type: "workspace",     _id: "wrk_1", name: "My API" },
 *     { _type: "request_group", _id: "fld_1", parentId: "wrk_1", name: "Users" },
 *     { _type: "request",       _id: "req_1", parentId: "fld_1", method: "GET", url: "…" }
 *   ]
 * }
 * ```
 */
import { randomUUID } from 'crypto';
import { upsertCollection, upsertCollectionRequest } from '../storage/db';
import type { ImportResult } from './import-types';

interface InsomniaResource {
  _id: string;
  _type: string;
  parentId?: string | null;
  name?: string;
  method?: string;
  url?: string;
  description?: string;
  metaSortKey?: number;
  headers?: { name?: string; value?: string; disabled?: boolean }[];
  parameters?: { name?: string; value?: string; disabled?: boolean }[];
  body?: { mimeType?: string; text?: string; params?: { name?: string; value?: string }[] };
  authentication?: Record<string, unknown>;
}

interface InsomniaExport {
  _type?: string;
  __export_format?: number;
  resources?: InsomniaResource[];
}

export function isInsomniaExport(content: string): boolean {
  try {
    const doc = JSON.parse(content) as InsomniaExport;
    return doc?._type === 'export' && Array.isArray(doc.resources);
  } catch {
    return false;
  }
}

/** Insomnia's auth object into the shape Daakia's editor reads. */
function toAuth(auth: Record<string, unknown> | undefined): { authType: string; authData: Record<string, string> } {
  const type = String(auth?.type ?? 'none');
  if (!auth || type === 'none') return { authType: 'none', authData: {} };

  if (type === 'bearer') {
    return { authType: 'bearer', authData: { token: String(auth.token ?? '') } };
  }
  if (type === 'basic') {
    return { authType: 'basic', authData: { username: String(auth.username ?? ''), password: String(auth.password ?? '') } };
  }
  if (type === 'apikey') {
    return {
      authType: 'apikey',
      authData: {
        key: String(auth.key ?? ''),
        value: String(auth.value ?? ''),
        addTo: String(auth.addTo ?? 'header'),
      },
    };
  }
  /* Anything else — OAuth flows, Hawk, AWS — carries credentials we would be
     guessing at the shape of. Better to import the request with no auth and let
     the user set it than to invent a mapping that silently sends the wrong
     thing. */
  return { authType: 'none', authData: {} };
}

function toBody(body: InsomniaResource['body']): Record<string, unknown> {
  const mime = body?.mimeType ?? '';
  if (!body || (!body.text && !body.params?.length)) return { bodyMode: 'none', bodyRaw: '' };

  if (mime.includes('form-urlencoded')) {
    return {
      bodyMode: 'urlencoded',
      bodyUrlEncoded: (body.params ?? []).map(p => ({ key: p.name ?? '', value: p.value ?? '', enabled: true })),
    };
  }
  if (mime.includes('multipart')) {
    return {
      bodyMode: 'form-data',
      bodyFormData: (body.params ?? []).map(p => ({ key: p.name ?? '', value: p.value ?? '', type: 'text', enabled: true })),
    };
  }
  return {
    bodyMode: mime.includes('json') ? 'json' : 'raw',
    bodyRaw: body.text ?? '',
    bodyContentType: mime || 'text/plain',
  };
}

export function importInsomniaCollection(content: string): ImportResult {
  let doc: InsomniaExport;
  try {
    doc = JSON.parse(content) as InsomniaExport;
  } catch (err) {
    return {
      success: false, collectionName: '', requestCount: 0,
      error: err instanceof Error ? err.message : 'Could not parse that file',
    };
  }

  const resources = doc.resources ?? [];
  if (resources.length === 0) {
    return { success: false, collectionName: '', requestCount: 0, error: 'That export has nothing in it' };
  }

  /* Folders first, parents before children: a request whose folder does not
     exist yet would be orphaned to the root, which quietly flattens the tree. */
  const idMap = new Map<string, string>();
  const containers = resources.filter(r => r._type === 'workspace' || r._type === 'request_group');

  const createContainer = (res: InsomniaResource): string => {
    const existing = idMap.get(res._id);
    if (existing) return existing;

    const parentRes = containers.find(c => c._id === res.parentId);
    const parentId = parentRes ? createContainer(parentRes) : null;

    const id = randomUUID();
    idMap.set(res._id, id);
    upsertCollection(id, res.name || 'Imported', parentId, 'rest');
    return id;
  };

  for (const res of containers) createContainer(res);

  const rootName = resources.find(r => r._type === 'workspace')?.name
    ?? containers[0]?.name
    ?? 'Insomnia Import';

  /* A request whose parent is not a container we made — a corrupt export, or a
     parent we skipped — goes under a root of its own rather than being lost. */
  let orphanRoot: string | undefined;
  const rootFor = (parentId: string | null | undefined): string => {
    const mapped = parentId ? idMap.get(parentId) : undefined;
    if (mapped) return mapped;
    if (!orphanRoot) {
      orphanRoot = randomUUID();
      upsertCollection(orphanRoot, rootName, null, 'rest');
    }
    return orphanRoot;
  };

  let requestCount = 0;
  for (const res of resources) {
    if (res._type !== 'request') continue;

    const { authType, authData } = toAuth(res.authentication);
    upsertCollectionRequest({
      id: randomUUID(),
      collection_id: rootFor(res.parentId),
      name: res.name || res.url || 'Untitled Request',
      method: (res.method || 'GET').toUpperCase(),
      url: res.url || '',
      sort_order: res.metaSortKey ?? 0,
      data: JSON.stringify({
        headers: (res.headers ?? []).map(h => ({ key: h.name ?? '', value: h.value ?? '', enabled: !h.disabled })),
        params: (res.parameters ?? []).map(p => ({ key: p.name ?? '', value: p.value ?? '', enabled: !p.disabled })),
        authType,
        authData,
        docs: res.description ?? '',
        ...toBody(res.body),
      }),
    });
    requestCount++;
  }

  if (requestCount === 0) {
    return { success: false, collectionName: rootName, requestCount: 0, error: 'That export has no requests in it' };
  }
  return { success: true, collectionName: rootName, requestCount };
}
