import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { DuiConfig, DuiSize, DuiRadius, DuiWidth, DuiFontStyle } from './DuiTypes';
import { DUI_RADIUS_MAP, DUI_DEFAULT_RADIUS, DUI_WIDTH_MAP } from './DuiTokens';

const DEFAULT_CONFIG: DuiConfig = { size: 'md' };

const DuiCtx = createContext<DuiConfig>(DEFAULT_CONFIG);

/**
 * Wrap any subtree to give all DUI components a shared set of default props.
 * Every prop is optional and falls back to its system default when omitted.
 *
 * @example
 * <DuiProvider size="sm" borderRadius="lg" activeColor="var(--color-primary)">
 *   <ButtonView>Save</ButtonView>
 * </DuiProvider>
 */
export function DuiProvider({
  size = 'md',
  width,
  borderRadius,
  color,
  defaultColor,
  activeColor,
  fontStyle,
  children,
}: {
  size?: DuiSize;
  width?: DuiWidth;
  borderRadius?: DuiRadius | number;
  color?: string;
  defaultColor?: string;
  activeColor?: string;
  fontStyle?: DuiFontStyle;
  children: ReactNode;
}) {
  const value = useMemo<DuiConfig>(
    () => ({ size, width, borderRadius, color, defaultColor, activeColor, fontStyle }),
    [size, width, borderRadius, color, defaultColor, activeColor, fontStyle]
  );
  return <DuiCtx.Provider value={value}>{children}</DuiCtx.Provider>;
}

/**
 * Returns the current DUI config. Components call this and fall back to the
 * context values when no explicit prop is passed.
 *
 * @example
 * const { size } = useDui();
 * const resolved = sizeProp ?? size;
 */
export function useDui(): DuiConfig {
  return useContext(DuiCtx);
}

/**
 * Resolves the border-radius value from either a DuiConfig override
 * (preset name or raw px number) or the size-derived default.
 */
export function resolveBorderRadius(
  override: DuiRadius | number | undefined,
  sizeFallback: string
): string {
  if (override === undefined) return sizeFallback;
  if (typeof override === 'number') return `${override}px`;
  return DUI_RADIUS_MAP[override];
}

/**
 * Resolves a width preset to a CSS string.
 * Falls back to `'auto'` when no width is set.
 */
export function resolveWidth(width: DuiWidth | undefined): string {
  if (!width) return 'auto';
  return DUI_WIDTH_MAP[width];
}

/**
 * Convenience hook — returns resolved border-radius and width strings
 * plus raw color/style overrides from the current DUI context.
 * Components call this to merge context defaults with their own prop overrides.
 */
export function useDuiStyle(sizeFallback: string): {
  borderRadius: string;
  width: string;
  color: string | undefined;
  defaultColor: string | undefined;
  activeColor: string | undefined;
  fontStyle: DuiFontStyle | undefined;
} {
  const ctx = useDui();
  return useMemo(
    () => ({
      borderRadius: resolveBorderRadius(ctx.borderRadius, sizeFallback),
      width:        resolveWidth(ctx.width),
      color:        ctx.color,
      defaultColor: ctx.defaultColor,
      activeColor:  ctx.activeColor,
      fontStyle:    ctx.fontStyle,
    }),
    [ctx, sizeFallback]
  );
}
