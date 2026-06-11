import type { DuiSize } from './DuiTypes';
import { useDui } from './DuiContext';
import { DUI_HEIGHT, DUI_ICON_SIZE, DUI_FONT_SIZE, DUI_DEFAULT_RADIUS } from './DuiTokens';

export interface MenuBaseConfig {
  itemHeight: string;
  fontSize: string;
  iconSize: number;
  borderRadius: string;
  paddingX: string;
  /** Gap between icon and label in a menu row */
  gap: string;
}

/**
 * Category base for: StyledDropdown options, ContextMenuView items, submenu rows,
 * SelectInputView options, and any future menu/dropdown component.
 * Menu items are shorter than nav items but taller than chips.
 * Falls back to DuiProvider size when no local `size` prop is given.
 */
export function useMenuBase(sizeProp?: DuiSize): MenuBaseConfig {
  const { size } = useDui();
  const s = sizeProp ?? size;
  return {
    itemHeight:   `${DUI_HEIGHT.menu[s]}px`,
    fontSize:     DUI_FONT_SIZE[s],
    iconSize:     DUI_ICON_SIZE[s],
    borderRadius: DUI_DEFAULT_RADIUS[s],
    paddingX:     s === 'sm' ? '8px' : s === 'md' ? '10px' : s === 'lg' ? '12px' : '14px',
    gap:          s === 'sm' ? '5px' : s === 'md' ? '6px' : s === 'lg' ? '7px' : '8px',
  };
}
