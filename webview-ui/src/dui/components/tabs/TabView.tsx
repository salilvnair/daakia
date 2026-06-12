import { useRef, useLayoutEffect, useState, type ReactNode } from 'react';
import { PlusIcon, CloseIcon } from '../../../icons';
import type { DuiSize, DuiRadius, DuiWidth, DuiFontStyle } from '../../core/DuiTypes';
import { useDui, resolveBorderRadius, resolveWidth } from '../../core/DuiContext';
import { useTabBase } from '../../core/TabBase';
import './TabView.css';

export interface TabItem {
  id: string;
  label: string;
  badge?: number;
  dot?: boolean;
  dotColor?: string;
  badgeColor?: string;
  closeable?: boolean;
  /** Custom content rendered after the label */
  extra?: ReactNode;
}

export type TabViewVariant = 'pill' | 'underline' | 'gql';

export interface TabViewProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  onClose?: (id: string) => void;
  onAdd?: () => void;
  variant?: TabViewVariant;
  /** Falls back to DuiProvider size when omitted. */
  size?: DuiSize;
  accentColor?: string;
  className?: string;
  // ─── DUI container props ──────────────────────────────────────────────────
  width?: DuiWidth;
  borderRadius?: DuiRadius | number;
  /** Text color for inactive tabs */
  color?: string;
  /** Color for active tab and indicator */
  activeColor?: string;
  fontStyle?: DuiFontStyle;
}

// ─── Pill variant ────────────────────────────────────────────────────────────

function PillVariant({ tabs, active, onChange, size, accentColor, className, borderRadius, color, activeColor, fontStyle }: Omit<TabViewProps, 'variant' | 'onClose' | 'onAdd' | 'width'>) {
  const base = useTabBase(size, { borderRadius, color, activeColor, fontStyle });
  const containerRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });
  const accent = accentColor || base.activeColor || 'var(--color-primary)';
  const inactiveColor = base.color || 'var(--color-text-secondary)';
  const py = base.gap;
  const px = base.paddingX;
  const textSize = base.fontSize;
  const radius = base.borderRadius;
  const fontStyleResolved = base.fontStyle;

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-tab="${active}"]`) as HTMLElement | null;
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [active, tabs]);

  return (
    <div ref={containerRef} role="tablist" className={`relative flex items-center gap-0.5 bg-[var(--color-surface)] p-1 ${className ?? ''}`} style={{ borderRadius: radius }}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 4, bottom: 4,
          left: ind.left,
          width: ind.width,
          borderRadius: radius,
          background: `color-mix(in srgb, ${accent} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${accent} 25%, transparent)`,
          transition: 'left 200ms ease-out, width 200ms ease-out',
        }}
      />
      {tabs.map(tab => (
        <TabBtn key={tab.id} tab={tab} active={active} accent={accent} inactiveColor={inactiveColor} onChange={onChange} py={py} px={px} textSize={textSize} fontStyle={fontStyleResolved} />
      ))}
    </div>
  );
}

// ─── Underline variant ───────────────────────────────────────────────────────

function UnderlineVariant({ tabs, active, onChange, size, accentColor, className, color, activeColor, fontStyle }: Omit<TabViewProps, 'variant' | 'onClose' | 'onAdd' | 'width' | 'borderRadius'>) {
  const base = useTabBase(size, { color, activeColor, fontStyle });
  const containerRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });
  const accent = accentColor || base.activeColor || 'var(--color-primary)';
  const inactiveColor = base.color || 'var(--color-text-secondary)';
  const px = base.paddingX;
  const textSize = base.fontSize;
  const fontStyleResolved = base.fontStyle;

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-tab="${active}"]`) as HTMLElement | null;
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [active, tabs]);

  return (
    <div ref={containerRef} role="tablist" className={`relative flex items-center gap-0.5 ${className ?? ''}`}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: 0,
          height: '2px',
          borderRadius: '2px',
          left: ind.left,
          width: ind.width,
          background: accent,
          transition: 'left 200ms ease-out, width 200ms ease-out',
        }}
      />
      {tabs.map(tab => (
        <button
          key={tab.id}
          data-tab={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          className={`dui_tab-view__underline-btn relative z-10 cursor-pointer${tab.id === active ? ' dui_tab-view__underline-btn--active' : ''}`}
          style={{
            paddingBottom: '10px',
            paddingTop: '4px',
            paddingLeft: px,
            paddingRight: px,
            fontSize: textSize,
            fontWeight: 500,
            fontStyle: fontStyleResolved,
            color: tab.id === active ? accent : inactiveColor,
            border: 'none',
            background: 'transparent',
            fontFamily: 'inherit',
          }}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          <TabBadge tab={tab} accent={accent} />
        </button>
      ))}
    </div>
  );
}

