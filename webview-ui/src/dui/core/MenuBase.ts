import type { DuiSize, DuiRadius, DuiFontStyle } from './DuiTypes';
import { useDui, resolveBorderRadius } from './DuiContext';
import { DUI_HEIGHT, DUI_ICON_SIZE, DUI_FONT_SIZE, DUI_DEFAULT_RADIUS } from './DuiTokens';

export interface MenuBaseConfig {
  itemHeight: string;
  fontSize: string;
  iconSize: number;
  borderRadius: string;
  paddingX: string;
  gap: string;
  color: string | undefined;
  fontStyle: DuiFontStyle | undefined;
}

/** Local override props that any menu component can accept. */
export interface MenuContainerProps {
  borderRadius?: DuiRadius | number;
  color?: string;
  fontStyle?: DuiFontStyle;
}

/**
 * Category base for: StyledDropdown options, ContextMenuView items, submenu rows,
 * SelectInputView options, and any future menu/dropdown component.
 * Falls back to DuiProvider values when no local prop is given.
 */
export function useMenuBase(
  sizeProp?: DuiSize,
  overrides: MenuContainerProps = {}
): MenuBaseConfig {
  const ctx = useDui();
  const s = sizeProp ?? ctx.size;
  const sizeRadius = DUI_DEFAULT_RADIUS[s];
  const paddingX = s === 'sm' ? '8px'  : s === 'md' ? '10px' : s === 'lg' ? '12px' : '14px';
  const gap      = s === 'sm' ? '5px'  : s === 'md' ? '6px'  : s === 'lg' ? '7px'  : '8px';
  return {
    itemHeight:   `${DUI_HEIGHT.menu[s]}px`,
    fontSize:     DUI_FONT_SIZE[s],
    iconSize:     DUI_ICON_SIZE[s],
    borderRadius: resolveBorderRadius(overrides.borderRadius ?? ctx.borderRadius, sizeRadius),
    paddingX,
    gap,
    color:        overrides.color ?? ctx.color,
    fontStyle:    overrides.fontStyle ?? ctx.fontStyle,
  };
}
