import { useState, useEffect } from 'react';
import { ButtonView, TextInputView, ToggleSwitchView, TabView, SideNavView, SplitPanelView, CopyButtonView, type SideNavItem } from '@salilvnair/dui';
import { useDbStatusStore } from '../../store/db-status-store';
import { useAppSettingsStore } from '../../store/app-settings-store';
import type { TabItem } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { SettingsIcon, SunIcon, ServerIcon, CpuIcon, CodeBracketsIcon, SparkleIcon, AgentIcon, GitHubIcon, LockIcon, TrashIcon, KeyboardIcon, Dk8sIcon } from '../../icons';
import { Dk8sSettings } from '../settings/Dk8sSettings';
import { LlmProviderSettings } from './LlmProviderSettings';
import { GitSyncSettings } from './GitSyncSettings';
import { VaultSettings } from './VaultSettings';
import { BinSettings } from './BinSettings';
import { KeymapSettings } from './KeymapSettings';
import { PromptLibraryPanel } from './PromptLibraryPanel';
import { AiFeatureSettings } from './AiFeatureSettings';
import type { AiPromptTemplateKey } from '../../store/prompt-template';
import { AiAuditPanel } from './AiAuditPanel';
import { useMockStore } from '../../store/mock-store';
import { useUiStateStore, usePersistedPref } from '../../store/ui-state-store';
import { CookieManager } from '../power/CookieManager';
import { ProxySettings } from '../power/ProxySettings';
import { ClientCertificates } from '../power/ClientCertificates';
import { ApiMonitor } from '../power/ApiMonitor';
import { RequestInterceptorPanel } from '../power/RequestInterceptorPanel';
import { ResponseDiffModal } from '../power/ResponseDiffModal';
import { BulkUrlTester } from '../power/BulkUrlTester';
import { LoadTester } from '../power/LoadTester';
import { PerformanceTab } from '../shared/devtools/PerformanceTab';
import { AuditLogTab } from '../settings/devtools/AuditLogTab';
import { DbExplorerTab } from '../settings/devtools/DbExplorerTab';
import { DebugSnapshotTab } from '../settings/devtools/DebugSnapshotTab';
import { AuditConfigTab } from '../settings/devtools/AuditConfigTab';

type SettingsSection = 'general' | 'theme' | 'keymap' | 'mock-server' | 'git-sync' | 'vault' | 'bin' | 'llm' | 'ai-features' | 'prompt-library' | 'ai-audit' | 'devtools' | 'power-features' | 'dk8s';
type GeneralSubtab = 'general' | 'encoding' | 'proxy';
type PowerSubtab = 'cookies' | 'proxy' | 'certs' | 'monitor' | 'interceptor' | 'diff' | 'bulk' | 'load';

type ActiveNavId = SettingsSection;

const SETTINGS_SECTION_META: Record<SettingsSection, { label: string; icon: React.ReactNode }> = {
  'general':         { label: 'General',        icon: <SettingsIcon size={14} /> },
  'theme':           { label: 'Theme',           icon: <SunIcon size={14} /> },
  'keymap':          { label: 'Keymap',          icon: <KeyboardIcon size={14} /> },
  'mock-server':     { label: 'Mock Server',     icon: <ServerIcon size={14} /> },
  'git-sync':        { label: 'Git Sync',        icon: <GitHubIcon size={14} /> },
  'vault':           { label: 'Vault',           icon: <LockIcon size={14} /> },
  'bin':             { label: 'Bin',              icon: <TrashIcon size={14} /> },
  'llm':             { label: 'LLM Provider',    icon: <CpuIcon size={14} /> },
  'ai-features':     { label: 'AI Features',     icon: <SparkleIcon size={14} /> },
  'prompt-library':  { label: 'Prompt Library',  icon: <AgentIcon size={14} /> },
  'ai-audit':        { label: 'AI Audit',        icon: <SparkleIcon size={14} /> },
  'devtools':        { label: 'Developer Tools', icon: <CodeBracketsIcon size={14} /> },
  'dk8s':            { label: 'dk8s',            icon: <Dk8sIcon size={14} /> },
  'power-features':  { label: 'Power Features',  icon: <CodeBracketsIcon size={14} /> },
};

