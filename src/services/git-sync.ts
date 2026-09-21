/**
 * Git-native sync — keeps collections, history, mock servers, and state machine
 * workflows as diffable `*.daakia.json` files inside a fixed local clone of the
 * user's own remote repo, so they can be committed, reviewed, and run in CI via
 * `cli/daakia-run.mjs`.
 *
 * The local clone always lives at `~/.salilvnair/daakia-vsce/daakia-vsce-git` —
 * a fixed, machine-global location, independent of whatever VS Code workspace
 * (if any) happens to be open. "Initialize Repo" clones the configured remote
 * URL into that folder (or reuses it if already cloned); every sync cycle then
 * checks that folder out on the configured branch, exports, commits, pulls,
 * pushes, and imports — always synchronously, one cycle at a time (see
 * `_syncInProgress`).
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getThemes, upsertTheme } from '../storage/db';
import type { ThemePayload } from '../panel/main/handlers/theme-handler';
import * as os from 'os';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import {
  getCollectionTree, upsertCollection, upsertCollectionRequest, type CollectionTreeNode,
  getHistory, insertHistoryIfNew, findAll, upsert,
  getAllEnvironments, upsertEnvironment, deleteEnvironment, getDb,
  getAllPrompts, upsertPrompt, getAiFeatures, setAiFeatures, getSetting, setSetting,
} from '../storage/db';
import {
  listWorkspaces, getWorkspace, ensureWorkspace, setWorkspaceShared, deleteWorkspace, withWorkspace,
  createWorkspace, setWorkspaceDocs,
  type WorkspaceRow,
} from '../storage/workspaces';
import { redactHistoryRow, REDACTED } from './sync-redact';
import { loadSavedConfigs, saveConfigs } from '../mock/mock-server-manager';

const execFile = promisify(execFileCb);

const SYNC_PROTOCOLS = ['rest', 'graphql', 'websocket', 'grpc', 'soap', 'ai', 'mcp'];

const SM_COL_MACHINE = 'sm_machine';
const SM_COL_FOLDER = 'sm_folder';
const SM_COL_TODO = 'sm_todo';

const SETTING_AI_PROVIDERS = 'aiProviders';
const SETTING_AI_DEFAULT_PROVIDER = 'aiDefaultProvider';
const SETTING_AI_DEFAULT_MODEL = 'aiDefaultModel';

let _exporting = false;
let _exportTimer: ReturnType<typeof setTimeout> | undefined;
let _importTimer: ReturnType<typeof setTimeout> | undefined;
let _autoSyncTimer: ReturnType<typeof setInterval> | undefined;

/** True while a clone/sync cycle is actively running git commands against the local repo.
 * Every entry point that touches the repo (`ensureGitRepo`, `gitSyncNow`, `getGitStatus`) checks
 * this first — only one git operation ever runs against the repo at a time, no exceptions. */
let _syncInProgress = false;

function config() {
  return vscode.workspace.getConfiguration('daakia');
}

/*
  ── Where these settings live, and why not VS Code's settings ──

  They used to be VS Code settings, written with `ConfigurationTarget.Workspace`.
  That tied them to whichever folder happened to be open: with no folder open,
  saving failed outright, and opening a different folder showed a Git Sync that
  had never been configured — for a sync whose folder, a few lines up, is
  deliberately machine-global and "never depends on which VS Code workspace is
  open". The browser build could not read them at all, because it has no VS
  Code settings.

  Everything else Daakia keeps — collections, environments, themes, history —
  lives in its own database, and now these do too, under one `app_settings`
  key. Same answer in every window, every folder and both builds.

  The first read after the move copies whatever VS Code's settings held (any
  scope) into the database once, so an existing setup survives the upgrade.
*/
const SETTINGS_KEY = 'gitSync';

interface StoredGitSync {
  autoSyncSeconds: number;
  remoteUrl: string;
  branch: string;
  syncHistory: boolean;
  syncCollections: boolean;
  syncMockServers: boolean;
  syncEnvironments: boolean;
  syncAiConfig: boolean;
  syncThemes: boolean;
}

const DEFAULT_SYNC: StoredGitSync = {
  autoSyncSeconds: 0,
  remoteUrl: '',
  branch: 'main',
  syncHistory: true,
  syncCollections: true,
  syncMockServers: true,
  syncEnvironments: true,
  syncAiConfig: true,
  syncThemes: true,
};

function stored(): StoredGitSync {
  const saved = getSetting<Partial<StoredGitSync>>(SETTINGS_KEY);
  if (saved) return { ...DEFAULT_SYNC, ...saved };

  /* Nothing in the database yet: carry VS Code's values over, once. */
  const c = config();
  const legacy: StoredGitSync = {
    autoSyncSeconds: c.get<number>('gitSync.autoSyncSeconds', 0) || 0,
    remoteUrl: (c.get<string>('gitSync.remoteUrl', '') || '').trim(),
    branch: (c.get<string>('gitSync.branch', 'main') || 'main').trim() || 'main',
    syncHistory: c.get<boolean>('gitSync.syncHistory', true),
    syncCollections: c.get<boolean>('gitSync.syncCollections', true),
    syncMockServers: c.get<boolean>('gitSync.syncMockServers', true),
    syncEnvironments: c.get<boolean>('gitSync.syncEnvironments', true),
    syncAiConfig: c.get<boolean>('gitSync.syncAiConfig', true),
    syncThemes: c.get<boolean>('gitSync.syncThemes', true),
  };
  setSetting(SETTINGS_KEY, legacy);
  return legacy;
}

/** Seconds between full auto-syncs; 0 = off. Replaces the old boolean `gitSync.enabled`. */
export function getAutoSyncSeconds(): number {
  return stored().autoSyncSeconds || 0;
}

export function isGitSyncEnabled(): boolean {
  return getAutoSyncSeconds() > 0;
}

/** Fixed, machine-global base directory — never depends on which (if any) VS Code workspace is open. */
function getSyncBaseDir(): string {
  /* The e2e harness points this at a temp folder, the way it does the
     database, so a test sync can never touch a real clone. */
  if (process.env.DAAKIA_TEST_SYNC_DIR) return process.env.DAAKIA_TEST_SYNC_DIR;
  return path.join(os.homedir(), '.salilvnair', 'daakia-vsce');
}

/** The local git working directory — a clone of the configured remote, always named `daakia-vsce-git`. */
export function getSyncFolder(): string {
  return path.join(getSyncBaseDir(), 'daakia-vsce-git');
}

export function getRemoteUrl(): string {
  return stored().remoteUrl.trim();
}

export function getBranch(): string {
  return stored().branch.trim() || 'main';
}

