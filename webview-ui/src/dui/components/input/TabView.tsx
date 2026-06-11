import { useRef, useLayoutEffect, useState, type ReactNode } from 'react';
import { PlusIcon, CloseIcon } from '../../../icons';

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
  size?: 'sm' | 'md';
  accentColor?: string;
  className?: string;
}

// ─── Pill variant ────────────────────────────────────────────────────────────

function PillVariant({ tabs, active, onChange, size, accentColor, className }: Omit<TabViewProps, 'variant' | 'onClose' | 'onAdd'>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });
  const accent = accentColor || 'var(--color-primary)';
  const py = size === 'sm' ? '6px' : '8px';
  const px = size === 'sm' ? '12px' : '16px';
  const textSize = size === 'sm' ? '12px' : '13px';

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-tab="${active}"]`) as HTMLElement | null;
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [active, tabs]);

  return (
    <div ref={containerRef} role="tablist" className={`relative flex items-center gap-0.5 bg-[var(--color-surface)] rounded-lg p-1 ${className ?? ''}`}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 4, bottom: 4,
          left: ind.left,
          width: ind.width,
          borderRadius: '6px',
          background: `color-mix(in srgb, ${accent} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${accent} 25%, transparent)`,
          transition: 'left 200ms ease-out, width 200ms ease-out',
        }}
      />
      {tabs.map(tab => (
        <TabBtn key={tab.id} tab={tab} active={active} accent={accent} onChange={onChange} py={py} px={px} textSize={textSize} />
      ))}
    </div>
  );
}

// ─── Underline variant ───────────────────────────────────────────────────────

function UnderlineVariant({ tabs, active, onChange, size, accentColor, className }: Omit<TabViewProps, 'variant' | 'onClose' | 'onAdd'>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });
  const accent = accentColor || 'var(--color-primary)';
  const px = size === 'sm' ? '12px' : '16px';
  const textSize = size === 'sm' ? '12px' : '13px';

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
          className="relative z-10 cursor-pointer transition-colors"
          style={{
            paddingBottom: '10px',
            paddingTop: '4px',
            paddingLeft: px,
            paddingRight: px,
            fontSize: textSize,
            fontWeight: 500,
            color: tab.id === active ? accent : 'var(--color-text-secondary)',
            border: 'none',
            background: 'transparent',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => { if (tab.id !== active) (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)'; }}
          onMouseLeave={e => { if (tab.id !== active) (e.currentTarget as HTMLElement).style.color = 'var(--color-text-secondary)'; }}
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

function GqlVariant({ tabs, active, onChange, onClose, onAdd, size, accentColor, className }: TabViewProps) {
  const accent = accentColor || 'var(--color-primary)';
  const textSize = size === 'sm' ? '11px' : '12px';

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
                color: isActive ? accent : 'var(--color-text-secondary)',
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
                  style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '1px', border: 'none', background: 'transparent', borderRadius: '3px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
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
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', flexShrink: 0, color: 'var(--color-text-muted)', cursor: 'pointer', border: 'none', background: 'transparent', borderRadius: '4px', transition: 'all 120ms' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = accent; (e.currentTarget as HTMLElement).style.background = `color-mix(in srgb, ${accent} 10%, transparent)`; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <PlusIcon size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function TabBtn({ tab, active, accent, onChange, py, px, textSize }: { tab: TabItem; active: string; accent: string; onChange: (id: string) => void; py: string; px: string; textSize: string }) {
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
        color: tab.id === active ? accent : 'var(--color-text-secondary)',
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

// ─── Main export ─────────────────────────────────────────────────────────────

export function TabView({ variant = 'pill', ...props }: TabViewProps) {
  if (variant === 'underline') return <UnderlineVariant {...props} />;
  if (variant === 'gql') return <GqlVariant variant="gql" {...props} />;
  return <PillVariant {...props} />;
}
