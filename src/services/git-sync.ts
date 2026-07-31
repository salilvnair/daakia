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
import * as os from 'os';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import {
  getCollectionTree, upsertCollection, upsertCollectionRequest, type CollectionTreeNode,
  getHistory, insertHistoryIfNew, findAll, upsert,
  getAllEnvironments, upsertEnvironment,
  getAllPrompts, upsertPrompt, getAiFeatures, setAiFeatures, getSetting, setSetting,
} from '../storage/db';
import { loadSavedConfigs, saveConfigs } from '../mock/mock-server-manager';

const execFile = promisify(execFileCb);

const SYNC_PROTOCOLS = ['rest', 'graphql', 'websocket', 'grpc', 'soap', 'ai', 'mcp'];

const SM_COL_MACHINE = 'sm_machine';
const SM_COL_FOLDER = 'sm_folder';
const SM_COL_TODO = 'sm_todo';

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

/** Seconds between full auto-syncs; 0 = off. Replaces the old boolean `gitSync.enabled`. */
export function getAutoSyncSeconds(): number {
  return config().get<number>('gitSync.autoSyncSeconds', 0) || 0;
}

export function isGitSyncEnabled(): boolean {
  return getAutoSyncSeconds() > 0;
}

/** Fixed, machine-global base directory — never depends on which (if any) VS Code workspace is open. */
function getSyncBaseDir(): string {
  return path.join(os.homedir(), '.salilvnair', 'daakia-vsce');
}

/** The local git working directory — a clone of the configured remote, always named `daakia-vsce-git`. */
export function getSyncFolder(): string {
  return path.join(getSyncBaseDir(), 'daakia-vsce-git');
}

export function getRemoteUrl(): string {
  return config().get<string>('gitSync.remoteUrl', '').trim();
}

export function getBranch(): string {
  return config().get<string>('gitSync.branch', 'main').trim() || 'main';
}

export interface GitSyncScope {
  history: boolean;
  collections: boolean;
  mockServers: boolean;
  environments: boolean;
  aiConfig: boolean;
}

/** Which data categories are included in export/import — all default on. */
export function getSyncScope(): GitSyncScope {
  const c = config();
  return {
    history: c.get<boolean>('gitSync.syncHistory', true),
    collections: c.get<boolean>('gitSync.syncCollections', true),
    mockServers: c.get<boolean>('gitSync.syncMockServers', true),
    environments: c.get<boolean>('gitSync.syncEnvironments', true),
    aiConfig: c.get<boolean>('gitSync.syncAiConfig', true),
  };
}

export async function saveGitSyncSettings(patch: {
  autoSyncSeconds?: number; remoteUrl?: string; branch?: string;
  syncHistory?: boolean; syncCollections?: boolean; syncMockServers?: boolean;
  syncEnvironments?: boolean; syncAiConfig?: boolean;
}): Promise<void> {
  const c = config();
  const target = vscode.ConfigurationTarget.Workspace;
  if (patch.autoSyncSeconds !== undefined) await c.update('gitSync.autoSyncSeconds', patch.autoSyncSeconds, target);
  if (patch.remoteUrl !== undefined) await c.update('gitSync.remoteUrl', patch.remoteUrl, target);
  if (patch.branch !== undefined) await c.update('gitSync.branch', patch.branch, target);
  if (patch.syncHistory !== undefined) await c.update('gitSync.syncHistory', patch.syncHistory, target);
  if (patch.syncCollections !== undefined) await c.update('gitSync.syncCollections', patch.syncCollections, target);
  if (patch.syncMockServers !== undefined) await c.update('gitSync.syncMockServers', patch.syncMockServers, target);
  if (patch.syncEnvironments !== undefined) await c.update('gitSync.syncEnvironments', patch.syncEnvironments, target);
  if (patch.syncAiConfig !== undefined) await c.update('gitSync.syncAiConfig', patch.syncAiConfig, target);
}

// ─── Export ───────────────────────────────────────────────────────────────────

/** Write every protocol's collection tree into the sync folder. Returns file count. */
export function exportCollectionsToWorkspace(): number {
  const folder = getSyncFolder();
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
  if (!fs.existsSync(folder)) return 0;

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

// ─── History ──────────────────────────────────────────────────────────────────

/** Write every history row into history.daakia.json. Returns row count. */
export function exportHistoryToWorkspace(): number {
  const folder = getSyncFolder();
  fs.mkdirSync(folder, { recursive: true });

  const entries = getHistory(100_000, 0);
  const file = path.join(folder, 'history.daakia.json');
  if (entries.length === 0) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return 0;
  }
  fs.writeFileSync(file, JSON.stringify({ version: '1.0', kind: 'history', entries }, null, 2), 'utf8');
  return entries.length;
}

