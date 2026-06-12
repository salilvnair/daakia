/**
 * Eight canonical sizes for all DUI components.
 * DuiProvider is the "parent" — every component inherits from it unless overridden.
 *
 *  xxs  → 16 px   (micro / dense badges)
 *  xs   → 20 px   (compact chips / inline controls)
 *  sm   → 24 px   (small toolbar buttons / table rows)
 *  md   → 28 px   (default / form inputs)            ← DuiProvider default
 *  lg   → 32 px   (comfortable / settings panels)
 *  xl   → 40 px   (prominent CTA / hero buttons)
 *  xxl  → 48 px   (large display / cards)
 *  xxxl → 56 px   (extra-large headings / splash controls)
 */
export type DuiSize = 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'xxxl';

/** Named radius presets — components may also accept a raw number. */
export type DuiRadius = 'none' | 'sm' | 'md' | 'lg' | 'full';

/** Width presets for DUI components. */
export type DuiWidth = 'sm' | 'md' | 'default' | 'lg' | 'fullWidth' | 'maxContent';

/** Font style override. */
export type DuiFontStyle = 'normal' | 'italic';

/** Global DUI context shape. */
export interface DuiConfig {
  /** Default size inherited by all DUI components when no local size prop is passed. */
  size: DuiSize;
  /** Default width preset. Components that support width read this as their default. */
  width?: DuiWidth;
  /** Border-radius preset or raw px number. Overrides the size-derived default. */
  borderRadius?: DuiRadius | number;
  /** Text color override (CSS var or value, e.g. `var(--color-text-primary)`). */
  color?: string;
  /** Primary/accent color used for interactive highlights (buttons, selections). */
  defaultColor?: string;
  /** Color for active / selected states (tabs, nav items, toggles). */
  activeColor?: string;
  /** Font style applied to all text within the DUI subtree. */
  fontStyle?: DuiFontStyle;
}
