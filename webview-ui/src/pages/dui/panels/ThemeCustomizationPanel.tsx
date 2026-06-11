import { useState, useRef, useCallback, useEffect } from 'react';
import { DownloadIcon, UploadIcon, RefreshIcon, CloseIcon } from '../../../icons';
import { ButtonView } from '../../../dui';

// Full mapping: every --color-* CSS variable → its YAML group + key + human comment
const SCHEMA: Array<{ group: string; key: string; cssVar: string; comment: string }> = [
  // brand
  { group: 'brand', key: 'primary',         cssVar: '--color-primary',         comment: 'Main accent' },
  { group: 'brand', key: 'primary_hover',   cssVar: '--color-primary-hover',   comment: 'Accent hover' },
  { group: 'brand', key: 'primary_light',   cssVar: '--color-primary-light',   comment: 'Accent light' },
  { group: 'brand', key: 'primary_dark',    cssVar: '--color-primary-dark',    comment: 'Accent dark' },
  // surface
  { group: 'surface', key: 'background',    cssVar: '--color-surface',         comment: 'Main surface bg' },
  { group: 'surface', key: 'hover',         cssVar: '--color-surface-hover',   comment: 'Surface hover' },
  { group: 'surface', key: 'active',        cssVar: '--color-surface-active',  comment: 'Surface active' },
  { group: 'surface', key: 'border',        cssVar: '--color-surface-border',  comment: 'Surface border' },
  { group: 'surface', key: 'bg',            cssVar: '--color-surface-bg',      comment: 'Alt surface bg' },
  // panel
  { group: 'panel', key: 'background',      cssVar: '--color-panel',           comment: 'Sidebar / panel bg' },
  { group: 'panel', key: 'border',          cssVar: '--color-panel-border',    comment: 'Panel border' },
  // elevated
  { group: 'elevated', key: 'background',   cssVar: '--color-elevated',        comment: 'Card / modal bg' },
  { group: 'elevated', key: 'border',       cssVar: '--color-elevated-border', comment: 'Card / modal border' },
  // input
  { group: 'input', key: 'background',      cssVar: '--color-input-bg',        comment: 'Input bg' },
  { group: 'input', key: 'border',          cssVar: '--color-input-border',    comment: 'Input border' },
  { group: 'input', key: 'hover',           cssVar: '--color-input-hover',     comment: 'Input hover' },
  { group: 'input', key: 'focus',           cssVar: '--color-input-focus',     comment: 'Input focus bg' },
  // interactive
  { group: 'interactive', key: 'icon_hover_bg', cssVar: '--color-icon-hover-bg', comment: 'Icon hover bg' },
  { group: 'interactive', key: 'item_hover_bg', cssVar: '--color-item-hover-bg', comment: 'List item hover' },
  // text
  { group: 'text', key: 'primary',          cssVar: '--color-text-primary',    comment: 'Primary text' },
  { group: 'text', key: 'secondary',        cssVar: '--color-text-secondary',  comment: 'Secondary text' },
  { group: 'text', key: 'muted',            cssVar: '--color-text-muted',      comment: 'Muted / placeholder' },
  // status
  { group: 'status', key: 'success',        cssVar: '--color-success',         comment: 'Success green' },
  { group: 'status', key: 'warning',        cssVar: '--color-warning',         comment: 'Warning amber' },
  { group: 'status', key: 'error',          cssVar: '--color-error',           comment: 'Error red' },
  { group: 'status', key: 'info',           cssVar: '--color-info',            comment: 'Info blue' },
  // http_methods
  { group: 'http_methods', key: 'get',      cssVar: '--color-method-get',      comment: 'GET' },
  { group: 'http_methods', key: 'post',     cssVar: '--color-method-post',     comment: 'POST' },
  { group: 'http_methods', key: 'put',      cssVar: '--color-method-put',      comment: 'PUT' },
  { group: 'http_methods', key: 'patch',    cssVar: '--color-method-patch',    comment: 'PATCH' },
  { group: 'http_methods', key: 'delete',   cssVar: '--color-method-delete',   comment: 'DELETE' },
  { group: 'http_methods', key: 'head',     cssVar: '--color-method-head',     comment: 'HEAD' },
  { group: 'http_methods', key: 'options',  cssVar: '--color-method-options',  comment: 'OPTIONS' },
  // sidebar
  { group: 'sidebar', key: 'collections',   cssVar: '--color-sidebar-collections',  comment: 'Collections tab' },
  { group: 'sidebar', key: 'history',       cssVar: '--color-sidebar-history',      comment: 'History tab' },
  { group: 'sidebar', key: 'environments',  cssVar: '--color-sidebar-environments', comment: 'Environments tab' },
  // protocols
  { group: 'protocols', key: 'rest',        cssVar: '--color-protocol-rest',      comment: 'REST' },
  { group: 'protocols', key: 'graphql',     cssVar: '--color-protocol-graphql',   comment: 'GraphQL' },
  { group: 'protocols', key: 'websocket',   cssVar: '--color-protocol-websocket', comment: 'WebSocket' },
  { group: 'protocols', key: 'sse',         cssVar: '--color-protocol-sse',       comment: 'SSE' },
  { group: 'protocols', key: 'socketio',    cssVar: '--color-protocol-socketio',  comment: 'Socket.IO' },
  { group: 'protocols', key: 'mqtt',        cssVar: '--color-protocol-mqtt',      comment: 'MQTT' },
  { group: 'protocols', key: 'grpc',        cssVar: '--color-protocol-grpc',      comment: 'gRPC' },
  { group: 'protocols', key: 'soap',        cssVar: '--color-protocol-soap',      comment: 'SOAP' },
  { group: 'protocols', key: 'ai',          cssVar: '--color-protocol-ai',        comment: 'AI' },
  { group: 'protocols', key: 'mcp',         cssVar: '--color-protocol-mcp',       comment: 'MCP' },
  // mock_server
  { group: 'mock_server', key: 'accent',     cssVar: '--color-mock-server',       comment: 'Mock server accent' },
  { group: 'mock_server', key: 'muted',      cssVar: '--color-mock-server-muted', comment: 'Mock server muted' },
  { group: 'mock_server', key: 'try_button', cssVar: '--color-try-button',        comment: 'Try button' },
  // settings
  { group: 'settings', key: 'accent',        cssVar: '--color-settings',          comment: 'Settings accent' },
  // response_time
  { group: 'response_time', key: 'fast',     cssVar: '--color-time-fast',         comment: '< 200 ms' },
  { group: 'response_time', key: 'moderate', cssVar: '--color-time-moderate',     comment: '200–1000 ms' },
  { group: 'response_time', key: 'slow',     cssVar: '--color-time-slow',         comment: '1–3 s' },
  { group: 'response_time', key: 'critical', cssVar: '--color-time-critical',     comment: '> 3 s' },
  // misc
  { group: 'misc', key: 'muted',            cssVar: '--color-muted',             comment: 'General muted' },
  { group: 'misc', key: 'muted_fallback',   cssVar: '--color-muted-fallback',    comment: 'Muted fallback' },
  { group: 'misc', key: 'status_5xx',       cssVar: '--color-status-5xx',        comment: '5xx error' },
  // context_menu
  { group: 'context_menu', key: 'rename',      cssVar: '--color-ctx-rename',       comment: 'Rename action' },
  { group: 'context_menu', key: 'duplicate',   cssVar: '--color-ctx-duplicate',    comment: 'Duplicate action' },
  { group: 'context_menu', key: 'pin',         cssVar: '--color-ctx-pin',          comment: 'Pin action' },
  { group: 'context_menu', key: 'close',       cssVar: '--color-ctx-close',        comment: 'Close action' },
  { group: 'context_menu', key: 'close_batch', cssVar: '--color-ctx-close-batch',  comment: 'Close others' },
  { group: 'context_menu', key: 'close_saved', cssVar: '--color-ctx-close-saved',  comment: 'Close saved' },
  { group: 'context_menu', key: 'close_all',   cssVar: '--color-ctx-close-all',    comment: 'Close all' },
  // component — button
  { group: 'component_button', key: 'primary_bg',       cssVar: '--color-btn-primary-bg',       comment: 'Primary button background' },
  { group: 'component_button', key: 'primary_hover',    cssVar: '--color-btn-primary-hover',    comment: 'Primary button hover background' },
  { group: 'component_button', key: 'secondary_bg',     cssVar: '--color-btn-secondary-bg',     comment: 'Secondary button background' },
  { group: 'component_button', key: 'secondary_hover',  cssVar: '--color-btn-secondary-hover',  comment: 'Secondary button hover background' },
  { group: 'component_button', key: 'secondary_border', cssVar: '--color-btn-secondary-border', comment: 'Secondary button border' },
  { group: 'component_button', key: 'ghost_hover',      cssVar: '--color-btn-ghost-hover',      comment: 'Ghost button hover background' },
  { group: 'component_button', key: 'danger_bg',        cssVar: '--color-btn-danger-bg',        comment: 'Danger button background' },
  // component — sidenav
  { group: 'component_sidenav', key: 'item_hover',      cssVar: '--color-sidenav-item-hover',   comment: 'Nav item hover background' },
  // component — toggle
  { group: 'component_toggle', key: 'track_on',         cssVar: '--color-toggle-on',            comment: 'Toggle track color when enabled' },
  { group: 'component_toggle', key: 'thumb',            cssVar: '--color-toggle-thumb',         comment: 'Toggle thumb / dot color' },
  // component — prompt card
  { group: 'component_prompt_card', key: 'avatar_bg',    cssVar: '--color-promptcard-avatar-bg',    comment: 'Avatar background color' },
  { group: 'component_prompt_card', key: 'avatar_text',  cssVar: '--color-promptcard-avatar-text',  comment: 'Avatar text / icon color' },
  { group: 'component_prompt_card', key: 'title_text',   cssVar: '--color-promptcard-title',        comment: 'Card title text color' },
  { group: 'component_prompt_card', key: 'body_text',    cssVar: '--color-promptcard-body',         comment: 'Body / description text color' },
  { group: 'component_prompt_card', key: 'chip_color',   cssVar: '--color-promptcard-chip',         comment: 'Protocol chip accent color' },
  { group: 'component_prompt_card', key: 'badge_bg',     cssVar: '--color-promptcard-badge-bg',     comment: 'CUSTOM badge background' },
  { group: 'component_prompt_card', key: 'badge_text',   cssVar: '--color-promptcard-badge-text',   comment: 'CUSTOM badge text color' },
  { group: 'component_prompt_card', key: 'action_icon',  cssVar: '--color-promptcard-action-icon',  comment: 'Use/Copy/Edit icon color' },
  { group: 'component_prompt_card', key: 'delete_icon',  cssVar: '--color-promptcard-delete-icon',  comment: 'Delete icon color' },
  // component — var pill
  { group: 'component_var_pill', key: 'background',      cssVar: '--color-var-pill-bg',             comment: '{{var}} token background' },
  { group: 'component_var_pill', key: 'text',            cssVar: '--color-var-pill-text',           comment: '{{var}} token text color' },
  { group: 'component_var_pill', key: 'border',          cssVar: '--color-var-pill-border',         comment: '{{var}} token border color' },
];

