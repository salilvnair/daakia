/**
 * Bruno Collection Importer
 *
 * Parses a Bruno collection folder structure (.bru files + bruno.json)
 * and imports it into Daakia's SQLite collection store.
 *
 * Bruno folder structure:
 *   collection/
 *   ├── bruno.json          (collection metadata)
 *   ├── environments/       (ignored — env import is separate)
 *   ├── folder1/
 *   │   ├── request1.bru
 *   │   └── request2.bru
 *   └── request3.bru
 *
 * .bru file format: block-based text (meta, get/post/..., headers, body, auth, scripts, tests)
 */
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { upsertCollection, upsertCollectionRequest } from '../storage/db';
import type { ImportResult } from './import-types';
import { resolveScript } from './script-resolver';

// ─── .bru Parser ─────────────────────────────────────────────────────────────

interface BruBlock {
  type: string;
  content: string;
}

/**
 * Parse a .bru file into blocks.
 * Blocks are of the form: `blockname { ... }` or `blockname:modifier { ... }`
 */
function parseBruBlocks(source: string): BruBlock[] {
  const blocks: BruBlock[] = [];
  const lines = source.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trimEnd();

    // Match block opener: `blockname {` or `blockname:modifier {`
    const blockMatch = line.match(/^([\w\-]+(?::[\w\-]+)?)\s*\{$/);
    if (blockMatch) {
      const type = blockMatch[1];
      const contentLines: string[] = [];
      i++;

      // Collect until closing `}`
      while (i < lines.length) {
        const cl = lines[i];
        if (cl.trimEnd() === '}') {
          i++;
          break;
        }
        contentLines.push(cl);
        i++;
      }

      blocks.push({ type, content: contentLines.join('\n') });
    } else {
      i++;
    }
  }

  return blocks;
}

/** Parse key-value lines (key: value) from a block content string */
function parseKeyValueLines(content: string): { key: string; value: string; enabled: boolean }[] {
  const results: { key: string; value: string; enabled: boolean }[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Bruno uses ~key: value for disabled entries
    const disabled = trimmed.startsWith('~');
    const clean = disabled ? trimmed.slice(1) : trimmed;

    const colonIdx = clean.indexOf(':');
    if (colonIdx > 0) {
      const key = clean.slice(0, colonIdx).trim();
      const value = clean.slice(colonIdx + 1).trim();
      results.push({ key, value, enabled: !disabled });
    }
  }
  return results;
}

// ─── Request Data Builder ────────────────────────────────────────────────────

interface ParsedBruRequest {
  name: string;
  method: string;
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  params: { key: string; value: string; enabled: boolean }[];
  bodyMode: string;
  bodyRaw: string;
  bodyFormData: { key: string; value: string; enabled: boolean }[];
  bodyUrlEncoded: { key: string; value: string; enabled: boolean }[];
  authType: string;
  authData: Record<string, string>;
  preRequestScript: string;
  postResponseScript: string;
  tests: string;
  seq: number;
}

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'connect', 'trace'];

function parseBruFile(content: string, fileName: string): ParsedBruRequest {
  const blocks = parseBruBlocks(content);
  const result: ParsedBruRequest = {
    name: path.basename(fileName, '.bru'),
    method: 'GET',
    url: '',
    headers: [],
    params: [],
    bodyMode: 'none',
    bodyRaw: '',
    bodyFormData: [],
    bodyUrlEncoded: [],
    authType: 'none',
    authData: {},
    preRequestScript: '',
    postResponseScript: '',
    tests: '',
    seq: 999,
  };

  for (const block of blocks) {
    const blockType = block.type.toLowerCase();

    // Meta block
    if (blockType === 'meta') {
      const kvs = parseKeyValueLines(block.content);
      for (const kv of kvs) {
        if (kv.key === 'name') result.name = kv.value;
        if (kv.key === 'seq') result.seq = parseInt(kv.value) || 999;
      }
      continue;
    }

    // HTTP method block (get, post, put, etc.)
    if (HTTP_METHODS.includes(blockType)) {
      result.method = blockType.toUpperCase();
      const kvs = parseKeyValueLines(block.content);
      for (const kv of kvs) {
        if (kv.key === 'url') result.url = kv.value;
      }
      continue;
    }

    // Headers
    if (blockType === 'headers') {
      result.headers = parseKeyValueLines(block.content);
      continue;
    }

    // Query params
    if (blockType === 'params:query') {
      result.params = parseKeyValueLines(block.content);
      continue;
    }

    // Body: JSON
    if (blockType === 'body:json') {
      result.bodyMode = 'json';
      result.bodyRaw = block.content.trim();
      continue;
    }

    // Body: text
    if (blockType === 'body:text') {
      result.bodyMode = 'raw';
      result.bodyRaw = block.content.trim();
      continue;
    }

    // Body: XML
    if (blockType === 'body:xml') {
      result.bodyMode = 'raw';
      result.bodyRaw = block.content.trim();
      continue;
    }

    // Body: form-urlencoded
    if (blockType === 'body:form-urlencoded') {
      result.bodyMode = 'urlencoded';
      result.bodyUrlEncoded = parseKeyValueLines(block.content);
      continue;
    }

    // Body: multipart-form
    if (blockType === 'body:multipart-form') {
      result.bodyMode = 'form-data';
      result.bodyFormData = parseKeyValueLines(block.content);
      continue;
    }

    // Body: GraphQL
    if (blockType === 'body:graphql') {
      result.bodyMode = 'graphql';
      result.bodyRaw = block.content.trim();
      continue;
    }

    // Body: GraphQL variables
    if (blockType === 'body:graphql:vars') {
      // Append as a JSON variables section (stored alongside the query)
      if (result.bodyMode === 'graphql' && block.content.trim()) {
        result.bodyRaw += '\n---graphql-variables---\n' + block.content.trim();
      }
      continue;
    }

    // Auth: bearer
    if (blockType === 'auth:bearer') {
      result.authType = 'bearer';
      const kvs = parseKeyValueLines(block.content);
      const tokenKv = kvs.find(k => k.key === 'token');
      if (tokenKv) result.authData = { token: tokenKv.value };
      continue;
    }

    // Auth: basic
    if (blockType === 'auth:basic') {
      result.authType = 'basic';
      const kvs = parseKeyValueLines(block.content);
      const user = kvs.find(k => k.key === 'username');
      const pass = kvs.find(k => k.key === 'password');
      result.authData = { username: user?.value || '', password: pass?.value || '' };
      continue;
    }

    // Scripts
    if (blockType === 'script:pre-request') {
      result.preRequestScript = block.content.trim();
      continue;
    }
    if (blockType === 'script:post-response') {
      result.postResponseScript = block.content.trim();
      continue;
    }

    // Tests
    if (blockType === 'tests') {
      result.tests = block.content.trim();
      continue;
    }
  }

  return result;
}

