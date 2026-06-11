import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '../../../icons';
import { ToggleSwitchView } from '../input/ToggleSwitchView';
import { ChipView } from '../chips/ChipView';

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
  /** Category-level enabled state — shows a master toggle in the header */
  categoryEnabled?: boolean;
  /** Called when the category-level toggle changes */
  onCategoryToggle?: (enabled: boolean) => void;
  className?: string;
}

export function FeatureCategoryView({
  categoryLabel,
  categoryColor,
  features,
  defaultExpanded = false,
  categoryEnabled,
  onCategoryToggle,
  className = '',
}: FeatureCategoryViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const color = categoryColor || 'var(--color-primary)';
  const enabledCount = features.filter(f => f.enabled).length;
  const hasCategoryToggle = onCategoryToggle !== undefined;

  return (
    <div
      className={className}
      style={{
        border: '1px solid var(--color-surface-border)',
        borderRadius: '7px',
        overflow: 'hidden',
      }}
    >
      {/* Category header */}
      <div
        onClick={() => setExpanded(v => !v)}
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
          transition: 'background 100ms',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `color-mix(in srgb, ${color} 8%, transparent)`; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = expanded ? `color-mix(in srgb, ${color} 6%, transparent)` : 'transparent'; }}
      >
        {expanded
          ? <ChevronDownIcon size={11} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          : <ChevronRightIcon size={11} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        }
        <ChipView label={categoryLabel} color={color} size="xs" />
        <span style={{ flex: 1, fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          {categoryLabel}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', flexShrink: 0 }}>
          {enabledCount}/{features.length}
        </span>
        {/* Category-level master toggle */}
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

      {/* Feature list */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-surface-border)' }}>
          {features.map((feat, i) => (
            <div
              key={feat.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '9px 12px 9px 28px',
                borderBottom: i < features.length - 1 ? '1px solid color-mix(in srgb, var(--color-surface-border) 50%, transparent)' : 'none',
                background: 'transparent',
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
      )}
    </div>
  );
}
