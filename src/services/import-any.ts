/**
 * Work out what a document is, then import it.
 *
 * Every import source — a file, a URL, and whatever comes next — funnels
 * through here, so they all recognise the same set of formats and adding one
 * more is a single edit rather than an edit per source. Before this the
 * extension command sniffed five formats inline and the Daakia format was not
 * among them, so Daakia could not import its own exports.
 *
 * Order matters, and it is most-specific first: a Daakia export and a Postman
 * collection are both JSON with a name and an array in them, so whichever is
 * tested first wins. Postman goes last and unguarded — its importer is the most
 * forgiving, which makes it the right fallback and the wrong first guess.
 */
import { importHarFile, isHarFile } from './har-importer';
import { importOpenAPISpec, isOpenAPISpec } from './openapi-importer';
import { importThunderClientCollection, isThunderClientCollection } from './thunder-importer';
import { importHttpieCollection, isHttpieFile } from './httpie-importer';
import { importPostmanCollection } from './postman-importer';
import { importDaakiaCollection } from './daakia-importer';
import { importInsomniaCollection, isInsomniaExport } from './insomnia-importer';
import type { ImportResult } from './import-types';

/** Daakia's own export — the one format that names itself. */
export function isDaakiaExport(content: string): boolean {
  try {
    const doc = JSON.parse(content) as { collections?: unknown; kind?: string };
    if (doc?.kind === 'daakia-workspace') return true;
    // A collection export has no `kind`, but it does have the node shape:
    // an array of collections each carrying `requests`.
    return Array.isArray(doc?.collections)
      && (doc.collections as { requests?: unknown }[]).every(c => c && typeof c === 'object' && 'requests' in c);
  } catch {
    return false;
  }
}

export function importAnyCollection(content: string): ImportResult {
  if (isDaakiaExport(content)) {
    const result = importDaakiaCollection(content);
    return {
      success: result.success,
      collectionName: result.collectionName,
      requestCount: result.requestCount,
      error: result.error,
    };
  }
  if (isInsomniaExport(content)) return importInsomniaCollection(content);
  if (isHarFile(content)) return importHarFile(content);
  if (isOpenAPISpec(content)) return importOpenAPISpec(content);
  if (isThunderClientCollection(content)) return importThunderClientCollection(content);
  if (isHttpieFile(content)) return importHttpieCollection(content);
  return importPostmanCollection(content);
}
