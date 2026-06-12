import type { DuiSize } from './DuiTypes';
import { useDui } from './DuiContext';
import { DUI_EDITOR_FONT_SIZE } from './DuiTokens';

export interface EditorBaseConfig {
  fontSize: number;
}

/** Reserved for future editor-level overrides (e.g. minLines, theme override). */
export interface EditorContainerProps {
  // intentionally empty — add overrides here as the system grows
}

/**
 * Category base for EditorView (Monaco-based editors).
 * Reads the DuiProvider size context so every editor automatically inherits
 * the app-level size without a local prop.  Pass `sizeProp` to override per-instance.
 */
export function useEditorBase(
  sizeProp?: DuiSize,
  _overrides: EditorContainerProps = {},
): EditorBaseConfig {
  const ctx = useDui();
  const s = sizeProp ?? ctx.size;
  return {
    fontSize: DUI_EDITOR_FONT_SIZE[s],
  };
}
