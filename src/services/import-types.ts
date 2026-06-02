/** Shared types for all importers (Postman, OpenAPI, HAR, Bruno, etc.) */

export interface ImportResult {
  success: boolean;
  collectionName: string;
  requestCount: number;
  error?: string;
}
