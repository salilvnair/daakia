/**
 * Types for `data.mjs`, which ships as plain ESM with the CLI.
 *
 * The implementation stays JavaScript because `daakia-run.mjs` is executed
 * directly by node in a pipeline, with no build step in front of it — and the
 * extension host reads the same module rather than keeping a second copy of
 * the CSV rules that would drift from it.
 */

/** CSV rows, including the header row, as a spreadsheet writes them. */
export function parseCsv(text: string): string[][];

/** A data file as rows of variables — CSV with a header row, or JSON objects. */
export function parseDataFile(text: string, filename?: string): Record<string, string>[];

/** `key=value`, split on the first `=`. Null when there is no key. */
export function parseEnvVar(pair: string): { key: string; value: string } | null;

/** Whether a `A / B / request` path runs under the named folder. */
export function inFolder(requestPath: string, folder: string): boolean;
