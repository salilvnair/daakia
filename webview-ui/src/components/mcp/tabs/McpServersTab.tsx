import { useCallback, useState } from 'react';
import { useTabsStore, type McpServerConfig } from '../../../store/tabs-store';
import { TrashIcon, ConnectIcon, DisconnectIcon, CloseIcon } from '../../../icons';
import { postMsg } from '../../../vscode';
import {
  TextInputView,
  SelectInputView,
  MultilineInputView,
  ButtonView,
  IconButtonView,
} from '@salilvnair/dui';

const ACCENT = 'var(--color-protocol-mcp)';

const TRANSPORT_OPTIONS = [
  { value: 'stdio', label: 'STDIO — spawn subprocess' },
  { value: 'http', label: 'HTTP — JSON-RPC endpoint' },
];

const CATEGORY_OPTIONS = [
  { value: 'general', label: '⚙️ General — tool-calling only' },
  { value: 'database', label: '🗄️ Database — enables Schema Explorer' },
  { value: 'docs', label: '📚 Docs — documentation retrieval' },
  { value: 'code', label: '💻 Code — code analysis tools' },
];

// ─── Form state (text representations of array/object fields) ───

interface ServerForm {
  id: string;
  name: string;
  description: string;
  transport: 'stdio' | 'http';
  category: string;
  command: string;
  args: string;       // one per line → string[]
  env: string;        // KEY=value per line → Record<string, string>
  workingDir: string;
  url: string;
  headers: string;    // KEY: value per line → Record<string, string>
}