/** Import history.daakia.json — dedup-safe (request_id + created_at), never overwrites or deletes. */
export function importHistoryFromWorkspace(): number {
  const file = path.join(getSyncFolder(), 'history.daakia.json');
  if (!fs.existsSync(file)) return 0;

  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as { entries?: unknown[] };
    if (!Array.isArray(doc.entries)) return 0;
    let imported = 0;
    for (const entry of doc.entries as Parameters<typeof insertHistoryIfNew>[0][]) {
      if (insertHistoryIfNew(entry)) imported++;
    }
    return imported;
  } catch {
    return 0;
  }
}

// ─── Mock Server ──────────────────────────────────────────────────────────────

/** Write all mock server configs (routes + state-machine linkage) into mock-servers.daakia.json. */
export function exportMockServersToWorkspace(): number {
  const folder = getSyncFolder();
  fs.mkdirSync(folder, { recursive: true });

  const configs = loadSavedConfigs();
  const file = path.join(folder, 'mock-servers.daakia.json');
  if (configs.length === 0) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return 0;
  }
  fs.writeFileSync(file, JSON.stringify({ version: '1.0', kind: 'mock-servers', configs }, null, 2), 'utf8');
  return configs.length;
}

/** Import mock-servers.daakia.json — full replace (export always runs first in a sync cycle, so
 * anything local-only was already flushed to disk before this reads the post-pull merged file). */
export function importMockServersFromWorkspace(): number {
  const file = path.join(getSyncFolder(), 'mock-servers.daakia.json');
  if (!fs.existsSync(file)) return 0;

  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as { configs?: unknown[] };
    if (!Array.isArray(doc.configs)) return 0;
    saveConfigs(doc.configs as Parameters<typeof saveConfigs>[0]);
    return doc.configs.length;
  } catch {
    return 0;
  }
}

// ─── State Machine ──────────────────────────────────────────────────────────────

/** Write every state-machine workflow (machines/folders/todos) into state-machine.daakia.json. */
export function exportStateMachineToWorkspace(): number {
  const folder = getSyncFolder();
  fs.mkdirSync(folder, { recursive: true });

  const machines = findAll<Record<string, unknown>>(SM_COL_MACHINE);
  const folders = findAll<Record<string, unknown>>(SM_COL_FOLDER);
  const todosBlob = findAll<{ items?: unknown[] }>(SM_COL_TODO);
  const todos = todosBlob.find(b => Array.isArray(b.items))?.items ?? [];

  const file = path.join(folder, 'state-machine.daakia.json');
  if (machines.length === 0 && folders.length === 0 && todos.length === 0) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return 0;
  }
  fs.writeFileSync(file, JSON.stringify({ version: '1.0', kind: 'state-machine', machines, folders, todos }, null, 2), 'utf8');
  return machines.length;
}

/** Import state-machine.daakia.json — upserts by id, never deletes a locally-only workflow. */
export function importStateMachineFromWorkspace(): number {
  const file = path.join(getSyncFolder(), 'state-machine.daakia.json');
  if (!fs.existsSync(file)) return 0;

  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      machines?: Array<Record<string, unknown>>;
      folders?: Array<Record<string, unknown>>;
      todos?: Array<Record<string, unknown>>;
    };
    let count = 0;
    for (const m of doc.machines ?? []) {
      if (!m.id) continue;
      upsert(SM_COL_MACHINE, m.id as string, m);
      count++;
    }
    for (const f of doc.folders ?? []) {
      if (!f.id) continue;
      upsert(SM_COL_FOLDER, f.id as string, f);
    }
    if (Array.isArray(doc.todos)) {
      upsert(SM_COL_TODO, '__todos__', { items: doc.todos });
    }
    return count;
  } catch {
    return 0;
  }
}

// ─── Environments ─────────────────────────────────────────────────────────────
//
// Secret-flagged variable values are NEVER written to disk here — not even
// encrypted. Only the key survives (as `REDACTED`), same rule the Environments
// panel's own JSON/Postman/Bruno/Insomnia/HTTPie/Gist exports follow (see
// `redactSecrets()` in environment-handler.ts). Import never overwrites a local
// secret with the `REDACTED` placeholder — it keeps whatever's already local.

interface SyncEnvVariable { id: string; key: string; initialValue: string; currentValue: string; isSecret?: boolean }
interface SyncEnvironment { id: string; name: string; isActive: boolean; variables: SyncEnvVariable[] }

