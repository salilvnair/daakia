import type { DuiSize, DuiRadius, DuiFontStyle } from './DuiTypes';
import { useDui, resolveBorderRadius } from './DuiContext';
import { DUI_CHIP_HEIGHT, DUI_RADIUS_MAP } from './DuiTokens';

export interface ChipBaseConfig {
  height: string;
  fontSize: string;
  paddingX: string;
  borderRadius: string;
  color: string | undefined;
  fontStyle: DuiFontStyle | undefined;
}

/** Local override props that any chip/badge component can accept. */
export interface ChipContainerProps {
  borderRadius?: DuiRadius | number;
  color?: string;
  fontStyle?: DuiFontStyle;
}

/**
 * Category base for: ChipView, StatusBadgeView, CountBadgeView.
 * Chips always default to 'full' (pill) radius — context borderRadius overrides that.
 * Falls back to DuiProvider values when no local prop is given.
 */
export function useChipBase(
  sizeProp?: DuiSize,
  overrides: ChipContainerProps = {}
): ChipBaseConfig {
  const ctx = useDui();
  const s = sizeProp ?? ctx.size;
  const h = DUI_CHIP_HEIGHT[s];
  return {
    height:       `${h}px`,
    fontSize:     s === 'sm' ? '9px' : s === 'md' ? '10px' : s === 'lg' ? '11px' : '12px',
    paddingX:     s === 'sm' ? '5px' : s === 'md' ? '7px'  : s === 'lg' ? '9px'  : '11px',
    borderRadius: resolveBorderRadius(overrides.borderRadius ?? ctx.borderRadius, DUI_RADIUS_MAP.full),
    color:        overrides.color ?? ctx.color,
    fontStyle:    overrides.fontStyle ?? ctx.fontStyle,
  };
}