const GROUPS = [...new Set(SCHEMA.map(s => s.group))];

// ─── YAML helpers ─────────────────────────────────────────────────────────────

function generateYaml(): string {
  const computed = getComputedStyle(document.documentElement);
  const lines = [
    '# Daakia Theme Configuration',
    `# Exported: ${new Date().toISOString()}`,
    '# Edit color values and upload back to apply live — no rebuild needed.',
    '',
  ];
  let currentGroup = '';
  for (const entry of SCHEMA) {
    if (entry.group !== currentGroup) {
      if (currentGroup) lines.push('');
      lines.push(`${entry.group}:`);
      currentGroup = entry.group;
    }
    const val = computed.getPropertyValue(entry.cssVar).trim() || 'inherit';
    lines.push(`  ${entry.key}: "${val}"  # ${entry.comment}  (${entry.cssVar})`);
  }
  lines.push('');
  return lines.join('\n');
}

function parseThemeYaml(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  let currentGroup = '';
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line || line.trim().startsWith('#')) continue;
    const stripped = line.trimStart();
    const indent = line.length - stripped.length;
    const content = stripped.replace(/#.*$/, '').trimEnd();
    if (indent === 0) {
      if (content.endsWith(':') && !content.includes(': ')) {
        currentGroup = content.slice(0, -1).trim();
      }
    } else if (indent > 0 && currentGroup) {
      const colonIdx = content.indexOf(':');
      if (colonIdx > 0) {
        const yamlKey = content.slice(0, colonIdx).trim();
        let value = content.slice(colonIdx + 1).trim();
        if (value.length >= 2 &&
            ((value[0] === '"' && value[value.length - 1] === '"') ||
             (value[0] === "'" && value[value.length - 1] === "'"))) {
          value = value.slice(1, -1);
        }
        if (value) {
          const entry = SCHEMA.find(s => s.group === currentGroup && s.key === yamlKey);
          if (entry) map[entry.cssVar] = value;
        }
      }
    }
  }
  return map;
}