const SETTINGS_NAV_ITEMS: SideNavItem[] = [
  { id: 'g-general', label: 'General', isGroup: true, children: [
    { id: 'general', label: SETTINGS_SECTION_META.general.label, icon: SETTINGS_SECTION_META.general.icon },
    { id: 'theme', label: SETTINGS_SECTION_META.theme.label, icon: SETTINGS_SECTION_META.theme.icon },
    { id: 'keymap', label: SETTINGS_SECTION_META.keymap.label, icon: SETTINGS_SECTION_META.keymap.icon },
  ] },
  { id: 'g-server', label: 'Server', isGroup: true, children: [
    { id: 'mock-server', label: SETTINGS_SECTION_META['mock-server'].label, icon: SETTINGS_SECTION_META['mock-server'].icon },
    { id: 'git-sync', label: SETTINGS_SECTION_META['git-sync'].label, icon: SETTINGS_SECTION_META['git-sync'].icon },
    { id: 'vault', label: SETTINGS_SECTION_META.vault.label, icon: SETTINGS_SECTION_META.vault.icon },
    { id: 'bin', label: SETTINGS_SECTION_META.bin.label, icon: SETTINGS_SECTION_META.bin.icon },
  ] },
  { id: 'g-ai', label: 'AI', isGroup: true, children: [
    { id: 'llm', label: SETTINGS_SECTION_META.llm.label, icon: SETTINGS_SECTION_META.llm.icon },
    { id: 'ai-features', label: SETTINGS_SECTION_META['ai-features'].label, icon: SETTINGS_SECTION_META['ai-features'].icon },
    { id: 'prompt-library', label: SETTINGS_SECTION_META['prompt-library'].label, icon: SETTINGS_SECTION_META['prompt-library'].icon },
    { id: 'ai-audit', label: SETTINGS_SECTION_META['ai-audit'].label, icon: SETTINGS_SECTION_META['ai-audit'].icon },
  ] },
  { id: 'g-advanced', label: 'Advanced', isGroup: true, children: [
    { id: 'dk8s', label: SETTINGS_SECTION_META.dk8s.label, icon: SETTINGS_SECTION_META.dk8s.icon },
    { id: 'devtools', label: SETTINGS_SECTION_META.devtools.label, icon: SETTINGS_SECTION_META.devtools.icon },
    { id: 'power-features', label: SETTINGS_SECTION_META['power-features'].label, icon: SETTINGS_SECTION_META['power-features'].icon },
  ] },
];

const ALL_SECTION_IDS = new Set<string>(SETTINGS_NAV_ITEMS.flatMap(g => (g.children ?? []).map(c => c.id)));

export function SettingsPanel() {
  const [activeSection, setActiveSection] = usePersistedPref<ActiveNavId>(
    'settings.section', 'general', [...ALL_SECTION_IDS] as ActiveNavId[],
  );
  const [promptTarget, setPromptTarget] = useState<AiPromptTemplateKey | null>(null);

  const handleNavigateToPrompt = (key: AiPromptTemplateKey) => {
    setPromptTarget(key);
    setActiveSection('prompt-library');
  };

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      <SplitPanelView
        direction="horizontal"
        defaultSplit={22}
        minFirstPct={12}
        minSecondPct={40}
        accentColor="var(--color-settings)"
        first={
          // Grouped, searchable, badge-counted nav (same DUI SideNavView the
          // wiki itself uses) — fillContainer lets the split's drag handle
          // control width instead of SideNavView's own fixed-pixel sizing;
          // collapsible is off since dragging narrow already serves that role.
          <SideNavView
            items={SETTINGS_NAV_ITEMS}
            activeId={activeSection}
            onSelect={(id) => setActiveSection(id as ActiveNavId)}
            defaultOpenIds={['g-general', 'g-server', 'g-ai', 'g-advanced']}
            fillContainer
            collapsible={false}
            accentColor="var(--color-settings)"
            searchable
            searchPlaceholder="Search settings..."
            // md, not sm: this is the primary way around a fourteen-section
            // page, and at sm the entries read as secondary chrome.
            size="md"
            className="border-r border-[var(--color-surface-border)]"
          />
        }
        second={
          <div className="h-full flex-1 overflow-y-auto">
            {activeSection === 'general' ? (
              <GeneralSettings />
            ) : activeSection === 'keymap' ? (
              <KeymapSettings />
            ) : activeSection === 'mock-server' ? (
              <MockServerSettings />
            ) : activeSection === 'git-sync' ? (
              <GitSyncSettings />
            ) : activeSection === 'vault' ? (
              <VaultSettings />
            ) : activeSection === 'bin' ? (
              <BinSettings />
            ) : activeSection === 'llm' ? (
              <LlmProviderSettings />
            ) : activeSection === 'ai-features' ? (
              <AiFeatureSettings onNavigateToPrompt={handleNavigateToPrompt} />
            ) : activeSection === 'prompt-library' ? (
              <PromptLibraryPanel externalTarget={promptTarget} onTargetConsumed={() => setPromptTarget(null)} />
            ) : activeSection === 'ai-audit' ? (
              <AiAuditPanel />
            ) : activeSection === 'power-features' ? (
              <PowerFeaturesPanel />
            ) : activeSection === 'dk8s' ? (
              <Dk8sSettings />
            ) : activeSection === 'devtools' ? (
              <DevToolsSettingsPage />
            ) : activeSection === 'theme' ? (
              <ThemeSettings />
            ) : null}
          </div>
        }
      />
    </div>
  );
}

