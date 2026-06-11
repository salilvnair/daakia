import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';

export type TextInputSize = 'default' | 'sm' | 'md' | 'lg' | 'xl';

export interface TextInputViewProps extends InputHTMLAttributes<HTMLInputElement> {
  size?: TextInputSize;
  /** true = 4px radius (default), false = 0px square */
  rounded?: boolean;
  /** Override focus border / ring color (CSS var or raw) */
  accentColor?: string;
  /** Red border state */
  error?: boolean;
  /** Element rendered inside the left edge */
  iconLeft?: ReactNode;
  /** Element rendered inside the right edge */
  iconRight?: ReactNode;
}

const SIZE: Record<TextInputSize, { h: string; px: string; text: string }> = {
  default: { h: '26px', px: '10px', text: '11px' },
  sm:      { h: '22px', px: '8px',  text: '10px' },
  md:      { h: '28px', px: '10px', text: '11px' },
  lg:      { h: '32px', px: '12px', text: '12px' },
  xl:      { h: '36px', px: '12px', text: '13px' },
};

export const TextInputView = forwardRef<HTMLInputElement, TextInputViewProps>(
  function TextInputView(
    { size = 'default', rounded = true, accentColor, error = false, iconLeft, iconRight, style, className = '', onFocus, onBlur, ...rest },
    ref
  ) {
    const [focused, setFocused] = useState(false);
    const { h, px, text } = SIZE[size] ?? SIZE.default;
    const accent = accentColor || 'var(--color-primary)';
    const radius = rounded ? '4px' : '0px';

    const borderColor = error
      ? 'var(--color-error)'
      : focused
      ? accent
      : 'var(--color-input-border)';

    const containerStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      height: h,
      borderRadius: radius,
      border: `1px solid ${borderColor}`,
      background: 'var(--color-input-bg)',
      transition: 'border-color 140ms, box-shadow 140ms',
      boxShadow: focused ? `0 0 0 2px color-mix(in srgb, ${accent} 20%, transparent)` : 'none',
      overflow: 'hidden',
      ...style,
    };

    return (
      <div style={containerStyle} className={className}>
        {iconLeft && (
          <span style={{ paddingLeft: px, display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', flexShrink: 0 }}>
            {iconLeft}
          </span>
        )}
        <input
          ref={ref}
          style={{
            flex: 1,
            height: '100%',
            paddingLeft: iconLeft ? '6px' : px,
            paddingRight: iconRight ? '6px' : px,
            fontSize: text,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--color-text-primary)',
            minWidth: 0,
            fontFamily: 'inherit',
          }}
          onFocus={e => { setFocused(true); onFocus?.(e); }}
          onBlur={e => { setFocused(false); onBlur?.(e); }}
          {...rest}
        />
        {iconRight && (
          <span style={{ paddingRight: px, display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', flexShrink: 0 }}>
            {iconRight}
          </span>
        )}
      </div>
    );
  }
);
