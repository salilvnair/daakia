import { useState, useRef, useCallback, useEffect } from 'react';
import { DownloadIcon, UploadIcon, RefreshIcon } from '../../../icons';
import { ButtonView } from '../../../dui';
import { SCHEMA, GROUPS } from '../../../dui/theme/core';
import { generateYaml, parseThemeYaml, applyThemeVars, resetThemeVars, readCurrentColors } from '../../../dui/theme/utils';
import { ColorEditor } from '../../../dui/theme/editor';

type StatusMsg = { type: 'success' | 'error'; text: string } | null;

export function ThemeCustomizationPanel() {
  const [status,    setStatus]    = useState<StatusMsg>(null);
  const [colors,    setColors]    = useState<Record<string, string>>({});
  const [activeVar, setActiveVar] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const fileRef    = useRef<HTMLInputElement>(null);

  useEffect(() => { setColors(readCurrentColors()); }, []);

  const editorCallbackRef = useCallback((el: HTMLDivElement | null) => {
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }, []);

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

  const applyLiveColor = useCallback((cssVar: string, value: string) => {
    document.documentElement.style.setProperty(cssVar, value);
    setColors(prev => ({ ...prev, [cssVar]: value }));
    setOverrides(prev => new Set([...prev, cssVar]));
  }, []);

  const resetSingleVar = useCallback((cssVar: string) => {
    document.documentElement.style.removeProperty(cssVar);
    const fresh = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    setColors(prev => ({ ...prev, [cssVar]: fresh }));
    setOverrides(prev => { const n = new Set(prev); n.delete(cssVar); return n; });
  }, []);

  const grouped = GROUPS.map(g => ({ group: g, entries: SCHEMA.filter(s => s.group === g) }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Actions bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <ButtonView label="Export YAML" iconLeft={<DownloadIcon size={13} />} variant="primary"   size="sm" onClick={handleExport} />
        <ButtonView label="Upload YAML" iconLeft={<UploadIcon size={13} />}   variant="secondary" size="sm" onClick={() => fileRef.current?.click()} />
        <ButtonView label="Reset all"   iconLeft={<RefreshIcon size={13} />}  variant="ghost"     size="sm" onClick={handleReset} />
        <input ref={fileRef} type="file" accept=".yaml,.yml" style={{ display: 'none' }} onChange={handleUpload} />
        {overrides.size > 0 && (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)', fontWeight: 600 }}>
            {overrides.size} modified
          </span>
        )}
        {status && (
          <span style={{
            fontSize: 12, padding: '3px 10px', borderRadius: 6,
            color: status.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            background: status.type === 'success' ? 'color-mix(in srgb, var(--color-success) 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
            border: `1px solid ${status.type === 'success' ? 'color-mix(in srgb, var(--color-success) 25%, transparent)' : 'color-mix(in srgb, var(--color-error) 25%, transparent)'}`,
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
        const groupModified = entries.some(e => overrides.has(e.cssVar));
        return (
          <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Group header */}
            <div style={{
              fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>{group.replace(/_/g, ' ')}</span>
              {groupModified && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-primary)', flexShrink: 0 }} />}
              <div style={{ flex: 1, height: 1, background: 'var(--color-surface-border)' }} />
            </div>

            {/* Tile grid — uniform columns, tiles snap to same width */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(192px, 1fr))',
              gap: '6px',
            }}>
              {entries.map(entry => {
                const isActive   = activeVar === entry.cssVar;
                const isModified = overrides.has(entry.cssVar);
                return (
                  <button
                    key={entry.cssVar}
                    type="button"
                    title={`${entry.cssVar}\n${colors[entry.cssVar] || ''}`}
                    onClick={() => setActiveVar(prev => prev === entry.cssVar ? null : entry.cssVar)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px 6px 8px',
                      borderRadius: 7,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      background: isActive
                        ? 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))'
                        : 'var(--color-surface)',
                      border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--color-surface-border)'}`,
                      outline: 'none',
                      transition: 'border-color 100ms, background 100ms',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary) 45%, var(--color-surface-border))';
                        e.currentTarget.style.background = 'color-mix(in srgb, var(--color-text-primary) 3%, transparent)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = 'var(--color-surface-border)';
                        e.currentTarget.style.background = 'var(--color-surface)';
                      }
                    }}
                  >
                    {/* Swatch */}
                    <div style={{
                      width: 26, height: 26, borderRadius: 5, flexShrink: 0,
                      background: `var(${entry.cssVar})`,
                      border: '1px solid color-mix(in srgb, var(--color-text-primary) 14%, transparent)',
                      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                    }} />

                    {/* Labels */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 500,
                          color: 'var(--color-text-primary)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {entry.key.replace(/_/g, ' ')}
                        </span>
                        {isModified && (
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-primary)', flexShrink: 0 }} />
                        )}
                      </div>
                      <div style={{
                        fontSize: 9, color: 'var(--color-text-muted)', fontFamily: 'monospace',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {colors[entry.cssVar] || entry.cssVar}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Inline editor — shown below the grid when a tile is active */}
            {activeEntry && (
              <div ref={editorCallbackRef}>
                <ColorEditor
                  entry={activeEntry}
                  currentValue={colors[activeEntry.cssVar] || ''}
                  isOverridden={overrides.has(activeEntry.cssVar)}
                  onApply={v => applyLiveColor(activeEntry.cssVar, v)}
                  onReset={() => resetSingleVar(activeEntry.cssVar)}
                  onClose={() => setActiveVar(null)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
