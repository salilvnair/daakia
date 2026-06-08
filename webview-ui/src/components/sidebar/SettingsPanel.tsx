import { useState, useEffect, type JSX } from 'react';
import { postMsg } from '../../vscode';
import { SettingsIcon, SunIcon, ServerIcon, CpuIcon, CodeBracketsIcon, SparkleIcon, AgentIcon, DocumentIcon, ChevronLeftIcon, ChevronRightIcon } from '../../icons';
import { LlmProviderSettings } from './LlmProviderSettings';
import { PromptLibraryPanel } from './PromptLibraryPanel';
import { AiFeatureSettings } from './AiFeatureSettings';
import { AiAuditPanel } from './AiAuditPanel';
import { DaakiaWikiPanel } from './wiki/DaakiaWikiPanel';
import { DaakiaViewPage } from '../../pages/wiki/daakia-view/DaakiaViewPage';
import { useMockStore } from '../../store/mock-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { CookieManager } from '../power/CookieManager';
import { ProxySettings } from '../power/ProxySettings';
import { ClientCertificates } from '../power/ClientCertificates';
import { ApiMonitor } from '../power/ApiMonitor';
import { RequestInterceptorPanel } from '../power/RequestInterceptorPanel';
import { GrpcClientPanel } from '../power/GrpcClientPanel';
import { ResponseDiffModal } from '../power/ResponseDiffModal';
import { BulkUrlTester } from '../power/BulkUrlTester';
import { LoadTester } from '../power/LoadTester';

type SettingsSection = 'general' | 'theme' | 'mock-server' | 'llm' | 'ai-features' | 'prompt-library' | 'ai-audit' | 'devtools' | 'wiki' | 'wiki-new' | 'power-features';
type GeneralSubtab = 'general' | 'encoding' | 'proxy';
type PowerSubtab = 'cookies' | 'proxy' | 'certs' | 'monitor' | 'interceptor' | 'grpc' | 'diff' | 'bulk' | 'load';

const SECTIONS: { id: SettingsSection; label: string; icon: JSX.Element }[] = [
  { id: 'general',        label: 'General',         icon: <SettingsIcon size={14} /> },
  { id: 'theme',          label: 'Theme',            icon: <SunIcon size={14} /> },
  { id: 'mock-server',    label: 'Mock Server',      icon: <ServerIcon size={14} /> },
  { id: 'llm',            label: 'LLM Provider',     icon: <CpuIcon size={14} /> },
  { id: 'ai-features',    label: 'AI Features',      icon: <SparkleIcon size={14} /> },
  { id: 'prompt-library', label: 'Prompt Library',   icon: <AgentIcon size={14} /> },
  { id: 'ai-audit',       label: 'AI Audit',         icon: <SparkleIcon size={14} /> },
  { id: 'devtools',       label: 'Developer Tools',  icon: <CodeBracketsIcon size={14} /> },
  { id: 'wiki',           label: 'Daakia Wiki',       icon: <DocumentIcon size={14} /> },
  { id: 'wiki-new',       label: 'Wiki New',          icon: <SparkleIcon size={14} /> },
  { id: 'power-features', label: 'Power Features',    icon: <CodeBracketsIcon size={14} /> },
];

