import type { DuiSize, DuiRadius, DuiFontStyle } from './DuiTypes';
import { useDui, resolveBorderRadius } from './DuiContext';
import { DUI_HEIGHT, DUI_ICON_SIZE, DUI_FONT_SIZE, DUI_GAP, DUI_DEFAULT_RADIUS } from './DuiTokens';

export interface NavBaseConfig {
  /** Nav item row height — intentionally taller than inputs for click comfort */
  itemHeight: string;
  fontSize: string;
  iconSize: number;
  borderRadius: string;
  gap: string;
  paddingX: string;
  color: string | undefined;
  activeColor: string | undefined;
  fontStyle: DuiFontStyle | undefined;
}

/** Local override props that any nav component can accept. */
export interface NavContainerProps {
  borderRadius?: DuiRadius | number;
  color?: string;
  activeColor?: string;
  fontStyle?: DuiFontStyle;
}

/**
 * Category base for: SideNavView, SettingsNavView, BreadcrumbView, TabBarView,
 * and any future navigation component.
 * Falls back to DuiProvider values when no local prop is given.
 */
export function useNavBase(
  sizeProp?: DuiSize,
  overrides: NavContainerProps = {}
): NavBaseConfig {
  const ctx = useDui();
  const s = sizeProp ?? ctx.size;
  const sizeRadius = DUI_DEFAULT_RADIUS[s];
  const paddingX = s === 'sm' ? '8px' : s === 'md' ? '10px' : s === 'lg' ? '12px' : '16px';
  return {
    itemHeight:  `${DUI_HEIGHT.nav[s]}px`,
    fontSize:    DUI_FONT_SIZE[s],
    iconSize:    DUI_ICON_SIZE[s],
    borderRadius: resolveBorderRadius(overrides.borderRadius ?? ctx.borderRadius, sizeRadius),
    gap:          DUI_GAP[s],
    paddingX,
    color:       overrides.color ?? ctx.color,
    activeColor: overrides.activeColor ?? ctx.activeColor,
    fontStyle:   overrides.fontStyle ?? ctx.fontStyle,
  };
}
