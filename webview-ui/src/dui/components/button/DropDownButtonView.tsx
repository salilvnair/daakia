import { useRef, useState } from 'react';
import { ChevronDownIcon } from '../../../icons';
import type { ButtonVariant, ButtonSize } from './ButtonView';
import type { ContextMenuItem } from '../modal/ContextMenuView';
import { ContextMenuView } from '../modal/ContextMenuView';
import { useButtonBase } from '../../core/ButtonBase';
import './DropDownButtonView.css';

export interface DropDownButtonViewProps {
  label: string;
  /** Optional icon shown to the left of the label text */
  icon?: React.ReactNode;
  variant?: ButtonVariant;
  /** Falls back to DuiProvider size when omitted or 'default'. */
  size?: ButtonSize;
  rounded?: boolean;
  items: ContextMenuItem[];
  accentColor?: string;
  disabled?: boolean;
  onPrimaryClick?: () => void;
  className?: string;
  /** Dropdown alignment. 'right' keeps menu right-edge aligned with button (opens leftward). */
  align?: 'auto' | 'left' | 'right';
}

export function DropDownButtonView({
  label,
  icon,
  variant = 'secondary',
  size = 'default',
  rounded = true,
  items,
  accentColor,
  disabled = false,
  onPrimaryClick,
  className = '',
  align = 'auto',
}: DropDownButtonViewProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const accent = accentColor || 'var(--color-primary)';
  const base = useButtonBase(size === 'default' ? undefined : size);
  const h = base.height;
  const text = base.fontSize;
  const px = base.paddingX;
  const radius = rounded ? base.borderRadius : '0px';

  const isPrimary = variant === 'primary';
  const isDanger  = variant === 'danger';

  const baseColor = isPrimary ? 'var(--color-btn-primary-text, #fff)' : isDanger ? 'var(--color-btn-danger-text, #fff)' : 'var(--color-text-primary)';

  const wrapperBg = isPrimary ? accent
    : isDanger ? 'var(--color-error)'
    : variant === 'ghost' ? 'transparent'
    : 'var(--color-surface-hover)';

  const wrapperBorder = isPrimary || isDanger || variant === 'ghost'
    ? '1px solid transparent'
    : '1px solid var(--color-surface-border)';

  const hoverBtnBg = isPrimary || isDanger ? 'rgba(0,0,0,0.12)' : 'var(--color-surface-active)';

  return (
    <>
      <div
        ref={wrapperRef}
        className={`inline-flex items-center ${className}`}
        style={{
          height: h, borderRadius: radius, overflow: 'hidden',
          opacity: disabled ? 0.5 : 1,
          background: wrapperBg, border: wrapperBorder,
          color: baseColor, padding: 0,
          transition: 'background 120ms',
          '--dui-hover-btn-bg': hoverBtnBg,
        } as React.CSSProperties}
      >
        {/* Primary label side */}
        <button
          type="button"
          disabled={disabled}
          onClick={onPrimaryClick}
          className="dui_dropdown-button__label"
          style={{
            height: '100%',
            paddingLeft: px, paddingRight: '8px',
            display: 'flex', alignItems: 'center', gap: base.gap,
            fontSize: text, fontWeight: 500,
            border: 'none', color: 'inherit',
            cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
          }}
        >
          {icon && (
            <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {icon}
            </span>
          )}
          {label}
        </button>

        {/* Divider */}
        <div style={{
          width: '1px', height: '60%',
          background: isPrimary || isDanger ? 'rgba(255,255,255,.25)' : 'var(--color-surface-border)',
        }} />

        {/* Chevron dropdown side */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen(v => !v)}
          className="dui_dropdown-button__chevron"
          style={{
            height: '100%', paddingLeft: '6px', paddingRight: '7px',
            display: 'flex', alignItems: 'center',
            border: 'none', color: 'inherit',
            cursor: disabled ? 'default' : 'pointer',
          }}
        >
          <ChevronDownIcon size={10} style={{ transition: 'transform 140ms', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
        </button>
      </div>

      <ContextMenuView
        items={items}
        anchorEl={wrapperRef.current}
        open={open}
        onClose={() => setOpen(false)}
        rounded={rounded}
        matchAnchorWidth={false}
        width="md"
        align={align}
      />
    </>
  );
}
