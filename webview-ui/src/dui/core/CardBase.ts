import type { DuiSize, DuiRadius, DuiFontStyle } from './DuiTypes';
import { useDui, resolveBorderRadius } from './DuiContext';
import { DUI_FONT_SIZE, DUI_DEFAULT_RADIUS } from './DuiTokens';

export interface CardBaseConfig {
  fontSize: string;
  borderRadius: string;
  padding: string;
  gap: string;
  color: string | undefined;
  fontStyle: DuiFontStyle | undefined;
}

/** Local override props that any card component can accept. */
export interface CardContainerProps {
  borderRadius?: DuiRadius | number;
  color?: string;
  fontStyle?: DuiFontStyle;
}

/**
 * Category base for: PromptCardView, RequestCardView, EnvironmentCardView,
 * and any future card/list-item component.
 * Falls back to DuiProvider values when no local prop is given.
 */
export function useCardBase(
  sizeProp?: DuiSize,
  overrides: CardContainerProps = {}
): CardBaseConfig {
  const ctx = useDui();
  const s = sizeProp ?? ctx.size;
  const sizeRadius = DUI_DEFAULT_RADIUS[s];
  const padding = s === 'sm' ? '4px 8px' : s === 'md' ? '6px 10px' : s === 'lg' ? '8px 12px' : '10px 16px';
  const gap     = s === 'sm' ? '6px'    : s === 'md' ? '8px'      : s === 'lg' ? '10px'     : '12px';
  return {
    fontSize:     DUI_FONT_SIZE[s],
    borderRadius: resolveBorderRadius(overrides.borderRadius ?? ctx.borderRadius, sizeRadius),
    padding,
    gap,
    color:        overrides.color ?? ctx.color,
    fontStyle:    overrides.fontStyle ?? ctx.fontStyle,
  };
}
