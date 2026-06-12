import type { ReactNode } from 'react';
import type { DuiSize, DuiRadius, DuiFontStyle } from '../../core/DuiTypes';
import { useDui, resolveBorderRadius } from '../../core/DuiContext';
import { DUI_HEIGHT, DUI_FONT_SIZE } from '../../core/DuiTokens';
import './SettingsNavView.css';

export interface SettingsNavItem {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  badge?: string;
}

export interface SettingsNavGroup {
  title?: string;
  items: SettingsNavItem[];
}

export interface SettingsNavViewProps {
  groups: SettingsNavGroup[];
  activeId?: string;
  onSelect?: (id: string) => void;
  accentColor?: string;
  className?: string;
  // ─── DUI container props ──────────────────────────────────────────────────
  /** Falls back to DuiProvider size when omitted. */
  size?: DuiSize;
  borderRadius?: DuiRadius | number;
  /** Text color for inactive items */
  color?: string;
  /** Color for active item text and indicator */
  activeColor?: string;
  fontStyle?: DuiFontStyle;
}

export function SettingsNavView({
  groups,
  activeId,
  onSelect,
  accentColor,
  className = '',
  size,
  borderRadius,
  color,
  activeColor,
  fontStyle,
}: SettingsNavViewProps) {
  const ctx = useDui();
  const s = size ?? ctx.size;
  const accent = accentColor || activeColor || ctx.activeColor || 'var(--color-primary)';
  const inactiveColor = color || ctx.color || 'var(--color-text-primary)';
  const radius = resolveBorderRadius(borderRadius ?? ctx.borderRadius, '6px');
  const fontStyleResolved = fontStyle || ctx.fontStyle;
  const itemHeight = DUI_HEIGHT.nav[s];
  const fontSize = DUI_FONT_SIZE[s];

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {groups.map((group, gi) => (
        <div key={gi}>
          {group.title && (
            <div style={{
              fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              padding: '0 8px 6px',
            }}>
              {group.title}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {group.items.map(item => {
              const isActive = item.id === activeId;
              return (
                <div
                  key={item.id}
                  onClick={() => onSelect?.(item.id)}
                  className={`dui_settings-nav__item${isActive ? ' dui_settings-nav__item--active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    minHeight: `${itemHeight}px`,
                    padding: '4px 10px',
                    borderRadius: radius,
                    cursor: 'pointer',
                    fontStyle: fontStyleResolved,
                    background: isActive
                      ? `color-mix(in srgb, ${accent} 12%, var(--color-surface))`
                      : 'transparent',
                  }}
                >
                  {item.icon && (
                    <span style={{ color: isActive ? accent : 'var(--color-text-muted)', flexShrink: 0 }}>
                      {item.icon}
                    </span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? accent : inactiveColor,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {item.label}
                    </div>
                    {item.description && (
                      <div style={{
                        fontSize: '10px', color: 'var(--color-text-muted)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        marginTop: '1px',
                      }}>
                        {item.description}
                      </div>
                    )}
                  </div>
                  {item.badge && (
                    <span style={{
                      fontSize: '9px', padding: '1px 5px', borderRadius: 99, flexShrink: 0,
                      background: `color-mix(in srgb, ${accent} 15%, transparent)`,
                      color: accent, fontWeight: 700, letterSpacing: '0.03em',
                    }}>
                      {item.badge}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
