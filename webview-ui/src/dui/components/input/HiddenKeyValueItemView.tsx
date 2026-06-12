import { useState } from 'react';
import { LockIcon, TrashIcon, EyeIcon, EyeOffIcon } from '../../../icons';
import './HiddenKeyValueItemView.css';

export interface HiddenKeyValueItemViewProps {
  keyValue: string;
  value: string;
  /** Small colored pill badge on the key — e.g. "auth", "cookie" */
  badge?: string;
  badgeColor?: string;
  /** Override the left lock icon */
  icon?: React.ReactNode;
  /** Mask the value with dots; shows eye toggle to reveal */
  masked?: boolean;
  onDelete?: () => void;
  deleteTitle?: string;
  /** Show description column placeholder (for grid alignment with KeyValueItemView) */
  showDescription?: boolean;
  className?: string;
}

/**
 * Read-only hidden/system-managed key-value row.
 * Ditto the lock-icon + dashed-border pattern from ComputedHeaderList —
 * "Hidden" is Postman's terminology; Daakia's visual style is kept.
 */
export function HiddenKeyValueItemView({
  keyValue,
  value,
  badge,
  badgeColor,
  icon,
  masked = false,
  onDelete,
  deleteTitle,
  showDescription = false,
  className = '',
}: HiddenKeyValueItemViewProps) {
  const [revealed, setRevealed] = useState(false);

  const displayValue = masked && !revealed ? '••••••••••••••••••••' : value;

  const cols = [
    '32px',           // lock icon
    '1fr',            // key
    '1fr',            // value
    showDescription && '1fr',  // description placeholder
    '32px',           // delete
  ].filter(Boolean).join(' ');

  const readonlyCell: React.CSSProperties = {
    width: '100%',
    height: '28px',
    paddingLeft: '10px',
    paddingRight: '10px',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    overflow: 'hidden',
    background: 'color-mix(in srgb, var(--color-text-primary) 3%, transparent)',
    border: '1px dashed color-mix(in srgb, var(--color-text-primary) 12%, transparent)',
    color: 'var(--color-text-muted)',
    cursor: 'default',
    userSelect: 'text',
  };

  return (
    <div
      className={`dui_hidden-kv-item group ${className}`}
      style={{
        display: 'grid',
        gridTemplateColumns: cols,
        gap: '8px',
        alignItems: 'center',
        minHeight: '28px',
      }}
    >
      {/* Lock / system icon */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--color-text-muted)', opacity: 0.55, display: 'flex' }}>
          {icon ?? <LockIcon size={13} />}
        </span>
      </div>

      {/* Key — dashed, read-only */}
      <div style={readonlyCell} title={keyValue}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
          {keyValue}
        </span>
        {badge && (
          <span style={{
            marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 99, flexShrink: 0,
            background: `color-mix(in srgb, ${badgeColor ?? 'var(--color-primary)'} 18%, transparent)`,
            color: badgeColor ?? 'var(--color-primary)',
            fontWeight: 700, letterSpacing: '0.03em',
          }}>
            {badge}
          </span>
        )}
      </div>

      {/* Value — dashed, read-only, eye toggle if masked */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            ...readonlyCell,
            paddingRight: masked ? '28px' : '10px',
            fontFamily: 'monospace',
            width: '100%',
          }}
          title={revealed ? value : undefined}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayValue}
          </span>
        </div>
        {masked && (
          <button
            type="button"
            onClick={() => setRevealed(v => !v)}
            className="dui_hidden-kv-item__eye"
            style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 2,
              background: 'transparent', border: 'none',
            }}
            title={revealed ? 'Hide value' : 'Reveal value'}
          >
            {revealed ? <EyeIcon size={12} /> : <EyeOffIcon size={12} />}
          </button>
        )}
      </div>

      {/* Description placeholder — keeps grid alignment */}
      {showDescription && <div />}

      {/* Delete */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            title={deleteTitle ?? 'Remove'}
            className="dui_hidden-kv-item__delete opacity-0 group-hover:opacity-100"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-text-muted)', cursor: 'pointer', padding: 2,
              background: 'transparent', border: 'none',
            }}
          >
            <TrashIcon size={13} />
          </button>
        ) : (
          <div style={{ width: 24 }} />
        )}
      </div>
    </div>
  );
}
