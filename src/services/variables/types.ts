/**
 * Variable Resolver Types — interfaces and type definitions.
 */

export interface VariableResolver {
  /** Unique name (without $). E.g. 'guid', 'timestamp', 'randomEmail' */
  name: string;
  /** Human-readable description */
  description: string;
  /** Category for grouping in UI */
  category: VariableCategory;
  /** Example output (shown in autocomplete/docs) */
  example: string;
  /** Resolve the variable — return the resolved string value */
  resolve: () => string;
}

export type VariableCategory =
  | 'identity'
  | 'datetime'
  | 'network'
  | 'text'
  | 'number'
  | 'color'
  | 'person'
  | 'location'
  | 'company'
  | 'custom';