function serverToForm(s: McpServerConfig): ServerForm {
  return {
    id: s.id,
    name: s.name || '',
    description: s.description || '',
    transport: s.transport || 'stdio',
    category: s.category || 'general',
    command: s.command || '',
    args: (s.args || []).join('\n'),
    env: Object.entries(s.envVars || {}).map(([k, v]) => `${k}=${v}`).join('\n'),
    workingDir: s.workingDir || '',
    url: s.url || '',
    headers: Object.entries(s.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n'),
  };
}

function formToServer(f: ServerForm): McpServerConfig {
  const args = f.args.split('\n').map(s => s.trim()).filter(Boolean);
  const envVars: Record<string, string> = {};
  for (const line of f.env.split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) envVars[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const headers: Record<string, string> = {};
  for (const line of f.headers.split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const base: McpServerConfig = {
    id: f.id || crypto.randomUUID(),
    name: f.name.trim(),
    transport: f.transport,
    enabled: true,
  };
  if (f.description.trim()) base.description = f.description.trim();
  if (f.category && f.category !== 'general') base.category = f.category;
  if (f.transport === 'stdio') {
    base.command = f.command.trim();
    base.args = args;
    if (Object.keys(envVars).length) base.envVars = envVars;
    if (f.workingDir.trim()) base.workingDir = f.workingDir.trim();
  } else {
    base.url = f.url.trim();
    if (Object.keys(headers).length) base.headers = headers;
  }
  return base;
}

function emptyForm(): ServerForm {
  return { id: crypto.randomUUID(), name: '', description: '', transport: 'stdio', category: 'general', command: '', args: '', env: '', workingDir: '', url: '', headers: '' };
}

/**
 * McpServersTab — Multi-server management.
 * Each server can be independently connected/disconnected.
 * Add/edit form matches dmcr layout with full field set and DUI components.
 */
export function McpServersTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  const servers: McpServerConfig[] = activeTab?.mcpServerConfigs || [];
  const serverStates = activeTab?.mcpServerStates || {};
  const [form, setForm] = useState<ServerForm | null>(null);
  const [formIsNew, setFormIsNew] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const setServers = useCallback((newServers: McpServerConfig[]) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { mcpServerConfigs: newServers, dirty: true });
  }, [activeTab, updateTab]);

  const openAdd = useCallback(() => {
    setForm(emptyForm());
    setFormIsNew(true);
    setFormError(null);
  }, []);

  const openEdit = useCallback((server: McpServerConfig) => {
    setForm(serverToForm(server));
    setFormIsNew(false);
    setFormError(null);
  }, []);

  const handleCancel = useCallback(() => {
    setForm(null);
    setFormIsNew(false);
    setFormError(null);
  }, []);

  const handleSave = useCallback(() => {
    if (!form) return;
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    if (form.transport === 'stdio' && !form.command.trim()) { setFormError('Command is required for STDIO transport.'); return; }
    if (form.transport === 'http' && !form.url.trim()) { setFormError('URL is required for HTTP transport.'); return; }
    setFormError(null);
    const server = formToServer(form);
    if (formIsNew) {
      setServers([...servers, server]);
    } else {
      setServers(servers.map(s => s.id === form.id ? server : s));
    }
    setForm(null);
    setFormIsNew(false);
  }, [form, formIsNew, servers, setServers]);

  const up = useCallback(<K extends keyof ServerForm>(key: K, val: ServerForm[K]) => {
    setForm(prev => prev ? { ...prev, [key]: val } : prev);
  }, []);

  const handleRemove = useCallback((id: string) => {
    if (activeTab && serverStates[id]?.connected) {
      postMsg({ type: 'mcp:disconnectServer', tabId: activeTab.id, serverId: id });
    }
    setServers(servers.filter(s => s.id !== id));
    if (form?.id === id) handleCancel();
  }, [activeTab, servers, serverStates, setServers, form, handleCancel]);

  const handleConnect = useCallback((server: McpServerConfig) => {
    if (!activeTab) return;
    const state = serverStates[server.id];
    if (state?.connected || state?.connecting) {
      postMsg({ type: 'mcp:disconnectServer', tabId: activeTab.id, serverId: server.id });
    } else {
      postMsg({
        type: 'mcp:connectServer',
        tabId: activeTab.id,
        serverId: server.id,
        transport: server.transport,
        command: server.command || '',
        args: server.args || [],
        url: server.url || '',
        envVars: server.envVars || {},
        settings: activeTab.mcpSettings || {},
        envId: activeTab.envId,
      });
    }
  }, [activeTab, serverStates]);

  if (!activeTab) return null;

  const connectedCount = Object.values(serverStates).filter(s => s.connected).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
        <span className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wide">
          {servers.length} server{servers.length !== 1 ? 's' : ''}
          {connectedCount > 0 && (
            <span
              className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 15%, transparent)', color: 'var(--color-success)' }}
            >
              {connectedCount} connected
            </span>
          )}
        </span>
        <ButtonView
          label="+ Add Server"
          variant="ghost"
          size="sm"
          accentColor={ACCENT}
          onClick={openAdd}
        />
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-auto">
        {servers.length === 0 && !formIsNew && (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
            <span className="text-[28px] opacity-20">⟨/⟩</span>
            <span className="text-[12px] text-[var(--color-text-muted)]">No servers configured</span>
            <span className="text-[11px] text-[var(--color-text-muted)] opacity-70">
              Click "+ Add Server" or "Import Config" to get started.
            </span>
          </div>
        )}

        {servers.map((server) => {
          const state = serverStates[server.id] || { connected: false, connecting: false, tools: [] };
          const isEditing = form !== null && !formIsNew && form.id === server.id;

          return (
            <div key={server.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--color-surface-border)' }}>
              {/* Row header */}
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-[var(--color-surface-hover)] transition-colors"
                onClick={() => isEditing ? handleCancel() : openEdit(server)}
              >
                {/* Status dot */}
                <span
                  className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: state.connected ? 'var(--color-success)'
                      : state.connecting ? 'var(--color-warning)'
                      : state.error ? 'var(--color-error)'
                      : 'var(--color-text-muted)',
                  }}
                />
                <span className="flex-1 text-[12px] font-medium text-[var(--color-text-primary)] truncate">
                  {server.name || <em className="text-[var(--color-text-muted)] font-normal">unnamed</em>}
                </span>
                <span
                  className="text-[10px] px-1 py-0.5 rounded shrink-0"
                  style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-muted)' }}
                >
                  {server.transport.toUpperCase()}
                </span>
                {state.tools && state.tools.length > 0 && (
                  <span className="text-[10px] shrink-0" style={{ color: ACCENT }}>
                    {state.tools.length} tools
                  </span>
                )}
                {/* Connect/Disconnect */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleConnect(server); }}
                  className="shrink-0 flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded cursor-pointer transition-colors"
                  style={{
                    backgroundColor: state.connected || state.connecting
                      ? 'color-mix(in srgb, var(--color-error) 8%, transparent)'
                      : `color-mix(in srgb, ${ACCENT} 8%, transparent)`,
                    color: state.connected || state.connecting
                      ? 'color-mix(in srgb, var(--color-error) 70%, var(--color-text-secondary))'
                      : `color-mix(in srgb, ${ACCENT} 70%, var(--color-text-secondary))`,
                  }}
                >
                  {state.connected || state.connecting ? <DisconnectIcon size={10} /> : <ConnectIcon size={10} />}
                  {state.connecting ? 'Cancel' : state.connected ? 'Disconnect' : 'Connect'}
                </button>
                {/* Delete with confirm */}
                {confirmDeleteId === server.id ? (
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px]" style={{ color: 'var(--color-error)' }}>Delete?</span>
                    <button
                      type="button"
                      onClick={() => { handleRemove(server.id); setConfirmDeleteId(null); }}
                      className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer font-medium"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 15%, transparent)', color: 'var(--color-error)' }}
                    >Yes</button>
                    <IconButtonView
                      icon={<CloseIcon size={9} />}
                      size="sm"
                      onClick={() => setConfirmDeleteId(null)}
                    />
                  </div>
                ) : (
                  <IconButtonView
                    icon={<TrashIcon size={12} />}
                    size="sm"
                    accentColor="var(--color-error)"
                    title="Remove server"
                    onClick={(e) => { (e as React.MouseEvent).stopPropagation(); setConfirmDeleteId(server.id); }}
                  />
                )}
              </div>

              {/* Error */}
              {state.error && (
                <div className="px-3 pb-1 text-[11px]" style={{ color: 'var(--color-error)' }}>
                  ⚠ {state.error}
                </div>
              )}

              {/* Edit form inline */}
              {isEditing && form && (
                <ServerEditForm
                  form={form}
                  error={formError}
                  onUpdate={up}
                  onSave={handleSave}
                  onCancel={handleCancel}
                />
              )}
            </div>
          );
        })}

        {/* New server form at bottom */}
        {formIsNew && form && (
          <div className="border-t" style={{ borderColor: `color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))` }}>
            <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: ACCENT }}>
              New Server
            </div>
            <ServerEditForm
              form={form}
              error={formError}
              onUpdate={up}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          </div>
        )}
      </div>

    </div>
  );
}

