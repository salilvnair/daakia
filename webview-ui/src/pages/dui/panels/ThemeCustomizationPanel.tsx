import { useState, useRef, useCallback, useEffect } from 'react';
import { DownloadIcon, UploadIcon, RefreshIcon } from '../../../icons';
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
  { group: 'component_button', key: 'primary_bg',          cssVar: '--color-btn-primary-bg',       comment: 'Primary button background' },
  { group: 'component_button', key: 'primary_hover',       cssVar: '--color-btn-primary-hover',    comment: 'Primary button hover background' },
  { group: 'component_button', key: 'secondary_bg',        cssVar: '--color-btn-secondary-bg',     comment: 'Secondary button background' },
  { group: 'component_button', key: 'secondary_hover',     cssVar: '--color-btn-secondary-hover',  comment: 'Secondary button hover background' },
  { group: 'component_button', key: 'secondary_border',    cssVar: '--color-btn-secondary-border', comment: 'Secondary button border' },
  { group: 'component_button', key: 'ghost_hover',         cssVar: '--color-btn-ghost-hover',      comment: 'Ghost button hover background' },
  { group: 'component_button', key: 'danger_bg',           cssVar: '--color-btn-danger-bg',        comment: 'Danger button background' },
  // component — sidenav
  { group: 'component_sidenav', key: 'item_hover',         cssVar: '--color-sidenav-item-hover',   comment: 'Nav item hover background' },
  // component — toggle
  { group: 'component_toggle', key: 'track_on',            cssVar: '--color-toggle-on',            comment: 'Toggle track color when enabled' },
  { group: 'component_toggle', key: 'thumb',               cssVar: '--color-toggle-thumb',         comment: 'Toggle thumb / dot color' },
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
    // Strip trailing inline comment
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
        // Strip surrounding quotes
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

// ─── Component ────────────────────────────────────────────────────────────────

type StatusMsg = { type: 'success' | 'error'; text: string } | null;

export function ThemeCustomizationPanel() {
  const [status, setStatus] = useState<StatusMsg>(null);
  const [colors, setColors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setColors(readCurrentColors()); }, []);

  const showStatus = useCallback((type: 'success' | 'error', text: string) => {
    setStatus({ type, text });
    setTimeout(() => setStatus(null), 4000);
  }, []);

  const handleExport = useCallback(() => {
    const yaml = generateYaml();
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'daakia-theme.yaml';
    a.click();
    URL.revokeObjectURL(url);
    showStatus('success', 'Exported daakia-theme.yaml');
  }, [showStatus]);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const text = ev.target?.result as string;
        const cssVarMap = parseThemeYaml(text);
        const count = Object.keys(cssVarMap).length;
        if (count === 0) {
          showStatus('error', 'No recognised color variables found in YAML');
          return;
        }
        applyThemeVars(cssVarMap);
        setColors(readCurrentColors());
        showStatus('success', `Applied ${count} of ${SCHEMA.length} color variables`);
      } catch {
        showStatus('error', 'Could not parse the YAML file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [showStatus]);

  const handleReset = useCallback(() => {
    resetThemeVars();
    setColors(readCurrentColors());
    showStatus('success', 'Theme reset to built-in defaults');
  }, [showStatus]);

  const grouped = GROUPS.map(g => ({
    group: g,
    entries: SCHEMA.filter(s => s.group === g),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Actions bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <ButtonView label="Export YAML" icon={<DownloadIcon size={13} />} variant="primary"   size="sm" onClick={handleExport} />
        <ButtonView label="Upload YAML" icon={<UploadIcon size={13} />}   variant="secondary" size="sm" onClick={() => fileRef.current?.click()} />
        <ButtonView label="Reset"       icon={<RefreshIcon size={13} />}  variant="ghost"     size="sm" onClick={handleReset} />
        <input ref={fileRef} type="file" accept=".yaml,.yml" style={{ display: 'none' }} onChange={handleUpload} />
        {status && (
          <span style={{
            fontSize: '12px',
            padding: '3px 10px',
            borderRadius: '6px',
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

      {/* How-it-works card */}
      <div style={{
        background: 'color-mix(in srgb, var(--color-info) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-info) 22%, transparent)',
        borderRadius: '8px',
        padding: '12px 16px',
        fontSize: '12px',
        color: 'var(--color-text-secondary)',
        lineHeight: '1.6',
      }}>
        <strong style={{ color: 'var(--color-info)', display: 'block', marginBottom: '4px' }}>
          Springboot-level theme config
        </strong>
        Export the current theme as a <strong>YAML file</strong> containing all {SCHEMA.length} CSS color variables,
        hierarchically grouped by category. Edit color values with any text editor or color-picker tool,
        then upload the modified YAML — colors apply <strong>live</strong> with zero rebuild.
        Works with both dark and light themes. "Reset" removes all overrides and returns to built-in defaults.
      </div>

      {/* Color groups */}
      {grouped.map(({ group, entries }) => (
        <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{
            fontSize: '10px', fontWeight: 700,
            color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span>{group.replace(/_/g, ' ')}</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--color-surface-border)' }} />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {entries.map(entry => {
              const resolvedColor = colors[entry.cssVar] || '';
              return (
                <div
                  key={entry.cssVar}
                  title={`${entry.cssVar}${resolvedColor ? `\n${resolvedColor}` : ''}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-surface-border)',
                    borderRadius: '6px',
                    padding: '5px 9px 5px 5px',
                  }}
                >
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '4px', flexShrink: 0,
                    background: `var(${entry.cssVar})`,
                    border: '1px solid var(--color-surface-border)',
                    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                  }} />
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                      {entry.key.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                      {entry.cssVar}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
