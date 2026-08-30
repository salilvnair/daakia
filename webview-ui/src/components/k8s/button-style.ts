/**
 * Shared button treatment for dk8s.
 */
/**
 * The soft-filled primary.
 *
 * A solid accent fill is the loudest thing on a dark panel, and these are
 * ordinary confirm buttons. Tinted background plus an accent border and label
 * still reads as the primary action in its row without shouting.
 */
export function softPrimary(accent: string, enabled = true): React.CSSProperties {
  return enabled
    ? {
        background: `color-mix(in srgb, ${accent} 16%, transparent)`,
        borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`,
        fontWeight: 600,
      }
    : {
        background: 'transparent',
        borderColor: 'var(--color-surface-border)',
      };
}
