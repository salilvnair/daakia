import { useState } from 'react';
import { ChevronDownIcon } from '../../../icons';
import './ExpandableLogEntryView.css';

export interface ExpandableLogEntryViewProps {
  icon: React.ReactNode;
  title: string;
  /** Short colored label shown after the title (e.g. method, status) */
  badge?: string;
  /** CSS color or var() for badge text + tinted background */
  badgeColor?: string;
  /** Unix ms timestamp — renders as HH:MM:SS AM/PM if provided */
  timestamp?: number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function ExpandableLogEntryView({
  icon,
  title,
  badge,
  badgeColor,
  timestamp,
  defaultExpanded = false,
  children,
  className = '',
}: ExpandableLogEntryViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const timeStr = timestamp
    ? new Date(timestamp).toLocaleTimeString('en-US', {
        hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : undefined;

  const customStyle = badgeColor
    ? ({ '--dui-logentry-badge': badgeColor } as React.CSSProperties)
    : undefined;

  return (
    <div
      className={`dui_log-entry${className ? ` ${className}` : ''}`}
      style={customStyle}
    >
      <div className="dui_log-entry__header" onClick={() => setExpanded(v => !v)}>
        <span className="dui_log-entry__icon">{icon}</span>
        <span className="dui_log-entry__title">{title}</span>
        {badge && <span className="dui_log-entry__badge">{badge}</span>}
        <span className="dui_log-entry__meta">
          {timeStr && <span className="dui_log-entry__timestamp">{timeStr}</span>}
          <span className={`dui_log-entry__chevron${expanded ? ' dui_log-entry__chevron--open' : ''}`}>
            <ChevronDownIcon size={12} />
          </span>
        </span>
      </div>

      {expanded && (
        <div className="dui_log-entry__content">
          {children}
        </div>
      )}
    </div>
  );
}
