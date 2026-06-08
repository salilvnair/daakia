/**
 * Collection Exporter — serialize Daakia collections to external formats.
 *
 * Supported formats:
 *   - Daakia JSON (5.4.5)  — native format, lossless round-trip
 *   - Postman v2.1 (5.4.6) — compatible with Postman app import
 *   - Bruno .bru (5.4.10)  — folder structure with .bru files per request
 *   - Insomnia v4 (5.4.11) — resources array export format
 *   - HTTPie (5.4.12)      — named request objects JSON
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getCollectionTree, type CollectionTreeNode, type CollectionRequestRow } from '../storage/db';

type PostMessage = (msg: unknown) => void;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseRequestData(req: CollectionRequestRow): Record<string, unknown> {
  try { return JSON.parse(req.data || '{}'); } catch { return {}; }
}

/** Flatten tree to find the node matching a given root ID */
function findNode(tree: CollectionTreeNode[], id: string): CollectionTreeNode | undefined {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
}

/** Collect all requests from a node and its descendants */
function collectRequests(node: CollectionTreeNode): CollectionRequestRow[] {
  const reqs: CollectionRequestRow[] = [...node.requests];
  for (const child of node.children) {
    reqs.push(...collectRequests(child));
  }
  return reqs;
}

// ─── 5.4.5 — Daakia JSON ──────────────────────────────────────────────────────

export async function handleExportCollectionDaakia(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const collectionId = msg.collectionId as string;
  const tree = getCollectionTree();
  const node = collectionId ? findNode(tree, collectionId) : null;
  const toExport = node ? [node] : tree;

  const defaultName = node ? `${node.name}.daakia.json` : 'collections.daakia.json';
  const uri = await vscode.window.showSaveDialog({
    saveLabel: 'Export as Daakia JSON',
    defaultUri: vscode.Uri.file(defaultName),
    filters: { 'JSON Files': ['json'] },
  });
  if (!uri) return;

  fs.writeFileSync(uri.fsPath, JSON.stringify({ version: '1.0', collections: toExport }, null, 2), 'utf8');
  postMessage({ type: 'toast', toastType: 'success', message: `Exported to ${path.basename(uri.fsPath)}` });
}

// ─── 5.4.6 — Postman v2.1 ────────────────────────────────────────────────────

function toPostmanItem(node: CollectionTreeNode): unknown {
  const items: unknown[] = [];

  for (const child of node.children) {
    items.push(toPostmanItem(child));
  }

  for (const req of node.requests) {
    const d = parseRequestData(req);
    const headers = (d.headers as { key: string; value: string; enabled?: boolean }[] || [])
      .map(h => ({ key: h.key, value: h.value, disabled: !h.enabled }));
    const params = (d.params as { key: string; value: string; enabled?: boolean }[] || [])
      .map(p => ({ key: p.key, value: p.value, disabled: !p.enabled }));
    const auth = buildPostmanAuth(d);
    const body = buildPostmanBody(d);

    items.push({
      name: req.name,
      request: {
        method: req.method,
        header: headers,
        body,
        auth,
        url: {
          raw: req.url,
          host: [req.url.split('/')[0] + '//' + req.url.split('/')[2]].filter(Boolean),
          path: req.url.split('?')[0].split('/').slice(3).filter(Boolean),
          query: params,
        },
      },
      response: [],
      event: buildPostmanScripts(d),
    });
  }

  return { name: node.name, item: items };
}

function buildPostmanAuth(d: Record<string, unknown>): unknown {
  const authType = d.authType as string || 'none';
  const authData = d.authData as Record<string, string> || {};
  if (authType === 'bearer') return { type: 'bearer', bearer: [{ key: 'token', value: authData.token || '', type: 'string' }] };
  if (authType === 'basic') return { type: 'basic', basic: [{ key: 'username', value: authData.username || '' }, { key: 'password', value: authData.password || '' }] };
  if (authType === 'api-key') return { type: 'apikey', apikey: [{ key: 'key', value: authData.apiKeyName || '' }, { key: 'value', value: authData.apiKeyValue || '' }, { key: 'in', value: authData.apiKeyIn || 'header' }] };
  return { type: 'noauth' };
}

