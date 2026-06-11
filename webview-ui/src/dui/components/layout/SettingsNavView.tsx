export interface SettingsNavItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
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
}

export function SettingsNavView({
  groups,
  activeId,
  onSelect,
  accentColor,
  className = '',
}: SettingsNavViewProps) {
  const accent = accentColor || 'var(--color-primary)';

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
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '7px 10px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    borderLeft: isActive ? `2px solid ${accent}` : '2px solid transparent',
                    paddingLeft: isActive ? '8px' : '10px',
                    background: isActive
                      ? `color-mix(in srgb, ${accent} 10%, transparent)`
                      : 'transparent',
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {item.icon && (
                    <span style={{ color: isActive ? accent : 'var(--color-text-muted)', flexShrink: 0 }}>
                      {item.icon}
                    </span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? accent : 'var(--color-text-primary)',
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
