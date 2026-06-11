import { createContext, useContext, type ReactNode } from 'react';
import type { DuiConfig, DuiSize } from './DuiTypes';

const DEFAULT_CONFIG: DuiConfig = { size: 'md' };

const DuiCtx = createContext<DuiConfig>(DEFAULT_CONFIG);

/** Wrap any subtree to give all DUI components a shared default size. */
export function DuiProvider({
  size = 'md',
  children,
}: {
  size?: DuiSize;
  children: ReactNode;
}) {
  return <DuiCtx.Provider value={{ size }}>{children}</DuiCtx.Provider>;
}

/**
 * Returns the current DUI config. Components call this and fall back to the
 * context size when no explicit `size` prop is passed.
 *
 * @example
 * const { size } = useDui();
 * const resolved = sizeProp ?? size;
 */
export function useDui(): DuiConfig {
  return useContext(DuiCtx);
}
