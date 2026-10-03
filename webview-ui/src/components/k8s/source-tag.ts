/**
 * The tag a result line wears saying where it came from — `live` for the
 * running pod's log, `archive` for a file on a volume, with the file named on
 * hover. One function for every view of result lines: the results page, a
 * Follow and a Window all draw lines a search brought back, and a line from
 * last week's rotated file has to say so in each of them.
 *
 * Nothing when no line came from an archive: then every line is live, and a
 * column saying so on each of them is noise.
 */
import type { LogLine } from '../../store/k8s-store';
import type { ResultLine } from './search-results';
import { ACCENT } from './tone';

export type SourceTag = (line: LogLine) => { label: string; title?: string; tone?: string } | undefined;

export function sourceTagFor(lines: Pick<ResultLine, 'source'>[]): SourceTag | undefined {
  if (!lines.some(l => l.source === 'archive')) return undefined;
  return (l) => {
    const r = l as unknown as ResultLine;
    return r.source === 'archive'
      ? { label: 'archive', title: `Archived file: ${r.rel ?? r.file ?? ''}`, tone: 'var(--color-warning)' }
      : { label: 'live', title: 'The running pod’s log', tone: ACCENT };
  };
}