export interface GitSyncScope {
  history: boolean;
  collections: boolean;
  mockServers: boolean;
  environments: boolean;
  aiConfig: boolean;
  themes: boolean;
}

/** Which data categories are included in export/import — all default on. */
export function getSyncScope(): GitSyncScope {
  const s = stored();
  return {
    history: s.syncHistory,
    collections: s.syncCollections,
    mockServers: s.syncMockServers,
    environments: s.syncEnvironments,
    aiConfig: s.syncAiConfig,
    themes: s.syncThemes,
  };
}

/** Merge a partial update into the stored settings. Only keys actually given change. */
export async function saveGitSyncSettings(patch: Partial<StoredGitSync>): Promise<void> {
  const next = { ...stored() };
  /* Only the keys this file owns. The screen sends back everything it was
     given, including the read-only `localPath`, and storing that would put a
     second, stale copy of a computed path in the database. */
  for (const [key, value] of Object.entries(patch) as [keyof StoredGitSync, unknown][]) {
    if (value !== undefined && key in DEFAULT_SYNC) (next as Record<string, unknown>)[key] = value;
  }
  setSetting(SETTINGS_KEY, next);
}

// ─── Layout: one folder per person ────────────────────────────────────────────
//
//   users/<id>/profile.json                       who this is
//   users/<id>/private/common/*.daakia.json       themes, mock servers, state machines, AI config
//   users/<id>/private/workspaces/<ws>/…          every workspace: collections, environments, history
//   users/<id>/shared/<ws>/workspace.daakia.json  the workspaces they chose to share
//
// ── Why a folder each ──
//
// The first layout was one set of files for everybody, and history was a
// single file every sync appended to. Two people sending requests between
// syncs both changed it, git could not merge the two appends, and the rebase
// stopped — then stopped again on every retry, forever. Real concurrent use
// broke on the first day.
//
// A sync now writes only its own folder. No two people ever edit the same
// file, so there is nothing for git to merge and nothing to conflict.
//
// ── Private, and what that means ──
//
// Daakia imports your own `private/` (your other machines, same sync id) and
// nobody else's. That is private *from the app*: anyone who can clone the repo
// can still read the files. Hence environments leave with secret values
// redacted, and history with credentials redacted (see sync-redact.ts).
//
// ── Shared ──
//
// A workspace you mark shared is also written, collections and environments
// only, to `shared/`. Teammates get it as a read-only workspace under your
// name, rebuilt from your folder on every sync; stop sharing it and it
// disappears from theirs on their next sync.

export const USERS_DIR = 'users';

function usersRoot(): string { return path.join(getSyncFolder(), USERS_DIR); }
function userDir(id: string): string { return path.join(usersRoot(), id); }
function privateDir(id: string): string { return path.join(userDir(id), 'private'); }
function commonDir(id: string): string { return path.join(privateDir(id), 'common'); }
function workspacesDir(id: string): string { return path.join(privateDir(id), 'workspaces'); }
function sharedDir(id: string): string { return path.join(userDir(id), 'shared'); }

function writeJson(file: string, doc: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', 'utf8');
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function subdirs(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  } catch {
    return [];
  }
}

/** Ids end up as folder names; anything that could climb out of one is refused. */
function safeSegment(id: string): boolean {
  return /^[A-Za-z0-9._-]{1,128}$/.test(id) && id !== '.' && id !== '..';
}

// ─── Identity ────────────────────────────────────────────────────────────────

export interface SyncIdentity {
  /** A UUID minted on first use. The name of your folder in the repo. */
  id: string;
  /** Git's global user.name, or this machine's user when git has none. */
  name: string;
}

const IDENTITY_KEY = 'gitSyncIdentity';

function osUserName(): string {
  try { return os.userInfo().username || 'daakia'; } catch { return 'daakia'; }
}

/**
 * Who this install is in the sync repo. Minted once and kept, so your folder
 * stays yours across restarts — the id never changes unless you link this
 * machine to another one's.
 */
export function getSyncIdentity(): SyncIdentity {
  const saved = getSetting<Partial<SyncIdentity>>(IDENTITY_KEY);
  if (saved?.id && safeSegment(saved.id)) return { id: saved.id, name: saved.name || osUserName() };
  const fresh: SyncIdentity = { id: randomUUID(), name: saved?.name || osUserName() };
  setSetting(IDENTITY_KEY, fresh);
  return fresh;
}

/**
 * Refresh the display name from `git config --global user.name`.
 *
 * Asked every sync rather than once, so setting a git name later shows up
 * without anyone touching Daakia. Falls back to the OS user, never to blank.
 */
export async function refreshSyncIdentityName(): Promise<SyncIdentity> {
  const current = getSyncIdentity();
  let name = '';
  try {
    name = (await execFile('git', ['config', '--global', 'user.name'], { cwd: os.homedir(), timeout: 5_000 })).stdout.trim();
  } catch { /* no global name — that is what the fallback is for */ }
  const next = { ...current, name: name || osUserName() };
  if (next.name !== current.name) setSetting(IDENTITY_KEY, next);
  return next;
}

/**
 * Use another machine's sync id on this one, so both read and write one
 * private folder. The id is the only thing that links them; there is no
 * account behind it.
 */
export function setSyncIdentityId(id: string): { ok: boolean; message: string } {
  const clean = id.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
    return { ok: false, message: 'That is not a sync id. Copy it from the other machine\'s Git Sync settings.' };
  }
  setSetting(IDENTITY_KEY, { ...getSyncIdentity(), id: clean.toLowerCase() });
  /* The folder that was ours on the remote is no longer the one we compare
     against, so the next sync must read it in before writing over it. */
  setSetting(STATE_KEY, {});
  return { ok: true, message: 'Linked. The next sync brings in that id\'s private data.' };
}

// ─── Private: collections, environments, history per workspace ──────────────

interface WorkspaceMeta {
  version: string;
  kind: 'workspace';
  id: string;
  name: string;
  color: string | null;
  docs: string | null;
  shared: boolean;
}

interface SyncEnvVariable { id: string; key: string; initialValue: string; currentValue: string; isSecret?: boolean }
interface SyncEnvironment { id: string; name: string; isActive: boolean; variables: SyncEnvVariable[] }

/** The active workspace's environments, secret values redacted. */
function readEnvironments(): SyncEnvironment[] {
  return getAllEnvironments().map(r => {
    let variables: SyncEnvVariable[] = [];
    try { variables = JSON.parse(r.variables || '[]'); } catch { /* ignore malformed row */ }
    return {
      id: r.id,
      name: r.name,
      isActive: r.is_active === 1,
      variables: variables.map(v => v.isSecret ? { ...v, initialValue: REDACTED, currentValue: REDACTED } : v),
    };
  });
}

