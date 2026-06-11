import type { DuiSize } from './DuiTypes';
import { useDui } from './DuiContext';
import { DUI_FONT_SIZE, DUI_DEFAULT_RADIUS, DUI_ICON_SIZE } from './DuiTokens';

export interface DisplayBaseConfig {
  fontSize: string;
  iconSize: number;
  borderRadius: string;
  gap: string;
}

/**
 * Category base for: LabelView, EmptyStateView, PromptCardView, FeatureCategoryView,
 * StatusBadgeView, InfoPopup, and any future read-only display component.
 * Falls back to DuiProvider size when no local `size` prop is given.
 */
export function useDisplayBase(sizeProp?: DuiSize): DisplayBaseConfig {
  const { size } = useDui();
  const s = sizeProp ?? size;
  return {
    fontSize:     DUI_FONT_SIZE[s],
    iconSize:     DUI_ICON_SIZE[s],
    borderRadius: DUI_DEFAULT_RADIUS[s],
    gap:          s === 'sm' ? '4px' : s === 'md' ? '6px' : s === 'lg' ? '8px' : '10px',
  };
}
