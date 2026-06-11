import type { DuiSize } from './DuiTypes';
import { useDui } from './DuiContext';
import { DUI_HEIGHT, DUI_FONT_SIZE, DUI_GAP, DUI_DEFAULT_RADIUS } from './DuiTokens';

export interface TabBaseConfig {
  height: string;
  fontSize: string;
  gap: string;
  borderRadius: string;
  paddingX: string;
}

/**
 * Category base for: PillTabsView, SegmentTabsView, and any future tab/segment component.
 * Falls back to DuiProvider size when no local `size` prop is given.
 */
export function useTabBase(sizeProp?: DuiSize): TabBaseConfig {
  const { size } = useDui();
  const s = sizeProp ?? size;
  return {
    height:       `${DUI_HEIGHT.tab[s]}px`,
    fontSize:     DUI_FONT_SIZE[s],
    gap:          DUI_GAP[s],
    borderRadius: DUI_DEFAULT_RADIUS[s],
    paddingX:     s === 'sm' ? '10px' : s === 'md' ? '12px' : s === 'lg' ? '14px' : '18px',
  };
}