// ────────── General Settings with subtabs ──────────

function GeneralSettings() {
  const [subtab, setSubtab] = usePersistedPref<GeneralSubtab>('settings.general.subtab', 'general');

  return (
    <div className="flex flex-col h-full">
      {/* Subtab bar */}
      <div className="px-3 pt-2 pb-0 border-b border-[var(--color-surface-border)]">
        <TabView
          tabs={[
            { id: 'general', label: 'General' },
            { id: 'encoding', label: 'Encoding' },
            { id: 'proxy', label: 'Proxy' },
          ] as TabItem[]}
          activeTab={subtab}
          onChange={(t) => setSubtab(t as GeneralSubtab)}
          variant="underline"
          size="sm"
          accentColor="var(--color-settings)"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {subtab === 'general' ? <GeneralGeneralContent /> : subtab === 'encoding' ? <EncodingContent /> : <ProxyContent />}
      </div>
    </div>
  );
}

// ────────── General > General ──────────

function GeneralGeneralContent() {
  const dbPath = useDbStatusStore((s) => s.dbPath);
  const settings = useAppSettingsStore((s) => s.settings);
  const save = useAppSettingsStore((s) => s.save);

  return (
    <div className="flex flex-col gap-6">
      {/* Follow Redirects */}
      <SettingToggle
        title="Follow Redirects"
        description="Automatically follow HTTP 3xx redirects"
        value={settings.followRedirects}
        onChange={(v) => save({ followRedirects: v })}
      />

      {/* SSL Verification */}
      <SettingToggle
        title="SSL Certificate Verification"
        description="Verify SSL certificates when making requests"
        value={settings.sslVerification}
        onChange={(v) => save({ sslVerification: v })}
      />

      {/* Save Response in History */}
      <SettingToggle
        title="Save Response in History"
        description="Store response body and headers in history entries (increases DB size)"
        value={settings.saveResponseInHistory}
        onChange={(v) => save({ saveResponseInHistory: v })}
      />

      {/* Request Timeout */}
      <div>
        <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Request Timeout</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-2">Maximum time to wait for a response (ms)</p>
        <TextInputView
          type="number"
          value={String(settings.timeout)}
          onChange={(e) => save({ timeout: parseInt(e.target.value) || 0 })}
          size="md"
          accentColor="var(--color-settings)"
          style={{ width: 120 }}
        />
      </div>

      {/* Maximum History Entries */}
      <div>
        <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Maximum History Entries</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-2">Older entries are automatically deleted when this limit is exceeded</p>
        <TextInputView
          type="number"
          value={String(settings.maxHistoryEntries)}
          onChange={(e) => save({ maxHistoryEntries: Math.max(10, parseInt(e.target.value) || 500) })}
          size="md"
          accentColor="var(--color-settings)"
          style={{ width: 120 }}
        />
      </div>

      {/* Maximum AI Chat Messages */}
      <div>
        <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Maximum AI Chat Messages</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-2">Max messages retained in the Daakia AI conversation (oldest trimmed automatically)</p>
        <TextInputView
          type="number"
          value={String(settings.maxAiChatMessages)}
          onChange={(e) => save({ maxAiChatMessages: Math.max(10, parseInt(e.target.value) || 200) })}
          size="md"
          accentColor="var(--color-settings)"
          style={{ width: 120 }}
        />
      </div>

      {/* Database Location (read-only) */}
      <div>
        <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Database Location</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-2">Where Daakia's SQLite database (history, collections, environments, AI data) is stored on disk</p>
        <div className="flex items-center gap-1.5">
          <TextInputView
            value={dbPath || 'Loading…'}
            readOnly
            size="md"
            accentColor="var(--color-settings)"
            style={{ flex: 1, fontFamily: 'var(--vscode-editor-font-family, monospace)', fontSize: 11 }}
          />
          {dbPath && <CopyButtonView text={dbPath} title="Copy path" />}
        </div>
      </div>
    </div>
  );
}

