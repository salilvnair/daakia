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
import { importBrunoCollection, importBrunoJsonExport, isBrunoJsonExport, findBrunoCollectionRoot } from './bruno-importer';
import type { ImportResult } from './import-types';
import { load as loadYaml } from 'js-yaml';

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

/*
  A YAML file from a Bruno collection.

  Bruno 3 and its VS Code extension save a collection as a folder of .yml
  files — `opencollection.yml` at the root and one file per request. Picking
  either in the Import dialog means "this collection", so the folder is found
  and imported whole. Needs the path: from the text alone there is no folder.
*/
function isOpenCollectionFile(content: string): boolean {
  try {
    const doc = loadYaml(content) as { opencollection?: unknown; info?: { type?: unknown } } | null;
    return !!doc && typeof doc === 'object' && ('opencollection' in doc || ['http', 'graphql', 'folder'].includes(String(doc.info?.type)));
  } catch {
    return false;
  }
}

/** The first keys of a document nobody recognised — enough to see what it was. */
function describeUnknown(content: string): string[] {
  const t = content.trimStart();
  if (!t) return ['The file is empty'];
  try {
    const doc = JSON.parse(t) as unknown;
    if (Array.isArray(doc)) return [`It is a JSON array of ${doc.length} item(s), not a collection object`];
    if (doc && typeof doc === 'object') {
      const keys = Object.keys(doc).slice(0, 12);
      return [`Its top-level keys are: ${keys.join(', ')}${Object.keys(doc).length > keys.length ? ', …' : ''}`];
    }
  } catch (err) {
    if (t.startsWith('{') || t.startsWith('[')) {
      return [`It looks like JSON but does not parse: ${err instanceof Error ? err.message : String(err)}`];
    }
  }
  return ['It is not JSON, and not a YAML format Daakia reads (OpenAPI, Swagger, Bruno)'];
}

const TRIED = 'Daakia, Insomnia, HAR, OpenAPI, Swagger, Thunder Client, HTTPie, Bruno, Postman v2.1';

/**
 * @param filePath where the content came from, when it came from a file —
 *        what lets a Bruno YAML file bring the folder it belongs to.
 */
export function importAnyCollection(content: string, filePath?: string): ImportResult {
  const as = (format: string, r: ImportResult): ImportResult => ({ format, ...r });

  if (isDaakiaExport(content)) {
    const result = importDaakiaCollection(content);
    return {
      success: result.success,
      collectionName: result.collectionName,
      requestCount: result.requestCount,
      error: result.error,
      format: 'Daakia',
    };
  }
  if (isInsomniaExport(content)) return as('Insomnia', importInsomniaCollection(content));
  if (isHarFile(content)) return as('HAR', importHarFile(content));
  if (isOpenAPISpec(content)) return as('OpenAPI', importOpenAPISpec(content));
  if (isThunderClientCollection(content)) return as('Thunder Client', importThunderClientCollection(content));
  if (isHttpieFile(content)) return as('HTTPie', importHttpieCollection(content));
  /* Before Postman: the Postman importer takes anything with a name and a list,
     and Bruno's export has both — it failed there as "not a valid Postman
     Collection v2.1 file", which said nothing about what it actually was. */
  if (isBrunoJsonExport(content)) return importBrunoJsonExport(content);
  if (filePath && isOpenCollectionFile(content)) {
    const root = findBrunoCollectionRoot(filePath);
    if (root) return importBrunoCollection(root);
    return {
      success: false, collectionName: '', requestCount: 0, format: 'Bruno (YAML)',
      error: 'This is one file of a Bruno collection, but no opencollection.yml was found above it',
      notes: [`Looked in ${filePath} and the folders above it. Use Import → Bruno and pick the collection folder.`],
    };
  }

  const result = importPostmanCollection(content);
  if (result.success || !result.error?.startsWith('Not a valid Postman')) return as('Postman v2.1', result);
  /* Postman is the fallback, so its refusal is really "nothing recognised
     this". Say that, and what the file looked like, where it can be read. */
  return {
    ...result,
    format: 'unrecognised',
    error: 'Not a collection format Daakia recognises',
    notes: [`Tried: ${TRIED}`, `Postman's reader said: ${result.error ?? 'no reason given'}`, ...describeUnknown(content)],
  };
}
