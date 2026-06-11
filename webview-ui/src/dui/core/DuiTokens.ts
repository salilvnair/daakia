import type { DuiSize, DuiRadius } from './DuiTypes';

// ─── Token Tables ─────────────────────────────────────────────────────────────
// Single source of truth for every size-related value in the DUI system.
// All component categories read from here — never define ad-hoc px values locally.

/** Heights (px) per size × category */
export const DUI_HEIGHT = {
  /** Standard form controls: text input, select, duration, search, highlighted input */
  input:  { sm: 24, md: 28, lg: 32, xl: 40 },
  /** Push buttons (primary, secondary, ghost, danger) */
  button: { sm: 24, md: 28, lg: 32, xl: 40 },
  /** Pill tabs, segment controls */
  tab:    { sm: 24, md: 28, lg: 32, xl: 40 },
  /** Sidebar nav items, settings nav links */
  nav:    { sm: 28, md: 32, lg: 36, xl: 44 },
  /** Context-menu items, dropdown options, sub-menu rows */
  menu:   { sm: 22, md: 26, lg: 30, xl: 36 },
  /** Table / KV-table rows */
  table:  { sm: 26, md: 30, lg: 34, xl: 40 },
  /** Card container min-height (loosely applied) */
  card:   { sm: 48, md: 64, lg: 80, xl: 96 },
} as const satisfies Record<string, Record<DuiSize, number>>;

/** Chip / badge heights */
export const DUI_CHIP_HEIGHT: Record<DuiSize, number> = { sm: 16, md: 20, lg: 24, xl: 28 };

/** Toggle track dimensions (trackW, trackH, thumb) */
export const DUI_TOGGLE: Record<DuiSize, { trackW: number; trackH: number; thumb: number }> = {
  sm: { trackW: 28, trackH: 16, thumb: 12 },
  md: { trackW: 36, trackH: 20, thumb: 16 },
  lg: { trackW: 44, trackH: 24, thumb: 20 },
  xl: { trackW: 52, trackH: 28, thumb: 24 },
};

/** Icon sizes (px) — used for icons inside buttons, inputs, menus */
export const DUI_ICON_SIZE: Record<DuiSize, number> = { sm: 11, md: 12, lg: 14, xl: 16 };

/** Font sizes (px) */
export const DUI_FONT_SIZE: Record<DuiSize, string> = { sm: '10px', md: '11px', lg: '12px', xl: '13px' };

/** Horizontal padding (px) */
export const DUI_PADDING_X: Record<DuiSize, string> = { sm: '8px', md: '10px', lg: '12px', xl: '16px' };

/** Gap between icon and text inside a component (px) */
export const DUI_GAP: Record<DuiSize, string> = { sm: '4px', md: '5px', lg: '6px', xl: '8px' };

/** Border-radius presets (px) */
export const DUI_RADIUS_MAP: Record<DuiRadius, string> = {
  none: '0px',
  sm:   '3px',
  md:   '4px',
  lg:   '6px',
  full: '999px',
};

/** Default border-radius per size (maps to DUI_RADIUS_MAP entries) */
export const DUI_DEFAULT_RADIUS: Record<DuiSize, string> = {
  sm: DUI_RADIUS_MAP.md,   // 4px
  md: DUI_RADIUS_MAP.md,   // 4px
  lg: DUI_RADIUS_MAP.lg,   // 6px
  xl: DUI_RADIUS_MAP.lg,   // 6px
};
