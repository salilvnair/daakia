import type { DuiSize } from './DuiTypes';
import { useDui } from './DuiContext';
import { DUI_TOGGLE, DUI_FONT_SIZE } from './DuiTokens';

export interface ToggleBaseConfig {
  trackW: number;
  trackH: number;
  thumb: number;
  fontSize: string;
  activeColor: string | undefined;
  color: string | undefined;
}

/** Local override props that any toggle/checkbox component can accept. */
export interface ToggleContainerProps {
  activeColor?: string;
  color?: string;
}

/**
 * Category base for: ToggleSwitchView, CheckboxView, RadioButtonView.
 * Falls back to DuiProvider values when no local prop is given.
 */
export function useToggleBase(
  sizeProp?: DuiSize,
  overrides: ToggleContainerProps = {}
): ToggleBaseConfig {
  const ctx = useDui();
  const s = sizeProp ?? ctx.size;
  return {
    ...DUI_TOGGLE[s],
    fontSize:    DUI_FONT_SIZE[s],
    activeColor: overrides.activeColor ?? ctx.activeColor,
    color:       overrides.color ?? ctx.color,
  };
}
