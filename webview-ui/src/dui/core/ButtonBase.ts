import type { DuiSize, DuiRadius, DuiWidth, DuiFontStyle } from './DuiTypes';
import { useDui, resolveBorderRadius, resolveWidth } from './DuiContext';
import { DUI_HEIGHT, DUI_ICON_SIZE, DUI_FONT_SIZE, DUI_PADDING_X, DUI_GAP, DUI_DEFAULT_RADIUS } from './DuiTokens';

export interface ButtonBaseConfig {
  height: string;
  fontSize: string;
  iconSize: number;
  borderRadius: string;
  paddingX: string;
  gap: string;
  width: string;
  color: string | undefined;
  defaultColor: string | undefined;
  activeColor: string | undefined;
  fontStyle: DuiFontStyle | undefined;
}

/** Local override props that any button component can accept. */
export interface ButtonContainerProps {
  width?: DuiWidth;
  borderRadius?: DuiRadius | number;
  color?: string;
  defaultColor?: string;
  activeColor?: string;
  fontStyle?: DuiFontStyle;
}

/**
 * Category base for: ButtonView, IconButtonView, SplitButtonView, AIButtonView, DropDownButtonView.
 * Falls back to DuiProvider values when no local prop is given.
 */
export function useButtonBase(
  sizeProp?: DuiSize,
  overrides: ButtonContainerProps = {}
): ButtonBaseConfig {
  const ctx = useDui();
  const s = sizeProp ?? ctx.size;
  const sizeRadius = DUI_DEFAULT_RADIUS[s];
  return {
    height:       `${DUI_HEIGHT.button[s]}px`,
    fontSize:     DUI_FONT_SIZE[s],
    iconSize:     DUI_ICON_SIZE[s],
    borderRadius: resolveBorderRadius(overrides.borderRadius ?? ctx.borderRadius, sizeRadius),
    paddingX:     DUI_PADDING_X[s],
    gap:          DUI_GAP[s],
    width:        resolveWidth(overrides.width ?? ctx.width),
    color:        overrides.color ?? ctx.color,
    defaultColor: overrides.defaultColor ?? ctx.defaultColor,
    activeColor:  overrides.activeColor ?? ctx.activeColor,
    fontStyle:    overrides.fontStyle ?? ctx.fontStyle,
  };
}
