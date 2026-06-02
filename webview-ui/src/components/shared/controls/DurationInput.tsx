import { useState, useCallback, useRef, useEffect } from 'react';

export type DurationUnit = 'ms' | 's' | 'm' | 'hr';

const UNIT_OPTIONS: { value: DurationUnit; label: string; color: string }[] = [
  { value: 'ms', label: 'ms', color: 'var(--color-warning)' },
  { value: 's', label: 's', color: 'var(--color-success)' },
  { value: 'm', label: 'm', color: 'var(--color-info)' },
  { value: 'hr', label: 'hr', color: 'var(--color-error)' },
];

const UNIT_TO_MS: Record<DurationUnit, number> = {
  ms: 1,
  s: 1000,
  m: 60000,
  hr: 3600000,
};

interface DurationInputProps {
  /** Value in milliseconds (always stored as ms internally) */
  value: number;
  /** Called with the new value in milliseconds */
  onChange: (ms: number) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Accent color for focus state (CSS variable or value) */
  accentColor?: string;
  /** Additional className */
  className?: string;
}

/**
 * DurationInput — a number input with a clickable unit suffix dropdown.
 * Clean merged appearance: [  0   ms ▾ ]
 */
export function DurationInput({ value, onChange, placeholder = '0', accentColor, className = '' }: DurationInputProps) {
  const [unit, setUnit] = useState<DurationUnit>(() => {
    if (value === 0) return 'ms';
    if (value >= 3600000 && value % 3600000 === 0) return 'hr';
    if (value >= 60000 && value % 60000 === 0) return 'm';
    if (value >= 1000 && value % 1000 === 0) return 's';
    return 'ms';
  });
  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Display value converted to current unit
  const displayValue = value === 0 ? '' : String(Math.round(value / UNIT_TO_MS[unit]));

  const handleValueChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '' || raw === '0') {
      onChange(0);
      return;
    }
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 0) {
      onChange(num * UNIT_TO_MS[unit]);
    }
  }, [onChange, unit]);

  const handleUnitChange = (newUnit: DurationUnit) => {
    setUnit(newUnit);
    setShowPopup(false);
    // No value conversion needed — we just re-display the same ms value in the new unit
  };

  // Close popup on outside click
  useEffect(() => {
    if (!showPopup) return;
    const handleClick = (e: MouseEvent) => {
      if (!popupRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        setShowPopup(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPopup]);

  // Get current unit color
  const currentUnitColor = UNIT_OPTIONS.find(o => o.value === unit)?.color || 'var(--color-warning)';

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <input
        type="number"
        min="0"
        value={displayValue}
        onChange={handleValueChange}
        placeholder={placeholder}
        className="w-[100px] h-[32px] px-2.5 pr-[38px] text-[12px] font-mono rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-warning)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        ref={btnRef}
        type="button"
        onClick={() => setShowPopup(!showPopup)}
        className="absolute right-1.5 text-[11px] font-semibold cursor-pointer hover:opacity-80 px-1 py-0.5 rounded transition-colors"
        style={{ color: currentUnitColor }}
      >
        {unit}
      </button>

      {/* Unit dropdown popup */}
      {showPopup && (
        <div
          ref={popupRef}
          className="absolute top-full right-0 mt-1 z-50 min-w-[60px] rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden"
        >
          {UNIT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleUnitChange(opt.value)}
              className={`w-full px-3 py-1.5 text-[11px] text-right cursor-pointer transition-colors ${
                unit === opt.value
                  ? 'bg-[rgba(255,255,255,0.08)]'
                  : 'hover:bg-[rgba(255,255,255,0.05)]'
              }`}
              style={{ color: opt.color }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
