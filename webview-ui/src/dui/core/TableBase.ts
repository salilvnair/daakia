import type { DuiSize } from './DuiTypes';
import { useDui } from './DuiContext';
import { DUI_HEIGHT, DUI_FONT_SIZE } from './DuiTokens';

export interface TableBaseConfig {
  rowHeight: string;
  headerFontSize: string;
  cellFontSize: string;
  paddingX: string;
}

/**
 * Category base for: KeyValueTableView, DataTableView, and any future table component.
 * Falls back to DuiProvider size when no local `size` prop is given.
 */
export function useTableBase(sizeProp?: DuiSize): TableBaseConfig {
  const { size } = useDui();
  const s = sizeProp ?? size;
  return {
    rowHeight:      `${DUI_HEIGHT.table[s]}px`,
    headerFontSize: s === 'sm' ? '9px' : s === 'md' ? '9px' : '10px',
    cellFontSize:   DUI_FONT_SIZE[s],
    paddingX:       s === 'sm' ? '8px' : s === 'md' ? '10px' : s === 'lg' ? '12px' : '14px',
  };
}