/**
 * Merge environments into the active workspace by id, variables by key.
 *
 * A `REDACTED` secret never overwrites a local value: the local one is kept,
 * or left blank if there was none, so whoever is importing knows to fill it in.
 * Non-secret variables replace as-is.
 */
function mergeEnvironments(envs: SyncEnvironment[], idOf: (id: string) => string = id => id): number {
  const existingById = new Map(getAllEnvironments().map(r => [r.id, r]));
  let count = 0;
  for (const env of envs) {
    if (!env || typeof env.id !== 'string' || !Array.isArray(env.variables)) continue;
    const id = idOf(env.id);
    const existing = existingById.get(id);
    let existingVars: SyncEnvVariable[] = [];
    if (existing) { try { existingVars = JSON.parse(existing.variables || '[]'); } catch { /* ignore */ } }
    const existingByKey = new Map(existingVars.map(v => [v.key, v]));

    const variables = env.variables.map(v => {
      if (v.isSecret && v.initialValue === REDACTED) {
        return existingByKey.get(v.key) ?? { ...v, initialValue: '', currentValue: '' };
      }
      return v;
    });

    upsertEnvironment({
      id, name: env.name, variables: JSON.stringify(variables),
      is_active: existing ? existing.is_active : (env.isActive ? 1 : 0),
    });
    count++;
  }
  return count;
}

function upsertTree(nodes: CollectionTreeNode[], protocol: string, parentId: string | null, idOf: (id: string) => string = id => id): number {
  let count = 0;
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string') continue;
    const id = idOf(node.id);
    upsertCollection(id, node.name, parentId, protocol);
    for (const req of node.requests ?? []) {
      upsertCollectionRequest({ ...req, id: idOf(req.id), collection_id: id });
      count++;
    }
    count += upsertTree(node.children ?? [], protocol, id, idOf);
  }
  return count;
}

export interface SyncBundleCounts {
  workspaces: number;
  collections: number;
  history: number;
  mockServers: number;
  stateMachines: number;
  environments: number;
  aiConfig: number;
  themes: number;
  /** Workspaces you publish (export) or teammates' you received (import). */
  shared: number;
}

const zeroCounts = (): SyncBundleCounts => ({
  workspaces: 0, collections: 0, history: 0, mockServers: 0, stateMachines: 0,
  environments: 0, aiConfig: 0, themes: 0, shared: 0,
});

/** One of your workspaces, into its folder under `private/workspaces/`. */
function exportPrivateWorkspace(ws: WorkspaceRow, dir: string, scope: GitSyncScope, counts: SyncBundleCounts): void {
  const meta: WorkspaceMeta = {
    version: '1.0', kind: 'workspace', id: ws.id, name: ws.name,
    color: ws.color, docs: ws.docs, shared: ws.shared === 1,
  };
  writeJson(path.join(dir, 'workspace.json'), meta);
  counts.workspaces++;

  withWorkspace(ws.id, () => {
    if (scope.collections) {
      for (const protocol of SYNC_PROTOCOLS) {
        const tree = getCollectionTree(protocol);
        if (tree.length === 0) continue;
        writeJson(path.join(dir, `${protocol}.daakia.json`), { version: '1.0', protocol, collections: tree });
        counts.collections++;
      }
    }
    if (scope.environments) {
      const environments = readEnvironments();
      if (environments.length > 0) {
        writeJson(path.join(dir, 'environments.daakia.json'), { version: '1.0', kind: 'environments', environments });
        counts.environments += environments.length;
      }
    }
    if (scope.history) {
      const entries = getHistory(100_000, 0).map(row => redactHistoryRow(row));
      if (entries.length > 0) {
        writeJson(path.join(dir, 'history.daakia.json'), { version: '1.0', kind: 'history', entries });
        counts.history += entries.length;
      }
    }
  });
}

function importPrivateWorkspace(dir: string, scope: GitSyncScope, counts: SyncBundleCounts): void {
  const meta = readJson<WorkspaceMeta>(path.join(dir, 'workspace.json'));
  if (!meta || meta.kind !== 'workspace' || typeof meta.id !== 'string' || !safeSegment(meta.id)) return;
  /* Somebody else's copy of a workspace can never be overwritten by your own
     private data, even if the ids somehow matched. */
  const local = getWorkspace(meta.id);
  if (local?.owner_id) return;

  ensureWorkspace({ id: meta.id, name: meta.name || 'Workspace', color: meta.color, docs: meta.docs });
  setWorkspaceShared(meta.id, !!meta.shared);
  counts.workspaces++;

  withWorkspace(meta.id, () => {
    if (scope.collections) {
      for (const protocol of SYNC_PROTOCOLS) {
        const doc = readJson<{ collections?: CollectionTreeNode[] }>(path.join(dir, `${protocol}.daakia.json`));
        if (Array.isArray(doc?.collections)) counts.collections += upsertTree(doc.collections, protocol, null);
      }
    }
    if (scope.environments) {
      const doc = readJson<{ environments?: SyncEnvironment[] }>(path.join(dir, 'environments.daakia.json'));
      if (Array.isArray(doc?.environments)) counts.environments += mergeEnvironments(doc.environments);
    }
    if (scope.history) {
      const doc = readJson<{ entries?: Parameters<typeof insertHistoryIfNew>[0][] }>(path.join(dir, 'history.daakia.json'));
      for (const entry of doc?.entries ?? []) {
        if (entry && insertHistoryIfNew(entry)) counts.history++;
      }
    }
  });
}

// ─── Private: what is not in a workspace ─────────────────────────────────────
//
// Mock servers, state machines, AI config and themes are yours rather than a
// project's (see workspaces.ts), so they sit beside the workspaces, not in one.

