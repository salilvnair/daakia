/**
 * Bruno Collection Importer
 *
 * Bruno has kept its collections in three shapes, and this reads all of them:
 *
 *   collection/                     collection/
 *   ├── bruno.json                  ├── opencollection.yml   (info.name)
 *   ├── collection.bru              ├── environments/
 *   ├── environments/               │   └── dev.yml
 *   │   └── dev.bru                 ├── users/
 *   ├── users/                      │   ├── folder.yml       (info.name, seq)
 *   │   ├── folder.bru              │   └── Get user.yml
 *   │   └── Get user.bru            └── Hopper.yml
 *   └── Hopper.bru
 *
 *   .bru — the original block format, Bruno 1 and 2.
 *   .yml — OpenCollection, what Bruno 3 and its VS Code extension write.
 *
 * and the single-file JSON its "Export → Bruno collection" writes, which is
 * recognised by `isBrunoJsonExport` wherever a file is imported.
 *
 * ── Why YAML had to be added ──
 *
 * The importer only ever looked for `.bru` files. A collection saved by the
 * Bruno VS Code extension is all `.yml`, so the walk found nothing, made an
 * empty collection, and called that a success.
 *
 * ── Shape ──
 *
 * Each reader produces the same `BrunoCollection` tree, which nothing but
 * `writeBrunoCollection` touches the database with. The readers are pure, so
 * the tests read real files without a database.
 */
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { load as loadYaml } from 'js-yaml';
import { upsertCollection, upsertCollectionRequest, upsertEnvironment } from '../storage/db';
import type { ImportResult } from './import-types';
import { resolveScript } from './script-resolver';
import { encryptEnvVariables } from './vault';

// ─── The common shape ────────────────────────────────────────────────────────

interface KV { key: string; value: string; enabled: boolean; type?: string }

/** Bruno's own body mode names — every source uses them, so one mapper reads all three. */
type BrunoBodyMode = 'none' | 'json' | 'text' | 'xml' | 'sparql' | 'formUrlEncoded' | 'multipartForm' | 'graphql' | 'file';

export interface ParsedRequest {
  name: string;
  seq: number;
  method: string;
  url: string;
  headers: KV[];
  params: KV[];
  body: {
    mode: BrunoBodyMode;
    text: string;
    form: KV[];
    gqlQuery: string;
    gqlVariables: string;
  };
  auth: {
    mode: string;
    token?: string;
    username?: string;
    password?: string;
    key?: string;
    value?: string;
    placement?: string;
  };
  preRequestScript: string;
  postResponseScript: string;
  tests: string;
}

export interface BrunoFolder {
  name: string;
  seq: number;
  requests: ParsedRequest[];
  folders: BrunoFolder[];
}

export interface BrunoEnvironment {
  name: string;
  variables: { key: string; value: string; enabled: boolean; secret: boolean }[];
}

export interface BrunoCollection {
  name: string;
  /** What it was read from, for the import report. */
  format: 'bru' | 'yml' | 'json-export';
  root: BrunoFolder;
  environments: BrunoEnvironment[];
  /** Anything that did not come across as-is, said plainly. Shown in DevTools. */
  notes: string[];
}

function emptyRequest(name: string): ParsedRequest {
  return {
    name, seq: 999, method: 'GET', url: '', headers: [], params: [],
    body: { mode: 'none', text: '', form: [], gqlQuery: '', gqlVariables: '' },
    auth: { mode: 'none' },
    preRequestScript: '', postResponseScript: '', tests: '',
  };
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : typeof v === 'string' ? v : String(v));

