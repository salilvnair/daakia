import { useState, useRef, useLayoutEffect } from 'react';

export interface PillTabItem {
  id: string;
  label: string;
  badge?: number;
  dot?: boolean;
  dotColor?: string;
  badgeColor?: string;
}

export type PillTabsVariant = 'pill' | 'underline';

export interface PillTabsViewProps {
  tabs: PillTabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  size?: 'sm' | 'md';
  variant?: PillTabsVariant;
  accentColor?: string;
  className?: string;
}

export function PillTabsView({
  tabs,
  activeTab,
  onChange,
  size = 'md',
  variant = 'pill',
  accentColor,
  className = '',
}: PillTabsViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement | null;
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeTab, tabs]);

  const accent = accentColor || 'var(--color-primary)';
  const fontSize = size === 'sm' ? 12 : 13;
  const py = size === 'sm' ? '5px' : '7px';
  const px = size === 'sm' ? '12px' : '16px';

  if (variant === 'underline') {
    return (
      <div
        ref={containerRef}
        role="tablist"
        className={className}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', bottom: 0, height: 2, borderRadius: 99,
            background: accent,
            left: ind.left, width: ind.width,
            transition: 'left 200ms ease-out, width 200ms ease-out',
          }}
        />
        {tabs.map(tab => (
          <button
            key={tab.id}
            data-tab={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            onClick={() => onChange(tab.id)}
            style={{
              position: 'relative', zIndex: 1,
              paddingBottom: '10px', paddingTop: '4px',
              paddingLeft: px, paddingRight: px,
              fontSize, fontWeight: 500, cursor: 'pointer',
              background: 'transparent', border: 'none', fontFamily: 'inherit',
              color: tab.id === activeTab ? accent : 'var(--color-text-secondary)',
              transition: 'color 150ms',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
            onMouseEnter={e => { if (tab.id !== activeTab) (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = tab.id === activeTab ? accent : 'var(--color-text-secondary)'; }}
          >
            {tab.label}
            {TabBadge(tab, accent)}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="tablist"
      className={className}
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 2,
        background: 'var(--color-surface)', borderRadius: 8, padding: 4,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: 4, bottom: 4, borderRadius: 5,
          background: `color-mix(in srgb, ${accent} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${accent} 25%, transparent)`,
          left: ind.left, width: ind.width,
          transition: 'left 200ms ease-out, width 200ms ease-out',
        }}
      />
      {tabs.map(tab => (
        <button
          key={tab.id}
          data-tab={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeTab}
          onClick={() => onChange(tab.id)}
          style={{
            position: 'relative', zIndex: 1,
            padding: `${py} ${px}`,
            fontSize, fontWeight: 500, cursor: 'pointer',
            background: 'transparent', border: 'none', borderRadius: 5, fontFamily: 'inherit',
            color: tab.id === activeTab ? accent : 'var(--color-text-secondary)',
            transition: 'color 150ms',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
          onMouseEnter={e => { if (tab.id !== activeTab) (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = tab.id === activeTab ? accent : 'var(--color-text-secondary)'; }}
        >
          {tab.label}
          {TabBadge(tab, accent)}
        </button>
      ))}
    </div>
  );
}

function TabBadge(tab: PillTabItem, accent: string) {
  if (tab.badge !== undefined && tab.badge > 0) {
    const bg = tab.badgeColor
      ? `color-mix(in srgb, ${tab.badgeColor} 15%, transparent)`
      : `color-mix(in srgb, ${accent} 15%, transparent)`;
    const color = tab.badgeColor || accent;
    return (
      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: bg, color, fontWeight: 700 }}>
        {tab.badge}
      </span>
    );
  }
  if (tab.dot) {
    return (
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: tab.dotColor || accent, display: 'inline-block', position: 'relative', top: -1 }} />
    );
  }
  return null;
}