function exportCommon(dir: string, scope: GitSyncScope, counts: SyncBundleCounts): void {
  if (scope.mockServers) {
    const configs = loadSavedConfigs();
    if (configs.length > 0) {
      writeJson(path.join(dir, 'mock-servers.daakia.json'), { version: '1.0', kind: 'mock-servers', configs });
      counts.mockServers = configs.length;
    }

    const machines = findAll<Record<string, unknown>>(SM_COL_MACHINE);
    const folders = findAll<Record<string, unknown>>(SM_COL_FOLDER);
    const todosBlob = findAll<{ items?: unknown[] }>(SM_COL_TODO);
    const todos = todosBlob.find(b => Array.isArray(b.items))?.items ?? [];
    if (machines.length > 0 || folders.length > 0 || todos.length > 0) {
      writeJson(path.join(dir, 'state-machine.daakia.json'), { version: '1.0', kind: 'state-machine', machines, folders, todos });
      counts.stateMachines = machines.length;
    }
  }

  if (scope.aiConfig) {
    /* Provider *config* only — base URLs, models, defaults. API keys live in
       the OS keychain (secret-store.ts) and are never read here. */
    const prompts = getAllPrompts();
    const aiProviders = getSetting<unknown>(SETTING_AI_PROVIDERS) ?? null;
    if (prompts.length > 0 || aiProviders !== null) {
      writeJson(path.join(dir, 'ai-config.daakia.json'), {
        version: '1.0', kind: 'ai-config', prompts, aiFeatures: getAiFeatures(), aiProviders,
        aiDefaultProvider: getSetting<string>(SETTING_AI_DEFAULT_PROVIDER) ?? null,
        aiDefaultModel: getSetting<string>(SETTING_AI_DEFAULT_MODEL) ?? null,
      });
      counts.aiConfig = prompts.length;
    }
  }

  if (scope.themes) {
    /* Only the palettes somebody made or imported. Daakia's own are code,
       identical in every install. A theme is colours and a name — no secrets. */
    const read = (kind: 'app' | 'terminal'): ThemePayload[] => getThemes(kind)
      .map(row => {
        try {
          const parsed = JSON.parse(row.payload) as ThemePayload;
          return parsed && typeof parsed === 'object' ? { ...parsed, id: row.id, label: row.label } : null;
        } catch { return null; }
      })
      .filter((t): t is ThemePayload => t !== null);
    const app = read('app');
    const terminal = read('terminal');
    if (app.length + terminal.length > 0) {
      writeJson(path.join(dir, 'themes.daakia.json'), { version: '1.0', kind: 'themes', app, terminal });
      counts.themes = app.length + terminal.length;
    }
  }
}

function importCommon(dir: string, scope: GitSyncScope, counts: SyncBundleCounts): void {
  if (scope.mockServers) {
    const mocks = readJson<{ configs?: unknown[] }>(path.join(dir, 'mock-servers.daakia.json'));
    if (Array.isArray(mocks?.configs)) {
      saveConfigs(mocks.configs as Parameters<typeof saveConfigs>[0]);
      counts.mockServers = mocks.configs.length;
    }

    const sm = readJson<{
      machines?: Array<Record<string, unknown>>;
      folders?: Array<Record<string, unknown>>;
      todos?: Array<Record<string, unknown>>;
    }>(path.join(dir, 'state-machine.daakia.json'));
    for (const m of sm?.machines ?? []) {
      if (!m?.id) continue;
      upsert(SM_COL_MACHINE, m.id as string, m);
      counts.stateMachines++;
    }
    for (const f of sm?.folders ?? []) {
      if (f?.id) upsert(SM_COL_FOLDER, f.id as string, f);
    }
    if (Array.isArray(sm?.todos)) upsert(SM_COL_TODO, '__todos__', { items: sm.todos });
  }

  if (scope.aiConfig) {
    const ai = readJson<{
      prompts?: Array<{ scenario: string; system_prompt: string; user_prompt?: string; agent_name?: string }>;
      aiFeatures?: Record<string, boolean>;
      aiProviders?: unknown;
      aiDefaultProvider?: string | null;
      aiDefaultModel?: string | null;
    }>(path.join(dir, 'ai-config.daakia.json'));
    if (ai) {
      for (const p of ai.prompts ?? []) {
        if (!p?.scenario) continue;
        upsertPrompt(p.scenario, { scenario: p.scenario, system_prompt: p.system_prompt, user_prompt: p.user_prompt, agent_name: p.agent_name });
        counts.aiConfig++;
      }
      if (ai.aiFeatures) setAiFeatures(ai.aiFeatures as unknown as Parameters<typeof setAiFeatures>[0]);
      if (ai.aiProviders !== undefined && ai.aiProviders !== null) setSetting(SETTING_AI_PROVIDERS, ai.aiProviders);
      if (ai.aiDefaultProvider) setSetting(SETTING_AI_DEFAULT_PROVIDER, ai.aiDefaultProvider);
      if (ai.aiDefaultModel) setSetting(SETTING_AI_DEFAULT_MODEL, ai.aiDefaultModel);
    }
  }

  if (scope.themes) {
    /* Upsert by id: a theme is one object with one owner, so the last one
       synced wins and there is no per-field merge to get wrong. */
    const doc = readJson<{ app?: ThemePayload[]; terminal?: ThemePayload[] }>(path.join(dir, 'themes.daakia.json'));
    for (const kind of ['app', 'terminal'] as const) {
      const list = doc?.[kind];
      if (!Array.isArray(list)) continue;
      for (const theme of list) {
        if (!theme || typeof theme !== 'object') continue;
        const id = typeof theme.id === 'string' ? theme.id : '';
        const label = typeof theme.label === 'string' ? theme.label : '';
        if (!id || !label) continue;
        upsertTheme(kind, { id, label, payload: JSON.stringify(theme) });
        counts.themes++;
      }
    }
  }
}

// ─── Shared workspaces ───────────────────────────────────────────────────────

interface SharedWorkspaceDoc {
  version: string;
  kind: 'shared-workspace';
  owner: { id: string; name: string };
  workspace: { id: string; name: string; color: string | null; docs: string | null };
  collections: Record<string, CollectionTreeNode[]>;
  environments: SyncEnvironment[];
}

const SHARED_FILE = 'workspace.daakia.json';

function exportSharedWorkspace(ws: WorkspaceRow, me: SyncIdentity): void {
  const doc = withWorkspace(ws.id, (): SharedWorkspaceDoc => {
    const collections: Record<string, CollectionTreeNode[]> = {};
    for (const protocol of SYNC_PROTOCOLS) {
      const tree = getCollectionTree(protocol);
      if (tree.length > 0) collections[protocol] = tree;
    }
    return {
      version: '1.0',
      kind: 'shared-workspace',
      owner: { id: me.id, name: me.name },
      workspace: { id: ws.id, name: ws.name, color: ws.color, docs: ws.docs },
      collections,
      environments: readEnvironments(),
    };
  });
  writeJson(path.join(sharedDir(me.id), ws.id, SHARED_FILE), doc);
}

/**
 * The local id of a teammate's workspace, collection, request or environment.
 *
 * Namespaced by owner because ids are only unique per install: every install's
 * first workspace is `ws-default`, and a teammate's collection id landing on
 * one of yours would update *your* row — `upsertCollection` keeps the
 * workspace a row already has. Deterministic, so a re-import lands on the same
 * rows and an open tab keeps pointing at the right request.
 */
