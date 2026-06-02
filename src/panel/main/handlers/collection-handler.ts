/**
 * Collection handlers — CRUD, tree operations, runner.
 */
import {
  getCollectionTree, getCollectionChildren, getCollectionBreadcrumb,
  upsertCollection, deleteCollection as dbDeleteCollection, moveCollection,
  getCollectionData, updateCollectionData, duplicateCollection, duplicateCollectionRequest,
  reorderCollections, moveRequest, reorderRequests,
  upsertCollectionRequest, deleteCollectionRequest, renameCollectionRequest,
} from '../../../storage/db';
import { runCollection as runCollectionService, type RunConfig } from '../../../services/collection-runner';

type PostMessage = (msg: unknown) => void;

// ────────────────── CRUD ──────────────────

export function handleGetCollections(postMessage: PostMessage, protocol?: string) {
  const tree = getCollectionTree(protocol);
  postMessage({ type: 'collectionsData', collections: tree, protocol: protocol || 'rest' });
}

export function handleGetCollectionTree(postMessage: PostMessage, protocol?: string) {
  const tree = getCollectionTree(protocol);
  postMessage({ type: 'collectionTree', tree });
}

export function handleGetCollectionChildren(msg: Record<string, unknown>, postMessage: PostMessage) {
  const parentId = (msg.parentId as string) || null;
  const result = getCollectionChildren(parentId);
  postMessage({ type: 'collectionChildren', parentId, ...result });
}

export function handleGetCollectionBreadcrumb(msg: Record<string, unknown>, postMessage: PostMessage) {
  const id = msg.id as string;
  const breadcrumb = getCollectionBreadcrumb(id);
  postMessage({ type: 'collectionBreadcrumb', id, breadcrumb });
}

export function handleCreateCollection(msg: Record<string, unknown>, postMessage: PostMessage) {
  const id = msg.id as string;
  const name = msg.name as string;
  const parentId = (msg.parentId as string) || null;
  const protocol = (msg.protocol as string) || 'rest';
  upsertCollection(id, name, parentId, protocol);
  handleGetCollections(postMessage, protocol);
}

export function handleCreateFolder(msg: Record<string, unknown>, postMessage: PostMessage) {
  const id = msg.id as string;
  const name = msg.name as string;
  const parentId = (msg.parentId as string) || null;
  const protocol = (msg.protocol as string) || 'rest';
  upsertCollection(id, name, parentId, protocol);
  handleGetCollections(postMessage, protocol);
}

export function handleRenameCollection(msg: Record<string, unknown>, postMessage: PostMessage) {
  const id = msg.id as string;
  const name = msg.name as string;
  const protocol = msg.protocol as string | undefined;
  upsertCollection(id, name);
  handleGetCollections(postMessage, protocol);
}

export function handleRenameRequest(msg: Record<string, unknown>, postMessage: PostMessage) {
  const id = msg.id as string;
  const name = msg.name as string;
  const protocol = msg.protocol as string | undefined;
  renameCollectionRequest(id, name);
  handleGetCollections(postMessage, protocol);
}

export function handleDeleteCollection(msg: Record<string, unknown>, postMessage: PostMessage) {
  const id = msg.id as string;
  const protocol = msg.protocol as string | undefined;
  dbDeleteCollection(id);
  handleGetCollections(postMessage, protocol);
}

export function handleMoveCollection(msg: Record<string, unknown>, postMessage: PostMessage) {
  const id = msg.id as string;
  const newParentId = (msg.newParentId as string) || null;
  const protocol = msg.protocol as string | undefined;
  moveCollection(id, newParentId);
  handleGetCollections(postMessage, protocol);
}

export function handleSaveCollection(msg: Record<string, unknown>, postMessage: PostMessage) {
  const collection = msg.collection as { id: string; name: string; requests: { id: string; name: string; method: string; url: string; data?: string }[] };
  const protocol = (msg.protocol as string) || 'rest';
  upsertCollection(collection.id, collection.name, undefined, protocol);
  for (const req of collection.requests) {
    upsertCollectionRequest({ id: req.id, collection_id: collection.id, name: req.name, method: req.method, url: req.url, data: req.data });
  }
  handleGetCollections(postMessage, protocol);
}

