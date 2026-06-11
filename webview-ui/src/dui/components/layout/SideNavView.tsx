import { useState, useMemo } from 'react';
import { SidebarLeftIcon, SidebarRightIcon, ChevronDownIcon, ChevronRightIcon, SearchIcon } from '../../../icons';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SideNavItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** Accent-colored pill badge — e.g. "New", 3 */
  badge?: number | string;
  /** Plain muted count shown right of group header label */
  count?: number;
  /** When true: renders as uppercase section header (non-selectable, collapsible) */
  isGroup?: boolean;
  children?: SideNavItem[];
}

export interface SideNavViewProps {
  items: SideNavItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /** Controlled collapsed state — overrides internal state when provided */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  defaultOpenIds?: string[];
  width?: number;
  collapsedWidth?: number;
  accentColor?: string;
  /** Render a search box above the nav items */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Message shown when no items match the search */
  emptyText?: string;
  className?: string;
  style?: React.CSSProperties;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countLeaves(items: SideNavItem[]): number {
  return items.reduce((s, item) =>
    s + (item.isGroup ? countLeaves(item.children ?? []) : 1), 0);
}

function filterItems(items: SideNavItem[], q: string): SideNavItem[] {
  if (!q) return items;
  return items.reduce<SideNavItem[]>((acc, item) => {
    if (item.isGroup) {
      const filteredChildren = filterItems(item.children ?? [], q);
      if (filteredChildren.length > 0) acc.push({ ...item, children: filteredChildren });
    } else if (item.label.toLowerCase().includes(q.toLowerCase())) {
      acc.push(item);
    }
    return acc;
  }, []);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SideNavView({
  items,
  activeId,
  onSelect,
  collapsible = true,
  defaultCollapsed = false,
  collapsed: collapsedProp,
  onCollapsedChange,
  defaultOpenIds,
  width = 200,
  collapsedWidth = 44,
  accentColor,
  searchable = false,
  searchPlaceholder = 'Search…',
  emptyText = 'No results',
  className = '',
  style,
}: SideNavViewProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    if (defaultOpenIds !== undefined) return new Set(defaultOpenIds);
    // Default: all groups open
    return new Set(items.filter(i => i.isGroup).map(i => i.id));
  });
  const [search, setSearch] = useState('');

  const isControlled  = collapsedProp !== undefined;
  const collapsed     = isControlled ? collapsedProp : internalCollapsed;
  const accent        = accentColor || 'var(--color-primary)';
  const q             = search.trim();
  const isFiltering   = q.length > 0;

  const totalLeaves    = useMemo(() => countLeaves(items), [items]);
  const filteredItems  = useMemo(() => filterItems(items, q), [items, q]);
  const filteredLeaves = useMemo(() => countLeaves(filteredItems), [filteredItems]);

  const handleCollapse = (v: boolean) => {
    if (!isControlled) setInternalCollapsed(v);
    onCollapsedChange?.(v);
  };

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Item renderer ──────────────────────────────────────────────────────────

