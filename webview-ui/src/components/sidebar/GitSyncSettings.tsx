/**
 * GitSyncSettings — configure + drive git-native sync.
 *
 * Daakia clones the configured remote into a fixed local folder
 * (`~/.salilvnair/daakia-vsce/daakia-vsce-git`, independent of whatever VS Code
 * workspace is open) and writes collections, history, mock server configs, and
 * state machine workflows into it as diffable `*.daakia.json` files, then
 * commits/pulls/pushes that clone against the remote over SSH. All git
 * operations shell out to the user's own `git` binary — SSH auth is entirely
 * the system git/ssh-agent's responsibility; Daakia never reads, stores, or
 * touches a private key. Every sync cycle (manual or auto) runs strictly one
 * at a time — a sync already in progress blocks the next until it finishes.
 */
import { useEffect, useState } from 'react';
import { ButtonView, TextInputView, CheckboxView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import { StyledDropdown, type DropdownOption } from '../shared';
import { GitHubIcon, CheckCircleFilledIcon, WarningTriangleIcon, XCircleIcon, GitBranchIcon, ArrowUpIcon, ArrowDownIcon, UploadIcon, DownloadIcon, RefreshIcon } from '../../icons';

const ACCENT = 'var(--color-settings)';

const AUTO_SYNC_OPTIONS: DropdownOption[] = [
  { value: '0', label: 'Off' },
  { value: '1', label: 'Every 1 second' },
  { value: '5', label: 'Every 5 seconds' },
  { value: '10', label: 'Every 10 seconds' },
  { value: '30', label: 'Every 30 seconds' },
];

interface GitSyncSettingsData {
  autoSyncSeconds: number;
  localPath: string;
  remoteUrl: string;
  branch: string;
  syncHistory: boolean;
  syncCollections: boolean;
  syncMockServers: boolean;
  syncEnvironments: boolean;
  syncAiConfig: boolean;
}

const SYNC_SCOPE_ITEMS: { key: keyof Pick<GitSyncSettingsData, 'syncHistory' | 'syncCollections' | 'syncMockServers' | 'syncEnvironments' | 'syncAiConfig'>; label: string }[] = [
  { key: 'syncHistory', label: 'History' },
  { key: 'syncCollections', label: 'Collections' },
  { key: 'syncMockServers', label: 'Mock Server (incl. state machine)' },
  { key: 'syncEnvironments', label: 'Environments (secret values redacted)' },
  { key: 'syncAiConfig', label: 'AI Config (prompt library, feature flags, provider config)' },
];

interface GitStatus {
  gitAvailable: boolean;
  isRepo: boolean;
  branch: string | null;
  hasRemote: boolean;
  ahead: number;
  behind: number;
  dirty: boolean;
  lastCommit: string | null;
  syncing: boolean;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export function GitSyncSettings() {
  const [settings, setSettings] = useState<GitSyncSettingsData>({
    autoSyncSeconds: 0, localPath: '', remoteUrl: '', branch: 'main',
    syncHistory: true, syncCollections: true, syncMockServers: true,
    syncEnvironments: true, syncAiConfig: true,
  });
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [busy, setBusy] = useState<'init' | 'sync' | 'export' | 'import' | null>(null);
  const [dirtySettings, setDirtySettings] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    postMsg({ type: 'gitSync:getSettings' });
    postMsg({ type: 'gitSync:getStatus' });

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'gitSync:settingsData') {
        setSettings(msg.settings);
        setDirtySettings(false);
      } else if (msg.type === 'gitSync:statusData') {
        setStatus(msg.status);
      } else if (msg.type === 'gitSync:initResult') {
        setBusy(null);
        addToast({ type: msg.result.ok ? 'success' : 'error', message: msg.result.message });
      } else if (msg.type === 'gitSync:syncResult') {
        setBusy(null);
        if (msg.result.ok) setLastSyncedAt(new Date().toISOString());
        addToast({ type: msg.result.ok ? 'success' : 'error', message: msg.result.message });
      } else if (msg.type === 'gitSync:autoSyncTick') {
        if (msg.result?.ok) setLastSyncedAt(msg.at);
      } else if (msg.type === 'gitSync:exportResult') {
        setBusy(null);
        const c = msg.counts;
        addToast({ type: 'success', message: `Exported: ${c.collections} collection(s), ${c.history} history row(s), ${c.mockServers} mock server(s), ${c.stateMachines} workflow(s), ${c.environments} environment(s), ${c.aiConfig} prompt(s).` });
      } else if (msg.type === 'gitSync:importResult') {
        setBusy(null);
        const c = msg.counts;
        addToast({ type: 'success', message: `Imported: ${c.collections} request(s), ${c.history} new history row(s), ${c.mockServers} mock server(s), ${c.stateMachines} workflow(s), ${c.environments} environment(s), ${c.aiConfig} prompt(s).` });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (p: Partial<GitSyncSettingsData>) => {
    setSettings(prev => ({ ...prev, ...p }));
    setDirtySettings(true);
  };

  const handleSaveSettings = (override?: Partial<GitSyncSettingsData>) => {
    postMsg({ type: 'gitSync:saveSettings', settings: { ...settings, ...override } });
  };

  const handleInit = () => {
    setBusy('init');
    postMsg({ type: 'gitSync:init' });
  };

  const handleSyncNow = () => {
    setBusy('sync');
    postMsg({ type: 'gitSync:syncNow' });
  };

  const handleExportOnly = () => {
    setBusy('export');
    postMsg({ type: 'gitSync:exportOnly' });
  };

  const handleImportOnly = () => {
    setBusy('import');
    postMsg({ type: 'gitSync:importOnly' });
  };

  const syncing = busy !== null || !!status?.syncing;

  return (
    <div className="px-5 py-4 flex flex-col gap-6">
      <div>
        <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">Git Sync</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
          Keep collections, history, mock servers, and state machine workflows as diffable JSON files in a local clone of your remote and sync them over SSH.
        </p>
      </div>

      {/* Auto sync interval */}
      <div className="flex items-center gap-4 max-w-[600px]">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Auto Sync</p>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
            When on, runs a full sync (export → commit → pull → push → import) of collections, history, mock servers, and state machine workflows on this interval — always one cycle at a time, never overlapping
          </p>
        </div>
        <StyledDropdown
          options={AUTO_SYNC_OPTIONS}
          value={String(settings.autoSyncSeconds)}
          onChange={(v) => { const autoSyncSeconds = parseInt(v, 10) || 0; patch({ autoSyncSeconds }); handleSaveSettings({ autoSyncSeconds }); }}
          size="sm"
          accentColor={ACCENT}
        />
      </div>

      {lastSyncedAt && (
        <p className="text-[11px] text-[var(--color-text-muted)] -mt-4">Last synced: {formatRelativeTime(lastSyncedAt)}</p>
      )}

      {/* Local clone path (fixed, read-only) */}
      <div>
        <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Local Clone</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-2">Fixed local folder your remote is cloned into — the same clone is used no matter which workspace is open</p>
        <code className="block text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-text-primary) 6%, transparent)', color: 'var(--color-text-secondary)', width: 'fit-content', maxWidth: '100%', overflowWrap: 'anywhere' }}>
          {settings.localPath || '~/.salilvnair/daakia-vsce/daakia-vsce-git'}
        </code>
      </div>

      {/* Sync scope */}
      <div>
        <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Sync</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-2">What to include in export/import and auto sync</p>
        <div className="flex flex-col gap-2">
          {SYNC_SCOPE_ITEMS.map(item => (
            <label key={item.key} className="flex items-center gap-2 cursor-pointer w-fit">
              <CheckboxView
                size="sm"
                checked={settings[item.key]}
                onChange={(checked: boolean) => { patch({ [item.key]: checked } as Partial<GitSyncSettingsData>); handleSaveSettings({ [item.key]: checked } as Partial<GitSyncSettingsData>); }}
                accentColor={ACCENT}
              />
              <span className="text-[12px] text-[var(--color-text-secondary)]">{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Remote URL */}
      <div>
        <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Remote SSH URL</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-2">
          e.g. <code className="text-[10px] bg-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] px-1 py-0.5 rounded">git@github.com:org/repo.git</code> — auth uses your system git/ssh-agent, Daakia never touches SSH keys
        </p>
        <TextInputView value={settings.remoteUrl} onChange={(e) => patch({ remoteUrl: e.target.value })} onBlur={() => handleSaveSettings()} size="md" accentColor={ACCENT} placeholder="git@github.com:org/repo.git" style={{ width: '100%', maxWidth: 400 }} />
      </div>

      {/* Branch */}
      <div>
        <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Branch</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-2">Branch to push/pull for sync</p>
        <TextInputView value={settings.branch} onChange={(e) => patch({ branch: e.target.value })} onBlur={() => handleSaveSettings()} size="md" accentColor={ACCENT} placeholder="main" style={{ width: 160 }} />
      </div>

      {dirtySettings && (
        <div>
          <ButtonView size="sm" variant="secondary" accentColor={ACCENT} onClick={() => handleSaveSettings()}>Save Settings</ButtonView>
        </div>
      )}

      {/* Status card — hidden entirely until a remote is configured */}
      {settings.remoteUrl.trim() && <GitStatusCard status={status} configuredBranch={settings.branch} />}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <ButtonView size="md" variant="primary" accentColor={ACCENT} iconLeft={<GitHubIcon size={13} />} onClick={handleInit} disabled={syncing || !settings.remoteUrl.trim()}>
          {busy === 'init' ? 'Cloning…' : 'Initialize Repo'}
        </ButtonView>
        <ButtonView size="md" variant="primary" accentColor={ACCENT} iconLeft={<RefreshIcon size={13} />} onClick={handleSyncNow} disabled={syncing || !status?.isRepo}>
          {busy === 'sync' ? 'Syncing…' : 'Sync Now'}
        </ButtonView>
        <ButtonView size="md" variant="secondary" accentColor={ACCENT} iconLeft={<UploadIcon size={13} />} onClick={handleExportOnly} disabled={syncing}>
          {busy === 'export' ? 'Exporting…' : 'Export Only'}
        </ButtonView>
        <ButtonView size="md" variant="secondary" accentColor={ACCENT} iconLeft={<DownloadIcon size={13} />} onClick={handleImportOnly} disabled={syncing}>
          {busy === 'import' ? 'Importing…' : 'Import Only'}
        </ButtonView>
      </div>
    </div>
  );
}

type GitStatusState = 'checking' | 'syncing' | 'no-git' | 'not-cloned' | 'pending' | 'clean';

function GitStatusCard({ status, configuredBranch }: { status: GitStatus | null; configuredBranch: string }) {
  let state: GitStatusState;
  if (!status) state = 'checking';
  else if (status.syncing) state = 'syncing';
  else if (!status.gitAvailable) state = 'no-git';
  else if (!status.isRepo) state = 'not-cloned';
  else if (status.dirty || status.ahead > 0 || status.behind > 0) state = 'pending';
  else state = 'clean';

  const color = {
    checking: 'var(--color-text-muted)',
    syncing: ACCENT,
    'no-git': 'var(--color-error)',
    'not-cloned': 'var(--color-warning)',
    pending: 'var(--color-warning)',
    clean: 'var(--color-success)',
  }[state];

  const headline = {
    checking: 'Checking…',
    syncing: 'Sync In Progress…',
    'no-git': 'git Not Found',
    'not-cloned': 'Not Cloned Yet',
    pending: 'Changes Pending',
    clean: 'Up To Date',
  }[state];

  return (
    <div className="rounded-lg overflow-hidden border" style={{ borderColor: `color-mix(in srgb, ${color} 35%, var(--color-surface-border))`, background: `color-mix(in srgb, ${color} 6%, var(--color-surface))` }}>
      <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderBottom: `1px solid color-mix(in srgb, ${color} 22%, transparent)` }}>
        {state === 'checking' && <ClockLikeSpinner color={color} />}
        {state === 'syncing' && <RefreshIcon size={15} style={{ color }} className="animate-spin" />}
        {state === 'no-git' && <XCircleIcon size={15} style={{ color }} />}
        {state === 'not-cloned' && <WarningTriangleIcon size={15} style={{ color }} />}
        {state === 'pending' && <WarningTriangleIcon size={15} style={{ color }} />}
        {state === 'clean' && <CheckCircleFilledIcon size={15} checked style={{ color }} />}
        <span className="text-[12.5px] font-semibold" style={{ color }}>{headline}</span>
      </div>

      {(state === 'pending' || state === 'clean') && status && (
        <div className="px-3.5 py-3 flex flex-wrap gap-2">
          <StatusChip label="Branch" value={status.branch || configuredBranch} icon={<GitBranchIcon size={11} />} />
          <StatusChip label="Remote" value={status.hasRemote ? 'origin configured' : 'none'} tone={status.hasRemote ? 'success' : 'warning'} />
          {status.ahead > 0 && <StatusChip label="Ahead" value={String(status.ahead)} icon={<ArrowUpIcon size={11} />} tone="warning" />}
          {status.behind > 0 && <StatusChip label="Behind" value={String(status.behind)} icon={<ArrowDownIcon size={11} />} tone="warning" />}
          <StatusChip label="Working Tree" value={status.dirty ? 'Dirty' : 'Clean'} tone={status.dirty ? 'warning' : 'success'} />
        </div>
      )}

      {status?.lastCommit && (state === 'pending' || state === 'clean') && (
        <div className="px-3.5 pb-3 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          Last commit: <span style={{ color: 'var(--color-text-secondary)' }}>{status.lastCommit}</span>
        </div>
      )}

      {state === 'not-cloned' && (
        <div className="px-3.5 py-3 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
          Click "Initialize Repo" below to clone your remote into the local folder.
        </div>
      )}
      {state === 'no-git' && (
        <div className="px-3.5 py-3 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
          Install git and make sure it's on your PATH to use sync.
        </div>
      )}
    </div>
  );
}

function StatusChip({ label, value, icon, tone = 'neutral' }: { label: string; value: string; icon?: React.ReactNode; tone?: 'success' | 'warning' | 'neutral' }) {
  const valueColor = tone === 'success' ? 'var(--color-success)' : tone === 'warning' ? 'var(--color-warning)' : 'var(--color-text-secondary)';
  return (
    <div className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md" style={{ background: 'color-mix(in srgb, var(--color-text-primary) 5%, transparent)' }}>
      <span className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: valueColor }}>
        {icon}{value}
      </span>
    </div>
  );
}

function ClockLikeSpinner({ color }: { color: string }) {
  return <span className="animate-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />;
}
