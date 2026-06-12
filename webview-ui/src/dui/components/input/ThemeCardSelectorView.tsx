import { CheckIcon } from '../../../icons';
import './ThemeCardSelectorView.css';

export interface ThemeOption {
  value: string;
  label: string;
  description?: string;
  preview?: {
    bg: string;
    panel: string;
    accent: string;
    text: string;
  };
}

export interface ThemeCardSelectorViewProps {
  options: ThemeOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function ThemeCardSelectorView({
  options,
  value,
  onChange,
  className = '',
}: ThemeCardSelectorViewProps) {
  return (
    <div className={className} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
      {options.map(opt => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`dui_theme-card${isSelected ? ' dui_theme-card--selected' : ''}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              width: 110,
              padding: '10px',
              borderRadius: '8px',
              border: isSelected
                ? '2px solid var(--color-primary)'
                : '2px solid var(--color-surface-border)',
              background: isSelected
                ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)'
                : 'var(--color-surface)',
              cursor: 'pointer',
              textAlign: 'left',
              position: 'relative',
            }}
          >
            {/* Preview swatch */}
            {opt.preview && (
              <div style={{
                width: '100%', height: 48,
                borderRadius: '5px',
                background: opt.preview.bg,
                border: '1px solid rgba(0,0,0,0.1)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
                padding: '4px',
              }}>
                <div style={{ width: '60%', height: 5, borderRadius: 2, background: opt.preview.panel }} />
                <div style={{ width: '40%', height: 3, borderRadius: 2, background: opt.preview.text, opacity: 0.5 }} />
                <div style={{ width: '30%', height: 5, borderRadius: 2, background: opt.preview.accent, marginTop: 3 }} />
              </div>
            )}
            {/* Label */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{
                fontSize: '11px',
                fontWeight: isSelected ? 600 : 400,
                color: isSelected ? 'var(--color-primary)' : 'var(--color-text-primary)',
              }}>
                {opt.label}
              </span>
              {isSelected && (
                <span style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: 'var(--color-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <CheckIcon size={9} style={{ color: 'white', strokeWidth: 3 }} />
                </span>
              )}
            </div>
            {opt.description && (
              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', lineHeight: 1.3 }}>
                {opt.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
