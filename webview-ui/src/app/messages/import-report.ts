/**
 * An import's report — see `src/services/import-report.ts` for why it exists.
 *
 * Two places, for two readers. DevTools → Console gets the whole story, one
 * line for the outcome and one per note, for whoever is looking at the import
 * right now. The audit log gets `collection.import` with the outcome and its
 * counts, for whoever asks later what was brought in and what failed.
 */
import { useDevToolsStore } from '../../store/devtools-store';
import { logUiEvent } from '../../store/ui-audit-store';

export interface ImportReport {
  ok: boolean;
  source: string;
  format: string;
  collectionName: string;
  requestCount: number;
  environmentCount: number;
  error: string;
  notes: string[];
}

export function handleImportReport(msg: Partial<ImportReport>): void {
  const r: ImportReport = {
    ok: !!msg.ok,
    source: msg.source ?? '',
    format: msg.format ?? '',
    collectionName: msg.collectionName ?? '',
    requestCount: msg.requestCount ?? 0,
    environmentCount: msg.environmentCount ?? 0,
    error: msg.error ?? '',
    notes: Array.isArray(msg.notes) ? msg.notes.map(String) : [],
  };
  const now = Date.now();
  const requestName = `Import · ${r.source || 'collection'}`;

  const head = r.ok
    ? `Imported "${r.collectionName}" from ${r.source} as ${r.format || 'a collection'}: ${r.requestCount} request(s), ${r.environmentCount} environment(s)`
    : `Import of ${r.source} failed${r.format && r.format !== 'unrecognised' ? ` (read as ${r.format})` : ''}: ${r.error}`;

  useDevToolsStore.getState().addLogs([
    { level: r.ok ? 'info' : 'error', args: [head], timestamp: now, requestName },
    ...r.notes.map(note => ({ level: (r.ok ? 'warn' : 'info') as 'warn' | 'info', args: [note], timestamp: now, requestName })),
  ]);

  logUiEvent('collection.import', {
    ok: r.ok,
    source: r.source,
    format: r.format,
    collection: r.collectionName,
    requests: r.requestCount,
    environments: r.environmentCount,
    ...(r.error ? { error: r.error } : {}),
    ...(r.notes.length ? { notes: r.notes.length } : {}),
  });
}
