/**
 * Git Sync handler — webview-facing bridge for the settings/status/init/sync-now
 * operations implemented in services/git-sync.ts.
 */
import {
  getAutoSyncSeconds, getSyncFolder, getRemoteUrl, getBranch, getSyncScope, saveGitSyncSettings,
  getGitStatus, ensureGitRepo, gitSyncNow, exportFullBundle, importFullBundle,
  getSyncIdentity, setSyncIdentityId, listTeam, showSharedInSwitcher,
} from '../../../services/git-sync';
import { handleGetWorkspaces } from './workspace-handler';

type PostMessage = (msg: unknown) => void;

export function handleGitSyncGetSettings(post: PostMessage): void {
  const scope = getSyncScope();
  post({
    type: 'gitSync:settingsData',
    settings: {
      autoSyncSeconds: getAutoSyncSeconds(),
      localPath: getSyncFolder(),
      remoteUrl: getRemoteUrl(),
      branch: getBranch(),
      syncHistory: scope.history,
      syncCollections: scope.collections,
      syncMockServers: scope.mockServers,
      syncEnvironments: scope.environments,
      syncAiConfig: scope.aiConfig,
      syncThemes: scope.themes,
      showSharedInSwitcher: showSharedInSwitcher(),
    },
    identity: getSyncIdentity(),
    team: listTeam(),
  });
}

export async function handleGitSyncSaveSettings(msg: {
  settings: {
    autoSyncSeconds?: number; remoteUrl?: string; branch?: string;
    syncHistory?: boolean; syncCollections?: boolean; syncMockServers?: boolean;
    syncEnvironments?: boolean; syncAiConfig?: boolean; syncThemes?: boolean;
    showSharedInSwitcher?: boolean;
  };
}, post: PostMessage): Promise<void> {
  await saveGitSyncSettings(msg.settings);
  handleGitSyncGetSettings(post);
  /* The workspace menu reads the show-shared switch from its own snapshot. */
  handleGetWorkspaces(post);
}

export async function handleGitSyncGetStatus(post: PostMessage): Promise<void> {
  const status = await getGitStatus();
  post({ type: 'gitSync:statusData', status });
}

export async function handleGitSyncInit(post: PostMessage): Promise<void> {
  const result = await ensureGitRepo(getRemoteUrl(), getBranch());
  post({ type: 'gitSync:initResult', result });
  await handleGitSyncGetStatus(post);
}

export async function handleGitSyncNow(post: PostMessage): Promise<void> {
  const result = await gitSyncNow();
  post({ type: 'gitSync:syncResult', result });
  await handleGitSyncGetStatus(post);
}

/** Write everything (collections/history/mock servers/state machine) to disk — no git operations. */
export function handleGitSyncExportOnly(post: PostMessage): void {
  const counts = exportFullBundle();
  post({ type: 'gitSync:exportResult', counts });
}

/** Read everything currently on disk back into SQLite — no git operations. */
export function handleGitSyncImportOnly(post: PostMessage): void {
  const counts = importFullBundle();
  post({ type: 'gitSync:importResult', counts });
}

/**
 * Use another machine's sync id here, so both share one private folder.
 * The next sync reads that folder in before writing to it.
 */
export function handleGitSyncSetIdentity(msg: { id?: string }, post: PostMessage): void {
  const result = setSyncIdentityId(String(msg.id ?? ''));
  post({ type: 'gitSync:identityResult', result });
  handleGitSyncGetSettings(post);
}
