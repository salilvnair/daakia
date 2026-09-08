/**
 * Collection handlers — CRUD, tree operations, runner.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
// The CLI's own parser, so a file that iterates fifty rows in a pipeline
// iterates the same fifty rows here.
// @ts-expect-error — plain ESM JavaScript shipped with the CLI; types in data.d.mts.
import { parseDataFile } from '../../../../cli/lib/data.mjs';
import {
  getCollectionTree, getCollectionChildren, getCollectionBreadcrumb,
  upsertCollection, moveCollection,
  getCollectionData, updateCollectionData, duplicateCollection, duplicateCollectionRequest,
  reorderCollections, moveRequest, reorderRequests,
  upsertCollectionRequest, renameCollectionRequest,
} from '../../../storage/db';
import { runCollection as runCollectionService, type RunConfig } from '../../../services/collection-runner';
import { archiveCollection, archiveCollectionRequest } from '../../../services/bin';
import { searchTree, type SearchNode } from '../../../services/collection-search';
import { importAnyCollection } from '../../../services/import-any';

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
  archiveCollection(id);
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
  const request = msg.request as {
    id: string; name: string; method: string; url: string; data?: string;
    status?: number; statusText?: string; responseTime?: number; responseSize?: number; responseData?: string;
  };
  const protocol = msg.protocol as string | undefined;
  upsertCollectionRequest({
    id: request.id, collection_id: collectionId, name: request.name, method: request.method, url: request.url, data: request.data,
    status: request.status, status_text: request.statusText, response_time: request.responseTime, response_size: request.responseSize, response_data: request.responseData,
  });
  handleGetCollections(postMessage, protocol);
}

export function handleDeleteRequestFromCollection(msg: Record<string, unknown>, postMessage: PostMessage) {
  const requestId = msg.requestId as string;
  const protocol = msg.protocol as string | undefined;
  archiveCollectionRequest(requestId);
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
    archiveCollection(collection.id);
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

// ────────────────── Search across every collection ──────────────────

/**
 * One search over every protocol's collections.
 *
 * Host-side because the answer needs the request blobs — headers, bodies,
 * docs — and the webview holds only the tree it is showing. `getCollectionTree()`
 * with no protocol is every collection there is, which is the point.
 */
export function handleSearchCollections(msg: Record<string, unknown>, postMessage: PostMessage) {
  const query = String(msg.query ?? '');
  const hits = searchTree(getCollectionTree() as unknown as SearchNode[], query, { limit: 300 });
  postMessage({ type: 'collectionSearchResults', query, hits });
}

// ────────────────── Collection Runner ──────────────────

let runAbortSignal: { aborted: boolean } = { aborted: false };

/**
 * Choose a CSV or JSON data file for a run.
 *
 * The host reads it, because the webview cannot: it parses with the same
 * module `daakia-run` uses in CI, so a file that iterates fifty rows in a
 * pipeline iterates the same fifty rows here.
 */
