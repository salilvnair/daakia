/**
 * Producing a scheduled export when the host says one is owed — 15E.
 *
 * The host owns the clock and knows nothing about columns; this owns the file
 * and knows nothing about Fridays. When a run comes due the host posts the
 * schedule and the day it is *for*, and this builds exactly what a manual
 * export of the same view would build — the same `sheets`, the same `report` —
 * so a scheduled file and a hand-made one are the same file.
 *
 * **The view is resolved by name, and a missing one is reported rather than
 * substituted.** Silently exporting everything because the saved view was
 * renamed produces a spreadsheet that looks right and is not, which is the
 * failure this whole screen exists to avoid.
 *
 * **`lastRunFor` is only recorded once the file is on disk.** A run that failed
 * to write is owed again on the next tick, rather than being marked done and
 * quietly skipped.
 */
import { useEffect } from 'react';
import { postMsg } from '../../vscode';
import { matchesAll } from './filter-model';
import { exportColumns, filenameForDay, report, workbook } from './export-model';
import type { Schedule } from './GhSchedule';
import type { SavedView } from './views-model';
import type { BoardIssue, ProposedDimension } from './board-types';

export interface RunFailure {
  repo: string;
  view: string;
  forDay: string;
  why: string;
}

/** The rows a saved view would show, or nothing if that view is gone. */
export function rowsFor(
  view: string,
  views: SavedView[],
  all: BoardIssue[],
): BoardIssue[] | undefined {
  const v = views.find(x => x.name === view);
  if (!v) return undefined;
  const terms = v.capture.filters?.terms;
  if (!terms || terms.length === 0) return all;
  return all.filter(i => matchesAll(i, terms));
}

/**
 * Everything one due run has to write.
 *
 * A schedule can produce both an Excel file and a PDF, and they are two
 * messages — the host writes one path per message and a half-written pair is
 * easier to reason about than a half-written archive.
 */
export function jobsFor(
  s: Schedule,
  rows: BoardIssue[],
  forDay: string,
  dimensions: ProposedDimension[],
  query: string,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const format of s.produces) {
    const name = filenameForDay(s.repo, s.view, forDay, format);
    const path = joinPath(s.folder, name);
    const columns = exportColumns(dimensions);
    if (format === 'xlsx') {
      out.push({ type: 'dkgh:export', path, filename: name,
        sheets: workbook(rows, columns, undefined, dimensions) });
    } else {
      out.push({ type: 'dkgh:export', path, filename: name,
        report: report(rows, columns, { repo: s.repo, view: s.view, dimensions, query }) });
    }
  }
  return out;
}

/** Windows or POSIX, whichever the folder already looks like. */
export function joinPath(folder: string, name: string): string {
  const sep = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  const trimmed = folder.replace(/[\\/]+$/, '');
  return `${trimmed}${sep}${name}`;
}

export function useScheduleRunner({ repo, all, views, dimensions, query, onFailed }: {
  repo: string;
  all: BoardIssue[];
  views: SavedView[];
  dimensions: ProposedDimension[];
  query: string;
  onFailed: (f: RunFailure) => void;
}) {
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>;
      if (msg?.type !== 'dkgh:schedule:due') return;
      const s = msg.schedule as Schedule | undefined;
      const forDay = String(msg.forDay ?? '');
      if (!s || s.repo !== repo || !forDay) return;

      /*
        Nothing read yet is not a failed run.

        The tick fires on launch, which is before the first board read has come
        back. Reporting "0 issues" then would produce an empty spreadsheet and
        mark the week done. The run stays owed and the next tick, a minute
        later, finds the rows.
      */
      if (all.length === 0) return;

      const rows = rowsFor(s.view, views, all);
      if (!rows) {
        onFailed({
          repo, view: s.view, forDay,
          why: `The view “${s.view}” is not here any more, so nothing was written.`,
        });
        return;
      }

      for (const job of jobsFor(s, rows, forDay, dimensions, query)) postMsg(job);
      postMsg({ type: 'dkgh:schedule:ran', repo, view: s.view, forDay });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [repo, all, views, dimensions, query, onFailed]);
}
