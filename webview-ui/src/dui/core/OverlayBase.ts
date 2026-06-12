import type { DuiSize, DuiRadius } from './DuiTypes';
import { useDui, resolveBorderRadius } from './DuiContext';
import { DUI_FONT_SIZE } from './DuiTokens';

export interface OverlayBaseConfig {
  fontSize: string;
  borderRadius: string;
  headerFontSize: string;
  paddingX: string;
  paddingY: string;
  color: string | undefined;
}

/** Local override props that any overlay component can accept. */
export interface OverlayContainerProps {
  borderRadius?: DuiRadius | number;
  color?: string;
}

/**
 * Category base for: ModalView, ToastView, TooltipView, PopoverView, DrawerView.
 * Overlays use slightly larger radius for a "floating" feel.
 * Falls back to DuiProvider values when no local prop is given.
 */
export function useOverlayBase(
  sizeProp?: DuiSize,
  overrides: OverlayContainerProps = {}
): OverlayBaseConfig {
  const ctx = useDui();
  const s = sizeProp ?? ctx.size;
  const radiusMap: Record<DuiSize, string> = { sm: '6px', md: '8px', lg: '10px', xl: '12px' };
  return {
    fontSize:       DUI_FONT_SIZE[s],
    borderRadius:   resolveBorderRadius(overrides.borderRadius ?? ctx.borderRadius, radiusMap[s]),
    headerFontSize: s === 'sm' ? '12px' : s === 'md' ? '13px' : s === 'lg' ? '14px' : '15px',
    paddingX:       s === 'sm' ? '12px' : s === 'md' ? '16px' : s === 'lg' ? '20px' : '24px',
    paddingY:       s === 'sm' ? '10px' : s === 'md' ? '12px' : s === 'lg' ? '16px' : '20px',
    color:          overrides.color ?? ctx.color,
  };
}
