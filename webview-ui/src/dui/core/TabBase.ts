import type { DuiSize, DuiRadius, DuiWidth, DuiFontStyle } from './DuiTypes';
import { useDui, resolveBorderRadius, resolveWidth } from './DuiContext';
import { DUI_HEIGHT, DUI_FONT_SIZE, DUI_GAP, DUI_DEFAULT_RADIUS } from './DuiTokens';

export interface TabBaseConfig {
  height: string;
  fontSize: string;
  gap: string;
  borderRadius: string;
  paddingX: string;
  width: string;
  color: string | undefined;
  activeColor: string | undefined;
  fontStyle: DuiFontStyle | undefined;
}

/** Local override props that any tab component can accept. */
export interface TabContainerProps {
  width?: DuiWidth;
  borderRadius?: DuiRadius | number;
  color?: string;
  activeColor?: string;
  fontStyle?: DuiFontStyle;
}

/**
 * Category base for: PillTabsView, SegmentTabsView, TabView, and any future tab/segment component.
 * Falls back to DuiProvider values when no local prop is given.
 */
export function useTabBase(
  sizeProp?: DuiSize,
  overrides: TabContainerProps = {}
): TabBaseConfig {
  const ctx = useDui();
  const s = sizeProp ?? ctx.size;
  const sizeRadius = DUI_DEFAULT_RADIUS[s];
  const paddingX = s === 'sm' ? '10px' : s === 'md' ? '12px' : s === 'lg' ? '14px' : '18px';
  return {
    height:       `${DUI_HEIGHT.tab[s]}px`,
    fontSize:     DUI_FONT_SIZE[s],
    gap:          DUI_GAP[s],
    borderRadius: resolveBorderRadius(overrides.borderRadius ?? ctx.borderRadius, sizeRadius),
    paddingX,
    width:        resolveWidth(overrides.width ?? ctx.width),
    color:        overrides.color ?? ctx.color,
    activeColor:  overrides.activeColor ?? ctx.activeColor,
    fontStyle:    overrides.fontStyle ?? ctx.fontStyle,
  };
}
