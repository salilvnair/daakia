/** Four canonical sizes that span all DUI component categories. */
export type DuiSize = 'sm' | 'md' | 'lg' | 'xl';

/** Named radius presets — components may also accept a raw number. */
export type DuiRadius = 'none' | 'sm' | 'md' | 'lg' | 'full';

/** Global DUI context shape. */
export interface DuiConfig {
  /** Default size inherited by all DUI components when no local size prop is passed. */
  size: DuiSize;
}