  const renderLeafItem = (item: SideNavItem) => {
    const isActive = item.id === activeId;
    return (
      <div
        key={item.id}
        title={collapsed ? item.label : undefined}
        onClick={() => onSelect?.(item.id)}
        style={collapsed ? {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 8, margin: '1px auto',
          cursor: 'pointer',
          background: isActive
            ? `color-mix(in srgb, ${accent} 15%, var(--color-item-hover-bg, transparent))`
            : 'transparent',
          color: isActive ? accent : 'var(--color-text-secondary)',
          transition: 'background 100ms, color 100ms',
        } : {
          display: 'flex', alignItems: 'center', gap: 8,
          height: 32, borderRadius: 6,
          padding: '0 8px 0 12px',
          cursor: 'pointer', marginBottom: 1,
          background: isActive
            ? `color-mix(in srgb, ${accent} 15%, var(--color-item-hover-bg, transparent))`
            : 'transparent',
          color: isActive ? accent : 'var(--color-text-secondary)',
          transition: 'background 100ms, color 100ms',
        }}
        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'; }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {item.icon && (
          <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16 }}>
            {item.icon}
          </span>
        )}
        {!collapsed && (
          <>
            <span style={{
              flex: 1, fontSize: 12, fontWeight: isActive ? 600 : 400,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {item.label}
            </span>
            {item.badge !== undefined && (
              <span style={{
                fontSize: 10, padding: '1px 5px', borderRadius: 99,
                background: `color-mix(in srgb, ${accent} 15%, transparent)`,
                color: accent, fontWeight: 600, flexShrink: 0,
              }}>
                {item.badge}
              </span>
            )}
          </>
        )}
      </div>
    );
  };

  const renderGroupItem = (item: SideNavItem) => {
    const isOpen = openGroups.has(item.id);
    const filteredChildCount = item.children?.length ?? 0;
    const displayCount = isFiltering ? filteredChildCount : (item.count ?? filteredChildCount);
    const children = item.children ?? [];

    if (collapsed) {
      // Collapsed: no group header — just render children as icon squares
      return <div key={item.id} style={{ marginBottom: 8 }}>{children.map(renderLeafItem)}</div>;
    }

    return (
      <div key={item.id} style={{ marginBottom: 4 }}>
        <button
          type="button"
          onClick={() => toggleGroup(item.id)}
          style={{
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--color-text-muted)',
            padding: '10px 8px 4px', fontFamily: 'inherit',
          }}
        >
          <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
          {displayCount > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 500,
              color: 'var(--color-text-muted)',
              flexShrink: 0, textTransform: 'none', letterSpacing: 0,
            }}>
              {displayCount}
            </span>
          )}
          <ChevronDownIcon
            size={10}
            style={{
              transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 180ms ease',
              flexShrink: 0,
            }}
          />
        </button>
        {isOpen && children.map(renderLeafItem)}
      </div>
    );
  };

  const renderItem = (item: SideNavItem) =>
    item.isGroup ? renderGroupItem(item) : renderLeafItem(item);

  // ── Render ─────────────────────────────────────────────────────────────────

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
        transition: 'width 200ms ease, min-width 200ms ease',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Search box */}
      {searchable && !collapsed && (
        <div style={{ padding: '10px 10px 8px', flexShrink: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 28, padding: '0 8px',
            borderRadius: 6,
            border: '1px solid var(--color-input-border)',
            background: 'var(--color-input-bg)',
          }}>
            <SearchIcon size={11} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: 11, color: 'var(--color-text-primary)', fontFamily: 'inherit',
              }}
            />
            {isFiltering ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  border: 'none', cursor: 'pointer', padding: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  background: 'transparent', color: 'var(--color-text-muted)',
                  transition: 'color 120ms',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-error)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'; }}
                title="Clear search"
              >
                <span style={{ fontSize: 12, lineHeight: 1, fontWeight: 500 }}>✕</span>
              </button>
            ) : (
              <span style={{
                fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)',
                flexShrink: 0, padding: '1px 6px', borderRadius: 4,
                background: 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)',
              }}>
                {totalLeaves}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Nav items */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: collapsed ? '4px 4px 16px' : '4px 6px 16px',
      }}>
        {filteredItems.map(renderItem)}
        {isFiltering && filteredLeaves === 0 && (
          <div style={{
            padding: '20px 8px', fontSize: 11,
            color: 'var(--color-text-muted)', textAlign: 'center',
          }}>
            {emptyText}
          </div>
        )}
      </div>

      {/* Collapse toggle (only when not controlled externally) */}
      {collapsible && !isControlled && (
        <div style={{
          borderTop: '1px solid var(--color-panel-border)',
          display: 'flex', alignItems: 'center',
          padding: '4px 6px', flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={() => handleCollapse(!collapsed)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 6, flexShrink: 0,
              background: 'transparent', border: 'none',
              color: 'var(--color-text-muted)', cursor: 'pointer',
              transition: 'background 100ms, color 100ms',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-primary)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-muted)'; }}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <SidebarRightIcon size={14} /> : <SidebarLeftIcon size={14} />}
          </button>
        </div>
      )}
    </div>
  );
}
