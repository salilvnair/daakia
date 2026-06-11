import type { DuiSize } from './DuiTypes';
import { useDui } from './DuiContext';
import { DUI_HEIGHT, DUI_ICON_SIZE, DUI_FONT_SIZE, DUI_PADDING_X, DUI_GAP, DUI_DEFAULT_RADIUS } from './DuiTokens';

export interface InputBaseConfig {
  height: string;
  fontSize: string;
  iconSize: number;
  borderRadius: string;
  paddingX: string;
  gap: string;
}

/**
 * Category base for: TextInputView, SearchInputView, DurationInputView,
 * HighlightedInputView, NumberInputView, TextAreaView, and any future text-input component.
 * Falls back to DuiProvider size when no local `size` prop is given.
 */
export function useInputBase(sizeProp?: DuiSize): InputBaseConfig {
  const { size } = useDui();
  const s = sizeProp ?? size;
  return {
    height:       `${DUI_HEIGHT.input[s]}px`,
    fontSize:     DUI_FONT_SIZE[s],
    iconSize:     DUI_ICON_SIZE[s],
    borderRadius: DUI_DEFAULT_RADIUS[s],
    paddingX:     DUI_PADDING_X[s],
    gap:          DUI_GAP[s],
  };
}
