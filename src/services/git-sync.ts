/**
 * Git-native collection sync — keeps collections as diffable .daakia.json files
 * inside the workspace so they can be committed, reviewed, and run in CI via
 * `cli/daakia-run.mjs`.
 *
 * - Export: one `<protocol>.daakia.json` per protocol into the sync folder.
 * - Import: reads every `*.daakia.json` in the folder and upserts into SQLite.
 * - Auto mode (`daakia.gitSync.enabled`): mutations write through to the files
 *   (debounced), and a watcher imports external edits (e.g. after `git pull`).
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getCollectionTree, upsertCollection, upsertCollectionRequest, type CollectionTreeNode } from '../storage/db';

const SYNC_PROTOCOLS = ['rest', 'graphql', 'websocket', 'grpc', 'soap', 'ai', 'mcp'];

let _exporting = false;
let _exportTimer: ReturnType<typeof setTimeout> | undefined;
let _importTimer: ReturnType<typeof setTimeout> | undefined;

function config() {
  return vscode.workspace.getConfiguration('daakia');
}

export function isGitSyncEnabled(): boolean {
  return config().get<boolean>('gitSync.enabled', false);
}

/** Absolute sync folder path, or null when no workspace folder is open. */
export function getSyncFolder(): string | null {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) return null;
  return path.join(root, config().get<string>('gitSync.folder', 'daakia/collections'));
}

// ─── Export ───────────────────────────────────────────────────────────────────

/** Write every protocol's collection tree into the sync folder. Returns file count. */
export function exportCollectionsToWorkspace(): number {
  const folder = getSyncFolder();
  if (!folder) return 0;
  fs.mkdirSync(folder, { recursive: true });

  let written = 0;
  _exporting = true;
  try {
    for (const protocol of SYNC_PROTOCOLS) {
      const tree = getCollectionTree(protocol);
      const file = path.join(folder, `${protocol}.daakia.json`);
      if (tree.length === 0) {
        // remove stale file so deletions also sync
        if (fs.existsSync(file)) { fs.unlinkSync(file); }
        continue;
      }
      fs.writeFileSync(file, JSON.stringify({ version: '1.0', protocol, collections: tree }, null, 2), 'utf8');
      written++;
    }
  } finally {
    // let watcher events from our own writes settle before re-enabling import
    setTimeout(() => { _exporting = false; }, 500);
  }
  return written;
}

/** Debounced write-through used after collection mutations when auto-sync is on. */
export function scheduleAutoExport(): void {
  if (!isGitSyncEnabled()) return;
  if (_exportTimer) clearTimeout(_exportTimer);
  _exportTimer = setTimeout(() => { exportCollectionsToWorkspace(); }, 1500);
}

// ─── Import ───────────────────────────────────────────────────────────────────

function upsertTree(nodes: CollectionTreeNode[], protocol: string, parentId: string | null): number {
  let count = 0;
  for (const node of nodes) {
    upsertCollection(node.id, node.name, parentId, protocol);
    for (const req of node.requests ?? []) {
      upsertCollectionRequest({ ...req, collection_id: node.id });
      count++;
    }
    count += upsertTree(node.children ?? [], protocol, node.id);
  }
  return count;
}

/** Read every *.daakia.json in the sync folder and upsert into the DB. Returns request count. */
export function importCollectionsFromWorkspace(): number {
  const folder = getSyncFolder();
  if (!folder || !fs.existsSync(folder)) return 0;

  let total = 0;
  for (const file of fs.readdirSync(folder)) {
    if (!file.endsWith('.daakia.json')) continue;
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8')) as {
        protocol?: string;
        collections?: CollectionTreeNode[];
      };
      if (!Array.isArray(doc.collections)) continue;
      const protocol = doc.protocol || file.replace('.daakia.json', '');
      total += upsertTree(doc.collections, protocol, null);
    } catch {
      // malformed file — skip, never crash the extension
    }
  }
  return total;
}

// ─── Watcher (auto mode) ──────────────────────────────────────────────────────

/** Watch the sync folder and import external edits (e.g. git pull) when auto-sync is on. */
export function initGitSyncWatcher(context: vscode.ExtensionContext, onImported?: () => void): void {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) return;

  const pattern = new vscode.RelativePattern(root, `${config().get<string>('gitSync.folder', 'daakia/collections')}/*.daakia.json`);
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  const onFsEvent = () => {
    if (!isGitSyncEnabled() || _exporting) return;
    if (_importTimer) clearTimeout(_importTimer);
    _importTimer = setTimeout(() => {
      const n = importCollectionsFromWorkspace();
      if (n > 0) onImported?.();
    }, 1000);
  };

  watcher.onDidChange(onFsEvent);
  watcher.onDidCreate(onFsEvent);
  context.subscriptions.push(watcher);
}

/** Message types that mutate collections — used to trigger write-through. */
export const COLLECTION_MUTATION_TYPES = new Set([
  'createCollection', 'createFolder', 'renameCollection', 'renameRequest',
  'deleteCollection', 'moveCollection', 'saveCollection', 'saveRequestToCollection',
  'deleteRequestFromCollection', 'updateCollectionProperties', 'duplicateCollection',
  'duplicateRequest', 'reorderCollections', 'moveRequest', 'reorderRequests',
]);