// ─── OS detection for path placeholders ────────────────────────────────────────
const IS_WINDOWS = navigator.platform.startsWith('Win') || navigator.userAgent.includes('Windows');
const CWD_PLACEHOLDER = IS_WINDOWS ? 'C:\\path\\to\\project' : '/path/to/project';

// ─── Edit form sub-component ───────────────────────────────────────────────────

interface ServerEditFormProps {
  form: ServerForm;
  error: string | null;
  onUpdate: <K extends keyof ServerForm>(key: K, val: ServerForm[K]) => void;
  onSave: () => void;
  onCancel: () => void;
}

function ServerEditForm({ form, error, onUpdate, onSave, onCancel }: ServerEditFormProps) {
  return (
    <div
      className="px-4 pb-4 flex flex-col gap-3"
      style={{
        borderTop: `1px solid color-mix(in srgb, var(--color-protocol-mcp) 15%, var(--color-surface-border))`,
        backgroundColor: `color-mix(in srgb, var(--color-protocol-mcp) 3%, var(--color-panel))`,
      }}
    >
      {/* Name */}
      <div className="flex flex-col gap-1 pt-3">
        <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
          Name <span style={{ color: 'var(--color-error)' }}>*</span>
        </label>
        <TextInputView
          value={form.name}
          onChange={(e) => onUpdate('name', e.target.value)}
          placeholder="e.g. filesystem"
          size="md"
        />
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
          Description{' '}
          <span className="font-normal opacity-60">(optional — used as LLM hint)</span>
        </label>
        <TextInputView
          value={form.description}
          onChange={(e) => onUpdate('description', e.target.value)}
          placeholder="PostgreSQL schema introspection and query tools"
          size="md"
        />
      </div>

      {/* Transport + Category row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Transport</label>
          <SelectInputView
            options={TRANSPORT_OPTIONS}
            value={form.transport}
            onChange={(v) => onUpdate('transport', v as 'stdio' | 'http')}
            size="md"
            accentColor="var(--color-protocol-mcp)"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
            Category{' '}
            <span className="font-normal opacity-60">(optional)</span>
          </label>
          <SelectInputView
            options={CATEGORY_OPTIONS}
            value={form.category}
            onChange={(v) => onUpdate('category', v)}
            size="md"
            accentColor="var(--color-protocol-mcp)"
          />
        </div>
      </div>

      {/* STDIO fields */}
      {form.transport === 'stdio' && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              Command <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <TextInputView
              value={form.command}
              onChange={(e) => onUpdate('command', e.target.value)}
              placeholder="npx"
              size="md"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              Arguments{' '}
              <span className="font-normal opacity-60">(one per line)</span>
            </label>
            <MultilineInputView
              value={form.args}
              onChange={(e) => onUpdate('args', e.target.value)}
              placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/tmp'}
              size="md"
              rows={4}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              Environment{' '}
              <span className="font-normal opacity-60">(KEY=value per line, optional)</span>
            </label>
            <MultilineInputView
              value={form.env}
              onChange={(e) => onUpdate('env', e.target.value)}
              placeholder="GITHUB_TOKEN=ghp_xxx"
              size="md"
              rows={3}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              Working Directory{' '}
              <span className="font-normal opacity-60">(optional — for finding config files like app_mcp.yml)</span>
            </label>
            <TextInputView
              value={form.workingDir}
              onChange={(e) => onUpdate('workingDir', e.target.value)}
              placeholder={CWD_PLACEHOLDER}
              size="md"
            />
          </div>
        </>
      )}

      {/* HTTP fields */}
      {form.transport === 'http' && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              URL <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <TextInputView
              value={form.url}
              onChange={(e) => onUpdate('url', e.target.value)}
              placeholder="https://example.com/mcp"
              size="md"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              Headers{' '}
              <span className="font-normal opacity-60">(KEY: value per line, optional)</span>
            </label>
            <MultilineInputView
              value={form.headers}
              onChange={(e) => onUpdate('headers', e.target.value)}
              placeholder="Authorization: Bearer xxx"
              size="md"
              rows={3}
            />
          </div>
        </>
      )}

      {/* Error */}
      {error && (
        <div className="text-[11px] px-2 py-1 rounded" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)' }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <ButtonView label="Cancel" variant="ghost" size="md" onClick={onCancel} />
        <ButtonView label="Save" variant="primary" size="md" accentColor={ACCENT} onClick={onSave} />
      </div>
    </div>
  );
}