/** Write every environment into environments.daakia.json — secret values redacted. Returns count. */
export function exportEnvironmentsToWorkspace(): number {
  const folder = getSyncFolder();
  fs.mkdirSync(folder, { recursive: true });

  const rows = getAllEnvironments();
  const environments: SyncEnvironment[] = rows.map(r => {
    let variables: SyncEnvVariable[] = [];
    try { variables = JSON.parse(r.variables || '[]'); } catch { /* ignore malformed row */ }
    return {
      id: r.id,
      name: r.name,
      isActive: r.is_active === 1,
      variables: variables.map(v => v.isSecret ? { ...v, initialValue: 'REDACTED', currentValue: 'REDACTED' } : v),
    };
  });

  const file = path.join(folder, 'environments.daakia.json');
  if (environments.length === 0) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return 0;
  }
  fs.writeFileSync(file, JSON.stringify({ version: '1.0', kind: 'environments', environments }, null, 2), 'utf8');
  return environments.length;
}

/** Import environments.daakia.json — merges per-variable by key, never overwrites a local secret
 * value with the `REDACTED` placeholder (keeps the local value, or leaves it blank if there
 * wasn't one yet, so the teammate knows to fill it in). Non-secret variables replace as-is. */
export function importEnvironmentsFromWorkspace(): number {
  const file = path.join(getSyncFolder(), 'environments.daakia.json');
  if (!fs.existsSync(file)) return 0;

  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as { environments?: SyncEnvironment[] };
    if (!Array.isArray(doc.environments)) return 0;

    const existingById = new Map(getAllEnvironments().map(r => [r.id, r]));
    let count = 0;
    for (const env of doc.environments) {
      const existing = existingById.get(env.id);
      let existingVars: SyncEnvVariable[] = [];
      if (existing) { try { existingVars = JSON.parse(existing.variables || '[]'); } catch { /* ignore */ } }
      const existingByKey = new Map(existingVars.map(v => [v.key, v]));

      const mergedVariables = env.variables.map(v => {
        if (v.isSecret && v.initialValue === 'REDACTED') {
          return existingByKey.get(v.key) ?? { ...v, initialValue: '', currentValue: '' };
        }
        return v;
      });

      upsertEnvironment({
        id: env.id, name: env.name, variables: JSON.stringify(mergedVariables),
        is_active: existing ? existing.is_active : (env.isActive ? 1 : 0),
      });
      count++;
    }
    return count;
  } catch {
    return 0;
  }
}

// ─── AI Config (prompt library + AI feature flags + provider config) ──────────
//
// Provider *config* only — base URLs, model choices, default provider/model.
// AI provider API keys live exclusively in VS Code SecretStorage (OS keychain,
// see secret-store.ts) and are never read or written by this file.

const SETTING_AI_PROVIDERS = 'aiProviders';
const SETTING_AI_DEFAULT_PROVIDER = 'aiDefaultProvider';
const SETTING_AI_DEFAULT_MODEL = 'aiDefaultModel';

/** Write prompt library + AI feature flags + AI provider config into ai-config.daakia.json. */
export function exportAiConfigToWorkspace(): number {
  const folder = getSyncFolder();
  fs.mkdirSync(folder, { recursive: true });

  const prompts = getAllPrompts();
  const aiFeatures = getAiFeatures();
  const aiProviders = getSetting<unknown>(SETTING_AI_PROVIDERS) ?? null;
  const aiDefaultProvider = getSetting<string>(SETTING_AI_DEFAULT_PROVIDER) ?? null;
  const aiDefaultModel = getSetting<string>(SETTING_AI_DEFAULT_MODEL) ?? null;

  const file = path.join(folder, 'ai-config.daakia.json');
  if (prompts.length === 0 && aiProviders === null) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return 0;
  }
  fs.writeFileSync(file, JSON.stringify({
    version: '1.0', kind: 'ai-config', prompts, aiFeatures, aiProviders, aiDefaultProvider, aiDefaultModel,
  }, null, 2), 'utf8');
  return prompts.length;
}

/** Import ai-config.daakia.json — upserts prompts by scenario, full-replaces feature flags and
 * provider config (config only — never touches the actual API keys in SecretStorage). */
