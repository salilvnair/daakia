import { useState } from 'react';
import type { DuiSize } from '../../core/DuiTypes';
import { useButtonBase } from '../../core/ButtonBase';
import { CopyIcon, CheckIcon } from '../../../icons';

export interface CopyButtonViewProps {
  text: string;
  /** DUI size token — controls button dimensions and icon size (default: 'md') */
  size?: DuiSize;
  title?: string;
  accentColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function CopyButtonView({
  text,
  size = 'md',
  title = 'Copy',
  accentColor,
  className = '',
  style,
}: CopyButtonViewProps) {
  const [copied, setCopied] = useState(false);
  const accent = accentColor || 'var(--color-success)';
  const base = useButtonBase(size);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied!' : title}
      className={className}
      style={{
        width: base.height,
        height: base.height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: base.borderRadius,
        border: 'none',
        cursor: 'pointer',
        background: 'transparent',
        color: copied ? accent : 'var(--color-text-muted)',
        transition: 'color 150ms ease, background 150ms ease',
        flexShrink: 0,
        ...style,
      }}
      onMouseEnter={e => {
        if (!copied) e.currentTarget.style.background = 'var(--color-hover, color-mix(in srgb, var(--color-text-primary) 6%, transparent))';
        if (!copied) e.currentTarget.style.color = 'var(--color-text-primary)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = copied ? accent : 'var(--color-text-muted)';
      }}
    >
      {copied ? <CheckIcon size={base.iconSize} /> : <CopyIcon size={base.iconSize} />}
    </button>
  );
}