function applyThemeVars(cssVarMap: Record<string, string>) {
  for (const [cssVar, value] of Object.entries(cssVarMap)) {
    document.documentElement.style.setProperty(cssVar, value);
  }
}

function resetThemeVars() {
  for (const entry of SCHEMA) {
    document.documentElement.style.removeProperty(entry.cssVar);
  }
}

function readCurrentColors(): Record<string, string> {
  const computed = getComputedStyle(document.documentElement);
  const result: Record<string, string> = {};
  for (const entry of SCHEMA) {
    result[entry.cssVar] = computed.getPropertyValue(entry.cssVar).trim();
  }
  return result;
}

function toHexSafe(val: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(val.trim())) return val.trim();
  return '#6366f1';
}

// ─── Inline Color Editor ──────────────────────────────────────────────────────

function ColorEditor({
  entry,
  currentValue,
  isOverridden,
  onApply,
  onReset,
  onClose,
}: {
  entry: { cssVar: string; key: string; comment: string };
  currentValue: string;
  isOverridden: boolean;
  onApply: (v: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(currentValue);
  const isHex = /^#[0-9a-fA-F]{6}$/.test(draft.trim());

  const commit = (v: string) => {
    setDraft(v);
    onApply(v);
  };

  return (
    <div style={{
      margin: '6px 0 4px',
      padding: '10px 12px',
      background: 'var(--color-elevated)',
      border: '1px solid var(--color-primary)',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <code style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'monospace', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.cssVar}
        </code>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{entry.comment}</span>
        <button
          type="button"
          onClick={onClose}
          style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', borderRadius: 4, flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <CloseIcon size={11} />
        </button>
      </div>

      {/* Color picker + text input row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Color swatch — wraps hidden <input type="color"> */}
        <label style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }}>
          <div style={{
            width: 30, height: 30, borderRadius: 6, flexShrink: 0,
            background: `var(${entry.cssVar})`,
            border: '2px solid var(--color-surface-border)',
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)',
          }} />
          <input
            type="color"
            value={toHexSafe(draft)}
            onChange={e => commit(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 'none' }}
          />
        </label>

        {/* Text input */}
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(draft); if (e.key === 'Escape') onClose(); }}
          onBlur={() => { if (draft !== currentValue) commit(draft); }}
          placeholder="e.g. #6366f1 or rgba(99,102,241,0.4)"
          style={{
            flex: 1, height: 30, padding: '0 10px', borderRadius: 6,
            background: 'var(--color-input-bg)',
            border: `1px solid ${isHex ? 'var(--color-input-border)' : 'var(--color-warning)'}`,
            color: 'var(--color-text-primary)', fontSize: 11,
            fontFamily: 'Menlo, Monaco, monospace', outline: 'none',
          }}
          onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--color-primary)'; }}
        />

        {/* Reset button */}
        {isOverridden && (
          <button
            type="button"
            onClick={onReset}
            title="Reset to built-in default"
            style={{
              height: 30, padding: '0 10px', borderRadius: 6, border: '1px solid var(--color-surface-border)',
              background: 'transparent', color: 'var(--color-text-muted)', fontSize: 10,
              cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-error)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-error)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-surface-border)'; }}
          >
            ↺ Reset
          </button>
        )}
      </div>

      {/* Non-hex warning */}
      {draft && !isHex && (
        <div style={{ fontSize: 10, color: 'var(--color-warning)', lineHeight: 1.4 }}>
          Non-hex value (e.g. rgba, color-mix, var) — color picker shows approximate. Press Enter to apply.
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type StatusMsg = { type: 'success' | 'error'; text: string } | null;

export function ThemeCustomizationPanel() {
  const [status, setStatus]       = useState<StatusMsg>(null);
  const [colors, setColors]       = useState<Record<string, string>>({});
  const [activeVar, setActiveVar] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setColors(readCurrentColors()); }, []);

  const showStatus = useCallback((type: 'success' | 'error', text: string) => {
    setStatus({ type, text });
    setTimeout(() => setStatus(null), 4000);
  }, []);

  const handleExport = useCallback(() => {
    const yaml = generateYaml();
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'daakia-theme.yaml'; a.click();
    URL.revokeObjectURL(url);
    showStatus('success', 'Exported daakia-theme.yaml');
  }, [showStatus]);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const cssVarMap = parseThemeYaml(ev.target?.result as string);
        const count = Object.keys(cssVarMap).length;
        if (count === 0) { showStatus('error', 'No recognised color variables found in YAML'); return; }
        applyThemeVars(cssVarMap);
        setColors(readCurrentColors());
        setOverrides(prev => new Set([...prev, ...Object.keys(cssVarMap)]));
        showStatus('success', `Applied ${count} of ${SCHEMA.length} color variables`);
      } catch { showStatus('error', 'Could not parse the YAML file'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [showStatus]);

  const handleReset = useCallback(() => {
    resetThemeVars();
    setColors(readCurrentColors());
    setOverrides(new Set());
    setActiveVar(null);
    showStatus('success', 'Theme reset to built-in defaults');
  }, [showStatus]);

  // Live-apply a single CSS var change
  const applyLiveColor = useCallback((cssVar: string, value: string) => {
    document.documentElement.style.setProperty(cssVar, value);
    setColors(prev => ({ ...prev, [cssVar]: value }));
    setOverrides(prev => new Set([...prev, cssVar]));
  }, []);

  // Reset a single CSS var to its built-in value
  const resetSingleVar = useCallback((cssVar: string) => {
    document.documentElement.style.removeProperty(cssVar);
    const fresh = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    setColors(prev => ({ ...prev, [cssVar]: fresh }));
    setOverrides(prev => { const n = new Set(prev); n.delete(cssVar); return n; });
  }, []);

  const handleTileClick = (cssVar: string) => {
    setActiveVar(prev => prev === cssVar ? null : cssVar);
  };

  const grouped = GROUPS.map(g => ({
    group: g,
    entries: SCHEMA.filter(s => s.group === g),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Actions bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <ButtonView label="Export YAML" icon={<DownloadIcon size={13} />} variant="primary"   size="sm" onClick={handleExport} />
        <ButtonView label="Upload YAML" icon={<UploadIcon size={13} />}   variant="secondary" size="sm" onClick={() => fileRef.current?.click()} />
        <ButtonView label="Reset all"   icon={<RefreshIcon size={13} />}  variant="ghost"     size="sm" onClick={handleReset} />
        <input ref={fileRef} type="file" accept=".yaml,.yml" style={{ display: 'none' }} onChange={handleUpload} />
        {overrides.size > 0 && (
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 99,
            background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
            color: 'var(--color-primary)', fontWeight: 600,
          }}>
            {overrides.size} modified
          </span>
        )}
        {status && (
          <span style={{
            fontSize: 12, padding: '3px 10px', borderRadius: 6,
            color: status.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            background: status.type === 'success'
              ? 'color-mix(in srgb, var(--color-success) 10%, transparent)'
              : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
            border: `1px solid ${status.type === 'success'
              ? 'color-mix(in srgb, var(--color-success) 25%, transparent)'
              : 'color-mix(in srgb, var(--color-error) 25%, transparent)'}`,
          }}>
            {status.text}
          </span>
        )}
      </div>

      {/* Hint */}
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Click any color swatch to edit it live. Changes apply instantly — no rebuild needed.
        Use <strong style={{ color: 'var(--color-text-secondary)' }}>Export YAML</strong> to save your theme,
        <strong style={{ color: 'var(--color-text-secondary)' }}> Upload YAML</strong> to restore it, or
        <strong style={{ color: 'var(--color-text-secondary)' }}> Reset all</strong> to return to built-in defaults.
      </div>

      {/* Color groups */}
      {grouped.map(({ group, entries }) => {
        const activeEntry = activeVar ? entries.find(e => e.cssVar === activeVar) : null;
        return (
          <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* Group header */}
            <div style={{
              fontSize: 10, fontWeight: 700,
              color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <span>{group.replace(/_/g, ' ')}</span>
              {entries.some(e => overrides.has(e.cssVar)) && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-primary)', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, height: 1, background: 'var(--color-surface-border)' }} />
            </div>

            {/* Tiles */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {entries.map(entry => {
                const isActive   = activeVar === entry.cssVar;
                const isModified = overrides.has(entry.cssVar);
                return (
                  <button
                    key={entry.cssVar}
                    type="button"
                    title={`${entry.cssVar}\n${colors[entry.cssVar] || ''}`}
                    onClick={() => handleTileClick(entry.cssVar)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '7px',
                      background: isActive ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface))' : 'var(--color-surface)',
                      border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--color-surface-border)'}`,
                      borderRadius: 6, padding: '5px 9px 5px 5px',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'border-color 100ms, background 100ms',
                      position: 'relative',
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--color-primary) 40%, var(--color-surface-border))'; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-surface-border)'; }}
                  >
                    {/* Color swatch */}
                    <div style={{
                      width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                      background: `var(${entry.cssVar})`,
                      border: '1px solid var(--color-surface-border)',
                      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                    }} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {entry.key.replace(/_/g, ' ')}
                        {isModified && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-primary)', flexShrink: 0 }} />}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                        {entry.cssVar}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Inline editor — shown when a tile in this group is active */}
            {activeEntry && (
              <ColorEditor
                entry={activeEntry}
                currentValue={colors[activeEntry.cssVar] || ''}
                isOverridden={overrides.has(activeEntry.cssVar)}
                onApply={v => applyLiveColor(activeEntry.cssVar, v)}
                onReset={() => resetSingleVar(activeEntry.cssVar)}
                onClose={() => setActiveVar(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
