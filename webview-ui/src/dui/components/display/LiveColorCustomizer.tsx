import { useState, useEffect, useCallback } from 'react';
import { PaletteIcon, RefreshIcon } from '../../../icons';
import { YamlKeyChip } from './YamlKeyChip';
import './LiveColorCustomizer.css';

export interface LiveColorVar {
  /** CSS custom property name, e.g. "--color-primary" */
  cssVar: string;
  /** YAML theme key, e.g. "brand.primary" */
  yamlKey: string;
  /** Human-readable label shown above the swatch */
  label?: string;
}

export interface LiveColorCustomizerProps {
  vars: LiveColorVar[];
  title?: string;
  /** When true the grid is always visible; the toggle button is hidden (used when embedded in LivePlayground). */
  forceOpen?: boolean;
  /**
   * When provided, color changes call this instead of document.documentElement.setProperty.
   * Use this to scope changes to a specific container (e.g. the live preview pane).
   * value=null means the override is being reset/removed.
   */
  onVarChange?: (cssVar: string, value: string | null) => void;
}

function readCssVar(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || 'transparent';
}

function cssToHex(value: string): string {
  if (!value || value === 'transparent') return '#888888';
  // Already hex
  if (value.startsWith('#')) return value.slice(0, 7);
  // Try parsing via canvas
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '#888888';
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch {
    return '#888888';
  }
}

export function LiveColorCustomizer({ vars, title, forceOpen = false, onVarChange }: LiveColorCustomizerProps) {
  const [open, setOpen] = useState(false);
  const [hexValues, setHexValues] = useState<Record<string, string>>({});
  const [overridden, setOverridden] = useState<Set<string>>(new Set());

  const isOpen = forceOpen || open;

  const refresh = useCallback(() => {
    const next: Record<string, string> = {};
    for (const v of vars) next[v.cssVar] = cssToHex(readCssVar(v.cssVar));
    setHexValues(next);
  }, [vars]);

  useEffect(() => {
    if (open || forceOpen) refresh();
  }, [open, forceOpen, refresh]);

  const handleChange = (cssVar: string, hex: string) => {
    if (onVarChange) {
      onVarChange(cssVar, hex);
    } else {
      document.documentElement.style.setProperty(cssVar, hex);
    }
    setHexValues(prev => ({ ...prev, [cssVar]: hex }));
    setOverridden(prev => new Set(prev).add(cssVar));
  };

  const handleReset = (cssVar: string) => {
    if (onVarChange) {
      onVarChange(cssVar, null);
    } else {
      document.documentElement.style.removeProperty(cssVar);
    }
    setOverridden(prev => { const n = new Set(prev); n.delete(cssVar); return n; });
    setTimeout(() => {
      setHexValues(prev => ({ ...prev, [cssVar]: cssToHex(readCssVar(cssVar)) }));
    }, 20);
  };

  const resetAll = () => {
    for (const v of vars) {
      if (onVarChange) {
        onVarChange(v.cssVar, null);
      } else {
        document.documentElement.style.removeProperty(v.cssVar);
      }
    }
    setOverridden(new Set());
    setTimeout(refresh, 20);
  };

  const hasAnyOverride = overridden.size > 0;

  return (
    <div style={{ marginBottom: (open && !forceOpen) ? 12 : 0 }}>
      {/* Trigger row — hidden when forceOpen (parent owns the toggle) */}
      {!forceOpen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: open ? 10 : 0 }}>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 8px', borderRadius: 5,
              background: open
                ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)'
                : 'var(--color-surface)',
              border: `1px solid ${open ? 'color-mix(in srgb, var(--color-primary) 30%, transparent)' : 'var(--color-surface-border)'}`,
              color: open ? 'var(--color-primary)' : 'var(--color-text-muted)',
              cursor: 'pointer', fontSize: '11px', fontWeight: 500, fontFamily: 'inherit',
              transition: 'all 120ms',
            }}
          >
            <PaletteIcon size={12} />
            {title ?? 'Customize colors'}
          </button>
          {hasAnyOverride && (
            <button
              type="button"
              onClick={resetAll}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 7px', borderRadius: 5, fontSize: '10px', fontWeight: 500,
                background: 'transparent', border: '1px solid var(--color-surface-border)',
                color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'color 100ms',
              }}
              className="dui_live-color__reset-btn"
              title="Reset all colors to theme defaults"
            >
              <RefreshIcon size={10} />
              Reset all
            </button>
          )}
        </div>
      )}

      {/* Expanded panel */}
      {isOpen && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8,
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid var(--color-surface-border)',
          background: 'var(--color-panel)',
        }}>
          {/* Reset all row inside grid — only when forceOpen */}
          {forceOpen && hasAnyOverride && (
            <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
              <button
                type="button"
                onClick={resetAll}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 7px', borderRadius: 5, fontSize: '10px', fontWeight: 500,
                  background: 'transparent', border: '1px solid var(--color-surface-border)',
                  color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'color 100ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-error)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                title="Reset all colors to theme defaults"
              >
                <RefreshIcon size={10} />
                Reset all
              </button>
            </div>
          )}
          {vars.map(v => {
            const hex = hexValues[v.cssVar] ?? '#888888';
            const isDirty = overridden.has(v.cssVar);
            return (
              <div
                key={v.cssVar}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  padding: '6px 8px', borderRadius: 6,
                  border: `1px solid ${isDirty ? 'color-mix(in srgb, var(--color-primary) 30%, transparent)' : 'var(--color-surface-border)'}`,
                  background: isDirty
                    ? 'color-mix(in srgb, var(--color-primary) 4%, transparent)'
                    : 'var(--color-surface)',
                  minWidth: 110,
                }}
              >
                {/* Label */}
                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {v.label ?? v.cssVar.replace('--color-', '')}
                </span>

                {/* Swatch row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {/* Color swatch — input overlaid so clicking the visible swatch opens the native picker */}
                  <div style={{ position: 'relative', width: 22, height: 22, flexShrink: 0 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 4,
                      background: hex,
                      border: '1.5px solid color-mix(in srgb, var(--color-text-primary) 15%, transparent)',
                      boxShadow: isDirty ? '0 0 0 2px color-mix(in srgb, var(--color-primary) 30%, transparent)' : 'none',
                    }} />
                    <input
                      type="color"
                      value={hex}
                      onChange={e => handleChange(v.cssVar, e.target.value)}
                      style={{
                        position: 'absolute', inset: 0,
                        opacity: 0, cursor: 'pointer', border: 'none', padding: 0,
                        width: '100%', height: '100%',
                      }}
                      title={`Pick color for ${v.label ?? v.cssVar}`}
                    />
                  </div>

                  {/* CSS var name */}
                  <span style={{
                    fontSize: '9px', fontFamily: 'monospace', color: 'var(--color-text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
                  }}>
                    {v.cssVar}
                  </span>

                  {/* Reset individual */}
                  {isDirty && (
                    <button
                      type="button"
                      onClick={() => handleReset(v.cssVar)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 16, height: 16, borderRadius: 3, border: 'none', flexShrink: 0,
                        background: 'transparent', cursor: 'pointer',
                        color: 'var(--color-text-muted)', transition: 'color 100ms',
                      }}
                      className="dui_live-color__reset-btn"
                      title="Reset to theme default"
                    >
                      <RefreshIcon size={10} />
                    </button>
                  )}
                </div>

                {/* YAML key chip */}
                <YamlKeyChip yamlKey={v.yamlKey} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