// ─── GQL variant (closeable + scrollable + add button) ───────────────────────

function GqlVariant({ tabs, active, onChange, onClose, onAdd, size, accentColor, className, color, activeColor }: TabViewProps) {
  const base = useTabBase(size, { color, activeColor });
  const accent = accentColor || base.activeColor || 'var(--color-primary)';
  const inactiveColor = base.color || 'var(--color-text-secondary)';
  const textSize = base.fontSize;

  return (
    <div className={`flex items-center overflow-hidden ${className ?? ''}`} style={{ borderBottom: `1px solid var(--color-surface-border)` }}>
      <div className="flex items-center overflow-x-auto" style={{ scrollbarWidth: 'none', flex: 1 }}>
        {tabs.map(tab => {
          const isActive = tab.id === active;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className="flex items-center gap-1 cursor-pointer select-none flex-shrink-0 transition-colors"
              style={{
                padding: `6px 10px`,
                fontSize: textSize,
                fontWeight: 500,
                color: isActive ? accent : inactiveColor,
                borderBottom: isActive ? `2px solid ${accent}` : '2px solid transparent',
                marginBottom: '-1px',
                background: isActive ? `color-mix(in srgb, ${accent} 6%, transparent)` : 'transparent',
                borderRadius: '4px 4px 0 0',
              }}
            >
              <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tab.label}
              </span>
              <TabBadge tab={tab} accent={accent} />
              {(tab.closeable !== false) && onClose && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onClose(tab.id); }}
                  className="dui_tab-view__gql-close"
                  style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '1px', border: 'none', background: 'transparent', borderRadius: '3px' }}
                  title="Close tab"
                >
                  <CloseIcon size={10} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          title="New tab"
          className="dui_tab-view__gql-add"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '28px', height: '28px', flexShrink: 0,
            color: 'var(--color-text-muted)', cursor: 'pointer',
            border: 'none', background: 'transparent', borderRadius: '4px',
            '--dui-tab-accent': accent,
          } as React.CSSProperties}
        >
          <PlusIcon size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function TabBtn({ tab, active, accent, inactiveColor, onChange, py, px, textSize, fontStyle }: { tab: TabItem; active: string; accent: string; inactiveColor: string; onChange: (id: string) => void; py: string; px: string; textSize: string; fontStyle?: DuiFontStyle }) {
  return (
    <button
      key={tab.id}
      data-tab={tab.id}
      type="button"
      role="tab"
      aria-selected={tab.id === active}
      className="relative z-10 cursor-pointer transition-colors rounded-md"
      style={{
        paddingTop: py,
        paddingBottom: py,
        paddingLeft: px,
        paddingRight: px,
        fontSize: textSize,
        fontWeight: 500,
        fontStyle,
        color: tab.id === active ? accent : inactiveColor,
        border: 'none',
        background: 'transparent',
        fontFamily: 'inherit',
      }}
      onClick={() => onChange(tab.id)}
    >
      {tab.label}
      <TabBadge tab={tab} accent={accent} />
    </button>
  );
}

function TabBadge({ tab, accent }: { tab: TabItem; accent: string }) {
  if (tab.badge !== undefined && tab.badge > 0) {
    const bg = tab.badgeColor ? `color-mix(in srgb, ${tab.badgeColor} 15%, transparent)` : `color-mix(in srgb, ${accent} 15%, transparent)`;
    const color = tab.badgeColor || accent;
    return (
      <span style={{ marginLeft: '5px', fontSize: '9px', padding: '1px 5px', borderRadius: '9999px', fontWeight: 600, background: bg, color }}>
        {tab.badge}
      </span>
    );
  }
  if (tab.dot) {
    return <span style={{ marginLeft: '4px', display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', background: tab.dotColor || accent, position: 'relative', top: '-1px' }} />;
  }
  return null;
}

// ─── Width wrapper helper ─────────────────────────────────────────────────────

// ─── Main export ─────────────────────────────────────────────────────────────

export function TabView({ variant = 'pill', width, ...props }: TabViewProps) {
  const ctx = useDui();
  const resolvedWidth = resolveWidth(width ?? ctx.width);
  const wrapStyle = resolvedWidth !== 'auto' ? { width: resolvedWidth } : undefined;

  const inner = (() => {
    if (variant === 'underline') return <UnderlineVariant {...props} />;
    if (variant === 'gql') return <GqlVariant variant="gql" {...props} />;
    return <PillVariant {...props} />;
  })();

  if (!wrapStyle) return inner;
  return <div style={wrapStyle}>{inner}</div>;
}
