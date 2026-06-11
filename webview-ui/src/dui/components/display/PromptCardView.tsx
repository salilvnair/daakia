import { useState } from 'react';
import { CopyIcon, RenameIcon, TrashIcon, SparkleIcon } from '../../../icons';
import { ChipView } from '../chips/ChipView';

export interface PromptCardViewProps {
  id: string;
  title: string;
  description?: string;
  content: string;
  protocol?: string;
  protocolColor?: string;
  isCustom?: boolean;
  onUse?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onCopy?: (id: string) => void;
  accentColor?: string;
  selected?: boolean;
  className?: string;
}

function getInitials(title: string): string {
  const words = title.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return title.slice(0, 2).toUpperCase();
}

export function PromptCardView({
  id,
  title,
  description,
  content,
  protocol,
  protocolColor,
  isCustom = false,
  onUse,
  onEdit,
  onDelete,
  onCopy,
  accentColor,
  selected = false,
  className = '',
}: PromptCardViewProps) {
  const [hovered, setHovered] = useState(false);
  const accent = accentColor || protocolColor || 'var(--color-protocol-ai)';

  const rowBg = selected
    ? `color-mix(in srgb, ${accent} 12%, transparent)`
    : hovered
    ? 'rgba(255,255,255,0.04)'
    : 'transparent';

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        padding: '6px 10px',
        borderRadius: '6px',
        cursor: 'pointer',
        background: rowBg,
        transition: 'background 100ms',
        minWidth: 0,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Colored avatar with initials */}
      <div style={{
        width: 22,
        height: 22,
        borderRadius: '5px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `color-mix(in srgb, ${accent} 20%, var(--color-surface))`,
        color: accent,
        fontSize: '9px',
        fontWeight: 700,
        letterSpacing: '0.02em',
        userSelect: 'none',
      }}>
        {getInitials(title)}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '1px' }}>
          <span style={{
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
            minWidth: 0,
          }}>
            {title}
          </span>
          {isCustom && (
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 99,
              background: `color-mix(in srgb, ${accent} 15%, transparent)`,
              color: accent,
              flexShrink: 0,
              letterSpacing: '0.04em',
            }}>
              CUSTOM
            </span>
          )}
        </div>
        {(description || content) && (
          <div style={{
            fontSize: '10px',
            color: 'var(--color-text-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {description || content}
          </div>
        )}
      </div>

      {/* Protocol chip */}
      {protocol && (
        <ChipView
          label={protocol}
          color={protocolColor || 'var(--color-primary)'}
          size="xs"
          style={{ flexShrink: 0 }}
        />
      )}

      {/* Hover actions */}
      {hovered && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
          {onUse && (
            <ActionBtn icon={<SparkleIcon size={11} />} onClick={() => onUse(id)} title="Use prompt" />
          )}
          {onCopy && (
            <ActionBtn icon={<CopyIcon size={11} />} onClick={() => onCopy(id)} title="Copy prompt" />
          )}
          {onEdit && (
            <ActionBtn icon={<RenameIcon size={11} />} onClick={() => onEdit(id)} title="Edit prompt" />
          )}
          {onDelete && (
            <ActionBtn icon={<TrashIcon size={11} />} onClick={() => onDelete(id)} title="Delete" danger />
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ icon, onClick, title, danger }: { icon: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: '4px',
        border: 'none', background: 'transparent',
        cursor: 'pointer',
        color: danger ? 'var(--color-error)' : 'var(--color-text-muted)',
        transition: 'background 100ms',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = danger
          ? 'color-mix(in srgb, var(--color-error) 12%, transparent)'
          : 'var(--color-surface-hover)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      {icon}
    </button>
  );
}
