/**
 * What a collection already holds, in the shape reconciliation reads.
 *
 * ── Why a hash has to be recomputed here ──
 *
 * `data.scan.written` is the hash of what the scan wrote. Deciding whether
 * somebody has edited a request since means hashing what it holds NOW and
 * comparing. Hashing the same fields in the same order as `to-requests.ts` is
 * the whole of it, and getting that order wrong would report every request as
 * edited — which is the worst possible failure, because it turns a quiet
 * update into a screen full of conflicts nobody caused.
 *
 * So the field list lives in one place and both sides walk it.
 */

import type { ExistingRequest } from '@daakia/scan-reconcile';
import type { ScanStamp } from '../../store/scan-store';

export interface CollectionRequestRow {
  id: string;
  name: string;
  method: string;
  url: string;
  /** The JSON envelope — headers, params, body, and `scan` when a scan wrote it. */
  data?: string | Record<string, unknown>;
}

export interface CollectionNodeWithRequests {
  id: string;
  name: string;
  children?: CollectionNodeWithRequests[];
  requests?: CollectionRequestRow[];
}

/** FNV-1a, the same one `to-requests.ts` uses. Not a security function. */
export function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function parseData(data: CollectionRequestRow['data']): Record<string, unknown> {
  if (!data) return {};
  if (typeof data !== 'string') return data;
  try { return JSON.parse(data) as Record<string, unknown>; } catch { return {}; }
}

interface Row { key?: string; value?: string; enabled?: boolean }

/**
 * Hash a stored request the way the scan hashed what it wrote.
 *
 * Mirrors `toRequest` in services/scan/to-requests.ts: method, path, body,
 * then headers and params as `key=value` joined. Disabled rows count, because
 * the scan writes optional parameters unticked and that is part of what it
 * wrote.
 */
export function currentFingerprint(row: CollectionRequestRow): string {
  const d = parseData(row.data);
  const headers = (d.headers as Row[] ?? []).filter(h => h?.key);
  const params = (d.params as Row[] ?? []).filter(p => p?.key);
  const body = typeof d.bodyRaw === 'string' ? d.bodyRaw : '';

  /* The URL is stored with the variable in it; the scan hashed the bare path.
     Stripping it here keeps the two sides comparing the same string. */
  const path = row.url.replace(/^\{\{baseUrl\}\}/, '');

  return fingerprint([
    row.method,
    path,
    body,
    headers.map(h => `${h.key}=${h.value ?? ''}`).join('&'),
    params.map(p => `${p.key}=${p.value ?? ''}`).join('&'),
  ].join('|'));
}

/** Every request in a collection and its folders, flattened. */
export function flattenRequests(node: CollectionNodeWithRequests): CollectionRequestRow[] {
  return flattenOwned(node).map(o => o.row);
}

/**
 * The same, keeping the folder each request actually lives in.
 *
 * An update writes the request back, and `saveRequestToCollection` takes the
 * collection to write it to — so without this a request sitting in a folder
 * would be re-filed at the top of the collection by the act of updating it.
 */
export function flattenOwned(
  node: CollectionNodeWithRequests,
): { row: CollectionRequestRow; collectionId: string }[] {
  const out = (node.requests ?? []).map(row => ({ row, collectionId: node.id }));
  for (const child of node.children ?? []) out.push(...flattenOwned(child));
  return out;
}

/** The folder of `parent` with this name, if it has one. */
export function folderNamed(
  parent: CollectionNodeWithRequests | undefined, name: string,
): CollectionNodeWithRequests | undefined {
  return (parent?.children ?? []).find(c => c.name === name);
}

/** Find a collection by id anywhere in the tree. */
export function findNode(
  nodes: CollectionNodeWithRequests[], id: string,
): CollectionNodeWithRequests | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const inner = findNode(n.children ?? [], id);
    if (inner) return inner;
  }
  return undefined;
}

/**
 * The existing requests of one collection, ready to reconcile against.
 *
 * A request with no `scan` block was written by a person, and reconciliation
 * ignores it — but it is still returned, because "ignored" is a decision the
 * rules make rather than one this adapter should make silently.
 */
export function existingRequests(
  tree: CollectionNodeWithRequests[], collectionId: string,
): (ExistingRequest & { collectionId: string })[] {
  const node = findNode(tree, collectionId);
  if (!node) return [];
  return flattenOwned(node).map(({ row, collectionId: home }) => {
    const d = parseData(row.data);
    const scan = d.scan as ScanStamp | undefined;
    return {
      id: row.id,
      name: row.name,
      method: row.method,
      url: row.url,
      scan: scan && typeof scan.identity === 'string' ? scan : undefined,
      current: currentFingerprint(row),
      /* Where it lives now, so an update puts it back there. */
      collectionId: home,
    };
  });
}
