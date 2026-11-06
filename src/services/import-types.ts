/** Shared types for all importers (Postman, OpenAPI, HAR, Bruno, etc.) */

export interface ImportResult {
  success: boolean;
  collectionName: string;
  requestCount: number;
  error?: string;
  /** What the file was read as — "Postman v2.1", "Bruno (YAML)". For the import report. */
  format?: string;
  environmentCount?: number;
  /** What did not come across as-is, in plain words. Shown in DevTools, never in the toast. */
  notes?: string[];
}