function buildPostmanBody(d: Record<string, unknown>): unknown {
  const mode = d.bodyMode as string || 'none';
  if (mode === 'none') return { mode: 'none' };
  if (mode === 'json' || mode === 'raw') {
    return { mode: 'raw', raw: d.bodyRaw as string || '', options: { raw: { language: mode === 'json' ? 'json' : 'text' } } };
  }
  if (mode === 'x-www-form-urlencoded') {
    return { mode: 'urlencoded', urlencoded: (d.bodyUrlEncoded as { key: string; value: string }[] || []).map(e => ({ key: e.key, value: e.value })) };
  }
  if (mode === 'form-data') {
    return { mode: 'formdata', formdata: (d.bodyFormData as { key: string; value: string }[] || []).map(e => ({ key: e.key, value: e.value, type: 'text' })) };
  }
  if (mode === 'graphql') {
    try {
      const gql = JSON.parse(d.bodyRaw as string || '{}');
      return { mode: 'graphql', graphql: { query: gql.query || '', variables: gql.variables ? JSON.stringify(gql.variables) : '' } };
    } catch {
      return { mode: 'raw', raw: d.bodyRaw as string || '' };
    }
  }
  return { mode: 'none' };
}

function buildPostmanScripts(d: Record<string, unknown>): unknown[] {
  const events: unknown[] = [];
  const pre = d.preRequestScript as string || '';
  const post = d.postResponseScript as string || '';
  if (pre.trim()) events.push({ listen: 'prerequest', script: { exec: pre.split('\n'), type: 'text/javascript' } });
  if (post.trim()) events.push({ listen: 'test', script: { exec: post.split('\n'), type: 'text/javascript' } });
  return events;
}

export async function handleExportCollectionPostman(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const collectionId = msg.collectionId as string;
  const tree = getCollectionTree();
  const node = collectionId ? findNode(tree, collectionId) : null;
  if (!node && !collectionId) {
    postMessage({ type: 'toast', toastType: 'error', message: 'No collection selected for export.' });
    return;
  }

  const toExport = node || { id: 'root', name: 'Daakia Export', parent_id: null, sort_order: 0, children: tree, requests: [] };
  const defaultName = `${toExport.name}.postman_collection.json`;

  const uri = await vscode.window.showSaveDialog({
    saveLabel: 'Export as Postman Collection',
    defaultUri: vscode.Uri.file(defaultName),
    filters: { 'JSON Files': ['json'] },
  });
  if (!uri) return;

  const postmanCollection = {
    info: {
      _postman_id: toExport.id,
      name: toExport.name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      _exporter_id: 'daakia',
    },
    item: [...toExport.children.map(toPostmanItem), ...toExport.requests.map(req => {
      const d = parseRequestData(req);
      return {
        name: req.name,
        request: { method: req.method, header: (d.headers as { key: string; value: string }[] || []).map(h => ({ key: h.key, value: h.value })), url: { raw: req.url }, auth: buildPostmanAuth(d), body: buildPostmanBody(d) },
        response: [],
        event: buildPostmanScripts(d),
      };
    })],
  };

  fs.writeFileSync(uri.fsPath, JSON.stringify(postmanCollection, null, 2), 'utf8');
  postMessage({ type: 'toast', toastType: 'success', message: `Exported as Postman collection to ${path.basename(uri.fsPath)}` });
}

// ─── 5.4.10 — Bruno (.bru files) ─────────────────────────────────────────────

function reqToBru(req: CollectionRequestRow): string {
  const d = parseRequestData(req);
  const method = (req.method || 'GET').toLowerCase();
  const lines: string[] = [
    `meta {`,
    `  name: ${req.name}`,
    `  type: http`,
    `  seq: ${req.sort_order ?? 0}`,
    `}`,
    ``,
    `${method} {`,
    `  url: ${req.url}`,
    `  body: ${d.bodyMode === 'json' ? 'json' : d.bodyMode === 'form-data' ? 'multipartForm' : d.bodyMode === 'x-www-form-urlencoded' ? 'formUrlEncoded' : 'none'}`,
    `  auth: ${d.authType === 'bearer' ? 'bearer' : d.authType === 'basic' ? 'basic' : 'none'}`,
    `}`,
    ``,
  ];

  const headers = d.headers as { key: string; value: string; enabled?: boolean }[] || [];
  if (headers.length) {
    lines.push('headers {');
    for (const h of headers) lines.push(`  ${h.enabled !== false ? '' : '~'}${h.key}: ${h.value}`);
    lines.push('}', '');
  }

  if (d.bodyMode === 'json' && d.bodyRaw) {
    lines.push('body:json {', `  ${d.bodyRaw}`, '}', '');
  } else if (d.bodyMode === 'x-www-form-urlencoded') {
    const form = d.bodyUrlEncoded as { key: string; value: string }[] || [];
    if (form.length) { lines.push('body:form-urlencoded {'); for (const e of form) lines.push(`  ${e.key}: ${e.value}`); lines.push('}', ''); }
  }

  if (d.authType === 'bearer') {
    lines.push('auth:bearer {', `  token: ${(d.authData as Record<string, string>).token || ''}`, '}', '');
  } else if (d.authType === 'basic') {
    const ad = d.authData as Record<string, string>;
    lines.push('auth:basic {', `  username: ${ad.username || ''}`, `  password: ${ad.password || ''}`, '}', '');
  }

  const pre = d.preRequestScript as string || '';
  const post = d.postResponseScript as string || '';
  if (pre.trim()) { lines.push('script:pre-request {', pre, '}', ''); }
  if (post.trim()) { lines.push('script:post-response {', post, '}', ''); }

  return lines.join('\n');
}

