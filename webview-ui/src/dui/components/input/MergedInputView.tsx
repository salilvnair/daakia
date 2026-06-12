import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DropdownArrowIcon, CheckIcon } from '../../../icons';
import type { DuiSize } from '../../core/DuiTypes';
import { useDui } from '../../core/DuiContext';
import { DUI_HEIGHT, DUI_FONT_SIZE, DUI_PADDING_X, DUI_ICON_SIZE } from '../../core/DuiTokens';
import './MergedInputView.css';

// ─── Types ────────────────────────────────────────────────────────────────────

/** @deprecated Use `DuiSize` ('sm' | 'md' | 'lg' | 'xl') directly. */
export type MergedInputSize = DuiSize;

export interface MergedSelectOption {
  value: string;
  label: string;
  color?: string;
}

export type MergedInputSegment =
  | {
      type: 'select';
      value: string;
      options: MergedSelectOption[];
      onChange: (value: string) => void;
      width?: number;
    }
  | {
      type: 'text';
      value: string;
      onChange: (value: string) => void;
      placeholder?: string;
      flex?: number;
    }
  | {
      type: 'button';
      label: string;
      onClick: () => void;
      icon?: React.ReactNode;
      accentColor?: string;
    }
  | { type: 'divider' }
  | { type: 'custom'; content: React.ReactNode; width?: number };

export interface MergedInputViewProps {
  segments: MergedInputSegment[];
  /** Falls back to DuiProvider size when omitted. */
  size?: DuiSize;
  accentColor?: string;
  disabled?: boolean;
  className?: string;
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function MergeDivider() {
  return (
    <div
      style={{
        width: 1,
        alignSelf: 'stretch',
        background: 'var(--color-input-border)',
        flexShrink: 0,
        margin: '4px 0',
      }}
    />
  );
}

// ─── Select segment ───────────────────────────────────────────────────────────

interface MergedDims { height: number; fontSize: number; px: number; arrowSize: number }

interface SegSelectProps {
  seg: Extract<MergedInputSegment, { type: 'select' }>;
  dims: MergedDims;
  accent: string;
  disabled: boolean;
}

function SegSelect({ seg, dims, accent, disabled }: SegSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const selWidth = seg.width ?? (dims.height <= 26 ? 72 : dims.height <= 34 ? 88 : 106);
  const selected = seg.options.find(o => o.value === seg.value);
  const selectColor = selected?.color ?? 'var(--color-text-primary)';

  const openDropdown = () => {
    if (disabled) return;
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 110) });
    setOpen(v => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-miv-drop]') && !t.closest('[data-miv-sel]')) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <>
      <div
        ref={triggerRef}
        data-miv-sel
        onClick={openDropdown}
        className={`dui_merged__select-trigger${disabled ? ' dui_merged__select-trigger--disabled' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          width: selWidth,
          flexShrink: 0,
          padding: `0 ${dims.px}px`,
          cursor: disabled ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          color: selectColor,
          fontWeight: 700,
          fontSize: dims.fontSize,
          letterSpacing: '0.02em',
          borderRadius: '5px 0 0 5px',
        }}
      >
        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {selected?.label ?? seg.value}
        </span>
        <DropdownArrowIcon
          size={dims.arrowSize}
          style={{
            flexShrink: 0,
            color: 'var(--color-text-muted)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 150ms ease',
          }}
        />
      </div>

      {open && createPortal(
        <div
          data-miv-drop
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            minWidth: pos.width,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
            zIndex: 9999,
            padding: 3,
          }}
        >
          {seg.options.map(opt => {
            const isSel = opt.value === seg.value;
            return (
              <div
                key={opt.value}
                onMouseDown={e => { e.preventDefault(); seg.onChange(opt.value); setOpen(false); }}
                className={`dui_merged__select-option${isSel ? ' dui_merged__select-option--selected' : ''}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: `${dims.height <= 26 ? '4px 8px' : '6px 10px'}`,
                  borderRadius: 5,
                  cursor: 'pointer',
                  fontSize: dims.fontSize,
                  fontWeight: isSel ? 700 : 500,
                  color: opt.color ?? (isSel ? accent : 'var(--color-text-primary)'),
                  background: isSel ? `color-mix(in srgb, ${accent} 12%, transparent)` : 'transparent',
                }}
              >
                <span style={{ flex: 1 }}>{opt.label}</span>
                {isSel && <CheckIcon size={11} style={{ color: accent, flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── Button segment ───────────────────────────────────────────────────────────

interface SegButtonProps {
  seg: Extract<MergedInputSegment, { type: 'button' }>;
  dims: MergedDims;
  disabled: boolean;
}

function SegButton({ seg, dims, disabled }: SegButtonProps) {
  const accent = seg.accentColor ?? 'var(--color-primary)';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={seg.onClick}
      className="dui_merged__button-seg"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
        height: dims.height - 6,
        padding: `0 ${dims.px - 2}px`,
        fontSize: dims.fontSize,
        fontWeight: 700,
        letterSpacing: '0.04em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${accent}`,
        borderRadius: 4,
        background: `color-mix(in srgb, ${accent} 10%, transparent)`,
        color: accent,
        margin: `3px ${dims.px - 4}px`,
        transition: 'background 100ms, color 100ms',
        fontFamily: 'inherit',
        opacity: disabled ? 0.5 : 1,
        '--dui-seg-accent': accent,
      } as React.CSSProperties}
    >
      {seg.icon}
      {seg.label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MergedInputView({
  segments,
  size,
  accentColor,
  disabled = false,
  className = '',
}: MergedInputViewProps) {
  const [focused, setFocused] = useState(false);
  const [openSel, setOpenSel] = useState(false);

  const ctx = useDui();
  const s = size ?? ctx.size;
  const dims = {
    height:    DUI_HEIGHT.input[s],
    fontSize:  parseInt(DUI_FONT_SIZE[s], 10),
    px:        parseInt(DUI_PADDING_X[s], 10),
    arrowSize: DUI_ICON_SIZE[s],
  };
  const accent = accentColor ?? 'var(--color-primary)';
  const borderColor = focused || openSel ? accent : 'var(--color-input-border)';
  const boxShadow = (focused || openSel)
    ? `0 0 0 2px color-mix(in srgb, ${accent} 20%, transparent)`
    : 'none';

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height: dims.height,
        width: '100%',
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        background: 'var(--color-input-bg)',
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color 120ms, box-shadow 120ms',
        boxShadow,
        overflow: 'visible',
        position: 'relative',
      }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
    >
      {segments.map((seg, i) => {
        if (seg.type === 'divider') {
          return <MergeDivider key={i} />;
        }
        if (seg.type === 'select') {
          return (
            <SegSelect
              key={i}
              seg={seg}
              dims={dims}
              accent={accent}
              disabled={disabled}
            />
          );
        }
        if (seg.type === 'text') {
          return (
            <input
              key={i}
              value={seg.value}
              onChange={e => seg.onChange(e.target.value)}
              placeholder={seg.placeholder}
              disabled={disabled}
              style={{
                flex: seg.flex ?? 1,
                height: '100%',
                padding: `0 ${dims.px}px`,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: dims.fontSize,
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                minWidth: 0,
              }}
            />
          );
        }
        if (seg.type === 'button') {
          return <SegButton key={i} seg={seg} dims={dims} disabled={disabled} />;
        }
        if (seg.type === 'custom') {
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
                width: seg.width,
              }}
            >
              {seg.content}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
