import { CheckIcon } from '../../../icons';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
  accentColor?: string;
}

export function Checkbox({ checked, onChange, label, className = '', accentColor }: CheckboxProps) {
  const color = accentColor || 'var(--color-primary)';
  return (
    <div
      className={`flex items-center gap-2.5 cursor-pointer select-none group ${className}`}
      onClick={() => onChange(!checked)}
    >
      <div
        role="checkbox"
        aria-checked={checked}
        style={checked ? { backgroundColor: color, borderColor: color, boxShadow: `0 0 0 2px color-mix(in srgb, ${color} 15%, transparent)` } : undefined}
        className={`w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center transition-all duration-150 cursor-pointer shrink-0 ${
          checked
            ? ''
            : 'bg-transparent border-[var(--color-input-border)] group-hover:border-[var(--color-primary)] group-hover:shadow-[0_0_0_2px_rgba(99,102,241,0.08)]'
        }`}
      >
        {checked && (
          <CheckIcon size={11} stroke="white" strokeWidth={3.5} />
        )}
      </div>
      {label && (
        <span className="text-[12.5px] text-[var(--color-text-primary)]">{label}</span>
      )}
    </div>
  );
}
