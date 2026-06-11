import type { DuiSize } from './DuiTypes';
import { useDui } from './DuiContext';
import { DUI_TOGGLE, DUI_FONT_SIZE } from './DuiTokens';

export interface ToggleBaseConfig {
  trackW: number;
  trackH: number;
  thumb: number;
  fontSize: string;
}

/**
 * Category base for: ToggleSwitchView, CheckboxView, RadioButtonView.
 * Falls back to DuiProvider size when no local `size` prop is given.
 */
export function useToggleBase(sizeProp?: DuiSize): ToggleBaseConfig {
  const { size } = useDui();
  const s = sizeProp ?? size;
  return {
    ...DUI_TOGGLE[s],
    fontSize: DUI_FONT_SIZE[s],
  };
}
