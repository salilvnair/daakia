import type { DuiSize, DuiRadius, DuiWidth } from './DuiTypes';
import { useDui, resolveBorderRadius, resolveWidth } from './DuiContext';
import { DUI_HEIGHT, DUI_ICON_SIZE, DUI_FONT_SIZE, DUI_PADDING_X, DUI_GAP, DUI_DEFAULT_RADIUS, DUI_SELECT_ITEM_PY } from './DuiTokens';

export interface SelectBaseConfig {
  height: string;
  fontSize: string;
  iconSize: number;
  borderRadius: string;
  paddingX: string;
  gap: string;
  width: string;
  color: string | undefined;
  itemPy: string;
}

export interface SelectContainerProps {
  width?: DuiWidth;
  borderRadius?: DuiRadius | number;
  color?: string;
}

/**
 * Category base for: SelectInputView, StyledDropdown, and any future picker component.
 * Falls back to DuiProvider values when no local prop is given.
 */
export function useSelectBase(
  sizeProp?: DuiSize,
  overrides: SelectContainerProps = {}
): SelectBaseConfig {
  const ctx = useDui();
  const s = sizeProp ?? ctx.size;
  const sizeRadius = DUI_DEFAULT_RADIUS[s];
  return {
    height:       `${DUI_HEIGHT.input[s]}px`,
    fontSize:     DUI_FONT_SIZE[s],
    iconSize:     DUI_ICON_SIZE[s],
    borderRadius: resolveBorderRadius(overrides.borderRadius ?? ctx.borderRadius, sizeRadius),
    paddingX:     DUI_PADDING_X[s],
    gap:          DUI_GAP[s],
    width:        resolveWidth(overrides.width ?? ctx.width),
    color:        overrides.color ?? ctx.color,
    itemPy:       DUI_SELECT_ITEM_PY[s],
  };
}
