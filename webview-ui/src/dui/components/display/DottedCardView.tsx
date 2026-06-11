import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '../../../icons';

export interface DottedCardViewProps {
  children: React.ReactNode;
  title?: string;
  expandable?: boolean;
  defaultExpanded?: boolean;
  accentColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function DottedCardView({
  children,
  title,
  expandable = false,
  defaultExpanded = true,
  accentColor,
  className = '',
  style,
}: DottedCardViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const accent = accentColor || 'var(--color-primary)';
  const isOpen = !expandable || expanded;

  return (
    <div
      className={className}
      style={{
        border: `1.5px dashed color-mix(in srgb, ${accent} 30%, transparent)`,
        borderRadius: '8px',
        overflow: 'hidden',
        ...style,
      }}
    >
      {(title || expandable) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            background: `color-mix(in srgb, ${accent} 5%, transparent)`,
            borderBottom: isOpen ? `1px dashed color-mix(in srgb, ${accent} 20%, transparent)` : 'none',
            cursor: expandable ? 'pointer' : 'default',
            userSelect: 'none',
          }}
          onClick={() => expandable && setExpanded(v => !v)}
        >
          {expandable && (
            isOpen
              ? <ChevronDownIcon size={12} style={{ color: accent, flexShrink: 0 }} />
              : <ChevronRightIcon size={12} style={{ color: accent, flexShrink: 0 }} />
          )}
          {title && (
            <span style={{ fontSize: '11px', fontWeight: 600, color: accent }}>
              {title}
            </span>
          )}
        </div>
      )}
      {isOpen && (
        <div style={{ padding: '12px' }}>
          {children}
        </div>
      )}
    </div>
  );
}
