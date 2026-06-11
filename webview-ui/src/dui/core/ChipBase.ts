import type { DuiSize } from './DuiTypes';
import { useDui } from './DuiContext';
import { DUI_CHIP_HEIGHT } from './DuiTokens';

export interface ChipBaseConfig {
  height: string;
  fontSize: string;
  paddingX: string;
}

/**
 * Category base for: ChipView, StatusBadgeView, CountBadgeView.
 * Chips are compact pill labels — much shorter than inputs/buttons.
 * Falls back to DuiProvider size when no local `size` prop is given.
 */
export function useChipBase(sizeProp?: DuiSize): ChipBaseConfig {
  const { size } = useDui();
  const s = sizeProp ?? size;
  const h = DUI_CHIP_HEIGHT[s];
  return {
    height:   `${h}px`,
    fontSize: s === 'sm' ? '9px' : s === 'md' ? '10px' : s === 'lg' ? '11px' : '12px',
    paddingX: s === 'sm' ? '5px' : s === 'md' ? '7px' : s === 'lg' ? '9px' : '11px',
  };
}
