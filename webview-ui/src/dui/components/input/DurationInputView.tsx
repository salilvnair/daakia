import { useState, useCallback, useRef, useEffect } from 'react';
import type { DuiSize } from '../../core/DuiTypes';
import { useInputBase } from '../../core/InputBase';
import './DurationInputView.css';

export type DurationUnit = 'ms' | 's' | 'm' | 'hr';

const UNIT_OPTIONS: { value: DurationUnit; label: string; color: string }[] = [
  { value: 'ms', label: 'ms', color: 'var(--color-warning)' },
  { value: 's',  label: 's',  color: 'var(--color-success)' },
  { value: 'm',  label: 'm',  color: 'var(--color-info)' },
  { value: 'hr', label: 'hr', color: 'var(--color-error)' },
];

const UNIT_TO_MS: Record<DurationUnit, number> = { ms: 1, s: 1000, m: 60000, hr: 3600000 };

export interface DurationInputViewProps {
  /** Current value in milliseconds */
  value: number;
  /** Called with new value in milliseconds */
  onChange: (ms: number) => void;
  placeholder?: string;
  accentColor?: string;
  /** Falls back to DuiProvider size when omitted. */
  size?: DuiSize;
  width?: number;
  className?: string;
}

export function DurationInputView({
  value,
  onChange,
  placeholder = '0',
  size,
  width = 110,
  className = '',
}: DurationInputViewProps) {
  const base = useInputBase(size);
  const [unit, setUnit] = useState<DurationUnit>(() => {
    if (value === 0) return 'ms';
    if (value >= 3600000 && value % 3600000 === 0) return 'hr';
    if (value >= 60000  && value % 60000  === 0) return 'm';
    if (value >= 1000   && value % 1000   === 0) return 's';
    return 'ms';
  });
  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);

  const displayValue = value === 0 ? '' : String(Math.round(value / UNIT_TO_MS[unit]));

  const handleValueChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '' || raw === '0') { onChange(0); return; }
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 0) onChange(num * UNIT_TO_MS[unit]);
  }, [onChange, unit]);

  const handleUnitChange = (u: DurationUnit) => { setUnit(u); setShowPopup(false); };

  useEffect(() => {
    if (!showPopup) return;
    const handler = (e: MouseEvent) => {
      if (!popupRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        setShowPopup(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPopup]);

  const unitColor = UNIT_OPTIONS.find(o => o.value === unit)?.color ?? 'var(--color-warning)';

  return (
    <div className={className} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <input
        type="number"
        min="0"
        value={displayValue}
        onChange={handleValueChange}
        placeholder={placeholder}
        style={{
          width,
          height: parseInt(base.height, 10),
          paddingLeft: 10,
          paddingRight: 40,
          fontSize: base.fontSize,
          fontFamily: 'monospace',
          borderRadius: base.borderRadius,
          border: '1px solid var(--color-input-border)',
          background: 'var(--color-input-bg)',
          color: 'var(--color-text-primary)',
          outline: 'none',
          MozAppearance: 'textfield',
        }}
      />
      <button
        ref={btnRef}
        type="button"
        onClick={() => setShowPopup(v => !v)}
        style={{
          position: 'absolute', right: 6,
          fontSize: 11, fontWeight: 600,
          cursor: 'pointer', padding: '2px 4px', borderRadius: 3,
          background: 'transparent', border: 'none', color: unitColor,
          transition: 'opacity 100ms',
        }}
      >
        {unit}
      </button>

      {showPopup && (
        <div
          ref={popupRef}
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 9999,
            minWidth: 60, borderRadius: 6,
            border: '1px solid var(--color-surface-border)',
            background: 'var(--color-elevated)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            overflow: 'hidden',
          }}
        >
          {UNIT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleUnitChange(opt.value)}
              className={`dui_duration__unit-option${unit === opt.value ? ' dui_duration__unit-option--selected' : ''}`}
              style={{
                display: 'block', width: '100%', textAlign: 'right',
                padding: '6px 12px', fontSize: 11, cursor: 'pointer',
                background: unit === opt.value ? 'var(--color-dur-segment-selected)' : 'transparent',
                border: 'none', color: opt.color, fontWeight: 600,
                fontFamily: 'inherit',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
