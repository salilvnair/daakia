import { useRef, useState } from 'react';
import { ChevronDownIcon } from '../../../icons';
import type { ButtonVariant, ButtonSize } from './ButtonView';
import type { ContextMenuItem } from '../modal/ContextMenuView';
import { ContextMenuView } from '../modal/ContextMenuView';

export interface DropDownButtonViewProps {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  rounded?: boolean;
  items: ContextMenuItem[];
  accentColor?: string;
  disabled?: boolean;
  onPrimaryClick?: () => void;
  className?: string;
}

const SIZE_H: Record<ButtonSize, string> = {
  default: '26px', sm: '22px', md: '28px', lg: '32px', xl: '36px',
};
const SIZE_TEXT: Record<ButtonSize, string> = {
  default: '11px', sm: '10px', md: '11px', lg: '12px', xl: '13px',
};
const SIZE_PX: Record<ButtonSize, string> = {
  default: '10px', sm: '8px', md: '10px', lg: '12px', xl: '16px',
};

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
  const h = SIZE_H[size] ?? SIZE_H.default;
  const text = SIZE_TEXT[size] ?? SIZE_TEXT.default;
  const px = SIZE_PX[size] ?? SIZE_PX.default;
  const radius = rounded ? '4px' : '0px';

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
          filter: isPrimary ? undefined : undefined,
          transition: 'background 120ms, filter 120ms',
        }}
      >
        {/* Primary label side */}
        <button
          type="button"
          disabled={disabled}
          onClick={onPrimaryClick}
          onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = hoverBtnBg; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          onMouseDown={e => { if (!disabled && (isPrimary || isDanger)) e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; }}
          onMouseUp={e => { if (!disabled) e.currentTarget.style.background = hoverBtnBg; }}
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
          onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = hoverBtnBg; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
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
