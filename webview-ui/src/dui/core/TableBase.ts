import type { DuiSize, DuiFontStyle } from './DuiTypes';
import { useDui } from './DuiContext';
import { DUI_HEIGHT, DUI_FONT_SIZE } from './DuiTokens';

export interface TableBaseConfig {
  rowHeight: string;
  headerFontSize: string;
  cellFontSize: string;
  paddingX: string;
  color: string | undefined;
  fontStyle: DuiFontStyle | undefined;
}

/** Local override props that any table component can accept. */
export interface TableContainerProps {
  color?: string;
  fontStyle?: DuiFontStyle;
}

/**
 * Category base for: KeyValueTableView, DataTableView, and any future table component.
 * Falls back to DuiProvider values when no local prop is given.
 */
export function useTableBase(
  sizeProp?: DuiSize,
  overrides: TableContainerProps = {}
): TableBaseConfig {
  const ctx = useDui();
  const s = sizeProp ?? ctx.size;
  const paddingX = s === 'sm' ? '8px' : s === 'md' ? '10px' : s === 'lg' ? '12px' : '14px';
  return {
    rowHeight:      `${DUI_HEIGHT.table[s]}px`,
    headerFontSize: s === 'sm' ? '9px' : s === 'md' ? '9px' : '10px',
    cellFontSize:   DUI_FONT_SIZE[s],
    paddingX,
    color:          overrides.color ?? ctx.color,
    fontStyle:      overrides.fontStyle ?? ctx.fontStyle,
  };
}
