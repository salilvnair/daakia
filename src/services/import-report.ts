/**
 * What an import did, said where it can be read afterwards.
 *
 * A failed import used to leave one toast — "Import failed: Not a valid
 * Postman Collection v2.1 file" — that vanished in seconds and named the one
 * format the file was not. The file was a Bruno export; nothing said so, and
 * there was nowhere to look.
 *
 * Now every import from a file or URL ends in an `importReport` beside its
 * toast. The webview writes it to DevTools → Console (the whole story: the
 * format it was read as, the counts, every note about what did not come
 * across) and to the audit log as `collection.import`.
 *
 * Nothing from inside the file goes in it — no values, no URLs. The notes
 * name requests, files and environments, and stay in the console: the audit
 * log records how many there were, not what they say.
 */
import * as path from 'path';
import type { ImportResult } from './import-types';

type Post = (msg: unknown) => void;

export function postImportReport(post: Post, result: ImportResult, source: string): void {
  post({
    type: 'importReport',
    ok: result.success,
    /* The file's name, not its path — a path carries the user's name and folders. */
    source: /^https?:\/\//i.test(source) ? source.replace(/[?#].*$/, '') : path.basename(source),
    format: result.format ?? '',
    collectionName: result.collectionName,
    requestCount: result.requestCount,
    environmentCount: result.environmentCount ?? 0,
    error: result.error ?? '',
    notes: result.notes ?? [],
  });
}

/** The toast for an import. A failure points at where the rest of the story is. */
export function importToast(result: ImportResult): { toastType: 'success' | 'warning' | 'error'; message: string } {
  if (!result.success) {
    return { toastType: 'error', message: `Import failed: ${result.error} — DevTools → Console has the details.` };
  }
  const envs = result.environmentCount ? `, ${result.environmentCount} environment${result.environmentCount === 1 ? '' : 's'}` : '';
  const base = `Imported "${result.collectionName}" (${result.requestCount} request${result.requestCount === 1 ? '' : 's'}${envs})`;
  return result.notes?.length
    ? { toastType: 'warning', message: `${base} — ${result.notes.length} note${result.notes.length === 1 ? '' : 's'} in DevTools → Console` }
    : { toastType: 'success', message: base };
}
