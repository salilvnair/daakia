import type { DuiSize, DuiRadius, DuiWidth, DuiFontStyle } from './DuiTypes';
import { useDui, resolveBorderRadius, resolveWidth } from './DuiContext';
import { DUI_HEIGHT, DUI_ICON_SIZE, DUI_FONT_SIZE, DUI_PADDING_X, DUI_GAP, DUI_DEFAULT_RADIUS } from './DuiTokens';

export interface InputBaseConfig {
  height: string;
  fontSize: string;
  iconSize: number;
  borderRadius: string;
  paddingX: string;
  gap: string;
  width: string;
  color: string | undefined;
  fontStyle: DuiFontStyle | undefined;
}

/** Local override props that any input component can accept. */
export interface InputContainerProps {
  width?: DuiWidth;
  borderRadius?: DuiRadius | number;
  color?: string;
  fontStyle?: DuiFontStyle;
}

/**
 * Category base for: TextInputView, SearchInputView, DurationInputView,
 * HighlightedInputView, NumberInputView, TextAreaView, and any future text-input component.
 * Falls back to DuiProvider values when no local prop is given.
 */
export function useInputBase(
  sizeProp?: DuiSize,
  overrides: InputContainerProps = {}
): InputBaseConfig {
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
    fontStyle:    overrides.fontStyle ?? ctx.fontStyle,
  };
}
