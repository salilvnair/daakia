/**
 * Import from a Swagger / OpenAPI URL — the host half of the wizard.
 *
 *   openapiUrl:fetch  { reqId, url, headers? }  → openapiUrl:outline
 *   openapiUrl:import { reqId, token, plan }    → openapiUrl:imported
 *
 * The fetched spec stays here, under the token the outline carries; the
 * webview only ever holds the outline and sends back an arrangement. A few
 * recent specs are kept so Back-and-Create, or a second import of the same
 * fetch, does not need the network again.
 */
import { randomUUID } from 'crypto';
import {
  upsertCollection, updateCollectionData, upsertCollectionRequest, reorderCollections,
  getCollectionTree, upsertEnvironment,
} from '../../../storage/db';
import { encryptIfUnlocked } from '../../../services/vault';
import { fetchSpec } from '../../../services/openapi-url/spec-fetch';
import { parseSpec, outlineSpec, type SpecOutline } from '../../../services/openapi-url/spec-outline';
import { buildCollection, type ImportPlan } from '../../../services/openapi-url/spec-build';
import type { OpenAPISpec } from '../../../services/openapi-importer';
import { handleGetEnvironments } from './environment-handler';

type PostMessage = (msg: unknown) => void;

const recent = new Map<string, { spec: OpenAPISpec; outline: SpecOutline }>();
const KEEP = 4;

export async function handleOpenApiUrlFetch(msg: Record<string, unknown>, postMessage: PostMessage) {
  const reqId = msg.reqId;
  try {
    const headers: Record<string, string> = {};
    for (const h of (msg.headers as { key?: string; value?: string }[] | undefined) ?? []) {
      if (h?.key?.trim()) headers[h.key.trim()] = String(h.value ?? '');
    }
    const fetched = await fetchSpec(String(msg.url ?? ''), headers);
    const { spec, format } = parseSpec(fetched.text);
    const outline = outlineSpec(spec, format, fetched.specUrl);
    const token = randomUUID();
    recent.set(token, { spec, outline });
    while (recent.size > KEEP) recent.delete(recent.keys().next().value as string);
    postMessage({
      type: 'openapiUrl:outline', reqId, ok: true, token, outline,
      fetched: { specUrl: fetched.specUrl, status: fetched.status, bytes: fetched.bytes, ms: fetched.ms, foundFromUi: fetched.foundFromUi },
    });
  } catch (err) {
    postMessage({ type: 'openapiUrl:outline', reqId, ok: false, error: err instanceof Error ? err.message : 'Could not fetch that URL.' });
  }
}

export function handleOpenApiUrlImport(msg: Record<string, unknown>, postMessage: PostMessage) {
  const reqId = msg.reqId;
  const held = recent.get(String(msg.token ?? ''));
  if (!held) {
    postMessage({ type: 'openapiUrl:imported', reqId, ok: false, error: 'The fetched spec is no longer held — fetch it again.' });
    return;
  }
  try {
    const built = buildCollection(held.spec, held.outline, msg.plan as ImportPlan);

    upsertCollection(built.root.id, built.root.name, null, 'rest');
    updateCollectionData(built.root.id, JSON.stringify(built.root.data));
    // Parents before children, whatever order the wizard listed them in.
    const pending = [...built.folders];
    const placed = new Set<string>([built.root.id]);
    while (pending.length) {
      const i = pending.findIndex(f => placed.has(f.parentId));
      const [f] = pending.splice(i === -1 ? 0 : i, 1);
      upsertCollection(f.id, f.name, f.parentId, 'rest');
      placed.add(f.id);
    }
    reorderCollections(built.folders.map(f => f.id));
    for (const r of built.requests) {
      upsertCollectionRequest({
        id: r.id, collection_id: r.folderId, name: r.name, method: r.method, url: r.url,
        data: JSON.stringify(r.data), sort_order: r.sortOrder,
      });
    }
    for (const env of built.environments) {
      const variables = env.variables.map(v => v.isSecret
        ? { ...v, initialValue: encryptIfUnlocked(v.initialValue), currentValue: encryptIfUnlocked(v.currentValue) }
        : v);
      upsertEnvironment({ id: env.id, name: env.name, variables: JSON.stringify(variables), is_active: 0 });
    }

    postMessage({ type: 'collectionsData', protocol: 'rest', collections: getCollectionTree('rest') });
    if (built.environments.length) handleGetEnvironments(postMessage);
    postMessage({
      type: 'openapiUrl:imported', reqId, ok: true,
      collectionId: built.root.id, name: built.root.name,
      requestCount: built.requests.length, folderCount: built.folders.length,
      environments: built.environments.map(e => e.name),
    });
  } catch (err) {
    postMessage({ type: 'openapiUrl:imported', reqId, ok: false, error: err instanceof Error ? err.message : 'The import failed.' });
  }
}
