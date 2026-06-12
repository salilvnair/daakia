import { ChevronRightIcon } from '../../../icons';
import './CollapsibleSectionView.css';

export interface CollapsibleSectionViewProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  /** Count badge shown next to title */
  badge?: number;
  /** Accent color for title chip + badge. Accepts any CSS color or var(). */
  accentColor?: string;
  /** Slot rendered on the far right of the header (action buttons etc.) */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function CollapsibleSectionView({
  title,
  expanded,
  onToggle,
  badge,
  accentColor,
  headerRight,
  children,
  className = '',
}: CollapsibleSectionViewProps) {
  const customStyle = accentColor
    ? ({ '--dui-collapse-accent': accentColor } as React.CSSProperties)
    : undefined;

  return (
    <div className={`dui_collapsible${className ? ` ${className}` : ''}`} style={customStyle}>
      <button type="button" onClick={onToggle} className="dui_collapsible__header">
        <span className={`dui_collapsible__chevron${expanded ? ' dui_collapsible__chevron--open' : ''}`}>
          <ChevronRightIcon size={12} />
        </span>

        <span className="dui_collapsible__title">{title}</span>

        {badge !== undefined && badge > 0 && (
          <span className="dui_collapsible__badge">{badge}</span>
        )}

        {headerRight && (
          <span className="dui_collapsible__actions" onClick={e => e.stopPropagation()}>
            {headerRight}
          </span>
        )}
      </button>

      {expanded && (
        <div className="dui_collapsible__content">
          {children}
        </div>
      )}
    </div>
  );
}