export function SettingsPanel() {
  const storedSection = useUiStateStore(s => s.prefs['settings.section']) as SettingsSection | undefined;
  const validStored = storedSection && SECTIONS.some(s => s.id === storedSection) ? storedSection : 'general';
  const [activeSection, setActiveSectionLocal] = useState<SettingsSection>(validStored);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const setActiveSection = (section: SettingsSection) => {
    setActiveSectionLocal(section);
    useUiStateStore.getState().setPref('settings.section', section);
  };
  const current = SECTIONS.find(s => s.id === activeSection) ?? SECTIONS[0];

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {/* Left navigation */}
      <div
        className="flex-shrink-0 border-r border-[var(--color-surface-border)] flex flex-col transition-all duration-200"
        style={{ width: navCollapsed ? 40 : 200 }}
      >
        <div className="flex items-center px-2 py-2.5 border-b border-[var(--color-surface-border)] gap-1.5">
          {!navCollapsed && (
            <span className="text-[13px] font-medium text-[var(--color-text-primary)] flex-1">Settings</span>
          )}
          <button
            type="button"
            title={navCollapsed ? 'Show navigation' : 'Hide navigation'}
            onClick={() => setNavCollapsed(v => !v)}
            className="w-6 h-6 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)] cursor-pointer transition-colors flex-shrink-0 ml-auto"
          >
            {navCollapsed ? <ChevronRightIcon size={12} /> : <ChevronLeftIcon size={12} />}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-1 py-1">
          {SECTIONS.map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => setActiveSection(sec.id)}
              title={navCollapsed ? sec.label : undefined}
              className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md cursor-pointer text-left transition-colors text-[12px] ${
                navCollapsed ? 'justify-center' : ''
              } ${
                activeSection === sec.id
                  ? 'bg-[rgba(42,157,143,0.12)] text-[var(--color-settings)] font-medium'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.04)]'
              }`}
            >
              {sec.icon}
              {!navCollapsed && <span>{sec.label}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Right content area */}
      <div
        className={`flex-1 overflow-y-auto${activeSection === 'wiki' || activeSection === 'wiki-new' ? ' overflow-hidden' : ''}`}
        style={activeSection === 'wiki' || activeSection === 'wiki-new' ? { display: 'flex', flexDirection: 'column' } : undefined}
      >
        {activeSection === 'general' ? (
          <GeneralSettings />
        ) : activeSection === 'mock-server' ? (
          <MockServerSettings />
        ) : activeSection === 'llm' ? (
          <LlmProviderSettings />
        ) : activeSection === 'ai-features' ? (
          <AiFeatureSettings />
        ) : activeSection === 'prompt-library' ? (
          <PromptLibraryPanel />
        ) : activeSection === 'ai-audit' ? (
          <AiAuditPanel />
        ) : activeSection === 'wiki-new' ? (
          <DaakiaViewPage />
        ) : activeSection === 'wiki' ? (
          <DaakiaWikiPanel />
        ) : activeSection === 'power-features' ? (
          <PowerFeaturesPanel />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center h-full text-[var(--color-text-muted)]">
            <div className="flex flex-col items-center gap-2">
              <span className="opacity-50">{current.icon}</span>
              <p className="text-[13px]">{current.label} — coming next sprint</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────── General Settings with subtabs ──────────

function GeneralSettings() {
  const storedSubtab = useUiStateStore(s => s.prefs['settings.general.subtab']) as GeneralSubtab | undefined;
  const [subtab, setSubtabLocal] = useState<GeneralSubtab>(storedSubtab || 'general');
  const setSubtab = (tab: GeneralSubtab) => {
    setSubtabLocal(tab);
    useUiStateStore.getState().setPref('settings.general.subtab', tab);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Subtab bar */}
      <div className="border-b border-[var(--color-surface-border)] pt-3">
        <div className="flex items-center gap-0 px-5">
          {(['general', 'encoding', 'proxy'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setSubtab(tab)}
              className={`px-3 py-2 text-[12px] border-b-2 cursor-pointer transition-colors capitalize ${
                subtab === tab
                  ? 'border-[var(--color-settings)] text-[var(--color-settings)] font-medium'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
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
  const [followRedirects, setFollowRedirects] = useState(true);
  const [sslVerification, setSslVerification] = useState(true);
  const [timeout, setTimeout_] = useState(0);
  const [saveResponseInHistory, setSaveResponseInHistory] = useState(true);
  const [maxHistoryEntries, setMaxHistoryEntries] = useState(500);
  const [maxAiChatMessages, setMaxAiChatMessages] = useState(200);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'settingsData' && msg.settings) {
        if (msg.settings.followRedirects !== undefined) setFollowRedirects(msg.settings.followRedirects);
        if (msg.settings.sslVerification !== undefined) setSslVerification(msg.settings.sslVerification);
        if (msg.settings.timeout !== undefined) setTimeout_(msg.settings.timeout);
        if (msg.settings.saveResponseInHistory !== undefined) setSaveResponseInHistory(msg.settings.saveResponseInHistory);
        if (msg.settings.maxHistoryEntries !== undefined) setMaxHistoryEntries(msg.settings.maxHistoryEntries);
        if (msg.settings.maxAiChatMessages !== undefined) setMaxAiChatMessages(msg.settings.maxAiChatMessages);
      }
    };
    window.addEventListener('message', handler);
    postMsg({ type: 'getSettings' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const save = (patch: Record<string, unknown>) => {
    const settings = { followRedirects, sslVerification, timeout, saveResponseInHistory, maxHistoryEntries, maxAiChatMessages, ...patch };
    postMsg({ type: 'saveSettings', settings });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Follow Redirects */}
      <SettingToggle
        title="Follow Redirects"
        description="Automatically follow HTTP 3xx redirects"
        value={followRedirects}
        onChange={(v) => { setFollowRedirects(v); save({ followRedirects: v }); }}
      />

      {/* SSL Verification */}
      <SettingToggle
        title="SSL Certificate Verification"
        description="Verify SSL certificates when making requests"
        value={sslVerification}
        onChange={(v) => { setSslVerification(v); save({ sslVerification: v }); }}
      />

      {/* Save Response in History */}
      <SettingToggle
        title="Save Response in History"
        description="Store response body and headers in history entries (increases DB size)"
        value={saveResponseInHistory}
        onChange={(v) => { setSaveResponseInHistory(v); save({ saveResponseInHistory: v }); }}
      />

      {/* Request Timeout */}
      <div>
        <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Request Timeout</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-2">Maximum time to wait for a response (ms)</p>
        <input
          type="number"
          value={timeout}
          onChange={(e) => { const v = parseInt(e.target.value) || 0; setTimeout_(v); save({ timeout: v }); }}
          className="w-[120px] h-[28px] px-2.5 py-1 text-[12px] rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      {/* Maximum History Entries */}
      <div>
        <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Maximum History Entries</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-2">Older entries are automatically deleted when this limit is exceeded</p>
        <input
          type="number"
          min={10}
          max={10000}
          value={maxHistoryEntries}
          onChange={(e) => { const v = Math.max(10, parseInt(e.target.value) || 500); setMaxHistoryEntries(v); save({ maxHistoryEntries: v }); }}
          className="w-[120px] h-[28px] px-2.5 py-1 text-[12px] rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      {/* Maximum AI Chat Messages */}
      <div>
        <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Maximum AI Chat Messages</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-2">Max messages retained in the Daakia AI conversation (oldest trimmed automatically)</p>
        <input
          type="number"
          min={10}
          max={2000}
          value={maxAiChatMessages}
          onChange={(e) => { const v = Math.max(10, parseInt(e.target.value) || 200); setMaxAiChatMessages(v); save({ maxAiChatMessages: v }); }}
          className="w-[120px] h-[28px] px-2.5 py-1 text-[12px] rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>
    </div>
  );
}