export function handleSaveRequestToCollection(msg: Record<string, unknown>, postMessage: PostMessage) {
  const collectionId = msg.collectionId as string;
  const request = msg.request as { id: string; name: string; method: string; url: string; data?: string };
  const protocol = msg.protocol as string | undefined;
  upsertCollectionRequest({ id: request.id, collection_id: collectionId, name: request.name, method: request.method, url: request.url, data: request.data });
  handleGetCollections(postMessage, protocol);
}

export function handleDeleteRequestFromCollection(msg: Record<string, unknown>, postMessage: PostMessage) {
  const requestId = msg.requestId as string;
  const protocol = msg.protocol as string | undefined;
  deleteCollectionRequest(requestId);
  handleGetCollections(postMessage, protocol);
}

export function handleUpdateCollectionProperties(msg: Record<string, unknown>) {
  const id = msg.id as string;
  const properties = msg.properties as Record<string, unknown>;
  updateCollectionData(id, JSON.stringify(properties));
}

export function handleGetCollectionProperties(msg: Record<string, unknown>, postMessage: PostMessage) {
  const id = msg.id as string;
  const data = getCollectionData(id);
  postMessage({ type: 'collectionPropertiesData', id, properties: JSON.parse(data) });
}

export function handleClearCollections(postMessage: PostMessage, protocol?: string) {
  // Get only root-level collections for the specified protocol
  const tree = getCollectionTree(protocol);
  for (const collection of tree) {
    dbDeleteCollection(collection.id);
  }
  handleGetCollections(postMessage, protocol);
}

export function handleDuplicateCollection(msg: Record<string, unknown>, postMessage: PostMessage) {
  const id = msg.id as string;
  const protocol = msg.protocol as string | undefined;
  duplicateCollection(id);
  handleGetCollections(postMessage, protocol);
}

export function handleDuplicateRequest(msg: Record<string, unknown>, postMessage: PostMessage) {
  const id = msg.id as string;
  const protocol = msg.protocol as string | undefined;
  duplicateCollectionRequest(id);
  handleGetCollections(postMessage, protocol);
}

export function handleReorderCollections(msg: Record<string, unknown>, postMessage: PostMessage) {
  const ids = msg.ids as string[];
  const protocol = msg.protocol as string | undefined;
  reorderCollections(ids);
  handleGetCollections(postMessage, protocol);
}

export function handleMoveRequest(msg: Record<string, unknown>, postMessage: PostMessage) {
  const requestId = msg.requestId as string;
  const collectionId = msg.collectionId as string;
  const protocol = msg.protocol as string | undefined;
  moveRequest(requestId, collectionId);
  handleGetCollections(postMessage, protocol);
}

export function handleReorderRequests(msg: Record<string, unknown>, postMessage: PostMessage) {
  const ids = msg.ids as string[];
  const protocol = msg.protocol as string | undefined;
  reorderRequests(ids);
  handleGetCollections(postMessage, protocol);
}

// ────────────────── Collection Runner ──────────────────

let runAbortSignal: { aborted: boolean } = { aborted: false };

export async function handleRunCollection(msg: Record<string, unknown>, postMessage: PostMessage) {
  const config: RunConfig = {
    collectionId: msg.collectionId as string,
    environmentId: (msg.environmentId as string) || undefined,
    flow: (msg.flow as 'sandwich' | 'sequential') || 'sandwich',
    delay: (msg.delay as number) || 500,
    stopOnError: (msg.stopOnError as boolean) || false,
  };

  runAbortSignal = { aborted: false };

  try {
    const result = await runCollectionService(
      config,
      (requestResult, index, total) => {
        postMessage({ type: 'runCollectionProgress', result: requestResult, index, total });
      },
      runAbortSignal
    );
    postMessage({
      type: 'runCollectionComplete',
      collectionName: result.collectionName,
      flow: result.flow,
      total: result.total,
      passed: result.passed,
      failed: result.failed,
      skipped: result.skipped,
      totalTests: result.totalTests,
      passedTests: result.passedTests,
      failedTests: result.failedTests,
      duration: result.duration,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    postMessage({ type: 'toast', toastType: 'error', message: `Collection run failed: ${message}` });
  }
}

export function handleStopCollectionRun() {
  runAbortSignal.aborted = true;
}
