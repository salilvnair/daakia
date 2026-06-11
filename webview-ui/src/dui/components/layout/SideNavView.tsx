import { useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../../../icons';

export interface SideNavItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number | string;
  children?: SideNavItem[];
}

export interface SideNavViewProps {
  items: SideNavItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  width?: number;
  collapsedWidth?: number;
  accentColor?: string;
  className?: string;
}

export function SideNavView({
  items,
  activeId,
  onSelect,
  collapsible = true,
  defaultCollapsed = false,
  width = 200,
  collapsedWidth = 44,
  accentColor,
  className = '',
}: SideNavViewProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const accent = accentColor || 'var(--color-primary)';

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const renderItem = (item: SideNavItem, depth = 0) => {
    const isActive = item.id === activeId;
    const isOpen = openGroups.has(item.id);
    const hasChildren = (item.children?.length ?? 0) > 0;

    return (
      <div key={item.id}>
        <div
          onClick={() => {
            if (hasChildren) toggleGroup(item.id);
            else onSelect?.(item.id);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: `5px ${collapsed ? '0' : `${8 + depth * 12}px`}`,
            paddingLeft: collapsed ? 0 : undefined,
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius: '6px',
            cursor: 'pointer',
            marginBottom: '1px',
            background: isActive
              ? `color-mix(in srgb, ${accent} 15%, var(--color-item-hover-bg))`
              : 'transparent',
            color: isActive ? accent : 'var(--color-text-secondary)',
            transition: 'background 100ms, color 100ms',
          }}
          onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--color-sidenav-item-hover)'; }}
          onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          title={collapsed ? item.label : undefined}
        >
          {item.icon && (
            <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16 }}>
              {item.icon}
            </span>
          )}
          {!collapsed && (
            <>
              <span style={{ flex: 1, fontSize: '12px', fontWeight: isActive ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.label}
              </span>
              {item.badge !== undefined && (
                <span style={{
                  fontSize: '10px', padding: '1px 5px', borderRadius: 99,
                  background: `color-mix(in srgb, ${accent} 15%, transparent)`,
                  color: accent, fontWeight: 600, flexShrink: 0,
                }}>
                  {item.badge}
                </span>
              )}
              {hasChildren && (
                isOpen
                  ? <ChevronRightIcon size={10} style={{ transform: 'rotate(90deg)', flexShrink: 0, opacity: 0.6 }} />
                  : <ChevronRightIcon size={10} style={{ flexShrink: 0, opacity: 0.4 }} />
              )}
            </>
          )}
        </div>
        {!collapsed && hasChildren && isOpen && (
          <div>{item.children!.map(c => renderItem(c, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div
      className={className}
      style={{
        width: collapsed ? collapsedWidth : width,
        minWidth: collapsed ? collapsedWidth : width,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-panel)',
        borderRight: '1px solid var(--color-panel-border)',
        transition: 'width 180ms ease, min-width 180ms ease',
        overflow: 'hidden',
      }}
    >
      {/* Nav items */}
      <div style={{ flex: 1, padding: '8px', overflowY: 'auto', overflowX: 'hidden' }}>
        {items.map(item => renderItem(item))}
      </div>

      {/* Collapse toggle */}
      {collapsible && (
        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 32, borderRadius: 0,
            borderTop: '1px solid var(--color-panel-border)',
            background: 'transparent', border: 'none',
            color: 'var(--color-text-muted)', cursor: 'pointer',
            transition: 'background 100ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed
            ? <ChevronRightIcon size={13} />
            : <ChevronLeftIcon size={13} />
          }
        </button>
      )}
    </div>
  );
}
