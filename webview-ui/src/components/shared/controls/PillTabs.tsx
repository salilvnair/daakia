import { useState, useRef, useLayoutEffect } from 'react';

export interface PillTab {
  id: string;
  label: string;
  badge?: number;
  dot?: boolean;
  dotColor?: string;
  badgeColor?: string;
}

interface Props {
  tabs: PillTab[];
  activeTab: string;
  onChange: (id: string) => void;
  size?: 'sm' | 'md';
  className?: string;
  /** 'pill' (default rounded bg) or 'underline' (bottom border indicator) */
  variant?: 'pill' | 'underline';
  /** Override accent color for active indicator + text (CSS variable or raw value) */
  accentColor?: string;
}

export function PillTabs({ tabs, activeTab, onChange, size = 'md', className = '', variant = 'pill', accentColor }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const activeEl = containerRef.current.querySelector(`[data-tab-id="${activeTab}"]`) as HTMLElement | null;
    if (activeEl) {
      setIndicatorStyle({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
      });
    }
  }, [activeTab, tabs]);

  const py = size === 'sm' ? 'py-1.5' : 'py-2';
  const px = size === 'sm' ? 'px-3' : 'px-4';
  const textSize = size === 'sm' ? 'text-[12.5px]' : 'text-[13px]';

  if (variant === 'underline') {
    return (
      <div ref={containerRef} role="tablist" className={`relative flex items-center gap-1 ${className}`}>
        {/* Sliding underline indicator */}
        <div
          aria-hidden="true"
          className={`absolute bottom-0 h-[2px] rounded-full transition-all duration-200 ease-out ${!accentColor ? 'bg-[var(--color-primary)]' : ''}`}
          style={{ left: indicatorStyle.left, width: indicatorStyle.width, ...(accentColor ? { backgroundColor: accentColor } : {}) }}
        />

        {tabs.map(tab => (
          <button
            key={tab.id}
            data-tab-id={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            className={`relative z-10 pb-2.5 pt-1 ${px} ${textSize} font-medium transition-colors cursor-pointer ${
              tab.id === activeTab
                ? (accentColor ? '' : 'text-[var(--color-primary-light)]')
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
            style={tab.id === activeTab && accentColor ? { color: accentColor } : undefined}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${!tab.badgeColor ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary-light)]' : ''}`}
                style={tab.badgeColor ? { backgroundColor: `color-mix(in srgb, ${tab.badgeColor} 15%, transparent)`, color: tab.badgeColor } : undefined}
              >
                {tab.badge}
              </span>
            )}
            {tab.dot && (!tab.badge || tab.badge === 0) && (
              <span className="ml-1 w-1.5 h-1.5 inline-block rounded-full relative -top-[1px]" style={{ backgroundColor: tab.dotColor || 'var(--color-primary)' }} />
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} role="tablist" className={`relative flex items-center gap-0.5 bg-[var(--color-surface)] rounded-lg p-1 ${className}`}>
      {/* Sliding pill indicator */}
      <div
        aria-hidden="true"
        className={`absolute top-1 bottom-1 rounded-md transition-all duration-200 ease-out ${!accentColor ? 'bg-[var(--color-primary)]/12 border border-[var(--color-primary)]/25' : 'border'}`}
        style={{ left: indicatorStyle.left, width: indicatorStyle.width, ...(accentColor ? { backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)`, borderColor: `color-mix(in srgb, ${accentColor} 25%, transparent)` } : {}) }}
      />

      {tabs.map(tab => (
        <button
          key={tab.id}
          data-tab-id={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeTab}
          className={`relative z-10 ${py} ${px} ${textSize} rounded-md font-medium transition-colors cursor-pointer ${
            tab.id === activeTab
              ? (accentColor ? '' : 'text-[var(--color-primary-light)]')
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          }`}
          style={tab.id === activeTab && accentColor ? { color: accentColor } : undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span
              className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${!tab.badgeColor ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary-light)]' : ''}`}
              style={tab.badgeColor ? { backgroundColor: `color-mix(in srgb, ${tab.badgeColor} 15%, transparent)`, color: tab.badgeColor } : undefined}
            >
              {tab.badge}
            </span>
          )}
          {tab.dot && (!tab.badge || tab.badge === 0) && (
            <span className="ml-1 w-1.5 h-1.5 inline-block rounded-full relative -top-[1px]" style={{ backgroundColor: tab.dotColor || 'var(--color-primary)' }} />
          )}
        </button>
      ))}
    </div>
  );
}
