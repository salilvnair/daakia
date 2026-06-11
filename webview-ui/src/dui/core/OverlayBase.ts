import type { DuiSize } from './DuiTypes';
import { useDui } from './DuiContext';
import { DUI_FONT_SIZE, DUI_DEFAULT_RADIUS } from './DuiTokens';

export interface OverlayBaseConfig {
  fontSize: string;
  borderRadius: string;
  headerFontSize: string;
  paddingX: string;
  paddingY: string;
}

/**
 * Category base for: ModalView, ToastView, TooltipView, PopoverView, DrawerView.
 * Overlays use slightly larger radius for a "floating" feel.
 * Falls back to DuiProvider size when no local `size` prop is given.
 */
export function useOverlayBase(sizeProp?: DuiSize): OverlayBaseConfig {
  const { size } = useDui();
  const s = sizeProp ?? size;
  const radiusMap = { sm: '6px', md: '8px', lg: '10px', xl: '12px' };
  return {
    fontSize:       DUI_FONT_SIZE[s],
    borderRadius:   radiusMap[s],
    headerFontSize: s === 'sm' ? '12px' : s === 'md' ? '13px' : s === 'lg' ? '14px' : '15px',
    paddingX:       s === 'sm' ? '12px' : s === 'md' ? '16px' : s === 'lg' ? '20px' : '24px',
    paddingY:       s === 'sm' ? '10px' : s === 'md' ? '12px' : s === 'lg' ? '16px' : '20px',
  };
}