// ────────── General > Encoding ──────────

function EncodingContent() {
  const encoding = useAppSettingsStore((s) => s.settings.encoding);
  const save = useAppSettingsStore((s) => s.save);

  const handleChange = (value: 'enable' | 'disable' | 'auto') => {
    save({ encoding: value });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Query Parameters Encoding */}
      <div>
        <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Query Parameters Encoding</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-3">Configure encoding for query parameters in requests</p>
        <div className="flex flex-col gap-2.5">
          {([
            { value: 'enable', label: 'Enable' },
            { value: 'disable', label: 'Disable' },
            { value: 'auto', label: 'Auto' },
          ] as const).map(opt => (
            <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer group">
              <span className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-colors ${
                encoding === opt.value
                  ? 'border-[var(--color-settings)]'
                  : 'border-[color-mix(in_srgb,var(--color-text-primary)_20%,transparent)] group-hover:border-[color-mix(in_srgb,var(--color-text-primary)_40%,transparent)]'
              }`}>
                {encoding === opt.value && (
                  <span className="w-[8px] h-[8px] rounded-full bg-[var(--color-settings)]" />
                )}
              </span>
              <input
                type="radio"
                name="encoding"
                value={opt.value}
                checked={encoding === opt.value}
                onChange={() => handleChange(opt.value)}
                className="hidden"
              />
              <span className="text-[13px] text-[var(--color-text-primary)]">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ────────── General > Proxy ──────────

type ProxyMode = 'none' | 'system' | 'manual';

function ProxyContent() {
  // Seeded from the shared settings store (already loaded at app boot — see
  // app-settings-store.ts), never a hardcoded default, so there's nothing to flicker to.
  const storedProxy = useAppSettingsStore.getState().settings.proxy;
  const saveSettings = useAppSettingsStore((s) => s.save);

  const [mode, setMode] = useState<ProxyMode>(storedProxy.mode);
  const [host, setHost] = useState(storedProxy.host ?? '');
  const [port, setPort] = useState(String(storedProxy.port ?? 8080));
  const [username, setUsername] = useState(storedProxy.username ?? '');
  const [password, setPassword] = useState(storedProxy.password ?? '');
  const [bypass, setBypass] = useState((storedProxy.bypass ?? []).join(', '));

  const save = (patch?: Partial<{ mode: ProxyMode; host: string; port: string; username: string; password: string; bypass: string }>) => {
    const m = patch?.mode ?? mode;
    const h = patch?.host ?? host;
    const p = patch?.port ?? port;
    const u = patch?.username ?? username;
    const pw = patch?.password ?? password;
    const b = patch?.bypass ?? bypass;
    const proxySettings = {
      mode: m,
      host: h,
      port: parseInt(p) || 8080,
      username: u,
      password: pw,
      bypass: b.split(',').map(s => s.trim()).filter(Boolean),
    };
    saveSettings({ proxy: proxySettings });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Proxy Mode */}
      <div>
        <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Proxy Configuration</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-3">Route requests through a proxy server</p>
        <div className="flex flex-col gap-2.5">
          {([
            { value: 'none', label: 'No Proxy', desc: 'Connect directly to the server' },
            { value: 'system', label: 'System Proxy', desc: 'Use system proxy settings (HTTP_PROXY / HTTPS_PROXY env vars)' },
            { value: 'manual', label: 'Manual Proxy', desc: 'Configure proxy host, port, and authentication' },
          ] as const).map(opt => (
            <label key={opt.value} className="flex items-start gap-2.5 cursor-pointer group">
              <span className={`mt-0.5 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                mode === opt.value
                  ? 'border-[var(--color-settings)]'
                  : 'border-[color-mix(in_srgb,var(--color-text-primary)_20%,transparent)] group-hover:border-[color-mix(in_srgb,var(--color-text-primary)_40%,transparent)]'
              }`}>
                {mode === opt.value && (
                  <span className="w-[8px] h-[8px] rounded-full bg-[var(--color-settings)]" />
                )}
              </span>
              <input
                type="radio"
                name="proxyMode"
                value={opt.value}
                checked={mode === opt.value}
                onChange={() => { setMode(opt.value); save({ mode: opt.value }); }}
                className="hidden"
              />
              <div>
                <span className="text-[13px] text-[var(--color-text-primary)]">{opt.label}</span>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Manual Proxy Fields */}
      {mode === 'manual' && (
        <div className="flex flex-col gap-4 pl-1 border-l-2 border-[rgba(42,157,143,0.3)] ml-2 -mt-2">
          <div className="pl-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <p className="text-[11px] text-[var(--color-text-muted)] mb-1">Proxy Host</p>
                <TextInputView
                  placeholder="proxy.company.com"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  onBlur={() => save()}
                  size="md"
                  accentColor="var(--color-settings)"
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ width: 80 }}>
                <p className="text-[11px] text-[var(--color-text-muted)] mb-1">Port</p>
                <TextInputView
                  type="number"
                  placeholder="8080"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  onBlur={() => save()}
                  size="md"
                  accentColor="var(--color-settings)"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

          <div className="pl-3">
            <p className="text-[11px] text-[var(--color-text-muted)] mb-1">Authentication (optional)</p>
            <div className="flex gap-2">
              <TextInputView
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onBlur={() => save()}
                size="md"
                accentColor="var(--color-settings)"
                style={{ flex: 1 }}
              />
              <TextInputView
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => save()}
                size="md"
                accentColor="var(--color-settings)"
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div className="pl-3">
            <p className="text-[11px] text-[var(--color-text-muted)] mb-1">Bypass List</p>
            <TextInputView
              placeholder="localhost, 127.0.0.1, *.internal.com"
              value={bypass}
              onChange={(e) => setBypass(e.target.value)}
              onBlur={() => save()}
              size="md"
              accentColor="var(--color-settings)"
              style={{ width: '100%' }}
            />
            <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Comma-separated hosts/patterns that bypass the proxy. Use * for wildcard.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────── Shared Components ──────────

function SettingToggle({ title, description, value, onChange }: { title: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-4 max-w-[500px]">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--color-text-primary)]">{title}</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{description}</p>
      </div>
      <ToggleSwitchView
        checked={value}
        onChange={onChange}
        accentColor="var(--color-settings)"
        size="sm"
      />
    </div>
  );
}

// ────────── Mock Server Settings ──────────

function MockServerSettings() {
  const [portMin, setPortMin] = useState(8000);
  const [portMax, setPortMax] = useState(9000);
  const mockIconGlow = useMockStore(s => s.mockIconGlow);
  const setMockIconGlow = useMockStore(s => s.setMockIconGlow);
  const [saved, setSaved] = useState(false);

  // Listen for port range updates from extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'mockServersInit' && msg.portRange) {
        setPortMin(msg.portRange.min);
        setPortMax(msg.portRange.max);
      }
      if (msg.type === 'mockServer:portRangeUpdated') {
        setPortMin(msg.min);
        setPortMax(msg.max);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleSave = () => {
    const min = Math.max(1024, Math.min(portMin, 65535));
    const max = Math.max(min + 1, Math.min(portMax, 65535));
    postMsg({ type: 'mockServer:setPortRange', min, max });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-[var(--color-surface-border)] pt-3">
        <div className="flex items-center gap-0 px-5">
          <span className="px-3 py-2 text-[12px] border-b-2 border-[var(--color-settings)] text-[var(--color-settings)] font-medium">
            Configuration
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-6">
          {/* Port Range */}
          <div>
            <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Port Range</p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-3">
              Mock servers will be assigned ports within this range. The extension auto-finds a free port.
            </p>
            <div className="flex items-center gap-2">
              <TextInputView
                type="number"
                value={String(portMin)}
                onChange={(e) => setPortMin(parseInt(e.target.value) || 8000)}
                size="md"
                accentColor="var(--color-settings)"
                style={{ width: 100 }}
              />
              <span className="text-[12px] text-[var(--color-text-muted)]">to</span>
              <TextInputView
                type="number"
                value={String(portMax)}
                onChange={(e) => setPortMax(parseInt(e.target.value) || 9000)}
                size="md"
                accentColor="var(--color-settings)"
                style={{ width: 100 }}
              />
              <ButtonView
                size="md"
                variant="primary"
                accentColor="var(--color-settings)"
                onClick={handleSave}
              >
                Save
              </ButtonView>
              {saved && <span className="text-[11px] text-[var(--color-success)]">Saved!</span>}
            </div>
          </div>

          {/* Mock Server Icon Glow */}
          <SettingToggle
            title="Mock Server Icon Glow"
            description="Show breathing/pulsing animation on the Mock Server sidebar icon when a server is running"
            value={mockIconGlow}
            onChange={(v) => setMockIconGlow(v)}
          />

          {/* Storage info */}
          <div>
            <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Storage</p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              Mock server configurations are stored in <code className="text-[10px] bg-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] px-1 py-0.5 rounded">~/.salilvnair/daakia-vsce/mock-servers.json</code>
            </p>
          </div>

          {/* Info */}
          <div className="p-3 rounded-md bg-[color-mix(in_srgb,var(--color-warning)_6%,transparent)] border border-[color-mix(in_srgb,var(--color-warning)_15%,transparent)]">
            <p className="text-[12px] text-[var(--color-warning)] font-medium mb-1">How it works</p>
            <ul className="text-[11px] text-[var(--color-text-muted)] space-y-1">
              <li>• Mock servers run as real HTTP servers in the extension host</li>
              <li>• Routes are hot-reloaded — changes apply instantly to running servers</li>
              <li>• Servers are automatically stopped when the extension deactivates</li>
              <li>• Path parameters are supported via <code className="text-[10px] bg-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] px-1 rounded">:param</code> syntax</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────── Power Features Panel ──────────

const POWER_SUBTABS: { id: PowerSubtab; label: string; description: string; icon: string }[] = [
  { id: 'cookies',     label: 'Cookie Manager',      description: 'View, edit, and delete cookies across all domains', icon: '🍪' },
  { id: 'proxy',       label: 'Proxy Settings',       description: 'Configure HTTP/HTTPS/SOCKS proxy for all requests', icon: '🔀' },
  { id: 'certs',       label: 'Client Certificates',  description: 'mTLS client certificate configuration per domain', icon: '🔐' },
  { id: 'monitor',     label: 'API Monitor',          description: 'Schedule periodic health checks with VS Code alerts', icon: '📡' },
  { id: 'interceptor', label: 'Request Interceptor',  description: 'Capture browser traffic via built-in proxy', icon: '🎯' },
  { id: 'diff',        label: 'Response Diff',        description: 'Compare two responses side-by-side with highlighting', icon: '⚖️' },
  { id: 'bulk',        label: 'Bulk URL Tester',      description: 'Test multiple URLs at once, get summary table', icon: '⚡' },
  { id: 'load',        label: 'Load Tester',          description: 'Concurrent load testing with p50/p95/p99 metrics', icon: '📊' },
];

function PowerFeaturesPanel() {
  const [subtab, setSubtab] = usePersistedPref<PowerSubtab>('settings.power.subtab', 'cookies');
  // Which tool is *selected* persists above; whether its window is open does
  // not. These are all modals, and launching Daakia into a dialog you opened
  // days ago would be a worse greeting than the one it replaces.
  const [showCookies, setShowCookies] = useState(false);
  const [showProxy, setShowProxy] = useState(false);
  const [showCerts, setShowCerts] = useState(false);
  const [showMonitor, setShowMonitor] = useState(false);
  const [showInterceptor, setShowInterceptor] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showLoad, setShowLoad] = useState(false);

  const openTool = (id: PowerSubtab) => {
    setSubtab(id);
    if (id === 'cookies') setShowCookies(true);
    else if (id === 'proxy') setShowProxy(true);
    else if (id === 'certs') setShowCerts(true);
    else if (id === 'monitor') setShowMonitor(true);
    else if (id === 'interceptor') setShowInterceptor(true);
    else if (id === 'diff') setShowDiff(true);
    else if (id === 'bulk') setShowBulk(true);
    else if (id === 'load') setShowLoad(true);
  };

  return (
    <div className="px-5 py-4 flex flex-col gap-3">
      <div>
        <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">Power Features</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Advanced tools — click any card to open</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {POWER_SUBTABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => openTool(t.id)}
            className="text-left p-3.5 rounded-xl border cursor-pointer transition-all hover:border-[var(--color-settings)] hover:brightness-105 flex flex-col gap-1.5 min-h-[80px]"
            style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[15px] leading-none">{t.icon}</span>
              <p className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{t.label}</p>
            </div>
            <p className="text-[10.5px] leading-snug" style={{ color: 'var(--color-text-muted)' }}>{t.description}</p>
          </button>
        ))}
      </div>

      {/* Modals */}
      {showCookies && <CookieManager onClose={() => setShowCookies(false)} />}
      {showProxy && <ProxySettings onClose={() => setShowProxy(false)} />}
      {showCerts && <ClientCertificates onClose={() => setShowCerts(false)} />}
      {showMonitor && <ApiMonitor onClose={() => setShowMonitor(false)} />}
      {showInterceptor && <RequestInterceptorPanel onClose={() => setShowInterceptor(false)} />}
      {showDiff && <ResponseDiffModal onClose={() => setShowDiff(false)} />}
      {showBulk && <BulkUrlTester onClose={() => setShowBulk(false)} />}
      {showLoad && <LoadTester onClose={() => setShowLoad(false)} />}
    </div>
  );
}

// ────────── Developer Tools Settings Page ──────────

type DevToolsSubtab = 'memory' | 'audit' | 'db' | 'snapshot' | 'audit-config';

const DEVTOOLS_TABS: { id: DevToolsSubtab; label: string }[] = [
  { id: 'memory',       label: 'Memory Footprint' },
  { id: 'audit',        label: 'Audit Log' },
  { id: 'audit-config', label: 'Audit Config' },
  { id: 'db',           label: 'DB Explorer' },
  { id: 'snapshot',     label: 'Debug Snapshot' },
];

function DevToolsSettingsPage() {
  const [active, setActive] = usePersistedPref<DevToolsSubtab>('settings.devtools.subtab', 'memory');
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sub-tab bar */}
      <div className="px-3 pt-2 pb-0 border-b border-[var(--color-surface-border)] shrink-0">
        <TabView
          tabs={DEVTOOLS_TABS as TabItem[]}
          activeTab={active}
          onChange={(t) => setActive(t as DevToolsSubtab)}
          variant="underline"
          size="sm"
          accentColor="var(--color-settings)"
        />
      </div>
      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {active === 'memory' && <PerformanceTab />}
        {active === 'audit' && <AuditLogTab />}
        {active === 'audit-config' && <AuditConfigTab />}
        {active === 'db' && <DbExplorerTab />}
        {active === 'snapshot' && <DebugSnapshotTab />}
      </div>
    </div>
  );
}

// ────────── Theme Settings ──────────

type ThemeChoice = 'dark' | 'light' | 'system';

/** Resolve the effective dark/light from the OS media query */
function resolveSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Apply a resolved dark/light to the DOM (does NOT touch localStorage choice) */
function applyThemeToDOM(resolved: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', resolved);
  document.body.setAttribute('data-theme', resolved);
}

function ThemeSettings() {
  const [choice, setChoice] = useState<ThemeChoice>(() => {
    return (localStorage.getItem('daakia-theme') as ThemeChoice) || 'dark';
  });

  // When the component mounts, wire up a media-query listener if we're in system mode
  useEffect(() => {
    if (choice !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => applyThemeToDOM(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [choice]);

  const selectTheme = (t: ThemeChoice) => {
    setChoice(t);
    localStorage.setItem('daakia-theme', t);
    if (t === 'system') {
      const resolved = resolveSystemTheme();
      applyThemeToDOM(resolved);
      postMsg({ type: 'saveSettings', key: 'theme', value: t });
    } else {
      applyThemeToDOM(t);
      postMsg({ type: 'saveSettings', key: 'theme', value: t });
    }
  };

  const THEMES: { key: ThemeChoice; label: string; desc: string }[] = [
    { key: 'dark',   label: 'Dark',   desc: 'Always dark' },
    { key: 'light',  label: 'Light',  desc: 'Always light' },
    { key: 'system', label: 'System', desc: 'Follows OS preference' },
  ];

  return (
    <div className="p-6 flex flex-col gap-6">
      <div>
        <h3 className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Appearance</h3>
        <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>Choose how Daakia looks to you</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        {THEMES.map(({ key: t, label }) => (
          <button
            key={t}
            type="button"
            onClick={() => selectTheme(t)}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all w-[130px]"
            style={{
              borderColor: choice === t ? 'var(--color-primary)' : 'var(--color-surface-border)',
              backgroundColor: choice === t
                ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)'
                : 'var(--color-surface)',
            }}
          >
            {/* Preview swatch */}
            {t === 'system' ? (
              <div className="w-full h-[72px] rounded-lg overflow-hidden border border-[#888] flex">
                <div className="w-1/2 h-full bg-[#1e1e1e]">
                  <div className="h-[20px] bg-[#252526]" />
                  <div className="flex gap-1 p-1.5">
                    <div className="h-1.5 w-5 rounded bg-[#3c3c3c]" />
                    <div className="h-1.5 w-7 rounded bg-[#4b4b4b]" />
                  </div>
                </div>
                <div className="w-1/2 h-full bg-white">
                  <div className="h-[20px] bg-[#f3f4f6]" />
                  <div className="flex gap-1 p-1.5">
                    <div className="h-1.5 w-5 rounded bg-[#e5e7eb]" />
                    <div className="h-1.5 w-7 rounded bg-[#d1d5db]" />
                  </div>
                </div>
              </div>
            ) : (
              <div className={`w-full h-[72px] rounded-lg overflow-hidden border ${t === 'dark' ? 'bg-[#1e1e1e] border-[#414141]' : 'bg-white border-[#e5e7eb]'}`}>
                <div className={`h-[20px] ${t === 'dark' ? 'bg-[#252526]' : 'bg-[#f3f4f6]'}`} />
                <div className="flex gap-1.5 p-2">
                  <div className={`h-2 w-8 rounded ${t === 'dark' ? 'bg-[#3c3c3c]' : 'bg-[#e5e7eb]'}`} />
                  <div className={`h-2 w-12 rounded ${t === 'dark' ? 'bg-[#4b4b4b]' : 'bg-[#d1d5db]'}`} />
                </div>
                <div className="px-2 flex flex-col gap-1">
                  <div className={`h-1.5 w-full rounded ${t === 'dark' ? 'bg-[#333]' : 'bg-[#f3f4f6]'}`} />
                  <div className={`h-1.5 w-3/4 rounded ${t === 'dark' ? 'bg-[#2d2d2d]' : 'bg-[#e5e7eb]'}`} />
                </div>
              </div>
            )}
            <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-primary)' }}>{label}</span>
            {choice === t && (
              <span className="text-[10px] font-medium" style={{ color: 'var(--color-primary)' }}>Active</span>
            )}
          </button>
        ))}
      </div>

      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
        Note: VS Code applies its own theme to the extension host. This toggle controls the Daakia webview UI independently.
      </p>
    </div>
  );
}
