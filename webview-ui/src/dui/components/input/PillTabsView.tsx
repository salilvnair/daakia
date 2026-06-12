import { useState, useRef, useLayoutEffect } from 'react';
import type { DuiSize, DuiRadius, DuiWidth, DuiFontStyle } from '../../core/DuiTypes';
import { useTabBase } from '../../core/TabBase';
import './PillTabsView.css';

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
  /** Falls back to DuiProvider context when omitted. */
  size?: DuiSize;
  variant?: PillTabsVariant;
  accentColor?: string;
  className?: string;
  // ─── DUI container props ──────────────────────────────────────────────────
  width?: DuiWidth;
  borderRadius?: DuiRadius | number;
  /** Text color for inactive tabs */
  color?: string;
  /** Color for the active tab indicator and text */
  activeColor?: string;
  fontStyle?: DuiFontStyle;
}

export function PillTabsView({
  tabs,
  activeTab,
  onChange,
  size,
  variant = 'pill',
  accentColor,
  className = '',
  width,
  borderRadius,
  color,
  activeColor,
  fontStyle,
}: PillTabsViewProps) {
  const base = useTabBase(size, { width, borderRadius, color, activeColor, fontStyle });
  const containerRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement | null;
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeTab, tabs]);

  const accent = accentColor || base.activeColor || 'var(--color-primary)';
  const inactiveColor = base.color || 'var(--color-text-secondary)';

  if (variant === 'underline') {
    return (
      <div
        ref={containerRef}
        role="tablist"
        className={className}
        style={{
          position: 'relative',
          display: base.width !== 'auto' ? 'flex' : 'inline-flex',
          width: base.width !== 'auto' ? base.width : undefined,
          alignItems: 'center',
          gap: 4,
        }}
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
            className={`dui_pill-tabs__btn${tab.id === activeTab ? ' dui_pill-tabs__btn--active' : ''}`}
            style={{
              position: 'relative', zIndex: 1,
              paddingBottom: '10px', paddingTop: '4px',
              paddingLeft: base.paddingX, paddingRight: base.paddingX,
              fontSize: base.fontSize, fontWeight: 500, cursor: 'pointer',
              background: 'transparent', border: 'none', fontFamily: 'inherit',
              fontStyle: base.fontStyle,
              color: tab.id === activeTab
                ? (accentColor || base.activeColor ? accent : 'var(--color-pilltab-text-active)')
                : inactiveColor,
              display: 'inline-flex', alignItems: 'center', gap: base.gap,
            }}
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
        position: 'relative',
        display: base.width !== 'auto' ? 'flex' : 'inline-flex',
        width: base.width !== 'auto' ? base.width : undefined,
        alignItems: 'center',
        gap: 2,
        background: 'var(--color-pilltab-track-bg, var(--color-surface))',
        borderRadius: base.borderRadius,
        padding: 4,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: 4, bottom: 4, borderRadius: base.borderRadius,
          background: accentColor || base.activeColor
            ? `color-mix(in srgb, ${accent} 12%, transparent)`
            : 'var(--color-pilltab-indicator-bg)',
          border: accentColor || base.activeColor
            ? `1px solid color-mix(in srgb, ${accent} 25%, transparent)`
            : '1px solid var(--color-pilltab-indicator-border)',
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
          className={`dui_pill-tabs__btn${tab.id === activeTab ? ' dui_pill-tabs__btn--active' : ''}`}
          style={{
            position: 'relative', zIndex: 1,
            padding: `0 ${base.paddingX}`,
            height: base.height,
            fontSize: base.fontSize, fontWeight: 500, cursor: 'pointer',
            background: 'transparent', border: 'none', borderRadius: base.borderRadius,
            fontFamily: 'inherit', fontStyle: base.fontStyle,
            color: tab.id === activeTab
              ? (accentColor || base.activeColor ? accent : 'var(--color-pilltab-text-active)')
              : inactiveColor,
            display: 'inline-flex', alignItems: 'center', gap: base.gap,
          }}
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
      <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 99, background: bg, color, fontWeight: 700 }}>
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