export function sharedLocalId(ownerId: string, id: string): string {
  return `sh-${ownerId.slice(0, 8)}-${id}`;
}

export function sharedWorkspaceLocalId(ownerId: string, wsId: string): string {
  return `shared-${ownerId}-${wsId}`;
}

/**
 * Rebuild one teammate's workspace from their file.
 *
 * Rebuilt rather than merged: it is read-only here, so their file is the whole
 * truth, and a collection they deleted must go. Only environment secrets are
 * kept, because those are the one thing you are expected to fill in yourself.
 */
function importSharedWorkspace(doc: SharedWorkspaceDoc, ownerName: string): string | undefined {
  const ownerId = doc.owner?.id;
  const wsId = doc.workspace?.id;
  if (typeof ownerId !== 'string' || typeof wsId !== 'string' || !safeSegment(ownerId) || !safeSegment(wsId)) return undefined;

  const localId = sharedWorkspaceLocalId(ownerId, wsId);
  const idOf = (id: string) => sharedLocalId(ownerId, id);
  ensureWorkspace({
    id: localId, name: doc.workspace.name || 'Shared workspace',
    color: doc.workspace.color, docs: doc.workspace.docs,
    owner_id: ownerId, owner_name: ownerName,
  });

  const db = getDb();
  withWorkspace(localId, () => {
    if (db) {
      db.run(`DELETE FROM collection_requests WHERE collection_id IN
                (SELECT id FROM collections WHERE workspace_id = ?)`, [localId]);
      db.run('DELETE FROM collections WHERE workspace_id = ?', [localId]);
    }
    for (const [protocol, tree] of Object.entries(doc.collections ?? {})) {
      if (SYNC_PROTOCOLS.includes(protocol) && Array.isArray(tree)) upsertTree(tree, protocol, null, idOf);
    }

    const envs = Array.isArray(doc.environments) ? doc.environments : [];
    const keep = new Set(envs.map(e => idOf(e.id)));
    for (const row of getAllEnvironments()) {
      if (!keep.has(row.id)) deleteEnvironment(row.id);
    }
    mergeEnvironments(envs, idOf);
  });
  return localId;
}

// ─── The team ────────────────────────────────────────────────────────────────

interface ProfileDoc { version: string; kind: 'profile'; id: string; name: string }

export interface TeamMember {
  id: string;
  name: string;
  isMe: boolean;
  /** What they share. `imported` when you have added it to your workspaces. */
  shared: { id: string; name: string; imported: boolean }[];
}

/** Everybody with a folder in the repo, and what each of them shares. */
export function listTeam(): TeamMember[] {
  const me = getSyncIdentity();
  const team: TeamMember[] = [];
  for (const id of subdirs(usersRoot())) {
    if (!safeSegment(id)) continue;
    const profile = readJson<ProfileDoc>(path.join(userDir(id), 'profile.json'));
    const shared = subdirs(sharedDir(id)).flatMap(ws => {
      const doc = readJson<SharedWorkspaceDoc>(path.join(sharedDir(id), ws, SHARED_FILE));
      return doc?.workspace?.name
        ? [{ id: ws, name: doc.workspace.name, imported: !!getWorkspace(sharedWorkspaceLocalId(id, ws)) }]
        : [];
    });
    team.push({ id, name: profile?.name || id.slice(0, 8), isMe: id === me.id, shared });
  }
  return team.sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));
}

// ─── The whole of it ─────────────────────────────────────────────────────────

/**
 * Rewrite your folder from the database.
 *
 * The folder is deleted and written fresh rather than patched, which is what
 * makes deletions travel: a workspace you removed, or stopped sharing, is
 * simply not written again.
 */
export function exportFullBundle(): SyncBundleCounts {
  const me = getSyncIdentity();
  const scope = getSyncScope();
  const counts = zeroCounts();

  _exporting = true;
  try {
    fs.rmSync(userDir(me.id), { recursive: true, force: true });
    writeJson(path.join(userDir(me.id), 'profile.json'), { version: '1.0', kind: 'profile', id: me.id, name: me.name } satisfies ProfileDoc);

    const mine = listWorkspaces().filter(ws => !ws.owner_id);
    for (const ws of mine) {
      if (!safeSegment(ws.id)) continue;
      exportPrivateWorkspace(ws, path.join(workspacesDir(me.id), ws.id), scope, counts);
      if (ws.shared === 1) {
        exportSharedWorkspace(ws, me);
        counts.shared++;
      }
    }
    exportCommon(commonDir(me.id), scope, counts);
  } finally {
    // let watcher events from our own writes settle before re-enabling import
    setTimeout(() => { _exporting = false; }, 500);
  }
  return counts;
}

/** Your own private data — written by this machine, or another one using your sync id. */
export function importPrivateBundle(): SyncBundleCounts {
  const me = getSyncIdentity();
  const scope = getSyncScope();
  const counts = zeroCounts();
  if (!fs.existsSync(privateDir(me.id))) return counts;

  for (const ws of subdirs(workspacesDir(me.id))) {
    importPrivateWorkspace(path.join(workspacesDir(me.id), ws), scope, counts);
  }
  importCommon(commonDir(me.id), scope, counts);
  return counts;
}

/** A teammate's shared workspace file in the clone, or undefined. */
function readSharedDoc(ownerId: string, wsId: string): { doc: SharedWorkspaceDoc; ownerName: string } | undefined {
  if (!safeSegment(ownerId) || !safeSegment(wsId)) return undefined;
  const doc = readJson<SharedWorkspaceDoc>(path.join(sharedDir(ownerId), wsId, SHARED_FILE));
  if (!doc || doc.kind !== 'shared-workspace' || doc.owner?.id !== ownerId) return undefined;
  const profile = readJson<ProfileDoc>(path.join(userDir(ownerId), 'profile.json'));
  return { doc, ownerName: profile?.name || doc.owner.name || ownerId.slice(0, 8) };
}

/**
 * Refresh the teammates' workspaces you have imported — and only those.
 *
 * Sharing offers a workspace; it does not push it into anybody's switcher.
 * You pick it from Import shared, and from then on every sync rebuilds your
 * copy from its owner's folder. If they stop sharing it, your copy goes.
 * Removing your copy is how you stop following it: nothing re-adds it.
 */
export function importSharedFromTeam(): number {
  let refreshed = 0;
  for (const ws of listWorkspaces()) {
    if (!ws.owner_id) continue;
    const prefix = `shared-${ws.owner_id}-`;
    const found = ws.id.startsWith(prefix) ? readSharedDoc(ws.owner_id, ws.id.slice(prefix.length)) : undefined;
    if (found && importSharedWorkspace(found.doc, found.ownerName)) refreshed++;
    else deleteWorkspace(ws.id);
  }
  return refreshed;
}