// ─── .bru ────────────────────────────────────────────────────────────────────

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
  const lines = source.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trimEnd();

    // Match block opener: `blockname {` or `blockname:modifier {`
    const blockMatch = line.match(/^([\w-]+(?::[\w-]+)*)\s*\{$/);
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
function parseKeyValueLines(content: string): KV[] {
  const results: KV[] = [];
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

/** A block's text with its two-space indent taken off, as Bruno writes it. */
function blockText(content: string): string {
  return content.split('\n').map(l => l.replace(/^ {2}/, '')).join('\n').trim();
}

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'connect', 'trace'];

export function parseBruRequest(content: string, fileName: string): ParsedRequest {
  const result = emptyRequest(path.basename(fileName, '.bru'));

  for (const block of parseBruBlocks(content)) {
    const t = block.type.toLowerCase();
    const kvs = () => parseKeyValueLines(block.content);
    const get = (k: string) => kvs().find(kv => kv.key === k)?.value ?? '';

    if (t === 'meta') {
      if (get('name')) result.name = get('name');
      result.seq = parseInt(get('seq')) || 999;
    } else if (HTTP_METHODS.includes(t)) {
      result.method = t.toUpperCase();
      result.url = get('url');
    } else if (t === 'headers') {
      result.headers = kvs();
    } else if (t === 'params:query' || t === 'query') {
      result.params = kvs();
    } else if (t === 'body:json') {
      result.body.mode = 'json';
      result.body.text = blockText(block.content);
    } else if (t === 'body:text') {
      result.body.mode = 'text';
      result.body.text = blockText(block.content);
    } else if (t === 'body:xml') {
      result.body.mode = 'xml';
      result.body.text = blockText(block.content);
    } else if (t === 'body:sparql') {
      result.body.mode = 'sparql';
      result.body.text = blockText(block.content);
    } else if (t === 'body:form-urlencoded') {
      result.body.mode = 'formUrlEncoded';
      result.body.form = kvs();
    } else if (t === 'body:multipart-form') {
      result.body.mode = 'multipartForm';
      result.body.form = kvs().map(kv => {
        // `@file(path)` marks a file part.
        const file = /^@file\((.*)\)$/.exec(kv.value);
        return file ? { ...kv, value: file[1], type: 'file' } : { ...kv, type: 'text' };
      });
    } else if (t === 'body:graphql') {
      result.body.mode = 'graphql';
      result.body.gqlQuery = blockText(block.content);
    } else if (t === 'body:graphql:vars') {
      result.body.gqlVariables = blockText(block.content);
    } else if (t === 'auth:bearer') {
      result.auth = { mode: 'bearer', token: get('token') };
    } else if (t === 'auth:basic') {
      result.auth = { mode: 'basic', username: get('username'), password: get('password') };
    } else if (t === 'auth:apikey') {
      result.auth = { mode: 'apikey', key: get('key'), value: get('value'), placement: get('placement') };
    } else if (t === 'script:pre-request') {
      result.preRequestScript = blockText(block.content);
    } else if (t === 'script:post-response') {
      result.postResponseScript = blockText(block.content);
    } else if (t === 'tests') {
      result.tests = blockText(block.content);
    }
  }

  return result;
}

/** `vars { a: 1 }` and `vars:secret [ token ]` from an environments/*.bru file. */
export function parseBruEnvironment(content: string, name: string): BrunoEnvironment {
  const variables: BrunoEnvironment['variables'] = [];
  for (const block of parseBruBlocks(content)) {
    if (block.type === 'vars') {
      for (const kv of parseKeyValueLines(block.content)) {
        variables.push({ key: kv.key, value: kv.value, enabled: kv.enabled, secret: false });
      }
    }
  }
  const secrets = /vars:secret\s*\[([\s\S]*?)\]/.exec(content);
  if (secrets) {
    for (const raw of secrets[1].split(/[,\n]/)) {
      const n = raw.trim();
      if (!n) continue;
      const disabled = n.startsWith('~');
      variables.push({ key: disabled ? n.slice(1) : n, value: '', enabled: !disabled, secret: true });
    }
  }
  return { name, variables };
}

// ─── .yml (OpenCollection) ───────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {});
const asArr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') as Obj[] : []);

function parseYaml(text: string): Obj {
  return asObj(loadYaml(text));
}

/** `{ name, value, disabled }` — how OpenCollection writes headers, params and form fields. */
function ocPairs(list: unknown): KV[] {
  return asArr(list).map(p => ({
    key: str(p.name), value: str(p.value), enabled: p.disabled !== true,
    ...(p.type !== undefined ? { type: str(p.type) } : {}),
  }));
}

function ocAuth(auth: unknown): ParsedRequest['auth'] {
  if (auth === 'inherit') return { mode: 'inherit' };
  const a = asObj(auth);
  switch (a.type) {
    case 'bearer': return { mode: 'bearer', token: str(a.token) };
    case 'basic': return { mode: 'basic', username: str(a.username), password: str(a.password) };
    case 'apikey': return {
      mode: 'apikey', key: str(a.key), value: str(a.value),
      placement: a.placement === 'query' ? 'queryparams' : 'header',
    };
    case undefined: return { mode: 'none' };
    default: return { mode: str(a.type) };
  }
}

function ocScripts(target: ParsedRequest, runtime: unknown): void {
  for (const s of asArr(asObj(runtime).scripts)) {
    const code = str(s.code);
    if (s.type === 'before-request') target.preRequestScript = code;
    else if (s.type === 'after-response') target.postResponseScript = code;
    else if (s.type === 'tests') target.tests = code;
  }
}

/** One OpenCollection request file. Null for a file that is not a request (a script, an app). */
export function parseOpenCollectionRequest(content: string, fileName: string): ParsedRequest | null {
  const doc = parseYaml(content);
  const info = asObj(doc.info);
  const kind = str(info.type);
  if (kind !== 'http' && kind !== 'graphql') return null;

  const req = emptyRequest(str(info.name) || path.basename(fileName, path.extname(fileName)));
  req.seq = typeof info.seq === 'number' ? info.seq : 999;
  const spec = asObj(kind === 'graphql' ? doc.graphql : doc.http);

  req.method = (str(spec.method) || (kind === 'graphql' ? 'POST' : 'GET')).toUpperCase();
  req.url = str(spec.url);
  req.headers = ocPairs(spec.headers);
  req.params = ocPairs(spec.params).filter(p => p.type !== 'path').map(({ type: _t, ...p }) => p);
  req.auth = ocAuth(spec.auth);

  const body = asObj(spec.body);
  if (kind === 'graphql') {
    req.body.mode = 'graphql';
    req.body.gqlQuery = str(body.query);
    req.body.gqlVariables = str(body.variables);
  } else {
    switch (body.type) {
      case 'json': case 'text': case 'xml': case 'sparql':
        req.body.mode = body.type;
        req.body.text = str(body.data);
        break;
      case 'form-urlencoded':
        req.body.mode = 'formUrlEncoded';
        req.body.form = ocPairs(body.data);
        break;
      case 'multipart-form':
        req.body.mode = 'multipartForm';
        req.body.form = asArr(body.data).map(p => ({
          key: str(p.name),
          value: Array.isArray(p.value) ? p.value.map(str).join(',') : str(p.value),
          enabled: p.disabled !== true,
          type: p.type === 'file' ? 'file' : 'text',
        }));
        break;
      case 'file':
        req.body.mode = 'file';
        break;
    }
  }

  ocScripts(req, doc.runtime);
  return req;
}

/** A Bruno variable value: a string, or a typed `{ type, data }` the YAML writes for numbers. */
function ocValue(v: unknown): string {
  if (v && typeof v === 'object' && 'data' in (v as Obj)) return str((v as Obj).data);
  return str(v);
}

export function parseOpenCollectionEnvironment(content: string, fallbackName: string): BrunoEnvironment {
  const doc = parseYaml(content);
  return {
    name: str(doc.name) || fallbackName,
    variables: asArr(doc.variables).map(v => ({
      key: str(v.name),
      // A secret's value lives outside the file, in Bruno's own store.
      value: v.secret === true ? '' : ocValue(v.value),
      enabled: v.disabled !== true,
      secret: v.secret === true,
    })),
  };
}

// ─── The folder walk ─────────────────────────────────────────────────────────

/** Files that describe a folder or the collection, not a request. */
const META_FILES = new Set(['collection.bru', 'folder.bru', 'opencollection.yml', 'opencollection.yaml', 'folder.yml', 'folder.yaml']);

const isYaml = (name: string) => /\.ya?ml$/i.test(name);

function readFolder(dir: string, name: string, notes: string[], counts: { bru: number; yml: number }): BrunoFolder {
  const folder: BrunoFolder = { name, seq: 999, requests: [], folders: [] };
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  /* The folder's own name and place, when it has a meta file. */
  for (const meta of ['folder.yml', 'folder.yaml', 'folder.bru']) {
    const p = path.join(dir, meta);
    if (!fs.existsSync(p)) continue;
    try {
      const text = fs.readFileSync(p, 'utf-8');
      if (meta.endsWith('.bru')) {
        const m = parseBruBlocks(text).find(b => b.type === 'meta');
        const kv = m ? parseKeyValueLines(m.content) : [];
        folder.name = kv.find(k => k.key === 'name')?.value || folder.name;
        folder.seq = parseInt(kv.find(k => k.key === 'seq')?.value ?? '') || 999;
      } else {
        const info = asObj(parseYaml(text).info);
        folder.name = str(info.name) || folder.name;
        if (typeof info.seq === 'number') folder.seq = info.seq;
      }
    } catch { /* the directory name will do */ }
    break;
  }

  for (const e of entries) {
    if (!e.isFile() || META_FILES.has(e.name.toLowerCase())) continue;
    const p = path.join(dir, e.name);
    try {
      if (e.name.endsWith('.bru')) {
        folder.requests.push(parseBruRequest(fs.readFileSync(p, 'utf-8'), e.name));
        counts.bru++;
      } else if (isYaml(e.name)) {
        const r = parseOpenCollectionRequest(fs.readFileSync(p, 'utf-8'), e.name);
        if (r) { folder.requests.push(r); counts.yml++; }
        else notes.push(`${e.name}: not a request (only http and graphql requests are imported)`);
      }
    } catch (err) {
      notes.push(`${e.name}: could not be read — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'environments' || e.name === 'node_modules' || e.name.startsWith('.')) continue;
    folder.folders.push(readFolder(path.join(dir, e.name), e.name, notes, counts));
  }

  folder.requests.sort((a, b) => a.seq - b.seq);
  folder.folders.sort((a, b) => a.seq - b.seq || a.name.localeCompare(b.name));
  return folder;
}

function readEnvironments(dir: string, notes: string[]): BrunoEnvironment[] {
  const envDir = path.join(dir, 'environments');
  if (!fs.existsSync(envDir)) return [];
  const out: BrunoEnvironment[] = [];
  for (const e of fs.readdirSync(envDir, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const p = path.join(envDir, e.name);
    const base = e.name.replace(/\.(bru|ya?ml)$/i, '');
    try {
      if (e.name.endsWith('.bru')) out.push(parseBruEnvironment(fs.readFileSync(p, 'utf-8'), base));
      else if (isYaml(e.name)) out.push(parseOpenCollectionEnvironment(fs.readFileSync(p, 'utf-8'), base));
    } catch (err) {
      notes.push(`environments/${e.name}: could not be read — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

/** A Bruno collection's root: the folder with bruno.json or opencollection.yml in it. */
export function isBrunoCollectionDir(dir: string): boolean {
  return ['bruno.json', 'opencollection.yml', 'opencollection.yaml'].some(f => fs.existsSync(path.join(dir, f)));
}

/**
 * The collection a file belongs to: its own folder or the nearest one above
 * with a collection file in it. Lets a Bruno YAML request or opencollection.yml
 * be picked in the ordinary Import dialog and still bring the whole collection.
 */
export function findBrunoCollectionRoot(file: string): string | null {
  let dir = path.dirname(file);
  for (let i = 0; i < 6; i++) {
    if (isBrunoCollectionDir(dir)) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/** Read a Bruno collection folder, in either file format, into the common tree. */
export function readBrunoFolder(dir: string): BrunoCollection {
  const notes: string[] = [];
  let name = path.basename(dir);

  const brunoJson = path.join(dir, 'bruno.json');
  if (fs.existsSync(brunoJson)) {
    try { name = str(JSON.parse(fs.readFileSync(brunoJson, 'utf-8')).name) || name; } catch { /* folder name */ }
  }
  for (const f of ['opencollection.yml', 'opencollection.yaml']) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    try { name = str(asObj(parseYaml(fs.readFileSync(p, 'utf-8')).info).name) || name; } catch { /* folder name */ }
  }

  if (!isBrunoCollectionDir(dir)) {
    notes.push(`${dir} has no bruno.json or opencollection.yml — read as a plain folder of requests`);
  }

  const counts = { bru: 0, yml: 0 };
  const root = readFolder(dir, name, notes, counts);
  root.name = name;
  const environments = readEnvironments(dir, notes);

  return { name, format: counts.yml > counts.bru ? 'yml' : 'bru', root, environments, notes };
}

// ─── The JSON export ─────────────────────────────────────────────────────────

/**
 * Bruno's single-file export ("Export → Bruno collection").
 *
 * It names itself in no single field, so it is told by what only it has:
 * `brunoConfig`, or Bruno's `version: "1"` beside an `items` array. Postman's
 * export has `item` (singular) and `info`, so the two do not collide.
 */
export function isBrunoJsonExport(content: string): boolean {
  try {
    const doc = JSON.parse(content) as Obj;
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.items)) return false;
    return !!doc.brunoConfig
      || (doc.version === '1' && !doc.info)
      || /bruno/i.test(str(doc.exportedUsing));
  } catch {
    return false;
  }
}

function jsonPairs(list: unknown): KV[] {
  return asArr(list).map(p => ({ key: str(p.name), value: str(p.value), enabled: p.enabled !== false }));
}

/** One request from Bruno's in-app schema, which its JSON export writes as-is. */
function fromBrunoSchema(item: Obj): ParsedRequest {
  const req = emptyRequest(str(item.name) || 'Untitled');
  req.seq = typeof item.seq === 'number' ? item.seq : 999;
  const r = asObj(item.request);
  req.method = (str(r.method) || 'GET').toUpperCase();
  req.url = str(r.url);
  req.headers = jsonPairs(r.headers);
  req.params = asArr(r.params).filter(p => p.type !== 'path')
    .map(p => ({ key: str(p.name), value: str(p.value), enabled: p.enabled !== false }));

  const a = asObj(r.auth);
  const mode = str(a.mode) || 'none';
  if (mode === 'bearer') req.auth = { mode, token: str(asObj(a.bearer).token) };
  else if (mode === 'basic') req.auth = { mode, username: str(asObj(a.basic).username), password: str(asObj(a.basic).password) };
  else if (mode === 'apikey') {
    const k = asObj(a.apikey);
    req.auth = { mode, key: str(k.key), value: str(k.value), placement: str(k.placement) };
  } else req.auth = { mode };

  const b = asObj(r.body);
  const bm = str(b.mode) as BrunoBodyMode;
  if (bm === 'json' || bm === 'text' || bm === 'xml' || bm === 'sparql') {
    req.body.mode = bm;
    req.body.text = str(b[bm]);
  } else if (bm === 'formUrlEncoded') {
    req.body.mode = bm;
    req.body.form = jsonPairs(b.formUrlEncoded);
  } else if (bm === 'multipartForm') {
    req.body.mode = bm;
    req.body.form = asArr(b.multipartForm).map(p => ({
      key: str(p.name),
      value: Array.isArray(p.value) ? p.value.map(str).join(',') : str(p.value),
      enabled: p.enabled !== false,
      type: p.type === 'file' ? 'file' : 'text',
    }));
  } else if (bm === 'graphql') {
    req.body.mode = bm;
    req.body.gqlQuery = str(asObj(b.graphql).query);
    req.body.gqlVariables = str(asObj(b.graphql).variables);
  }

  const script = asObj(r.script);
  req.preRequestScript = str(script.req);
  req.postResponseScript = str(script.res);
  req.tests = str(r.tests);
  return req;
}

const REQUEST_TYPES = new Set(['http-request', 'graphql-request', 'http', 'graphql']);

/*
  An item the export did not finish writing.

  Bruno loads a collection's requests lazily, and its export writes whatever
  is in memory — so a request nobody had opened goes out as `partial: true`
  with its name and nothing else: no URL, no method that means anything. The
  item still carries the path of the file it came from, and when that file is
  still on this machine it is the better source by far.
*/
function fromPartial(item: Obj, notes: string[]): ParsedRequest | null {
  const file = str(item.pathname);
  if (item.partial !== true || !file || !fs.existsSync(file)) return null;
  try {
    const text = fs.readFileSync(file, 'utf-8');
    const parsed = file.endsWith('.bru') ? parseBruRequest(text, path.basename(file)) : parseOpenCollectionRequest(text, path.basename(file));
    if (!parsed) return null;
    if (typeof item.seq === 'number') parsed.seq = item.seq;
    notes.push(`${parsed.name}: the export carried only its name, so it was read from ${file}`);
    return parsed;
  } catch {
    return null;
  }
}

function readJsonItems(items: unknown, into: BrunoFolder, notes: string[]): void {
  for (const item of asArr(items)) {
    const type = str(item.type);
    if (type === 'folder') {
      const sub: BrunoFolder = { name: str(item.name) || 'Folder', seq: typeof item.seq === 'number' ? item.seq : 999, requests: [], folders: [] };
      readJsonItems(item.items, sub, notes);
      into.folders.push(sub);
    } else if (REQUEST_TYPES.has(type)) {
      const parsed = fromPartial(item, notes) ?? fromBrunoSchema(item);
      if (item.partial === true && !parsed.url) {
        notes.push(`${parsed.name}: the export carried only its name (Bruno had not loaded it) and its file is not on this machine — imported without a URL`);
      }
      into.requests.push(parsed);
    } else if (type) {
      notes.push(`${str(item.name) || 'An item'}: ${type} requests are not imported`);
    }
  }
  into.requests.sort((a, b) => a.seq - b.seq);
  into.folders.sort((a, b) => a.seq - b.seq);
}

export function readBrunoJsonExport(content: string): BrunoCollection {
  const doc = JSON.parse(content) as Obj;
  const notes: string[] = [];
  const name = str(doc.name) || str(asObj(doc.brunoConfig).name) || 'Bruno collection';
  const root: BrunoFolder = { name, seq: 0, requests: [], folders: [] };
  readJsonItems(doc.items, root, notes);
  const environments = asArr(doc.environments).map(e => ({
    name: str(e.name) || 'Environment',
    variables: asArr(e.variables).map(v => ({
      key: str(v.name),
      value: v.secret === true ? '' : str(v.value),
      enabled: v.enabled !== false,
      secret: v.secret === true,
    })),
  }));
  return { name, format: 'json-export', root, environments, notes };
}

// ─── Into Daakia ─────────────────────────────────────────────────────────────

const RAW_CONTENT_TYPE: Record<string, string> = {
  text: 'text/plain',
  xml: 'application/xml',
  sparql: 'application/sparql-query',
};

function parseGqlVariables(vars: string): unknown {
  if (!vars.trim()) return {};
  try { return JSON.parse(vars); } catch { return vars; }
}

/** The body, in the modes the REST executor actually has. */
function mapBody(b: ParsedRequest['body']) {
  const none = { bodyMode: 'none', bodyRaw: '', bodyContentType: 'application/json', bodyFormData: [] as object[], bodyUrlEncoded: [] as object[] };
  switch (b.mode) {
    case 'json':
      return { ...none, bodyMode: 'json', bodyRaw: b.text };
    case 'text': case 'xml': case 'sparql':
      return { ...none, bodyMode: 'raw', bodyRaw: b.text, bodyContentType: RAW_CONTENT_TYPE[b.mode] };
    case 'formUrlEncoded':
      return {
        ...none, bodyMode: 'x-www-form-urlencoded', bodyContentType: 'application/x-www-form-urlencoded',
        bodyUrlEncoded: b.form.map(f => ({ id: randomUUID(), key: f.key, value: f.value, enabled: f.enabled })),
      };
    case 'multipartForm':
      return {
        ...none, bodyMode: 'form-data', bodyContentType: 'multipart/form-data',
        bodyFormData: b.form.map(f => ({ id: randomUUID(), key: f.key, value: f.value, type: f.type || 'text', enabled: f.enabled })),
      };
    case 'graphql':
      /* As JSON, the way the Postman importer does it: a REST collection's
         executor has no graphql mode, and {query, variables} is what goes on
         the wire anyway. */
      return {
        ...none, bodyMode: 'json',
        bodyRaw: JSON.stringify({ query: b.gqlQuery, variables: parseGqlVariables(b.gqlVariables) }, null, 2),
      };
    default:
      return none;
  }
}

function mapAuth(a: ParsedRequest['auth']): { authType: string; authData: Record<string, string> } {
  switch (a.mode) {
    case 'bearer': return { authType: 'bearer', authData: { token: a.token ?? '' } };
    case 'basic': return { authType: 'basic', authData: { username: a.username ?? '', password: a.password ?? '' } };
    case 'apikey': return {
      authType: 'api-key',
      authData: { apiKeyName: a.key ?? '', apiKeyValue: a.value ?? '', addTo: a.placement === 'queryparams' || a.placement === 'query' ? 'query' : 'header' },
    };
    default: return { authType: 'none', authData: {} };
  }
}

/** The row Daakia stores for one request. Exported for the tests. */
export function requestRow(p: ParsedRequest) {
  return {
    name: p.name,
    method: p.method,
    url: p.url,
    data: {
      headers: p.headers.map(h => ({ id: randomUUID(), key: h.key, value: h.value, enabled: h.enabled })),
      params: p.params.map(q => ({ id: randomUUID(), key: q.key, value: q.value, enabled: q.enabled })),
      ...mapBody(p.body),
      ...mapAuth(p.auth),
      preRequestScript: resolveScript(p.preRequestScript, 'bruno'),
      postResponseScript: resolveScript([p.postResponseScript, p.tests].filter(s => s.trim()).join('\n\n'), 'bruno'),
    },
  };
}

function writeFolder(folder: BrunoFolder, collectionId: string, notes: string[]): number {
  let count = 0;
  folder.requests.forEach((p, i) => {
    if (p.auth.mode === 'inherit') notes.push(`${p.name}: inherits its auth from the collection — set it on the request in Daakia`);
    else if (!['none', 'bearer', 'basic', 'apikey'].includes(p.auth.mode)) notes.push(`${p.name}: ${p.auth.mode} auth is not carried over`);
    if (p.body.mode === 'file') notes.push(`${p.name}: a file body points at a path on the exporting machine and is not carried over`);
    const row = requestRow(p);
    upsertCollectionRequest({
      id: randomUUID(),
      collection_id: collectionId,
      name: row.name,
      method: row.method,
      url: row.url,
      data: JSON.stringify(row.data),
      sort_order: i,
    });
    count++;
  });
  for (const sub of folder.folders) {
    const id = randomUUID();
    upsertCollection(id, sub.name, collectionId);
    count += writeFolder(sub, id, notes);
  }
  return count;
}

/** Into the active workspace: one REST collection, plus its environments. */
export function writeBrunoCollection(c: BrunoCollection): ImportResult {
  const collectionId = randomUUID();
  // Bruno collections are always REST-shaped.
  upsertCollection(collectionId, c.name, null, 'rest');
  const notes = [...c.notes];
  const requestCount = writeFolder(c.root, collectionId, notes);

  for (const env of c.environments) {
    const variables = env.variables.map(v => ({
      id: randomUUID(), key: v.key, initialValue: v.value, currentValue: v.value, isSecret: v.secret, enabled: v.enabled,
    }));
    upsertEnvironment({
      id: randomUUID(),
      /* Named for the collection too: "dev" from three collections would be three "dev"s. */
      name: `${env.name} (${c.name})`,
      variables: JSON.stringify(encryptEnvVariables(variables)),
      is_active: 0,
    });
    const secrets = env.variables.filter(v => v.secret).length;
    if (secrets) notes.push(`${env.name}: ${secrets} secret ${secrets === 1 ? 'value is' : 'values are'} kept by Bruno outside the collection — fill ${secrets === 1 ? 'it' : 'them'} in under Environments`);
  }

  if (requestCount === 0) notes.push('No requests were found in it');

  return {
    success: true,
    collectionName: c.name,
    requestCount,
    environmentCount: c.environments.length,
    format: c.format === 'json-export' ? 'Bruno (JSON export)' : c.format === 'yml' ? 'Bruno (YAML)' : 'Bruno (.bru)',
    notes,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Import a Bruno collection from a folder, in either file format. */
export function importBrunoCollection(folderPath: string): ImportResult {
  try {
    return writeBrunoCollection(readBrunoFolder(folderPath));
  } catch (err: unknown) {
    return {
      success: false,
      collectionName: path.basename(folderPath),
      requestCount: 0,
      format: 'Bruno',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Import Bruno's single-file JSON export. */
export function importBrunoJsonExport(content: string): ImportResult {
  try {
    return writeBrunoCollection(readBrunoJsonExport(content));
  } catch (err: unknown) {
    return {
      success: false, collectionName: '', requestCount: 0, format: 'Bruno (JSON export)',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
