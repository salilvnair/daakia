import { useState } from 'react';
import { CopyIcon, RenameIcon, TrashIcon, SparkleIcon, CheckIcon } from '../../../icons';
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
  onClick?: (id: string) => void;
  accentColor?: string;
  selected?: boolean;
  className?: string;
  /** Override CSS variables for fine-grained theme control */
  colors?: {
    avatarBg?: string;       // avatar background color
    avatarText?: string;     // avatar text/icon color
    titleText?: string;      // title text color
    bodyText?: string;       // description / content preview color
    customBadgeBg?: string;  // CUSTOM chip background
    customBadgeText?: string; // CUSTOM chip text
    chipColor?: string;      // protocol chip color override
    actionIconColor?: string; // action icon default color
    actionDeleteColor?: string; // delete icon color
    rowBg?: string;          // background for the card row
    rowBgHover?: string;     // hover background
    rowBgSelected?: string;  // selected background
  };
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
  onClick,
  accentColor,
  selected = false,
  colors,
  className = '',
}: PromptCardViewProps) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const accent = accentColor || protocolColor || 'var(--color-protocol-ai)';

  const rowBg = colors?.rowBgSelected && selected
    ? colors.rowBgSelected
    : colors?.rowBgHover && hovered
    ? colors.rowBgHover
    : colors?.rowBg ?? (
        selected
          ? `color-mix(in srgb, ${accent} 12%, transparent)`
          : hovered
          ? 'rgba(255,255,255,0.04)'
          : 'transparent'
      );

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopy?.(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
      onClick={() => onClick?.(id)}
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
        background: colors?.avatarBg ?? `color-mix(in srgb, ${accent} 20%, var(--color-surface))`,
        color: colors?.avatarText ?? accent,
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
            color: colors?.titleText ?? 'var(--color-text-primary)',
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
              background: colors?.customBadgeBg ?? `color-mix(in srgb, ${accent} 15%, transparent)`,
              color: colors?.customBadgeText ?? accent,
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
            color: colors?.bodyText ?? 'var(--color-text-muted)',
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
          color={colors?.chipColor ?? protocolColor ?? 'var(--color-primary)'}
          size="xs"
          style={{ flexShrink: 0 }}
        />
      )}

      {/* Hover actions */}
      {hovered && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
          {onUse && (
            <ActionBtn icon={<SparkleIcon size={11} />} onClick={() => onUse(id)} title="Use prompt" iconColor={colors?.actionIconColor} />
          )}
          {onCopy && (
            <ActionBtn
              icon={copied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy prompt'}
              iconColor={copied ? 'var(--color-success)' : colors?.actionIconColor}
              copied={copied}
            />
          )}
          {onEdit && (
            <ActionBtn icon={<RenameIcon size={11} />} onClick={() => { onEdit(id); }} title="Edit prompt" iconColor={colors?.actionIconColor} />
          )}
          {onDelete && (
            <ActionBtn icon={<TrashIcon size={11} />} onClick={() => { onDelete(id); }} title="Delete" danger iconColor={colors?.actionDeleteColor} />
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ icon, onClick, title, danger, iconColor, copied }: {
  icon: React.ReactNode; onClick: (e: React.MouseEvent) => void; title: string;
  danger?: boolean; iconColor?: string; copied?: boolean;
}) {
  const baseColor = copied
    ? 'var(--color-success)'
    : iconColor ?? (danger ? 'var(--color-error)' : 'var(--color-text-muted)');
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(e); }}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: '4px',
        border: 'none',
        background: copied ? 'color-mix(in srgb, var(--color-success) 12%, transparent)' : 'transparent',
        cursor: 'pointer',
        color: baseColor,
        transition: 'background 100ms, color 100ms',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = danger
          ? 'color-mix(in srgb, var(--color-error) 12%, transparent)'
          : copied
          ? 'color-mix(in srgb, var(--color-success) 16%, transparent)'
          : 'var(--color-surface-hover)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = copied
          ? 'color-mix(in srgb, var(--color-success) 12%, transparent)'
          : 'transparent';
      }}
    >
      {icon}
    </button>
  );
}