export async function handlePickRunData(_msg: Record<string, unknown>, postMessage: PostMessage) {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'Use as run data',
    filters: { 'Data files': ['csv', 'json'], 'All Files': ['*'] },
  });
  const uri = picked?.[0];
  if (!uri) return;

  try {
    const rows = parseDataFile(fs.readFileSync(uri.fsPath, 'utf8'), uri.fsPath);
    if (rows.length === 0) {
      postMessage({ type: 'toast', toastType: 'warning', message: 'That file has no rows.' });
      return;
    }
    /*
      Capped on the way in. A run is one HTTP request per row per request in
      the collection, so a spreadsheet somebody exported with 40,000 rows is
      not a run, it is an outage — and the number is worth saying out loud
      rather than silently truncating.
    */
    const capped = rows.slice(0, MAX_RUN_ROWS);
    postMessage({
      type: 'runDataPicked',
      fileName: path.basename(uri.fsPath),
      rows: capped,
      columns: Object.keys(capped[0] ?? {}),
      truncated: rows.length > capped.length ? rows.length : undefined,
    });
  } catch (e) {
    postMessage({
      type: 'toast', toastType: 'error',
      message: `Could not read that data file: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

/** One pass per row, so the row count is a multiplier on the whole run. */
const MAX_RUN_ROWS = 500;

export async function handleRunCollection(msg: Record<string, unknown>, postMessage: PostMessage) {
  const config: RunConfig = {
    collectionId: msg.collectionId as string,
    environmentId: (msg.environmentId as string) || undefined,
    flow: (msg.flow as 'sandwich' | 'sequential') || 'sandwich',
    delay: (msg.delay as number) || 500,
    stopOnError: (msg.stopOnError as boolean) || false,
    iterations: (msg.iterations as number) || 1,
    dataRows: Array.isArray(msg.dataRows) ? msg.dataRows as Record<string, string>[] : undefined,
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
      iterations: result.iterations ?? 1,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    postMessage({ type: 'toast', toastType: 'error', message: `Collection run failed: ${message}` });
  }
}

export function handleStopCollectionRun() {
  runAbortSignal.aborted = true;
}

// ── Import from a URL ────────────────────────────────────────────────────────

/**
 * Fetch a spec and import it.
 *
 * https only, and no redirects to anywhere else: an import URL is typed or
 * pasted, so it is exactly the shape of thing that gets pasted from somewhere
 * untrusted. A plain-http spec would travel in the clear, and following a
 * redirect off the host you named is how a URL you checked becomes a URL you
 * did not.
 *
 * The body is size-capped before it is parsed. A spec is a document; anything
 * that keeps arriving past a few megabytes is not one, and parsing it would
 * take the extension host down with it.
 */
const MAX_SPEC_BYTES = 8 * 1024 * 1024;

/**
 * A GitHub page URL points at a rendered page, not a document.
 *
 * Pasting the address bar is what people actually do, so a `blob` URL is
 * rewritten to its raw form rather than fetched as HTML and failing to parse.
 * `raw.githubusercontent.com` is left alone; it is already the document.
 *
 * A bare repository URL is deliberately not guessed at — a repo can hold any
 * number of specs and picking one for you is how the wrong collection gets
 * imported.
 */
export function toRawGitHubUrl(url: URL): { url: URL } | { error: string } {
  if (url.hostname === 'raw.githubusercontent.com') return { url };
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return { url };

  const parts = url.pathname.split('/').filter(Boolean);
  const blobAt = parts.indexOf('blob');
  if (blobAt === -1 || parts.length < blobAt + 3) {
    return {
      error: 'Point at a file on GitHub, not a repository — open the spec and copy that address.',
    };
  }
  const [owner, repo] = parts;
  const rest = parts.slice(blobAt + 1).join('/');
  return { url: new URL(`https://raw.githubusercontent.com/${owner}/${repo}/${rest}`) };
}

export async function handleImportCollectionUrl(msg: Record<string, unknown>, postMessage: PostMessage) {
  const raw = String(msg.url ?? '').trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    postMessage({ type: 'toast', toastType: 'error', message: 'That is not a URL.' });
    return;
  }

  const resolved = toRawGitHubUrl(url);
  if ('error' in resolved) {
    postMessage({ type: 'toast', toastType: 'error', message: resolved.error });
    return;
  }
  url = resolved.url;
  if (url.protocol !== 'https:') {
    postMessage({
      type: 'toast', toastType: 'error',
      message: 'Only https URLs can be imported — a spec fetched over http travels in the clear.',
    });
    return;
  }

  try {
    const res = await fetch(url.toString(), {
      redirect: 'error',
      headers: { accept: 'application/json, application/yaml, text/yaml, text/plain;q=0.9' },
    });
    if (!res.ok) {
      postMessage({ type: 'toast', toastType: 'error', message: `The server answered ${res.status}.` });
      return;
    }

    const length = Number(res.headers.get('content-length') ?? 0);
    if (length > MAX_SPEC_BYTES) {
      postMessage({ type: 'toast', toastType: 'error', message: 'That document is too large to import.' });
      return;
    }
    const text = await res.text();
    if (text.length > MAX_SPEC_BYTES) {
      postMessage({ type: 'toast', toastType: 'error', message: 'That document is too large to import.' });
      return;
    }

    const result = importAnyCollection(text);
    if (!result.success) {
      postMessage({ type: 'toast', toastType: 'error', message: `Import failed: ${result.error}` });
      return;
    }
    postMessage({ type: 'collectionsData', protocol: 'rest', collections: getCollectionTree('rest') });
    postMessage({
      type: 'toast', toastType: 'success',
      message: `Imported "${result.collectionName}" (${result.requestCount} requests)`,
    });
  } catch (err) {
    postMessage({
      type: 'toast', toastType: 'error',
      message: err instanceof Error ? err.message : 'Could not fetch that URL.',
    });
  }
}
