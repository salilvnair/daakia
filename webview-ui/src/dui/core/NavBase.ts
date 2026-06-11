import type { DuiSize } from './DuiTypes';
import { useDui } from './DuiContext';
import { DUI_HEIGHT, DUI_ICON_SIZE, DUI_FONT_SIZE, DUI_GAP, DUI_DEFAULT_RADIUS } from './DuiTokens';

export interface NavBaseConfig {
  /** Nav item row height — intentionally taller than inputs for click comfort */
  itemHeight: string;
  fontSize: string;
  iconSize: number;
  borderRadius: string;
  gap: string;
  /** Horizontal padding for icon+label inside nav row */
  paddingX: string;
}

/**
 * Category base for: SideNavView, SettingsNavView, BreadcrumbView, TabBarView,
 * and any future navigation component.
 * Nav items are intentionally taller than inputs for click-target comfort.
 * Falls back to DuiProvider size when no local `size` prop is given.
 */
export function useNavBase(sizeProp?: DuiSize): NavBaseConfig {
  const { size } = useDui();
  const s = sizeProp ?? size;
  return {
    itemHeight:   `${DUI_HEIGHT.nav[s]}px`,
    fontSize:     DUI_FONT_SIZE[s],
    iconSize:     DUI_ICON_SIZE[s],
    borderRadius: DUI_DEFAULT_RADIUS[s],
    gap:          DUI_GAP[s],
    paddingX:     s === 'sm' ? '8px' : s === 'md' ? '10px' : s === 'lg' ? '12px' : '16px',
  };
}
