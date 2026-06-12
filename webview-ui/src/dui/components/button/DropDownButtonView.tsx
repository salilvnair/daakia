import { useRef, useState } from 'react';
import { ChevronDownIcon } from '../../../icons';
import type { ButtonVariant, ButtonSize } from './ButtonView';
import type { ContextMenuItem } from '../modal/ContextMenuView';
import { ContextMenuView } from '../modal/ContextMenuView';
import { useButtonBase } from '../../core/ButtonBase';
import './DropDownButtonView.css';

export interface DropDownButtonViewProps {
  label: string;
  variant?: ButtonVariant;
  /** Falls back to DuiProvider size when omitted or 'default'. */
  size?: ButtonSize;
  rounded?: boolean;
  items: ContextMenuItem[];
  accentColor?: string;
  disabled?: boolean;
  onPrimaryClick?: () => void;
  className?: string;
}

export function DropDownButtonView({
  label,
  variant = 'secondary',
  size = 'default',
  rounded = true,
  items,
  accentColor,
  disabled = false,
  onPrimaryClick,
  className = '',
}: DropDownButtonViewProps) {
  const [open, setOpen] = useState(false);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const accent = accentColor || 'var(--color-primary)';
  const base = useButtonBase(size === 'default' ? undefined : size);
  const h = base.height;
  const text = base.fontSize;
  const px = base.paddingX;
  const radius = rounded ? base.borderRadius : '0px';

  const isPrimary = variant === 'primary';
  const isDanger  = variant === 'danger';

  const baseColor = isPrimary ? '#fff' : isDanger ? '#fff' : 'var(--color-text-primary)';

  const wrapperBg = isPrimary ? accent
    : isDanger ? 'var(--color-error)'
    : variant === 'ghost' ? 'transparent'
    : 'var(--color-surface-hover)';

  const wrapperBorder = isPrimary || isDanger || variant === 'ghost'
    ? '1px solid transparent'
    : '1px solid var(--color-surface-border)';

  // CSS custom prop for hover bg on label/chevron buttons
  const hoverBtnBg = isPrimary || isDanger ? 'rgba(0,0,0,0.12)' : 'var(--color-surface-active)';

  return (
    <>
      <div
        className={`inline-flex items-center ${className}`}
        style={{
          height: h, borderRadius: radius, overflow: 'hidden',
          opacity: disabled ? 0.5 : 1,
          background: wrapperBg, border: wrapperBorder,
          color: baseColor, padding: 0,
          transition: 'background 120ms',
          // CSS custom prop for button hover
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
            height: '100%', paddingLeft: px, paddingRight: '8px',
            fontSize: text, fontWeight: 500,
            background: 'transparent', border: 'none', color: 'inherit',
            cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
            transition: 'background 100ms',
          }}
        >
          {label}
        </button>

        {/* Divider */}
        <div style={{
          width: '1px', height: '60%',
          background: isPrimary || isDanger ? 'rgba(255,255,255,.25)' : 'var(--color-surface-border)',
        }} />

        {/* Chevron dropdown side */}
        <button
          ref={chevronRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen(v => !v)}
          className="dui_dropdown-button__chevron"
          style={{
            height: '100%', paddingLeft: '6px', paddingRight: '7px',
            display: 'flex', alignItems: 'center',
            background: 'transparent', border: 'none', color: 'inherit',
            cursor: disabled ? 'default' : 'pointer',
            transition: 'background 100ms',
          }}
        >
          <ChevronDownIcon size={10} style={{ transition: 'transform 140ms', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
        </button>
      </div>

      <ContextMenuView
        items={items}
        anchorEl={chevronRef.current}
        open={open}
        onClose={() => setOpen(false)}
        rounded={rounded}
        matchAnchorWidth={false}
        width="md"
      />
    </>
  );
}