// ────────── General > Encoding ──────────

function EncodingContent() {
  const [encoding, setEncoding] = useState<'enable' | 'disable' | 'auto'>('enable');

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'settingsData' && msg.settings?.encoding) {
        setEncoding(msg.settings.encoding);
      }
    };
    window.addEventListener('message', handler);
    postMsg({ type: 'getSettings' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleChange = (value: 'enable' | 'disable' | 'auto') => {
    setEncoding(value);
    postMsg({ type: 'saveSettings', settings: { encoding: value } });
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
                  : 'border-[rgba(255,255,255,0.2)] group-hover:border-[rgba(255,255,255,0.4)]'
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
  const [mode, setMode] = useState<ProxyMode>('none');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('8080');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [bypass, setBypass] = useState('');

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'settingsData' && msg.settings?.proxy) {
        const p = msg.settings.proxy;
        if (p.mode) setMode(p.mode);
        if (p.host) setHost(p.host);
        if (p.port) setPort(String(p.port));
        if (p.username) setUsername(p.username);
        if (p.password) setPassword(p.password);
        if (p.bypass) setBypass((p.bypass as string[]).join(', '));
      }
    };
    window.addEventListener('message', handler);
    postMsg({ type: 'getSettings' });
    return () => window.removeEventListener('message', handler);
  }, []);

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
    postMsg({ type: 'saveSettings', settings: { proxy: proxySettings } });
  };

  const inputCls = "w-full h-[28px] px-2.5 py-1 text-[12px] rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]";

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
                  : 'border-[rgba(255,255,255,0.2)] group-hover:border-[rgba(255,255,255,0.4)]'
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
                <input
                  type="text"
                  placeholder="proxy.company.com"
                  value={host}
                  onChange={(e) => { setHost(e.target.value); }}
                  onBlur={() => save()}
                  className={inputCls}
                />
              </div>
              <div className="w-[80px]">
                <p className="text-[11px] text-[var(--color-text-muted)] mb-1">Port</p>
                <input
                  type="number"
                  placeholder="8080"
                  value={port}
                  onChange={(e) => { setPort(e.target.value); }}
                  onBlur={() => save()}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          <div className="pl-3">
            <p className="text-[11px] text-[var(--color-text-muted)] mb-1">Authentication (optional)</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => { setUsername(e.target.value); }}
                onBlur={() => save()}
                className={inputCls + ' flex-1'}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); }}
                onBlur={() => save()}
                className={inputCls + ' flex-1'}
              />
            </div>
          </div>

          <div className="pl-3">
            <p className="text-[11px] text-[var(--color-text-muted)] mb-1">Bypass List</p>
            <input
              type="text"
              placeholder="localhost, 127.0.0.1, *.internal.com"
              value={bypass}
              onChange={(e) => { setBypass(e.target.value); }}
              onBlur={() => save()}
              className={inputCls}
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
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`w-[36px] h-[20px] rounded-full cursor-pointer transition-colors flex-shrink-0 relative ${
          value ? 'bg-[var(--color-settings)]' : 'bg-[rgba(255,255,255,0.15)]'
        }`}
      >
        <span className={`absolute top-[2px] w-[16px] h-[16px] rounded-full bg-white transition-transform ${
          value ? 'left-[18px]' : 'left-[2px]'
        }`} />
      </button>
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
          <span className="px-3 py-2 text-[12px] border-b-2 border-[var(--color-primary)] text-[var(--color-primary)] font-medium">
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
              <input
                type="number"
                value={portMin}
                onChange={(e) => setPortMin(parseInt(e.target.value) || 8000)}
                className="w-[100px] h-[28px] px-2.5 py-1 text-[12px] rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
              />
              <span className="text-[12px] text-[var(--color-text-muted)]">to</span>
              <input
                type="number"
                value={portMax}
                onChange={(e) => setPortMax(parseInt(e.target.value) || 9000)}
                className="w-[100px] h-[28px] px-2.5 py-1 text-[12px] rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
              />
              <button
                type="button"
                onClick={handleSave}
                className="ml-2 px-3 py-1 text-[11px] rounded-md bg-[var(--color-settings)] text-white hover:opacity-90 cursor-pointer transition-opacity"
              >
                Save
              </button>
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
              Mock server configurations are stored in <code className="text-[10px] bg-[rgba(255,255,255,0.06)] px-1 py-0.5 rounded">~/.salilvnair/daakia-vsce/mock-servers.json</code>
            </p>
          </div>

          {/* Info */}
          <div className="p-3 rounded-md bg-[rgba(234,179,8,0.06)] border border-[rgba(234,179,8,0.15)]">
            <p className="text-[12px] text-[#eab308] font-medium mb-1">How it works</p>
            <ul className="text-[11px] text-[var(--color-text-muted)] space-y-1">
              <li>• Mock servers run as real HTTP servers in the extension host</li>
              <li>• Routes are hot-reloaded — changes apply instantly to running servers</li>
              <li>• Servers are automatically stopped when the extension deactivates</li>
              <li>• Path parameters are supported via <code className="text-[10px] bg-[rgba(255,255,255,0.06)] px-1 rounded">:param</code> syntax</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────── Power Features Panel ──────────

