import type { CSSProperties } from 'react';

export interface YamlKeyChipProps {
  /** The YAML key name, e.g. "brand.primary" or "component_button.primary_bg" */
  yamlKey: string;
  /** Accent color for the badge (CSS var or raw). Defaults to --color-primary. */
  color?: string;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * Monospace badge showing a YAML theme key name.
 * Used in LiveColorCustomizer to let users know which YAML key controls each color.
 */
export function YamlKeyChip({
  yamlKey,
  color,
  onClick,
  className = '',
  style,
}: YamlKeyChipProps) {
  const accent = color || 'var(--color-primary)';
  return (
    <span
      className={`${onClick ? 'cursor-pointer' : ''} select-none ${className}`}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: '16px',
        padding: '0 6px',
        borderRadius: '4px',
        fontSize: '10px',
        fontFamily: 'monospace',
        fontWeight: 600,
        letterSpacing: '0.01em',
        color: accent,
        background: `color-mix(in srgb, ${accent} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 22%, transparent)`,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        transition: 'background 100ms',
        ...style,
      }}
    >
      {yamlKey}
    </span>
  );
}
