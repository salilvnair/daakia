import type { DuiSize, DuiRadius, DuiWidth } from './DuiTypes';

// ─── Token Tables ─────────────────────────────────────────────────────────────
// Single source of truth for every size-related value in the DUI system.
// Think of this file as the "parent class" — all DUI components inherit their
// visual dimensions from here.  No component may define its own local size map.

/** Heights (px) per size × category */
export const DUI_HEIGHT = {
  /** Standard form controls: text input, select, duration, search, highlighted input */
  input:  { xxs: 16, xs: 20, sm: 24, md: 28, lg: 36, xl: 40, xxl: 48, xxxl: 56 },
  /** Push buttons (primary, secondary, ghost, danger) */
  button: { xxs: 16, xs: 20, sm: 24, md: 28, lg: 36, xl: 40, xxl: 48, xxxl: 56 },
  /** Pill tabs, segment controls */
  tab:    { xxs: 16, xs: 20, sm: 24, md: 28, lg: 36, xl: 40, xxl: 48, xxxl: 56 },
  /** Sidebar nav items, settings nav links */
  nav:    { xxs: 20, xs: 24, sm: 28, md: 32, lg: 36, xl: 44, xxl: 52, xxxl: 60 },
  /** Context-menu items, dropdown options, sub-menu rows */
  menu:   { xxs: 14, xs: 18, sm: 22, md: 26, lg: 30, xl: 36, xxl: 42, xxxl: 48 },
  /** Table / KV-table rows */
  table:  { xxs: 18, xs: 22, sm: 26, md: 30, lg: 36, xl: 40, xxl: 46, xxxl: 54 },
  /** Card container min-height (loosely applied) */
  card:   { xxs: 28, xs: 36, sm: 48, md: 64, lg: 80, xl: 96, xxl: 112, xxxl: 128 },
} as const satisfies Record<string, Record<DuiSize, number>>;

/** Chip / badge heights */
export const DUI_CHIP_HEIGHT: Record<DuiSize, number> = {
  xxs: 10, xs: 12, sm: 16, md: 20, lg: 24, xl: 28, xxl: 32, xxxl: 38,
};

/** Toggle track dimensions (trackW, trackH, thumb) */
export const DUI_TOGGLE: Record<DuiSize, { trackW: number; trackH: number; thumb: number }> = {
  xxs:  { trackW: 18, trackH: 10, thumb: 8  },
  xs:   { trackW: 24, trackH: 14, thumb: 10 },
  sm:   { trackW: 28, trackH: 16, thumb: 12 },
  md:   { trackW: 36, trackH: 20, thumb: 16 },
  lg:   { trackW: 44, trackH: 24, thumb: 20 },
  xl:   { trackW: 52, trackH: 28, thumb: 24 },
  xxl:  { trackW: 60, trackH: 32, thumb: 28 },
  xxxl: { trackW: 68, trackH: 36, thumb: 32 },
};

/**
 * Checkbox box and inner icon sizes (px).
 * Centralised here so components never define ad-hoc local maps.
 */
export const DUI_CHECKBOX: Record<DuiSize, { box: number; icon: number }> = {
  xxs:  { box: 10, icon: 6  },
  xs:   { box: 12, icon: 8  },
  sm:   { box: 14, icon: 9  },
  md:   { box: 16, icon: 11 },
  lg:   { box: 18, icon: 13 },
  xl:   { box: 20, icon: 15 },
  xxl:  { box: 22, icon: 17 },
  xxxl: { box: 26, icon: 20 },
};

/** Icon sizes (px) — used for icons inside buttons, inputs, menus */
export const DUI_ICON_SIZE: Record<DuiSize, number> = {
  xxs: 8, xs: 10, sm: 11, md: 12, lg: 14, xl: 16, xxl: 18, xxxl: 20,
};

/** Font sizes (px) */
export const DUI_FONT_SIZE: Record<DuiSize, string> = {
  xxs: '8px', xs: '9px', sm: '10px', md: '11px', lg: '12px', xl: '13px', xxl: '14px', xxxl: '16px',
};

/** Vertical padding (px) for dropdown / select option rows */
export const DUI_SELECT_ITEM_PY: Record<DuiSize, string> = {
  xxs: '2px', xs: '3px', sm: '4px', md: '5px', lg: '7px', xl: '9px', xxl: '11px', xxxl: '14px',
};

/** Editor (Monaco) font sizes (px) — larger than DUI_FONT_SIZE since code is harder to read at label sizes */
export const DUI_EDITOR_FONT_SIZE: Record<DuiSize, number> = {
  xxs: 10, xs: 11, sm: 11, md: 12, lg: 13, xl: 14, xxl: 15, xxxl: 16,
};

/** Horizontal padding (px) */
export const DUI_PADDING_X: Record<DuiSize, string> = {
  xxs: '4px', xs: '6px', sm: '8px', md: '10px', lg: '12px', xl: '16px', xxl: '20px', xxxl: '24px',
};

/** Gap between icon and text inside a component (px) */
export const DUI_GAP: Record<DuiSize, string> = {
  xxs: '2px', xs: '3px', sm: '4px', md: '5px', lg: '6px', xl: '8px', xxl: '10px', xxxl: '12px',
};

/** Border-radius presets (px) */
export const DUI_RADIUS_MAP: Record<DuiRadius, string> = {
  none: '0px',
  sm:   '3px',
  md:   '4px',
  lg:   '6px',
  full: '999px',
};

/** Default border-radius per size */
export const DUI_DEFAULT_RADIUS: Record<DuiSize, string> = {
  xxs:  '2px',
  xs:   '3px',   // DUI_RADIUS_MAP.sm
  sm:   '4px',   // DUI_RADIUS_MAP.md
  md:   '4px',   // DUI_RADIUS_MAP.md
  lg:   '6px',   // DUI_RADIUS_MAP.lg
  xl:   '6px',   // DUI_RADIUS_MAP.lg
  xxl:  '8px',
  xxxl: '10px',
};

/** Width presets for DUI components. */
export const DUI_WIDTH_MAP: Record<DuiWidth, string> = {
  sm:         '80px',
  md:         '120px',
  default:    'auto',
  lg:         '200px',
  fullWidth:  '100%',
  maxContent: 'max-content',
  fw:         '100%',
  mx:         'max-content',
};