/** Shared workspaces teammates offer that you have not imported. */
export function countSharedAvailable(): number {
  return listTeam().filter(m => !m.isMe).reduce((n, m) => n + m.shared.filter(s => !s.imported).length, 0);
}

/**
 * Import one teammate's shared workspace into a read-only copy of your own.
 *
 * Read from the local clone, so it is whatever the last sync brought in. The
 * copy is yours to use — requests sent from it land in your history — but its
 * collections change only when the owner's do.
 */
/**
 * An editable copy in your own workspaces — the other way to take something
 * a teammate shares.
 *
 * From a read-only copy you already have (so the secret values you filled in
 * come along), or straight from their shared file. Every id is new: the copy
 * is yours, it does not follow their changes, and nothing you do to it can
 * land on their rows or on the read-only copy's.
 */
export function copyWorkspaceToMine(source: { id?: string; ownerId?: string; workspaceId?: string }): { ok: boolean; id?: string; message: string } {
  let name = '';
  let docs: string | null = null;
  let collections: Record<string, CollectionTreeNode[]> = {};
  let environments: { name: string; isActive: boolean; variables: SyncEnvVariable[] }[] = [];

  if (source.id) {
    const ws = getWorkspace(source.id);
    if (!ws) return { ok: false, message: 'That workspace no longer exists.' };
    name = ws.name;
    docs = ws.docs;
    withWorkspace(ws.id, () => {
      for (const protocol of SYNC_PROTOCOLS) {
        const tree = getCollectionTree(protocol);
        if (tree.length > 0) collections[protocol] = tree;
      }
      environments = getAllEnvironments().map(r => {
        let variables: SyncEnvVariable[] = [];
        try { variables = JSON.parse(r.variables || '[]'); } catch { /* malformed row: no variables */ }
        return { name: r.name, isActive: r.is_active === 1, variables };
      });
    });
  } else {
    const found = readSharedDoc(String(source.ownerId ?? ''), String(source.workspaceId ?? ''));
    if (!found) return { ok: false, message: 'That workspace is no longer shared. Run Git Sync to refresh the list.' };
    name = found.doc.workspace.name;
    docs = found.doc.workspace.docs;
    collections = found.doc.collections ?? {};
    /* Their secrets arrive redacted; a copy starts them blank for you to fill. */
    environments = (found.doc.environments ?? []).map(e => ({
      name: e.name,
      isActive: e.isActive,
      variables: e.variables.map(v => v.isSecret && v.initialValue === REDACTED ? { ...v, initialValue: '', currentValue: '' } : v),
    }));
  }

  const created = createWorkspace(name || 'Copied workspace');
  if (!created) return { ok: false, message: 'Could not create the workspace.' };
  const fresh = new Map<string, string>();
  const idOf = (id: string) => {
    let next = fresh.get(id);
    if (!next) { next = randomUUID(); fresh.set(id, next); }
    return next;
  };

  withWorkspace(created.id, () => {
    for (const [protocol, tree] of Object.entries(collections)) {
      if (SYNC_PROTOCOLS.includes(protocol) && Array.isArray(tree)) upsertTree(tree, protocol, null, idOf);
    }
    for (const env of environments) {
      upsertEnvironment({ id: randomUUID(), name: env.name, variables: JSON.stringify(env.variables), is_active: env.isActive ? 1 : 0 });
    }
  });
  if (docs) setWorkspaceDocs(created.id, docs);

  return { ok: true, id: created.id, message: `Copied "${created.name}" into your workspaces. It is yours to change.` };
}

export function importSharedWorkspaceFromTeam(ownerId: string, wsId: string): { ok: boolean; id?: string; message: string } {
  if (ownerId === getSyncIdentity().id) return { ok: false, message: 'That is one of your own workspaces.' };
  const found = readSharedDoc(ownerId, wsId);
  if (!found) return { ok: false, message: 'That workspace is no longer shared. Run Git Sync to refresh the list.' };
  const id = importSharedWorkspace(found.doc, found.ownerName);
  return id
    ? { ok: true, id, message: `Imported ${found.doc.workspace.name} from ${found.ownerName}, read-only.` }
    : { ok: false, message: 'Could not import that workspace.' };
}

/** Both halves of an import. The watcher and "Import only" use this. */
export function importFullBundle(): SyncBundleCounts {
  const counts = importPrivateBundle();
  counts.shared = importSharedFromTeam();
  return counts;
}

/** Debounced write-through used after collection mutations when auto-sync is on. */
export function scheduleAutoExport(): void {
  if (!isGitSyncEnabled()) return;
  if (_exportTimer) clearTimeout(_exportTimer);
  _exportTimer = setTimeout(() => {
    if (!_syncInProgress) exportFullBundle();
  }, 1500);
}

/** The `daakia.exportCollectionsToWorkspace` command. Returns files written. */
export function exportCollectionsToWorkspace(): number {
  return exportFullBundle().collections;
}

/** The `daakia.importCollectionsFromWorkspace` command. Returns requests imported. */
export function importCollectionsFromWorkspace(): number {
  return importFullBundle().collections;
}

// ─── Watcher (auto mode) ──────────────────────────────────────────────────────