export function importAiConfigFromWorkspace(): number {
  const file = path.join(getSyncFolder(), 'ai-config.daakia.json');
  if (!fs.existsSync(file)) return 0;

  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      prompts?: Array<{ scenario: string; system_prompt: string; user_prompt?: string; agent_name?: string }>;
      aiFeatures?: Record<string, boolean>;
      aiProviders?: unknown;
      aiDefaultProvider?: string | null;
      aiDefaultModel?: string | null;
    };

    let count = 0;
    for (const p of doc.prompts ?? []) {
      if (!p.scenario) continue;
      upsertPrompt(p.scenario, { scenario: p.scenario, system_prompt: p.system_prompt, user_prompt: p.user_prompt, agent_name: p.agent_name });
      count++;
    }
    if (doc.aiFeatures) setAiFeatures(doc.aiFeatures as unknown as Parameters<typeof setAiFeatures>[0]);
    if (doc.aiProviders !== undefined && doc.aiProviders !== null) setSetting(SETTING_AI_PROVIDERS, doc.aiProviders);
    if (doc.aiDefaultProvider) setSetting(SETTING_AI_DEFAULT_PROVIDER, doc.aiDefaultProvider);
    if (doc.aiDefaultModel) setSetting(SETTING_AI_DEFAULT_MODEL, doc.aiDefaultModel);
    return count;
  } catch {
    return 0;
  }
}

// ─── Full bundle (scoped by getSyncScope()) ────────────────────────────────────

export interface SyncBundleCounts {
  collections: number;
  history: number;
  mockServers: number;
  stateMachines: number;
  environments: number;
  aiConfig: number;
}

export function exportFullBundle(): SyncBundleCounts {
  const scope = getSyncScope();
  return {
    collections: scope.collections ? exportCollectionsToWorkspace() : 0,
    history: scope.history ? exportHistoryToWorkspace() : 0,
    mockServers: scope.mockServers ? exportMockServersToWorkspace() : 0,
    stateMachines: scope.mockServers ? exportStateMachineToWorkspace() : 0,
    environments: scope.environments ? exportEnvironmentsToWorkspace() : 0,
    aiConfig: scope.aiConfig ? exportAiConfigToWorkspace() : 0,
  };
}

export function importFullBundle(): SyncBundleCounts {
  const scope = getSyncScope();
  return {
    collections: scope.collections ? importCollectionsFromWorkspace() : 0,
    history: scope.history ? importHistoryFromWorkspace() : 0,
    mockServers: scope.mockServers ? importMockServersFromWorkspace() : 0,
    stateMachines: scope.mockServers ? importStateMachineFromWorkspace() : 0,
    environments: scope.environments ? importEnvironmentsFromWorkspace() : 0,
    aiConfig: scope.aiConfig ? importAiConfigFromWorkspace() : 0,
  };
}

// ─── Watcher (auto mode) ──────────────────────────────────────────────────────

/** Watch the local clone folder and import external edits (e.g. after a manual `git pull`). */
export function initGitSyncWatcher(context: vscode.ExtensionContext, onImported?: () => void): void {
  const pattern = new vscode.RelativePattern(vscode.Uri.file(getSyncFolder()), '*.daakia.json');
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

/** Export → commit anything changed → pull --rebase → push → import (pick up what was pulled).
 * `_syncInProgress`-guarded — a sync already running short-circuits immediately instead of
 * running a second set of git commands against the same working directory. */
export async function gitSyncNow(): Promise<{ ok: boolean; message: string; committed: boolean; pulled: boolean; pushed: boolean }> {
  const result = { ok: false, message: '', committed: false, pulled: false, pushed: false };
  if (_syncInProgress) return { ...result, message: 'A sync is already in progress — try again shortly.' };

  const folder = getSyncFolder();
  const remoteUrl = getRemoteUrl();
  const branch = getBranch();
  if (!(await isGitAvailable())) return { ...result, message: 'git was not found on PATH.' };
  if (!isRepoSync(folder)) return { ...result, message: 'Not cloned yet — run "Initialize Repo" first.' };
  if (!remoteUrl) return { ...result, message: 'No remote SSH URL configured.' };

  _syncInProgress = true;
  try {
    exportFullBundle();

    await runGit(['add', '-A'], folder);
    const { stdout: statusOut } = await runGit(['status', '--porcelain'], folder);
    if (statusOut.trim().length > 0) {
      await runGit(['commit', '-m', `Daakia: sync (${new Date().toISOString()})`], folder);
      result.committed = true;
    }

    try {
      await runGit(['pull', '--rebase', 'origin', branch], folder);
      result.pulled = true;
    } catch (err) {
      // Leave a rebase-in-progress in as clean a state as possible — never leave the repo
      // silently half-merged. The user resolves conflicts themselves (in VS Code's own Git UI).
      try { await runGit(['rebase', '--abort'], folder); } catch { /* nothing to abort */ }
      return { ...result, message: `Pull failed — most likely a conflict or missing upstream branch: ${describeGitError(err)}` };
    }

    await runGit(['push', '-u', 'origin', branch], folder);
    result.pushed = true;

    importFullBundle();

    return { ...result, ok: true, message: 'Synced successfully.' };
  } catch (err) {
    return { ...result, message: describeGitError(err) };
  } finally {
    _syncInProgress = false;
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