const POWER_SUBTABS: { id: PowerSubtab; label: string; description: string }[] = [
  { id: 'cookies',     label: 'Cookie Manager',      description: 'View, edit, and delete cookies across all domains' },
  { id: 'proxy',       label: 'Proxy Settings',       description: 'Configure HTTP/HTTPS/SOCKS proxy for all requests' },
  { id: 'certs',       label: 'Client Certificates',  description: 'mTLS client certificate configuration per domain' },
  { id: 'monitor',     label: 'API Monitor',          description: 'Schedule periodic health checks with VS Code alerts' },
  { id: 'interceptor', label: 'Request Interceptor',  description: 'Capture browser traffic via built-in proxy' },
  { id: 'grpc',        label: 'gRPC Client',          description: 'Load .proto, browse services, send unary/streaming' },
  { id: 'diff',        label: 'Response Diff',        description: 'Compare two responses side-by-side with highlighting' },
  { id: 'bulk',        label: 'Bulk URL Tester',      description: 'Test multiple URLs at once, get summary table' },
  { id: 'load',        label: 'Load Tester',          description: 'Concurrent load testing with p50/p95/p99 metrics' },
];

function PowerFeaturesPanel() {
  const [subtab, setSubtab] = useState<PowerSubtab>('cookies');
  // Panel-open states for "panel-style" tools
  const [showCookies, setShowCookies] = useState(false);
  const [showProxy, setShowProxy] = useState(false);
  const [showCerts, setShowCerts] = useState(false);
  const [showMonitor, setShowMonitor] = useState(false);
  const [showInterceptor, setShowInterceptor] = useState(false);
  const [showGrpc, setShowGrpc] = useState(false);
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
    else if (id === 'grpc') setShowGrpc(true);
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
            className="text-left p-3 rounded-xl border cursor-pointer transition-colors hover:border-[var(--color-settings)]"
            style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}
          >
            <p className="text-[12px] font-semibold text-[var(--color-text-primary)]">{t.label}</p>
            <p className="text-[10.5px] mt-0.5 text-[var(--color-text-muted)]">{t.description}</p>
          </button>
        ))}
      </div>

      {/* Modals */}
      {showCookies && <CookieManager onClose={() => setShowCookies(false)} />}
      {showProxy && <ProxySettings onClose={() => setShowProxy(false)} />}
      {showCerts && <ClientCertificates onClose={() => setShowCerts(false)} />}
      {showMonitor && <ApiMonitor onClose={() => setShowMonitor(false)} />}
      {showInterceptor && <RequestInterceptorPanel onClose={() => setShowInterceptor(false)} />}
      {showGrpc && <GrpcClientPanel onClose={() => setShowGrpc(false)} />}
      {showDiff && <ResponseDiffModal onClose={() => setShowDiff(false)} />}
      {showBulk && <BulkUrlTester onClose={() => setShowBulk(false)} />}
      {showLoad && <LoadTester onClose={() => setShowLoad(false)} />}
    </div>
  );
}
