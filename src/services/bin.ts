/**
 * Bin — soft-delete/restore for the 4 data categories git-sync also covers:
 * History, Collections (+ their requests), Mock Servers, Environments. Every
 * "delete" action in those categories snapshots the full row (or, for
 * collections, the full subtree) into `trash_bin` before actually deleting it,
 * so it can be restored byte-for-byte. Entries auto-expire after 30 days
 * (`purgeExpiredTrash`, called on extension activation).
 *
 * Deliberately out of scope: audit logs, cookies, AI conversations, script
 * console logs, ui_audit — those stay hard-deleted, unchanged from before.
 */
import {
  insertTrashEntry, getTrashEntries, getTrashEntry, getTrashGroup, getTrashCounts,
  deleteTrashEntry, deleteTrashGroup, emptyTrash, purgeExpiredTrash, type TrashEntry, type TrashCategory,
  getHistoryById, getHistory, clearHistory, deleteHistoryById, insertHistoryIfNew, type HistoryRow,
  getCollectionSubtree, deleteCollection, upsertCollection, upsertCollectionRequest,
  getCollectionRequestById, deleteCollectionRequest, getAllCollections, type CollectionTreeNode, type CollectionRequestRow,
  getAllEnvironments, upsertEnvironment, deleteEnvironment, type EnvironmentRow,
} from '../storage/db';
import { loadSavedConfigs, saveConfigs } from '../mock/mock-server-manager';
import type { MockServerConfig } from '../mock/mock-types';

export { getTrashEntries, getTrashCounts, purgeExpiredTrash };
export type { TrashEntry, TrashCategory };

// ─── History ────────────────────────────────────────────────────────────────

export function archiveHistoryEntry(id: number): boolean {
  const row = getHistoryById(id);
  if (!row) return false;
  insertTrashEntry('history', String(id), `${row.method} ${row.url}`, row);
  deleteHistoryById(id);
  return true;
}

/** Snapshots every row matching the same scope `clearHistory` would delete, as one group. */
export function archiveHistoryBatch(protocol?: string): number {
  const rows = getHistory(1_000_000, 0, protocol);
  if (rows.length === 0) return 0;
  const groupId = crypto.randomUUID();
  for (const row of rows) {
    insertTrashEntry('history', String(row.id), `${row.method} ${row.url}`, row, groupId);
  }
  clearHistory(protocol);
  return rows.length;
}

function restoreHistoryRow(entry: TrashEntry): void {
  const row = JSON.parse(entry.data) as HistoryRow;
  insertHistoryIfNew(row);
}

// ─── Collections ────────────────────────────────────────────────────────────

export function archiveCollection(id: string): boolean {
  const subtree = getCollectionSubtree(id);
  if (!subtree) return false;
  insertTrashEntry('collection', id, subtree.name, subtree, crypto.randomUUID());
  deleteCollection(id);
  return true;
}

export function archiveCollectionRequest(id: string): boolean {
  const req = getCollectionRequestById(id);
  if (!req) return false;
  insertTrashEntry('collection_request', id, req.name, req);
  deleteCollectionRequest(id);
  return true;
}

function restoreCollectionNode(node: CollectionTreeNode & { protocol?: string }, existingIds: Set<string>): void {
  const parentId = node.parent_id && existingIds.has(node.parent_id) ? node.parent_id : null;
  upsertCollection(node.id, node.name, parentId, node.protocol);
  existingIds.add(node.id);
  for (const req of node.requests) {
    upsertCollectionRequest({ ...req, collection_id: node.id });
  }
  for (const child of node.children) {
    restoreCollectionNode(child, existingIds);
  }
}

function restoreCollectionEntry(entry: TrashEntry): void {
  const subtree = JSON.parse(entry.data) as CollectionTreeNode & { protocol?: string };
  const existingIds = new Set(getAllCollections().map(c => c.id));
  restoreCollectionNode(subtree, existingIds);
}

function restoreCollectionRequestEntry(entry: TrashEntry): void {
  const req = JSON.parse(entry.data) as CollectionRequestRow;
  // The parent collection may have been deleted (and not restored) since — skip re-attaching an
  // orphaned request rather than violate the FK.
  const parentExists = getAllCollections().some(c => c.id === req.collection_id);
  if (parentExists) upsertCollectionRequest(req);
}

// ─── Mock Servers ───────────────────────────────────────────────────────────
//
// No dedicated DELETE — saveConfigs() always overwrites the whole file. Diff the
// incoming array against what's currently saved and archive whatever ids disappeared.

export function archiveDroppedMockServers(nextConfigs: MockServerConfig[]): number {
  const current = loadSavedConfigs();
  const nextIds = new Set(nextConfigs.map(c => c.id));
  const dropped = current.filter(c => !nextIds.has(c.id));
  if (dropped.length === 0) return 0;
  const groupId = dropped.length > 1 ? crypto.randomUUID() : undefined;
  for (const cfg of dropped) {
    insertTrashEntry('mock_server', cfg.id, cfg.name, cfg, groupId);
  }
  return dropped.length;
}

function restoreMockServerEntry(entry: TrashEntry): void {
  const cfg = JSON.parse(entry.data) as MockServerConfig;
  const current = loadSavedConfigs();
  if (current.some(c => c.id === cfg.id)) return; // already present — nothing to do
  saveConfigs([...current, cfg]);
}

// ─── Environments ───────────────────────────────────────────────────────────
//
// Same shape as Mock Servers — handleSaveEnvironments diffs the incoming array
// against the DB and calls deleteEnvironment() for whatever's missing. Call this
// right before that delete, from the same diff loop.

export function archiveEnvironment(row: EnvironmentRow): void {
  insertTrashEntry('environment', row.id, row.name, row);
}

function restoreEnvironmentEntry(entry: TrashEntry): void {
  const row = JSON.parse(entry.data) as EnvironmentRow;
  const exists = getAllEnvironments().some(e => e.id === row.id);
  if (exists) return;
  upsertEnvironment({ id: row.id, name: row.name, variables: row.variables, is_active: 0 });
}

// ─── Restore / permanent-delete dispatch ───────────────────────────────────

const RESTORERS: Record<TrashCategory, (entry: TrashEntry) => void> = {
  history: restoreHistoryRow,
  collection: restoreCollectionEntry,
  collection_request: restoreCollectionRequestEntry,
  mock_server: restoreMockServerEntry,
  environment: restoreEnvironmentEntry,
};

/** Restores one bin entry and removes it from the bin. Returns false if the entry doesn't exist. */
export function restoreEntry(id: string): boolean {
  const entry = getTrashEntry(id);
  if (!entry) return false;
  RESTORERS[entry.category](entry);
  deleteTrashEntry(id);
  return true;
}

/** Restores every entry sharing a group_id (e.g. a whole "clear history" sweep, or every request
 * under one deleted collection) in one action, oldest first so parents restore before children. */
export function restoreGroup(groupId: string): number {
  const entries = getTrashGroup(groupId);
  for (const entry of entries) {
    RESTORERS[entry.category](entry);
  }
  if (entries.length > 0) deleteTrashGroup(groupId);
  return entries.length;
}

export function permanentlyDelete(id: string): void {
  deleteTrashEntry(id);
}

export function permanentlyDeleteGroup(groupId: string): void {
  deleteTrashGroup(groupId);
}

export function emptyBin(category?: TrashCategory): void {
  emptyTrash(category);
}