/** Watch the local clone and import external edits (e.g. after a manual `git pull`). */
export function initGitSyncWatcher(context: vscode.ExtensionContext, onImported?: () => void): void {
  const pattern = new vscode.RelativePattern(vscode.Uri.file(getSyncFolder()), `${USERS_DIR}/**/*.daakia.json`);
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  const onFsEvent = () => {
    /* A sync rewrites these files itself and imports as part of the cycle. */
    if (!isGitSyncEnabled() || _exporting || _syncInProgress) return;
    if (_importTimer) clearTimeout(_importTimer);
    _importTimer = setTimeout(() => {
      if (_syncInProgress) return;
      const n = importFullBundle();
      if (n.collections > 0 || n.shared > 0) onImported?.();
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

// ─── Real git operations (SSH sync) ────────────────────────────────────────────
//
// Everything below shells out to the user's own `git` binary via execFile (no
// shell, argv arrays only — never string-interpolated into a shell command).
// SSH auth is entirely the system git/ssh-agent's problem, same as VS Code's
// own Git extension or any other git GUI — Daakia never reads, stores, or
// touches an SSH private key.

export interface GitStatus {
  gitAvailable: boolean;
  isRepo: boolean;
  branch: string | null;
  hasRemote: boolean;
  ahead: number;
  behind: number;
  dirty: boolean;
  lastCommit: string | null;
  /** True while a sync cycle is actively running — status is not re-checked (git commands never
   * run concurrently against the same repo), so this is the only fresh field in that case. */
  syncing: boolean;
}

async function runGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return execFile('git', args, { cwd, timeout: 30_000, maxBuffer: 10 * 1024 * 1024 });
}

/**
 * The author for a sync commit, when git has none of its own.
 *
 * ── Why this is needed ──
 *
 * Plenty of machines have no global `user.name` / `user.email` — people set
 * them per repository, which is exactly what this machine does. The sync clone
 * is a repository Daakia creates, so it inherits nothing, and `git commit`
 * refuses with "unable to auto-detect email address". That surfaced as a raw
 * git error on the very first sync, with every file exported and staged and
 * nothing committed.
 *
 * Whatever identity git *does* have is always used — this only fills the gap,
 * per commit, via `-c`, so nothing is written to anybody's git config. The
 * fallback names the OS user so a teammate reading the log can still tell
 * whose machine a sync came from.
 */
async function commitIdentityArgs(cwd: string): Promise<string[]> {
  const has = async (key: string) => {
    try { return (await runGit(['config', key], cwd)).stdout.trim() !== ''; } catch { return false; }
  };
  const [name, email] = await Promise.all([has('user.name'), has('user.email')]);
  if (name && email) return [];
  const user = (() => { try { return os.userInfo().username; } catch { return 'daakia'; } })() || 'daakia';
  return [
    ...(name ? [] : ['-c', `user.name=${user} (Daakia sync)`]),
    ...(email ? [] : ['-c', `user.email=${user}@daakia-sync.local`]),
  ];
}

/**
 * Does the branch exist on the remote yet?
 *
 * A brand-new remote — which is what every first-time setup points at — has
 * no branches at all, so there is nothing to pull, and `pull --rebase origin
 * main` fails with "couldn't find remote ref". The sync treated that as a
 * conflict and stopped before pushing, so an empty remote could never receive
 * its first commit.
 */
async function remoteHasBranch(cwd: string, branch: string): Promise<boolean> {
  const { stdout } = await runGit(['ls-remote', '--heads', 'origin', branch], cwd);
  return stdout.trim() !== '';
}

export async function isGitAvailable(): Promise<boolean> {
  try {
    await execFile('git', ['--version'], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

function isRepoSync(folder: string): boolean {
  return fs.existsSync(path.join(folder, '.git'));
}

/** Full status snapshot for the local clone — used to drive the Settings UI. Never runs git
 * commands while a sync cycle is in progress (see `_syncInProgress`). */
export async function getGitStatus(): Promise<GitStatus> {
  const syncing = _syncInProgress;
  const empty: GitStatus = { gitAvailable: false, isRepo: false, branch: null, hasRemote: false, ahead: 0, behind: 0, dirty: false, lastCommit: null, syncing };
  if (syncing) return empty;

  const folder = getSyncFolder();
  const gitAvailable = await isGitAvailable();
  empty.gitAvailable = gitAvailable;
  if (!gitAvailable || !isRepoSync(folder)) return empty;

  try {
    const { stdout: branchOut } = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], folder);
    const branch = branchOut.trim();

    let hasRemote = false;
    try {
      const { stdout: remoteOut } = await runGit(['remote'], folder);
      hasRemote = remoteOut.split('\n').map(s => s.trim()).filter(Boolean).includes('origin');
    } catch { /* no remotes at all */ }

    let ahead = 0, behind = 0;
    if (hasRemote) {
      try {
        // Fetch is best-effort — offline or bad SSH auth shouldn't block showing local status.
        await runGit(['fetch', 'origin', branch], folder);
        const { stdout: countOut } = await runGit(['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`], folder);
        const [behindStr, aheadStr] = countOut.trim().split(/\s+/);
        behind = parseInt(behindStr, 10) || 0;
        ahead = parseInt(aheadStr, 10) || 0;
      } catch { /* no upstream yet, or fetch failed — leave at 0 */ }
    }

    const { stdout: statusOut } = await runGit(['status', '--porcelain'], folder);
    const dirty = statusOut.trim().length > 0;

    let lastCommit: string | null = null;
    try {
      const { stdout: logOut } = await runGit(['log', '-1', '--format=%h %s (%cr)'], folder);
      lastCommit = logOut.trim() || null;
    } catch { /* no commits yet */ }

    return { gitAvailable, isRepo: true, branch, hasRemote, ahead, behind, dirty, lastCommit, syncing: false };
  } catch {
    return { ...empty, isRepo: true };
  }
}

/** Clone the configured remote into the fixed local folder (or reuse it if already cloned), then
 * check out the target branch. `_syncInProgress`-guarded — never overlaps a running sync cycle. */
export async function ensureGitRepo(remoteUrl: string, branch: string): Promise<{ ok: boolean; message: string }> {
  if (_syncInProgress) return { ok: false, message: 'A sync is already in progress — try again shortly.' };
  if (!(await isGitAvailable())) return { ok: false, message: 'git was not found on PATH.' };
  if (!remoteUrl.trim()) return { ok: false, message: 'Remote SSH URL is required.' };

  const base = getSyncBaseDir();
  const repoDir = getSyncFolder();
  fs.mkdirSync(base, { recursive: true });

  _syncInProgress = true;
  try {
    if (!isRepoSync(repoDir)) {
      // Fresh clone — git creates the `daakia-vsce-git` folder itself.
      await runGit(['clone', remoteUrl, repoDir], base);
    } else {
      // Already cloned from a previous run — just make sure origin points at the configured URL.
      try {
        await runGit(['remote', 'set-url', 'origin', remoteUrl], repoDir);
      } catch {
        await runGit(['remote', 'add', 'origin', remoteUrl], repoDir);
      }
    }

    try {
      await runGit(['checkout', branch], repoDir);
    } catch {
      await runGit(['checkout', '-b', branch], repoDir);
    }

    return { ok: true, message: `Cloned and ready on branch "${branch}".` };
  } catch (err) {
    return { ok: false, message: describeGitError(err) };
  } finally {
    _syncInProgress = false;
  }
}

export interface SyncResult {
  ok: boolean;
  message: string;
  committed: boolean;
  pulled: boolean;
  pushed: boolean;
  /** Teammates' workspaces you imported, refreshed by this sync. */
  shared: number;
}

/** Where the last successful sync left the remote, so the next can tell if your folder moved. */
const STATE_KEY = 'gitSyncState';
interface SyncState { lastSyncedCommit?: string; identityId?: string }

/**
 * Did your folder change on the remote since this machine last synced?
 *
 * Only true when another machine using your sync id pushed — nobody else
 * writes there. That is the one case where your private data has to be read
 * in before this machine's copy is written over it. Otherwise it is skipped,
 * which is what keeps a local delete deleted: importing first would bring
 * back everything you had removed since the last sync.
 */
async function myFolderMoved(folder: string, me: SyncIdentity, remoteRef: string): Promise<boolean> {
  const state = getSetting<SyncState>(STATE_KEY) ?? {};
  const rel = `${USERS_DIR}/${me.id}`;
  if (!state.lastSyncedCommit || state.identityId !== me.id) {
    /* Never synced as this id here: whatever is there came from elsewhere. */
    return fs.existsSync(userDir(me.id));
  }
  try {
    await runGit(['diff', '--quiet', state.lastSyncedCommit, remoteRef, '--', rel], folder);
    return false;
  } catch (err) {
    /* Exit 1 means "differs". Anything else — the commit is gone after a
       force-push, say — is treated the same way: read it in, to be safe. */
    return (err as { code?: number }).code !== 0;
  }
}

function isRejectedPush(err: unknown): boolean {
  const text = `${(err as { stderr?: string }).stderr ?? ''} ${(err as Error).message ?? ''}`;
  return /rejected|non-fast-forward|fetch first|failed to push some refs/i.test(text);
}

/**
 * One sync: take the remote as it is, fold in what changed, write your
 * folder, push.
 *
 *   1. fetch, and reset the clone to the remote branch
 *   2. import your own folder — only if another machine of yours changed it
 *   3. export your folder fresh from the database
 *   4. import every teammate's shared workspaces
 *   5. commit and push; if someone pushed meanwhile, go round again
 *
 * ── Why a reset, not a pull ──
 *
 * The database is the source of truth and the clone is Daakia's own scratch
 * copy of the remote, so there is never local work in it to preserve — step 3
 * regenerates it. Resetting to the remote and re-writing your folder on top
 * cannot conflict, because nothing else in the repo is yours to write. The old
 * pull --rebase could, and a failed rebase then failed identically on every
 * retry, with no way out from inside the app.
 */
export async function gitSyncNow(): Promise<SyncResult> {
  const result: SyncResult = { ok: false, message: '', committed: false, pulled: false, pushed: false, shared: 0 };
  if (_syncInProgress) return { ...result, message: 'A sync is already in progress — try again shortly.' };

  const folder = getSyncFolder();
  const remoteUrl = getRemoteUrl();
  const branch = getBranch();
  if (!(await isGitAvailable())) return { ...result, message: 'git was not found on PATH.' };
  if (!isRepoSync(folder)) return { ...result, message: 'Not cloned yet — run "Initialize Repo" first.' };
  if (!remoteUrl) return { ...result, message: 'No remote SSH URL configured.' };

  _syncInProgress = true;
  _exporting = true;
  try {
    const me = await refreshSyncIdentityName();
    const identity = await commitIdentityArgs(folder);
    const remoteRef = `origin/${branch}`;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const remoteExists = await remoteHasBranch(folder, branch);
      if (remoteExists) {
        await runGit(['fetch', 'origin', branch], folder);
        await runGit(['checkout', '-B', branch, remoteRef], folder);
        await runGit(['reset', '--hard', remoteRef], folder);
        await runGit(['clean', '-fdq'], folder);
        result.pulled = true;
        if (await myFolderMoved(folder, me, remoteRef)) importPrivateBundle();
      }

      exportFullBundle();
      result.shared = importSharedFromTeam();

      await runGit(['add', '-A'], folder);
      const { stdout: statusOut } = await runGit(['status', '--porcelain'], folder);
      if (statusOut.trim().length > 0) {
        await runGit([...identity, 'commit', '-m', `Daakia: sync from ${me.name} (${new Date().toISOString()})`], folder);
        result.committed = true;
      }

      if (!result.committed && remoteExists) {
        /* Nothing of ours changed — there is nothing to push. */
        result.pushed = false;
      } else {
        try {
          await runGit(['push', '-u', 'origin', branch], folder);
          result.pushed = true;
        } catch (err) {
          /* Someone pushed between our fetch and our push. Their change is in
             their folder, ours in ours; fetching again and re-writing is all
             it takes. */
          if (isRejectedPush(err) && attempt < 3) { result.committed = false; continue; }
          throw err;
        }
      }

      const { stdout: head } = await runGit(['rev-parse', 'HEAD'], folder);
      setSetting(STATE_KEY, { lastSyncedCommit: head.trim(), identityId: me.id } satisfies SyncState);

      const available = countSharedAvailable();
      const offered = available === 0 ? ''
        : ` ${available} shared workspace${available === 1 ? '' : 's'} from teammates to import from the workspace menu.`;
      return { ...result, ok: true, message: `Synced as ${me.name}.${offered}` };
    }
    return { ...result, message: 'The remote kept changing while syncing. Try again in a moment.' };
  } catch (err) {
    return { ...result, message: describeGitError(err) };
  } finally {
    _syncInProgress = false;
    setTimeout(() => { _exporting = false; }, 500);
  }
}

/** Strip execFile's verbose Error wrapper down to the actual git stderr, which is what's useful to show. */
function describeGitError(err: unknown): string {
  const anyErr = err as { stderr?: string; message?: string };
  const stderr = (anyErr.stderr || '').trim();
  if (stderr) return stderr.split('\n').slice(-3).join(' ');
  return anyErr.message || 'Unknown git error';
}

// ─── Auto-sync timer ────────────────────────────────────────────────────────────
//
// Interval-driven (not debounced) — every `gitSync.autoSyncSeconds` seconds,
// runs a full gitSyncNow(). Owned by the MainPanel instance so it only runs
// while a Daakia panel is actually open, and is restarted whenever settings
// change (interval, remote, branch, scope).

/** Starts (or restarts) the auto-sync interval. Skips a tick entirely (no callback, no attempt)
 * if the previous cycle is still running — never overlaps two sync cycles. Calls `onTick` after
 * every attempt that actually ran, whether it succeeded or not, so the caller can broadcast fresh
 * data / update "last synced" in the UI. */
export function startAutoSyncTimer(onTick: (result: Awaited<ReturnType<typeof gitSyncNow>>) => void): void {
  stopAutoSyncTimer();
  const seconds = getAutoSyncSeconds();
  if (seconds <= 0) return;
  _autoSyncTimer = setInterval(() => {
    if (_syncInProgress) return; // previous cycle still running — skip this tick silently
    gitSyncNow().then(onTick).catch(() => { /* never let a bad tick kill the timer */ });
  }, seconds * 1000);
}

export function stopAutoSyncTimer(): void {
  if (_autoSyncTimer) {
    clearInterval(_autoSyncTimer);
    _autoSyncTimer = undefined;
  }
}
