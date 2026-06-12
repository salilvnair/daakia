import { useState, useRef, useLayoutEffect } from 'react';
import { ChevronRightIcon } from '../../../icons';
import { ToggleSwitchView } from '../input/ToggleSwitchView';
import { ChipView } from '../chips/ChipView';
import './FeatureCategoryView.css';

export interface FeatureItem {
  id: string;
  label: string;
  description?: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export interface FeatureCategoryViewProps {
  categoryLabel: string;
  categoryColor?: string;
  features: FeatureItem[];
  defaultExpanded?: boolean;
  categoryEnabled?: boolean;
  onCategoryToggle?: (enabled: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function FeatureCategoryView({
  categoryLabel,
  categoryColor,
  features,
  defaultExpanded = false,
  categoryEnabled,
  onCategoryToggle,
  className = '',
  style,
}: FeatureCategoryViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const bodyRef = useRef<HTMLDivElement>(null);
  const isFirst = useRef(true);
  const color = categoryColor || 'var(--color-primary)';
  const enabledCount = features.filter(f => f.enabled).length;
  const hasCategoryToggle = onCategoryToggle !== undefined;

  // On mount: set initial height without any transition so there's no flash
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.transition = 'none';
    el.style.height = defaultExpanded ? 'auto' : '0px';
    el.style.overflow = 'hidden';
    // Re-enable transition on next frame
    requestAnimationFrame(() => {
      el.style.transition = 'height 220ms cubic-bezier(0.4, 0, 0.2, 1)';
    });
    isFirst.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animate on toggle — skip initial render
  useLayoutEffect(() => {
    if (isFirst.current) return;
    const el = bodyRef.current;
    if (!el) return;
    if (expanded) {
      // Expand: set explicit px height → CSS transition → then release to 'auto'
      el.style.height = el.scrollHeight + 'px';
      const tid = setTimeout(() => { el.style.height = 'auto'; }, 230);
      return () => clearTimeout(tid);
    } else {
      // Collapse: lock to current px height first (from 'auto'), then animate to 0
      el.style.height = el.scrollHeight + 'px';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { el.style.height = '0px'; });
      });
    }
  }, [expanded]);

  return (
    <div
      className={className}
      style={{
        border: '1px solid var(--color-surface-border)',
        borderRadius: '7px',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Category header */}
      <div
        onClick={() => setExpanded(v => !v)}
        className="dui_feature-category__header"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          cursor: 'pointer',
          background: expanded
            ? `color-mix(in srgb, ${color} 6%, transparent)`
            : 'transparent',
          userSelect: 'none',
          '--dui-category-color': color,
        } as React.CSSProperties}
      >
        {/* Single chevron that rotates — no component swap = no flicker */}
        <ChevronRightIcon
          size={11}
          style={{
            color: 'var(--color-text-muted)',
            flexShrink: 0,
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
        <ChipView label={categoryLabel} color={color} size="xs" />
        <span style={{ flex: 1, fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          {categoryLabel}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', flexShrink: 0 }}>
          {enabledCount}/{features.length}
        </span>
        {hasCategoryToggle && (
          <span onClick={e => e.stopPropagation()} style={{ flexShrink: 0, marginLeft: 4 }}>
            <ToggleSwitchView
              checked={categoryEnabled ?? false}
              onChange={onCategoryToggle}
              size="sm"
              accentColor={color}
            />
          </span>
        )}
      </div>

      {/* Feature list — smooth height animation, always in DOM */}
      <div ref={bodyRef}>
        <div style={{ borderTop: '1px solid var(--color-surface-border)' }}>
          {features.map((feat, i) => (
            <div
              key={feat.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '9px 12px 9px 28px',
                borderBottom: i < features.length - 1
                  ? '1px solid color-mix(in srgb, var(--color-surface-border) 50%, transparent)'
                  : 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: 500, marginBottom: feat.description ? '2px' : 0 }}>
                  {feat.label}
                </div>
                {feat.description && (
                  <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                    {feat.description}
                  </div>
                )}
              </div>
              <ToggleSwitchView
                checked={feat.enabled}
                onChange={feat.onToggle}
                size="sm"
                accentColor={color}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
