/**
 * SegmentedControlView — industry-standard segmented control (toggle group).
 * Named after Mantine's SegmentedControl / iOS UISegmentedControl.
 *
 * Uses DUI TabBase for sizing so heights match SelectInputView and ButtonView at every size.
 */
import { useRef, useEffect, useState, type ReactNode } from 'react';
import type { DuiSize } from '../../core/DuiTypes';
import { useTabBase } from '../../core/TabBase';

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlViewProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  size?: DuiSize;
  /** Accent color for the active segment indicator and text */
  accentColor?: string;
  /** Stretch to fill container width */
  fullWidth?: boolean;
}

/**
 * Segmented control with a sliding animated indicator.
 * Active segment text color shifts to accentColor; inactive stays text-secondary.
 */
export function SegmentedControlView({
  options,
  value,
  onChange,
  size,
  accentColor = 'var(--color-primary)',
  fullWidth,
}: SegmentedControlViewProps) {
  const base = useTabBase(size);
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  const activeIdx = options.findIndex(o => o.value === value);

  // Measure the active button after every value/options change
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const btns = container.querySelectorAll<HTMLButtonElement>('button[data-seg]');
    const btn = btns[activeIdx];
    if (!btn) return;
    setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [value, activeIdx, options.length]);

  const TRACK_PADDING = 2;
  const trackBr = `calc(${base.borderRadius} + ${TRACK_PADDING}px)`;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'inline-flex',
        position: 'relative',
        height: base.height,
        padding: TRACK_PADDING,
        borderRadius: trackBr,
        backgroundColor: 'var(--color-pilltab-track-bg, var(--color-surface))',
        border: '1px solid var(--color-surface-border)',
        width: fullWidth ? '100%' : undefined,
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      {/* Sliding indicator */}
      {indicator.width > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: TRACK_PADDING,
            left: indicator.left,
            width: indicator.width,
            height: `calc(100% - ${TRACK_PADDING * 2}px)`,
            borderRadius: base.borderRadius,
            backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${accentColor} 28%, transparent)`,
            transition: 'left 0.14s ease, width 0.14s ease',
            pointerEvents: 'none',
          }}
        />
      )}

      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            data-seg="1"
            type="button"
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: base.gap,
              paddingLeft: base.paddingX,
              paddingRight: base.paddingX,
              fontSize: base.fontSize,
              fontWeight: 500,
              height: '100%',
              borderRadius: base.borderRadius,
              border: 'none',
              background: 'transparent',
              color: isActive ? accentColor : 'var(--color-text-secondary)',
              cursor: opt.disabled ? 'not-allowed' : 'pointer',
              opacity: opt.disabled ? 0.35 : 1,
              position: 'relative',
              zIndex: 1,
              whiteSpace: 'nowrap',
              transition: 'color 0.14s ease',
              flex: fullWidth ? 1 : undefined,
              userSelect: 'none',
            }}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