function writeBruFolder(node: CollectionTreeNode, folderPath: string) {
  fs.mkdirSync(folderPath, { recursive: true });

  for (const req of node.requests) {
    const safeName = req.name.replace(/[/\\?%*:|"<>]/g, '-');
    fs.writeFileSync(path.join(folderPath, `${safeName}.bru`), reqToBru(req), 'utf8');
  }

  for (const child of node.children) {
    const safeFolderName = child.name.replace(/[/\\?%*:|"<>]/g, '-');
    writeBruFolder(child, path.join(folderPath, safeFolderName));
  }
}

export async function handleExportCollectionBruno(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const collectionId = msg.collectionId as string;
  const tree = getCollectionTree();
  const node = collectionId ? findNode(tree, collectionId) : null;
  if (!node) {
    postMessage({ type: 'toast', toastType: 'error', message: 'Please right-click a collection to export.' });
    return;
  }

  const folderUri = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title: 'Select destination folder for Bruno collection',
  });
  if (!folderUri?.[0]) return;

  const destPath = path.join(folderUri[0].fsPath, node.name.replace(/[/\\?%*:|"<>]/g, '-'));
  writeBruFolder(node, destPath);

  // Write bruno.json
  fs.writeFileSync(path.join(destPath, 'bruno.json'), JSON.stringify({ version: '1', name: node.name, type: 'collection', ignore: [] }, null, 2), 'utf8');

  postMessage({ type: 'toast', toastType: 'success', message: `Bruno collection exported to ${destPath}` });
}

// ─── 5.4.11 — Insomnia v4 ────────────────────────────────────────────────────

function collectInsomniaResources(
  node: CollectionTreeNode,
  parentId: string,
  resources: unknown[],
) {
  const groupId = `fld_${node.id.replace(/-/g, '')}`;
  resources.push({
    _id: groupId,
    _type: 'request_group',
    parentId,
    name: node.name,
    description: '',
    environment: {},
    metaSortKey: node.sort_order ?? 0,
  });

  for (const req of node.requests) {
    const d = parseRequestData(req);
    const headers = (d.headers as { key: string; value: string; enabled?: boolean }[] || []).map(h => ({ name: h.key, value: h.value, disabled: !h.enabled }));
    const params = (d.params as { key: string; value: string; enabled?: boolean }[] || []).map(p => ({ name: p.key, value: p.value, disabled: !p.enabled }));

    resources.push({
      _id: `req_${req.id.replace(/-/g, '')}`,
      _type: 'request',
      parentId: groupId,
      name: req.name,
      method: req.method,
      url: req.url,
      headers,
      parameters: params,
      body: buildInsomniaBody(d),
      authentication: buildInsomniaAuth(d),
      preRequestScript: d.preRequestScript as string || '',
      afterResponseScript: d.postResponseScript as string || '',
      metaSortKey: req.sort_order ?? 0,
    });
  }

  for (const child of node.children) {
    collectInsomniaResources(child, groupId, resources);
  }
}

function buildInsomniaBody(d: Record<string, unknown>): unknown {
  const mode = d.bodyMode as string || 'none';
  if (mode === 'none') return {};
  if (mode === 'json') return { mimeType: 'application/json', text: d.bodyRaw as string || '' };
  if (mode === 'raw') return { mimeType: d.bodyContentType as string || 'text/plain', text: d.bodyRaw as string || '' };
  if (mode === 'x-www-form-urlencoded') return { mimeType: 'application/x-www-form-urlencoded', params: (d.bodyUrlEncoded as { key: string; value: string }[] || []).map(e => ({ name: e.key, value: e.value })) };
  if (mode === 'form-data') return { mimeType: 'multipart/form-data', params: (d.bodyFormData as { key: string; value: string }[] || []).map(e => ({ name: e.key, value: e.value })) };
  if (mode === 'graphql') { try { const g = JSON.parse(d.bodyRaw as string || '{}'); return { mimeType: 'application/graphql', query: g.query || '', variables: g.variables ? JSON.stringify(g.variables) : '' }; } catch { return {}; } }
  return {};
}

function buildInsomniaAuth(d: Record<string, unknown>): unknown {
  const authType = d.authType as string || 'none';
  const ad = d.authData as Record<string, string> || {};
  if (authType === 'bearer') return { type: 'bearer', token: ad.token || '' };
  if (authType === 'basic') return { type: 'basic', username: ad.username || '', password: ad.password || '' };
  if (authType === 'api-key') return { type: 'apikey', key: ad.apiKeyName || '', value: ad.apiKeyValue || '', addTo: ad.apiKeyIn === 'query' ? 'queryParams' : 'header' };
  return { type: 'none' };
}

export async function handleExportCollectionInsomnia(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const collectionId = msg.collectionId as string;
  const tree = getCollectionTree();
  const node = collectionId ? findNode(tree, collectionId) : null;

  const toExport = node
    ? [node]
    : [{ id: 'root', name: 'Daakia Export', parent_id: null, sort_order: 0, children: tree, requests: [] }];

  const resources: unknown[] = [{
    _id: '__WORKSPACE_ID__',
    _type: 'workspace',
    parentId: null,
    name: node?.name || 'Daakia Export',
    description: 'Exported from Daakia',
    scope: 'design',
  }];

  for (const n of toExport) {
    collectInsomniaResources(n as CollectionTreeNode, '__WORKSPACE_ID__', resources);
  }

  const doc = {
    _type: 'export',
    __export_format: 4,
    __export_date: new Date().toISOString(),
    __export_source: 'daakia',
    resources,
  };

  const defaultName = node ? `${node.name}.insomnia.json` : 'daakia-export.insomnia.json';
  const uri = await vscode.window.showSaveDialog({
    saveLabel: 'Export as Insomnia Collection',
    defaultUri: vscode.Uri.file(defaultName),
    filters: { 'JSON Files': ['json'] },
  });
  if (!uri) return;

  fs.writeFileSync(uri.fsPath, JSON.stringify(doc, null, 2), 'utf8');
  postMessage({ type: 'toast', toastType: 'success', message: `Exported as Insomnia collection to ${path.basename(uri.fsPath)}` });
}

// ─── 5.4.12 — HTTPie ──────────────────────────────────────────────────────────

function collectHttpieRequests(node: CollectionTreeNode, prefix: string, out: Record<string, unknown>) {
  for (const req of node.requests) {
    const d = parseRequestData(req);
    const headers: Record<string, string> = {};
    for (const h of (d.headers as { key: string; value: string; enabled?: boolean }[] || [])) {
      if (h.enabled !== false) headers[h.key] = h.value;
    }
    const params: Record<string, string> = {};
    for (const p of (d.params as { key: string; value: string; enabled?: boolean }[] || [])) {
      if (p.enabled !== false) params[p.key] = p.value;
    }

    const key = `${prefix}${req.name}`;
    out[key] = {
      method: req.method,
      url: req.url,
      headers,
      params,
      body: d.bodyRaw as string || null,
      bodyMode: d.bodyMode as string || 'none',
      auth: d.authType !== 'none' ? { type: d.authType, ...((d.authData as Record<string, string>) || {}) } : undefined,
    };
  }
  for (const child of node.children) {
    collectHttpieRequests(child, `${prefix}${child.name}/`, out);
  }
}

export async function handleExportCollectionHttpie(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const collectionId = msg.collectionId as string;
  const tree = getCollectionTree();
  const node = collectionId ? findNode(tree, collectionId) : null;

  const requests: Record<string, unknown> = {};
  const toExport = node ? [node] : tree;
  for (const n of toExport) {
    collectHttpieRequests(n as CollectionTreeNode, '', requests);
  }

  const doc = {
    __version__: '2',
    __meta__: { about: `HTTPie collection exported from Daakia — ${node?.name || 'All Collections'}` },
    requests,
  };

  const defaultName = node ? `${node.name}.httpie.json` : 'daakia-httpie.json';
  const uri = await vscode.window.showSaveDialog({
    saveLabel: 'Export as HTTPie collection',
    defaultUri: vscode.Uri.file(defaultName),
    filters: { 'JSON Files': ['json'] },
  });
  if (!uri) return;

  fs.writeFileSync(uri.fsPath, JSON.stringify(doc, null, 2), 'utf8');
  postMessage({ type: 'toast', toastType: 'success', message: `Exported as HTTPie collection to ${path.basename(uri.fsPath)}` });
}
