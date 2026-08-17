/**
 * Daakia JSON Importer — the counterpart to `handleExportCollectionDaakia`.
 *
 * Reads back the native export format (`{ version, collections }`, each node tagged
 * with its own `protocol`) and re-creates it under fresh IDs, so importing the same
 * file twice produces two independent copies rather than silently overwriting
 * whatever collection happens to already own the old exported ID.
 */
import { randomUUID } from 'crypto';
import { upsertCollection, upsertCollectionRequest, type CollectionRequestRow } from '../storage/db';
import type { ImportResult } from './import-types';

export type { ImportResult } from './import-types';

interface DaakiaNode {
  name: string;
  protocol?: string;
  children?: DaakiaNode[];
  requests?: Partial<CollectionRequestRow>[];
}

interface DaakiaExportDoc {
  version?: string;
  collections?: DaakiaNode[];
}

/** Set of every distinct protocol touched by the import — the caller uses this to
 * refresh only the sidebar panels that actually changed. */
export interface DaakiaImportResult extends ImportResult {
  protocols: string[];
}

function importNode(node: DaakiaNode, parentId: string | null, inheritedProtocol: string, protocols: Set<string>): number {
  const protocol = node.protocol || inheritedProtocol;
  protocols.add(protocol);

  const collectionId = randomUUID();
  upsertCollection(collectionId, node.name || 'Untitled', parentId, protocol);

  let count = 0;
  for (const req of node.requests ?? []) {
    upsertCollectionRequest({
      id: randomUUID(),
      collection_id: collectionId,
      name: req.name || 'Untitled Request',
      method: req.method || 'GET',
      url: req.url || '',
      data: req.data,
      sort_order: req.sort_order,
    });
    count++;
  }

  for (const child of node.children ?? []) {
    count += importNode(child, collectionId, protocol, protocols);
  }

  return count;
}

export function importDaakiaCollection(jsonContent: string): DaakiaImportResult {
  try {
    const doc = JSON.parse(jsonContent) as DaakiaExportDoc;
    if (!doc || !Array.isArray(doc.collections) || doc.collections.length === 0) {
      return { success: false, collectionName: '', requestCount: 0, protocols: [], error: 'Not a valid Daakia JSON export file' };
    }

    const protocols = new Set<string>();
    let requestCount = 0;
    const names: string[] = [];
    for (const root of doc.collections) {
      names.push(root.name || 'Imported Collection');
      requestCount += importNode(root, null, root.protocol || 'rest', protocols);
    }

    return {
      success: true,
      collectionName: names.join(', '),
      requestCount,
      protocols: [...protocols],
    };
  } catch (err: unknown) {
    return {
      success: false,
      collectionName: '',
      requestCount: 0,
      protocols: [],
      error: err instanceof Error ? err.message : 'Failed to parse file',
    };
  }
}