// ─── Folder Walker ───────────────────────────────────────────────────────────

function importBruFolder(
  folderPath: string,
  parentCollectionId: string,
  sortOffset: number,
): number {
  let requestCount = 0;
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });

  // Separate folders and .bru files
  const subFolders = entries.filter(e => e.isDirectory() && e.name !== 'environments' && e.name !== 'node_modules' && !e.name.startsWith('.'));
  const bruFiles = entries.filter(e => e.isFile() && e.name.endsWith('.bru'));

  // Parse .bru files and sort by seq
  const parsedRequests: { parsed: ParsedBruRequest; fileName: string }[] = [];
  for (const file of bruFiles) {
    const filePath = path.join(folderPath, file.name);
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseBruFile(content, file.name);
    parsedRequests.push({ parsed, fileName: file.name });
  }
  parsedRequests.sort((a, b) => a.parsed.seq - b.parsed.seq);

  // Import requests
  for (let i = 0; i < parsedRequests.length; i++) {
    const { parsed } = parsedRequests[i];
    const requestId = randomUUID();

    const data = JSON.stringify({
      headers: parsed.headers.map(h => ({ id: randomUUID(), key: h.key, value: h.value, enabled: h.enabled })),
      params: parsed.params.map(p => ({ id: randomUUID(), key: p.key, value: p.value, enabled: p.enabled })),
      bodyMode: parsed.bodyMode,
      bodyRaw: parsed.bodyRaw,
      bodyFormData: parsed.bodyFormData.map(f => ({ id: randomUUID(), key: f.key, value: f.value, type: 'text', enabled: f.enabled })),
      bodyUrlEncoded: parsed.bodyUrlEncoded.map(u => ({ id: randomUUID(), key: u.key, value: u.value, enabled: u.enabled })),
      authType: parsed.authType,
      authData: parsed.authData,
      preRequestScript: resolveScript(parsed.preRequestScript, 'bruno'),
      postResponseScript: resolveScript(parsed.postResponseScript || parsed.tests, 'bruno'),
    });

    upsertCollectionRequest({
      id: requestId,
      collection_id: parentCollectionId,
      name: parsed.name,
      method: parsed.method,
      url: parsed.url,
      data,
      sort_order: sortOffset + i,
    });
    requestCount++;
  }

  // Recurse into sub-folders (each becomes a child collection/folder)
  for (let i = 0; i < subFolders.length; i++) {
    const folder = subFolders[i];
    const folderId = randomUUID();
    upsertCollection(folderId, folder.name, parentCollectionId);
    const subCount = importBruFolder(path.join(folderPath, folder.name), folderId, 0);
    requestCount += subCount;
  }

  return requestCount;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Import a Bruno collection from a folder path.
 * Reads bruno.json for name, walks subfolders/files.
 */
export function importBrunoCollection(folderPath: string): ImportResult {
  try {
    // Read bruno.json for collection name
    let collectionName = path.basename(folderPath);
    const brunoJsonPath = path.join(folderPath, 'bruno.json');
    if (fs.existsSync(brunoJsonPath)) {
      try {
        const brunoJson = JSON.parse(fs.readFileSync(brunoJsonPath, 'utf-8'));
        if (brunoJson.name) collectionName = brunoJson.name;
      } catch { /* use folder name */ }
    }

    // Create root collection
    const collectionId = randomUUID();
    upsertCollection(collectionId, collectionName, null);

    // Walk the folder structure
    const requestCount = importBruFolder(folderPath, collectionId, 0);

    return {
      success: true,
      collectionName,
      requestCount,
    };
  } catch (err: unknown) {
    return {
      success: false,
      collectionName: path.basename(folderPath),
      requestCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
