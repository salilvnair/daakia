import type { DuiSize } from './DuiTypes';
import { useDui } from './DuiContext';
import { DUI_FONT_SIZE, DUI_DEFAULT_RADIUS } from './DuiTokens';

export interface CardBaseConfig {
  fontSize: string;
  borderRadius: string;
  padding: string;
  gap: string;
}

/**
 * Category base for: PromptCardView, RequestCardView, EnvironmentCardView,
 * and any future card/list-item component.
 * Falls back to DuiProvider size when no local `size` prop is given.
 */
export function useCardBase(sizeProp?: DuiSize): CardBaseConfig {
  const { size } = useDui();
  const s = sizeProp ?? size;
  return {
    fontSize:     DUI_FONT_SIZE[s],
    borderRadius: DUI_DEFAULT_RADIUS[s],
    padding:      s === 'sm' ? '4px 8px' : s === 'md' ? '6px 10px' : s === 'lg' ? '8px 12px' : '10px 16px',
    gap:          s === 'sm' ? '6px' : s === 'md' ? '8px' : s === 'lg' ? '10px' : '12px',
  };
}
