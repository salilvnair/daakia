import type { DuiSize, DuiRadius, DuiFontStyle } from './DuiTypes';
import { useDui, resolveBorderRadius } from './DuiContext';
import { DUI_FONT_SIZE, DUI_DEFAULT_RADIUS, DUI_ICON_SIZE } from './DuiTokens';

export interface DisplayBaseConfig {
  fontSize: string;
  iconSize: number;
  borderRadius: string;
  gap: string;
  color: string | undefined;
  fontStyle: DuiFontStyle | undefined;
}

/** Local override props that any display component can accept. */
export interface DisplayContainerProps {
  borderRadius?: DuiRadius | number;
  color?: string;
  fontStyle?: DuiFontStyle;
}

/**
 * Category base for: LabelView, EmptyStateView, PromptCardView, FeatureCategoryView,
 * StatusBadgeView, InfoPopup, and any future read-only display component.
 * Falls back to DuiProvider values when no local prop is given.
 */
export function useDisplayBase(
  sizeProp?: DuiSize,
  overrides: DisplayContainerProps = {}
): DisplayBaseConfig {
  const ctx = useDui();
  const s = sizeProp ?? ctx.size;
  const sizeRadius = DUI_DEFAULT_RADIUS[s];
  const gap = s === 'sm' ? '4px' : s === 'md' ? '6px' : s === 'lg' ? '8px' : '10px';
  return {
    fontSize:     DUI_FONT_SIZE[s],
    iconSize:     DUI_ICON_SIZE[s],
    borderRadius: resolveBorderRadius(overrides.borderRadius ?? ctx.borderRadius, sizeRadius),
    gap,
    color:        overrides.color ?? ctx.color,
    fontStyle:    overrides.fontStyle ?? ctx.fontStyle,
  };
}
